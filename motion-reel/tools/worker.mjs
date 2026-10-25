// Render frames [from, to) and pipe them raw into an intermediate x264 segment.
//   node tools/worker.mjs <from> <to> <out.mp4>
import { spawn } from 'node:child_process';
import { createEngine } from '../src/engine.js';
import { W, H, FPS } from '../src/config.js';

const [from, to] = process.argv.slice(2, 4).map(Number);
const out = process.argv[4];
const engine = await createEngine();

const ff = spawn(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '4', '-g', String(FPS * 2),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-threads', '2', out,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);
const done = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

const t0 = performance.now();
for (let f = from; f < to; f++) {
  const L = engine.renderFrame(f);
  const px = L.ctx.getImageData(0, 0, W, H).data;
  if (!ff.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength))) {
    await new Promise((r) => ff.stdin.once('drain', r));
  }
  if ((f - from) % 30 === 29 || f === to - 1) {
    process.stdout.write(`progress ${from} ${f + 1 - from} ${to - from} ${((performance.now() - t0) / (f + 1 - from)).toFixed(0)}\n`);
  }
}
ff.stdin.end();
await done;
