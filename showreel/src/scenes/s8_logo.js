// 08 — HELLO
// The end card. The dot slams down on beat 28; the letters of the wordmark are
// squeezed out of it one by one (variable width springs from 150 to 100), the
// dot lands as the full stop, sparks fly, the subtitle decodes, and the dot
// does one last little bounce before the fade.

import { W, H, PAL, b } from '../timeline.js';
import { clamp, lerp, prog, E, TAU, rgba, spring, hash1 } from '../core.js';
import { anyWidth, setAny, measure, mono, scramble } from '../type.js';
import { CENTER_DOT_R } from './s7_recap.js';

const WORD = 'Claude';
const SIZE = 236, WG = 760, WD = 100;
const RF = 27; // final dot radius
const GAP = 16;
const R0 = CENTER_DOT_R * (W / 520); // dot radius handed over by the recap scene
let L = null;

function layout() {
  const cap = (measure(null, `${WG} 100px AnyW${WD}`, 'C').asc * SIZE) / 100;
  const adv = [...WORD].map((ch) => anyWidth(ch, WG, SIZE, WD));
  const total = adv.reduce((a, c) => a + c, 0) + GAP + 2 * RF;
  const x0 = W / 2 - total / 2;
  const base = 540 + cap / 2 - 42;
  const xs = [];
  let x = x0;
  for (const a of adv) {
    xs.push(x);
    x += a;
  }
  return { cap, adv, xs, x0, base, dotX: x + GAP + RF, dotY: base - RF };
}

function dotPose(t) {
  const p = prog(t, b(28), b(28) + 0.42, E.snap);
  let x = lerp(W / 2, L.dotX, p), y = lerp(H / 2, L.dotY, p);
  let r = lerp(R0, RF, p);
  // impact squash on the downbeat
  let q = 0.42 * Math.exp(-Math.pow((t - b(28)) / 0.05, 2)) * (t >= b(28) - 0.02 ? 1 : 0);
  // last little bounce on beat 30
  const hp = prog(t, b(30), b(30.5));
  if (hp > 0 && hp < 1) y -= 46 * 4 * hp * (1 - hp);
  q += 0.3 * Math.exp(-Math.pow((t - b(30)) / 0.03, 2)) + 0.3 * Math.exp(-Math.pow((t - b(30.5)) / 0.03, 2));
  q -= 0.12 * Math.sin(Math.PI * hp) * (hp > 0 && hp < 1 ? 1 : 0);
  return { x, y: y + r * q, r, q };
}

export default {
  init() {
    L = layout();
  },
  render(ctx, t) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(-200, -200, W + 400, H + 400);
    // soft spotlight
    const g = ctx.createRadialGradient(W / 2, 480, 0, W / 2, 480, 900);
    g.addColorStop(0, 'rgba(255,240,225,0.06)');
    g.addColorStop(1, 'rgba(255,240,225,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const drift = 1 + 0.03 * prog(t, b(28.5), 15, E.outSine);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(drift, drift);
    ctx.translate(-W / 2, -H / 2);

    // shockwave + sparks from the impact
    const sw = prog(t, b(28), b(28) + 0.6, E.out);
    if (sw > 0 && sw < 1) {
      ctx.strokeStyle = rgba(PAL.paper, 0.7 * (1 - sw));
      ctx.lineWidth = 6 * (1 - sw) + 0.5;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 50 + 900 * sw, 0, TAU);
      ctx.stroke();
    }
    const cols = [PAL.orange, PAL.pink, PAL.lime, PAL.blue, PAL.paper];
    const su = t - b(28);
    if (su > 0 && su < 0.9) {
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU + hash1(i) * 0.3;
        const v = 900 + 900 * hash1(i * 3 + 1);
        const d = (v / 5.5) * (1 - Math.exp(-5.5 * su));
        const r = (5 + 7 * hash1(i * 7 + 2)) * (1 - su / 0.9);
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.arc(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d + 160 * su * su, Math.max(0, r), 0, TAU);
        ctx.fill();
      }
    }

    // wordmark squeezed out of the dot, last letter first
    ctx.fillStyle = PAL.paper;
    for (let i = 0; i < WORD.length; i++) {
      const ti = b(28) + 0.02 + (WORD.length - 1 - i) * 0.04;
      const sp = spring(t - ti, 1.9, 0.5);
      if (sp <= 0.001) continue;
      const startX = lerp(W / 2, L.dotX, prog(ti, b(28), b(28) + 0.42, E.snap)) - L.adv[i] / 2;
      const x = lerp(startX, L.xs[i], sp);
      const wd = clamp(lerp(150, WD, sp), 50, 150);
      const wg = lerp(900, WG, clamp(sp));
      const s = clamp(lerp(0.15, 1, sp), 0, 1.15);
      const ch = WORD[i];
      const adv = anyWidth(ch, wg, SIZE, wd);
      const breathe = 1 + 0.012 * Math.sin((t - b(29)) * 3 + i * 0.8) * prog(t, b(29), b(30));
      ctx.save();
      ctx.translate(x + L.adv[i] / 2, L.base - L.cap / 2);
      ctx.scale(s * breathe, s);
      const sx = setAny(ctx, ch, wg, SIZE, wd);
      ctx.translate(-adv / 2, L.cap / 2);
      ctx.scale(sx, 1);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }

    // the full stop
    const d = dotPose(t);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(1 / (1 - d.q), 1 - d.q);
    ctx.fillStyle = PAL.orange;
    ctx.beginPath();
    ctx.arc(0, 0, d.r, 0, TAU);
    ctx.fill();
    ctx.restore();

    // subtitle lines
    const y1 = L.base + 112;
    ctx.textAlign = 'center';
    ctx.font = mono(25, 600);
    ctx.letterSpacing = '11px';
    ctx.fillStyle = rgba(PAL.paper, 0.92);
    ctx.fillText(scramble('MOTION DESIGNER', prog(t, b(28.55), b(29.35)), 5, t), W / 2 + 5, y1);
    ctx.font = mono(15, 500);
    ctx.letterSpacing = '4px';
    ctx.fillStyle = rgba(PAL.paper, 0.5);
    ctx.fillText(scramble('SHOWREEL 2026  ·  EVERY FRAME & SOUND WRITTEN IN CODE', prog(t, b(29.1), b(30.2)), 11, t), W / 2 + 2, y1 + 46);
    ctx.textAlign = 'left';

    // crop marks framing the lock-up
    const cm = prog(t, b(28.7), b(29.3), E.out);
    if (cm > 0) {
      const bx0 = L.x0 - 70, bx1 = L.dotX + RF + 70, by0 = L.base - L.cap - 70, by1 = y1 + 90;
      const len = 26 * cm;
      ctx.strokeStyle = rgba(PAL.paper, 0.4 * cm);
      ctx.lineWidth = 1.5;
      for (const [x, y, sx, sy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]]) {
        ctx.beginPath();
        ctx.moveTo(x, y + sy * len);
        ctx.lineTo(x, y);
        ctx.lineTo(x + sx * len, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};
