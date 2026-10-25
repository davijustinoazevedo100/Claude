// Shared particle system for scenes 05 and 06: 6000 particles, a precomputed
// curl-noise flow simulation, and the point cloud of the word they settle into.
// Scene 06 starts exactly where scene 05 leaves them.
import { TAU, rng, noise, clamp, lerp, prog, ease, spring, hash1, mixRgb, rgbOf } from './core.js';
import { PAL, SHUTTER, FPS } from './config.js';
import { textPoints } from './gfx.js';

export const NP = 6000;
export const SIM_FPS = 60;
export const SIM_T = 3.8; // seconds of simulated flow
const STEPS = Math.ceil(SIM_T * SIM_FPS);
export const CENTER = { x: 960, y: 540 };
export const WORD = 'ORDEM';
export const WORD_Y = 525; // cap-centre of the word
export const CONV_A = 2.3; // convergence starts (scene-local)
const DISC_R = 180;

// Flow field: curl of two octaves of 3D simplex noise -> divergence-free swirl.
const FS = 0.0021;
function curl(x, y, t, out) {
  const e = 1.5;
  const psi = (px, py) =>
    noise.n3(px * FS, py * FS, t * 0.2) + 0.45 * noise.n3(px * FS * 2.3 + 31, py * FS * 2.3 - 17, t * 0.33);
  out[0] = (psi(x, y + e) - psi(x, y - e)) / (2 * e);
  out[1] = -(psi(x + e, y) - psi(x - e, y)) / (2 * e);
}

let SYS = null;

export function particleSystem() {
  if (SYS) return SYS;
  const r = rng(424242);
  const GA = Math.PI * (3 - Math.sqrt(5));
  const disc = new Float32Array(NP * 2);
  const size = new Float32Array(NP);
  const phase = new Float32Array(NP);
  const colIdx = new Uint8Array(NP);
  const palette = [PAL.paper, PAL.coral, PAL.yellow, PAL.mint, '#6F86FF', PAL.lilac];
  const weights = [0.3, 0.2, 0.16, 0.14, 0.12, 0.08];
  for (let i = 0; i < NP; i++) {
    const rr = DISC_R * Math.sqrt((i + 0.5) / NP);
    const a = i * GA;
    disc[2 * i] = CENTER.x + Math.cos(a) * rr;
    disc[2 * i + 1] = CENTER.y + Math.sin(a) * rr;
    size[i] = 1.25 + r() * 1.35;
    phase[i] = r() * TAU;
    let u = r(), k = 0;
    while (k < weights.length - 1 && u > weights[k]) u -= weights[k++];
    colIdx[i] = k;
  }

  // ---------------------------------------------------------------- flow sim
  const traj = new Float32Array(NP * 2 * (STEPS + 1));
  const v = [0, 0];
  const SUB = 2, dt = 1 / (SIM_FPS * SUB);
  const FLOW = 125000;
  for (let i = 0; i < NP; i++) {
    let x = disc[2 * i], y = disc[2 * i + 1];
    const dx = x - CENTER.x, dy = y - CENTER.y;
    const d = Math.hypot(dx, dy) + 1e-6;
    const burst = 260 + 520 * r() * Math.sqrt(d / DISC_R);
    const swirl = (r() - 0.5) * 300;
    const bx = (dx / d) * burst - (dy / d) * swirl;
    const by = (dy / d) * burst + (dx / d) * swirl;
    // A slow private drift keeps filaments from collapsing to hairlines.
    const da = r() * TAU, ds = 40 + 110 * r(), dw = (r() - 0.5) * 2.2;
    traj[i * 2] = x;
    traj[i * 2 + 1] = y;
    let tt = 0;
    for (let s = 1; s <= STEPS; s++) {
      for (let k = 0; k < SUB; k++) {
        curl(x, y, tt, v);
        const decay = Math.exp(-tt * 2.6);
        // Soft walls keep the swarm on screen.
        const ox = x - CENTER.x, oy = y - CENTER.y;
        const wx = Math.max(0, Math.abs(ox) - 800) * Math.sign(ox);
        const wy = Math.max(0, Math.abs(oy) - 400) * Math.sign(oy);
        const ramp = clamp(tt / 0.5);
        const ang = da + dw * tt;
        x += (v[0] * FLOW * ramp + bx * decay - wx * 3.2 + Math.cos(ang) * ds * ramp) * dt;
        y += (v[1] * FLOW * ramp + by * decay - wy * 3.2 + Math.sin(ang) * ds * ramp) * dt;
        tt += dt;
      }
      const o = (s * NP + i) * 2;
      traj[o] = x;
      traj[o + 1] = y;
    }
  }

  // ---------------------------------------------------------------- word targets
  let pts = null;
  for (let step = 5.6; step > 2.5; step -= 0.1) {
    const res = textPoints(WORD, 900, 390, CENTER.x, WORD_Y, step, rng(7));
    if (res.pts.length >= NP) {
      pts = res.pts;
      break;
    }
  }
  // Deterministic thinning down to exactly NP points.
  const rr2 = rng(99);
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(rr2() * (i + 1));
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  pts = pts.slice(0, NP);
  let minX = Infinity, maxX = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
  }
  // Pair particles and targets by x at the start of convergence so the word
  // assembles in a clean left-to-right sweep.
  const s0 = Math.round(CONV_A * SIM_FPS);
  const order = [...Array(NP).keys()].sort((a, b) => traj[(s0 * NP + a) * 2] - traj[(s0 * NP + b) * 2]);
  const tSorted = pts.slice().sort((a, b) => a[0] - b[0]);
  const target = new Float32Array(NP * 2);
  const delay = new Float32Array(NP);
  order.forEach((pi, k) => {
    target[pi * 2] = tSorted[k][0];
    target[pi * 2 + 1] = tSorted[k][1];
    delay[pi] = 0.55 * ((tSorted[k][0] - minX) / (maxX - minX));
  });

  const rgb = palette.map((c) => rgbOf(c));
  SYS = { NP, disc, size, phase, colIdx, palette, rgb, traj, target, delay, wordBox: { minX, maxX } };
  return SYS;
}

// Position along the simulated flow at scene-local time lt.
export function flowAt(S, i, lt, out) {
  const f = clamp(lt * SIM_FPS, 0, STEPS);
  const a = Math.floor(f), b = Math.min(a + 1, STEPS), u = f - a;
  const oa = (a * NP + i) * 2, ob = (b * NP + i) * 2;
  out[0] = S.traj[oa] + (S.traj[ob] - S.traj[oa]) * u;
  out[1] = S.traj[oa + 1] + (S.traj[ob + 1] - S.traj[oa + 1]) * u;
  return out;
}

// Convergence blend (with a little physical overshoot).
export const convB = (S, i, lt) => clamp(spring(lt - CONV_A - S.delay[i], 1.35, 0.6), 0, 1.3);

// Full screen-space position in scene 05 at local time lt (0..6).
const tmp = [0, 0];
export function posS4(S, i, lt, out) {
  flowAt(S, i, lt, tmp);
  const b = convB(S, i, lt);
  let x = lerp(tmp[0], S.target[i * 2], b);
  let y = lerp(tmp[1], S.target[i * 2 + 1], b);
  // Hold: breathing jitter that dies out before the hand-off.
  const hold = prog(lt, 3.3, 3.9) * (1 - prog(lt, 5.55, 5.95));
  if (hold > 0) {
    x += 1.3 * hold * noise.n3(i * 0.37, lt * 1.6, 3.1);
    y += 1.3 * hold * noise.n3(i * 0.37, lt * 1.6, 9.7);
  }
  // Anticipation: the word draws in on itself before the drop.
  const k = 1 - 0.09 * ease.inCubic(prog(lt, 5.55, 6.0));
  x = CENTER.x + (x - CENTER.x) * k;
  y = WORD_Y + (y - WORD_Y) * k;
  // Slow push-in.
  const z = 1 + 0.035 * ease.inOutSine(prog(lt, 3.3, 6.0));
  out[0] = CENTER.x + (x - CENTER.x) * z;
  out[1] = CENTER.y + (y - CENTER.y) * z;
  return out;
}

// Colour of particle i in scene 05: paper -> own hue in the chaos -> warm
// paper once it belongs to the word.
export function colS4(S, i, lt) {
  const own = S.rgb[S.colIdx[i]];
  const paper = S.rgb[0];
  const a = ease.outCubic(prog(lt, 0.05, 0.9));
  const b = clamp(convB(S, i, lt));
  const k = a * (1 - 0.86 * b);
  return [lerp(paper[0], own[0], k), lerp(paper[1], own[1], k), lerp(paper[2], own[2], k)];
}

// Half the shutter interval: streaks span [t - H, t + H].
export const H = SHUTTER / FPS / 2;
const A = [0, 0], B = [0, 0];
const BUCKETS = 4;

// Draw all particles as streaks, batched by quantised colour and alpha.
export function drawStreaks(ctx, count, posFn, colFn, sizeFn, alphaFn, widthMul = 1) {
  const groups = new Map();
  for (let i = 0; i < count; i++) {
    const a = alphaFn(i);
    if (a <= 0.01) continue;
    const c = colFn(i);
    const q = (v) => Math.round(v / 24) * 24;
    const ab = Math.min(BUCKETS, Math.max(1, Math.round(a * BUCKETS)));
    const w = Math.max(0.6, Math.round(sizeFn(i) * 2 * widthMul * 2) / 2);
    const key = `${q(c[0])},${q(c[1])},${q(c[2])}|${ab}|${w}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(i);
  }
  ctx.save();
  ctx.lineCap = 'round';
  for (const [key, list] of groups) {
    const [col, ab, w] = key.split('|');
    ctx.strokeStyle = `rgb(${col})`;
    ctx.globalAlpha = Number(ab) / BUCKETS;
    ctx.lineWidth = Number(w);
    ctx.beginPath();
    for (const i of list) {
      posFn(i, -H, A);
      posFn(i, H, B);
      ctx.moveTo(A[0], A[1]);
      ctx.lineTo(B[0] + (A[0] === B[0] && A[1] === B[1] ? 0.01 : 0), B[1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export { curl, mixRgb, hash1 };
