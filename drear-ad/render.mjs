// Frame-exact renderer: drives src/index.html in headless Chromium and pipes PNG
// frames into ffmpeg.
//
//   node render.mjs video  output/film.mp4 [--fps 60] [--audio audio/soundtrack.wav] [--from 0 --to 60]
//   node render.mjs sheet  out.png t0 t1 count [--cols 6] [--scale 0.2]
//   node render.mjs stills outdir t1 t2 ...
//   node render.mjs cues   build/cues.json        (timeline shared with audio/soundtrack.py)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode, out, ...rest] = process.argv.slice(2);
const opt = (name, def) => { const i = rest.indexOf('--' + name); return i >= 0 ? rest[i + 1] : def; };
const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto('file://' + path.join(here, 'src', 'index.html'));
const info = await page.evaluate(() => window.ready);
const b64 = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');

if (mode === 'cues') {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(await page.evaluate(() => window.CUES), null, 1));
} else if (mode === 'stills') {
  mkdirSync(out, { recursive: true });
  for (const t of pos.map(Number)) {
    writeFileSync(path.join(out, `t_${t.toFixed(2)}.png`), b64(await page.evaluate((t) => window.frameData(t), t)));
  }
} else if (mode === 'sheet') {
  const [t0, t1, n] = pos.map(Number);
  const times = Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / Math.max(1, n - 1));
  const d = await page.evaluate(([ts, c, s]) => window.sheet(ts, c, s), [times, Number(opt('cols', 6)), Number(opt('scale', 0.2))]);
  writeFileSync(out, b64(d));
} else if (mode === 'video') {
  const fps = Number(opt('fps', 60));
  const from = Number(opt('from', 0)), to = Number(opt('to', info.DURATION));
  const audio = opt('audio', null);
  const frames = Math.round((to - from) * fps);
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-'];
  if (audio) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart');
  if (audio) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  args.push(out);
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const t = from + f / fps;
    const buf = b64(await page.evaluate((t) => window.frameData(t), t));
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % (fps * 5) === 0) console.log(`frame ${f}/${frames}  t=${t.toFixed(2)}s  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
  }
  ff.stdin.end();
  await done;
  console.log('wrote', out, `${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close();
