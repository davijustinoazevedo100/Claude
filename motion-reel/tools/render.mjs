// Full pipeline: synthesise the soundtrack, render every frame in parallel
// chunks, then encode the final H.264/AAC file.
//   node tools/render.mjs [--jobs 4] [--chunk 180] [--crf 17] [--skip-audio]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FRAMES, FPS, DURATION } from '../src/config.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const JOBS = Number(opt('jobs', Math.max(1, os.cpus().length)));
const CHUNK = Number(opt('chunk', 180));
const CRF = opt('crf', '17');
const OUT = path.join(ROOT, 'out');
const SEG = path.join(OUT, 'segments');
fs.mkdirSync(SEG, { recursive: true });
const wav = path.join(OUT, 'soundtrack.wav');

if (!args.includes('--skip-audio') || !fs.existsSync(wav)) {
  console.log('» synthesising soundtrack');
  const r = spawnSync('python3', [path.join(ROOT, 'audio/soundtrack.py'), wav], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}

const chunks = [];
for (let a = 0; a < FRAMES; a += CHUNK) chunks.push([a, Math.min(FRAMES, a + CHUNK)]);
const done = new Map();
let next = 0;
const t0 = Date.now();

function report() {
  const frames = [...done.values()].reduce((s, v) => s + v, 0);
  const el = (Date.now() - t0) / 1000;
  const eta = frames ? (el / frames) * (FRAMES - frames) : 0;
  process.stdout.write(`\r» rendering ${frames}/${FRAMES} frames  ${el.toFixed(0)}s elapsed  eta ${eta.toFixed(0)}s   `);
}

function runChunk([a, b]) {
  return new Promise((res, rej) => {
    const seg = path.join(SEG, `seg_${String(a).padStart(5, '0')}.mp4`);
    const p = spawn('node', [path.join(ROOT, 'tools/worker.mjs'), String(a), String(b), seg], { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        const m = line.match(/^progress (\d+) (\d+)/);
        if (m) {
          done.set(a, Number(m[2]));
          report();
        }
      }
    });
    p.on('exit', (c) => (c === 0 ? res(seg) : rej(new Error(`chunk ${a}-${b} failed (${c})`))));
  });
}

async function lane() {
  while (next < chunks.length) {
    const c = chunks[next++];
    await runChunk(c);
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, chunks.length) }, lane));
console.log(`\n» frames done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const list = path.join(SEG, 'list.txt');
fs.writeFileSync(list, chunks.map(([a]) => `file 'seg_${String(a).padStart(5, '0')}.mp4'`).join('\n') + '\n');
const final = path.join(OUT, 'motion-reel.mp4');
console.log('» encoding final file');
const enc = spawnSync(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error', '-stats',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-i', wav,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p',
    '-x264-params', 'aq-mode=3:aq-strength=0.9', '-g', String(FPS * 2),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-t', String(DURATION), '-movflags', '+faststart',
    final,
  ],
  { stdio: 'inherit' },
);
if (enc.status !== 0) process.exit(1);
const mb = fs.statSync(final).size / 1e6;
console.log(`» wrote ${path.relative(ROOT, final)} (${mb.toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(0)}s total`);
