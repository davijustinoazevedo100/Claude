// 06 — GENERATIVE
// The UI is sampled into ~20k particles. A wavefront disintegrates it left to
// right; each particle then rides a precomputed curl-noise flow field (so every
// sub-frame is deterministic), shifts from its sampled colour into the reel's
// palette, and finally spirals into a single point on beat 25.

import { W, H, PAL, b } from '../timeline.js';
import { clamp, lerp, prog, E, TAU, hash1, noise3, curl2, hex, makeCanvas, mixColor } from '../core.js';
import { renderUI } from './s5_ui.js';

const STEP = 7;
const DT = 1 / 120;
const T_START = b(22);
const T_END = b(25);
const T_CONV = b(23.85);
const NSTEP = Math.ceil((T_END - T_START) / DT) + 2;
const STAGES = 10;
const PALETTE = [PAL.orange, '#FF8A3D', PAL.pink, '#9DB0FF', PAL.blue, PAL.lime, PAL.paper].map(hex);

let P = null; // particle data
let snap = null, snapCtx = null; // frozen UI layer
let work = null, workCtx = null;

function simulate(n, home, dep, traj) {
  const c = [0, 0];
  for (let i = 0; i < n; i++) {
    let x = home[2 * i], y = home[2 * i + 1];
    const r1 = hash1(i * 3 + 1), r2 = hash1(i * 7 + 5);
    let vx = 160 + 300 * r1 + (x - W / 2) * 0.12;
    let vy = -140 - 260 * r2 + (y - H / 2) * 0.1;
    const base = i * NSTEP * 2;
    const k0 = Math.floor((dep[i] - T_START) / DT);
    for (let k = 0; k < NSTEP; k++) {
      if (k > k0) {
        const tt = T_START + k * DT;
        curl2(x / 360, y / 360, tt * 0.45 + 3, c);
        const fx = c[0] * 430 + 240, fy = c[1] * 430 - 70;
        const relax = DT / 0.32;
        vx += (fx - vx) * relax;
        vy += (fy - vy) * relax;
        x += vx * DT;
        y += vy * DT;
      }
      traj[base + 2 * k] = x;
      traj[base + 2 * k + 1] = y;
    }
  }
}

export default {
  async init(env) {
    [snap, snapCtx] = makeCanvas(W, H);
    renderUI(snapCtx, T_START - 1e-4, { noBg: true });
    [work, workCtx] = makeCanvas(W, H);
    const img = snapCtx.getImageData(0, 0, W, H).data;
    const home = [], cols = [], dep = [];
    for (let y = STEP / 2; y < H; y += STEP) {
      for (let x = STEP / 2; x < W; x += STEP) {
        const o = ((y | 0) * W + (x | 0)) * 4;
        if (img[o + 3] < 140) continue;
        home.push(x, y);
        cols.push([img[o], img[o + 1], img[o + 2]]);
      }
    }
    const n = home.length / 2;
    for (let i = 0; i < n; i++) {
      const x = home[2 * i], y = home[2 * i + 1];
      dep.push(T_START + 0.6 * (x / W) + 0.09 * hash1(i * 13 + 7) + 0.07 * noise3(x / 140, y / 140, 9.1));
    }
    const traj = new Float32Array(n * NSTEP * 2);
    simulate(n, home, dep, traj);
    // colour ramps: sampled colour -> palette colour (pre-built strings)
    const ramps = [];
    for (let i = 0; i < n; i++) {
      // colour streams: bands by original height, lightly shuffled
      const band = clamp(home[2 * i + 1] / H + (hash1(i * 31 + 3) - 0.5) * 0.35, 0, 0.999);
      const target = PALETTE[Math.floor(band * PALETTE.length)];
      const r = [];
      for (let s = 0; s < STAGES; s++) {
        const m = mixColor(cols[i], target, s / (STAGES - 1));
        r.push(`rgb(${m[0] | 0},${m[1] | 0},${m[2] | 0})`);
      }
      ramps.push(r);
    }
    // draw order: by departure so the erase pass is a prefix of the list
    const order = [...Array(n).keys()].sort((a, c) => dep[a] - dep[c]);
    P = { n, home: Float32Array.from(home), dep: Float64Array.from(dep), traj, ramps, order, spin: Float32Array.from({ length: n }, (_, i) => 2.4 + 1.6 * hash1(i * 5 + 11)) };
  },

  render(ctx, t) {
    // background: blue -> ink
    const bgk = prog(t, b(22.1), b(23.0), E.inOutSine);
    const bc = mixColor(PAL.blue, PAL.ink, bgk);
    ctx.fillStyle = `rgb(${bc[0] | 0},${bc[1] | 0},${bc[2] | 0})`;
    ctx.fillRect(-200, -200, W + 400, H + 400);

    // matching camera drift of the UI scene's final frame
    const { n, home, dep, traj, ramps, order, spin } = P;

    // UI layer with departed cells punched out
    let departed = 0;
    while (departed < n && dep[order[departed]] <= t) departed++;
    if (departed < n) {
      workCtx.setTransform(1, 0, 0, 1, 0, 0);
      workCtx.globalCompositeOperation = 'copy';
      workCtx.drawImage(snap, 0, 0);
      workCtx.globalCompositeOperation = 'destination-out';
      workCtx.beginPath();
      for (let j = 0; j < departed; j++) {
        const i = order[j];
        workCtx.rect(home[2 * i] - STEP / 2 - 0.5, home[2 * i + 1] - STEP / 2 - 0.5, STEP + 1, STEP + 1);
      }
      workCtx.fill();
      workCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(work, 0, 0, W, H);
    }

    // particles
    const conv = prog(t, T_CONV, T_END, E.inCubic);
    const convBlend = clamp(conv / 0.32);
    ctx.globalCompositeOperation = 'source-over';
    let lastStyle = '';
    for (let j = 0; j < departed; j++) {
      const i = order[j];
      const tau = t - dep[i];
      const kf = (t - T_START) / DT;
      const k0 = Math.min(NSTEP - 2, Math.max(0, Math.floor(kf)));
      const fr = clamp(kf - k0);
      const base = i * NSTEP * 2;
      let x = lerp(traj[base + 2 * k0], traj[base + 2 * k0 + 2], fr);
      let y = lerp(traj[base + 2 * k0 + 1], traj[base + 2 * k0 + 3], fr);
      if (conv > 0) {
        // spiral into the centre, keyed to where the particle was when it started
        const kc = Math.floor((T_CONV - T_START) / DT);
        const cx0 = traj[base + 2 * kc] - W / 2, cy0 = traj[base + 2 * kc + 1] - H / 2;
        const r0 = Math.hypot(cx0, cy0), a0 = Math.atan2(cy0, cx0);
        const rr = r0 * Math.pow(1 - conv, 1.35);
        const aa = a0 + spin[i] * conv;
        x = lerp(x, W / 2 + rr * Math.cos(aa), convBlend);
        y = lerp(y, H / 2 + rr * Math.sin(aa), convBlend);
      }
      const stage = Math.min(STAGES - 1, Math.floor(clamp(tau / 0.7) * (STAGES - 1)));
      const st = ramps[i][stage];
      if (st !== lastStyle) {
        ctx.fillStyle = st;
        lastStyle = st;
      }
      const s = lerp(STEP, 2.6, clamp(tau / 0.45)) * (1 - 0.45 * conv);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';

    // implosion core + flash on the downbeat of 25
    const core = prog(t, b(24.4), T_END, E.inCubic);
    if (core > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 40 + 260 * core);
      g.addColorStop(0, `rgba(255,240,225,${0.9 * core})`);
      g.addColorStop(0.25, `rgba(255,120,60,${0.45 * core})`);
      g.addColorStop(1, 'rgba(255,90,31,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  },
};
