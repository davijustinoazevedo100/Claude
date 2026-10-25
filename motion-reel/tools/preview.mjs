// Render stills or a contact sheet for review.
//   node tools/preview.mjs --t 1.5            -> one full-res PNG
//   node tools/preview.mjs --range 0:4:0.25   -> contact sheet of that span
// Options: --cols 4 --scale 0.25 --noblur --nohud --out file.png
import fs from 'node:fs';
import { createEngine } from '../src/engine.js';
import { createCanvas } from '../src/gfx.js';
import { W, H, FPS } from '../src/config.js';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const flag = (k) => args.includes(`--${k}`);

let times = [];
if (opt('t')) times = opt('t').split(',').map(Number);
if (opt('range')) {
  const [a, b, s] = opt('range').split(':').map(Number);
  for (let t = a; t <= b + 1e-9; t += s) times.push(+t.toFixed(4));
}
if (!times.length) times = [0];

const engine = await createEngine();
const outPath = opt('out', `out/preview_${times[0]}${times.length > 1 ? '_sheet' : ''}.png`);
const t0 = performance.now();

if (times.length === 1) {
  const f = Math.round(times[0] * FPS);
  const L = engine.renderFrame(f, { blur: !flag('noblur'), overlay: !flag('nohud') });
  fs.writeFileSync(outPath, L.canvas.toBuffer('image/png'));
} else {
  const cols = +opt('cols', 4);
  const scale = +opt('scale', 0.25);
  const cw = Math.round(W * scale), ch = Math.round(H * scale);
  const rows = Math.ceil(times.length / cols);
  const gap = 6, labelH = 22;
  const sheet = createCanvas(cols * (cw + gap) + gap, rows * (ch + labelH + gap) + gap);
  const sx = sheet.getContext('2d');
  sx.fillStyle = '#222';
  sx.fillRect(0, 0, sheet.width, sheet.height);
  times.forEach((t, i) => {
    const f = Math.round(t * FPS);
    const L = engine.renderFrame(f, { blur: !flag('noblur'), overlay: !flag('nohud') });
    const x = gap + (i % cols) * (cw + gap);
    const y = gap + Math.floor(i / cols) * (ch + labelH + gap);
    sx.drawImage(L.canvas, x, y + labelH, cw, ch);
    sx.fillStyle = '#ddd';
    sx.font = '600 15px "DejaVu Sans Mono"';
    sx.fillText(`t=${t.toFixed(2)}s  f${f}`, x + 4, y + 16);
  });
  fs.writeFileSync(outPath, sheet.toBuffer('image/png'));
}
console.log(`wrote ${outPath} (${times.length} frame(s), ${((performance.now() - t0) / times.length).toFixed(0)} ms/frame)`);
