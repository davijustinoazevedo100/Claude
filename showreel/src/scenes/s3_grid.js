// 03 — SHAPE SYSTEMS
// A Bauhaus tile system. Every motif is a resampled polygon, so any shape can
// morph into any other. The grid builds out radially from the hero dot, then
// each beat triggers a different wave: rotate, morph, colour flip, row slide.
// Finally every tile collapses toward the dot, which grows into the sphere
// that the 3D scene picks up on the next cut.

import { W, H, PAL, b } from '../timeline.js';
import { clamp, lerp, prog, E, TAU, rng, hash1, rgba } from '../core.js';
import { DOT, dotZoom } from './s2_type.js';

const T = 240, HALF = T / 2, COLS = 8, ROWS = 5;
const OY = -60; // grid y offset (full-bleed, 5 rows of 240 on 1080)
const N = 120; // polygon resolution for morphing
const ORIGIN = { c: 5, r: 2 };
export const SPHERE_R = 300; // screen radius handed to the 3D scene

const tileCenter = (c, r) => [HALF + c * T, OY + HALF + r * T];

// ------------------------------------------------------------- motif polygons

function arc(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

const RAW = {
  circle: () => arc(0, 0, 0.36 * T, -Math.PI, Math.PI, 96).slice(0, -1),
  quarter: () => [[-HALF, -HALF], ...arc(-HALF, -HALF, T, 0, Math.PI / 2, 64)],
  half: () => arc(0, HALF, HALF, Math.PI, TAU, 64),
  tri: () => [[-HALF, -HALF], [HALF, HALF], [-HALF, HALF]],
  square: () => [[-60, -60], [60, -60], [60, 60], [-60, 60]],
  leaf: () => [...arc(-HALF, HALF, T, -Math.PI / 2, 0, 48).slice(0, -1), ...arc(HALF, -HALF, T, Math.PI / 2, Math.PI, 48).slice(0, -1)],
  arch: () => [[-72, 92], [-72, -8], ...arc(0, -8, 72, Math.PI, TAU, 40), [72, -8], [72, 92]],
  pill: () => [...arc(-48, 0, 48, Math.PI / 2, Math.PI * 1.5, 32), ...arc(48, 0, 48, -Math.PI / 2, Math.PI / 2, 32)],
  diamond: () => [[0, -96], [96, 0], [0, 96], [-96, 0]],
};

function resample(pts, n) {
  // ensure clockwise (screen coords): signed area > 0
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) pts = pts.slice().reverse();
  const seg = [];
  let per = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    seg.push(l);
    per += l;
  }
  const out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * per;
    while (acc + seg[i] < d && i < pts.length - 1) {
      acc += seg[i];
      i++;
    }
    const a = pts[i], c = pts[(i + 1) % pts.length];
    const u = seg[i] > 0 ? (d - acc) / seg[i] : 0;
    out.push([lerp(a[0], c[0], u), lerp(a[1], c[1], u)]);
  }
  // rotate so index 0 is the point closest to the top-left direction
  let best = 0, bd = Infinity;
  const ref = -0.75 * Math.PI;
  for (let k = 0; k < n; k++) {
    let da = Math.atan2(out[k][1], out[k][0]) - ref;
    da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
    if (da < bd) {
      bd = da;
      best = k;
    }
  }
  return out.slice(best).concat(out.slice(0, best));
}

const POLY = {};
for (const k of Object.keys(RAW)) POLY[k] = resample(RAW[k](), N);

const MORPH = { circle: 'square', square: 'circle', quarter: 'leaf', leaf: 'quarter', half: 'arch', arch: 'pill', tri: 'diamond', pill: 'circle', diamond: 'tri' };

// ------------------------------------------------------------- tile layout

const COLORS = [PAL.orange, PAL.blue, PAL.ink, PAL.paper, PAL.lime, PAL.pink];
const tiles = [];
(() => {
  const r = rng(2026);
  const bgW = [[PAL.paper, 34], [PAL.ink, 22], [PAL.blue, 16], [PAL.orange, 12], [PAL.pink, 9], [PAL.lime, 7]];
  const pick = (weights, avoid) => {
    const ws = weights.filter(([c]) => !avoid.includes(c));
    let s = ws.reduce((a, [, w]) => a + w, 0) * r();
    for (const [c, w] of ws) if ((s -= w) <= 0) return c;
    return ws[0][0];
  };
  const kinds = ['circle', 'quarter', 'half', 'tri', 'square', 'leaf', 'arch', 'pill', 'diamond', 'stripes', 'dots', 'ring'];
  const grid = [];
  for (let row = 0; row < ROWS; row++) {
    for (let c = 0; c < COLS; c++) {
      const left = c > 0 ? grid[row * COLS + c - 1] : null;
      const up = row > 0 ? grid[(row - 1) * COLS + c] : null;
      const avoid = [left && left.bg, up && up.bg].filter(Boolean);
      let bg = pick(bgW, avoid);
      let fg = pick(COLORS.map((c2) => [c2, c2 === PAL.orange ? 3 : c2 === PAL.ink || c2 === PAL.paper ? 2.2 : 1.6]), [bg, ...(bg === PAL.ink ? [] : [])]);
      if ((bg === PAL.pink && fg === PAL.paper) || (bg === PAL.paper && fg === PAL.lime) || (bg === PAL.lime && fg === PAL.paper)) fg = PAL.ink;
      let kind = kinds[Math.floor(r() * kinds.length)];
      if (left && left.kind === kind) kind = kinds[(kinds.indexOf(kind) + 3) % kinds.length];
      const t = { c, r: row, bg, fg, kind, rot: Math.floor(r() * 4), seed: r() };
      if (c === ORIGIN.c && row === ORIGIN.r) Object.assign(t, { bg: PAL.ink, fg: PAL.orange, kind: 'circle', rot: 0, origin: true });
      grid.push(t);
    }
  }
  tiles.push(...grid);
})();

// ------------------------------------------------------------- drawing

function polyPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function drawMotif(ctx, tile, t, morphP, local) {
  const k = tile.kind;
  if (k === 'stripes') {
    const off = ((t * 90 + tile.seed * 60) % 60) - 60;
    for (let y = -HALF + off; y < HALF + 60; y += 60) ctx.fillRect(-HALF, y, T, 30);
    return;
  }
  if (k === 'dots') {
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const ph = Math.sin(t * 9 + (i + j) * 0.9 + tile.seed * 6);
        ctx.beginPath();
        ctx.arc(i * 70, j * 70, 17 + 5 * ph * local, 0, TAU);
        ctx.fill();
      }
    return;
  }
  if (k === 'ring') {
    const w = 26 + 10 * Math.sin(t * 7 + tile.seed * 5) * local;
    ctx.beginPath();
    ctx.arc(0, 0, 0.36 * T - w / 2, 0, TAU);
    ctx.lineWidth = w;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
    return;
  }
  const a = POLY[k], c = POLY[MORPH[k]];
  if (morphP <= 0) return polyPath(ctx, a), ctx.fill();
  if (morphP >= 1) return polyPath(ctx, c), ctx.fill();
  const pts = a.map((p, i) => [lerp(p[0], c[i][0], morphP), lerp(p[1], c[i][1], morphP)]);
  polyPath(ctx, pts);
  ctx.fill();
}

function distTiles(tile) {
  return Math.hypot(tile.c - ORIGIN.c, tile.r - ORIGIN.r);
}

// the dot: from the full stop of "fluently." into the origin tile, then to centre stage
export function heroDot(t) {
  const z = dotZoom(b(9.75));
  const sx = W / 2 + (DOT.x - W / 2) * z, sy = H / 2 + (DOT.y - H / 2) * z;
  const [ox, oy] = tileCenter(ORIGIN.c, ORIGIN.r);
  const p1 = prog(t, b(9.75), b(10.35), E.snap);
  let x = lerp(sx, ox, p1), y = lerp(sy, oy, p1);
  let r = lerp(DOT.r * z, 0.36 * T, E.outBack(prog(t, b(9.8), b(10.4))));
  const p2 = prog(t, b(13.45), b(14), E.snap);
  x = lerp(x, W / 2, p2);
  y = lerp(y, H / 2, p2);
  r = lerp(r, SPHERE_R, p2);
  return { x, y, r };
}

export default {
  render(ctx, t) {
    // the grid is drawn over s2's black act during the build
    const build0 = b(9.85);
    for (const tile of tiles) {
      if (tile.origin) continue;
      const d = distTiles(tile);
      const pin = prog(t, build0 + d * 0.022, build0 + d * 0.022 + 0.42, E.outBack);
      const maxD = 5.4;
      const pout = prog(t, b(13.3) + (maxD - d) * 0.018, b(13.3) + (maxD - d) * 0.018 + 0.22, E.inBack);
      const s = pin * (1 - pout);
      if (s <= 0.001) continue;
      let [cx, cy] = tileCenter(tile.c, tile.r);

      // row slide on beat 13 (centre row stays put)
      if (tile.r !== ORIGIN.r) {
        const dir = tile.r % 2 ? -1 : 1;
        const ps = prog(t, b(13) + Math.abs(tile.r - 2) * 0.03, b(13) + Math.abs(tile.r - 2) * 0.03 + 0.36, E.snap);
        cx += dir * T * ps;
        if (cx > W + HALF) cx -= COLS * T;
        if (cx < -HALF) cx += COLS * T;
      }

      // colour flip wave (beat 12.5), diagonal from bottom-right
      const flipD = (COLS - 1 - tile.c + ROWS - 1 - tile.r) * 0.028;
      const pf = prog(t, b(12.5) + flipD, b(12.5) + flipD + 0.3, E.inOutCubic);
      const swapped = pf >= 0.5;
      const flipSx = Math.abs(Math.cos(pf * Math.PI));

      // rotate wave (beat 11), diagonal from top-left
      const rd = (tile.c + tile.r) * 0.024;
      const prt = prog(t, b(11) + rd, b(11) + rd + 0.38, E.snap);
      const dirR = (tile.c + tile.r) % 2 ? -1 : 1;
      const ang = ((tile.rot + dirR * prt) * Math.PI) / 2;

      // morph wave (beat 12), radial from the dot
      const pm = prog(t, b(12) + d * 0.03, b(12) + d * 0.03 + 0.4, E.snap);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s * flipSx, s);
      ctx.fillStyle = swapped ? tile.fg : tile.bg;
      ctx.fillRect(-HALF - 0.5, -HALF - 0.5, T + 1, T + 1);
      ctx.beginPath();
      ctx.rect(-HALF, -HALF, T, T);
      ctx.clip();
      ctx.rotate(ang);
      ctx.fillStyle = swapped ? tile.bg : tile.fg;
      drawMotif(ctx, tile, t, pm, prog(t, b(10.3), b(10.8)));
      ctx.restore();
    }

    // origin tile background (behind the dot)
    const o = tiles.find((x) => x.origin);
    const [ox, oy] = tileCenter(o.c, o.r);
    const pin = prog(t, build0, build0 + 0.36, E.outBack) * (1 - prog(t, b(13.4), b(13.75), E.inBack));
    if (pin > 0) {
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(ox - HALF * pin, oy - HALF * pin, T * pin, T * pin);
    }
    const dot = heroDot(t);
    ctx.fillStyle = PAL.orange;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, TAU);
    ctx.fill();
  },
};
