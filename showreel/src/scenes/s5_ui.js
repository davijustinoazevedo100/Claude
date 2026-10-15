// 05 — UI MOTION
// A motion-tool dashboard that assembles itself around the knob the 3D sphere
// became: easing editor with springy bezier handles, a timeline whose playhead
// tracks this very reel, toggle + slider driven by a choreographed cursor,
// counters, palette swatches, a preview player and a toast.

import { W, H, PAL, b, BEAT, DUR } from '../timeline.js';
import { clamp, lerp, prog, E, TAU, rgba, spring, bezier, mixRgba, qt } from '../core.js';
import { ui, mono, setAny, anyWidth } from '../type.js';

const DIGIT_W = () => Math.max(...'0123456789'.split('').map((d) => anyWidth(d, 800, 104, 92)));
import { KNOB } from './s4_blobs.js';

const GREY = '#8F897F';
const RULE = '#ECE7DF';
const TRACK_OFF = '#E2DDD4';

const CARD = {
  ctrl: { x: 802, y: 210, w: 416, h: 210, d: 0.0 },
  palette: { x: 1250, y: 210, w: 420, h: 260, d: 0.06 },
  frames: { x: 802, y: 452, w: 416, h: 418, d: 0.1 },
  ease: { x: 250, y: 210, w: 520, h: 350, d: 0.14 },
  preview: { x: 1250, y: 502, w: 420, h: 368, d: 0.18 },
  time: { x: 250, y: 592, w: 520, h: 278, d: 0.22 },
};

// ------------------------------------------------------------- cursor choreography

const CUR = [
  { t: b(18.55), x: 1560, y: 1010 },
  { t: b(18.95), x: 1150, y: 276 },
  { t: b(19.5), x: 1150, y: 276 },
  { t: b(19.75), x: 924, y: 392 },
  { t: b(20.3), x: 1182, y: 392 },
  { t: b(20.55), x: 1182, y: 392 },
  { t: b(20.95), x: 1462, y: 650 },
  { t: b(21.4), x: 1462, y: 650 },
  { t: b(22), x: 1720, y: 1000 },
];
const CLICKS = [b(19.0), b(19.78), b(21.0)];

function cursorAt(t) {
  if (t <= CUR[0].t) return { ...CUR[0] };
  for (let i = 0; i < CUR.length - 1; i++) {
    const a = CUR[i], c = CUR[i + 1];
    if (t <= c.t) {
      const ease = i === 3 ? E.inOutCubic : E.snap;
      const p = ease(clamp((t - a.t) / (c.t - a.t)));
      return { x: lerp(a.x, c.x, p), y: lerp(a.y, c.y, p) };
    }
  }
  return { ...CUR[CUR.length - 1] };
}

function drawCursor(ctx, t) {
  const a = prog(t, b(18.5), b(18.7)) * (1 - prog(t, b(21.7), b(21.95)));
  if (a <= 0) return;
  const p = cursorAt(t);
  let s = 1.3;
  for (const c of CLICKS) {
    const u = t - c;
    if (u > -0.08 && u < 0.2) s *= 1 - 0.16 * Math.exp(-Math.pow(u / 0.06, 2));
  }
  for (const c of CLICKS) {
    const u = t - c;
    if (u >= 0 && u < 0.45) {
      const k = E.out(u / 0.45);
      ctx.strokeStyle = rgba(PAL.orange, 0.7 * (1 - k));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8 + 40 * k, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,40,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 25);
  ctx.lineTo(6, 19.5);
  ctx.lineTo(10.5, 29);
  ctx.lineTo(14.5, 27.2);
  ctx.lineTo(10.2, 18);
  ctx.lineTo(17.5, 18);
  ctx.closePath();
  ctx.fillStyle = PAL.white;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = PAL.ink;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------- primitives

function card(ctx, c, t, from) {
  // Leaves the card transform applied: callers must ctx.restore() when done.
  const e = from ? prog(t, b(18.0), b(18.0) + 0.5) : prog(t, b(18.12) + c.d, b(18.12) + c.d + 0.55, E.out);
  if (e <= 0) return 0;
  ctx.save();
  if (from) {
    const g = E.outBack(e, 1.2);
    ctx.translate(from.x, from.y);
    ctx.scale(g, g);
    ctx.translate(-from.x, -from.y);
  } else {
    ctx.globalAlpha *= clamp(e * 1.6);
    const s = 0.94 + 0.06 * e;
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2 + 70 * (1 - e));
    ctx.scale(s, s);
    ctx.translate(-(c.x + c.w / 2), -(c.y + c.h / 2));
  }
  ctx.shadowColor = 'rgba(6, 14, 80, 0.32)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 26;
  ctx.fillStyle = PAL.white;
  ctx.beginPath();
  ctx.roundRect(c.x, c.y, c.w, c.h, 26);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  return e;
}

function title(ctx, c, text, right) {
  ctx.fillStyle = PAL.ink;
  ctx.font = ui(21, 600);
  ctx.letterSpacing = '-0.2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, c.x + 32, c.y + 50);
  if (right) {
    ctx.font = mono(14, 500);
    ctx.letterSpacing = '0.5px';
    ctx.fillStyle = GREY;
    ctx.textAlign = 'right';
    ctx.fillText(right, c.x + c.w - 32, c.y + 50);
    ctx.textAlign = 'left';
  }
}

// ------------------------------------------------------------- cards

function easeCard(ctx, t) {
  const c = CARD.ease;
  if (!card(ctx, c, t)) return;
  const k = clamp(spring(t - b(18.75), 1.6, 0.42), 0, 1.25);
  const x1 = lerp(0.3, 0.76, k), y1 = lerp(0.3, 0, k), x2 = lerp(0.7, 0.14, k), y2 = lerp(0.7, 1, k);
  const kq = clamp(spring(qt(t) - b(18.75), 1.6, 0.42), 0, 1.25);
  const f = (v) => v.toFixed(2).replace(/^0\./, '.').replace(/^-0\./, '-.').replace(/\.?0+$/, '') || '0';
  title(ctx, c, 'Easing', `cubic-bezier(${f(lerp(0.3, 0.76, kq))}, ${f(lerp(0.3, 0, kq))}, ${f(lerp(0.7, 0.14, kq))}, ${f(lerp(0.7, 1, kq))})`);
  const bx = c.x + 32, by = c.y + 84, bw = c.w - 64, bh = c.h - 116;
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(bx, by + (i * bh) / 4);
    ctx.lineTo(bx + bw, by + (i * bh) / 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + (i * bw) / 4, by);
    ctx.lineTo(bx + (i * bw) / 4, by + bh);
    ctx.stroke();
  }
  const P = (u, v) => [bx + u * bw, by + (1 - v) * bh];
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = '#CFC9BF';
  ctx.beginPath();
  ctx.moveTo(...P(0, 0));
  ctx.lineTo(...P(1, 1));
  ctx.stroke();
  ctx.setLineDash([]);
  const draw = prog(t, b(18.45), b(18.95), E.out);
  // curve
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const n = Math.max(2, Math.floor(80 * draw));
  for (let i = 0; i <= n; i++) {
    const s = (i / 80);
    const mt = 1 - s;
    const u = 3 * mt * mt * s * x1 + 3 * mt * s * s * x2 + s * s * s;
    const v = 3 * mt * mt * s * y1 + 3 * mt * s * s * y2 + s * s * s;
    const [px, py] = P(u, v);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // handles
  const hs = prog(t, b(18.6), b(18.85), E.outBack);
  ctx.strokeStyle = PAL.orange;
  ctx.lineWidth = 2;
  for (const [ax, ay, hx, hy] of [[0, 0, x1, y1], [1, 1, x2, y2]]) {
    const [a1, a2] = P(ax, ay), [h1, h2] = P(lerp(ax, hx, hs), lerp(ay, hy, hs));
    ctx.beginPath();
    ctx.moveTo(a1, a2);
    ctx.lineTo(h1, h2);
    ctx.stroke();
    ctx.fillStyle = PAL.white;
    ctx.beginPath();
    ctx.arc(h1, h2, 8 * hs, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // travelling sample dot, one trip per beat
  if (t > b(19)) {
    const ph = ((t - b(19)) / BEAT) % 1;
    const curve = bezier(x1, y1, x2, y2);
    const [dx, dy] = P(ph, curve(ph));
    ctx.fillStyle = PAL.orange;
    ctx.beginPath();
    ctx.arc(dx, dy, 9, 0, TAU);
    ctx.fill();
    // value meter on the right edge
    ctx.fillStyle = RULE;
    ctx.fillRect(bx + bw + 14, by, 6, bh);
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(bx + bw + 14, dy, 6, by + bh - dy);
  }
  ctx.restore();
}

const LAYERS = [
  { name: 'dot.y', col: PAL.orange, a: 0.0, b: 0.34, keys: [0.0, 0.12, 0.2, 0.25, 0.34] },
  { name: 'type.wdth', col: PAL.blue, a: 0.12, b: 0.62, keys: [0.12, 0.2, 0.33, 0.48, 0.62] },
  { name: 'tile.rotate', col: PAL.lime, a: 0.3, b: 0.78, keys: [0.3, 0.42, 0.55, 0.78] },
  { name: 'blob.merge', col: PAL.pink, a: 0.45, b: 0.98, keys: [0.45, 0.6, 0.83, 0.98] },
];

function timeCard(ctx, t) {
  const c = CARD.time;
  if (!card(ctx, c, t)) return;
  const fr = Math.round(t * 60);
  title(ctx, c, 'Timeline', `00:00:${String(Math.floor(fr / 60)).padStart(2, '0')}:${String(fr % 60).padStart(2, '0')}`);
  const tx = c.x + 172, tw = c.w - 204;
  // ruler
  ctx.fillStyle = GREY;
  ctx.font = mono(11, 500);
  for (let s = 0; s <= 15; s += 3) {
    const x = tx + (s / DUR) * tw;
    ctx.fillRect(x, c.y + 78, 1, 8);
    ctx.fillText(String(s), x + 4, c.y + 86);
  }
  LAYERS.forEach((L, i) => {
    const y = c.y + 112 + i * 40;
    const g = prog(t, b(18.55) + i * 0.05, b(18.55) + i * 0.05 + 0.45, E.out);
    ctx.fillStyle = PAL.ink;
    ctx.font = mono(13, 500);
    ctx.globalAlpha *= 1;
    ctx.fillText(L.name, c.x + 32, y + 13);
    ctx.fillStyle = '#F4F1EC';
    ctx.beginPath();
    ctx.roundRect(tx, y - 2, tw, 22, 6);
    ctx.fill();
    const x0 = tx + L.a * tw, w = (L.b - L.a) * tw * g;
    ctx.fillStyle = L.col;
    ctx.beginPath();
    ctx.roundRect(x0, y, Math.max(w, 1), 18, 5);
    ctx.fill();
    ctx.fillStyle = L.col === PAL.blue ? PAL.white : PAL.ink;
    for (const kx of L.keys) {
      if (kx > L.a + (L.b - L.a) * g + 1e-6) continue;
      ctx.save();
      ctx.translate(tx + kx * tw, y + 9);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
  });
  // playhead tracks the reel itself
  const ph = tx + (t / DUR) * tw;
  ctx.fillStyle = PAL.orange;
  ctx.fillRect(ph - 1, c.y + 92, 2, 168);
  ctx.beginPath();
  ctx.moveTo(ph - 7, c.y + 88);
  ctx.lineTo(ph + 7, c.y + 88);
  ctx.lineTo(ph, c.y + 98);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function ctrlCard(ctx, t) {
  const c = CARD.ctrl;
  if (card(ctx, c, t, KNOB)) {
    ctrlContent(ctx, c, t);
    ctx.restore();
  }
  toggle(ctx, t);
}

function ctrlContent(ctx, c, t) {
  const a = prog(t, b(18.25), b(18.6));
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = PAL.ink;
  ctx.font = ui(21, 600);
  ctx.textAlign = 'left';
  ctx.fillText('Motion blur', c.x + 32, c.y + 63);
  ctx.font = ui(15, 500);
  ctx.fillStyle = GREY;
  ctx.fillText('180° shutter · 8 samples', c.x + 32, c.y + 88);
  // frame-rate slider
  ctx.fillStyle = PAL.ink;
  ctx.font = ui(18, 600);
  ctx.fillText('Frame rate', c.x + 32, c.y + 150);
  const v = lerp(0.25, 1, prog(t, b(19.75), b(20.3), E.inOutCubic));
  const fps = Math.round(lerp(12, 60, lerp(0.25, 1, prog(qt(t), b(19.75), b(20.3), E.inOutCubic))));
  ctx.font = mono(16, 600);
  ctx.textAlign = 'right';
  ctx.fillText(`${fps} fps`, c.x + c.w - 32, c.y + 150);
  ctx.textAlign = 'left';
  const sx0 = c.x + 36, sw = c.w - 72, sy = c.y + 182;
  ctx.fillStyle = TRACK_OFF;
  ctx.beginPath();
  ctx.roundRect(sx0, sy - 3, sw, 6, 3);
  ctx.fill();
  ctx.fillStyle = PAL.orange;
  ctx.beginPath();
  ctx.roundRect(sx0, sy - 3, sw * v, 6, 3);
  ctx.fill();
  ctx.shadowColor = 'rgba(0,0,40,0.25)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = PAL.white;
  ctx.beginPath();
  ctx.arc(sx0 + sw * v, sy, 13, 0, TAU);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#D7D1C7';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function toggle(ctx, t) {
  // track grows around the knob, then the click flips it
  const grow = E.outBack(prog(t, b(18.0), b(18.0) + 0.38));
  const on = prog(t, b(19.0), b(19.0) + 0.3, E.snap);
  const tw = lerp(52, 92, grow);
  const tx = KNOB.x - 26, ty = KNOB.y - 26;
  ctx.fillStyle = mixRgba(TRACK_OFF, PAL.ink, on);
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, 52, 26);
  ctx.fill();
  const kx = lerp(KNOB.x, KNOB.x + 40, on);
  const st = 1 + 0.42 * Math.sin(Math.PI * on);
  ctx.save();
  ctx.translate(kx, KNOB.y);
  ctx.scale(st, 1 / st);
  ctx.fillStyle = PAL.orange;
  ctx.beginPath();
  ctx.arc(0, 0, KNOB.r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const BARS = [0.42, 0.6, 0.35, 0.82, 0.55, 0.7, 0.4, 0.95, 0.5, 0.66, 0.38, 0.78, 0.47, 0.62, 0.3, 0.88];

function framesCard(ctx, t) {
  const c = CARD.frames;
  if (!card(ctx, c, t)) return;
  title(ctx, c, 'Rendered frames', 'H.264 · 1080p');
  const n = Math.round(900 * prog(qt(t), b(18.5), b(21.4), E.inOutSine));
  const txt = String(n).padStart(3, '0');
  ctx.fillStyle = PAL.ink;
  const dw = DIGIT_W();
  for (let i = 0; i < 3; i++) {
    const ch = txt[i];
    const sx = setAny(ctx, ch, 800, 104, 92);
    const aw = anyWidth(ch, 800, 104, 92);
    ctx.save();
    ctx.translate(c.x + 28 + i * dw + (dw - aw) / 2, c.y + 176);
    ctx.scale(sx, 1);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
  const w = dw * 3;
  ctx.font = ui(22, 600);
  ctx.fillStyle = GREY;
  ctx.fillText('/ 900', c.x + 40 + w, c.y + 176);
  // progress
  ctx.fillStyle = '#F1EDE6';
  ctx.beginPath();
  ctx.roundRect(c.x + 32, c.y + 204, c.w - 64, 10, 5);
  ctx.fill();
  ctx.fillStyle = PAL.orange;
  ctx.beginPath();
  ctx.roundRect(c.x + 32, c.y + 204, (c.w - 64) * (n / 900), 10, 5);
  ctx.fill();
  // beat-reactive bars
  const base = c.y + c.h - 36, bw = (c.w - 64) / BARS.length;
  const beatPh = (t / BEAT) % 1;
  const kick = Math.exp(-beatPh * 6);
  BARS.forEach((v, i) => {
    const g = clamp(spring(t - b(18.75) - i * 0.022, 2.2, 0.4), 0, 1.3);
    const wob = 0.18 * kick * Math.sin(i * 1.7 + 1) + 0.06 * Math.sin(t * 9 + i);
    const h = Math.max(4, (v + wob) * 120 * g);
    ctx.fillStyle = i === 7 ? PAL.orange : PAL.ink;
    ctx.beginPath();
    ctx.roundRect(c.x + 32 + i * bw + 3, base - h, bw - 6, h, 4);
    ctx.fill();
  });
  ctx.font = mono(12, 500);
  ctx.fillStyle = GREY;
  ctx.fillText('AUDIO · 128 BPM', c.x + 32, base + 24);
  ctx.restore();
}

const SW = [
  [PAL.orange, 'FF5A1F'], [PAL.blue, '2D4BFF'], [PAL.ink, '0E0D0C'],
  [PAL.paper, 'F3EEE6'], [PAL.lime, 'D4F24A'], [PAL.pink, 'FFA9D0'],
];
function paletteCard(ctx, t) {
  const c = CARD.palette;
  if (!card(ctx, c, t)) return;
  title(ctx, c, 'Palette', '6 swatches');
  SW.forEach(([col, hx], i) => {
    const g = E.outBack(prog(t, b(18.55) + i * 0.045, b(18.55) + i * 0.045 + 0.35), 2.2);
    const x = c.x + 62 + i * 60, y = c.y + 128;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(g, g);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, TAU);
    ctx.fill();
    if (col === PAL.paper) {
      ctx.strokeStyle = '#DDD6CB';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= prog(t, b(18.75) + i * 0.045, b(18.95) + i * 0.045);
    ctx.font = mono(10, 500);
    ctx.fillStyle = GREY;
    ctx.textAlign = 'center';
    ctx.fillText(hx, x, y + 46);
    ctx.restore();
  });
  // gradient ribbon that sweeps on
  const gp = prog(t, b(19.2), b(19.8), E.snap);
  const gx = c.x + 32, gw = (c.w - 64) * gp, gy = c.y + 196;
  if (gw > 1) {
    const g = ctx.createLinearGradient(gx, 0, gx + c.w - 64, 0);
    g.addColorStop(0, PAL.orange);
    g.addColorStop(0.35, PAL.pink);
    g.addColorStop(0.7, PAL.blue);
    g.addColorStop(1, PAL.ink);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, 30, 15);
    ctx.fill();
  }
  ctx.restore();
}

function previewCard(ctx, t) {
  const c = CARD.preview;
  if (!card(ctx, c, t)) return;
  const sx = c.x + 24, sy = c.y + 24, sw = c.w - 48, sh = 214;
  ctx.fillStyle = PAL.ink;
  ctx.beginPath();
  ctx.roundRect(sx, sy, sw, sh, 16);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(sx, sy, sw, sh, 16);
  ctx.clip();
  // the reel's first idea, playing in a tiny window
  const playing = t >= b(21.0);
  const gy = sy + sh - 44;
  ctx.fillStyle = rgba(PAL.paper, 0.25);
  ctx.fillRect(sx + 40, gy, sw - 80, 1.5);
  const ph = playing ? ((t - b(21)) / (BEAT / 2)) % 1 : 0.5;
  const h = 4 * ph * (1 - ph);
  const sq = playing ? 0.35 * Math.exp(-Math.pow(Math.min(ph, 1 - ph) / 0.06, 2)) : 0;
  const by = gy - 16 - 96 * h + 16 * sq;
  ctx.translate(sx + sw / 2, by);
  ctx.scale(1 / (1 - sq), 1 - sq);
  ctx.fillStyle = PAL.orange;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, TAU);
  ctx.fill();
  ctx.restore();
  // play button
  const pb = 1 - prog(t, b(21.0), b(21.0) + 0.22, E.inBack);
  if (pb > 0) {
    ctx.save();
    ctx.translate(sx + sw / 2 + 2, sy + sh / 2 - 10);
    ctx.scale(pb, pb);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, TAU);
    ctx.fill();
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(14, 0);
    ctx.lineTo(-8, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = PAL.ink;
  ctx.font = ui(18, 600);
  ctx.fillText('claude_reel_2026.mp4', sx, sy + sh + 46);
  ctx.font = mono(13, 500);
  ctx.fillStyle = GREY;
  ctx.textAlign = 'right';
  ctx.fillText(`0:${String(Math.floor(qt(t))).padStart(2, '0')} / 0:15`, sx + sw, sy + sh + 46);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#F1EDE6';
  ctx.beginPath();
  ctx.roundRect(sx, sy + sh + 70, sw, 6, 3);
  ctx.fill();
  ctx.fillStyle = PAL.orange;
  ctx.beginPath();
  ctx.roundRect(sx, sy + sh + 70, sw * (t / DUR), 6, 3);
  ctx.fill();
  ctx.restore();
}

function toast(ctx, t) {
  const g = spring(t - b(20.6), 1.8, 0.62);
  if (g <= 0.001) return;
  const x = lerp(W + 40, 1290, g), y = 112, w = 380, h = 74;
  ctx.save();
  ctx.shadowColor = 'rgba(6,14,80,0.3)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = PAL.white;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = PAL.orange;
  ctx.beginPath();
  ctx.arc(x + 38, y + h / 2, 17, 0, TAU);
  ctx.fill();
  const ck = prog(t, b(20.85), b(21.2), E.out);
  ctx.strokeStyle = PAL.white;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([30, 30]);
  ctx.lineDashOffset = 30 * (1 - ck);
  ctx.beginPath();
  ctx.moveTo(x + 30, y + h / 2 + 1);
  ctx.lineTo(x + 36, y + h / 2 + 7);
  ctx.lineTo(x + 47, y + h / 2 - 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = PAL.ink;
  ctx.font = ui(18, 600);
  ctx.fillText('Render complete', x + 70, y + 32);
  ctx.font = ui(14, 500);
  ctx.fillStyle = GREY;
  ctx.fillText('900 frames · 1920×1080 · 60 fps', x + 70, y + 54);
  ctx.restore();
}

export function renderUI(ctx, t, { noBg = false } = {}) {
  if (!noBg) {
    ctx.fillStyle = PAL.blue;
    ctx.fillRect(-200, -200, W + 400, H + 400);
  }
  // push in once the knob hand-off is done (z = 1 keeps the knob where the 3D left it)
  const z = 1 + 0.07 * prog(t, b(18.15), b(22), E.outSine);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.translate(-W / 2, -H / 2);
  easeCard(ctx, t);
  timeCard(ctx, t);
  framesCard(ctx, t);
  paletteCard(ctx, t);
  previewCard(ctx, t);
  ctrlCard(ctx, t);
  toast(ctx, t);
  drawCursor(ctx, t);
  ctx.restore();
}

export default {
  render(ctx, t) {
    renderUI(ctx, t);
  },
};
