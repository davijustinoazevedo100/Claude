// Canvas plumbing, fonts and the small drawing vocabulary every scene shares.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { TAU, clamp } from './core.js';
import { font, FONT } from './config.js';

export { createCanvas };

let fontsReady = false;
export function registerFonts() {
  if (fontsReady) return;
  const dirs = ['/usr/share/fonts/opentype/inter', '/usr/share/fonts/truetype/dejavu'];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/\.(otf|ttf)$/i.test(f) && /^(Inter|DejaVuSansMono)/.test(f)) {
        GlobalFonts.registerFromPath(path.join(dir, f));
      }
    }
  }
  fontsReady = true;
}

export function makeLayer(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, w, h };
}

// ---------------------------------------------------------------- type
const layoutCache = new Map();

// Glyph positions for a string, honouring kerning, with extra tracking in px.
export function layoutText(ctx, str, weight, size, tracking = 0, family = FONT.display) {
  const key = `${str}|${weight}|${size}|${tracking}|${family}`;
  let L = layoutCache.get(key);
  if (L) return L;
  ctx.save();
  ctx.font = font(weight, size, family);
  ctx.letterSpacing = '0px';
  const glyphs = [];
  const chars = [...str];
  let prefix = '';
  for (let i = 0; i < chars.length; i++) {
    const x = ctx.measureText(prefix).width + i * tracking;
    const w = ctx.measureText(chars[i]).width;
    glyphs.push({ ch: chars[i], x, w, cx: x + w / 2 });
    prefix += chars[i];
  }
  const m = ctx.measureText(str);
  const width = m.width + (chars.length - 1) * tracking;
  const cap = ctx.measureText('H');
  L = {
    glyphs,
    width,
    ascent: cap.actualBoundingBoxAscent,
    descent: m.actualBoundingBoxDescent,
    font: font(weight, size, family),
    size,
  };
  ctx.restore();
  layoutCache.set(key, L);
  return L;
}

// Draw a laid-out string glyph by glyph. `fx(i, g)` may return
// { dx, dy, rot, sx, sy, alpha, color, skip } to animate each glyph
// around its baseline centre.
export function drawGlyphs(ctx, L, x0, y0, color, fx) {
  ctx.save();
  ctx.font = L.font;
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (let i = 0; i < L.glyphs.length; i++) {
    const g = L.glyphs[i];
    const o = fx ? fx(i, g) || {} : {};
    if (o.skip) continue;
    const a = o.alpha ?? 1;
    if (a <= 0.003) continue;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = o.color || color;
    ctx.translate(x0 + g.cx + (o.dx || 0), y0 + (o.dy || 0));
    if (o.rot) ctx.rotate(o.rot);
    if (o.sx !== undefined || o.sy !== undefined) ctx.scale(o.sx ?? 1, o.sy ?? 1);
    if (o.stroke) {
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.lineWidth || 2;
      ctx.strokeText(g.ch, -g.w / 2, 0);
    } else {
      ctx.fillText(g.ch, -g.w / 2, 0);
    }
    ctx.restore();
  }
  ctx.restore();
}

// Single line of text with tracking, aligned left/center/right.
export function text(ctx, str, x, y, { weight = 500, size = 24, family = FONT.display, color = '#fff', align = 'left', tracking = 0, alpha = 1 } = {}) {
  ctx.save();
  ctx.font = font(weight, size, family);
  ctx.letterSpacing = `${tracking}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Sample the inked pixels of a string into a point cloud (for particles).
export function textPoints(str, weight, size, cx, cy, step, jitterRng, family = FONT.display, tracking = 0) {
  const pad = 40;
  const probe = createCanvas(10, 10).getContext('2d');
  const L = layoutText(probe, str, weight, size, tracking, family);
  const w = Math.ceil(L.width + pad * 2);
  const h = Math.ceil(size * 1.3 + pad * 2);
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  const base = pad + size;
  drawGlyphs(ctx, L, pad, base, '#fff');
  const img = ctx.getImageData(0, 0, w, h).data;
  const pts = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const jx = x + (jitterRng() - 0.5) * step * 0.8;
      const jy = y + (jitterRng() - 0.5) * step * 0.8;
      const ix = Math.round(clamp(jx, 0, w - 1)), iy = Math.round(clamp(jy, 0, h - 1));
      if (img[(iy * w + ix) * 4 + 3] > 140) {
        pts.push([cx - L.width / 2 + jx - pad, cy + (jy - base) + L.ascent / 2]);
      }
    }
  }
  return { pts, width: L.width, ascent: L.ascent };
}

// ---------------------------------------------------------------- shapes
export function circle(ctx, x, y, r, fill) {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function ring(ctx, x, y, r, width, stroke) {
  if (r <= 0 || width <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export function line(ctx, x1, y1, x2, y2, width, stroke, cap = 'butt') {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

// A line that grows from its start: p in [0, 1].
export function growLine(ctx, x1, y1, x2, y2, p, width, stroke, cap = 'butt') {
  if (p <= 0) return;
  line(ctx, x1, y1, x1 + (x2 - x1) * p, y1 + (y2 - y1) * p, width, stroke, cap);
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Closed path through polar samples r[k] at angles k * TAU / n.
export function polarPath(ctx, cx, cy, radii, scale, rot = 0) {
  const n = radii.length;
  ctx.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU + rot;
    const r = radii[k % n] * scale;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function clipRect(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
}
