// 07 — RANGE
// Pull-back reveal: the implosion point is the centre tile of a 3x3 grid of
// live miniatures. Every tile re-renders an earlier scene in real time (no
// pre-baked footage), plus a sound-design and a creative-code tile. Then the
// grid collapses and the camera dives back into the dot.

import { W, H, PAL, b, BEAT } from '../timeline.js';
import { clamp, lerp, prog, E, TAU, mod, hash1, noise3, rgba } from '../core.js';
import { mono, scramble } from '../type.js';
import s1 from './s1_bounce.js';
import s2 from './s2_type.js';
import s3 from './s3_grid.js';
import s4 from './s4_blobs.js';
import s5 from './s5_ui.js';
import s6 from './s6_particles.js';

const TW = 520, TH = 292.5, GUT = 28;
const GX = (W - (3 * TW + 2 * GUT)) / 2, GY = (H - (3 * TH + 2 * GUT)) / 2;
const Z0 = W / TW; // camera scale at which the centre tile fills the frame
export const CENTER_DOT_R = 12; // x Z0 = 44px when the camera lands

const TILES = [
  { c: 0, r: 0, o: 8, kind: 'scene', scene: s1, a: b(0.3), len: b(2.9), ph: 0.5, label: '01  SQUASH & STRETCH', zoom: 1.65, fx: 760, fy: 560 },
  { c: 1, r: 0, o: 1, kind: 'scene', scene: s2, a: b(5.0), len: b(2.6), ph: 0.1, label: '02  KINETIC TYPE' },
  { c: 2, r: 0, o: 2, kind: 'scene', scene: s3, a: b(10.5), len: b(2.6), ph: 0.4, label: '03  SHAPE SYSTEMS' },
  { c: 0, r: 1, o: 7, kind: 'sound', label: '04  SOUND DESIGN' },
  { c: 1, r: 1, o: 0, kind: 'center' },
  { c: 2, r: 1, o: 3, kind: 'scene', scene: s4, a: b(14.8), len: b(2.4), ph: 0.2, label: '05  3D / CGI' },
  { c: 0, r: 2, o: 6, kind: 'scene', scene: s5, a: b(18.9), len: b(2.6), ph: 0.3, label: '06  UI MOTION' },
  { c: 1, r: 2, o: 5, kind: 'code', label: '07  CREATIVE CODE' },
  { c: 2, r: 2, o: 4, kind: 'scene', scene: s6, a: b(22.6), len: b(1.3), ph: 0.0, label: '08  GENERATIVE', zoom: 1.2, fx: 960, fy: 540 },
];

const CODE = `// every frame is a pure function of time
export function ballPose(t) {
  const f = flight(t);
  let s = 1 + 0.4 * smoothstep(250, 4300, speed);
  if (f.contact >= 0) {
    q = amp * Math.cos(u * Math.PI) ** 2;
  }
  return { x, y, ang, s, q };
}
const E = { snap: bezier(0.76, 0, 0.14, 1) };
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * h * k / 6.0;
}
for (let k = 0; k < n; k++) {
  const tk = t + ((k + 0.5) / n - 0.5) * shutter;
  drawSceneAt(sub, tk);
  acc.globalAlpha = 1 / (k + 1);
}
curl2(x / 360, y / 360, tt * 0.45, c);
vx += (fx - vx) * relax;  // 128 BPM
kick = sine(150 -> 45 Hz) * env(0.32)`.split('\n');

const KW = /\b(export|function|const|let|return|if|for|float|max|min|abs)\b/g;

function camera(t) {
  const out = prog(t, b(25), b(26.15), E.out);
  let z = Math.exp(lerp(Math.log(Z0), Math.log(0.97), out));
  z *= 1 - 0.035 * prog(t, b(26.1), b(27.1), E.inOutSine);
  const dive = prog(t, b(27.15), b(27.8), E.inOutCubic);
  z = Math.exp(lerp(Math.log(z), Math.log(Z0), dive));
  return z;
}

function tileTransform(t, tile) {
  if (tile.kind === 'center') return { s: 1, dx: 0, dy: 0, a: 1 };
  const t0 = b(25.125) + (tile.o - 1) * b(0.125); // pops on 32nd notes
  const pin = prog(t, t0, t0 + 0.4, E.outBack);
  const t1 = b(26.95) + (8 - tile.o) * 0.032;
  const pout = prog(t, t1, t1 + 0.3, E.inBack);
  const [x, y] = [GX + tile.c * (TW + GUT) + TW / 2, GY + tile.r * (TH + GUT) + TH / 2];
  return {
    s: (0.86 + 0.14 * pin) * (1 - pout),
    dx: (W / 2 - x) * 0.35 * pout,
    dy: (H / 2 - y) * 0.35 * pout,
    a: clamp(pin * 2.5) * (1 - prog(pout, 0.7, 1)),
    t0,
  };
}

function soundTile(ctx, t, x, y, w, h) {
  ctx.fillStyle = '#151413';
  ctx.fillRect(x, y, w, h);
  const n = 64, bw = w / n, mid = y + h * 0.48;
  for (let j = 0; j < n; j++) {
    const tj = t + (j / n - 0.66) * 1.6;
    const ph = mod(tj, BEAT);
    const kick = Math.exp(-ph / 0.07);
    const hat = 0.35 * Math.exp(-mod(tj + BEAT / 2, BEAT) / 0.03);
    const a = clamp(0.12 + 0.75 * kick + hat * 0.6 + 0.12 * noise3(tj * 9, 2.2, 0.5));
    const hh = a * h * 0.36;
    ctx.fillStyle = j / n < 0.66 ? PAL.paper : rgba(PAL.paper, 0.3);
    ctx.fillRect(x + j * bw + 1, mid - hh, bw - 2, hh * 2);
  }
  ctx.fillStyle = PAL.orange;
  ctx.fillRect(x + w * 0.66 - 1, y + 18, 3, h - 60);
  ctx.font = mono(12, 500);
  ctx.letterSpacing = '1.5px';
  ctx.fillStyle = rgba(PAL.paper, 0.55);
  ctx.textAlign = 'right';
  ctx.fillText('128 BPM · 48 kHz', x + w - 16, y + 28);
  ctx.textAlign = 'left';
}

function codeTile(ctx, t, x, y, w, h) {
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(x, y, w, h);
  ctx.font = mono(13, 500);
  ctx.letterSpacing = '0px';
  const lh = 20;
  const scroll = (t - b(25)) * 70;
  const first = Math.floor(scroll / lh);
  for (let k = -1; k < h / lh + 1; k++) {
    const li = mod(first + k, CODE.length);
    const line = CODE[li];
    const ly = y + 24 + k * lh - mod(scroll, lh);
    ctx.fillStyle = rgba(PAL.paper, 0.28);
    ctx.fillText(String(li + 1).padStart(2, ' '), x + 14, ly);
    // tiny syntax highlighter
    let cx = x + 48;
    const parts = line.split(/(\/\/.*$|\b\d+\.?\d*\b|\b(?:export|function|const|let|return|if|for|float|max|min|abs)\b)/);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('//')) ctx.fillStyle = rgba(PAL.paper, 0.38);
      else if (/^\d/.test(part)) ctx.fillStyle = PAL.lime;
      else if (KW.test(part)) ctx.fillStyle = PAL.orange;
      else ctx.fillStyle = PAL.paper;
      KW.lastIndex = 0;
      ctx.fillText(part, cx, ly);
      cx += ctx.measureText(part).width;
    }
  }
  // caret
  if (Math.floor(t * 3) % 2 === 0) {
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(x + 48, y + h - 40, 9, 16);
  }
}

function centerTile(ctx, t, x, y, w, h) {
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const ph = mod(t, BEAT);
  const beatK = Math.exp(-ph / 0.09) * (1 - prog(t, b(27.3), b(27.6)));
  // anticipation squash before the final slam
  const ant = prog(t, b(27.55), b(27.98), E.inOutCubic);
  const q = 0.28 * ant;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2 + CENTER_DOT_R * q);
  ctx.scale((1 + 0.12 * beatK) / (1 - q), (1 + 0.12 * beatK) * (1 - q));
  ctx.fillStyle = PAL.orange;
  ctx.beginPath();
  ctx.arc(0, 0, CENTER_DOT_R, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function chip(ctx, t, tile, x, y, h) {
  const p = prog(t, tile.t0 + 0.12, tile.t0 + 0.42);
  if (p <= 0) return;
  const text = scramble(tile.label, p, tile.o * 13, t);
  ctx.font = mono(12, 600);
  ctx.letterSpacing = '2px';
  const tw = ctx.measureText(tile.label).width;
  ctx.fillStyle = 'rgba(14,13,12,0.82)';
  ctx.beginPath();
  ctx.roundRect(x + 14, y + h - 44, tw + 26, 30, 15);
  ctx.fill();
  ctx.fillStyle = PAL.paper;
  ctx.fillText(text, x + 27, y + h - 24);
}

export default {
  render(ctx, t, env) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(-200, -200, W + 400, H + 400);
    const z = camera(t);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);
    for (const tile of TILES) {
      const x = GX + tile.c * (TW + GUT), y = GY + tile.r * (TH + GUT);
      const tr = tileTransform(t, tile);
      tile.t0 = tr.t0;
      if (tr.s <= 0.002 || tr.a <= 0.002) continue;
      // cull tiles that are off screen
      const sx0 = W / 2 + (x + tr.dx - W / 2) * z, sx1 = W / 2 + (x + TW + tr.dx - W / 2) * z;
      const sy0 = H / 2 + (y + tr.dy - H / 2) * z, sy1 = H / 2 + (y + TH + tr.dy - H / 2) * z;
      if (sx1 < -10 || sx0 > W + 10 || sy1 < -10 || sy0 > H + 10) continue;
      ctx.save();
      ctx.globalAlpha *= tr.a;
      ctx.translate(x + TW / 2 + tr.dx, y + TH / 2 + tr.dy);
      ctx.scale(tr.s, tr.s);
      ctx.translate(-(x + TW / 2), -(y + TH / 2));
      ctx.beginPath();
      ctx.roundRect(x, y, TW, TH, tile.kind === 'center' ? 14 * (1 - prog(t, b(27.4), b(27.8))) : 14);
      ctx.clip();
      if (tile.kind === 'scene') {
        ctx.fillStyle = PAL.ink;
        ctx.fillRect(x, y, TW, TH);
        const tl = tile.a + mod(t - b(25) + tile.ph * tile.len, tile.len);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(TW / W, TH / H);
        if (tile.zoom) {
          ctx.translate(W / 2, H / 2);
          ctx.scale(tile.zoom, tile.zoom);
          ctx.translate(-tile.fx, -tile.fy);
        }
        const k = z * tr.s * env.SCALE;
        const px = { w: Math.min(env.px.w, Math.max(16, Math.round(TW * k))), h: Math.min(env.px.h, Math.max(9, Math.round(TH * k))) };
        tile.scene.render(ctx, tl, { ...env, px, mini: true });
        ctx.restore();
      } else if (tile.kind === 'sound') soundTile(ctx, t, x, y, TW, TH);
      else if (tile.kind === 'code') codeTile(ctx, t, x, y, TW, TH);
      else centerTile(ctx, t, x, y, TW, TH);
      if (tile.label) chip(ctx, t, tile, x, y, TH);
      ctx.restore();
    }
    ctx.restore();

    // flash out of the implosion
    const fp = prog(t, b(25), b(25) + 0.45, E.out);
    if (fp < 1) {
      const f = 1 - fp;
      const R = 220 + 1500 * fp;
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R);
      g.addColorStop(0, `rgba(255,248,240,${0.95 * f})`);
      g.addColorStop(0.18, `rgba(255,190,150,${0.6 * f})`);
      g.addColorStop(0.55, `rgba(255,90,31,${0.22 * f})`);
      g.addColorStop(1, 'rgba(255,90,31,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  },
};
