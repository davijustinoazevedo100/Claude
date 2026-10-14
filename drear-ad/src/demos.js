// "In use" sequences, shot like screen recordings — no people, no voice, only what is
// being done on screen: someone using Opium 5 (0:30–1:00) and someone using Drear
// (1:23.5–1:53.5). Same visual language as the rest of the film: white, hairlines,
// panels that grow from the corner, outline -> solid.
(function () {
  const F = window.FX;
  const C = {
    ink: '#000000', white: '#ffffff', panel: '#fbfbfb', line: '#dedede', guide: '#cacaca',
    sub: '#8a8a8a', soft: '#efefef', faint: '#e6e6e6', grid: '#d2d2d2',
  };
  const WIN = { x: 200, y: 110, w: 1520, h: 860, r: 14 };
  const BAR = 68;
  const { clamp01, lerp, seg, spring, blink } = F;
  let ctx, G, T, E;
  const D1 = {}, D2 = {};

  // ------------------------------------------------------------------ small utilities
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function font(size, face = 'UI', ls = 0) { ctx.font = `${size}px ${face}`; ctx.letterSpacing = `${ls}px`; }
  // text whose cap height is centred on cy
  function text(s, x, cy, size, o = {}) {
    font(size, o.face || 'UI', o.ls || 0);
    ctx.fillStyle = o.color || C.ink; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    const a0 = ctx.globalAlpha;
    if (o.alpha !== undefined) ctx.globalAlpha = a0 * clamp01(o.alpha);
    ctx.fillText(s, x, cy + 0.36 * size);
    ctx.globalAlpha = a0;
  }
  const width = (s, size, face = 'UI') => { font(size, face); return ctx.measureText(s).width; };
  function wrap(str, maxW, size, face = 'UI') {
    font(size, face);
    const lines = []; let cur = '';
    for (const w of str.split(' ')) {
      const tryS = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(tryS).width > maxW) { lines.push(cur); cur = w; } else cur = tryS;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  // words laid out once (stable line breaks), revealed one by one
  function layoutWords(str, maxW, size, face = 'UI') {
    const lines = wrap(str, maxW, size, face);
    font(size, face);
    const sp = ctx.measureText(' ').width, words = [];
    let wmax = 0;
    lines.forEach((ln, li) => {
      let x = 0;
      for (const w of ln.split(' ')) { words.push({ w, x, li }); x += ctx.measureText(w).width + sp; }
      wmax = Math.max(wmax, x - sp);
    });
    return { words, lines: lines.length, width: wmax, size, face };
  }
  function wordTimes(n, t0, seed, rate = 0.075) {
    const r = rng(seed); const out = []; let t = t0;
    for (let i = 0; i < n; i++) { out.push(t); t += rate * (0.6 + 0.8 * r()); }
    return out;
  }
  function drawWords(L, x, y, lh, t, times, color) {
    L.words.forEach((wd, i) => {
      if (t < times[i]) return;
      text(wd.w, x + wd.x, y + wd.li * lh, L.size, { face: L.face, color, alpha: (t - times[i]) / 0.16 });
    });
  }
  // human typing rhythm (seeded): returns the time of each keystroke
  function typeTimes(str, t0, seed, cps) {
    const r = rng(seed); const out = []; let t = t0;
    for (const ch of str) {
      out.push(t);
      let dt = (0.55 + 0.9 * r()) / cps;
      if (ch === ' ') dt *= 1.25;
      if (/[,.:;?!]/.test(ch)) dt += 0.17;
      t += dt;
    }
    return out;
  }
  const typedN = (times, t) => { let n = 0; while (n < times.length && times[n] <= t) n++; return n; };
  const last = (a) => a[a.length - 1];
  function caretVisible(t, tLast) { return t < tLast + 0.45 || Math.floor((t - tLast) / 0.5) % 2 === 1; }

  // ------------------------------------------------------------------ chrome
  const growF = (d) => 0.95 * E.ioExpo(seg(d, 0, 1.0)) + 0.05 * E.outCubic(seg(d, 0.75, 1.6));
  // app window growing from its bottom-left corner (content scales with it), collapsing to `to`
  function windowed(t, tIn, tOut, to, draw) {
    const g = growF(t - tIn), c = E.inBack(seg(t, tOut, tOut + 0.42), 1.5);
    if (g < 0.002 || c > 0.995) return;
    const ax = WIN.x, ay = WIN.y + WIN.h, s = g * (1 - c);
    ctx.save();
    ctx.translate(to.x, to.y); ctx.scale(1 - c, 1 - c); ctx.translate(-to.x, -to.y);
    ctx.translate(ax, ay); ctx.scale(g, g); ctx.translate(-ax, -ay);
    F.rr(WIN.x, WIN.y, WIN.w, WIN.h, WIN.r); ctx.fillStyle = C.white; ctx.fill();
    ctx.save(); F.rr(WIN.x, WIN.y, WIN.w, WIN.h, WIN.r); ctx.clip(); draw(); ctx.restore();
    F.rr(WIN.x, WIN.y, WIN.w, WIN.h, WIN.r); ctx.lineWidth = 2 / Math.max(0.04, s); ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.restore();
  }
  // a panel that grows from its own bottom-left corner (content scales), like the film's panels
  function growPanel(x, y, w, h, t, t0, draw, o = {}) {
    const g = o.g !== undefined ? o.g : growF(t - t0);
    if (g < 0.002) return;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= clamp01(o.alpha);
    const ax = x, ay = y + h;
    ctx.translate(ax, ay); ctx.scale(g, g); ctx.translate(-ax, -ay);
    F.rr(x, y, w, h, o.r || 8); ctx.fillStyle = o.fill || C.panel; ctx.fill();
    if (draw) { ctx.save(); F.rr(x, y, w, h, o.r || 8); ctx.clip(); draw(); ctx.restore(); }
    F.rr(x, y, w, h, o.r || 8); ctx.lineWidth = 2 / g; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.restore();
  }
  function hline(x0, x1, y, color = C.line, lw = 2) { ctx.fillStyle = color; ctx.fillRect(x0, y - lw / 2, x1 - x0, lw); }
  function pill(x, y, w, h, o = {}) {
    F.rr(x, y, w, h, o.r !== undefined ? o.r : h / 2);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { ctx.lineWidth = o.lw || 2; ctx.strokeStyle = o.stroke; ctx.stroke(); }
  }
  function polyline(pts, lw, color = C.ink) {
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.stroke();
  }
  const check = (x, y, s, color = C.ink, lw = 3) => polyline([[x - 0.42 * s, y + 0.02 * s], [x - 0.12 * s, y + 0.3 * s], [x + 0.45 * s, y - 0.3 * s]], lw, color);
  const chevron = (x, y, s) => polyline([[x - s, y - s * 0.5], [x, y + s * 0.5], [x + s, y - s * 0.5]], 2.4);
  function arrowUp(x, y, s, color) {
    polyline([[x, y + s * 0.55], [x, y - s * 0.55]], 3, color);
    polyline([[x - s * 0.45, y - s * 0.1], [x, y - s * 0.55], [x + s * 0.45, y - s * 0.1]], 3, color);
  }
  function spinner(x, y, r, t, lw = 2.5, color = C.ink) {
    const a = t * 7;
    ctx.beginPath(); ctx.arc(x, y, r, a, a + 4.2); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.stroke();
  }
  function plane(x, y, s, rot = -Math.PI / 4) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.fillStyle = C.ink;
    F.rr(-0.5, -0.075, 1.0, 0.15, 0.075); ctx.fill();
    for (const sg of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0.1, -0.05 * sg); ctx.lineTo(-0.16, -0.5 * sg); ctx.lineTo(-0.28, -0.5 * sg); ctx.lineTo(-0.16, -0.05 * sg); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.34, -0.05 * sg); ctx.lineTo(-0.44, -0.22 * sg); ctx.lineTo(-0.52, -0.22 * sg); ctx.lineTo(-0.47, -0.05 * sg); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function paperPlane(x, y, s, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-0.5, -0.42); ctx.lineTo(0.55, 0); ctx.lineTo(-0.5, 0.42); ctx.lineTo(-0.3, 0); ctx.closePath();
    ctx.fillStyle = C.ink; ctx.fill(); ctx.restore();
  }
  function eye(x, y, s) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.9, s, 0); ctx.quadraticCurveTo(0, s * 0.9, -s, 0); ctx.closePath();
    ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
    ctx.restore();
  }
  function sparkle(x, y, s, mode = 'fill') {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2, r = i % 2 ? s * 0.28 : s;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    if (mode === 'fill') { ctx.fillStyle = C.ink; ctx.fill(); }
    else { ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = C.sub; ctx.stroke(); ctx.setLineDash([]); }
  }

  // ------------------------------------------------------------------ cursor
  function cursorAt(keys, t) {
    if (!keys.length || t < keys[0].t - 0.3 || t > last(keys).t + 0.7) return null;
    let i = 0;
    while (i < keys.length - 1 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    let x = a.x, y = a.y;
    if (b !== a && t > a.t) {
      const p = E.ioCubic(seg(t, a.t, b.t));
      const dx = b.x - a.x, dy = b.y - a.y;
      const cx = (a.x + b.x) / 2 - dy * 0.14, cy = (a.y + b.y) / 2 + dx * 0.14;
      x = (1 - p) ** 2 * a.x + 2 * (1 - p) * p * cx + p * p * b.x;
      y = (1 - p) ** 2 * a.y + 2 * (1 - p) * p * cy + p * p * b.y;
    }
    let press = 0;
    for (const k of keys) if (k.click) press = Math.max(press, Math.sin(Math.PI * clamp01((t - k.t + 0.05) / 0.18)));
    const vis = lerp(a.vis ?? 1, b.vis ?? 1, b === a ? 0 : seg(t, a.t, b.t));
    const alpha = vis * clamp01((t - keys[0].t + 0.3) / 0.25) * (1 - clamp01((t - last(keys).t - 0.35) / 0.3));
    return { x, y, press, alpha };
  }
  function drawCursor(keys, t) {
    for (const k of keys) {
      if (!k.click || t < k.t || t > k.t + 0.5) continue;
      const p = (t - k.t) / 0.5;
      ctx.save(); ctx.globalAlpha = (1 - p) * 0.85;
      ctx.beginPath(); ctx.arc(k.x, k.y, 8 + 30 * E.outCubic(p), 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke(); ctx.restore();
    }
    const st = cursorAt(keys, t);
    if (!st || st.alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = st.alpha; ctx.translate(st.x, st.y);
    const s = 1.25 * (1 - 0.12 * st.press); ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, 22.5); ctx.lineTo(5.4, 17.6); ctx.lineTo(9.2, 26.2);
    ctx.lineTo(12.9, 24.6); ctx.lineTo(9.2, 16.2); ctx.lineTo(16.2, 16.2); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 2.8; ctx.strokeStyle = C.white; ctx.stroke();
    ctx.fillStyle = C.ink; ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ top bars
  function topBar(kind, t, alpha = 1) {
    ctx.save(); ctx.globalAlpha *= alpha;
    hline(WIN.x, WIN.x + WIN.w, WIN.y + BAR, C.line);
    const cy = WIN.y + BAR / 2;
    if (kind === 1) {
      F.shape(G.gravity, WIN.x + 46, cy, 30, 'fill');
      text(F.MODEL, WIN.x + 74, cy, 23, { face: 'UIM' });
      chevron(WIN.x + 74 + width(F.MODEL, 23, 'UIM') + 18, cy + 1, 5.5);
    } else {
      F.drear(WIN.x + 48, cy, 30, { blink: Math.max(blink(t, D2.t0 + 4.2), blink(t, D2.t0 + 17.3)) });
      text(F.PRODUCT, WIN.x + 76, cy, 23, { face: 'UIM' });
      const x = WIN.x + 76 + width(F.PRODUCT, 23, 'UIM') + 16;
      const w = 34 + width(F.MODEL, 17) + 16;
      pill(x, cy - 15, w, 30, { stroke: C.guide });
      F.shape(G.gravity, x + 20, cy, 17, 'fill');
      text(F.MODEL, x + 34, cy, 17, { color: '#555555' });
    }
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(WIN.x + WIN.w - 70 + i * 13, cy, 2.8, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill(); }
    ctx.restore();
  }

  // ================================================================== DEMO 1 — Opium 5
  const COLW = 620, INPUT_Y = 862, INPUT_H = 72;
  const CANVAS = { x: 920, y: 200, w: 760, h: 746 };
  const LENS = { x: 1290, y: 612 };

  function setup1() {
    const a = T.demo1;
    const d = D1;
    d.t0 = a; d.out = a + 29.3; d.to = { x: 960, y: 415 };
    d.p1 = 'How does gravity bend light? Draw it for me.';
    d.p2 = 'Now simulate it.';
    d.a1 = 'Mass curves spacetime. Light follows the curve, so a heavy object bends it like a lens.';
    d.a2 = 'Here it is: 24 light rays traced past the mass.';
    d.click1 = a + 2.3;
    d.type1 = typeTimes(d.p1, a + 2.45, 11, 12.5);
    d.send1 = last(d.type1) + 0.62;
    d.think1 = [d.send1 + 0.45, d.send1 + 1.65];
    d.ans1 = d.think1[1];
    d.slide = d.send1 + 1.9;
    d.canvasIn = d.send1 + 2.15;
    d.gridIn = d.canvasIn + 0.85;
    d.massIn = d.gridIn + 0.8;
    d.raysIn = d.massIn + 0.6;
    d.imagesIn = d.raysIn + 1.45;
    d.click2 = d.imagesIn + 2.3;
    d.type2 = typeTimes(d.p2, d.click2 + 0.15, 23, 11);
    d.send2 = last(d.type2) + 0.6;
    d.think2 = [d.send2 + 0.45, d.send2 + 1.25];
    d.ans2 = d.think2[1];
    d.codeTab = d.send2 + 1.4;
    d.code = [
      'import numpy as np',
      '',
      'G, M = 1.0, 40.0',
      'rays = launch(n=24, x=-1.0)',
      '',
      'for step in range(400):',
      '    r = lens - rays.pos',
      '    rays.vel += G * M * r / norm(r)**3 * dt',
      '    rays.pos += rays.vel * dt',
      '',
      'render(rays.trails, lens)',
    ];
    d.codeT = d.code.map((_, i) => d.codeTab + 0.25 + i * 0.3);
    d.run = last(d.codeT) + 1.0;
    d.sim = [d.run + 0.15, d.run + 4.6];
    d.ringIn = d.run + 4.0;
    // chat layout (positions are relative to the moving column)
    d.L1 = layoutWords(d.a1, COLW - 44, 23);
    d.L2 = layoutWords(d.a2, COLW - 44, 23);
    d.W1 = wordTimes(d.L1.words.length, d.ans1, 5, 0.07);
    d.W2 = wordTimes(d.L2.words.length, d.ans2, 6, 0.07);
    d.b1 = wrap(d.p1, 430, 23); d.b2 = wrap(d.p2, 430, 23);
    // cursor
    const colL = 260; // column x after the slide
    d.cur = [
      { t: a + 1.35, x: 1650, y: 1030 },
      { t: a + 2.2, x: 905, y: INPUT_Y + 37 },
      { t: d.click1, x: 905, y: INPUT_Y + 37, click: true },
      { t: last(d.type1) + 0.1, x: 912, y: INPUT_Y + 44 },
      { t: d.send1 - 0.1, x: 650 + COLW - 40, y: INPUT_Y + 36 },
      { t: d.send1, x: 650 + COLW - 40, y: INPUT_Y + 36, click: true },
      { t: d.send1 + 0.7, x: 1180, y: 1010, vis: 0 },
      { t: d.click2 - 0.75, x: 1180, y: 1010, vis: 0 },
      { t: d.click2 - 0.1, x: colL + 250, y: INPUT_Y + 37 },
      { t: d.click2, x: colL + 250, y: INPUT_Y + 37, click: true },
      { t: last(d.type2) + 0.1, x: colL + 262, y: INPUT_Y + 44 },
      { t: d.send2 - 0.1, x: colL + COLW - 40, y: INPUT_Y + 36 },
      { t: d.send2, x: colL + COLW - 40, y: INPUT_Y + 36, click: true },
      { t: d.run - 0.75, x: colL + COLW - 30, y: INPUT_Y - 40 },
      { t: d.run - 0.1, x: 1612, y: 230 },
      { t: d.run, x: 1612, y: 230, click: true },
      { t: d.run + 1.0, x: 1700, y: 300, vis: 0 },
    ];
    // precomputed simulation rays
    d.rays = [];
    for (let i = 0; i < 24; i++) {
      const y0 = LENS.y - 300 + (i + 0.5) * 25;
      let x = CANVAS.x + 30, y = y0, vx = 1, vy = 0;
      const pts = [[x, y]];
      let hit = false;
      for (let s = 0; s < 760 && x < CANVAS.x + CANVAS.w - 24; s++) {
        const rx = LENS.x - x, ry = LENS.y - y, r2 = rx * rx + ry * ry, r = Math.sqrt(r2);
        if (r < 32) { hit = true; break; }
        const k = 16 / (r2 * r);                       // deflection ~ 2k/b: gentle far away, strong close in
        vx += rx * k; vy += ry * k;
        const v = Math.hypot(vx, vy); vx /= v; vy /= v;
        x += vx; y += vy;
        if (s % 3 === 0) pts.push([x, y]);
      }
      pts.push([x, y]);
      d.rays.push({ pts, hit });
    }
    d.rayLen = Math.max(...d.rays.map((r) => r.pts.length));
    // sound cues
    T.keys.push(...d.type1, ...d.type2);
    T.clicks.push(...d.cur.filter((k) => k.click).map((k) => k.t));
    T.sends.push(d.send1, d.send2);
    T.pops.push(d.send1 + 0.08, d.send2 + 0.08, d.ans1, d.ans2);
    T.whooshes.push(a, d.slide, d.codeTab, d.out);
    T.draws.push(d.gridIn, d.raysIn, d.raysIn + 0.35, d.imagesIn);
    T.lines.push(...d.codeT.filter((_, i) => d.code[i]));
    T.thumps.push(d.massIn, d.run + 0.1);
    T.sim = d.sim; T.ringIn = d.ringIn;
    T.d1 = { send1: d.send1, send2: d.send2, canvasIn: d.canvasIn, codeTab: d.codeTab, run: d.run };
  }

  function colX(t) { return lerp(650, 260, E.ioQuart(seg(t, D1.slide, D1.slide + 0.75))); }

  function bubble(lines, x1, y, t, tIn, fromY) {
    if (t < tIn) return 0;
    const p = E.outQuart(seg(t, tIn, tIn + 0.45));
    font(23);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 44;
    const h = lines.length * 33 + 28;
    const yy = lerp(fromY, y, p);
    ctx.save(); ctx.globalAlpha *= clamp01(p * 2);
    pill(x1 - w, yy, w, h, { fill: C.ink, r: 22 });
    lines.forEach((l, i) => text(l, x1 - w + 22, yy + 14 + 16.5 + i * 33, 23, { color: C.white }));
    ctx.restore();
    return h;
  }
  function assistant(L, times, x, y, t, think, avatar = true) {
    if (t < think[0]) return;
    const thinking = t < think[1];
    // avatar: a tiny Gravity mark whose lobes orbit while thinking
    const k = 30, g = F.G.grav;
    const spin = thinking ? (t - think[0]) * 5 : 0;
    const settle = E.outCubic(seg(t, think[1], think[1] + 0.35));
    const lobes = [0, 1, 2, 3].map((i) => ({ a: -Math.PI / 2 + i * Math.PI / 2 + spin * (1 - settle), r: g.D }));
    F.gravityLive(x + 14, y + 12, k * spring(t - think[0], 2.5, 0.4), lobes, thinking ? 0 : settle);
    if (thinking) {
      const n = Math.floor((t - think[0]) / 0.3) % 4;
      text('Thinking' + '.'.repeat(n), x + 44, y + 12, 22, { color: C.sub, alpha: (t - think[0]) / 0.2 });
    } else drawWords(L, x + 44, y + 12, 34, t, times);
  }

  function inputBox(x, t, d) {
    pill(x, INPUT_Y, COLW, INPUT_H, { fill: C.white, stroke: C.ink });
    const cy = INPUT_Y + INPUT_H / 2;
    // which prompt is being typed / waiting
    let str = '', times = null, tSend = 0;
    if (t < d.send1) { times = d.type1; str = d.p1; tSend = d.send1; }
    else if (t >= d.click2 - 0.05 && t < d.send2) { times = d.type2; str = d.p2; tSend = d.send2; }
    const n = times ? typedN(times, t) : 0;
    if (n === 0) text(`Ask ${F.MODEL}`, x + 30, cy, 22, { color: C.sub });
    else text(str.slice(0, n), x + 30, cy, 22);
    const focused = (t >= d.click1 && t < d.send1) || (t >= d.click2 && t < d.send2);
    if (focused) {
      const tl = n ? times[n - 1] : (t < d.send1 ? d.click1 : d.click2);
      if (caretVisible(t, tl)) {
        const cxp = x + 30 + (n ? width(str.slice(0, n), 22) + 2 : 0);
        ctx.fillStyle = C.ink; ctx.fillRect(cxp, cy - 14, 2, 28);
      }
    }
    // send button
    const bx = x + COLW - 40, active = n > 0;
    const press = Math.max(Math.sin(Math.PI * seg(t, d.send1 - 0.02, d.send1 + 0.16)), Math.sin(Math.PI * seg(t, d.send2 - 0.02, d.send2 + 0.16)));
    ctx.beginPath(); ctx.arc(bx, cy, 24 * (1 - 0.1 * press), 0, Math.PI * 2);
    ctx.fillStyle = active ? C.ink : '#d6d6d6'; ctx.fill();
    arrowUp(bx, cy, 16, C.white);
  }

  function canvasHeader(t, d) {
    const x = CANVAS.x, y = CANVAS.y;
    text('Gravitational lensing', x + 28, y + 30, 21, { face: 'UIM' });
    const tabs = ['Diagram', 'Code', 'Run'];
    const ws = tabs.map((s) => width(s, 18) + 30);
    let xs = [], cx = x + CANVAS.w - 20;
    for (let i = tabs.length - 1; i >= 0; i--) { cx -= ws[i]; xs[i] = cx; cx -= 6; }
    const active = t >= d.run ? 2 : t >= d.codeTab ? 1 : 0;
    const from = t >= d.run ? 1 : 0, tt = t >= d.run ? d.run : d.codeTab;
    const p = E.ioCubic(seg(t, tt, tt + 0.35));
    const px = active ? lerp(xs[from], xs[active], p) : xs[0], pw = active ? lerp(ws[from], ws[active], p) : ws[0];
    pill(px, y + 14, pw, 34, { fill: C.ink });
    tabs.forEach((s, i) => text(s, xs[i] + 15, y + 31, 18, { color: i === active && p > 0.5 ? C.white : i === 0 && active === 0 ? C.white : C.sub }));
    hline(x, x + CANVAS.w, y + 60, C.line);
  }

  function warp(px, py, amt) {
    const dx = LENS.x - px, dy = LENS.y - py, r2 = dx * dx + dy * dy;
    const f = 0.46 * amt * Math.exp(-r2 / (2 * 140 * 140));
    return [px + dx * f, py + dy * f];
  }
  function warpedGrid(t, tIn, amt, color, alphaAll = 1) {
    ctx.save(); ctx.lineWidth = 1.6; ctx.strokeStyle = color;
    const x0 = CANVAS.x + 30, x1 = CANVAS.x + CANVAS.w - 30, y0 = CANVAS.y + 80, y1 = CANVAS.y + CANVAS.h - 24;
    const lines = [];
    for (let x = LENS.x - 50 * 7; x <= x1; x += 50) if (x >= x0) lines.push(['v', x]);
    for (let y = LENS.y - 50 * 6; y <= y1; y += 50) if (y >= y0) lines.push(['h', y]);
    for (const [kind, v] of lines) {
      const dist = kind === 'v' ? Math.abs(v - LENS.x) : Math.abs(v - LENS.y);
      const a = clamp01((t - tIn - dist / 900) / 0.35) * alphaAll;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const u = i / 60;
        const [px, py] = kind === 'v' ? warp(v, lerp(y0, y1, u), amt) : warp(lerp(x0, x1, u), v, amt);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function bez(p0, p1, p2, p3, u) {
    const v = 1 - u;
    return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
      v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
  }
  function diagram(t, d, alpha) {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    const amt = E.outCubic(seg(t, d.massIn, d.massIn + 0.9));
    warpedGrid(t, d.gridIn, amt, C.grid);
    const S = [CANVAS.x + 70, LENS.y], O = [CANVAS.x + CANVAS.w - 70, LENS.y];
    // the mass
    const m = spring(t - d.massIn, 2.2, 0.35);
    if (m > 0) { ctx.beginPath(); ctx.arc(LENS.x, LENS.y, 30 * m, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill(); }
    // source and observer
    const sa = E.outBack(seg(t, d.raysIn - 0.3, d.raysIn + 0.1));
    if (sa > 0) { sparkle(S[0], S[1], 15 * sa); eye(O[0], O[1], 19 * sa); }
    // two real light paths
    for (const sg of [-1, 1]) {
      const c1 = [S[0] + 130, LENS.y + sg * 118], c2 = [LENS.x + 55, LENS.y + sg * 112];
      const p = E.ioCubic(seg(t, d.raysIn + (sg > 0 ? 0.35 : 0), d.raysIn + 1.25 + (sg > 0 ? 0.35 : 0)));
      if (p > 0) {
        ctx.beginPath();
        for (let i = 0; i <= 80 * p; i++) { const q = bez(S, c1, c2, O, i / 80); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink; ctx.lineCap = 'round'; ctx.stroke();
      }
      // apparent image: straight back along the arriving direction
      const pi = E.ioCubic(seg(t, d.imagesIn + (sg > 0 ? 0.2 : 0), d.imagesIn + 0.8 + (sg > 0 ? 0.2 : 0)));
      if (pi > 0) {
        const dx = O[0] - c2[0], dy = O[1] - c2[1];
        const k = (O[0] - S[0]) / dx;
        const I = [S[0], O[1] - dy * k];
        ctx.save(); ctx.setLineDash([10, 10]); ctx.lineWidth = 2; ctx.strokeStyle = C.guide;
        ctx.beginPath(); ctx.moveTo(O[0], O[1]); ctx.lineTo(lerp(O[0], I[0], pi), lerp(O[1], I[1], pi)); ctx.stroke(); ctx.restore();
        if (pi > 0.9) { ctx.save(); ctx.globalAlpha *= (pi - 0.9) * 10; sparkle(I[0], I[1], 15, 'line'); ctx.restore(); text('image', I[0] + 26, I[1], 17, { color: C.sub, alpha: (pi - 0.9) * 10 }); }
      }
    }
    const la = seg(t, d.imagesIn + 0.6, d.imagesIn + 1.0);
    if (la > 0) {
      text('source', S[0], S[1] + 38, 17, { color: C.sub, align: 'center', alpha: la });
      text('mass', LENS.x, LENS.y + 56, 17, { color: C.sub, align: 'center', alpha: la });
      text('observer', O[0], O[1] + 38, 17, { color: C.sub, align: 'center', alpha: la });
    }
    ctx.restore();
  }
  function codeView(t, d, alpha) {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    const x = CANVAS.x + 76, y0 = CANVAS.y + 108, lh = 37;
    const KW = /^(import|as|for|in|range)$/;
    d.code.forEach((ln, i) => {
      if (t < d.codeT[i]) return;
      text(String(i + 1), x - 26, y0 + i * lh, 18, { face: 'MONO', color: '#b4b4b4', align: 'right' });
      const n = Math.floor(clamp01((t - d.codeT[i]) / 0.24) * ln.length);
      // tokenise for black / bold / grey "syntax highlighting"
      let cx = x;
      const toks = ln.slice(0, n).split(/(\s+|[()=*+\-/,.:]|\*\*)/).filter((s) => s !== '');
      for (const tk of toks) {
        const face = KW.test(tk) ? 'MONOB' : 'MONO';
        const color = /^[0-9.]+$/.test(tk) ? '#777777' : /^[()=*+\-/,.:]+$/.test(tk) ? '#666666' : C.ink;
        text(tk, cx, y0 + i * lh, 19, { face, color });
        cx += width(tk, 19, face);
      }
      if (n < ln.length || (i === d.code.length - 1 && t < d.run)) {
        if (caretVisible(t, d.codeT[i] + 0.24)) { ctx.fillStyle = C.ink; ctx.fillRect(cx + 1, y0 + i * lh - 12, 9, 24); }
      }
    });
    ctx.restore();
  }
  function simView(t, d, alpha) {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    warpedGrid(t, d.run - 1, 1, '#e4e4e4');
    const p = seg(t, d.sim[0], d.sim[1]);
    ctx.lineCap = 'round';
    for (const r of d.rays) {
      const n = Math.min(r.pts.length, Math.max(2, Math.floor(E.ioCubic(Math.min(1, p * 1.08)) * d.rayLen)));
      const q = n / r.pts.length;
      if (p <= 0) continue;
      ctx.beginPath();
      for (let i = 0; i < n; i++) i ? ctx.lineTo(r.pts[i][0], r.pts[i][1]) : ctx.moveTo(r.pts[i][0], r.pts[i][1]);
      ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
      if (q < 1) { const h = r.pts[n - 1]; ctx.beginPath(); ctx.arc(h[0], h[1], 4, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill(); }
    }
    ctx.beginPath(); ctx.arc(LENS.x, LENS.y, 30, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
    const ra = E.outCubic(seg(t, d.ringIn, d.ringIn + 0.6));
    if (ra > 0) {
      ctx.save(); ctx.globalAlpha *= ra; ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.arc(LENS.x, LENS.y, 70 + 18 * ra, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = C.guide; ctx.stroke();
      ctx.restore();
      text('Einstein ring', LENS.x, LENS.y + 112, 17, { color: C.sub, align: 'center', alpha: ra });
    }
    const steps = Math.round(400 * clamp01(p * 1.25));
    text(`rays 24   step ${String(steps).padStart(3, ' ')}/400`, CANVAS.x + 28, CANVAS.y + 88, 16, { face: 'MONO', color: C.sub });
    ctx.restore();
  }

  function demo1(t) {
    const d = D1;
    if (!d.t0 || t < d.t0 || t > d.out + 0.5) return;
    windowed(t, d.t0, d.out, d.to, () => {
      topBar(1, t);
      const x = colX(t);
      // empty state
      const ea = 1 - seg(t, d.send1, d.send1 + 0.3);
      if (ea > 0) {
        ctx.save(); ctx.globalAlpha *= ea;
        F.shape(G.gravity, 960, 430, 84 * spring(t - d.t0 - 0.6, 2, 0.4), 'fill');
        text(F.MODEL, 960, 528, 38, { face: 'UIM', align: 'center', alpha: seg(t, d.t0 + 0.8, d.t0 + 1.2) });
        ctx.restore();
      }
      // conversation
      let y = 214;
      const h1 = bubble(d.b1, x + COLW, y, t, d.send1, INPUT_Y);
      if (h1) y += h1 + 34;
      assistant(d.L1, d.W1, x, y, t, d.think1);
      y += d.L1.lines * 34 + 50;
      const h2 = bubble(d.b2, x + COLW, y, t, d.send2, INPUT_Y);
      if (h2) y += h2 + 34;
      assistant(d.L2, d.W2, x, y, t, d.think2);
      inputBox(x, t, d);
      // canvas: diagram -> code -> run
      growPanel(CANVAS.x, CANVAS.y, CANVAS.w, CANVAS.h, t, d.canvasIn, () => {
        canvasHeader(t, d);
        ctx.save(); F.rr(CANVAS.x, CANVAS.y + 61, CANVAS.w, CANVAS.h - 61, 0); ctx.clip();
        const toCode = seg(t, d.codeTab, d.codeTab + 0.35), toRun = seg(t, d.run, d.run + 0.35);
        diagram(t, d, 1 - toCode);
        codeView(t, d, toCode * (1 - toRun));
        simView(t, d, toRun);
        ctx.restore();
      });
    });
    drawCursor(d.cur, t);
  }

  // ================================================================== DEMO 2 — Drear
  const SIDE = { x: 260, w: 360 };
  const AV = { x: 322, y: 332, k: 84 };
  const PANELS = [
    { x: 660, y: 290, w: 490, h: 318, title: 'Venues', icon: 'globe' },
    { x: 1170, y: 290, w: 490, h: 318, title: 'Flights', icon: 'plane' },
    { x: 660, y: 628, w: 490, h: 318, title: 'Agenda', icon: 'calendar' },
    { x: 1170, y: 628, w: 490, h: 318, title: 'Invites', icon: 'mail' },
  ];
  const PLAN = ['Find a venue for 6', 'Book 6 flights', 'Draft the agenda', 'Invite the team'];
  const COMPOSER = { x: 560, y: 500, w: 800, h: 76 };
  const CARD = { x: 800, y: 350, w: 720, h: 540 };

  function setup2() {
    const b = T.demo2, d = D2;
    d.t0 = b; d.out = b + 28.4; d.end = T.final;
    d.task = 'Plan our Lisbon offsite: venue, flights, agenda, invites.';
    d.click = b + 2.5;
    d.type = typeTimes(d.task, b + 2.65, 77, 15.5);
    d.run = last(d.type) + 0.6;
    d.launch = d.run + 0.05;
    d.planT = PLAN.map((_, i) => d.run + 0.95 + i * 0.28);
    d.panelT = PANELS.map((_, i) => d.run + 2.2 + i * 0.15);
    const s = d.panelT;
    // per-panel scripts (absolute times); K stretches the work so it reads at a human pace
    const K = 1.55;
    const at = (i, x) => s[i] + x * K;
    d.p1 = { query: 'venues in Lisbon for 6 people', qT: null, cards: [at(0, 2.0), at(0, 2.2), at(0, 2.4)], scan: [at(0, 2.8), at(0, 3.25), at(0, 3.7), at(0, 4.15)], done: at(0, 4.6) };
    d.p1.qT = typeTimes(d.p1.query, at(0, 0.6), 3, 18);
    d.p2 = { rows: [at(1, 1.0), at(1, 1.15), at(1, 1.3), at(1, 1.45)], scan: [at(1, 1.9), at(1, 2.35), at(1, 2.8), at(1, 3.25)], pick: at(1, 3.8), seats: [0, 1, 2, 3, 4, 5].map((i) => at(1, 4.4 + i * 0.26)), done: at(1, 6.4) };
    d.p3 = { gridIn: at(2, 0.8), events: [at(2, 1.6), at(2, 2.5), at(2, 3.4), at(2, 4.3), at(2, 5.2)], done: at(2, 7.1) };
    d.p4 = { subject: 'Lisbon offsite', body: ["Hi team, we're heading to Lisbon!", 'Venue, flights and agenda attached.', 'See you there.'] };
    d.p4.subjT = typeTimes(d.p4.subject, at(3, 1.0), 9, 16);
    d.p4.bodyT = d.p4.body.map((ln, i) => typeTimes(ln, at(3, 2.0 + i * 1.6), 40 + i, 20));
    d.p4.attach = [d.p1.done, d.p2.done, d.p3.done];
    d.p4.send = d.p3.done + 0.7;
    d.p4.done = d.p4.send + 0.55;
    d.done = [d.p1.done, d.p2.done, d.p3.done, d.p4.done];
    d.allDone = d.p4.done + 0.45;
    d.collapse = d.allDone + 0.4;
    d.card = d.collapse + 0.25;
    d.lines = [0, 1, 2, 3].map((i) => d.card + 0.6 + i * 0.22);
    d.approve = d.card + 2.5;
    d.cur = [
      { t: b + 1.6, x: 1660, y: 1020 },
      { t: d.click - 0.1, x: 820, y: COMPOSER.y + 40 },
      { t: d.click, x: 820, y: COMPOSER.y + 40, click: true },
      { t: last(d.type) + 0.1, x: 830, y: COMPOSER.y + 48 },
      { t: d.run - 0.1, x: COMPOSER.x + COMPOSER.w - 44, y: COMPOSER.y + 38 },
      { t: d.run, x: COMPOSER.x + COMPOSER.w - 44, y: COMPOSER.y + 38, click: true },
      { t: d.run + 0.8, x: 1690, y: 1040, vis: 0 },
      { t: d.approve - 0.9, x: 1690, y: 1040, vis: 0 },
      { t: d.approve - 0.1, x: CARD.x + CARD.w / 2 + 20, y: CARD.y + CARD.h - 74 },
      { t: d.approve, x: CARD.x + CARD.w / 2 + 20, y: CARD.y + CARD.h - 74, click: true },
      { t: d.approve + 0.9, x: 1500, y: 1010, vis: 0 },
    ];
    // when something happens in each panel (Drear glances there)
    d.events = [
      [s[0], ...d.p1.cards, ...d.p1.scan, d.p1.done],
      [s[1], ...d.p2.rows, ...d.p2.scan, d.p2.pick, d.p2.seats[0], d.p2.seats[5], d.p2.done],
      [s[2], ...d.p3.events, d.p3.done],
      [s[3], d.p4.subjT[0], ...d.p4.bodyT.map((x) => x[0]), d.p4.send, d.p4.done],
    ];
    d.blinks = [b + 1.5, d.run + 1.4, d.p1.done + 0.2, d.p3.done - 0.6, d.allDone + 0.3, d.approve + 0.9, d.approve + 2.2];
    T.keys.push(...d.type);
    T.clicks.push(...d.cur.filter((k) => k.click).map((k) => k.t));
    T.sends.push(d.run);
    T.pops.push(...d.planT, ...d.p1.cards, ...d.p2.rows, ...d.p3.events, ...d.p4.attach.map((x) => x + 0.05), ...d.lines);
    T.softKeys.push(...d.p1.qT, ...d.p4.subjT, ...d.p4.bodyT.flat());
    T.scans.push(...d.p1.scan, ...d.p2.scan, ...d.p2.seats);
    T.checks.push(...d.done.map((x) => x + 0.12));
    T.whooshes.push(b, d.launch, ...d.panelT, d.collapse, d.p4.send, d.out);
    T.blinks.push(...d.blinks);
    T.success = d.card; T.approve = d.approve;
    T.d2 = { run: d.run, panels: d.panelT, done: d.done, allDone: d.allDone, card: d.card };
  }

  // Drear's position over the whole demo (screen space)
  function drearState(t) {
    const d = D2;
    const pIn = E.ioCubic(seg(t, d.t0, d.t0 + 0.95));
    const pSide = E.ioCubic(seg(t, d.launch, d.launch + 0.9));
    const pOut = E.ioCubic(seg(t, d.out, d.out + 1.0));
    const hero = { x: 960, y: 415, k: F.DREAR_H };
    const empty = { x: 960, y: 392, k: 124 };
    let x = lerp(hero.x, empty.x, pIn), y = lerp(hero.y, empty.y, pIn), k = lerp(hero.k, empty.k, pIn);
    // little arc on the way to the sidebar
    x = lerp(x, AV.x, pSide); y = lerp(y, AV.y, pSide) - Math.sin(Math.PI * pSide) * 60; k = lerp(k, AV.k, pSide);
    x = lerp(x, hero.x, pOut); y = lerp(y, hero.y, pOut) - Math.sin(Math.PI * pOut) * 40; k = lerp(k, hero.k, pOut);
    // gaze: towards the panel where something just happened
    let lx = 0, ly = 0, wsum = 0;
    if (t > d.panelT[0] && t < d.allDone) {
      d.events.forEach((evs, i) => {
        let w = 0;
        for (const e of evs) if (e <= t) w += Math.exp(-(t - e) / 0.32);
        const P = PANELS[i], dx = P.x + P.w / 2 - AV.x, dy = P.y + P.h / 2 - AV.y, n = Math.hypot(dx, dy);
        lx += (dx / n) * w; ly += (dy / n) * w; wsum += w;
      });
      if (wsum > 0.05) { const n = Math.max(wsum, 1); lx /= n; ly = (ly / n) * 1.6; }
    }
    if (t >= d.approve - 0.6 && t < d.approve + 1.2) { lx = lerp(lx, 1, E.ioCubic(seg(t, d.approve - 0.6, d.approve - 0.3))); ly = lerp(ly, 0.9, E.ioCubic(seg(t, d.approve - 0.6, d.approve - 0.3))); }
    let b = 0; for (const tb of d.blinks) b = Math.max(b, blink(t, tb));
    let hop = 0;
    for (const td of d.done) hop = Math.max(hop, Math.sin(Math.PI * seg(t, td, td + 0.26)) * 0.08);
    hop = Math.max(hop, Math.sin(Math.PI * seg(t, d.allDone, d.allDone + 0.34)) * 0.14);
    const sq = hop + Math.sin(Math.PI * pSide) * 0.08 + Math.sin(Math.PI * pOut) * 0.06;
    return { x, y, k, lx: clamp01(Math.abs(lx)) * Math.sign(lx), ly: Math.max(-1, Math.min(1, ly)), b, sx: 1 + sq, sy: 1 - sq };
  }

  function composer(t, d) {
    const p = E.ioQuart(seg(t, d.launch, d.launch + 0.6));
    const x = lerp(COMPOSER.x, SIDE.x, p), y = lerp(COMPOSER.y, 198, p);
    const w = lerp(COMPOSER.w, 1400, p), h = lerp(COMPOSER.h, 60, p);
    pill(x, y, w, h, { fill: p > 0.5 ? C.panel : C.white, stroke: p > 0.5 ? C.guide : C.ink });
    const cy = y + h / 2;
    const n = typedN(d.type, t);
    if (n === 0) text('Give Drear a task', x + 32, cy, 23, { color: C.sub });
    else text(d.task.slice(0, n), x + 32, cy, lerp(23, 21, p), { face: p > 0.5 ? 'UIM' : 'UI' });
    if (t >= d.click && t < d.run && caretVisible(t, n ? d.type[n - 1] : d.click)) {
      ctx.fillStyle = C.ink; ctx.fillRect(x + 32 + (n ? width(d.task.slice(0, n), 23) + 2 : 0), cy - 15, 2, 30);
    }
    if (p < 0.5) {
      const press = Math.sin(Math.PI * seg(t, d.run - 0.02, d.run + 0.16));
      ctx.save(); ctx.globalAlpha *= 1 - p * 2;
      ctx.beginPath(); ctx.arc(x + w - 44, cy, 26 * (1 - 0.1 * press), 0, Math.PI * 2); ctx.fillStyle = n ? C.ink : '#d6d6d6'; ctx.fill();
      arrowUp(x + w - 44, cy, 17, C.white);
      ctx.restore();
    } else {
      // run status at the right of the task header
      const done = t >= d.allDone;
      const a = seg(t, d.launch + 0.3, d.launch + 0.6);
      const label = done ? 'Done' : 'Running';
      const lw = width(label, 18) + 52, lx = x + w - 16 - lw;
      ctx.save(); ctx.globalAlpha *= a;
      pill(lx, cy - 18, lw, 36, { fill: done ? C.ink : C.white, stroke: C.ink });
      if (done) check(lx + 22, cy, 14, C.white, 2.5); else spinner(lx + 22, cy, 8, t, 2.5);
      text(label, lx + 38, cy, 18, { color: done ? C.white : C.ink });
      ctx.restore();
    }
  }

  function sidebar(t, d) {
    if (t < d.launch + 0.5) return;
    const a = seg(t, d.launch + 0.5, d.launch + 0.9);
    const allDone = t >= d.allDone;
    const working = t >= d.panelT[0];
    const status = allDone ? 'All done' : working ? `Working on ${PLAN.length} tasks` : 'Planning…';
    text(status, 384, AV.y - 14, 22, { face: 'UIM', alpha: a });
    const nDone = d.done.filter((x) => x <= t).length;
    text(working ? `${nDone} of ${PLAN.length} complete` : 'Breaking it down', 384, AV.y + 18, 18, { color: C.sub, alpha: a });
    PLAN.forEach((label, i) => {
      if (t < d.planT[i]) return;
      const p = E.outBack(seg(t, d.planT[i], d.planT[i] + 0.3));
      const y = 444 + i * 64;
      ctx.save(); ctx.globalAlpha *= clamp01(p);
      ctx.translate(0, (1 - clamp01(p)) * 12);
      const doneP = seg(t, d.done[i], d.done[i] + 0.2);
      const active = t >= d.panelT[i] && t < d.done[i];
      const pop = 1 + 0.2 * Math.sin(Math.PI * doneP);
      const s = 26 * pop;
      F.rr(SIDE.x + 13 - s / 2, y - s / 2, s, s, 7 * pop);
      if (doneP > 0) { ctx.fillStyle = C.ink; ctx.fill(); check(SIDE.x + 13, y, 16 * pop, C.white, 2.6); }
      else { ctx.lineWidth = 2; ctx.strokeStyle = active ? C.ink : C.guide; ctx.stroke(); if (active) spinner(SIDE.x + 13, y, 6, t, 2); }
      text(label, SIDE.x + 46, y, 21, { color: doneP > 0 || active ? C.ink : C.sub });
      ctx.restore();
    });
  }

  function panelChrome(P, t, status, prog) {
    const icon = P.icon;
    if (icon === 'plane') plane(P.x + 30, P.y + 26, 24);
    else F.shape(G.icons[icon], P.x + 30, P.y + 26, 24, 'fill');
    text(P.title, P.x + 52, P.y + 26, 20, { face: 'UIM' });
    text(status, P.x + P.w - 22, P.y + 26, 17, { color: status.endsWith('✓') ? C.ink : C.sub, align: 'right', face: status.endsWith('✓') ? 'UIM' : 'UI' });
    hline(P.x, P.x + P.w, P.y + 50, C.line);
    // progress
    pill(P.x + 22, P.y + P.h - 20, P.w - 44, 4, { fill: C.soft });
    if (prog > 0) pill(P.x + 22, P.y + P.h - 20, (P.w - 44) * prog, 4, { fill: C.ink });
  }
  const prog = (t, a, b) => E.ioCubic(seg(t, a, b));

  function panelVenues(P, t, d) {
    const q = d.p1, done = t >= q.done;
    panelChrome(P, t, done ? 'Booked ✓' : 'Searching…', prog(t, q.qT[0], q.done));
    // search field
    pill(P.x + 22, P.y + 66, P.w - 44, 42, { fill: C.white, stroke: C.guide });
    F.shape(G.icons.search, P.x + 46, P.y + 87, 18, 'fill');
    text(q.query.slice(0, typedN(q.qT, t)), P.x + 66, P.y + 87, 18);
    const results = [['Alfama Loft', '6 guests · river view'], ['Casa da Graça', '10 guests · rooftop'], ['Estúdio Chiado', '4 guests · central']];
    results.forEach(([title, sub], i) => {
      if (t < q.cards[i]) return;
      const p = E.outQuart(seg(t, q.cards[i], q.cards[i] + 0.35));
      const y = P.y + 120 + i * 56 + (1 - p) * 14;
      const picked = i === 0 && done;
      ctx.save(); ctx.globalAlpha *= p;
      pill(P.x + 22, y, P.w - 44, 48, { r: 10, fill: picked ? C.ink : C.white, stroke: picked ? C.ink : C.faint });
      pill(P.x + 30, y + 6, 36, 36, { r: 7, fill: picked ? '#333333' : C.soft });
      F.shape(G.icons.image, P.x + 48, y + 24, 20, 'fill');
      text(title, P.x + 80, y + 16, 17, { face: 'UIM', color: picked ? C.white : C.ink });
      text(sub, P.x + 80, y + 34, 15, { color: picked ? '#bdbdbd' : C.sub });
      if (picked) check(P.x + P.w - 50, y + 24, 18, C.white, 3);
      ctx.restore();
    });
    // agent focus box scanning the results
    if (t >= q.scan[0] && t < q.done) {
      let i = 0; while (i < q.scan.length - 1 && t >= q.scan[i + 1]) i++;
      const targets = [0, 1, 2, 0];
      const from = targets[Math.max(0, i - 1)], to = targets[i];
      const p = E.ioCubic(seg(t, q.scan[i], q.scan[i] + 0.25));
      const yy = P.y + 120 + lerp(from, to, i ? p : 1) * 56;
      pill(P.x + 18, yy - 4, P.w - 36, 56, { r: 13, stroke: C.ink, lw: 2 });
    }
  }
  function panelFlights(P, t, d) {
    const q = d.p2, done = t >= q.done;
    panelChrome(P, t, done ? '6 booked ✓' : t >= q.pick ? 'Booking…' : 'Comparing…', prog(t, q.rows[0], q.done));
    text('LIS  ·  6 travelers  ·  Friday', P.x + 22, P.y + 72, 16, { color: C.sub, alpha: seg(t, q.rows[0] - 0.3, q.rows[0]) });
    const rows = [['07:40 → 10:05', 'Direct', 0.66, '€289'], ['09:15 → 13:50', '1 stop', 0.48, '€214'], ['12:30 → 14:55', 'Direct', 0.56, '€246'], ['18:20 → 22:40', '1 stop', 0.4, '€198']];
    rows.forEach(([tm, stop, bar, price], i) => {
      if (t < q.rows[i]) return;
      const p = E.outQuart(seg(t, q.rows[i], q.rows[i] + 0.3));
      const y = P.y + 110 + i * 37;
      const picked = i === 2 && t >= q.pick;
      ctx.save(); ctx.globalAlpha *= p;
      if (picked) pill(P.x + 16, y - 15, P.w - 32, 32, { r: 8, fill: C.ink });
      const col = picked ? C.white : C.ink;
      text(tm, P.x + 28, y, 16, { face: 'MONO', color: col });
      text(stop, P.x + 196, y, 15, { color: picked ? '#bdbdbd' : C.sub });
      pill(P.x + 268, y - 4, 120 * bar * p, 8, { fill: picked ? '#555555' : C.faint });
      text(price, P.x + P.w - 28, y, 16, { face: 'UIM', color: col, align: 'right' });
      ctx.restore();
    });
    if (t >= q.scan[0] && t < q.pick) {
      let i = 0; while (i < q.scan.length - 1 && t >= q.scan[i + 1]) i++;
      const p = E.ioCubic(seg(t, q.scan[i], q.scan[i] + 0.22));
      const yy = P.y + 110 + lerp(Math.max(0, i - 1), i, i ? p : 1) * 37;
      pill(P.x + 16, yy - 15, P.w - 32, 32, { r: 8, stroke: C.ink });
    }
    // seats
    if (t >= q.pick + 0.2) {
      const a = seg(t, q.pick + 0.2, q.pick + 0.5);
      for (let i = 0; i < 6; i++) {
        const x = P.x + 28 + i * 32, y = P.y + 268;
        const f = seg(t, q.seats[i], q.seats[i] + 0.15);
        const pop = 1 + 0.25 * Math.sin(Math.PI * f);
        ctx.save(); ctx.globalAlpha *= a;
        F.rr(x - 11 * pop, y - 11 * pop, 22 * pop, 22 * pop, 5);
        if (f > 0) { ctx.fillStyle = C.ink; ctx.fill(); } else { ctx.lineWidth = 2; ctx.strokeStyle = C.guide; ctx.stroke(); }
        ctx.restore();
      }
      const n = q.seats.filter((x) => x <= t).length;
      text(`${n} seat${n === 1 ? '' : 's'}`, P.x + 230, P.y + 268, 16, { face: 'UIM', alpha: a });
    }
  }
  function panelAgenda(P, t, d) {
    const q = d.p3, done = t >= q.done;
    panelChrome(P, t, done ? 'Ready ✓' : 'Planning…', prog(t, q.gridIn, q.done));
    const ga = seg(t, q.gridIn, q.gridIn + 0.4);
    const colW = (P.w - 44 - 12) / 2, x0 = P.x + 22, y0 = P.y + 92, rh = 30;
    ctx.save(); ctx.globalAlpha *= ga;
    text('Day 1', x0, P.y + 72, 16, { color: C.sub });
    text('Day 2', x0 + colW + 12, P.y + 72, 16, { color: C.sub });
    for (let j = 0; j <= 6; j++) { hline(x0, x0 + colW, y0 + j * rh, C.soft); hline(x0 + colW + 12, x0 + 2 * colW + 12, y0 + j * rh, C.soft); }
    ctx.restore();
    const evs = [[0, 0.1, 1.0, 'Kickoff'], [1, 0.4, 1.9, 'Strategy'], [0, 1.3, 2.9, 'Workshop'], [1, 2.4, 3.6, 'Wrap-up'], [0, 4.1, 5.2, 'Dinner']];
    evs.forEach(([day, r0, r1, label], i) => {
      if (t < q.events[i]) return;
      const p = spring(t - q.events[i], 2.4, 0.42);
      const x = x0 + day * (colW + 12) + 2, y = y0 + r0 * rh + 2 - (1 - Math.min(1, p)) * 18;
      ctx.save(); ctx.globalAlpha *= clamp01((t - q.events[i]) / 0.15);
      pill(x, y, colW - 4, (r1 - r0) * rh - 4, { r: 7, fill: C.ink });
      text(label, x + 12, y + Math.min(15, ((r1 - r0) * rh - 4) / 2), 15, { face: 'UIM', color: C.white });
      ctx.restore();
    });
  }
  function panelInvites(P, t, d) {
    const q = d.p4, done = t >= q.done;
    panelChrome(P, t, done ? 'Sent ✓' : t >= q.send ? 'Sending…' : 'Writing…', prog(t, d.panelT[3] + 0.6, q.done));
    const x0 = P.x + 22;
    const ra = seg(t, d.panelT[3] + 0.7, d.panelT[3] + 1.0);
    ctx.save(); ctx.globalAlpha *= ra;
    text('To', x0, P.y + 74, 16, { color: C.sub });
    pill(x0 + 64, P.y + 60, 112, 28, { stroke: C.guide });
    text('Team · 6', x0 + 80, P.y + 74, 15);
    text('Subject', x0, P.y + 108, 16, { color: C.sub });
    ctx.restore();
    text(q.subject.slice(0, typedN(q.subjT, t)), x0 + 80, P.y + 108, 16, { face: 'UIM' });
    hline(x0, P.x + P.w - 22, P.y + 128, C.soft);
    q.body.forEach((ln, i) => text(ln.slice(0, typedN(q.bodyT[i], t)), x0, P.y + 152 + i * 26, 16));
    // attachments arrive as the other tasks finish
    let ax = x0;
    ['venue.pdf', 'flights.pdf', 'agenda.ics'].forEach((name, i) => {
      if (t < q.attach[i]) return;
      const p = E.outBack(seg(t, q.attach[i], q.attach[i] + 0.35));
      const w = width(name, 14) + 46;
      ctx.save(); ctx.globalAlpha *= clamp01(p);
      ctx.translate(ax + w / 2, P.y + 244); ctx.scale(p, p); ctx.translate(-(ax + w / 2), -(P.y + 244));
      pill(ax, P.y + 230, w, 28, { stroke: C.ink });
      F.shape(G.icons.doc, ax + 18, P.y + 244, 16, 'fill');
      text(name, ax + 32, P.y + 244, 14);
      ctx.restore();
      ax += w + 8;
    });
    // send button + paper plane
    const bx = P.x + P.w - 22 - 92, by = P.y + 228;
    const press = Math.sin(Math.PI * seg(t, q.send - 0.02, q.send + 0.18));
    pill(bx + 46 - 46 * (1 - 0.06 * press), by + 16 - 16 * (1 - 0.06 * press), 92 * (1 - 0.06 * press), 32 * (1 - 0.06 * press), { fill: t >= q.send ? '#444444' : C.ink });
    text(done ? 'Sent' : 'Send', bx + 46, by + 16, 15, { face: 'UIM', color: C.white, align: 'center' });
    const fp = seg(t, q.send, q.send + 0.7);
    if (fp > 0 && fp < 1) {
      ctx.save(); ctx.globalAlpha *= 1 - fp;
      paperPlane(bx + 46 + fp * 160, by + 10 - fp * 120 - Math.sin(fp * 3) * 10, 26, -0.6);
      ctx.restore();
    }
  }

  function summary(t, d) {
    if (t < d.card) return;
    const p = spring(t - d.card, 1.9, 0.4), a = clamp01((t - d.card) / 0.2);
    ctx.save(); ctx.globalAlpha *= a;
    const cx = CARD.x + CARD.w / 2, cy = CARD.y + CARD.h / 2, s = lerp(0.88, 1, Math.min(1.05, p));
    ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    F.rr(CARD.x, CARD.y, CARD.w, CARD.h, 10); ctx.fillStyle = C.panel; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
    // badge + rays
    const bp = E.outBack(seg(t, d.card + 0.1, d.card + 0.5));
    ctx.beginPath(); ctx.arc(cx, CARD.y + 86, 36 * bp, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
    if (bp > 0.3) check(cx, CARD.y + 86, 30 * bp, C.white, 4.5);
    const rp = seg(t, d.card + 0.25, d.card + 0.85);
    if (rp > 0 && rp < 1) {
      for (let i = 0; i < 12; i++) {
        const an = (i / 12) * Math.PI * 2, r0 = 50 + 40 * E.outCubic(rp), r1 = r0 + 22 * (1 - rp);
        polyline([[cx + Math.cos(an) * r0, CARD.y + 86 + Math.sin(an) * r0], [cx + Math.cos(an) * r1, CARD.y + 86 + Math.sin(an) * r1]], 2);
      }
    }
    text('Offsite ready.', cx, CARD.y + 172, 36, { face: 'UIM', align: 'center', alpha: seg(t, d.card + 0.3, d.card + 0.6) });
    const items = ['Alfama Loft · 2 nights', '6 flights booked', '2-day agenda', 'Invites sent to 6'];
    items.forEach((s2, i) => {
      if (t < d.lines[i]) return;
      const q = E.outQuart(seg(t, d.lines[i], d.lines[i] + 0.3));
      const y = CARD.y + 248 + i * 50 + (1 - q) * 10;
      ctx.save(); ctx.globalAlpha *= q;
      check(CARD.x + 214, y, 20, C.ink, 3);
      text(s2, CARD.x + 246, y, 22);
      ctx.restore();
    });
    // approve
    const ap = seg(t, d.lines[3] + 0.2, d.lines[3] + 0.5);
    const approved = t >= d.approve;
    const press = Math.sin(Math.PI * seg(t, d.approve - 0.02, d.approve + 0.18));
    const bw = 220 * (1 - 0.06 * press), bh = 58 * (1 - 0.06 * press);
    ctx.save(); ctx.globalAlpha *= ap;
    pill(cx - bw / 2, CARD.y + CARD.h - 74 - bh / 2, bw, bh, approved ? { fill: C.white, stroke: C.ink } : { fill: C.ink });
    if (approved) { check(cx - 58, CARD.y + CARD.h - 74, 18, C.ink, 3); text('Approved', cx - 36, CARD.y + CARD.h - 74, 21, { face: 'UIM' }); }
    else text('Approve', cx, CARD.y + CARD.h - 74, 21, { face: 'UIM', color: C.white, align: 'center' });
    ctx.restore();
    ctx.restore();
  }

  function demo2(t) {
    const d = D2;
    if (!d.t0 || t < d.t0 || t >= d.end) return;
    windowed(t, d.t0, d.out, { x: 960, y: 415 }, () => {
      topBar(2, t, seg(t, d.t0 + 0.7, d.t0 + 1.1));
      composer(t, d);
      sidebar(t, d);
      const painters = [panelVenues, panelFlights, panelAgenda, panelInvites];
      PANELS.forEach((P, i) => {
        if (t < d.panelT[i]) return;
        const cp = E.inBack(seg(t, d.collapse + i * 0.07, d.collapse + i * 0.07 + 0.45), 1.4);
        if (cp >= 1) return;
        ctx.save();
        if (cp > 0) {
          const cx = CARD.x + CARD.w / 2, cy = CARD.y + CARD.h / 2, px = P.x + P.w / 2, py = P.y + P.h / 2;
          const s = 1 - cp;
          ctx.translate(lerp(px, cx, cp), lerp(py, cy, cp)); ctx.scale(s, s); ctx.translate(-px, -py);
        }
        growPanel(P.x, P.y, P.w, P.h, t, d.panelT[i], () => painters[i](P, t, d), { r: 6 });
        ctx.restore();
      });
      summary(t, d);
    });
    const s = drearState(t);
    F.drear(s.x, s.y, s.k, { blink: s.b, lx: s.lx, ly: s.ly, sx: s.sx, sy: s.sy });
    drawCursor(d.cur, t);
  }

  window.DEMOS = {
    setup() {
      ctx = F.ctx; G = F.G; T = F.T; E = F.E;
      Object.assign(T, { keys: [], softKeys: [], clicks: [], sends: [], pops: [], whooshes: [], draws: [], lines: [], thumps: [], scans: [], checks: [] });
      setup1(); setup2();
      for (const k of ['keys', 'softKeys', 'clicks', 'pops', 'whooshes', 'scans', 'checks']) T[k].sort((a, b) => a - b);
    },
    demo1, demo2,
  };
})();
