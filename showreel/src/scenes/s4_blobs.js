// 04 — 3D / CGI
// The flat circle from the grid becomes a lit sphere (2D -> 3D match cut),
// undergoes mitosis into five glossy candy blobs that orbit, merge and pulse on
// the beat, then everything re-absorbs and the sphere shrinks into the UI
// toggle knob while a blue iris opens out of it (3D -> 2D).

import { W, H, PAL, b, BEAT } from '../timeline.js';
import { clamp, lerp, prog, E, linColor, spring } from '../core.js';
import { SPHERE_R } from './s3_grid.js';

const D0 = 5.0;
const F = 1.6;
// world radius whose silhouette is SPHERE_R px tall-radius at distance D0
const R_START = (() => {
  const k = SPHERE_R / H / F;
  return Math.sqrt((k * k * D0 * D0) / (1 + k * k));
})();

// UI toggle knob (scene 5) in screen space
export const KNOB = { x: 1116, y: 264, r: 21 };
const KNOB_W = (() => {
  const ux = (KNOB.x - W / 2) / H, uy = (H / 2 - KNOB.y) / H;
  const X = (ux * D0) / F, Y = (uy * D0) / F;
  const dist = Math.hypot(X, Y, D0);
  return { X, Y, r: ((KNOB.r / H) * dist) / F };
})();

const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];

const KIDS = [
  { col: PAL.blue, dir: [-1, 0.35, -0.25], R: 1.5, r: 0.46, w: 1.7, axis: [0.2, 1, 0.1] },
  { col: PAL.pink, dir: [1, 0.55, 0.05], R: 1.4, r: 0.4, w: -1.9, axis: [0.1, 1, -0.3] },
  { col: PAL.lime, dir: [0.35, -1, -0.35], R: 1.3, r: 0.33, w: 2.2, axis: [1, 0.2, 0.2] },
  { col: PAL.paper, dir: [-0.45, -0.65, 0.6], R: 1.55, r: 0.37, w: -1.6, axis: [0.4, 0.3, 1] },
  { col: '#FF8A3D', dir: [0.85, -0.2, -0.75], R: 1.12, r: 0.25, w: 2.6, axis: [-0.3, 1, 0.4] },
].map((k, i) => {
  const e1 = norm(k.dir);
  const e2 = norm(cross(norm(k.axis), e1));
  return { ...k, e1, e2, lin: linColor(k.col), t0: b(14.5) + i * 0.045 };
});
const ORANGE_L = linColor(PAL.orange);
const INK_L = linColor(PAL.ink);
const BLUE_L = linColor(PAL.blue);

function uniforms(t) {
  const u = (t - b(14)) / BEAT; // local beats 0..4
  const pulse = 1 + 0.075 * Math.exp(-8 * (u - Math.floor(u))) * prog(u, 0.6, 1.0) * (1 - prog(u, 3.2, 3.5));
  // camera orbit
  const orbit = Math.sin(Math.PI * prog(u, 0.2, 3.45, E.inOutSine));
  const yaw = 0.5 * orbit;
  const pitch = 0.16 * orbit;
  const D = D0 - 0.45 * orbit;
  const camPos = [Math.sin(yaw) * Math.cos(pitch) * D, Math.sin(pitch) * D, -Math.cos(yaw) * Math.cos(pitch) * D];
  const fwd = norm(camPos.map((x) => -x));
  const right = norm(cross([0, 1, 0], fwd));
  const up = cross(fwd, right);
  const camRot = new Float32Array([...right, ...up, ...fwd]);

  // main blob
  const exitP = prog(u, 3.5, 4.0, E.snap);
  let rM = R_START;
  rM = lerp(rM, 0.66, spring(t - b(14.5), 1.4, 0.5));
  rM = lerp(rM, 0.86, prog(u, 2.95, 3.55, E.inOutCubic));
  rM = lerp(rM, KNOB_W.r, exitP) * (exitP > 0.5 ? 1 : pulse);
  const mx = lerp(0, KNOB_W.X, exitP), my = lerp(0, KNOB_W.Y, exitP);

  const blobs = new Float32Array(28);
  const cols = new Float32Array(21);
  blobs.set([mx, my, 0, rM], 0);
  cols.set(ORANGE_L, 0);
  KIDS.forEach((k, i) => {
    const em = clamp(spring(t - k.t0, 1.5, 0.55), 0, 1.3) * (1 - prog(u, 2.9 + i * 0.05, 3.45 + i * 0.03, E.inOutCubic));
    const th = k.w * Math.max(0, t - k.t0) * 0.85;
    const c = Math.cos(th), s = Math.sin(th);
    const R = k.R * em;
    const p = [0, 1, 2].map((j) => R * (c * k.e1[j] + s * k.e2[j]));
    const grow = prog(t, k.t0, k.t0 + 0.3, E.out) * (1 - prog(u, 3.05, 3.5, E.inCubic));
    const r = k.r * (0.25 + 0.75 * grow) * grow * pulse;
    blobs.set([p[0] + mx, p[1] + my, p[2], r], 4 * (i + 1));
    cols.set(k.lin, 3 * (i + 1));
  });
  blobs.set([0, 0, 0, 0], 24);
  cols.set(ORANGE_L, 18);

  const shade = prog(u, 0.0, 0.55, E.inOutCubic) * (1 - prog(u, 3.55, 3.95, E.inOutCubic));
  // background: flat ink -> studio -> iris of flat blue out of the knob
  const bgA = [0.03, 0.028, 0.034], bgB = [0.004, 0.004, 0.006];
  const studio = prog(u, 0.05, 0.7, E.inOutCubic);
  return {
    camPos,
    camRot,
    focal: F,
    blobs,
    cols,
    k: 0.5,
    shade,
    bgA: bgA.map((v, i) => lerp(INK_L[i], v, studio)),
    bgB: bgB.map((v, i) => lerp(INK_L[i], v, studio)),
    bgFlat: BLUE_L,
    bgFlatMix: 0,
    iris: [(KNOB.x - W / 2) / H, (H / 2 - KNOB.y) / H, 2.3 * E.inCubic(prog(u, 3.55, 4.0))],
    time: t,
  };
}

export default {
  render(ctx, t, env) {
    const u = uniforms(t);
    const px = env.px;
    const r = env.gl.render(u, px.w, px.h);
    ctx.drawImage(r.canvas, r.sx, r.sy, r.w, r.h, 0, 0, W, H);
  },
};
