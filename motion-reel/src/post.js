// Finishing passes: bloom, chromatic split, vignette and film grain.
import { createCanvas } from './gfx.js';
import { rng } from './core.js';
import { W, H } from './config.js';

const mk = (w, h) => {
  const c = createCanvas(w, h);
  return { c, x: c.getContext('2d') };
};

export function createPost() {
  const q1 = mk(W / 4, H / 4);
  const q2 = mk(W / 4, H / 4);
  const q3 = mk(W / 8, H / 8);
  const tmp = mk(W, H);
  const chR = mk(W, H), chG = mk(W, H), chB = mk(W, H);

  // Grain: a handful of noise plates, alternated per frame.
  const grains = [];
  const r = rng(99);
  for (let k = 0; k < 6; k++) {
    const g = mk(W / 2, H / 2);
    const img = g.x.createImageData(W / 2, H / 2);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // Roughly gaussian grey around mid-grey.
      const v = 128 + ((r() + r() + r() - 1.5) / 1.5) * 128;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.x.putImageData(img, 0, 0);
    grains.push(g);
  }

  // Dither plates: 0-3 levels of additive noise that break up 8-bit banding
  // in dark gradients before the encoder sees them.
  const dithers = [];
  for (let k = 0; k < 4; k++) {
    const g = mk(W, H);
    const img = g.x.createImageData(W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.floor(r() * 4);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.x.putImageData(img, 0, 0);
    dithers.push(g);
  }

  // Vignette plate: clear centre, dark corners. Built per pixel with a little
  // dither so the falloff never bands on dark backgrounds.
  const vig = mk(W, H);
  const vimg = vig.x.createImageData(W, H);
  const vd = vimg.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
      const d = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
      let a = Math.min(1, Math.max(0, (d - 0.25) / 0.8));
      a = a * a * (3 - 2 * a);
      const i = (y * W + x) * 4;
      vd[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255 + (r() - 0.5) * 3)));
    }
  }
  vig.x.putImageData(vimg, 0, 0);

  function bloom(ctx, canvas, amount) {
    if (amount <= 0.001) return;
    q1.x.globalCompositeOperation = 'copy';
    q1.x.drawImage(canvas, 0, 0, W / 4, H / 4);
    // Raise the image to the 4th power: a soft threshold that keeps highlights.
    q2.x.globalCompositeOperation = 'copy';
    q2.x.drawImage(q1.c, 0, 0);
    q2.x.globalCompositeOperation = 'multiply';
    q2.x.drawImage(q1.c, 0, 0);
    q1.x.drawImage(q2.c, 0, 0);
    q1.x.globalCompositeOperation = 'multiply';
    q1.x.drawImage(q2.c, 0, 0);
    q1.x.globalCompositeOperation = 'source-over';
    q2.x.globalCompositeOperation = 'copy';
    q2.x.filter = 'blur(5px)';
    q2.x.drawImage(q1.c, 0, 0);
    q2.x.filter = 'none';
    q3.x.globalCompositeOperation = 'copy';
    q3.x.filter = 'blur(6px)';
    q3.x.drawImage(q1.c, 0, 0, W / 8, H / 8);
    q3.x.filter = 'none';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, amount);
    ctx.drawImage(q2.c, 0, 0, W, H);
    ctx.globalAlpha = Math.min(1, amount * 0.9);
    ctx.drawImage(q3.c, 0, 0, W, H);
    ctx.restore();
  }

  // Lateral chromatic aberration: R pushed out, B pulled in, around centre.
  function chromatic(ctx, canvas, px) {
    if (px < 0.4) return;
    const split = (L, col) => {
      L.x.globalCompositeOperation = 'copy';
      L.x.drawImage(canvas, 0, 0);
      L.x.globalCompositeOperation = 'multiply';
      L.x.fillStyle = col;
      L.x.fillRect(0, 0, W, H);
      L.x.globalCompositeOperation = 'source-over';
    };
    split(chR, '#ff0000');
    split(chG, '#00ff00');
    split(chB, '#0000ff');
    const s = px / (W / 2);
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(chG.c, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(chR.c, -W * s / 2, -H * s / 2, W * (1 + s), H * (1 + s));
    ctx.drawImage(chB.c, W * s / 2, H * s / 2, W * (1 - s), H * (1 - s));
    ctx.restore();
  }

  function vignette(ctx, amount) {
    if (amount <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.drawImage(vig.c, 0, 0);
    ctx.restore();
  }

  function grain(ctx, frame, amount) {
    if (amount <= 0.001) return;
    const g = grains[frame % grains.length];
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = amount;
    ctx.drawImage(g.c, 0, 0, W, H);
    ctx.restore();
  }

  function dither(ctx, frame) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(dithers[frame % dithers.length].c, 0, 0);
    ctx.restore();
  }

  return { bloom, chromatic, vignette, grain, dither, tmp };
}
