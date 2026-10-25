// 05 — PARTÍCULAS. The circle shatters into 6000 particles that ride a
// curl-noise flow field (its vectors drawn faintly underneath), then every
// particle finds its place in the word ORDEM. Particles are drawn as analytic
// motion streaks: a segment covering exactly the shutter interval.
import { PAL, SHUTTER, FPS } from '../config.js';
import { TAU, clamp, prog, ease, rgba, lerp, noise, hash1 } from '../core.js';
import { caption, label } from '../ui.js';
import { particleSystem, NP, posS4, colS4, curl, CENTER, drawStreaks } from '../particles.js';

let S = null;
export default {
  blur: 1,
  post: (lt) => ({ bloom: 0.55 + 0.5 * Math.exp(-lt * 5) + 0.3 * prog(lt, 5.55, 6.0), vignette: 0.35, grain: 0.06 }),

  init() {
    S = particleSystem();
  },

  draw(ctx, t, lt, env) {
    env.fill(ctx, PAL.dark);

    // Flow-field vectors, faint, only while the swarm is free.
    const fv = 0.11 * ease.outCubic(prog(lt, 0.25, 0.9)) * (1 - prog(lt, 2.2, 2.9));
    if (fv > 0) {
      const v = [0, 0];
      ctx.save();
      ctx.strokeStyle = rgba(PAL.paper, fv);
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let y = 30; y < 1080; y += 48) {
        for (let x = 30; x < 1920; x += 48) {
          curl(x, y, lt, v);
          const m = Math.hypot(v[0], v[1]) + 1e-9;
          const L = Math.min(18, (m / 0.004) * 14);
          ctx.moveTo(x - (v[0] / m) * L * 0.5, y - (v[1] / m) * L * 0.5);
          ctx.lineTo(x + (v[0] / m) * L * 0.5, y + (v[1] / m) * L * 0.5);
        }
      }
      ctx.stroke();
      // Arrow heads as dots on the leading end.
      ctx.fillStyle = rgba(PAL.paper, fv * 1.4);
      for (let y = 30; y < 1080; y += 48) {
        for (let x = 30; x < 1920; x += 48) {
          curl(x, y, lt, v);
          const m = Math.hypot(v[0], v[1]) + 1e-9;
          const L = Math.min(18, (m / 0.004) * 14);
          ctx.fillRect(x + (v[0] / m) * L * 0.5 - 1.2, y + (v[1] / m) * L * 0.5 - 1.2, 2.4, 2.4);
        }
      }
      ctx.restore();
    }

    // Shockwave + the solid disc dissolving into its particles.
    const sw = prog(lt, 0, 0.7);
    if (sw < 1) {
      ctx.save();
      ctx.strokeStyle = rgba(PAL.paper, 0.7 * (1 - sw) ** 2);
      ctx.lineWidth = 3 + 10 * (1 - sw);
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, 180 + 900 * ease.outExpo(sw), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    const disc = 1 - prog(lt, 0, 0.09);
    if (disc > 0) {
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, 180, 0, TAU);
      ctx.fillStyle = rgba(PAL.paper, disc);
      ctx.fill();
    }

    // Particles.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const holdBoost = 1 + 0.14 * prog(lt, 3.2, 4.0) + 0.2 * ease.inCubic(prog(lt, 5.55, 6.0));
    drawStreaks(
      ctx,
      NP,
      (i, dt, out) => posS4(S, i, Math.max(0, lt + dt), out),
      (i) => colS4(S, i, lt),
      (i) => S.size[i] * holdBoost,
      (i) => {
        const tw = prog(lt, 3.4, 4.0) * (1 - prog(lt, 5.5, 5.8));
        const free = 1 - prog(lt, 2.4, 3.4);
        return 0.95 - 0.2 * free - tw * 0.4 * (0.5 + 0.5 * Math.sin(lt * 7 + S.phase[i]));
      },
    );
    ctx.restore();

    caption(ctx, lt, { index: '05 — PARTÍCULAS', phrase: 'do caos à ordem.', tIn: 0.45, tOut: 5.25, color: PAL.paper });
    label(ctx, 'CAMPO DE FLUXO — ∇ × ψ(x, y, t)', 960, 96, lt, 0.5, { color: PAL.paper, size: 13, align: 'center', alpha: 0.7 * (1 - prog(lt, 2.2, 2.5)) });
    label(ctx, `${NP.toLocaleString('pt-BR')} PARTÍCULAS → 1 PALAVRA`, 960, 800, lt, 3.75, { color: PAL.paper, size: 14, align: 'center', alpha: 0.75 * (1 - prog(lt, 5.3, 5.55)) });
  },
};
