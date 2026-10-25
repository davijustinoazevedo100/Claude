// Broadcast-style overlay: crop marks, slate text, timecode and chapter bar.
// Ink flips between dark and light per corner from what is underneath it.
import { clamp, prog, ease, hash1, rgba } from './core.js';
import { W, H, FPS, FRAMES, SCENES, PAL, font, FONT, DURATION } from './config.js';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';

// Decode-style reveal: settled characters, then a few noisy ones.
export function scramble(str, p, seed = 0, noisy = 3) {
  const n = str.length;
  const settled = Math.floor(clamp(p) * n);
  let out = str.slice(0, settled);
  const tail = Math.min(n - settled, p > 0 ? noisy : 0);
  for (let i = 0; i < tail; i++) {
    const ch = str[settled + i];
    out += ch === ' ' ? ' ' : GLYPHS[Math.floor(hash1(seed * 977 + settled * 31 + i) * GLYPHS.length)];
  }
  return out;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
export function timecode(frame) {
  const f = frame % FPS;
  const s = Math.floor(frame / FPS);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`;
}

export function createHud() {
  const M = 36; // crop mark inset
  const TX = 68; // text inset
  const regions = {
    tl: [TX, 30, 300, 30],
    tr: [W - TX - 300, 30, 300, 30],
    bl: [TX, H - 60, 300, 30],
    br: [W - TX - 300, H - 60, 300, 30],
    bc: [W / 2 - 160, H - 60, 320, 30],
  };

  function inkFor(ctx, key) {
    const [x, y, w, h] = regions[key];
    const d = ctx.getImageData(x, y, w, h).data;
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      n++;
    }
    return s / n / 255 > 0.55 ? PAL.ink : PAL.paper;
  }

  function draw(ctx, t, frame) {
    const inP = prog(t, 0.05, 0.9);
    const outA = 1 - prog(t, 46.6, 47.6);
    if (inP <= 0 || outA <= 0) return;
    const alpha = 0.78 * outA;
    const ink = {};
    for (const k of Object.keys(regions)) ink[k] = inkFor(ctx, k);

    ctx.save();
    // Crop marks grow out of each corner.
    const arm = 22 * ease.outExpo(prog(t, 0.05, 0.6));
    const marks = [
      [M, M, 1, 1, 'tl'],
      [W - M, M, -1, 1, 'tr'],
      [M, H - M, 1, -1, 'bl'],
      [W - M, H - M, -1, -1, 'br'],
    ];
    for (const [x, y, sx, sy, k] of marks) {
      ctx.strokeStyle = rgba(ink[k], alpha);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + sx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * arm);
      ctx.stroke();
    }

    ctx.font = font(500, 13, FONT.mono);
    ctx.letterSpacing = '2.5px';
    ctx.textBaseline = 'alphabetic';
    const tp = (d) => ease.outCubic(prog(t, 0.2 + d, 0.9 + d));
    const write = (k, str, x, y, align, d, seed) => {
      ctx.textAlign = align;
      ctx.fillStyle = rgba(ink[k], alpha);
      ctx.fillText(scramble(str, tp(d), seed + frame), x, y);
    };
    write('tl', 'CLAUDE — MOTION REEL', TX, 52, 'left', 0, 1);
    write('tr', `${W}×${H} — ${FPS} FPS`, W - TX, 52, 'right', 0.1, 2);
    write('bl', `TC ${timecode(frame)}`, TX, H - 40, 'left', 0.2, 3);
    write('br', `FRAME ${pad(frame, 4)} / ${FRAMES}`, W - TX, H - 40, 'right', 0.3, 4);

    // Chapter bar: one dash per scene, the live one fills with time.
    const n = SCENES.length;
    const dw = 26, gap = 8;
    const total = n * dw + (n - 1) * gap;
    const x0 = W / 2 - total / 2;
    const y = H - 45;
    const showP = ease.outExpo(prog(t, 0.4, 1.2));
    for (let i = 0; i < n; i++) {
      const s = SCENES[i];
      const x = x0 + i * (dw + gap);
      const w = dw * showP;
      ctx.fillStyle = rgba(ink.bc, alpha * 0.28);
      ctx.fillRect(x, y, w, 2);
      const p = clamp((t - s.start) / (s.end - s.start));
      if (p > 0) {
        ctx.fillStyle = rgba(ink.bc, alpha);
        ctx.fillRect(x, y, w * p, 2);
      }
    }
    ctx.restore();
  }

  return { draw };
}

export { DURATION };
