// 01 — PONTO. Everything starts with a dot: it pops in, gets a line of copy,
// bounces with squash & stretch on a springy floor, charges up and flies at
// the camera until it becomes the paper of the next scene.
import { PAL, font, FONT } from '../config.js';
import { TAU, clamp, prog, ease, wobble, rgba, lerp, hash1 } from '../core.js';
import { layoutText, drawGlyphs } from '../gfx.js';

const CX = 960;
const R = 18;
const FLOOR = 540 + R; // the dot rests centred on screen
const COPY = 'tudo começa com um ponto.';

// Flights: leave the floor at a, land at b, apex height h (h ~ flight time^2).
const JUMPS = [
  { a: 2.0, b: 2.5, h: 300 },
  { a: 2.5, b: 2.875, h: 169 },
  { a: 2.875, b: 3.125, h: 75 },
  { a: 3.125, b: 3.25, h: 19 },
];
const LANDINGS = JUMPS.map((j) => j.b);
const RELEASE = 3.55;

function flight(t) {
  for (const j of JUMPS) {
    if (t >= j.a && t < j.b) {
      const T = j.b - j.a;
      const u = (t - j.a) / T;
      return { h: 4 * j.h * u * (1 - u), v: (4 * j.h * (1 - 2 * u)) / T };
    }
  }
  return { h: 0, v: 0 };
}

// Impact speed at a landing (px/s), used to size the squash.
const impactSpeed = (j) => (4 * j.h) / (j.b - j.a);

// Vertical deformation: + stretches, - squashes.
function deform(t) {
  if (t < 1.75) return 0.28 * wobble(t - 0.4, 4.5, 6) * (t > 0.4 ? 1 : 0);
  if (t < 2.0) return -0.38 * ease.outCubic(prog(t, 1.75, 1.98));
  if (t >= JUMPS[3].b) {
    // Settle, then the long charge before release.
    const land = -0.14 * wobble(t - 3.25, 7, 12);
    const charge = -0.42 * ease.outCubic(prog(t, 3.3, 3.53));
    const rel = prog(t, RELEASE, RELEASE + 0.06);
    return lerp(Math.min(land, charge) + (t < 3.3 ? 0 : 0), 0.25, rel) * (1 - prog(t, RELEASE + 0.06, RELEASE + 0.2));
  }
  const { v } = flight(t);
  let d = Math.min(Math.abs(v) / 2600, 0.42);
  // Contact windows blend into a squash proportional to impact speed.
  const contacts = [{ c: 2.0, A: 0.38 }, ...JUMPS.map((j) => ({ c: j.b, A: clamp(impactSpeed(j) / 6000, 0.08, 0.42) }))];
  for (const { c, A } of contacts) {
    const w = Math.exp(-(((t - c) / 0.028) ** 2));
    d = lerp(d, -A, w);
  }
  return d;
}

// Floor spring: each landing kicks a damped dip into the line.
function floorDip(t) {
  let d = 0;
  for (const j of JUMPS) {
    if (t >= j.b) d += clamp(impactSpeed(j) / 2400, 0.1, 1) * 16 * wobble(t - j.b, 7, 9);
  }
  if (t >= 1.75 && t < 2.15) d += 9 * Math.sin(Math.PI * prog(t, 1.75, 2.15)) * (t < 2.0 ? ease.outCubic(prog(t, 1.75, 2.0)) : 1);
  if (t >= 3.3) d += 13 * ease.outCubic(prog(t, 3.3, 3.53)) * (t < RELEASE ? 1 : wobble(t - RELEASE, 8, 10));
  return d;
}

export default {
  blur: 5,
  post: (lt) => ({ bloom: 0.55 * (1 - prog(lt, 3.6, 3.85)), vignette: 0.32 - 0.22 * prog(lt, 3.7, 3.95), grain: 0.06 + 0.01 * prog(lt, 3.7, 3.95) }),

  draw(ctx, t, lt, env) {
    env.fill(ctx, PAL.dark);
    const paper = PAL.paper;

    // ---------------------------------------------------------------- floor
    const floorIn = ease.outExpo(prog(t, 1.6, 2.2));
    const floorOut = 1 - prog(t, RELEASE + 0.05, RELEASE + 0.3);
    if (floorIn > 0 && floorOut > 0) {
      const half = 420 * floorIn;
      const dip = floorDip(t);
      ctx.save();
      ctx.strokeStyle = rgba(paper, 0.22 * floorOut);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -half; x <= half; x += 6) {
        const y = FLOOR + dip * Math.exp(-((x / 70) ** 2));
        if (x === -half) ctx.moveTo(CX + x, y);
        else ctx.lineTo(CX + x, y);
      }
      ctx.stroke();
      // Tick marks at the ends of the floor, like a measuring rule.
      for (const s of [-1, 1]) {
        ctx.fillStyle = rgba(paper, 0.35 * floorOut);
        ctx.fillRect(CX + s * half - 1, FLOOR - 6, 2, 12);
      }
      ctx.restore();
      // Landing ripples: flat ellipses that run along the floor.
      for (const c of [...LANDINGS, RELEASE]) {
        const u = prog(t, c, c + 0.55);
        if (u <= 0 || u >= 1) continue;
        const rx = R + (c === RELEASE ? 380 : 150) * ease.outExpo(u);
        ctx.save();
        ctx.strokeStyle = rgba(paper, 0.4 * (1 - u) * floorOut);
        ctx.lineWidth = 2 * (1 - u) + 0.5;
        ctx.beginPath();
        ctx.ellipse(CX, FLOOR, rx, rx * 0.16, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ---------------------------------------------------------------- copy
    const L = layoutText(ctx, COPY, 300, 44, 0.5);
    const x0 = CX - L.width / 2;
    const typed = (i) => 0.62 + i * 0.022;
    drawGlyphs(ctx, L, x0, 668, paper, (i) => {
      const a = prog(t, typed(i), typed(i) + 0.08);
      const out = ease.inCubic(prog(t, 1.72 + i * 0.008, 1.95 + i * 0.008));
      if (a <= 0) return { skip: true };
      return { alpha: a * (1 - out) * 0.9, dy: (1 - ease.outCubic(a)) * 8 + out * 14 };
    });
    // Caret rides the end of the typed text and blinks once it is done.
    const shown = L.glyphs.filter((g, i) => t >= typed(i));
    if (t > 0.5 && t < 1.74) {
      const last = shown[shown.length - 1];
      const cx = last ? x0 + last.x + last.w + 6 : x0;
      const blink = t < 1.2 || Math.floor((t - 1.2) / 0.16) % 2 === 0;
      if (blink) {
        ctx.fillStyle = rgba(PAL.coral, 0.95);
        ctx.fillRect(cx, 668 - 36, 3, 44);
      }
    }

    // ---------------------------------------------------------------- dot
    const pop = ease.outBack(prog(t, 0.4, 0.72));
    if (pop <= 0) return;
    const { h } = flight(t);
    const d = deform(t);
    const sy = 1 + d;
    const sx = 1 / Math.max(0.2, sy);
    let cy = FLOOR - R - h;
    cy = Math.min(cy, FLOOR - R * sy);
    let cx = CX;
    // Charge: a fine tremor builds up before release.
    if (t > 3.3 && t < RELEASE) {
      const k = prog(t, 3.3, RELEASE);
      cx += (hash1(Math.floor(t * 240)) - 0.5) * 5 * k;
    }

    // Anticipation streaks converge on the dot while it charges.
    const sp = prog(t, 3.28, RELEASE + 0.02);
    if (sp > 0 && sp < 1) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + 0.2;
        const k = ease.inCubic(clamp(sp * 1.15 - (i % 3) * 0.06));
        const r1 = lerp(260, 34, k), r2 = lerp(330, 40, k);
        ctx.strokeStyle = rgba(paper, 0.55 * Math.sin(Math.PI * sp));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, FLOOR - R + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, FLOOR - R + Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Construction guides: a crosshair and the dot's coordinates.
    const gIn = ease.outExpo(prog(t, 0.45, 1.1));
    const gOut = 1 - ease.inOutCubic(prog(t, 1.55, 1.95));
    if (gIn > 0 && gOut > 0) {
      ctx.save();
      ctx.strokeStyle = rgba(paper, 0.13 * gOut);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(CX - 980 * gIn, 540); ctx.lineTo(CX + 980 * gIn, 540);
      ctx.moveTo(CX, 540 - 560 * gIn); ctx.lineTo(CX, 540 + 560 * gIn);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(paper, 0.4 * gOut);
      ctx.strokeRect(CX - 34, 540 - 34, 68, 68);
      ctx.font = font(500, 13, FONT.mono);
      ctx.letterSpacing = '2px';
      ctx.fillStyle = rgba(paper, 0.55 * gOut * clamp(gIn * 2 - 0.4));
      ctx.fillText('X 960  Y 540', CX + 46, 540 - 42);
      ctx.restore();
    }

    // Pop ring when the dot is born.
    const pr = prog(t, 0.4, 0.95);
    if (pr > 0 && pr < 1) {
      ctx.save();
      ctx.strokeStyle = rgba(paper, 0.6 * (1 - pr));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(CX, 540, R + 60 * ease.outExpo(pr), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Release: the dot flies at the lens (scale ~ 1 / distance).
    if (t >= RELEASE) {
      // Exponential growth reads as a steady dolly; the power curve makes it accelerate.
      const u = prog(t, RELEASE + 0.02, 3.94);
      const rr = R * pop * Math.exp(Math.log(1300 / R) * u ** 1.6);
      const y = lerp(FLOOR - R, 540, ease.inOutCubic(prog(t, RELEASE, RELEASE + 0.2)));
      ctx.save();
      ctx.translate(cx, y);
      ctx.scale(sx, sy);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.beginPath();
    ctx.arc(0, 0, R * pop, 0, TAU);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.restore();
  },
};
