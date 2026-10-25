// 08 — ASSINATURA. The dot comes back (the film is a loop of one idea), hops
// to the centre and unwinds three orbit trails: a mark made of motion. It
// slides into a lockup with the wordmark, a light sweep passes on the hit,
// and at the end everything winds back into the dot, which blinks out.
import { PAL, font, FONT } from '../config.js';
import { TAU, clamp, prog, ease, rgba, lerp, spring, wobble, hash1, noise, rgbOf, rng } from '../core.js';
import { layoutText, drawGlyphs, clipRect, createCanvas } from '../gfx.js';

const START = { x: 960, y: 860 };
const MC = { x: 960, y: 520 };
const R_DOT = 18;
const ARCS = [
  { r: 64, w: 7, span: 1.3 * Math.PI, speed: 1.5, phase: -0.6, color: PAL.coral },
  { r: 93, w: 6, span: 0.95 * Math.PI, speed: -1.05, phase: 2.2, color: PAL.yellow },
  { r: 122, w: 5, span: 0.7 * Math.PI, speed: 0.72, phase: 4.1, color: '#6F86FF' },
];
const WORD = 'Claude';
const TAG = 'motion design — feito do zero, só com código.';

function lockup(ctx) {
  const Lw = layoutText(ctx, WORD, 600, 150, -3);
  const markW = 2 * (ARCS[2].r + 4);
  const gap = 72;
  const total = markW + gap + Lw.width;
  const left = 960 - total / 2;
  return { Lw, markX: left + markW / 2, wordX: left + markW + gap, base: MC.y + Lw.ascent / 2 };
}

function drawArc(ctx, cx, cy, a, r, start, span, width, alpha) {
  if (r <= 0.5 || span <= 0.01 || alpha <= 0) return;
  // Comet trail: thin, faint tail to a full-width head with a round cap.
  const n = Math.max(8, Math.ceil(span * 18));
  ctx.save();
  ctx.lineCap = 'butt';
  for (let k = 0; k < n; k++) {
    const u0 = k / n, u1 = (k + 1) / n;
    ctx.strokeStyle = rgba(a.color, alpha * u1 ** 1.6);
    ctx.lineWidth = width * (0.35 + 0.65 * u1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, start + span * u0, start + span * u1 + 0.004);
    ctx.stroke();
  }
  const hx = cx + Math.cos(start + span) * r, hy = cy + Math.sin(start + span) * r;
  ctx.fillStyle = rgba(a.color, alpha);
  ctx.beginPath();
  ctx.arc(hx, hy, width * 0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Opaque background plate with the warm glow baked in and dithered at full
// precision, so the falloff never shows 8-bit rings.
let GLOW = null;
function makeGlow() {
  const w = 2600, h = 1700;
  const c = createCanvas(w, h);
  const x = c.getContext('2d');
  const img = x.createImageData(w, h);
  const d = img.data;
  const bg = rgbOf(PAL.dark), co = rgbOf(PAL.coral);
  const rnd = rng(31);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const r = Math.hypot(i - w / 2, j - h / 2) / 680;
      let a = Math.max(0, 1 - r);
      a = 0.15 * a * a * (3 - 2 * a);
      const o = (j * w + i) * 4;
      for (let k = 0; k < 3; k++) d[o + k] = Math.round(bg[k] + (co[k] - bg[k]) * a + rnd() - 0.5);
      d[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

export default {
  init() {
    GLOW = makeGlow();
  },
  blur: 6,
  post: (lt) => ({ bloom: 0.34 + 0.5 * Math.exp(-Math.max(0, lt - 2) * 5) * (lt >= 2 ? 1 : 0), vignette: 0.4, grain: 0.065 }),

  draw(ctx, t, lt, env) {
    env.fill(ctx, PAL.dark);
    const loud = env.loud(t);
    const K = lockup(ctx);

    // Warm glow behind the mark and slow dust, both breathing with the music.
    const live = prog(lt, 0.6, 1.4) * (1 - prog(lt, 6.4, 7.2));
    if (live > 0) {
      const mx = lerp(MC.x, K.markX, ease.inOutExpo(prog(lt, 0.95, 1.55)) * (1 - ease.inOutExpo(prog(lt, 6.2, 6.7))));
      ctx.save();
      ctx.globalAlpha = live * (0.85 + 0.15 * loud);
      ctx.drawImage(GLOW, mx - GLOW.width / 2, MC.y - GLOW.height / 2);
      ctx.restore();
      for (let k = 0; k < 80; k++) {
        const sp = 12 + 30 * hash1(k * 5 + 1);
        const x = hash1(k * 5 + 2) * 1920 + 24 * Math.sin(lt * 0.6 + k);
        const y = (((hash1(k * 5 + 3) * 1180 - sp * lt) % 1180) + 1180) % 1180 - 50;
        const r = 0.8 + 2.4 * hash1(k * 5 + 4);
        ctx.fillStyle = rgba(PAL.paper, (0.05 + 0.2 * hash1(k * 5 + 9)) * live);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }

    // ---------------------------------------------------------------- dot path
    const fly = ease.outBack(prog(lt, 0.15, 0.58));
    const slide = ease.inOutExpo(prog(lt, 0.95, 1.55));
    const back = ease.inOutExpo(prog(lt, 6.2, 6.7));
    let cx = lerp(START.x, MC.x, clamp(fly));
    let cy = lerp(START.y, MC.y, fly);
    cx = lerp(cx, K.markX, slide * (1 - back));
    // Squash before the hop, stretch in flight, pop on arrival and on the hit.
    const h = 1 / 240;
    const vy = (lerp(START.y, MC.y, ease.outBack(prog(lt + h, 0.15, 0.58))) - lerp(START.y, MC.y, ease.outBack(prog(lt - h, 0.15, 0.58)))) / (2 * h);
    let sy = 1 + Math.min(Math.abs(vy) / 2600, 0.5);
    if (lt < 0.15) sy = 1 - 0.35 * ease.outCubic(prog(lt, 0, 0.14));
    sy -= 0.3 * wobble(lt - 0.58, 3, 7) * (lt >= 0.58 ? 1 : 0);
    const hit = lt >= 2.0 ? 0.12 * wobble(lt - 2.0, 2.6, 6) : 0;
    let scale = 1 + hit;
    // Ending: a breath in, then gone.
    if (lt > 7.0) scale *= lt < 7.12 ? lerp(1, 1.25, ease.outCubic(prog(lt, 7.0, 7.12))) : 1.25 * (1 - ease.inBack(prog(lt, 7.12, 7.38)));
    if (scale <= 0.001) return;

    // ---------------------------------------------------------------- orbit trails
    for (let i = 0; i < ARCS.length; i++) {
      const a = ARCS[i];
      const grow = spring(lt - 0.56 - i * 0.07, 1.5, 0.5);
      const shrink = ease.inOutCubic(prog(lt, 6.45 + (2 - i) * 0.06, 6.95 + (2 - i) * 0.06));
      const r = a.r * clamp(grow, 0, 1.4) * (1 - shrink) * scale;
      const span = a.span * ease.outCubic(prog(lt, 0.6 + i * 0.07, 1.4 + i * 0.07)) * (1 - shrink);
      const start = a.phase + a.speed * lt - span;
      drawArc(ctx, cx, cy, a, r, start, span, a.w * (1 + 0.35 * loud) * scale, 0.95);
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale((1 / Math.max(0.3, sy)) * scale, sy * scale);
    ctx.beginPath();
    ctx.arc(0, 0, R_DOT, 0, TAU);
    ctx.fillStyle = PAL.paper;
    ctx.fill();
    ctx.restore();

    // ---------------------------------------------------------------- wordmark
    const n = K.Lw.glyphs.length;
    const wIn = (i) => ease.outExpo(prog(lt, 1.12 + i * 0.045, 1.9 + i * 0.045));
    const wOut = (i) => ease.inExpo(prog(lt, 6.05 + (n - i) * 0.03, 6.4 + (n - i) * 0.03));
    if (lt > 1.1 && lt < 6.8) {
      const L = env.layer('s7-word');
      const lx = L.ctx;
      lx.save();
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.clearRect(0, 0, 1920, 1080);
      lx.save();
      clipRect(lx, K.wordX - 20, K.base - K.Lw.ascent - 60, K.Lw.width + 60, K.Lw.ascent + 110);
      drawGlyphs(lx, K.Lw, K.wordX, K.base, PAL.paper, (i) => ({ dy: (1 - wIn(i)) * 190 + wOut(i) * 190 }));
      lx.restore();
      // Light sweep on the hit, clipped to the letters.
      const sw = prog(lt, 2.0, 2.75);
      if (sw > 0 && sw < 1) {
        const x = lerp(K.wordX - 300, K.wordX + K.Lw.width + 300, ease.inOutCubic(sw));
        const g = lx.createLinearGradient(x - 160, 0, x + 160, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,214,170,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        lx.globalCompositeOperation = 'source-atop';
        lx.fillStyle = g;
        lx.fillRect(0, 0, 1920, 1080);
        lx.globalCompositeOperation = 'source-over';
      }
      lx.restore();
      ctx.drawImage(L.canvas, 0, 0);

      // Tagline, word by word.
      const words = TAG.split(' ');
      let x = K.wordX + 4;
      const ty = K.base + 74;
      for (let i = 0; i < words.length; i++) {
        const Lt = layoutText(ctx, words[i], 400, 32, 0);
        const p = ease.outExpo(prog(lt, 1.6 + i * 0.05, 2.3 + i * 0.05));
        const o = ease.inExpo(prog(lt, 5.95 + i * 0.02, 6.3 + i * 0.02));
        ctx.save();
        clipRect(ctx, x - 4, ty - 36, Lt.width + 12, 50);
        drawGlyphs(ctx, Lt, x, ty + (1 - p) * 48 + o * 48, i < 2 ? PAL.coral : rgba(PAL.paper, 0.72));
        ctx.restore();
        x += Lt.width + 9;
      }
    }
  },
};
