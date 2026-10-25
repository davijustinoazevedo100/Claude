// Metaballs with analytic anti-aliasing: the field f = sum(r^2 / d^2) is
// thresholded at 1 using its gradient as a distance estimate, so edges stay
// one pixel soft at any size. Colours blend by each ball's contribution.
import { rgbOf } from './core.js';

const imgCache = new Map();

export function drawMetaballs(ctx, env, balls, { cx = 960, cy = 540, sx = 1, sy = 1, pad = 1.9 } = {}) {
  if (!balls.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  // Reach of the iso-surface is bounded by the combined mass of all balls.
  let mass = 0;
  for (const b of balls) mass += b.r * b.r;
  const reach = Math.sqrt(mass) * 1.08;
  for (const b of balls) {
    const e = Math.max(b.r * pad, reach);
    minX = Math.min(minX, cx + (b.x - e - cx) * sx, cx + (b.x + e - cx) * sx);
    maxX = Math.max(maxX, cx + (b.x - e - cx) * sx, cx + (b.x + e - cx) * sx);
    minY = Math.min(minY, cy + (b.y - e - cy) * sy, cy + (b.y + e - cy) * sy);
    maxY = Math.max(maxY, cy + (b.y - e - cy) * sy, cy + (b.y + e - cy) * sy);
  }
  const x0 = Math.max(-100, Math.floor(minX)), y0 = Math.max(-100, Math.floor(minY));
  const x1 = Math.min(2020, Math.ceil(maxX)), y1 = Math.min(1180, Math.ceil(maxY));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const L = env.layer('metaballs', 2120, 1280);
  const key = `${w}x${h}`;
  let img = imgCache.get(key);
  if (!img) {
    img = L.ctx.createImageData(w, h);
    if (imgCache.size > 64) imgCache.clear();
    imgCache.set(key, img);
  }
  const d = img.data;
  d.fill(0);
  const n = balls.length;
  const bx = new Float64Array(n), by = new Float64Array(n), r2 = new Float64Array(n);
  const cr = new Float64Array(n), cg = new Float64Array(n), cb = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = balls[i];
    bx[i] = b.x; by[i] = b.y; r2[i] = b.r * b.r;
    const c = Array.isArray(b.color) ? b.color : rgbOf(b.color);
    cr[i] = c[0]; cg[i] = c[1]; cb[i] = c[2];
  }
  const isx = 1 / sx, isy = 1 / sy;
  for (let py = 0; py < h; py++) {
    const Y = y0 + py + 0.5;
    const qy = cy + (Y - cy) * isy;
    for (let px = 0; px < w; px++) {
      const X = x0 + px + 0.5;
      const qx = cx + (X - cx) * isx;
      let f = 0, gx = 0, gy = 0, R = 0, G = 0, B = 0;
      for (let i = 0; i < n; i++) {
        const dx = qx - bx[i], dy = qy - by[i];
        const dd = dx * dx + dy * dy + 1e-6;
        const v = r2[i] / dd;
        f += v;
        const k = (-2 * v) / dd;
        gx += k * dx;
        gy += k * dy;
        R += v * cr[i]; G += v * cg[i]; B += v * cb[i];
      }
      if (f < 0.55) continue;
      const g = Math.sqrt(gx * gx * isx * isx + gy * gy * isy * isy) + 1e-9;
      let a = 0.5 + (f - 1) / g;
      if (a <= 0) continue;
      if (a > 1) a = 1;
      const o = (py * w + px) * 4;
      d[o] = R / f; d[o + 1] = G / f; d[o + 2] = B / f; d[o + 3] = a * 255;
    }
  }
  L.ctx.putImageData(img, 0, 0);
  ctx.drawImage(L.canvas, 0, 0, w, h, x0, y0, w, h);
}
