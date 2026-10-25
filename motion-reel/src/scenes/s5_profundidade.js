// 06 — PROFUNDIDADE. No 3D engine: points on a 120 x 50 UV grid, rotated by
// hand-written matrices and projected with a pinhole camera. The word explodes
// into a UV sphere, the sphere becomes a torus, the torus unrolls into a wave
// terrain, and the terrain collapses into the baseline of the next scene.
import { PAL, FPS } from '../config.js';
import { TAU, clamp, prog, ease, rgba, lerp, hash1, gradientAt, rgbOf, noise } from '../core.js';
import { caption, label } from '../ui.js';
import { particleSystem, NP, posS4, drawStreaks, H } from '../particles.js';

const U = 120, V = 50; // U * V === NP
const F = 1100, D = 1400;
const C = { x: 960, y: 540 };
const LINE_Y = 860, LINE_X0 = 120, LINE_X1 = 1800;
const T_SPHERE = 0.18, T_TORUS = 2.55, T_TERRAIN = 3.95, T_COLLAPSE = 5.2, T_WIPE = 5.5;

let S = null;
let INV = null; // uv index -> particle index
let START = null; // particle screen position at hand-off
let DIR = null;
const COLORS = [PAL.yellow, PAL.coral, PAL.lilac, '#6F86FF', PAL.mint];
const COLS = [];

const rot = (p, yaw, pitch, roll = 0) => {
  let [x, y, z] = p;
  // roll (z), yaw (y), pitch (x)
  let c = Math.cos(roll), s = Math.sin(roll);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(yaw); s = Math.sin(yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(pitch); s = Math.sin(pitch);
  [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
};

function sphere(u, v, lt, loud) {
  const R = 330 * (1 + 0.05 * loud);
  const th = (u / U) * TAU, ph = ((v + 0.5) / V) * Math.PI;
  const p = [Math.sin(ph) * Math.cos(th) * R, -Math.cos(ph) * R, Math.sin(ph) * Math.sin(th) * R];
  return rot(p, 0.5 + lt * 0.75, 0.42);
}
function torus(u, v, lt, loud) {
  const R = 300, r = 108 * (1 + 0.08 * loud);
  const th = (u / U) * TAU + lt * 0.5, ph = (v / V) * TAU + 1.2;
  const p = [(R + r * Math.cos(ph)) * Math.cos(th), r * Math.sin(ph), (R + r * Math.cos(ph)) * Math.sin(th)];
  return rot(p, 0.35 + lt * 0.2, 1.05 - 0.25 * prog(lt, T_TORUS, T_TERRAIN), 0.2);
}
function terrain(u, v, lt, loud) {
  const x = (u / (U - 1) - 0.5) * 2700;
  const z = (v / (V - 1)) * 1750 + 60;
  const w = lt * 2.2;
  const h =
    (105 + 50 * loud) * Math.sin(x * 0.0055 + w) * Math.cos(z * 0.0042 - w * 0.7) +
    60 * noise.n3(x * 0.0022, z * 0.0022, lt * 0.4);
  return [x, 330 - h * prog(lt, T_TERRAIN + 0.2, T_TERRAIN + 0.9), z - 260];
}
const project = (p, out) => {
  const k = F / (p[2] + D);
  out[0] = C.x + p[0] * k;
  out[1] = C.y + p[1] * k;
  out[2] = k;
  return out;
};

// Screen position, scale and colour of uv point `idx` at local time lt.
const tmpP = [0, 0, 0];
function pointAt(idx, lt, loud, out) {
  const u = idx % U, v = Math.floor(idx / U);
  // Shape morphs travel around the ring: the torus unrolls column by column.
  const mT = ease.inOutCubic(prog(lt, T_TORUS + (u / U) * 0.35, T_TORUS + 0.65 + (u / U) * 0.35));
  const mG = ease.inOutCubic(prog(lt, T_TERRAIN + (u / U) * 0.4, T_TERRAIN + 0.7 + (u / U) * 0.4));
  let p = sphere(u, v, lt, loud);
  if (mT > 0) {
    const q = torus(u, v, lt, loud);
    p = [lerp(p[0], q[0], mT), lerp(p[1], q[1], mT), lerp(p[2], q[2], mT)];
  }
  if (mG > 0) {
    const q = terrain(u, v, lt, loud);
    p = [lerp(p[0], q[0], mG), lerp(p[1], q[1], mG), lerp(p[2], q[2], mG)];
  }
  project(p, tmpP);
  let x = tmpP[0], y = tmpP[1], k = tmpP[2];
  // Hand-off from the word: an explosion that bends into the sphere.
  const i = INV[idx];
  const b = ease.inOutCubic(prog(lt, T_SPHERE + hash1(i) * 0.28, T_SPHERE + 0.85 + hash1(i) * 0.28));
  if (b < 1) {
    const sp = 650 + 1100 * hash1(i + 77);
    const kk = 3.4;
    const d = (sp * (1 - Math.exp(-kk * lt))) / kk;
    const ex = START[2 * i] + DIR[2 * i] * d, ey = START[2 * i + 1] + DIR[2 * i + 1] * d;
    x = lerp(ex, x, b);
    y = lerp(ey, y, b);
    k = lerp(1, k, b);
  }
  // Collapse into the baseline, near rows first.
  const c = ease.inOutExpo(prog(lt, T_COLLAPSE + (1 - v / V) * 0.12, T_COLLAPSE + 0.32 + (1 - v / V) * 0.12));
  if (c > 0) {
    x = lerp(x, LINE_X0 + (u / (U - 1)) * (LINE_X1 - LINE_X0), c);
    y = lerp(y, LINE_Y, c);
    k = lerp(k, 0.7, c);
  }
  out[0] = x;
  out[1] = y;
  out[2] = k;
  return out;
}

export default {
  blur: 1,
  post: (lt) => ({ bloom: (0.75 + 0.8 * Math.exp(-lt * 6)) * (1 - prog(lt, T_WIPE, T_WIPE + 0.3)), vignette: 0.36 * (1 - prog(lt, T_WIPE, 5.9)) + 0.1, grain: 0.06 }),

  init() {
    S = particleSystem();
    // Each particle leaves the word towards the sphere point at the same angle.
    START = new Float32Array(NP * 2);
    DIR = new Float32Array(NP * 2);
    const o = [0, 0];
    const ang = [];
    for (let i = 0; i < NP; i++) {
      posS4(S, i, 6.0, o);
      START[2 * i] = o[0];
      START[2 * i + 1] = o[1];
      const dx = o[0] - 960, dy = (o[1] - 525) * 2.2;
      const d = Math.hypot(dx, dy) + 1e-6;
      const jit = (hash1(i * 3 + 1) - 0.5) * 0.6;
      const a = Math.atan2(dy, dx) + jit;
      DIR[2 * i] = Math.cos(a);
      DIR[2 * i + 1] = Math.sin(a);
      ang.push([i, Math.atan2(o[1] - 540, o[0] - 960)]);
    }
    const sp = [];
    const q = [0, 0, 0];
    for (let idx = 0; idx < NP; idx++) {
      project(sphere(idx % U, Math.floor(idx / U), 1.0, 0), q);
      sp.push([idx, Math.atan2(q[1] - 540, q[0] - 960)]);
    }
    ang.sort((a, b) => a[1] - b[1]);
    sp.sort((a, b) => a[1] - b[1]);
    INV = new Int32Array(NP);
    for (let k = 0; k < NP; k++) INV[sp[k][0]] = ang[k][0];
    for (let v = 0; v < V; v++) COLS.push(rgbOf(gradientAt(COLORS, v / (V - 1))));
  },

  draw(ctx, t, lt, env) {
    env.fill(ctx, PAL.dark);
    const loud = env.loud(t);

    // Paper opens up from the baseline at the very end.
    const wipe = ease.inOutExpo(prog(lt, T_WIPE, 5.96));

    // Screen positions at t and at the shutter edges.
    const P = new Float32Array(NP * 3);
    const o = [0, 0, 0];
    for (let idx = 0; idx < NP; idx++) {
      pointAt(idx, lt, loud, o);
      P[idx * 3] = o[0];
      P[idx * 3 + 1] = o[1];
      P[idx * 3 + 2] = o[2];
    }

    // Shockwave from the drop.
    const sw = prog(lt, 0, 0.8);
    if (sw < 1) {
      ctx.save();
      ctx.strokeStyle = rgba(PAL.paper, 0.6 * (1 - sw) ** 2);
      ctx.lineWidth = 2 + 14 * (1 - sw);
      ctx.beginPath();
      ctx.ellipse(960, 525, 200 + 1300 * ease.outExpo(sw), 90 + 700 * ease.outExpo(sw), 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Wireframe along both grid directions, fading in once the shape holds.
    const wire = (0.2 + 0.12 * prog(lt, T_TERRAIN + 0.3, T_TERRAIN + 0.9)) * prog(lt, 0.9, 1.6) * (1 - prog(lt, T_COLLAPSE - 0.05, T_COLLAPSE + 0.2));
    if (wire > 0) {
      for (const dir of [0, 1]) {
        for (let band = 0; band < 3; band++) {
          ctx.strokeStyle = rgba(PAL.paper, wire * (0.35 + band * 0.35));
          ctx.lineWidth = 1;
          ctx.beginPath();
          const n1 = dir === 0 ? V : U, n2 = dir === 0 ? U : V;
          for (let a = 0; a < n1; a++) {
            let pen = false;
            // Rings close on themselves until the torus starts to unroll.
            const last = dir === 0 && lt < T_TERRAIN ? n2 : n2 - 1;
            for (let b2 = 0; b2 <= last; b2++) {
              const u = dir === 0 ? b2 % U : a, v = dir === 0 ? a : b2;
              if (v >= V) break;
              const idx = v * U + u;
              const k = P[idx * 3 + 2];
              const bnd = k < 0.68 ? 0 : k < 0.86 ? 1 : 2;
              const x = P[idx * 3], y = P[idx * 3 + 1];
              if (bnd !== band) {
                pen = false;
                continue;
              }
              if (!pen) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              pen = true;
            }
          }
          ctx.stroke();
        }
      }
    }

    // Points as streaks over the shutter.
    const fromPaper = ease.outCubic(prog(lt, 0.05, 0.9));
    const paper = rgbOf(PAL.paper);
    const tmp = [0, 0, 0];
    drawStreaks(
      ctx,
      NP,
      (idx, dt, out) => {
        pointAt(idx, Math.max(0, lt + dt), loud, tmp);
        out[0] = tmp[0];
        out[1] = tmp[1];
        return out;
      },
      (idx) => {
        const c = COLS[Math.floor(idx / U)];
        const k = fromPaper * (1 - prog(lt, T_COLLAPSE + 0.1, T_COLLAPSE + 0.35));
        return [lerp(paper[0], c[0], k), lerp(paper[1], c[1], k), lerp(paper[2], c[2], k)];
      },
      (idx) => 1.15 * P[idx * 3 + 2] * (0.8 + 0.4 * hash1(idx)),
      (idx) => {
        // UV spheres bunch up at the poles: thin them out there.
        const v = Math.floor(idx / U);
        const pole = lerp(0.3 + 0.7 * Math.sin(((v + 0.5) / V) * Math.PI), 1, prog(lt, T_TORUS, T_TORUS + 0.8));
        const terr = 1 + 0.5 * prog(lt, T_TERRAIN + 0.3, T_TERRAIN + 0.9);
        return clamp((0.25 + (P[idx * 3 + 2] - 0.55) * 2.0) * pole * terr) * (1 - wipe);
      },
    );
    ctx.restore();

    if (wipe > 0) {
      const h = 1180 * wipe;
      ctx.fillStyle = PAL.paper;
      ctx.fillRect(-200, LINE_Y - h * 0.82, 2320, h);
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(LINE_X0, LINE_Y - 1, LINE_X1 - LINE_X0, 2);
    } else if (lt > T_COLLAPSE + 0.3) {
      // The collapsed cloud reads as a bright line right before the wipe.
      ctx.fillStyle = rgba(PAL.paper, 0.8 * prog(lt, T_COLLAPSE + 0.3, T_WIPE));
      ctx.fillRect(LINE_X0, LINE_Y - 1, LINE_X1 - LINE_X0, 2);
    }

    caption(ctx, lt, { index: '06 — PROFUNDIDADE', phrase: 'profundidade sem engine.', tIn: 0.9, tOut: 4.45, color: PAL.paper });
    const shapeLabel = lt < T_TORUS + 0.4 ? 'ESFERA UV — 120 × 50 PONTOS' : lt < T_TERRAIN + 0.5 ? 'TORO — R 300 · r 108' : 'TERRENO — ONDA(x, z, t)';
    const since = lt < T_TORUS + 0.4 ? lt - 1.0 : lt < T_TERRAIN + 0.5 ? lt - T_TORUS - 0.4 : lt - T_TERRAIN - 0.5;
    label(ctx, shapeLabel, 960, 96, since, 0, { color: PAL.paper, size: 14, align: 'center', alpha: 0.8 * (1 - prog(lt, T_COLLAPSE, T_COLLAPSE + 0.2)), dur: 0.4 });
    label(ctx, `PROJEÇÃO PERSPECTIVA — f = ${F} PX`, 960, 122, lt, 1.2, { color: PAL.paper, size: 12, align: 'center', alpha: 0.5 * (1 - prog(lt, T_COLLAPSE, T_COLLAPSE + 0.2)) });
  },
};
