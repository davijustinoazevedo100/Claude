// Math, easing, noise and color helpers shared by every scene.

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (x - a) / (b - a);
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const fract = (x) => x - Math.floor(x);
export const mod = (x, m) => ((x % m) + m) % m;
export const sign = (x) => (x < 0 ? -1 : 1);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

// ---------------------------------------------------------------- easing

export const E = {};
E.linear = (t) => t;
E.inQuad = (t) => t * t;
E.outQuad = (t) => 1 - (1 - t) * (1 - t);
E.inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
E.inCubic = (t) => t * t * t;
E.outCubic = (t) => 1 - Math.pow(1 - t, 3);
E.inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
E.inQuart = (t) => t * t * t * t;
E.outQuart = (t) => 1 - Math.pow(1 - t, 4);
E.inOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
E.inExpo = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
E.outExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
E.inOutExpo = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
E.outBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
E.inBack = (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t;
E.inOutBack = (t, s = 1.70158 * 1.525) =>
  t < 0.5
    ? (Math.pow(2 * t, 2) * ((s + 1) * 2 * t - s)) / 2
    : (Math.pow(2 * t - 2, 2) * ((s + 1) * (t * 2 - 2) + s) + 2) / 2;
E.outElastic = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
E.outSine = (t) => Math.sin((t * Math.PI) / 2);
E.inOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// CSS-style cubic-bezier easing (Newton-Raphson with bisection fallback).
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

// The reel's motion language: a handful of signature curves used everywhere.
E.snap = bezier(0.76, 0, 0.14, 1); // hard in-out, for cuts and slams
E.out = bezier(0.16, 1, 0.3, 1); // expo-like settle
E.in = bezier(0.7, 0, 0.84, 0); // accelerate into a cut
E.soft = bezier(0.45, 0, 0.2, 1); // gentle in-out

// Damped spring from 0 to 1 (t in seconds).
export function spring(t, freq = 2.2, damp = 0.42) {
  if (t <= 0) return 0;
  const w = TAU * freq;
  if (damp >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - damp * damp);
  return 1 - Math.exp(-damp * w * t) * (Math.cos(wd * t) + ((damp * w) / wd) * Math.sin(wd * t));
}

// Progress of t inside [t0, t1], clamped and eased.
export const prog = (t, t0, t1, ease = E.linear) => ease(clamp((t - t0) / (t1 - t0)));

// Smooth 0->1->0 window.
export const pulse = (t, t0, t1, fadeIn, fadeOut) =>
  smoothstep(t0, t0 + fadeIn, t) * (1 - smoothstep(t1 - fadeOut, t1, t));

// ---------------------------------------------------------------- random

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic hash -> [0,1)
export function hash1(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- simplex noise (3D)

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);
const PERM = new Uint8Array(512);
const PERM12 = new Uint8Array(512);
(() => {
  const r = rng(1337);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
    PERM12[i] = PERM[i] % 12;
  }
})();

const F3 = 1 / 3, G3 = 1 / 6;
export function noise3(x, y, z) {
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }
  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  let n = 0;
  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 > 0) {
    const g = PERM12[ii + PERM[jj + PERM[kk]]] * 3;
    t0 *= t0;
    n += t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0);
  }
  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 > 0) {
    const g = PERM12[ii + i1 + PERM[jj + j1 + PERM[kk + k1]]] * 3;
    t1 *= t1;
    n += t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1);
  }
  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 > 0) {
    const g = PERM12[ii + i2 + PERM[jj + j2 + PERM[kk + k2]]] * 3;
    t2 *= t2;
    n += t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2);
  }
  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 > 0) {
    const g = PERM12[ii + 1 + PERM[jj + 1 + PERM[kk + 1]]] * 3;
    t3 *= t3;
    n += t3 * t3 * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3);
  }
  return 32 * n; // ~[-1, 1]
}

// 2D curl of a scalar potential noise field (divergence free flow).
export function curl2(x, y, z, out) {
  const e = 0.01;
  const dy = (noise3(x, y + e, z) - noise3(x, y - e, z)) / (2 * e);
  const dx = (noise3(x + e, y, z) - noise3(x - e, y, z)) / (2 * e);
  out[0] = dy;
  out[1] = -dx;
  return out;
}

// ---------------------------------------------------------------- color

const _hexCache = new Map();
export function hex(c) {
  let v = _hexCache.get(c);
  if (!v) {
    const h = c.replace('#', '');
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    _hexCache.set(c, v);
  }
  return v;
}
export const rgba = (c, a = 1) => {
  const [r, g, bl] = typeof c === 'string' ? hex(c) : c;
  return `rgba(${r | 0},${g | 0},${bl | 0},${a})`;
};
export function mixColor(c1, c2, t) {
  const a = typeof c1 === 'string' ? hex(c1) : c1;
  const bb = typeof c2 === 'string' ? hex(c2) : c2;
  return [lerp(a[0], bb[0], t), lerp(a[1], bb[1], t), lerp(a[2], bb[2], t)];
}
export const mixRgba = (c1, c2, t, a = 1) => rgba(mixColor(c1, c2, t), a);
// sRGB <-> linear (for the WebGL pass)
export const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
export const linColor = (c) => hex(c).map(toLinear);

// ---------------------------------------------------------------- canvas helpers

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return [c, ctx];
}

// Area-preserving squash/stretch transform along an angle.
export function stretchTransform(ctx, x, y, angle, s) {
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s, 1 / s);
  ctx.rotate(-angle);
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
}
