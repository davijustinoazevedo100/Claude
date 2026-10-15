/* Pomar Distribuidora · comercial de 60 s em motion graphics.
   One paused GSAP timeline tweens plain state objects (nodes); flush() writes them to SVG.
   window.__seek(t) renders any instant deterministically, so frames can be captured one by one. */
(async function () {
  gsap.registerPlugin(DrawSVGPlugin, CustomEase);

  const W = 1920, H = 1080, DUR = 60;
  const BEAT = 60 / 72, BAR = BEAT * 4, E8 = BEAT / 2;      // music: 72 BPM, 4/4
  const bar = (n, beat = 0) => (n - 1) * BAR + beat * BEAT;

  // geometry of the ORIGINAL logo resampled 1.25x (tools/logo_parts.py → logo-geo.json)
  const LOGO = { size: 559, ox: 271.17, oy: 250.72, or: 84.83, stem: [178.75, 275, 273.75, 425],
    leafTop: { base: [178.75, 248.75], tip: [122.5, 196.25] }, leafBottom: { base: [171.25, 268.75], tip: [93.75, 302.5] },
    crescent: { a0: -75.3, a1: 76.1, r0: 111.5, r1: 194.6 } };
  const LX = 681, LY = 152;                                   // logo image top-left on the end card
  const OX = LX + LOGO.ox, OY = LY + LOGO.oy;                  // orange circle centre on screen

  await Promise.all(['400', '500', '600', '700'].map(w => document.fonts.load(`${w} 64px Outfit`)));
  await document.fonts.ready;

  const svg = document.getElementById('stage');
  const defs = el('defs', {}, svg); setDefs(defs);
  const bgRect = el('rect', { width: W, height: H, fill: C.paper }, svg);
  const world = el('g', {}, svg);
  const top = el('g', {}, svg);                                // transition layers above the scenes
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  const CUES = { sprouts: [], sproutsBack: [], fruits: [], drops: [], pins: [] };   // exported for the soundtrack

  CustomEase.create('soft', 'M0,0 C0.36,0 0.12,1 1,1');      // long, silky deceleration
  CustomEase.create('swing', 'M0,0 C0.62,0 0.18,1 1,1');

  /* scene root with a pivot at the frame centre, so scenes can drift / push in */
  function scene(parent, o = 0) {
    const n = N(parent, { x: W / 2, y: H / 2, o });
    n.w = el('g', { transform: `translate(${-W / 2},${-H / 2})` }, n.el);
    return n;
  }

  /* headline split into words that rise through a clipping line */
  function textLine(parent, str, { x, y, size = 92, weight = 600, fill = C.ink, anchor = 'middle', dot = C.orange, ls = 0 } = {}) {
    const g = el('g', {}, parent);
    const cid = uid('tc');
    const cp = el('clipPath', { id: cid }, defs);
    const inner = el('g', { 'clip-path': `url(#${cid})` }, g);
    const sp = size * 0.26, words = [];
    let cx = 0;
    for (const w of str.split(' ')) {
      const n = N(inner, { y: size * 1.3 });
      const t = el('text', { 'font-family': 'Outfit, sans-serif', 'font-weight': weight, 'font-size': size, fill, 'letter-spacing': ls }, n.el);
      if (dot && /[.]$/.test(w)) {
        t.appendChild(document.createTextNode(w.slice(0, -1)));
        el('tspan', { fill: dot }, t).textContent = '.';
      } else t.textContent = w;
      const wl = t.getComputedTextLength();
      words.push({ n, t, off: cx }); cx += wl + sp;
    }
    const total = cx - sp;
    const x0 = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
    for (const w of words) { w.t.setAttribute('x', x0 + w.off); w.t.setAttribute('y', y); }
    el('rect', { x: x0 - size, y: y - size * 1.1, width: total + size * 2, height: size * 1.52 }, cp);
    return { g, words: words.map(w => w.n), size, x0, width: total };
  }
  const showWords = (ln, t, dur = 1.1, stagger = 0.075) => tl.to(ln.words, { y: 0, duration: dur, ease: 'power4.out', stagger }, t);
  const hideWords = (ln, t, dur = 0.65, stagger = 0.045) => tl.to(ln.words, { y: -ln.size * 1.45, duration: dur, ease: 'power3.in', stagger }, t);

  function yOnPath(path, x) {
    const L = path.getTotalLength();
    let best = null;
    for (let i = 0; i <= 800; i++) {
      const p = path.getPointAtLength(L * i / 800);
      if (p.y > 1200) continue;
      if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    }
    return best.y;
  }

  /* ================================================================ S1 · Tudo começa no campo (0–10 s) */
  const s1 = scene(world, 1);
  const s1cam = N(s1.w, { x: 960, y: 590 });
  const s1w = el('g', { transform: 'translate(-960,-590)' }, s1cam.el);
  const rings = [[318, '#FFF4EC'], [232, '#FFEBDD'], [168, '#FFE0CB']].map(([r, f]) => {
    const n = N(s1w, { x: 960, y: 590, s: 0 }); el('circle', { r, fill: f }, n.el); return n;
  });
  const sun1 = N(s1w, { x: 960, y: 700, s: 0 });
  el('circle', { r: 130, fill: C.orange }, sun1.el);
  const horizon = stroke('M160,700 L1760,700', C.greenShade, 4, s1w);

  const hillDefs = [
    { d: 'M-200,690 C150,600 520,610 880,664 C1240,718 1560,600 2120,646 L2120,1300 L-200,1300 Z', fill: '#CDEBD7' },
    { d: 'M-200,790 C220,700 600,708 980,768 C1320,822 1620,724 2120,748 L2120,1300 L-200,1300 Z', fill: '#7FD0A0' },
    { d: 'M-200,896 C260,816 700,830 1010,872 C1320,914 1640,846 2120,862 L2120,1300 L-200,1300 Z', fill: C.green },
  ];
  const hills = hillDefs.map(h => { const n = N(s1w, { y: 560 }); n.path = el('path', { d: h.d, fill: h.fill }, n.el); return n; });
  const sprouts = [];
  for (const [hi, xs, h, stemC, lc, rc] of [
    [1, [330, 640, 1290, 1580], 54, C.green, C.green, C.greenShade],
    [2, [200, 480, 770, 1090, 1390, 1700], 88, C.greenShade, C.green, C.greenShade]]) {
    xs.forEach((x, i) => {
      const y = yOnPath(hills[hi].path, x) + 6;
      const sp = sprout(hills[hi].el, x, y, h, (i % 2 ? 1 : -1) * h * 0.12);
      sp.stem.setAttribute('stroke', stemC);
      sp.L.el.querySelector('path').setAttribute('fill', lc);
      sp.R.el.querySelector('path').setAttribute('fill', rc);
      sp.n.o = 0; sp.hill = hi; sprouts.push(sp);
    });
  }
  const h1 = textLine(s1.w, 'Tudo começa no campo.', { x: 960, y: 250, size: 96 });

  tl.to(sun1, { s: 0.1, duration: 0.8, ease: 'back.out(3)' }, 0.42);
  tl.fromTo(horizon, { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 1.8, ease: 'power2.inOut' }, 0.95);
  tl.to(sun1, { y: 590, duration: 3.1, ease: 'power2.inOut' }, 2.35);
  tl.to(sun1, { s: 1, duration: 3.1, ease: 'swing' }, 2.35);
  rings.forEach((r, i) => tl.to(r, { s: 1, duration: 2.8, ease: 'soft' }, 3.0 + i * 0.32));
  hills.forEach((h, i) => tl.to(h, { y: 0, duration: 2.3, ease: 'soft' }, bar(2) + i * 0.3));
  tl.to(horizon, { opacity: 0, duration: 0.6, ease: 'none' }, 4.2);
  showWords(h1, 4.6);
  const front = sprouts.filter(s => s.hill === 2), mid = sprouts.filter(s => s.hill === 1);
  const grow = (sp, t) => {
    tl.set(sp.n, { o: 1 }, t);
    tl.fromTo(sp.stem, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.55, ease: 'power2.out' }, t);
    tl.to(sp.L, { s: 1, duration: 0.75, ease: 'back.out(2.2)' }, t + 0.28);
    tl.to(sp.R, { s: 1, duration: 0.75, ease: 'back.out(2.2)' }, t + 0.36);
  };
  // leaves open on the music grid (front row on 8ths, back row on beats)
  front.forEach((sp, i) => { const t = bar(2, 2.5) + i * E8; grow(sp, t - 0.33); CUES.sprouts.push(t); });
  mid.forEach((sp, i) => { const t = bar(2, 2.75) + i * BEAT; grow(sp, t - 0.33); CUES.sproutsBack.push(t); });
  tl.to(s1cam, { s: 1.035, duration: 8.4, ease: 'sine.inOut' }, 0);

  /* ---- S1 → S2: the sun becomes the first ripe orange of the orchard */
  const heroLayer = el('g', {}, top);
  const hero = treeFruit(heroLayer, 960, 590, 130, true);
  hero.s = 1; hero.o = 0; hero.top.s = 0;
  const heroFlat = N(hero.el);
  el('circle', { r: 130.5, fill: C.orange }, heroFlat.el);

  hideWords(h1, 8.2);
  tl.to(sun1, { s: 1.06, duration: 0.75, ease: 'sine.inOut' }, 8.45);       // anticipation
  hills.forEach((h, i) => tl.to(h, { y: 700, duration: 1.35, ease: 'power2.in' }, 8.4 + (2 - i) * 0.1));
  rings.forEach((r, i) => tl.to(r, { s: 0, duration: 0.9, ease: 'power3.in' }, 8.5 + (2 - i) * 0.08));
  tl.set(sun1, { o: 0 }, 9.2);
  tl.set(hero, { o: 1, s: 1.06 * 1.035 * (1 + 0.012 * Math.sin(9.2 * 2.1)) }, 9.2);   // same size as sun1 under the S1 push-in
  tl.set(s1, { o: 0 }, 9.95);

  /* ================================================================ S2 · Colhido no ponto certo (10–20 s) */
  const s2 = scene(world);
  const ground2 = N(s2.w, { y: 340 });
  el('path', { d: 'M-60,946 C560,914 1320,914 1980,946 L1980,1140 L-60,1140 Z', fill: '#CDEAD6' }, ground2.el);
  const treeB = tree(s2.w, 1665, 950, { s: 0.92, light: true });
  const treeA = tree(s2.w, 1150, 952, { s: 1.4 });
  const fruitLayer = el('g', {}, s2.w);
  const crateLayer = el('g', {}, s2.w);
  const ancA = [[30, -332], [-70, -300], [96, -262], [-24, -240], [-120, -246], [64, -210], [-60, -200], [120, -300], [0, -290]];
  const fruitsA = ancA.map(([x, y], i) => treeFruit(fruitLayer, 1150 + x * 1.4, 952 + y * 1.4, 36, i === 0));
  const ancB = [[-70, -300], [96, -262], [-24, -240], [64, -210], [-120, -246]];
  const fruitsB = ancB.map(([x, y]) => treeFruit(fruitLayer, 1665 + x * 0.92, 950 + y * 0.92, 25, false));
  const h2a = textLine(s2.w, 'Colhido no', { x: 172, y: 478, size: 112, anchor: 'start' });
  const h2b = textLine(s2.w, 'ponto certo.', { x: 172, y: 600, size: 112, anchor: 'start', fill: C.orange, dot: C.orange });
  const crate2 = N(crateLayer, { x: 1150, y: 1330 });
  crate(crate2.el);

  tl.set(s2, { o: 1 }, 8.95);
  tl.to(bgRect, { attr: { fill: C.mint }, duration: 1.1, ease: 'sine.inOut' }, 8.9);
  tl.to(ground2, { y: 0, duration: 1.3, ease: 'soft' }, 9.05);
  tl.to(treeA.trunk, { sy: 1, duration: 0.95, ease: 'power3.out' }, 9.3);
  treeA.parts.forEach((p, i) => tl.to(p, { s: 1, duration: 0.85, ease: 'back.out(1.6)' }, 9.55 + i * 0.045));
  tl.to(treeB.trunk, { sy: 1, duration: 0.95, ease: 'power3.out' }, 9.6);
  treeB.parts.forEach((p, i) => tl.to(p, { s: 1, duration: 0.85, ease: 'back.out(1.6)' }, 9.85 + i * 0.045));
  // the sun travels on a curve and shrinks into the first orange
  tl.to(hero, { x: fruitsA[0].x, duration: 1.35, ease: 'power2.inOut' }, 9.2);
  tl.to(hero, { y: fruitsA[0].y, duration: 1.35, ease: 'power3.inOut' }, 9.2);
  tl.to(hero, { s: 36 / 130, duration: 1.35, ease: 'power3.inOut' }, 9.2);
  tl.to(heroFlat, { o: 0, duration: 0.5, ease: 'none' }, 9.95);
  tl.to(hero.top, { s: 1, duration: 0.6, ease: 'back.out(2.6)' }, 10.25);
  tl.set(hero, { o: 0 }, 10.9);
  tl.set(fruitsA[0], { s: 1 }, 10.9);
  tl.set(fruitsA[0].top, { s: 1 }, 10.9);

  // fruits appear unripe on the beat, then ripen to orange
  const ripen = [...fruitsA.slice(1), ...fruitsB];
  ripen.forEach((f, i) => {
    const t = bar(4, 1) + i * E8 * 0.5;
    CUES.fruits.push(t + 0.06);
    tl.to(f, { s: 1, duration: 0.7, ease: 'back.out(2.4)' }, t);
    const tr = 12.5 + i * 0.16;                                 // green -> golden -> orange
    tl.to(f.base, { attr: { fill: '#F7BE2E' }, duration: 0.55, ease: 'sine.in' }, tr);
    tl.to(f.shade, { attr: { fill: '#E0A11A' }, duration: 0.55, ease: 'sine.in' }, tr);
    tl.to(f.base, { attr: { fill: C.orange }, duration: 0.7, ease: 'sine.out' }, tr + 0.55);
    tl.to(f.shade, { attr: { fill: C.orangeShade }, duration: 0.7, ease: 'sine.out' }, tr + 0.55);
  });
  showWords(h2a, 11.1);
  showWords(h2b, 11.45);
  tl.to(s2, { s: 1.03, duration: 9, ease: 'sine.inOut' }, 10);

  // harvest: oranges drop into the crate
  tl.to(crate2, { y: 1030, duration: 0.9, ease: 'soft' }, 15.5);
  const drops = [[fruitsA[0], 1058], [fruitsA[3], 1104], [fruitsA[1], 1150], [fruitsA[5], 1196], [fruitsA[2], 1242]];
  drops.forEach(([f, sx], i) => {
    const land = bar(6) + i * E8, t = land - 0.62;               // each orange lands on an 8th
    f.hangT = t;
    CUES.drops.push(land);
    tl.to(f, { x: sx, duration: 0.62, ease: 'sine.inOut' }, t);
    tl.to(f, { y: 894 - (i % 2) * 6, duration: 0.62, ease: 'power2.in' }, t);
    tl.to(f, { r: (i % 2 ? 1 : -1) * 24, duration: 0.62, ease: 'sine.in' }, t);
    tl.to(f, { sy: 0.84, sx: 1.12, duration: 0.07, ease: 'power1.out' }, land);
    tl.to(f, { sy: 1, sx: 1, duration: 0.45, ease: 'back.out(3)' }, land + 0.07);
  });
  hideWords(h2a, 18.25); hideWords(h2b, 18.35);

  /* ---- S2 → S3: a leaf sweeps the frame */
  const wipe = el('g', {}, top);
  const leafPath = (L, w) => `M${-L / 2},0 C${-L * 0.22},${-w} ${L * 0.22},${-w} ${L / 2},0 C${L * 0.22},${w} ${-L * 0.22},${w} ${-L / 2},0 Z`;
  const leafA = N(wipe, { x: -1500, y: 1800, r: -36, o: 0 });
  el('path', { d: leafPath(4200, 1500), fill: C.green }, leafA.el);
  const leafB = N(wipe, { x: -1500, y: 1800, r: -36, o: 0 });
  el('path', { d: leafPath(4600, 1750), fill: C.greenDeep }, leafB.el);
  stroke('M-2100,0 Q0,-60 2100,0', '#0B7443', 18, leafB.el);
  const sweep = { x: 3420, y: -740, duration: 1.6, ease: 'sine.inOut' };
  tl.set(leafA, { o: 1 }, 18.75); tl.to(leafA, sweep, 18.75);
  tl.set(leafB, { o: 1 }, 18.92); tl.to(leafB, sweep, 18.92);
  const COVER = 18.92 + 0.8;
  tl.set(leafA, { o: 0 }, COVER);
  tl.set(s2, { o: 0 }, COVER);
  tl.set(bgRect, { attr: { fill: C.greenDeep } }, COVER);
  tl.set(leafB, { o: 0 }, 20.6);

  /* ================================================================ S3 · Frutas, verduras e legumes (20–30 s) */
  const s3 = scene(world);
  const gl = el('radialGradient', { id: 'glow3' }, defs);
  el('stop', { offset: 0, 'stop-color': '#13854B', 'stop-opacity': 0.85 }, gl);
  el('stop', { offset: 1, 'stop-color': C.greenDeep, 'stop-opacity': 0 }, gl);
  const glow3 = N(s3.w, { x: 960, y: 560, s: 0.6, o: 0 });
  el('circle', { r: 760, fill: 'url(#glow3)' }, glow3.el);
  const orbitBack = el('g', {}, s3.w);
  const text3 = el('g', {}, s3.w);
  const orbitFront = el('g', {}, s3.w);
  const h3a = textLine(text3, 'Frutas, verduras e legumes', { x: 960, y: 552, size: 86, fill: '#fff' });
  const h3b = textLine(text3, 'selecionados com cuidado', { x: 960, y: 626, size: 40, weight: 400, fill: '#BDE7CB', ls: 0.5 });
  const items = PRODUCE.map((k, i) => {
    const n = N(orbitBack, { s: 0 });
    const spin = N(n.el);
    ART[k](spin.el);
    return { n, spin, k: 0, i };
  });
  const orbit = { R: 1, cy: 560, sc: 1, spin: 0 };

  tl.set(s3, { o: 1 }, COVER);
  tl.to(glow3, { o: 1, s: 1, duration: 3, ease: 'soft' }, 19.9);
  items.forEach((it, i) => tl.to(it, { k: 1, duration: 1.7, ease: 'power3.out' }, 19.95 + i * 0.1));
  showWords(h3a, 20.9, 1.1, 0.09);
  showWords(h3b, 21.7, 1.0, 0.07);
  hideWords(h3a, 27.55); hideWords(h3b, 27.6);
  tl.to(orbit, { spin: 1, duration: 1.3, ease: 'power2.in' }, 27.85);
  tl.to(orbit, { R: 0, duration: 1.25, ease: 'power3.in' }, 27.9);
  tl.to(orbit, { cy: 700, sc: 0.42, duration: 1.25, ease: 'power2.in' }, 27.9);

  /* ---- S3 → S4: produce falls into a crate; the crate drops, an iris opens on the road */
  const crate3 = N(top, { x: 960, y: 850, s: 0 });
  crate(crate3.el);
  tl.to(crate3, { s: 1, duration: 0.6, ease: 'back.out(1.8)' }, 28.45);
  items.forEach(it => tl.set(it.n, { o: 0 }, 29.18));
  tl.to(crate3, { y: 1420, duration: 0.65, ease: 'power2.in' }, 29.3);
  tl.to(crate3, { r: 8, duration: 0.65, ease: 'sine.in' }, 29.3);

  /* ================================================================ S4a · Do pomar até você (30–38 s) */
  const s4 = scene(world);
  const irisId = uid('iris');
  const irisClip = el('clipPath', { id: irisId }, defs);
  const irisCircle = el('circle', { cx: 960, cy: 1160, r: 0 }, irisClip);
  const iris = { r: 0 };
  s4.w.setAttribute('clip-path', `url(#${irisId})`);
  const s4a = N(s4.w);
  el('rect', { width: W, height: H, fill: C.sky }, s4a.el);
  const sun4 = N(s4a.el, { x: 1630, y: 196 });
  el('circle', { r: 100, fill: '#FFE6D3', opacity: 0.8 }, sun4.el);
  el('circle', { r: 60, fill: C.orange }, sun4.el);
  const CLOUDX = [240, 820, 1300, 1900];
  const clouds = [[240, 380, 0.85], [820, 352, 0.6], [1300, 418, 0.75], [1900, 366, 0.7]].map(([x, y, s]) => cloud(s4a.el, x, y, s));
  // far hills (tile 960 px)
  const far = N(s4a.el);
  let fd = 'M-960,760';
  for (let x = -960; x < 2900; x += 480) fd += ` Q${x + 240},${x % 960 === 0 ? 640 : 690} ${x + 480},760`;
  el('path', { d: fd + ' L2900,1100 L-960,1100 Z', fill: '#C6E7D1' }, far.el);
  // tree row (3 tree variants, tile 780 px)
  const row = N(s4a.el);
  for (let x = -780; x < 2800; x += 260) {
    const k = ((x / 260) % 3 + 3) % 3;
    el('rect', { x: x - 5, y: 790, width: 10, height: 70, rx: 5, fill: '#4FAE76' }, row.el);
    el('circle', { cx: x, cy: 775 - k * 8, r: 40 + k * 6, fill: k === 1 ? '#7FD0A0' : '#93D9AE' }, row.el);
  }
  el('rect', { x: -10, y: 852, width: W + 20, height: 60, fill: '#A9DDBC' }, s4a.el);
  el('rect', { x: -10, y: 900, width: W + 20, height: 92, fill: '#3B4842' }, s4a.el);
  el('rect', { x: -10, y: 900, width: W + 20, height: 6, fill: '#55645C' }, s4a.el);
  const dashes = N(s4a.el);
  for (let x = -200; x < 2200; x += 200) el('rect', { x, y: 943, width: 86, height: 8, rx: 4, fill: '#F2F2EC' }, dashes.el);
  el('rect', { x: -10, y: 990, width: W + 20, height: 100, fill: C.green }, s4a.el);
  const tufts = N(s4a.el);
  for (let x = -320; x < 2300; x += 320) for (const [dx, h, rot] of [[0, 34, -8], [16, 26, 14], [-14, 22, -24]])
    leaf(tufts.el, { x: x + dx, y: 1010, len: h, w: 6, rot: -90 + rot, fill: C.greenShade, vein: null });
  const crate4 = N(s4a.el, { x: 760, y: -200 });
  crate(crate4.el, { w: 240, h: 120 });
  const trk = truck(s4a.el, 830, 950, 'assets/logo/logo-200.png');
  trk.n.s = 1.1;
  const h4 = textLine(s4a.el, 'Do pomar até você.', { x: 960, y: 196, size: 96 });
  const drive = { t0: 31.15, ramp: 1.5, v: 380 };
  const driveDist = t => {
    const u = Math.max(0, Math.min(1, (t - drive.t0) / drive.ramp));
    const ramp = drive.v * drive.ramp * (u * u * u - u * u * u * u / 2);
    return t <= drive.t0 + drive.ramp ? ramp : drive.v * drive.ramp * 0.5 + drive.v * (t - drive.t0 - drive.ramp);
  };

  tl.set(s4, { o: 1 }, 29.3);
  tl.to(iris, { r: 1560, duration: 1.0, ease: 'power3.inOut' }, 29.3);
  tl.set(bgRect, { attr: { fill: C.sky } }, 30.35);
  tl.set(s3, { o: 0 }, 30.35);
  tl.to(crate4, { y: 760, duration: 0.65, ease: 'power1.in' }, 30.0);           // gravity: lands at 30.65
  tl.set(crate4, { o: 0 }, 30.7);
  tl.to(trk.body, { y: 10, duration: 0.09, ease: 'power2.out' }, 30.62);
  tl.to(trk.body, { y: 0, duration: 0.9, ease: 'elastic.out(1,0.32)' }, 30.71);
  showWords(h4, 31.35);
  tl.to(trk.n, { x: 930, duration: 5.6, ease: 'sine.inOut' }, 31.6);
  hideWords(h4, 36.9);
  tl.to(trk.n, { x: 2700, duration: 1.25, ease: 'power2.in' }, 37.2);

  /* ================================================================ S4b · Cuidado em cada entrega (38–43 s) */
  const map = N(s4.w, { y: 1120 });
  el('rect', { width: W, height: H, fill: '#F1F6F2' }, map.el);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const colsX = [-40, 150, 360, 600, 820, 1040, 1270, 1480, 1700, 1900];
  const rowsY = [-40, 120, 300, 520, 640, 860, 1000, 1120];
  for (let c = 0; c < colsX.length - 1; c++) for (let r = 0; r < rowsY.length - 1; r++) {
    const x = colsX[c] + 22, y = rowsY[r] + 22, w = colsX[c + 1] - colsX[c] - 44, h = rowsY[r + 1] - rowsY[r] - 44;
    const park = rnd() < 0.14;
    el('rect', { x, y, width: w, height: h, rx: 18, fill: park ? '#CFEAD8' : rnd() < 0.5 ? '#E2ECE5' : '#E8F0EA' }, map.el);
    if (park) for (let k = 0; k < 3; k++) el('circle', { cx: x + w * (0.25 + k * 0.25), cy: y + h * 0.5 + (k % 2 ? -8 : 8), r: Math.min(h, 60) * 0.32, fill: '#9AD6AF' }, map.el);
  }
  const routeD = 'M330,722 C470,722 540,452 760,452 C962,452 968,742 1170,742 C1372,742 1392,432 1592,432';
  el('path', { d: routeD, stroke: '#fff', 'stroke-width': 30, 'stroke-linecap': 'round', fill: 'none' }, map.el);
  const routeBg = stroke(routeD, '#F7D2B6', 10, map.el, { 'stroke-dasharray': '2 16' });
  const route = stroke(routeD, C.orange, 10, map.el);
  const routeLen = route.getTotalLength();
  const rp = { p: 0 };
  const hub = pin(map.el, 330, 722, C.greenShade, C.paper);
  const hubClip = uid('hc');
  el('circle', { cx: 0, cy: -84, r: 31 }, el('clipPath', { id: hubClip }, defs));
  el('image', { href: 'assets/logo/logo-80.png', x: -40, y: -124, width: 80, height: 80, 'clip-path': `url(#${hubClip})` }, hub.el);
  const stops = [[760, 452, 'carrinho', 'Mercados'], [1170, 742, 'talheres', 'Restaurantes'], [1592, 432, 'cesta', 'Hortifrútis']].map(([x, y, ic, label]) => {
    const p = pin(map.el, x, y, C.green);
    ICON[ic](p.icon, C.greenShade);
    const lb = N(map.el, { x, y: y + 52, o: 0 });
    el('text', { x: 0, y: 0, 'text-anchor': 'middle', 'font-family': 'Outfit', 'font-weight': 600, 'font-size': 30, fill: C.ink }, lb.el).textContent = label;
    // route fraction where this stop sits
    let best = 0, bd = 1e9;
    for (let i = 0; i <= 400; i++) { const q = route.getPointAtLength(routeLen * i / 400); const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = i / 400; } }
    return { p, lb, f: best };
  });
  const dot = N(map.el, { x: 330, y: 722, s: 0 });
  el('circle', { r: 26, fill: C.orange, opacity: 0.25 }, dot.el);
  el('circle', { r: 16, fill: C.orange, stroke: '#fff', 'stroke-width': 5 }, dot.el);
  const hMap = textLine(map.el, 'Cuidado em cada entrega.', { x: 960, y: 196, size: 92 });

  tl.to(s4a, { y: -1120, duration: 1.15, ease: 'power3.inOut' }, 38.0);
  tl.to(map, { y: 0, duration: 1.15, ease: 'power3.inOut' }, 38.0);
  tl.to(hub, { s: 1, duration: 0.7, ease: 'back.out(2)' }, 38.75);
  tl.to(dot, { s: 1, duration: 0.5, ease: 'back.out(2)' }, 39.0);
  showWords(hMap, 39.05);
  const R0 = 39.25, RD = 2.65;
  tl.to(rp, { p: 1, duration: RD, ease: 'sine.inOut' }, R0);
  stops.forEach((st, i) => {
    const ta = R0 + RD * Math.acos(1 - 2 * st.f) / Math.PI;     // sine.inOut inverse
    tl.to(st.p, { s: 1, duration: 0.65, ease: 'back.out(2.2)' }, ta - 0.32);
    CUES.pins.push(ta - 0.24);
    tl.to(st.lb, { o: 1, duration: 0.4, ease: 'none' }, ta - 0.1);
    tl.fromTo(st.lb, { y: st.p.y + 70 }, { y: st.p.y + 52, duration: 0.6, ease: 'power3.out', immediateRender: false }, ta - 0.1);
  });
  hideWords(hMap, 42.25);

  /* ---- map → S5: the travelling dot swells to fill the frame, then becomes the first value */
  const coverL = el('g', {}, top);
  const cover = N(coverL, { x: 1592, y: 432, s: 0 });
  el('circle', { r: 16, fill: C.orange }, cover.el);
  tl.set(cover, { s: 1 }, 42.5);
  tl.set(dot, { o: 0 }, 42.5);
  tl.to(cover, { s: 112, duration: 0.85, ease: 'power2.in' }, 42.5);
  const SWAP5 = 43.35;
  tl.set(s4, { o: 0 }, SWAP5);
  tl.set(bgRect, { attr: { fill: C.paper } }, SWAP5);

  /* ================================================================ S5 · Qualidade, frescor, pontualidade (43–48 s) */
  const s5 = scene(world);
  const ICONS5 = {
    selo(p) {
      let d = '';
      for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 47 : 55; d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`; }
      return [stroke(d + 'Z', '#fff', 8, p), stroke('M-21,2 L-6,17 L22,-14', '#fff', 10, p)];
    },
    folha(p) {
      return [stroke('M-36,36 C-46,-14 -6,-52 44,-48 C48,0 8,44 -36,36 Z', '#fff', 9, p), stroke('M-36,36 C-10,10 10,-14 30,-34', '#fff', 8, p)];
    },
    relogio(p) {
      const ring = stroke('M0,-52 A52,52 0 1 1 -0.1,-52', '#fff', 9, p);
      const hand = N(p); stroke('M0,0 L0,-34', '#fff', 9, hand.el);
      const hand2 = N(p); stroke('M0,0 L22,0', '#fff', 9, hand2.el);
      el('circle', { r: 7, fill: '#fff' }, p);
      return [ring, null, hand, hand2];
    },
  };
  const vals = [[560, C.orange, 'Qualidade', 'selo'], [960, C.green, 'Frescor', 'folha'], [1360, C.greenShade, 'Pontualidade', 'relogio']].map(([x, color, word, ic], i) => {
    const n = N(s5.w, { x, y: 470, s: i ? 0 : 1 });
    const disc = el('circle', { r: 120, fill: color }, n.el);
    const icon = N(n.el, { s: 1 });
    const strokes = ICONS5[ic](icon.el);
    const label = textLine(s5.w, word, { x, y: 698, size: 54 });
    return { n, disc, icon, strokes, label, i };
  });
  vals[0].n.o = 0;
  tl.set(s5, { o: 1 }, SWAP5);
  tl.to(cover, { x: 560, y: 470, s: 7.5, duration: 0.85, ease: 'power3.out' }, SWAP5);
  tl.set(cover, { o: 0 }, SWAP5 + 0.85);
  tl.set(vals[0].n, { o: 1 }, SWAP5 + 0.85);
  const land5 = [SWAP5 + 0.82, bar(14, 2), bar(14, 3)];
  vals.forEach((v, i) => {
    const t = land5[i];
    if (i) {
      tl.fromTo(v.n, { y: 540 }, { y: 470, duration: 0.8, ease: 'power3.out', immediateRender: false }, t - 0.25);
      tl.to(v.n, { s: 1, duration: 0.75, ease: 'back.out(1.9)' }, t - 0.25);
    }
    const [a, b, hand, hand2] = v.strokes;
    tl.fromTo(a, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.8, ease: 'power2.inOut' }, t + 0.05);
    if (b) tl.fromTo(b, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.5, ease: 'power2.out' }, t + 0.55);
    if (hand) {
      tl.set([hand, hand2], { s: 0 }, 0);
      tl.to([hand, hand2], { s: 1, duration: 0.4, ease: 'back.out(2)' }, t + 0.4);
      tl.to(hand, { r: 360, duration: 1.6, ease: 'power2.inOut' }, t + 0.5);
      tl.to(hand2, { r: 30, duration: 1.6, ease: 'power2.inOut' }, t + 0.5);
    }
    showWords(v.label, t + 0.12, 1.0);
  });
  const float5 = { k: 1 };

  /* ---- S5 → logo: the three colours fly into the shapes of the original logo */
  vals.forEach(v => hideWords(v.label, 47.15 + v.i * 0.06));
  vals.forEach(v => tl.to(v.icon, { s: 0, duration: 0.45, ease: 'back.in(2)' }, 47.3 + v.i * 0.05));
  tl.to(float5, { k: 0, duration: 0.6, ease: 'none' }, 47.4);
  const CR = 150, cAng = a => [OX + CR * Math.cos(a * Math.PI / 180), OY + CR * Math.sin(a * Math.PI / 180)];
  const A0 = LOGO.crescent.a0 - 8, A1 = LOGO.crescent.a1 + 6;
  const [c2x, c2y] = cAng(A0);
  const stemBase = [LX + (LOGO.stem[0] + LOGO.stem[2]) / 2, LY + LOGO.stem[3] - 10];
  const M0 = 47.6, MD = 1.55;
  tl.to(vals[0].n, { x: OX, y: OY, s: LOGO.or / 120, duration: MD, ease: 'power3.inOut' }, M0);
  tl.to(vals[1].n, { x: c2x, y: c2y, s: 0.17, duration: MD, ease: 'power3.inOut' }, M0 + 0.06);
  tl.to(vals[2].n, { x: stemBase[0], y: stemBase[1], s: 0.15, duration: MD, ease: 'power3.inOut' }, M0 + 0.12);

  /* ================================================================ S6 · logo original + assinatura (49–60 s) */
  const s6 = scene(world);
  const endCard = N(s6.w, { x: 960, y: 540 });
  const ec = el('g', { transform: 'translate(-960,-540)' }, endCard.el);
  const logoG = el('g', { transform: `translate(${LX},${LY})` }, ec);
  const mk = (id) => el('mask', { id, maskUnits: 'userSpaceOnUse', x: -200, y: -200, width: 1000, height: 1000 }, defs);
  // stem: rises from the soil
  const vf = el('linearGradient', { id: 'vfeather', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }, vf);
  el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 1 }, vf);
  const mStem = mk('mStem');
  const stemSolid = el('rect', { x: 0, y: 600, width: 560, height: 700, fill: '#fff' }, mStem);
  const stemFeather = el('rect', { x: 0, y: 560, width: 560, height: 40, fill: 'url(#vfeather)' }, mStem);
  // leaves: open from where they meet the stem
  const rf = el('radialGradient', { id: 'rfeather' }, defs);
  el('stop', { offset: 0.78, 'stop-color': '#fff', 'stop-opacity': 1 }, rf);
  el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }, rf);
  const leafMask = (id, b) => { const m = mk(id); return el('circle', { cx: b[0] + 6, cy: b[1] + 4, r: 0, fill: 'url(#rfeather)' }, m); };
  const mLeafT = leafMask('mLeafT', LOGO.leafTop.base), mLeafB = leafMask('mLeafB', LOGO.leafBottom.base);
  // crescent: swept around the orange circle
  const mCres = mk('mCres');
  const cresSector = el('path', { d: '', fill: '#fff' }, mCres);
  const part = (name, mask) => {
    const n = N(logoG, { o: mask ? 1 : 0 });
    const g = el('g', mask ? { mask: `url(#${mask})` } : {}, n.el);
    el('image', { href: `assets/logo/part-${name}.png`, x: 0, y: 0, width: LOGO.size, height: LOGO.size }, g);
    return n;
  };
  const pStem = part('stem', 'mStem'), pLeafT = part('leafTop', 'mLeafT'), pLeafB = part('leafBottom', 'mLeafB');
  const pCres = part('crescent', 'mCres'), pOrange = part('orange', null);
  const fullLogo = N(logoG, { o: 0 });
  el('image', { href: 'assets/logo/logo-full.png', x: 0, y: 0, width: LOGO.size, height: LOGO.size }, fullLogo.el);
  const rev = { stem: 0, lt: 0, lb: 0, cres: 0 };

  const name1 = N(ec, { x: 960, y: 742 });
  const pomarClip = uid('pc');
  el('rect', { x: -400, y: -100, width: 800, height: 128 }, el('clipPath', { id: pomarClip }, defs));
  const pomarIn = N(el('g', { 'clip-path': `url(#${pomarClip})` }, name1.el), { y: 130 });
  el('text', { x: 6, y: 0, 'text-anchor': 'middle', 'font-family': 'Outfit', 'font-weight': 700, 'font-size': 112, 'letter-spacing': 12, fill: C.greenShade }, pomarIn.el).textContent = 'POMAR';
  const distT = el('text', { x: 975, y: 800, 'text-anchor': 'middle', 'font-family': 'Outfit', 'font-weight': 500, 'font-size': 31, 'letter-spacing': 30, fill: C.orange, opacity: 0 }, ec);
  distT.textContent = 'DISTRIBUIDORA';
  const tag = textLine(ec, 'Do pomar até você.', { x: 960, y: 884, size: 40, weight: 400, fill: C.sub });

  tl.set(s6, { o: 1 }, M0);
  tl.to(pOrange, { o: 1, duration: 0.3, ease: 'none' }, M0 + MD - 0.05);
  tl.set(vals[0].n, { o: 0 }, M0 + MD + 0.3);
  const RV = M0 + MD;                                            // 49.15
  tl.to(rev, { cres: 1, duration: 1.45, ease: 'power2.inOut' }, RV + 0.05);
  tl.to(vals[1].n, { s: 0, duration: 0.35, ease: 'power2.in' }, RV + 1.2);
  tl.to(rev, { stem: 1, duration: 1.15, ease: 'power2.out' }, RV + 0.15);
  tl.to(vals[2].n, { s: 0, duration: 0.4, ease: 'power2.in' }, RV + 0.15);
  tl.to(rev, { lt: 1, duration: 0.75, ease: 'power2.out' }, RV + 0.85);
  tl.to(rev, { lb: 1, duration: 0.75, ease: 'power2.out' }, RV + 1.0);
  const DONE = RV + 1.8;                                         // ≈ 50.95: whole original logo on screen
  tl.set(fullLogo, { o: 1 }, DONE);
  tl.set([pStem, pLeafT, pLeafB, pCres, pOrange], { o: 0 }, DONE + 0.02);
  tl.to(pomarIn, { y: 0, duration: 1.1, ease: 'power4.out' }, DONE + 0.05);
  tl.to(distT, { attr: { 'letter-spacing': 13.5, x: 966.75 }, opacity: 1, duration: 1.6, ease: 'power3.out' }, DONE + 0.35);
  showWords(tag, bar(17) + 0.05, 1.2, 0.09);
  tl.to(endCard, { s: 1.035, duration: DUR - DONE - 0.1, ease: 'sine.inOut' }, DONE + 0.1);
  tl.set({}, {}, DUR);                                           // timeline length = 60 s
  Object.assign(CUES, { sunPop: 0.42, hubPin: 38.82, wipe: COVER, cratePop: 28.5, iris: 29.3, crateLand: 30.65, truckGo: drive.t0,
    truckExit: 37.2, mapPan: 38.0, cover: SWAP5, values: land5, merge: M0, logoDone: DONE, tagline: bar(17) + 0.05 });

  /* ================================================================ per-frame procedural state */
  const lerp = (a, b, k) => a + (b - a) * k;
  function update(t) {
    // S1 life
    sun1.as = 0.012 * Math.sin(t * 2.1);
    sprouts.forEach((sp, i) => { sp.n.ar = Math.sin(t * 1.5 + i * 0.8) * 3.2; });
    // S2 wind
    treeA.canopy.ar = Math.sin(t * 0.95) * 0.7;
    treeB.canopy.ar = Math.sin(t * 0.95 + 1.2) * 0.9;
    const windIn = Math.min(1, Math.max(0, (t - 10.9) / 1.4));
    fruitsA.concat(fruitsB).forEach((f, i) => {
      const hang = (f.hangT === undefined || t < f.hangT ? 1 : 0) * windIn;
      f.ax = hang * Math.sin(t * 1.25 + i * 0.9) * 2.2;
      f.ar = hang * Math.sin(t * 1.25 + i * 0.9 + 0.6) * 4;
    });
    // S3 orbit
    const M = items.length;
    const base = -0.55 + t * 0.2 + orbit.spin * 2.4;
    for (const it of items) {
      const th = base + it.i * 2 * Math.PI / M;
      const m = (1 + (1 - it.k) * 1.7) * orbit.R;
      const depth = (Math.sin(th) + 1) / 2;
      it.n.x = 960 + Math.cos(th) * 800 * m;
      it.n.y = orbit.cy + Math.sin(th) * 282 * m;
      it.n.s = (0.64 + 0.4 * depth) * it.k * orbit.sc;
      if (t < 29.18) it.n.o = Math.min(1, it.k * 1.6);
      it.spin.r = Math.sin(t * 0.9 + it.i * 1.7) * 10;
      it.spin.ay = Math.sin(t * 1.3 + it.i) * 5;
      it.depth = depth;
      const want = Math.sin(th) > 0 ? orbitFront : orbitBack;
      if (it.n.el.parentNode !== want) want.appendChild(it.n.el);
    }
    for (const layer of [orbitBack, orbitFront]) {
      const kids = items.filter(it => it.n.el.parentNode === layer).sort((a, b) => a.depth - b.depth);
      kids.forEach(it => layer.appendChild(it.n.el));
    }
    // S4 drive
    irisCircle.setAttribute('r', iris.r.toFixed(1));
    if (t > 30.6 && iris.r > 1500) s4.w.removeAttribute('clip-path'); else s4.w.setAttribute('clip-path', `url(#${irisId})`);
    const d = driveDist(t);
    far.x = -((d * 0.12) % 960);
    row.x = -((d * 0.4) % 780);
    dashes.x = -((d * 1.0) % 200);
    tufts.x = -((d * 1.35) % 320);
    clouds.forEach((c, i) => { c.x = (((CLOUDX[i] + 200 - d * 0.05 - t * 6) % 2300) + 2300) % 2300 - 200; });
    const moving = Math.min(1, Math.max(0, (t - drive.t0) / drive.ramp));
    trk.body.ay = moving * (Math.sin(t * 2 * Math.PI * 1.9) * 1.3 + Math.sin(t * 2 * Math.PI * 4.3) * 0.5);
    const roll = (d + (trk.n.x - 830)) / (2 * Math.PI * 46 * trk.n.s) * 360;
    trk.wheels.forEach(w => { w.r = roll; });
    sun4.as = 0.015 * Math.sin(t * 1.7);
    // map route
    const p = rp.p;
    route.setAttribute('stroke-dasharray', `${(routeLen * p).toFixed(1)} ${routeLen + 50}`);
    route.setAttribute('opacity', p > 0.002 ? 1 : 0);
    const q = route.getPointAtLength(routeLen * p);
    dot.x = q.x; dot.y = q.y;
    stops.forEach(st => { st.p.ar = 0; });
    // S5 float
    vals.forEach(v => { v.n.ay = float5.k * Math.sin(t * 1.6 + v.i * 1.1) * 5; });
    // logo reveal masks (in logo image pixels)
    const sTop = LOGO.stem[1] - 30, sBot = LOGO.stem[3] + 30;
    const edge = lerp(sBot, sTop, rev.stem);
    stemSolid.setAttribute('y', edge.toFixed(2));
    stemFeather.setAttribute('y', (edge - 40).toFixed(2));
    mLeafT.setAttribute('r', (rev.lt * 110).toFixed(2));
    mLeafB.setAttribute('r', (rev.lb * 120).toFixed(2));
    const ang = lerp(A0, A1, rev.cres);
    const cx = LOGO.ox, cy = LOGO.oy, R = 260;
    const a0r = (A0 - 4) * Math.PI / 180, a1r = ang * Math.PI / 180;
    cresSector.setAttribute('d', rev.cres <= 0 ? '' :
      `M${cx},${cy} L${cx + R * Math.cos(a0r)},${cy + R * Math.sin(a0r)} A${R},${R} 0 ${ang - A0 + 4 > 180 ? 1 : 0} 1 ${cx + R * Math.cos(a1r)},${cy + R * Math.sin(a1r)} Z`);
    if (rev.cres > 0 && t < RV + 1.6) {                      // green dot leads the sweep
      const [x, y] = cAng(lerp(A0, A1, Math.min(1, rev.cres * 1.04)));
      vals[1].n.x = x; vals[1].n.y = y;
    }
  }

  function seek(t) {
    tl.seek(Math.max(0, Math.min(DUR, t)), false);
    update(t);
    flush();
  }
  window.__seek = seek;
  window.__duration = DUR;
  window.__cues = CUES;
  seek(0);
  window.__ready = true;

  // live preview in a normal browser: index.html?play  or  index.html?t=12.5
  const qs = new URLSearchParams(location.search);
  if (qs.has('t')) seek(parseFloat(qs.get('t')));
  if (qs.has('play')) {
    const audio = new Audio('output/trilha-pomar.wav');
    let t0 = null;
    const loop = now => {
      if (t0 === null) t0 = now;
      const t = ((now - t0) / 1000) % DUR;
      seek(t);
      requestAnimationFrame(loop);
    };
    document.addEventListener('click', () => { audio.currentTime = 0; audio.play(); t0 = null; });
    requestAnimationFrame(loop);
  }
})();
