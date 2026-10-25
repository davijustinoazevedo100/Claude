// Frame compositor: picks the live scene, renders sub-frames for motion blur,
// runs the camera, the finishing passes and the overlay.
import fs from 'node:fs';
import { W, H, FPS, SHUTTER, SCENES, IMPACTS, DURATION } from './config.js';
import { noise, clamp } from './core.js';
import { registerFonts, makeLayer } from './gfx.js';
import { createPost } from './post.js';
import { createHud } from './hud.js';

const ROOT = new URL('../', import.meta.url);

// Loudness envelope of the soundtrack (60 values per second), so pictures can
// react to the music and the data scene can chart it.
function loadAudioEnvelope() {
  const file = new URL('out/soundtrack.wav', ROOT);
  const n = Math.ceil(DURATION * FPS);
  const env = new Float32Array(n);
  if (!fs.existsSync(file)) return { env, real: false };
  const buf = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p < buf.length - 8) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') data = { off: p + 8, size };
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) return { env, real: false };
  const frames = Math.floor(data.size / (2 * fmt.ch));
  const hop = fmt.rate / FPS;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * hop), b = Math.min(frames, Math.floor((i + 1) * hop));
    let s = 0;
    for (let k = a; k < b; k++) {
      for (let c = 0; c < fmt.ch; c++) {
        const v = buf.readInt16LE(data.off + (k * fmt.ch + c) * 2) / 32768;
        s += v * v;
      }
    }
    env[i] = b > a ? Math.sqrt(s / ((b - a) * fmt.ch)) : 0;
  }
  let mx = 1e-6;
  for (const v of env) mx = Math.max(mx, v);
  for (let i = 0; i < n; i++) env[i] /= mx;
  return { env, real: true };
}

function codeStats() {
  return SCENES.map((s) => {
    const src = fs.readFileSync(new URL(`src/scenes/${s.file}`, ROOT), 'utf8');
    return { ...s, lines: src.split('\n').filter((l) => l.trim().length > 0).length };
  });
}

export async function createEngine() {
  registerFonts();
  const scenes = [];
  for (const s of SCENES) {
    const mod = await import(`./scenes/${s.file}`);
    scenes.push({ ...mod.default, ...s });
  }
  const audio = loadAudioEnvelope();
  const layers = new Map();
  const env = {
    W, H, FPS,
    audio,
    loud: (t) => {
      const i = clamp(t * FPS, 0, audio.env.length - 1);
      const a = Math.floor(i);
      const b = Math.min(a + 1, audio.env.length - 1);
      return audio.env[a] + (audio.env[b] - audio.env[a]) * (i - a);
    },
    code: codeStats(),
    layer(name, w = W, h = H) {
      let L = layers.get(name);
      if (!L) {
        L = makeLayer(w, h);
        layers.set(name, L);
      }
      return L;
    },
    fill(ctx, color) {
      ctx.fillStyle = color;
      ctx.fillRect(-200, -200, W + 400, H + 400);
    },
  };
  for (const s of scenes) if (s.init) await s.init(env);

  const out = makeLayer(W, H);
  const sub = makeLayer(W, H);
  const post = createPost();
  const hud = createHud();

  const sceneAt = (t) => {
    for (const s of scenes) if (t >= s.start && t < s.end) return s;
    return scenes[scenes.length - 1];
  };

  // Camera shake + channel split driven by the impact list.
  function cameraAt(t) {
    let x = 0, y = 0, r = 0, ca = 0, zoom = 0;
    for (let i = 0; i < IMPACTS.length; i++) {
      const im = IMPACTS[i];
      const d = t - im.t;
      if (d < 0 || d > 1.5) continue;
      const e = Math.exp(-d * 6.5);
      x += im.amp * e * noise.n2(d * 26, i * 7.3);
      y += im.amp * e * noise.n2(d * 26 + 50, i * 7.3);
      r += im.amp * 0.0007 * e * noise.n2(d * 18 + 90, i * 7.3);
      zoom += im.amp * 0.0014 * Math.exp(-d * 9);
      ca += im.ca * Math.exp(-d * 8);
    }
    return { x, y, r, ca, zoom };
  }

  function drawScene(ctx, t) {
    const s = sceneAt(t);
    const cam = cameraAt(t);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(W / 2 + cam.x, H / 2 + cam.y);
    ctx.rotate(cam.r);
    ctx.scale(1 + cam.zoom, 1 + cam.zoom);
    ctx.translate(-W / 2, -H / 2);
    s.draw(ctx, t, t - s.start, env);
    ctx.restore();
  }

  function renderFrame(frame, { blur = true, overlay = true } = {}) {
    const t = frame / FPS;
    const s = sceneAt(t);
    const lt = t - s.start;
    let n = blur ? (typeof s.blur === 'function' ? s.blur(lt) : s.blur ?? 4) : 1;
    n = Math.max(1, Math.round(n));
    const o = out.ctx;
    if (n === 1) {
      drawScene(o, t);
    } else {
      // Hard cuts inside a scene must not smear: keep every sub-frame on the
      // same side of the cut as the frame itself.
      const cuts = (s.cuts || []).map((c) => c + s.start);
      for (let k = 0; k < n; k++) {
        let ts = clamp(t + ((k + 0.5) / n - 0.5) * (SHUTTER / FPS), 0, DURATION - 1e-4);
        for (const c of cuts) {
          if (t < c && ts >= c) ts = c - 1e-4;
          else if (t >= c && ts < c) ts = c;
        }
        drawScene(sub.ctx, ts);
        o.save();
        o.globalCompositeOperation = 'source-over';
        o.globalAlpha = 1 / (k + 1);
        o.drawImage(sub.canvas, 0, 0);
        o.restore();
      }
    }
    const fx = { bloom: 0, vignette: 0.22, grain: 0.07, ...(s.post ? s.post(lt, env) : {}) };
    post.bloom(o, out.canvas, fx.bloom);
    post.chromatic(o, out.canvas, cameraAt(t).ca + (fx.ca || 0));
    post.vignette(o, fx.vignette);
    if (overlay) hud.draw(o, t, frame);
    post.grain(o, frame, fx.grain);
    return out;
  }

  return { renderFrame, sceneAt, env, scenes };
}
