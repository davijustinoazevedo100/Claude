// 02 — KINETIC TYPE: "I speak MOTION fluently."
// Variable-font choreography: Anybody's width + weight axes are animated per
// letter (springs, travelling waves), Instrument Serif italic for contrast,
// mask reveals, a marquee stack, a venetian-blind wipe, and the hero dot as
// the full stop.

import { W, H, PAL, b, BEAT } from '../timeline.js';
import { clamp, lerp, prog, E, TAU, rgba, spring, hash1, qt } from '../core.js';
import { anyWidth, setAny, measure, serifI, mono, scramble } from '../type.js';

const WORD = 'MOTION';
const SIZE = 300;
const WD_FINAL = 112;
let CAP = 210; // cap height, measured at init

// ----------------------------------------------------------- "I speak" / "fluently"

function maskLine(ctx, t, text, font, x0, base, tIn, stagger, dur, tOut = Infinity, outDir = -1) {
  const m = measure(ctx, font, text);
  const asc = m.asc, desc = m.desc;
  const drop = asc + desc + 40;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 60, base - asc - 14, m.w + 140, asc + desc + 28);
  ctx.clip();
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') continue;
    const xi = x0 + measure(ctx, font, text.slice(0, i)).w;
    const pin = prog(t, tIn + n * stagger, tIn + n * stagger + dur, E.out);
    const pout = Number.isFinite(tOut) ? prog(t, tOut + n * stagger * 0.6, tOut + n * stagger * 0.6 + 0.26, E.in) : 0;
    const y = base + drop * (1 - pin) + outDir * drop * pout;
    const rot = 0.12 * (1 - pin);
    ctx.save();
    ctx.translate(xi, y);
    ctx.rotate(rot);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    n++;
  }
  ctx.restore();
}

// ----------------------------------------------------------- MOTION

function letterState(t, i) {
  const d = Math.abs(i - 2.5) * 0.045;
  const sp = spring(t - b(5) - d, 2.3, 0.36);
  let wd = 50 + (WD_FINAL - 50) * sp;
  let wg = 900;
  let sy = clamp(spring(t - b(5) - d, 2.6, 0.45), 0, 1.25);
  let dy = 0;
  // travelling weight/width wave
  const env = Math.sin(Math.PI * prog(t, b(6), b(7.05)));
  if (env > 0) {
    const ph = TAU * ((t - b(6)) / (2 * BEAT)) * 2 - i * 0.95;
    const s = 0.5 + 0.5 * Math.sin(ph);
    wg = 900 - 640 * env * s;
    wd = WD_FINAL + 38 * env * s;
    dy = -46 * env * s;
  }
  return { wd: clamp(wd, 50, 150), wg, sy, dy };
}

function drawMotion(ctx, t, cx, cy, mode = 'fill', states = null) {
  const st = states || [...WORD].map((_, i) => letterState(t, i));
  const adv = st.map((s, i) => anyWidth(WORD[i], s.wg, SIZE, s.wd));
  const total = adv.reduce((a, c) => a + c, 0);
  let x = cx - total / 2;
  for (let i = 0; i < WORD.length; i++) {
    const s = st[i];
    if (s.sy <= 0.001) {
      x += adv[i];
      continue;
    }
    ctx.save();
    ctx.translate(x + adv[i] / 2, cy + s.dy);
    ctx.scale(1, s.sy);
    const sx = setAny(ctx, WORD[i], s.wg, SIZE, s.wd);
    ctx.translate(-adv[i] / 2, CAP / 2);
    ctx.scale(sx, 1);
    if (mode === 'fill') ctx.fillText(WORD[i], 0, 0);
    else ctx.strokeText(WORD[i], 0, 0);
    ctx.restore();
    x += adv[i];
  }
  return total;
}

function marqueeRow(ctx, cy, offset, wd) {
  const wgt = 900;
  const ww = anyWidth(WORD, wgt, SIZE, wd);
  const gap = 140;
  const unit = ww + gap;
  let x = ((offset % unit) + unit) % unit - unit * 2;
  const sx = setAny(ctx, WORD, wgt, SIZE, wd);
  while (x < W + unit) {
    ctx.save();
    ctx.translate(x, cy + CAP / 2);
    ctx.scale(sx, 1);
    ctx.strokeText(WORD, 0, 0);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x + ww + gap / 2, cy, 15, 0, TAU);
    ctx.fill();
    x += unit;
  }
}

// ----------------------------------------------------------- layout for "fluently."

const FL = { font: serifI(300), text: 'fluently' };
export const DOT = { x: 0, y: 0, r: 25 }; // resting position of the full stop (read by s3)
let FL_X0 = 0, FL_BASE = 0;

function dotPose(t) {
  // drop from above, land on b8.5, one small hop, settle
  const tA = b(8.1), tB = b(8.5), tC = b(8.75);
  const yRest = DOT.y;
  if (t < tA) return null;
  let y, q = 0;
  if (t < tB) {
    const u = (t - tA) / (tB - tA);
    y = lerp(-80, yRest, u * u);
  } else if (t < tC) {
    const u = (t - tB) / (tC - tB);
    y = yRest - 70 * 4 * u * (1 - u);
    q = 0.45 * Math.exp(-Math.pow((t - tB) / 0.03, 2));
  } else {
    y = yRest;
    q = 0.22 * Math.exp(-Math.pow((t - tC) / 0.028, 2)) + 0.05 * Math.exp(-(t - tC) * 10) * Math.sin((t - tC) * 40);
  }
  return { x: DOT.x, y: y + DOT.r * q, q };
}

export default {
  async init() {
    const m = measure(null, `900 100px AnyW${WD_FINAL}`, 'H');
    CAP = (m.asc * SIZE) / 100;
    const fm = measure(null, FL.font, FL.text);
    const xm = measure(null, FL.font, 'x');
    const total = fm.w + 14 + DOT.r * 2;
    FL_X0 = W / 2 - total / 2 - 10;
    FL_BASE = 540 + xm.asc / 2 + 10;
    DOT.x = FL_X0 + fm.w + 14 + DOT.r;
    DOT.y = FL_BASE - DOT.r;
  },

  render(ctx, t) {
    if (t < b(8)) {
      // ---------------- orange act
      ctx.fillStyle = PAL.orange;
      ctx.fillRect(-200, -200, W + 400, H + 400);

      // drop shockwave
      const sw = prog(t, b(4), b(4) + 0.55, E.out);
      if (sw < 1) {
        ctx.strokeStyle = rgba(PAL.ink, 1 - sw);
        ctx.lineWidth = 40 * (1 - sw);
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 60 + 1100 * sw, 0, TAU);
        ctx.stroke();
      }

      ctx.fillStyle = PAL.ink;
      ctx.strokeStyle = PAL.ink;

      // "I speak"
      const isFont = serifI(250);
      const im = measure(ctx, isFont, 'I speak');
      const up = prog(t, b(4.75), b(5.15), E.snap);
      const settle = 1 + 0.12 * (1 - prog(t, b(4), b(4) + 0.7, E.out));
      ctx.save();
      ctx.translate(W / 2, lerp(540, 300, up));
      ctx.scale(lerp(1, 0.52, up) * settle, lerp(1, 0.52, up) * settle);
      maskLine(ctx, t, 'I speak', isFont, -im.w / 2, im.asc / 2 - 8, b(4), 0.032, 0.5, b(6.45), -1);
      ctx.restore();

      // MOTION
      if (t >= b(5) - 0.01) {
        const recentre = prog(t, b(6.85), b(7.2), E.snap);
        const cy = lerp(612, 540, recentre);
        // stack rows
        if (t >= b(7)) {
          ctx.lineWidth = 3;
          const rowH = 255;
          for (const k of [-3, -2, -1, 1, 2, 3]) {
            const ek = prog(t, b(7) + 0.035 * Math.abs(k), b(7) + 0.42 + 0.035 * Math.abs(k), E.out);
            if (ek <= 0) continue;
            const dir = k % 2 ? -1 : 1;
            const off = dir * (160 * (t - b(7)) + 520 * prog(t, b(7.35), b(7.9), E.snap)) + k * 333;
            ctx.save();
            ctx.globalAlpha = clamp(ek * 1.4);
            marqueeRow(ctx, cy + k * rowH * ek, off, WD_FINAL - 6 * Math.abs(k));
            ctx.restore();
          }
        }
        drawMotion(ctx, t, W / 2, cy);

        // live variable-axis readout
        const ra = prog(t, b(5.6), b(5.9)) * (1 - prog(t, b(6.9), b(7.05)));
        if (ra > 0) {
          let wg = 0, wd = 0;
          for (let i = 0; i < 6; i++) {
            const s = letterState(qt(t), i);
            wg += s.wg / 6;
            wd += s.wd / 6;
          }
          ctx.save();
          ctx.globalAlpha = ra;
          ctx.font = mono(17, 600);
          ctx.letterSpacing = '3px';
          ctx.textAlign = 'center';
          ctx.fillText(`WGHT ${String(Math.round(wg)).padStart(3, '0')}   ·   WDTH ${wd.toFixed(1)}`, W / 2, cy + CAP / 2 + 92);
          ctx.restore();
        }
      }

      // venetian-blind wipe into the black act
      const bars = 9, bh = H / bars;
      ctx.fillStyle = PAL.ink;
      for (let j = 0; j < bars; j++) {
        const t0 = b(7.4) + j * 0.012;
        const p = prog(t, t0, t0 + 0.17, E.in);
        if (p <= 0) continue;
        const wbar = (W + 40) * p;
        if (j % 2 === 0) ctx.fillRect(W + 20 - wbar, j * bh - 1, wbar, bh + 2);
        else ctx.fillRect(-20, j * bh - 1, wbar, bh + 2);
      }
      return;
    }

    // ---------------- black act: "fluently."
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(-200, -200, W + 400, H + 400);
    const zoom = 1 + 0.035 * prog(t, b(8), b(9.75), E.outSine);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
    ctx.fillStyle = PAL.paper;

    if (t < b(9.25)) {
      maskLine(ctx, t, FL.text, FL.font, FL_X0, FL_BASE, b(8), 0.028, 0.45);
    } else {
      // letters fall away, one by one, with a little spin
      ctx.font = FL.font;
      ctx.textBaseline = 'alphabetic';
      for (let i = 0; i < FL.text.length; i++) {
        const xi = FL_X0 + measure(ctx, FL.font, FL.text.slice(0, i)).w;
        const u = Math.max(0, t - (b(9.25) + i * 0.028));
        const y = FL_BASE + 0.5 * 5200 * u * u - 140 * u;
        const r = (hash1(i * 7 + 3) - 0.5) * 5 * u;
        ctx.save();
        ctx.globalAlpha = 1 - prog(u, 0.12, 0.32);
        ctx.translate(xi + 40, y);
        ctx.rotate(r);
        ctx.fillText(FL.text[i], -40, 0);
        ctx.restore();
      }
    }

    // caption
    const ca = prog(t, b(8.7), b(9.0)) * (1 - prog(t, b(9.2), b(9.45)));
    if (ca > 0) {
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.font = mono(18, 500);
      ctx.letterSpacing = '4px';
      ctx.fillStyle = rgba(PAL.paper, 0.6);
      ctx.textAlign = 'center';
      ctx.fillText(scramble('— AT 60 FRAMES PER SECOND', prog(t, b(8.7), b(9.1)), 77, t), W / 2, FL_BASE + 120);
      ctx.restore();
    }

    // the full stop: our hero dot (s3 takes it over at b9.75)
    if (t < b(9.75)) {
      const d = dotPose(t);
      if (d) {
        ctx.fillStyle = PAL.orange;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.scale(1 / (1 - d.q), 1 - d.q);
        ctx.beginPath();
        ctx.arc(0, 0, DOT.r, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  },
};

export function dotZoom(t) {
  return 1 + 0.035 * prog(t, b(8), b(9.75), E.outSine);
}
