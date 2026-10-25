// 03 — TIMING. Five balls cross the same distance in the same 120 frames with
// five different curves. Each curve plots itself, tick marks record the
// spacing, the ticks turn into onion skins, and the balls arc into the
// centre where they melt together as metaballs and seed the next scene.
import { PAL, font, FONT } from '../config.js';
import { TAU, clamp, prog, ease, rgba, lerp, mix, mixHex, cubicBezier, spring, wobble, backOut } from '../core.js';
import { layoutText, drawGlyphs } from '../gfx.js';
import { label, indexTag } from '../ui.js';
import { drawMetaballs } from '../meta.js';

const PASS_A = 1.4, PASS = 2.0, PASS_B = PASS_A + PASS;
const X0 = 600, X1 = 1520, LEN = X1 - X0;
const ROW_Y = (k) => 250 + k * 130;
const BOX = { x: 120, w: 130, h: 80 };
const M = { x: 960, y: 540 };
const R_BALL = 16;
const R_FINAL = 200 / Math.sqrt(5); // five coincident balls -> radius 200

const ROWS = [
  { name: 'LINEAR', spec: 'f(t) = t', color: PAL.gray, f: ease.linear },
  { name: 'EASE IN-OUT', spec: 'cubic-bezier(.65,0,.35,1)', color: mixHex(PAL.blue, '#ffffff', 0.18), f: cubicBezier(0.65, 0, 0.35, 1) },
  { name: 'BACK OUT', spec: 'back.out(1.7)', color: PAL.coral, f: ease.outBack },
  { name: 'SPRING', spec: 'ζ 0.4 — 1.5 HZ', color: PAL.yellow, f: (p) => spring(p * PASS, 1.5, 0.4) },
  { name: 'BOUNCE OUT', spec: 'bounce.out', color: PAL.mint, f: ease.outBounce },
];
const TICKS = 40; // one every 3 frames

const passP = (lt) => prog(lt, PASS_A, PASS_B);
const ballX = (row, lt) => X0 + LEN * row.f(passP(lt));

function mergeState(k, lt) {
  const row = ROWS[k];
  const st = 4.45 + k * 0.06;
  const e = ease.inOutCubic(prog(lt, st, st + 0.75));
  const p0 = { x: X0 + LEN * row.f(1), y: ROW_Y(k) };
  const c = { x: (p0.x + M.x) / 2 + 60, y: Math.min(p0.y, M.y) - 170 };
  const u = 1 - e;
  return {
    e,
    x: u * u * p0.x + 2 * u * e * c.x + e * e * M.x,
    y: u * u * p0.y + 2 * u * e * c.y + e * e * M.y,
  };
}

export default {
  blur: (lt) => (lt > 4.4 ? 6 : 5),
  post: (lt) => ({ bloom: 0.25, vignette: 0.3, grain: 0.06 }),

  draw(ctx, t, lt, env) {
    env.fill(ctx, PAL.dark);
    const paper = PAL.paper;
    const out = ease.inOutCubic(prog(lt, 4.15, 4.6));

    // Graph-paper grid.
    const gA = 0.045 * ease.outCubic(prog(lt, 0.7, 1.4)) * (1 - prog(lt, 4.3, 4.9));
    if (gA > 0) {
      ctx.fillStyle = rgba(paper, gA);
      for (let x = 0; x <= 1920; x += 60) ctx.fillRect(x, 0, 1, 1080);
      for (let y = 0; y <= 1080; y += 60) ctx.fillRect(0, y, 1920, 1);
    }

    // Start and target guides.
    const gp = ease.outExpo(prog(lt, 0.95, 1.6)) * (1 - out);
    if (gp > 0) {
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(paper, 0.22 * gp);
      for (const x of [X0, X1]) {
        ctx.beginPath();
        ctx.moveTo(x, 196);
        ctx.lineTo(x, 196 + 620 * gp);
        ctx.stroke();
      }
      ctx.restore();
      label(ctx, 'INÍCIO', X0, 180, lt, 1.0, { color: paper, size: 12, align: 'center', alpha: 0.55 * (1 - out) });
      label(ctx, 'ALVO', X1, 180, lt, 1.05, { color: paper, size: 12, align: 'center', alpha: 0.55 * (1 - out) });
      label(ctx, 'MESMA DISTÂNCIA — MESMOS 120 FRAMES', X0, 140, lt, 1.1, { color: paper, size: 13, alpha: 0.7 * (1 - out) });
      const fr = Math.round(passP(lt) * 120);
      label(ctx, `FRAME ${String(fr).padStart(3, '0')} / 120`, X1 + 300, 140, lt, 1.15, { color: paper, size: 13, align: 'right', alpha: 0.7 * (1 - out) });
    }

    // ---------------------------------------------------------------- rows
    const pc = passP(lt);
    for (let k = 0; k < ROWS.length; k++) {
      const row = ROWS[k];
      const y = ROW_Y(k);
      const lp = ease.outExpo(prog(lt, 0.9 + k * 0.07, 1.6 + k * 0.07));
      const a = lp * (1 - out);
      if (a <= 0.002) continue;
      // Curve plot.
      const by1 = y + BOX.h / 2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = rgba(paper, 0.2);
      ctx.lineWidth = 1;
      ctx.strokeRect(BOX.x + 0.5, y - BOX.h / 2 + 0.5, BOX.w * lp, BOX.h);
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(BOX.x, y - BOX.h / 2);
      ctx.lineTo(BOX.x + BOX.w, y - BOX.h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (pc > 0) {
        ctx.strokeStyle = row.color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const n = Math.max(2, Math.ceil(pc * 90));
        for (let i = 0; i <= n; i++) {
          const p = (i / n) * pc;
          const X = BOX.x + p * BOX.w, Y = by1 - row.f(p) * BOX.h;
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        }
        ctx.stroke();
        ctx.fillStyle = row.color;
        ctx.beginPath();
        ctx.arc(BOX.x + pc * BOX.w, by1 - row.f(pc) * BOX.h, 4.5, 0, TAU);
        ctx.fill();
        // Playhead.
        ctx.fillStyle = rgba(paper, 0.25);
        ctx.fillRect(BOX.x + pc * BOX.w, y - BOX.h / 2, 1, BOX.h);
      }
      ctx.restore();
      label(ctx, row.name, 286, y - 4, lt, 1.0 + k * 0.07, { color: paper, size: 15, weight: 700, alpha: 0.92 * (1 - out) });
      label(ctx, row.spec, 286, y + 20, lt, 1.08 + k * 0.07, { color: paper, size: 12, alpha: 0.45 * (1 - out), tracking: 1 });
      label(ctx, row.f(pc).toFixed(2), X0 - 30, y + 5, lt, 1.2 + k * 0.07, { color: row.color, size: 13, align: 'right', alpha: 0.9 * (1 - out) });

      // Track: grows in from the start, retracts into the target on exit.
      ctx.fillStyle = rgba(paper, 0.16 * lp);
      const xs = lerp(X0, X1, out);
      ctx.fillRect(xs, y - 1, (X1 - xs) * lp, 2);

      // Spacing ticks, one per 3 frames, then onion skins of the same samples.
      const shown = lt >= PASS_A ? Math.min(TICKS, Math.floor(((lt - PASS_A) / PASS) * TICKS)) : -1;
      for (let j = 0; j <= shown; j++) {
        const x = X0 + LEN * row.f(j / TICKS);
        ctx.fillStyle = rgba(row.color, 0.75 * (1 - out));
        ctx.fillRect(x - 1, y - 8, 2, 16);
        const g = ease.outCubic(prog(lt, 3.5 + j * 0.008, 3.85 + j * 0.008));
        if (g > 0) {
          ctx.strokeStyle = rgba(row.color, 0.33 * g * (1 - out));
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(x, y, R_BALL * g, 0, TAU);
          ctx.stroke();
        }
      }
    }
    label(ctx, 'ONION SKIN — 1 AMOSTRA A CADA 3 FRAMES', X1, 860, lt, 3.55, { color: paper, size: 13, align: 'right', alpha: 0.7 * (1 - out) });

    // ---------------------------------------------------------------- caption
    const phrase = 'timing é tudo.';
    const L = layoutText(ctx, phrase, 600, 54, -1.08);
    const k0 = 2.9;
    const e = ease.inOutExpo(prog(lt, 0.8, 1.32));
    const k = lerp(k0, 1, e);
    const X = lerp(960 - (L.width * k0) / 2, 120, e);
    const Y = lerp(540 + (L.ascent * k0) / 2, 968, e);
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.rect(-20, -L.ascent * 1.4, L.width + 40, L.ascent * 1.85);
    ctx.clip();
    drawGlyphs(ctx, L, 0, 0, paper, (i) => {
      const p = ease.outExpo(prog(lt, 0.05 + i * 0.03, 0.8 + i * 0.03));
      const o = ease.inExpo(prog(lt, 4.9 + i * 0.02, 5.3 + i * 0.02));
      return { dy: (1 - p) * L.ascent * 1.5 - o * L.ascent * 1.5 };
    });
    ctx.restore();
    indexTag(ctx, lt, 1.3, 4.9, '03 — TIMING', paper, 120, 968 - 54 - 34);

    // ---------------------------------------------------------------- balls
    if (lt < 4.45) {
      for (let k2 = 0; k2 < ROWS.length; k2++) {
        const row = ROWS[k2];
        const pop = ease.outBack(prog(lt, 1.25 + k2 * 0.04, 1.6 + k2 * 0.04));
        if (pop <= 0) continue;
        const x = ballX(row, lt);
        const h = 1 / 240;
        const v = (ballX(row, lt + h) - ballX(row, lt - h)) / (2 * h);
        const sx = 1 + Math.min(Math.abs(v) / 5200, 0.32);
        ctx.save();
        ctx.translate(x, ROW_Y(k2));
        ctx.scale(sx, 1 / sx);
        ctx.beginPath();
        ctx.arc(0, 0, R_BALL * pop, 0, TAU);
        ctx.fillStyle = row.color;
        ctx.fill();
        ctx.restore();
      }
      return;
    }

    // Blue stage of the next scene opens from the blob.
    const rev = ease.inOutCubic(prog(lt, 5.55, 5.97));
    if (rev > 0) {
      ctx.beginPath();
      ctx.arc(M.x, M.y, 1150 * rev, 0, TAU);
      ctx.fillStyle = PAL.blue;
      ctx.fill();
    }

    // Merge: arcs into the centre, metaball bridges, jelly wobble, growth.
    const grow = backOut(1.3)(prog(lt, 5.58, 6.0));
    const toPaper = prog(lt, 5.15, 5.6);
    const balls = ROWS.map((row, k2) => {
      const s = mergeState(k2, lt);
      const r = lerp(R_BALL, 30, ease.inCubic(s.e));
      return { x: s.x, y: s.y, r: lerp(r, R_FINAL, grow), color: mix(row.color, PAL.paper, toPaper) };
    }).map((b) => ({ ...b, color: b.color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number) }));
    const wob = 0.17 * wobble(lt - 5.42, 2.6, 5.5) * (1 - prog(lt, 5.7, 6.0));
    const sx = 1 + wob;
    drawMetaballs(ctx, env, balls, { cx: M.x, cy: M.y, sx, sy: 1 / sx });
  },
};
