// Frame engine: scene compositing, camera shake, sub-frame motion blur, post.
import { W, H, FPS, DUR, b, BEAT, PAL, SCENES, SECTIONS } from './timeline.js';
import { clamp, E, prog, makeCanvas, noise3, rgba, smoothstep, lerp } from './core.js';
import { loadFonts, mono, scramble } from './type.js';
import { BlobGL } from './gl.js';
import s1 from './scenes/s1_bounce.js';
import s2 from './scenes/s2_type.js';
import s3 from './scenes/s3_grid.js';
import s4 from './scenes/s4_blobs.js';
import s5 from './scenes/s5_ui.js';
import s6 from './scenes/s6_particles.js';
import s7 from './scenes/s7_recap.js';
import s8 from './scenes/s8_logo.js';

const IMPL = { s1, s2, s3, s4, s5, s6, s7, s8 };
const params = new URLSearchParams(location.search);
export const SCALE = parseFloat(params.get('scale') || '1');
const SUB_OVERRIDE = params.has('sub') ? parseInt(params.get('sub'), 10) : 0;
const NO_HUD = params.has('nohud');

let out, octx, sub, sctx, tmp, tctx;
const env = { W, H, SCALE, gl: null, drawScene: null, mini: false, px: null };

export async function init() {
  await loadFonts();
  out = document.getElementById('out');
  out.width = Math.round(W * SCALE);
  out.height = Math.round(H * SCALE);
  octx = out.getContext('2d', { willReadFrequently: true });
  [sub, sctx] = makeCanvas(out.width, out.height);
  [tmp, tctx] = makeCanvas(out.width, out.height);
  env.gl = new BlobGL(out.width, out.height);
  env.px = { w: out.width, h: out.height };
  env.drawScene = drawSceneAt;
  for (const s of SCENES) if (IMPL[s.id].init) await IMPL[s.id].init(env);
}

// --------------------------------------------------------------- camera shake

const IMPACTS = [
  { t: b(1), a: 5, d: 0.18 },
  { t: b(4), a: 16, d: 0.32 },
  { t: b(5), a: 9, d: 0.25 },
  { t: b(8.5), a: 4, d: 0.18 },
  { t: b(14), a: 6, d: 0.3 },
  { t: b(25), a: 12, d: 0.3 },
  { t: b(28), a: 20, d: 0.45 },
];
function shake(t) {
  let x = 0, y = 0, r = 0;
  for (const im of IMPACTS) {
    const u = t - im.t;
    if (u < 0 || u > im.d) continue;
    const k = im.a * Math.pow(1 - u / im.d, 2.2);
    x += k * noise3(u * 38, 1.3, im.t);
    y += k * noise3(4.1, u * 38, im.t);
    r += k * 0.0009 * noise3(u * 30, 7.7, im.t);
  }
  return { x, y, r };
}

// Draw the composited scene stack for time t into ctx (logical 1920x1080 space).
export function drawSceneAt(ctx, t, opts = {}) {
  ctx.save();
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-200, -200, W + 400, H + 400);
  if (!opts.noShake) {
    const sh = shake(t);
    ctx.translate(W / 2 + sh.x, H / 2 + sh.y);
    ctx.rotate(sh.r);
    ctx.translate(-W / 2, -H / 2);
  }
  const only = opts.only;
  for (const s of SCENES) {
    if (only && s.id !== only) continue;
    if (t >= s.from && t < s.to) {
      ctx.save();
      IMPL[s.id].render(ctx, t, opts.env || env);
      ctx.restore();
    }
  }
  ctx.restore();
}

// --------------------------------------------------------------- motion blur

const FAST = [
  [b(3.5), b(4.08)],
  [b(7.4), b(8.06)],
  [b(9.7), b(10.4)],
  [b(13.4), b(14.02)],
  [b(21.9), b(22.6)],
  [b(24.3), b(25.15)],
  [b(26.9), b(28.15)],
];
export function subframesAt(t) {
  if (SUB_OVERRIDE) return SUB_OVERRIDE;
  if (t >= b(14) && t < b(18)) return 3; // raymarched 3D: expensive
  for (const [a, c] of FAST) if (t >= a && t < c) return 8;
  if (t > b(29)) return 3;
  return 5;
}

const SHUTTER = 0.5; // 180 degrees

export function renderFrame(i) {
  const t = i / FPS;
  const n = subframesAt(t);
  for (let k = 0; k < n; k++) {
    const tk = n === 1 ? t : t + ((k + 0.5) / n - 0.5) * (SHUTTER / FPS);
    sctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    drawSceneAt(sctx, Math.max(0, tk));
    octx.globalAlpha = 1 / (k + 1);
    octx.globalCompositeOperation = 'source-over';
    octx.drawImage(sub, 0, 0);
  }
  octx.globalAlpha = 1;
  post(octx, t, i);
  return out;
}

// --------------------------------------------------------------- post

function chromatic(ctx, t) {
  let amt = 0;
  for (const [at, a, d] of [[b(4), 1, 0.2], [b(14), 0.5, 0.18], [b(25), 1, 0.22], [b(28), 1.3, 0.3]]) {
    const u = t - at;
    if (u >= -0.02 && u < d) amt += a * Math.pow(1 - clamp(u / d), 2);
  }
  if (amt < 0.02) return;
  const px = amt * 9 * SCALE;
  const w = out.width, h = out.height;
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.globalCompositeOperation = 'source-over';
  tctx.drawImage(out, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  // Lateral CA: each channel scaled a little more from the centre (all >= 1 so
  // no channel ever uncovers the frame edge).
  const chans = [['#ff0000', 0], ['#00ff00', px], ['#0000ff', 2 * px]];
  for (const [col, dx] of chans) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    sctx.drawImage(tmp, 0, 0);
    sctx.globalCompositeOperation = 'multiply';
    sctx.fillStyle = col;
    sctx.fillRect(0, 0, w, h);
    sctx.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'lighter';
    const s = 1 + (2 * dx) / w;
    ctx.setTransform(s, 0, 0, s, (w - w * s) / 2, (h - h * s) / 2);
    ctx.drawImage(sub, 0, 0);
  }
  ctx.restore();
}

function vignette(ctx, t) {
  const v =
    t < b(4) ? 0.55 : t < b(8) ? 0.18 : t < b(10) ? 0.45 : t < b(14) ? 0.14 : t < b(18) ? 0 : t < b(22) ? 0.2 : 0.42;
  if (v <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${v})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function hudStyle(t) {
  if (t < b(4)) return [PAL.paper, 'source-over'];
  if (t < b(7.9)) return [PAL.ink, 'source-over'];
  if (t < b(9.95)) return [PAL.paper, 'source-over'];
  if (t < b(14)) return [PAL.paper, 'difference'];
  return [PAL.paper, 'source-over'];
}

function timecode(i) {
  const fr = i % FPS, s = Math.floor(i / FPS);
  const p = (n) => String(n).padStart(2, '0');
  return `00:00:${p(s)}:${p(fr)}`;
}

function hud(ctx, t, i) {
  if (NO_HUD) return;
  const vis = prog(t, 0.05, 0.5) * (1 - prog(t, b(24.6), b(25)));
  if (vis <= 0) return;
  const [col, blend] = hudStyle(t);
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha = 0.92 * Math.min(1, vis * 1.5);
  ctx.fillStyle = col;
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '3px';
  const pIn = prog(t, 0.05, 0.75);
  // top-left: wordmark
  ctx.font = mono(15, 700);
  ctx.textAlign = 'left';
  const tl = scramble('CLAUDE', pIn * 1.6, 3, t);
  ctx.fillText(tl, 60, 66);
  ctx.font = mono(15, 400);
  ctx.globalAlpha *= 0.7;
  ctx.fillText(scramble('MOTION REEL 2026', pIn, 9, t), 160, 66);
  ctx.globalAlpha /= 0.7;
  // top-right: section index with decode transition
  let sec = SECTIONS[0];
  for (const s of SECTIONS) if (t >= s.at) sec = s;
  const ps = prog(t, sec.at, sec.at + 0.32);
  ctx.textAlign = 'right';
  ctx.font = mono(15, 400);
  ctx.fillText(scramble(sec.label, ps * pIn, 21 + sec.at * 10, t), W - 60, 66);
  const lw = ctx.measureText(sec.label).width;
  ctx.font = mono(15, 700);
  ctx.fillText(`${sec.n}/08`, W - 60 - lw - 26, 66);
  // bottom-left: timecode
  ctx.textAlign = 'left';
  ctx.font = mono(15, 400);
  ctx.fillText(timecode(i), 60, H - 52);
  // bottom-right: metronome
  ctx.textAlign = 'right';
  ctx.fillText('128 BPM', W - 60, H - 52);
  const beat = Math.floor(t / BEAT + 1e-6) % 4;
  for (let k = 0; k < 4; k++) {
    const x = W - 60 - 120 - (3 - k) * 18, y = H - 57.5;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    if (k === beat) ctx.fill();
    else {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = col;
      ctx.stroke();
    }
  }
  // progress hairline
  ctx.globalAlpha *= 0.35;
  ctx.fillRect(60, H - 34, (W - 120), 1);
  ctx.globalAlpha /= 0.35;
  ctx.fillRect(60, H - 35, (W - 120) * (t / DUR), 3);
  ctx.restore();
}

function post(ctx, t, i) {
  chromatic(ctx, t);
  ctx.save();
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  vignette(ctx, t);
  hud(ctx, t, i);
  // closing fade to black
  const f = prog(t, b(31.15), DUR - 1 / FPS, E.inOutSine);
  if (f > 0) {
    ctx.fillStyle = `rgba(0,0,0,${f})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// --------------------------------------------------------------- API for the renderer / preview

export async function frameDataURL(i) {
  renderFrame(i);
  return out.toDataURL('image/png');
}

export async function stillDataURL(t) {
  const i = Math.round(t * FPS);
  return frameDataURL(i);
}

export function playRealtime(audioUrl) {
  const audio = audioUrl ? new Audio(audioUrl) : null;
  let t0 = performance.now();
  if (audio) audio.play().catch(() => {});
  const loop = () => {
    const t = audio && !audio.paused ? audio.currentTime : ((performance.now() - t0) / 1000) % DUR;
    const i = Math.floor(t * FPS);
    octx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    drawSceneAt(octx, t);
    post(octx, t, i);
    requestAnimationFrame(loop);
  };
  loop();
}
