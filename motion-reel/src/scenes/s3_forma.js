// 04 — FORMA. One closed curve, sampled in polar coordinates, morphs on every
// beat while a spring rotation keeps each new shape upright. Every morph sends
// a ripple through a dot grid. Then the shape splits into a ring of six
// copies, gathers back into a circle and the stage irises down to black.
import { PAL, font, FONT } from '../config.js';
import { TAU, clamp, prog, ease, rgba, lerp, mix, mixHex, cubicBezier, spring, wobble, noise, hash1 } from '../core.js';
import { polarPath } from '../gfx.js';
import { caption, label } from '../ui.js';

const N = 240;
const CX = 960, CY = 540;
const R0 = 200;
const snap = cubicBezier(0.7, 0, 0.2, 1);

// ---------------------------------------------------------------- shapes
function polygonR(verts, rot) {
  const out = new Float64Array(N);
  const vs = verts.map(([x, y]) => [x * Math.cos(-rot) - y * Math.sin(-rot), x * Math.sin(-rot) + y * Math.cos(-rot)]);
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = Infinity;
    for (let i = 0; i < vs.length; i++) {
      const p1 = vs[i], p2 = vs[(i + 1) % vs.length];
      const ex = p2[0] - p1[0], ey = p2[1] - p1[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const tt = (p1[0] * ey - p1[1] * ex) / den;
      const u = (p1[0] * dy - p1[1] * dx) / den;
      if (tt > 0 && u >= -1e-9 && u <= 1 + 1e-9 && tt < best) best = tt;
    }
    out[k] = best;
  }
  return out;
}
const regular = (n, phase, rIn = null) => {
  const v = [];
  const m = rIn ? n * 2 : n;
  for (let i = 0; i < m; i++) {
    const a = phase + (i / m) * TAU;
    const r = rIn && i % 2 ? rIn : 1;
    v.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return v;
};
const crossVerts = (a) => [[a, -1], [a, -a], [1, -a], [1, a], [a, a], [a, 1], [-a, 1], [-a, a], [-1, a], [-1, -a], [-a, -a], [-a, -1]];
const fnR = (fn, rot) => {
  const out = new Float64Array(N);
  for (let k = 0; k < N; k++) out[k] = fn((k / N) * TAU + rot);
  return out;
};

// Round corners with a circular blur, then normalise to the circle's area.
function finish(r, sigma = 2.2) {
  const out = new Float64Array(N);
  const rad = Math.ceil(sigma * 3);
  for (let k = 0; k < N; k++) {
    let s = 0, w = 0;
    for (let j = -rad; j <= rad; j++) {
      const g = Math.exp(-(j * j) / (2 * sigma * sigma));
      s += g * r[(k + j + N) % N];
      w += g;
    }
    out[k] = s / w;
  }
  let area = 0;
  for (let k = 0; k < N; k++) area += 0.5 * out[k] * out[k] * (TAU / N);
  const sc = Math.min(Math.sqrt(Math.PI / area), 1.45);
  for (let k = 0; k < N; k++) out[k] *= sc;
  return out;
}

const SHAPES = [
  { name: 'CÍRCULO', eq: 'r = 1', color: PAL.paper, sym: TAU / 4, make: (rot) => fnR(() => 1, rot) },
  { name: 'QUADRADO', eq: '4 VÉRTICES', color: PAL.paper, sym: TAU / 4, make: (rot) => finish(polygonR(regular(4, Math.PI / 4), rot)) },
  { name: 'TRIÂNGULO', eq: '3 VÉRTICES', color: PAL.coral, sym: TAU / 3, make: (rot) => finish(polygonR(regular(3, -Math.PI / 2), rot)) },
  { name: 'ESTRELA', eq: '10 VÉRTICES', color: PAL.yellow, sym: TAU / 5, make: (rot) => finish(polygonR(regular(5, -Math.PI / 2, 0.47), rot), 1.6) },
  { name: 'FLOR', eq: 'r = .78 + .22 cos 6θ', color: PAL.paper, sym: TAU / 6, make: (rot) => finish(fnR((a) => 0.78 + 0.22 * Math.cos(6 * a), rot), 0.5) },
  { name: 'CRUZ', eq: '12 VÉRTICES', color: PAL.coral, sym: TAU / 4, make: (rot) => finish(polygonR(crossVerts(0.32), rot)) },
  { name: 'HEXÁGONO', eq: '6 VÉRTICES', color: PAL.mint, sym: TAU / 6, make: (rot) => finish(polygonR(regular(6, 0), rot)) },
  { name: 'BLOB', eq: 'r = 1 + ruído(θ, t)', color: PAL.paper, sym: TAU / 4, make: null },
];
const EVENTS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]; // morph k -> SHAPES[k + 1]
const RING_T = 4.0, RING_MORPH = 4.5, GATHER = 5.0, IRIS = 5.42;

// Accumulated rotation after each morph, and every target shape generated in
// the rotating frame so it lands upright.
const ROT = [0];
for (let k = 0; k < EVENTS.length; k++) ROT.push(ROT[k] + SHAPES[k + 1].sym);
let FRAMES_R = null;

function blobR(lt, rot) {
  return fnR((a) => {
    const x = Math.cos(a), y = Math.sin(a);
    return 1 + 0.1 * noise.n3(x * 1.3, y * 1.3, lt * 0.9) + 0.05 * noise.n3(x * 3, y * 3, lt * 1.4 + 9);
  }, rot);
}

function rotationAt(lt) {
  let r = 0;
  for (let k = 0; k < EVENTS.length; k++) r += SHAPES[k + 1].sym * spring(lt - EVENTS[k], 2.0, 0.42);
  return r;
}

// Radii of the hero shape at local time lt.
function heroR(lt) {
  let k = -1;
  while (k + 1 < EVENTS.length && lt >= EVENTS[k + 1]) k++;
  const cur = k < 0 ? FRAMES_R[0] : SHAPES[k + 1].make ? FRAMES_R[k + 1] : blobR(lt, ROT[k + 1]);
  if (k < 0) return { r: cur, color: SHAPES[0].color, k: 0 };
  const prevIdx = k;
  const prev = SHAPES[prevIdx].make ? FRAMES_R[prevIdx] : blobR(lt, ROT[prevIdx]);
  const e = snap(prog(lt, EVENTS[k], EVENTS[k] + 0.3));
  const r = new Float64Array(N);
  for (let i = 0; i < N; i++) r[i] = lerp(prev[i], cur[i], e);
  return { r, color: mixHex(SHAPES[prevIdx].color, SHAPES[k + 1].color, e), k: k + 1, e };
}

const PUNCH_T = [...EVENTS, RING_T, RING_MORPH, GATHER];
const punch = (lt) => {
  let s = 1;
  for (const te of PUNCH_T) if (lt >= te) s -= 0.085 * wobble(lt - te, 2.4, 7);
  return s;
};

export default {
  blur: 6,
  post: (lt) => ({ bloom: 0.12 + 0.3 * prog(lt, 5.4, 6), vignette: 0.18 + 0.15 * prog(lt, 5.4, 6), grain: 0.06 }),

  init() {
    FRAMES_R = SHAPES.map((s, i) => (s.make ? s.make(ROT[i]) : null));
  },

  draw(ctx, t, lt, env) {
    // Iris: the blue stage closes around the shape at the end.
    const iris = ease.inOutCubic(prog(lt, IRIS, 5.95));
    if (iris > 0) {
      env.fill(ctx, PAL.dark);
      ctx.beginPath();
      ctx.arc(CX, CY, 1150 * (1 - iris), 0, TAU);
      ctx.fillStyle = PAL.blue;
      ctx.fill();
    } else {
      env.fill(ctx, PAL.blue);
    }

    // ---------------------------------------------------------------- dot grid
    const waves = [...EVENTS, RING_T, RING_MORPH, GATHER];
    const implode = (d) => ease.inExpo(prog(lt, 5.35 + d / 5000, 5.9));
    for (let j = -9; j <= 9; j++) {
      for (let i = -16; i <= 16; i++) {
        const gx = CX + i * 60, gy = CY + j * 60;
        const d = Math.hypot(i * 60, j * 60);
        if (d < 120) continue;
        const app = ease.outBack(prog(lt, 0.04 + d / 1900, 0.34 + d / 1900));
        if (app <= 0) continue;
        let inf = 0;
        for (const te of waves) {
          if (lt < te) continue;
          const R = (lt - te) * 1150;
          inf += Math.exp(-(lt - te) * 1.6) * Math.exp(-(((d - R) / 46) ** 2));
        }
        const im = implode(d);
        const push = 16 * inf * (1 - im);
        const k = lerp(1 + push / d, 0, im);
        const x = CX + (gx - CX) * k, y = CY + (gy - CY) * k;
        const r = (3 + 6 * Math.min(inf, 1.4)) * app * (1 - im * 0.6);
        ctx.fillStyle = rgba(PAL.paper, (0.42 + 0.55 * Math.min(1, inf)) * (1 - im * 0.3));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }

    // ---------------------------------------------------------------- caption
    caption(ctx, lt, { index: '04 — FORMA', phrase: 'forma é linguagem.', tIn: 0.3, tOut: 4.95, color: PAL.paper });

    // ---------------------------------------------------------------- ring of copies
    const ringOut = ease.inOutExpo(prog(lt, RING_T, RING_T + 0.45));
    const ringIn = ease.inOutExpo(prog(lt, GATHER + 0.05, GATHER + 0.42));
    const inRing = lt >= RING_T && ringIn < 1;
    const rot = rotationAt(lt);
    const P = punch(lt);

    if (!inRing) {
      // Hero shape (before the ring, and again after it gathers).
      const H = lt < RING_T ? heroR(lt) : { r: FRAMES_R[0], color: PAL.paper, k: 0 };
      let scale = R0 * P;
      let tremor = 0;
      if (lt >= GATHER) {
        // Contract and tremble while the iris closes, still at the end.
        scale = lerp(R0, 180, ease.inOutCubic(prog(lt, 5.4, 5.95))) * P;
        tremor = 4 * Math.sin(Math.PI * prog(lt, 5.45, 6.0)) ** 2;
      }
      const jx = (hash1(Math.floor(lt * 240)) - 0.5) * tremor;
      const jy = (hash1(Math.floor(lt * 240) + 7) - 0.5) * tremor;
      // Echo outlines trail each morph.
      let act = 0;
      for (const te of PUNCH_T) if (lt >= te) act = Math.max(act, 1 - prog(lt, te, te + 0.7));
      if (act > 0 && lt < RING_T) {
        for (let e = 5; e >= 1; e--) {
          const lte = Math.max(0, lt - e * 0.03);
          const He = heroR(lte);
          polarPath(ctx, CX, CY, He.r, R0 * punch(lte) * (1 + e * 0.05), rotationAt(lte));
          ctx.strokeStyle = rgba(PAL.paper, 0.45 * (1 - e / 6) * act);
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      polarPath(ctx, CX + jx, CY + jy, H.r, scale, lt < RING_T ? rot : 0);
      ctx.fillStyle = H.color;
      ctx.fill();

      // Live name + equation of the current shape.
      if (lt < RING_T + 0.2) {
        const s = SHAPES[H.k];
        const since = H.k === 0 ? lt - 0.1 : lt - EVENTS[H.k - 1];
        label(ctx, `${s.name} — ${s.eq}`, CX, 852, since, 0, { color: PAL.paper, size: 15, align: 'center', alpha: 0.85 * (1 - prog(lt, RING_T - 0.1, RING_T + 0.1)), dur: 0.3 });
        label(ctx, `N = ${N} AMOSTRAS POLARES`, CX, 878, lt, 0.4, { color: PAL.paper, size: 12, align: 'center', alpha: 0.5 * (1 - prog(lt, RING_T - 0.1, RING_T + 0.1)) });
      }
      return;
    }

    // Six copies: fly out to a ring, each becomes a different shape on the
    // next beat, then they turn back into circles and gather in the middle.
    const spread = ringOut * (1 - ringIn);
    const ringR = 310 * spread;
    const sc = lerp(1, 0.38, ringOut) + (1 - 0.38) * ringIn;
    const morphE = snap(prog(lt, RING_MORPH, RING_MORPH + 0.3));
    const backE = snap(prog(lt, GATHER, GATHER + 0.25));
    const spin = 0.9 * ease.inOutCubic(prog(lt, RING_T, GATHER + 0.4));
    // Guide ring.
    if (spread > 0.02) {
      ctx.save();
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = rgba(PAL.paper, 0.35 * spread);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(CX, CY, ringR, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    const blob = blobR(lt, ROT[7]);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * TAU + spin;
      const x = CX + Math.cos(a) * ringR, y = CY + Math.sin(a) * ringR;
      const target = FRAMES_R[i + 1];
      const r = new Float64Array(N);
      for (let k = 0; k < N; k++) {
        const fromBlob = lerp(blob[k], target[k], morphE);
        r[k] = lerp(fromBlob, FRAMES_R[0][k], backE);
      }
      const col = mixHex(mixHex(PAL.paper, SHAPES[i + 1].color, morphE), PAL.paper, backE);
      polarPath(ctx, x, y, r, R0 * sc * P, rot + spin * 0.5 - ROT[i + 1] + ROT[7]);
      ctx.fillStyle = col;
      ctx.fill();
    }
  },
};
