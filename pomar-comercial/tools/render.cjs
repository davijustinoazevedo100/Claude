/* Frame-accurate renderer: drives index.html with window.__seek(t) in headless Chromium.

   node tools/render.cjs stills <out_dir> 1.5,4,9.2        -> PNG stills
   node tools/render.cjs video  <out.mp4> [fps=60] [workers=3] [from=0] [to=60]
   node tools/render.cjs cues   <cues.json>                 -> animation cue times for tools/music.py
*/
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.wav': 'audio/wav' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  // make sure every <image> is decoded before the first capture
  await page.evaluate(async () => {
    const hrefs = [...document.querySelectorAll('image')].map(i => i.getAttribute('href'));
    await Promise.all([...new Set(hrefs)].map(h => new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = h; })));
  });
  return page;
}

async function frame(page, t) {
  await page.evaluate(tt => window.__seek(tt), t);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}

async function stills(outDir, times) {
  fs.mkdirSync(outDir, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await openPage(browser, srv.address().port);
  for (const t of times.sort((a, b) => a - b)) {
    fs.writeFileSync(path.join(outDir, `t${t.toFixed(2).padStart(6, '0')}.png`), await frame(page, t));
  }
  await browser.close(); srv.close();
}

function encoder(file, fps) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation', '-pix_fmt', 'yuv420p',
    '-x264-params', `keyint=${fps * 2}:min-keyint=${fps}`, file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  return { ff, done };
}

async function video(out, fps = 60, workers = 3, from = 0, to = 60) {
  const srv = await serve();
  const port = srv.address().port;
  const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
  const total = f1 - f0, per = Math.ceil(total / workers);
  const tmp = out + '.parts';
  fs.mkdirSync(tmp, { recursive: true });
  const browser = await chromium.launch();
  const t0 = Date.now();
  let doneFrames = 0;
  const jobs = [...Array(workers).keys()].map(async w => {
    const a = f0 + w * per, b = Math.min(f1, a + per);
    const seg = path.join(tmp, `seg${w}.mp4`);
    if (a >= b) return null;
    const page = await openPage(browser, port);
    const { ff, done } = encoder(seg, fps);
    for (let i = a; i < b; i++) {
      const png = await frame(page, i / fps);
      if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
      if (++doneFrames % 120 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${doneFrames}/${total} frames  ${el.toFixed(0)}s  eta ${(el / doneFrames * (total - doneFrames)).toFixed(0)}s`);
      }
    }
    ff.stdin.end();
    await done;
    await page.close();
    return seg;
  });
  const segs = (await Promise.all(jobs)).filter(Boolean);
  await browser.close(); srv.close();
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.map(s => `file '${path.resolve(s)}'`).join('\n'));
  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' })
    .on('close', c => (c === 0 ? res() : rej(new Error('concat ' + c)))));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`video: ${out} (${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

async function cues(out) {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await openPage(browser, srv.address().port);
  fs.writeFileSync(out, JSON.stringify(await page.evaluate(() => window.__cues), null, 1));
  await browser.close(); srv.close();
}

(async () => {
  const [mode, out, ...rest] = process.argv.slice(2);
  if (mode === 'stills') await stills(out, rest[0].split(',').map(Number));
  else if (mode === 'cues') await cues(out);
  else if (mode === 'video') await video(out, ...rest.map(Number));
  else console.log('usage: render.cjs stills <dir> t1,t2 | video <out.mp4> [fps] [workers] [from] [to]');
})().catch(e => { console.error(e); process.exit(1); });
