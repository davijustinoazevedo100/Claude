// 07 — DADOS. Every number on screen is real: the frame count of this film,
// the lines of code of each scene file and the loudness of the soundtrack,
// read back from the rendered WAV. Then everything folds into the baseline,
// the baseline into a dot, and shutters close to black.
import { PAL, font, FONT, FRAMES, DURATION, FPS } from '../config.js';
import { TAU, clamp, prog, ease, rgba, lerp, backOut } from '../core.js';
import { layoutText, drawGlyphs, clipRect } from '../gfx.js';
import { caption, label } from '../ui.js';
import { NP } from '../particles.js';

const BASE = 860, X0 = 120, X1 = 1800;
const OUT = 5.3;
let ENV_SMOOTH = null;

function odometer(ctx, value, x, y, size, color, lt, outP) {
  const str = Math.round(FRAMES).toLocaleString('pt-BR'); // "2.880"
  ctx.save();
  ctx.font = font(900, size, FONT.display);
  ctx.letterSpacing = '0px';
  let colW = 0;
  for (let d = 0; d <= 9; d++) colW = Math.max(colW, ctx.measureText(String(d)).width);
  const dotW = ctx.measureText('.').width;
  const lineH = size * 1.02;
  const digits = str.replace(/\D/g, '').length;
  let cx = x;
  let p = digits - 1;
  for (const ch of str) {
    if (ch === '.') {
      ctx.fillStyle = color;
      ctx.fillText('.', cx, y - outP * lineH);
      cx += dotW;
      continue;
    }
    // A real odometer: a wheel only turns while the wheel below it passes 9 -> 0.
    const unit = 10 ** p;
    const base = Math.floor(value / unit);
    const lower = value - base * unit;
    const shift = p === 0 ? lower : ease.inOutCubic(clamp((lower - unit * 0.9) / (unit * 0.1)));
    ctx.save();
    clipRect(ctx, cx - 4, y - size * 0.8, colW + 8, size * 0.9);
    ctx.fillStyle = color;
    const yy = y - shift * lineH - outP * lineH * (1 + (digits - p) * 0.15);
    ctx.textAlign = 'center';
    ctx.fillText(String(base % 10), cx + colW / 2, yy);
    ctx.fillText(String((base + 1) % 10), cx + colW / 2, yy + lineH);
    ctx.restore();
    cx += colW;
    p--;
  }
  ctx.restore();
  return cx - x;
}

export default {
  blur: 8,
  post: (lt) => ({ bloom: 0, vignette: 0.1 + 0.25 * prog(lt, 5.7, 6.0), grain: 0.07 }),

  init(env) {
    const raw = env.audio.env;
    const n = raw.length;
    ENV_SMOOTH = new Float32Array(n);
    const w = 9;
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -w; k <= w; k++) {
        const j = i + k;
        if (j < 0 || j >= n) continue;
        s += raw[j];
        c++;
      }
      ENV_SMOOTH[i] = s / c;
    }
    let mx = 1e-6;
    for (const v of ENV_SMOOTH) mx = Math.max(mx, v);
    for (let i = 0; i < n; i++) ENV_SMOOTH[i] /= mx;
  },

  draw(ctx, t, lt, env) {
    const ink = PAL.ink;
    env.fill(ctx, PAL.paper);
    const outBase = ease.inOutExpo(prog(lt, 5.58, 5.88));

    // ---------------------------------------------------------------- odometer
    const v = FRAMES * ease.outExpo(prog(lt, 0.15, 1.7));
    const oOut = ease.inExpo(prog(lt, OUT, OUT + 0.35));
    odometer(ctx, v, X0 - 6, 330, 210, ink, lt, oOut);
    label(ctx, 'FRAMES RENDERIZADOS — UM POR UM', X0, 395, lt, 0.4, { color: ink, size: 14, alpha: 0.75 * (1 - oOut) });

    // ---------------------------------------------------------------- stat chips
    const stats = [
      ['60', 'FPS'],
      [String(DURATION), 'SEGUNDOS'],
      [NP.toLocaleString('pt-BR'), 'PARTÍCULAS'],
      ['0', 'TEMPLATES'],
    ];
    let x = 1000;
    for (let i = 0; i < stats.length; i++) {
      if (i) x += Math.max(150, layoutText(ctx, stats[i - 1][0], 700, 76, -1).width + 64);
      const cw = 260;
      const pin = ease.outExpo(prog(lt, 1.2 + i * 0.08, 1.9 + i * 0.08));
      const pout = ease.inExpo(prog(lt, OUT + i * 0.03, OUT + 0.32 + i * 0.03));
      if (pin <= 0) continue;
      const L = layoutText(ctx, stats[i][0], 700, 76, -1);
      ctx.save();
      clipRect(ctx, x - 6, 190, cw, 86);
      drawGlyphs(ctx, L, x, 262 + (1 - pin) * 90 + pout * 90, i === 3 ? PAL.coral : ink);
      ctx.restore();
      label(ctx, stats[i][1], x, 298, lt, 1.3 + i * 0.08, { color: ink, size: 13, alpha: 0.7 * (1 - pout) });
      if (i > 0) {
        ctx.fillStyle = rgba(ink, 0.18 * pin * (1 - pout));
        ctx.fillRect(x - 24, 196, 1, 110 * pin);
      }
    }

    // ---------------------------------------------------------------- bars
    const scenes = env.code;
    const maxL = Math.max(...scenes.map((s) => s.lines));
    const bw = 66, gap = 34;
    const bx0 = 1012;
    label(ctx, 'LINHAS DE CÓDIGO POR CENA', bx0, 412, lt, 0.5, { color: ink, size: 14, alpha: 0.75 * (1 - prog(lt, OUT, OUT + 0.3)) });
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const x = bx0 + i * (bw + gap);
      const g = backOut(1.5)(prog(lt, 0.35 + i * 0.07, 1.05 + i * 0.07));
      const shrink = ease.inExpo(prog(lt, OUT + (scenes.length - i) * 0.025, OUT + 0.3 + (scenes.length - i) * 0.025));
      const h = (s.lines / maxL) * 380 * g * (1 - shrink);
      const hot = s.lines === maxL;
      if (h > 0.5) {
        ctx.fillStyle = hot ? PAL.coral : ink;
        ctx.fillRect(x, BASE - h, bw, h);
      }
      const shown = Math.round(s.lines * clamp(g));
      if (g > 0.02 && shrink < 0.9) {
        label(ctx, String(shown), x + bw / 2, BASE - h - 14, lt, 0.35 + i * 0.07, { color: hot ? PAL.coral : ink, size: 15, align: 'center', alpha: 0.9 * (1 - shrink), dur: 0.2, weight: 700 });
      }
      label(ctx, s.index, x + bw / 2, BASE + 30, lt, 0.45 + i * 0.05, { color: ink, size: 13, align: 'center', alpha: 0.6 * (1 - outBase) });
    }

    // ---------------------------------------------------------------- soundtrack
    const ax0 = X0, ax1 = 880, aTop = 520, aH = 300;
    const rev = ease.inOutCubic(prog(lt, 0.9, 2.1));
    const ret = ease.inOutCubic(prog(lt, OUT, OUT + 0.4));
    label(ctx, `TRILHA SONORA — ${DURATION} S — SINTETIZADA EM CÓDIGO`, ax0, aTop - 22, lt, 0.95, { color: ink, size: 14, alpha: 0.75 * (1 - ret) });
    const xr = lerp(ax0, ax1, rev * (1 - ret));
    if (xr > ax0 + 1) {
      const n = 300;
      const yAt = (u) => {
        const i = clamp(u * (ENV_SMOOTH.length - 1), 0, ENV_SMOOTH.length - 1);
        return BASE - ENV_SMOOTH[Math.floor(i)] * aH;
      };
      ctx.save();
      clipRect(ctx, ax0, aTop - 40, xr - ax0, BASE - aTop + 41);
      ctx.beginPath();
      ctx.moveTo(ax0, BASE);
      for (let k = 0; k <= n; k++) ctx.lineTo(lerp(ax0, ax1, k / n), yAt(k / n));
      ctx.lineTo(ax1, BASE);
      ctx.closePath();
      ctx.fillStyle = rgba(ink, 0.1);
      ctx.fill();
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const X = lerp(ax0, ax1, k / n), Y = yAt(k / n);
        if (k === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      // Scene boundaries as faint guides.
      ctx.fillStyle = rgba(ink, 0.12);
      for (const s of scenes) ctx.fillRect(lerp(ax0, ax1, s.start / DURATION), aTop, 1, BASE - aTop);
      ctx.restore();
      // You are here.
      const u = t / DURATION;
      const px = lerp(ax0, ax1, u);
      const here = prog(lt, 2.0, 2.4) * (1 - ret);
      if (here > 0 && px < xr) {
        const py = yAt(u);
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = rgba(PAL.coral, here);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, BASE);
        ctx.lineTo(px, aTop - 4);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = rgba(PAL.coral, here);
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, TAU);
        ctx.fill();
        label(ctx, 'VOCÊ ESTÁ AQUI', px + 12, aTop + 10, lt, 2.05, { color: PAL.coral, size: 12, alpha: here });
      }
    }

    // ---------------------------------------------------------------- baseline
    const half = ((X1 - X0) / 2) * (1 - outBase);
    const dotR = lerp(1, 18, ease.inOutCubic(prog(lt, 5.75, 6.0)));
    // Shutters close onto the baseline.
    const sh = ease.inOutExpo(prog(lt, 5.66, 5.98));
    if (sh > 0) {
      ctx.fillStyle = PAL.dark;
      ctx.fillRect(-200, -200, 2320, (BASE + 200) * sh);
      ctx.fillRect(-200, 1280 - (1280 - BASE) * sh, 2320, (1280 - BASE) * sh + 10);
    }
    if (half > dotR) {
      ctx.fillStyle = sh > 0.5 ? PAL.paper : ink;
      ctx.fillRect(960 - half, BASE - 1, half * 2, 2);
    } else {
      ctx.fillStyle = lt > 5.85 ? PAL.paper : ink;
      ctx.beginPath();
      ctx.arc(960, BASE, Math.max(dotR, 1.5), 0, TAU);
      ctx.fill();
    }

    caption(ctx, lt, { index: '07 — DADOS', phrase: 'dados viram história.', tIn: 0.6, tOut: OUT - 0.1, color: ink });
  },
};
