// Font loading + typographic helpers.
// Anybody is a variable font (wdth 50-150, wght 100-900). Canvas can animate
// weight natively; width is exposed by registering one FontFace per integer
// width step and compensating the fractional remainder with a tiny x-scale.

import { clamp, hash1 } from './core.js';

const FONT_DIR = new URL('../fonts/', import.meta.url).href;

export async function loadFonts() {
  const buf = (f) => fetch(FONT_DIR + f).then((r) => r.arrayBuffer());
  const [any, serif, serifI, mono, ui] = await Promise.all([
    buf('Anybody-normal-100-900.woff2'),
    buf('InstrumentSerif-normal-400.woff2'),
    buf('InstrumentSerif-italic-400.woff2'),
    buf('JetBrainsMono-variable.woff2'),
    buf('Inter-variable.woff2'),
  ]);
  const faces = [];
  for (let w = 50; w <= 150; w++) {
    faces.push(new FontFace('AnyW' + w, any, { weight: '100 900', variationSettings: `'wdth' ${w}` }));
  }
  faces.push(new FontFace('Serif', serif, { weight: '400' }));
  faces.push(new FontFace('SerifI', serifI, { weight: '400' }));
  faces.push(new FontFace('Mono', mono, { weight: '100 800' }));
  faces.push(new FontFace('UI', ui, { weight: '100 900' }));
  await Promise.all(faces.map((f) => f.load()));
  faces.forEach((f) => document.fonts.add(f));
  await document.fonts.ready;
}

// --------------------------------------------------------------- measuring

let _mctx = null;
const mctx = () => {
  if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
  return _mctx;
};
const _mcache = new Map();

// Width of `text` in Anybody at 100px for integer width step wi.
function measureAny100(text, weight, wi) {
  const key = text + '|' + weight + '|' + wi;
  let v = _mcache.get(key);
  if (v === undefined) {
    const c = mctx();
    c.font = `${weight} 100px AnyW${wi}`;
    c.letterSpacing = '0px';
    v = c.measureText(text).width;
    _mcache.set(key, v);
  }
  return v;
}

// Advance width of text in Anybody at fractional wdth (interpolated).
export function anyWidth(text, weight, size, wdth) {
  const w = clamp(wdth, 50, 150);
  const wq = Math.round(weight / 10) * 10;
  const w0 = Math.floor(w), w1 = Math.min(150, w0 + 1), f = w - w0;
  const a = measureAny100(text, wq, w0), c = measureAny100(text, wq, w1);
  return (a + (c - a) * f) * (size / 100);
}

// Configure ctx for Anybody text; returns horizontal scale to apply so the
// fractional width step renders at its true advance.
export function setAny(ctx, text, weight, size, wdth) {
  const w = clamp(wdth, 50, 150);
  const w0 = Math.floor(w);
  const wq = Math.round(weight / 10) * 10;
  ctx.font = `${wq} ${size}px AnyW${w0}`;
  const base = measureAny100(text, wq, w0) * (size / 100);
  const target = anyWidth(text, wq, size, w);
  return base > 0 ? target / base : 1;
}

// Draw Anybody text with its left baseline at (x, y). Returns advance.
export function drawAny(ctx, text, x, y, weight, size, wdth, mode = 'fill') {
  const sx = setAny(ctx, text, weight, size, wdth);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, 1);
  if (mode === 'fill') ctx.fillText(text, 0, 0);
  else ctx.strokeText(text, 0, 0);
  ctx.restore();
  return anyWidth(text, weight, size, wdth);
}

const _gcache = new Map();
export function measure(ctx, font, text, spacing = 0) {
  const key = font + '|' + text + '|' + spacing;
  let v = _gcache.get(key);
  if (v === undefined) {
    const c = mctx();
    c.font = font;
    c.letterSpacing = spacing + 'px';
    const m = c.measureText(text);
    v = {
      w: m.width,
      asc: m.actualBoundingBoxAscent,
      desc: m.actualBoundingBoxDescent,
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
    };
    _gcache.set(key, v);
  }
  return v;
}

export const mono = (size, weight = 500) => `${weight} ${size}px Mono`;
export const ui = (size, weight = 500) => `${weight} ${size}px UI`;
export const serif = (size) => `400 ${size}px Serif`;
export const serifI = (size) => `400 ${size}px SerifI`;

// Decoding "scramble" text: characters resolve left to right.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
export function scramble(target, p, seed = 0, frameT = 0) {
  if (p >= 1) return target;
  if (p <= 0) return '';
  const n = target.length;
  const shown = Math.floor(p * n * 1.0001);
  const tick = Math.floor(frameT * 30);
  let s = '';
  for (let i = 0; i < n; i++) {
    const ch = target[i];
    if (i < shown || ch === ' ') s += ch;
    else if (i < shown + 4) s += GLYPHS[Math.floor(hash1(seed * 131 + i * 17 + tick * 7) * GLYPHS.length)];
  }
  return s;
}
