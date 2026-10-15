// 01 — SQUASH & STRETCH
// The animator's first exercise, done properly: ballistic arcs whose ground
// contacts land on the beat grid (1, 2, 2.5, 2.75, 2.875), contact squash,
// velocity stretch, onion skins, a live value graph, and principle call-outs.
// Ends with a camera push into the ball that fills the frame on the drop.

import { W, H, PAL, b } from '../timeline.js';
import { clamp, lerp, prog, smoothstep, E, TAU, rgba } from '../core.js';
import { mono } from '../type.js';

const G = 13836; // px/s^2
export const R0 = 34;
const GROUND = 770;
const REST = GROUND - R0;

const C = [b(1), b(2), b(2.5), b(2.75), b(2.875)]; // contact (max squash) times
const X = [560, 820, 912, 948, 960]; // contact x
const DLT = [0.062, 0.054, 0.04, 0.03, 0.022]; // ground-contact duration
const T0 = 0.6; // virtual first segment duration (ball is thrown in)
const VX0 = (X[0] + 40) / C[0];

// Flight segments between contacts (shortened by half the contact time each side).
const SEG = [];
SEG.push({ ts: C[0] - T0, te: C[0] - DLT[0] / 2, xs: X[0] - VX0 * T0, xe: X[0] - (VX0 * DLT[0]) / 4 });
for (let n = 0; n < C.length - 1; n++) {
  const vx = (X[n + 1] - X[n]) / (C[n + 1] - C[n]);
  SEG.push({
    ts: C[n] + DLT[n] / 2,
    te: C[n + 1] - DLT[n + 1] / 2,
    xs: X[n] + (vx * DLT[n]) / 4,
    xe: X[n + 1] - (vx * DLT[n + 1]) / 4,
  });
}
const V = SEG.map((s) => 0.5 * G * (s.te - s.ts)); // impact speed at the end of each segment
const T_REST = C[4] + DLT[4] / 2;

function flight(t) {
  for (let n = 0; n < SEG.length; n++) {
    const s = SEG[n];
    if (t >= s.ts && t <= s.te) {
      const T = s.te - s.ts, u = t - s.ts;
      const vx = (s.xe - s.xs) / T;
      return { x: s.xs + vx * u, y: REST - 0.5 * G * u * (T - u), vx, vy: -0.5 * G * (T - 2 * u), contact: -1 };
    }
    if (n < C.length && t > s.te && t < C[n] + DLT[n] / 2) {
      // on the ground: squash phase
      const nx = n + 1 < SEG.length ? SEG[n + 1].xs : X[n];
      return { x: lerp(s.xe, nx, (t - s.te) / DLT[n]), y: REST, vx: 0, vy: 0, contact: n };
    }
  }
  if (t < SEG[0].ts) return { x: SEG[0].xs, y: REST, vx: 0, vy: 0, contact: -1 };
  return { x: X[4], y: REST, vx: 0, vy: 0, contact: -1 };
}

// Full ball pose: position + deformation.
export function ballPose(t) {
  const f = flight(t);
  let x = f.x, y = f.y, ang = Math.atan2(f.vy, f.vx), s = 1, q = 0;
  const speed = Math.hypot(f.vx, f.vy);
  s = 1 + 0.4 * smoothstep(250, 4300, speed);
  if (f.contact >= 0) {
    const n = f.contact, u = (t - C[n]) / DLT[n];
    const amp = 0.5 * Math.pow(V[n] / V[0], 0.75);
    q = amp * Math.pow(Math.cos(u * Math.PI), 2);
    s = 1;
  }
  // settle wobble after the last contact
  if (t > T_REST) {
    const u = t - T_REST;
    q += 0.07 * Math.exp(-u * 9) * Math.sin(u * TAU * 6.5);
  }
  // anticipation squash, then the leap toward camera
  const ant = prog(t, b(3.15), b(3.5), E.inOutCubic);
  const rel = prog(t, b(3.5), b(3.68), E.outCubic);
  const back = prog(t, b(3.68), b(3.95), E.inOutSine);
  q += 0.3 * ant - 0.52 * rel + 0.22 * back;
  let lift = 150 * prog(t, b(3.5), b(3.85), E.outCubic);
  y = y + R0 * q - lift;
  return { x, y, ang, s, q, lift };
}

function drawBall(ctx, p, r = R0) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (Math.abs(p.s - 1) > 0.001) {
    ctx.rotate(p.ang);
    ctx.scale(p.s, 1 / p.s);
    ctx.rotate(-p.ang);
  }
  const q = clamp(p.q, -0.7, 0.8);
  ctx.scale(1 / (1 - q), 1 - q);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.restore();
}

// Camera: push into the ball on beats 3.45 -> 4.
function camera(t) {
  const p = prog(t, b(3.45), b(4));
  const z = Math.pow(38, E.inQuart(p));
  const pose = ballPose(t);
  const sx = 960, sy = lerp(pose.y, 540, E.inOutCubic(p));
  return { z, px: pose.x, py: pose.y, sx, sy, p };
}

function tag(ctx, t, t0, label, ax, ay, tx, ty) {
  const a = prog(t, t0, t0 + 0.28, E.outBack) * (1 - prog(t, t0 + 0.55, t0 + 0.75));
  if (a <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = clamp(a);
  ctx.font = mono(13, 600);
  ctx.letterSpacing = '2px';
  const w = ctx.measureText(label).width + 22;
  ctx.translate(ax, ay);
  ctx.scale(0.75 + 0.25 * a, 0.75 + 0.25 * a);
  // leader
  ctx.strokeStyle = rgba(PAL.paper, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 13);
  ctx.lineTo(tx - ax, ty - ay);
  ctx.stroke();
  ctx.fillStyle = PAL.paper;
  ctx.beginPath();
  ctx.arc(tx - ax, ty - ay, 3, 0, TAU);
  ctx.fill();
  // pill
  ctx.fillStyle = PAL.ink;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -14, w, 28, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PAL.paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 1, 1);
  ctx.restore();
}

function graph(ctx, t) {
  const L = 1250, T = 360, Wd = 520, Hd = 250, Bm = T + Hd;
  const a = prog(t, 0.12, 0.6, E.out);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = mono(12, 500);
  ctx.letterSpacing = '2px';
  ctx.fillStyle = rgba(PAL.paper, 0.55);
  ctx.fillText('VALUE GRAPH', L, T - 34);
  ctx.fillStyle = rgba(PAL.paper, 0.3);
  ctx.fillText('POSITION · Y', L + 150, T - 34);
  // beat grid
  ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const x = L + (k / 4) * Wd;
    ctx.strokeStyle = rgba(PAL.paper, k === 0 ? 0.3 : 0.1);
    ctx.beginPath();
    ctx.moveTo(x, T - 10);
    ctx.lineTo(x, T - 10 + (Hd + 10) * a);
    ctx.stroke();
    if (k < 4) {
      ctx.fillStyle = rgba(PAL.paper, 0.35);
      ctx.fillText(String(k + 1), x + 6, Bm + 24);
    }
  }
  ctx.strokeStyle = rgba(PAL.paper, 0.3);
  ctx.beginPath();
  ctx.moveTo(L, Bm);
  ctx.lineTo(L + Wd * a, Bm);
  ctx.stroke();
  // curve up to now
  const gx = (tt) => L + (tt / b(4)) * Wd;
  const gy = (tt) => Bm - clamp((REST - flight(tt).y) / 640) * (Hd - 6);
  const tEnd = Math.min(t, b(3.4));
  ctx.strokeStyle = PAL.paper;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let tt = 0; tt <= tEnd; tt += 1 / 240) {
    if (tt === 0) ctx.moveTo(gx(tt), gy(tt));
    else ctx.lineTo(gx(tt), gy(tt));
  }
  ctx.lineTo(gx(tEnd), gy(tEnd));
  ctx.stroke();
  // keyframes + bezier handles at contacts
  for (let n = 0; n < C.length; n++) {
    if (t < C[n]) continue;
    const k = prog(t, C[n], C[n] + 0.2, E.outBack);
    const x = gx(C[n]);
    ctx.save();
    ctx.translate(x, Bm);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PAL.orange;
    const s = 6 * k;
    ctx.fillRect(-s, -s, 2 * s, 2 * s);
    ctx.restore();
  }
  // apex handles of the big bounce
  if (t > b(1.5)) {
    const k = prog(t, b(1.5), b(1.5) + 0.25, E.out);
    const ax = gx(b(1.5) - 0.03), ay = gy(b(1.5) - 0.03);
    ctx.strokeStyle = rgba(PAL.paper, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax - 46 * k, ay);
    ctx.lineTo(ax + 46 * k, ay);
    ctx.stroke();
    ctx.fillStyle = PAL.ink;
    for (const d of [-46, 46]) {
      ctx.beginPath();
      ctx.arc(ax + d * k, ay, 4, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
  // playhead
  if (t < b(3.4)) {
    const x = gx(t);
    ctx.strokeStyle = rgba(PAL.orange, 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, T - 18);
    ctx.lineTo(x, Bm);
    ctx.stroke();
    ctx.fillStyle = PAL.orange;
    ctx.beginPath();
    ctx.arc(x, gy(t), 6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export default {
  render(ctx, t) {
    // background with a soft pool of light under the action
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(-200, -200, W + 400, H + 400);
    const cam = camera(t);
    ctx.save();
    ctx.translate(cam.sx, cam.sy);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.px, -cam.py);
    const glow = ctx.createRadialGradient(760, 700, 0, 760, 700, 900);
    glow.addColorStop(0, 'rgba(255,255,255,0.045)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-400, -200, 2800, 1600);
    const fade = 1 - prog(t, b(3.45), b(3.8));

    // ground line, drawn from the centre outward
    const gl = 1700 * prog(t, 0.04, 0.7, E.out);
    ctx.fillStyle = rgba(PAL.paper, 0.32 * fade);
    ctx.fillRect(760 - gl / 2 - 120, GROUND, gl + 240 * prog(t, 0.04, 0.7), 1.5);

    // contact rings, markers and frame labels
    for (let n = 0; n < C.length; n++) {
      const u = t - C[n];
      if (u < 0) continue;
      const strength = Math.pow(V[n] / V[0], 0.8);
      const rp = prog(u, 0, 0.55, E.out);
      if (rp < 1) {
        ctx.strokeStyle = rgba(PAL.paper, 0.55 * (1 - rp) * strength * fade);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(X[n], GROUND, 20 + 150 * rp * strength, (20 + 150 * rp * strength) * 0.18, 0, 0, TAU);
        ctx.stroke();
      }
      const k = prog(u, 0, 0.22, E.outBack);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(X[n], GROUND + 0.75);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = n === 0 ? PAL.orange : PAL.paper;
      ctx.fillRect(-5 * k, -5 * k, 10 * k, 10 * k);
      ctx.restore();
      if (n < 3) {
        ctx.save();
        ctx.globalAlpha = 0.5 * prog(u, 0.02, 0.2) * fade;
        ctx.font = mono(12, 500);
        ctx.letterSpacing = '1.5px';
        ctx.fillStyle = PAL.paper;
        ctx.textAlign = 'center';
        ctx.fillText(`F${Math.round(C[n] * 60)}`, X[n], GROUND + 34);
        ctx.restore();
      }
    }

    // dotted motion path
    ctx.fillStyle = rgba(PAL.paper, 0.3 * fade);
    let acc = 0, last = flight(0);
    const tEnd = Math.min(t, T_REST);
    for (let tt = 1 / 480; tt <= tEnd; tt += 1 / 480) {
      const p = flight(tt);
      acc += Math.hypot(p.x - last.x, p.y - last.y);
      last = p;
      if (acc >= 13) {
        acc = 0;
        ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
      }
    }

    // onion skins
    ctx.lineWidth = 1.6;
    for (let k = 6; k >= 1; k--) {
      const tk = t - k / 30;
      if (tk < 0.02 || tk > b(3.4)) continue;
      const p = ballPose(tk);
      if (Math.hypot(p.x - ballPose(t).x, p.y - ballPose(t).y) < 6) continue;
      drawBall(ctx, p);
      ctx.strokeStyle = rgba(PAL.paper, (0.42 - k * 0.055) * fade);
      ctx.stroke();
    }

    // the ball
    const pose = ballPose(t);
    drawBall(ctx, pose);
    ctx.fillStyle = PAL.orange;
    ctx.fill();

    // principle call-outs
    ctx.save();
    ctx.globalAlpha = fade;
    tag(ctx, t, C[0] - 0.02, 'SQUASH', X[0] - 120, GROUND - 120, X[0] - 30, GROUND - 22);
    const ps = ballPose(C[0] + 0.1);
    tag(ctx, t, C[0] + 0.07, 'STRETCH', ps.x + 130, ps.y - 40, ps.x + 22, ps.y - 10);
    const pa = flight(b(1.5));
    tag(ctx, t, b(1.38), 'ARCS', pa.x + 30, pa.y - 105, pa.x + 4, pa.y - 44);
    tag(ctx, t, b(2.45), 'TIMING', 900, GROUND - 190, 925, GROUND - 60);
    tag(ctx, t, b(3.05), 'ANTICIPATION', 1105, GROUND - 120, 990, GROUND - 40);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = fade;
    graph(ctx, t);
    ctx.restore();
    ctx.restore();
  },
};
