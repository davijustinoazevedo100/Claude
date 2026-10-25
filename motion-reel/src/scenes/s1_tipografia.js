// 02 — TIPOGRAFIA. The title builds itself with mask reveals and a block wipe,
// a type spec draws over it, then seven words cut on the beat, each with its
// own move. The last one is sliced into strips that slide off the frame.
import { PAL, font, FONT } from '../config.js';
import { TAU, clamp, prog, ease, rgba, lerp, hash1, backOut } from '../core.js';
import { layoutText, drawGlyphs, clipRect } from '../gfx.js';
import { label } from '../ui.js';

const SIZE = 300;
const TRACK = -6;
const Y1 = 520; // baseline of MOTION
const Y2 = 778; // baseline of DESIGN

// Beat words: start time (local), colours and the name of the move.
const WORDS = [
  { w: 'RITMO.', t: 2.5, bg: PAL.ink, fg: PAL.paper, dot: PAL.coral, move: 'punch', tag: 'SCALE PUNCH — EXPO OUT' },
  { w: 'FORMA.', t: 3.0, bg: PAL.coral, fg: PAL.ink, dot: PAL.paper, move: 'flip', tag: 'FLIP — BACK OUT, STAGGER 25MS' },
  { w: 'TEMPO.', t: 3.5, bg: PAL.paper, fg: PAL.ink, dot: PAL.coral, move: 'slide', tag: 'SLIDE — MOTION BLUR 180°' },
  { w: 'COR.', t: 4.0, bg: PAL.blue, fg: PAL.paper, dot: PAL.paper, move: 'color', tag: 'COLOR CYCLE — 30 HZ' },
  { w: 'PESO.', t: 4.5, bg: PAL.yellow, fg: PAL.ink, dot: PAL.ink, move: 'weight', tag: 'WEIGHT 100 → 900' },
  { w: 'ESPAÇO.', t: 5.0, bg: PAL.ink, fg: PAL.paper, dot: PAL.coral, move: 'track', tag: 'TRACKING −40 → +56' },
  { w: 'MOVIMENTO.', t: 5.5, bg: PAL.paper, fg: PAL.ink, dot: PAL.coral, move: 'wave', tag: 'SINE WAVE — DAMPED' },
];
const SLICE_T = 5.72;
const COLORS = [PAL.coral, PAL.yellow, PAL.mint, PAL.blue, PAL.paper, PAL.lilac];

function fitSize(ctx, str, extra = 0) {
  const L = layoutText(ctx, str, 900, 300, -12);
  return Math.min(300, (300 * 1480) / (L.width + extra));
}

function drawTitle(ctx, lt) {
  const ink = PAL.ink;
  const Lm = layoutText(ctx, 'MOTION', 900, SIZE, TRACK);
  const Ld = layoutText(ctx, 'DESIGN', 900, SIZE, TRACK);
  const xm = 960 - Lm.width / 2;
  const xd = 960 - Ld.width / 2;
  const cap = Lm.ascent;
  const exit = (i, base) => ease.inExpo(prog(lt, base + i * 0.02, base + 0.22 + i * 0.02));

  // MOTION: letters rise out of a mask, each settling from a slight tilt.
  ctx.save();
  clipRect(ctx, 0, Y1 - cap - 40, 1920, cap + 54);
  drawGlyphs(ctx, Lm, xm, Y1, ink, (i) => {
    const p = ease.outExpo(prog(lt, 0.04 + i * 0.045, 0.84 + i * 0.045));
    const o = exit(i, 2.16);
    return { dy: (1 - p) * (cap + 60) - o * (cap + 70), rot: (1 - p) * 0.16 };
  });
  ctx.restore();

  // DESIGN: an ink block wipes on, then off, uncovering the coral word.
  const bx = xd - 22, bw = Ld.width + 44, by = Y2 - cap - 22, bh = cap + 42;
  const grow = ease.inOutExpo(prog(lt, 0.34, 0.64));
  const shrink = ease.inOutExpo(prog(lt, 0.68, 0.98));
  if (lt >= 0.66) {
    ctx.save();
    clipRect(ctx, 0, Y2 - cap - 40, 1920, cap + 64);
    drawGlyphs(ctx, Ld, xd, Y2, PAL.coral, (i) => {
      const o = exit(5 - i, 2.16);
      return { dy: o * (cap + 80) };
    });
    ctx.restore();
  }
  if (grow > 0 && shrink < 1) {
    ctx.fillStyle = ink;
    ctx.fillRect(bx + bw * shrink, by, bw * (grow - shrink), bh);
  }

  // Type spec drawn over the title, like a construction sheet.
  const specIn = (d) => ease.outExpo(prog(lt, 1.0 + d, 1.5 + d));
  const specOut = 1 - prog(lt, 2.12, 2.3);
  if (specOut <= 0) return;
  ctx.save();
  ctx.globalAlpha = specOut;
  // Baselines.
  const bl = specIn(0);
  ctx.fillStyle = rgba(PAL.coral, 0.9);
  ctx.fillRect(xm - 60, Y1, (Lm.width + 120) * bl, 2);
  ctx.fillRect(xd - 60 + (Ld.width + 120) * (1 - bl), Y2, (Ld.width + 120) * bl, 2);
  label(ctx, 'BASELINE', xm + Lm.width + 60, Y1 + 26, lt, 1.15, { color: PAL.coral, size: 12, align: 'right' });
  label(ctx, 'BASELINE', xd - 60, Y2 + 26, lt, 1.2, { color: PAL.coral, size: 12 });
  // Cap-height dimension on the left of MOTION.
  const dp = specIn(0.08);
  const dx = xm - 70;
  ctx.strokeStyle = rgba(ink, 0.7);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(dx, Y1);
  ctx.lineTo(dx, Y1 - cap * dp);
  ctx.moveTo(dx - 8, Y1);
  ctx.lineTo(dx + 8, Y1);
  if (dp > 0.98) {
    ctx.moveTo(dx - 8, Y1 - cap);
    ctx.lineTo(dx + 8, Y1 - cap);
  }
  ctx.stroke();
  ctx.save();
  ctx.translate(dx - 16, Y1 - cap / 2);
  ctx.rotate(-Math.PI / 2);
  label(ctx, `CAP ${Math.round(cap)} PX`, 0, 0, lt, 1.2, { color: ink, size: 12, align: 'center', alpha: 0.75 });
  ctx.restore();
  // x-height / top line across MOTION.
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = rgba(ink, 0.35);
  ctx.beginPath();
  ctx.moveTo(xm - 60, Y1 - cap);
  ctx.lineTo(xm - 60 + (Lm.width + 120) * specIn(0.12), Y1 - cap);
  ctx.stroke();
  ctx.setLineDash([]);
  // Glyph boxes flash over a couple of letters.
  const gb = specIn(0.2);
  for (const i of [1, 4]) {
    const g = Lm.glyphs[i];
    ctx.strokeStyle = rgba(PAL.coral, 0.85 * gb);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(xm + g.x, Y1 - cap, g.w * gb, cap);
  }
  label(ctx, 'INTER DISPLAY BLACK — 300 PX — TRACKING −6', xm - 60, Y1 - cap - 32, lt, 1.05, { color: ink, size: 13, alpha: 0.7 });
  // Leading dimension on the right, baseline to baseline.
  const lp = specIn(0.16);
  const rx = Math.max(xm + Lm.width, xd + Ld.width) + 70;
  ctx.strokeStyle = rgba(ink, 0.7);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx, Y1);
  ctx.lineTo(rx, Y1 + (Y2 - Y1) * lp);
  ctx.moveTo(rx - 8, Y1);
  ctx.lineTo(rx + 8, Y1);
  if (lp > 0.98) {
    ctx.moveTo(rx - 8, Y2);
    ctx.lineTo(rx + 8, Y2);
  }
  ctx.stroke();
  ctx.save();
  ctx.translate(rx + 18, (Y1 + Y2) / 2);
  ctx.rotate(Math.PI / 2);
  label(ctx, `LEADING ${Y2 - Y1}`, 0, 0, lt, 1.3, { color: ink, size: 12, align: 'center', alpha: 0.75 });
  ctx.restore();
  ctx.restore();
}

function drawWord(ctx, W0, lt, env) {
  const tau = lt - W0.t;
  env.fill(ctx, W0.bg);
  const extra = W0.move === 'track' ? 7 * 56 : 0;
  const size = fitSize(ctx, W0.w, extra);
  const s = size / 300;
  const cap = 218 * s;
  const yb = 540 + cap / 2;

  if (W0.move === 'weight') {
    // Step through the nine weights of the family as if it were variable.
    const p = ease.outCubic(prog(tau, 0.02, 0.3));
    const weight = 100 + Math.round(p * 8) * 100;
    const L = layoutText(ctx, W0.w, weight, size, lerp(10, -12, p) * s);
    drawGlyphs(ctx, L, 960 - L.width / 2, yb, W0.fg, (i) => (i === L.glyphs.length - 1 ? { color: W0.dot } : null));
    return { yb, cap };
  }

  const track = W0.move === 'track' ? lerp(-40, 56, ease.outExpo(prog(tau, 0.0, 0.42))) * s : -12 * s;
  const L = layoutText(ctx, W0.w, 900, size, Math.round(track));
  const x0 = 960 - L.width / 2;
  const n = L.glyphs.length;

  ctx.save();
  if (W0.move === 'punch') {
    const k = 1 + 0.42 * (1 - ease.outExpo(prog(tau, 0, 0.38)));
    ctx.translate(960, 540);
    ctx.scale(k, k);
    ctx.rotate(-0.06 * (1 - ease.outExpo(prog(tau, 0, 0.3))));
    ctx.translate(-960, -540);
  }
  drawGlyphs(ctx, L, x0, yb, W0.fg, (i) => {
    const last = i === n - 1;
    const o = { color: last ? W0.dot : W0.fg };
    if (W0.move === 'flip') {
      const p = prog(tau, i * 0.025, 0.26 + i * 0.025);
      o.sy = backOut(2.2)(p);
      o.dy = -cap / 2 + (cap / 2) * o.sy;
      o.rot = (1 - ease.outCubic(p)) * (i % 2 ? 0.25 : -0.25);
      if (p <= 0) o.skip = true;
    } else if (W0.move === 'slide') {
      const p = ease.outExpo(prog(tau, i * 0.022, 0.3 + i * 0.022));
      o.dx = (1 - p) * 1100;
      o.alpha = clamp(p * 4);
    } else if (W0.move === 'color') {
      const p = prog(tau, i * 0.05, 0.22 + i * 0.05);
      o.sx = o.sy = backOut(2.4)(p);
      o.dy = -cap / 2 + (cap / 2) * o.sy;
      if (p <= 0) o.skip = true;
      if (!last) {
        const settled = [PAL.coral, PAL.yellow, PAL.mint][i % 3];
        o.color = tau < 0.3 ? COLORS[Math.floor(tau * 30 + i * 2) % COLORS.length] : settled;
      }
    } else if (W0.move === 'wave') {
      const A = 70 * s * Math.exp(-tau * 7) + (tau < 0.02 ? 0 : 0);
      o.dy = A * Math.sin(i * 0.85 - tau * 22);
      o.rot = 0.12 * Math.exp(-tau * 7) * Math.cos(i * 0.85 - tau * 22);
    }
    return o;
  });
  ctx.restore();
  return { yb, cap };
}

export default {
  cuts: WORDS.map((w) => w.t),
  blur: 8,
  post: (lt) => ({ bloom: 0, vignette: 0.1, grain: 0.07 }),

  draw(ctx, t, lt, env) {
    if (lt < WORDS[0].t) {
      env.fill(ctx, PAL.paper);
      drawTitle(ctx, lt);
      return;
    }
    let k = WORDS.length - 1;
    while (k > 0 && lt < WORDS[k].t) k--;
    const W0 = WORDS[k];

    if (lt < SLICE_T) {
      const { yb } = drawWord(ctx, W0, lt, env);
      label(ctx, W0.tag, 960, yb + 92, lt, W0.t + 0.04, { color: W0.fg, size: 14, align: 'center', alpha: 0.6, dur: 0.25 });
      return;
    }

    // Slice exit: paint the last word into a layer, then slide strips away
    // alternately left and right, uncovering the dark stage of the next scene.
    const L = env.layer('s1-slices');
    const lx = L.ctx;
    lx.save();
    lx.setTransform(1, 0, 0, 1, 0, 0);
    const { yb } = drawWord(lx, W0, lt, env);
    label(lx, W0.tag, 960, yb + 92, lt, W0.t + 0.04, { color: W0.fg, size: 14, align: 'center', alpha: 0.6, dur: 0.25 });
    lx.restore();
    env.fill(ctx, PAL.dark);
    const N = 9, sh = 1080 / N;
    for (let i = 0; i < N; i++) {
      const p = ease.inExpo(prog(lt, SLICE_T + i * 0.008, SLICE_T + 0.2 + i * 0.008));
      const dir = i % 2 ? 1 : -1;
      const dx = dir * p * 2000;
      ctx.drawImage(L.canvas, 0, i * sh, 1920, sh, dx, i * sh, 1920, sh);
      // A coral edge leads each strip for a little extra snap.
      if (p > 0.02 && p < 1) {
        ctx.fillStyle = PAL.coral;
        const ex = dir > 0 ? dx - 14 : dx + 1920;
        ctx.fillRect(ex, i * sh, 14, sh);
      }
    }
  },
};
