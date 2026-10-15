#!/usr/bin/env node
// Offline renderer: drives headless Chromium frame-by-frame (deterministic time,
// sub-frame motion blur inside the page), writes a PNG sequence, then encodes.
//
//   node render.mjs frames  [--workers 3] [--from 0] [--to 900] [--scale 1] [--out build/frames] [--resume]
//   node render.mjs stills  --times 0.5,1.2,3 [--scale 0.5] [--out build/stills] [--sub 1]
//   node render.mjs encode  [--frames build/frames] [--audio audio/soundtrack.wav] [--out output/claude-motion-reel-2026.mp4]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FPS = 60;
const DUR = 15;

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const g = execSync('npm root -g').toString().trim();
    return await import(pathToFileURL(path.join(g, 'playwright', 'index.mjs')).href);
  }
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2',
  '.json': 'application/json', '.wav': 'audio/wav', '.png': 'image/png', '.mp3': 'audio/mpeg',
};
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(ROOT, p === '/' ? 'index.html' : p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openWorkers(n, scale, extra = '') {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'],
  });
  const srv = await serve();
  const port = srv.address().port;
  const pages = [];
  for (let k = 0; k < n; k++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') console.log(`[w${k}] ${m.text()}`);
    });
    page.on('pageerror', (e) => console.log(`[w${k}] pageerror ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/index.html?scale=${scale}${extra}`);
    await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 300000 });
    const err = await page.evaluate(() => window.__error);
    if (err) throw new Error(err);
    pages.push(page);
  }
  return { browser, srv, pages };
}

const grab = async (page, i) => {
  const url = await page.evaluate((i) => window.REEL.frameDataURL(i), i);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
};

async function renderFrames() {
  const workers = parseInt(opt('workers', '3'), 10);
  const from = parseInt(opt('from', '0'), 10);
  const to = parseInt(opt('to', String(FPS * DUR)), 10);
  const scale = opt('scale', '1');
  const out = path.resolve(ROOT, opt('out', 'build/frames'));
  const resume = !!opt('resume', false);
  fs.mkdirSync(out, { recursive: true });
  const todo = [];
  for (let i = from; i < to; i++) {
    const f = path.join(out, `f_${String(i).padStart(5, '0')}.png`);
    if (resume && fs.existsSync(f) && fs.statSync(f).size > 0) continue;
    todo.push(i);
  }
  console.log(`rendering ${todo.length} frames with ${workers} workers -> ${out}`);
  const t0 = Date.now();
  const { browser, srv, pages } = await openWorkers(workers, scale);
  console.log(`workers ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  let next = 0, done = 0;
  const t1 = Date.now();
  await Promise.all(
    pages.map(async (page) => {
      while (next < todo.length) {
        const i = todo[next++];
        const png = await grab(page, i);
        fs.writeFileSync(path.join(out, `f_${String(i).padStart(5, '0')}.png`), png);
        done++;
        if (done % 30 === 0 || done === todo.length) {
          const el = (Date.now() - t1) / 1000;
          console.log(`${done}/${todo.length}  ${el.toFixed(0)}s  eta ${((el / done) * (todo.length - done)).toFixed(0)}s`);
        }
      }
    }),
  );
  await browser.close();
  srv.close();
}

async function renderStills() {
  const times = String(opt('times', '0')).split(',').map(Number);
  const scale = opt('scale', '0.5');
  const out = path.resolve(ROOT, opt('out', 'build/stills'));
  const sub = opt('sub', null);
  const workers = Math.min(parseInt(opt('workers', '3'), 10), times.length);
  fs.mkdirSync(out, { recursive: true });
  const { browser, srv, pages } = await openWorkers(workers, scale, sub ? `&sub=${sub}` : '');
  let next = 0;
  await Promise.all(
    pages.map(async (page) => {
      while (next < times.length) {
        const t = times[next++];
        const i = Math.round(t * FPS);
        const png = await grab(page, i);
        fs.writeFileSync(path.join(out, `t_${t.toFixed(3)}.png`), png);
      }
    }),
  );
  await browser.close();
  srv.close();
  console.log(`wrote ${times.length} stills to ${out}`);
}

function encode() {
  const frames = path.resolve(ROOT, opt('frames', 'build/frames'));
  const audio = path.resolve(ROOT, opt('audio', 'audio/soundtrack.wav'));
  const out = path.resolve(ROOT, opt('out', 'output/claude-motion-reel-2026.mp4'));
  const grain = opt('grain', '5');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const a = [
    '-y', '-hide_banner', '-loglevel', 'error', '-nostats', '-framerate', String(FPS), '-i', path.join(frames, 'f_%05d.png'),
    ...(fs.existsSync(audio) ? ['-i', audio] : []),
    '-vf', `noise=c0s=${grain}:c0f=t+u,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-tune', 'animation',
    '-g', '60', '-movflags', '+faststart', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    ...(fs.existsSync(audio) ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
    out,
  ];
  console.log('ffmpeg ' + a.join(' '));
  const r = spawnSync('ffmpeg', a, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status);
}

if (cmd === 'frames') await renderFrames();
else if (cmd === 'stills') await renderStills();
else if (cmd === 'encode') encode();
else {
  console.log('usage: node render.mjs frames|stills|encode [options]');
  process.exit(1);
}
