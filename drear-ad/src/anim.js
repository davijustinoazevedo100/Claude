// "Opium 5 / Drear" — 60 s launch film for Gravity.Ai, in the style of the xAI
// "The X Subscription" spot: white ground, hairline panels with zoomed outline crops,
// corner-split transitions with dashed guides, outline -> solid icon conversions and
// quiet sans-serif titles whose word gap closes in.
//
// Everything is a pure function of time: window.renderFrame(t) paints the frame at t
// seconds, so the film can be rendered frame-exactly at any frame rate.
(function () {
  const W = 1920, H = 1080, DURATION = 120;
  // names on screen (change here to rename; the giant letter crops follow MODEL too)
  const MODEL = 'Opium 5', PRODUCT = 'Drear', BRAND = 'Gravity.Ai';
  const lastWordSplit = (s) => { const i = s.lastIndexOf(' '); return i < 0 ? [s] : [s.slice(0, i), s.slice(i + 1)]; };
  const COL = { bg: '#ffffff', panel: '#fbfbfb', ink: '#000000', guide: '#cacaca', eye: '#ffffff' };
  const LW = 2;
  const FONT = 'IDR';
  const BOX = { x: 600, y: 180, s: 720 };            // the big centred panel
  let ctx, G;

  // ------------------------------------------------------------------ maths / easing
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, x) => a + (b - a) * x;
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const E = {
    outCubic: (x) => 1 - (1 - x) ** 3,
    inCubic: (x) => x * x * x,
    ioCubic: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
    outQuart: (x) => 1 - (1 - x) ** 4,
    inQuart: (x) => x ** 4,
    ioQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
    outQuint: (x) => 1 - (1 - x) ** 5,
    ioQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2),
    outExpo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
    inExpo: (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
    ioExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
    outBack: (x, s = 1.70158) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
    inBack: (x, s = 1.70158) => (s + 1) * x ** 3 - s * x * x,
  };
  // damped spring 0 -> 1 (overshoots), x = time since start (s)
  const spring = (x, f = 2.2, z = 0.28) => (x <= 0 ? 0 : 1 - Math.exp(-z * 2 * Math.PI * f * x) * Math.cos(2 * Math.PI * f * Math.sqrt(1 - z * z) * x));
  // a quick blink envelope (0 open .. 1 closed)
  const blink = (t, tb, d = 0.2) => {
    if (t < tb || t > tb + d) return 0;
    const x = (t - tb) / d;
    return x < 0.35 ? E.outCubic(x / 0.35) : 1 - E.ioCubic((x - 0.35) / 0.65);
  };

  // ------------------------------------------------------------------ drawing primitives
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (Array.isArray(r)) ctx.roundRect(x, y, w, h, r.map((v) => Math.max(0, Math.min(v, w / 2, h / 2))));
    else ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  }
  // a panel: off-white fill, clipped artwork, 2px black hairline
  function panel(x, y, w, h, art, radius) {
    if (w < 0.75 || h < 0.75) return;
    const r = radius !== undefined ? radius : Math.min(6, w * 0.22);
    rr(x, y, w, h, r);
    ctx.fillStyle = COL.panel; ctx.fill();
    if (art) { ctx.save(); rr(x, y, w, h, r); ctx.clip(); art(x, y, w, h); ctx.restore(); }
    rr(x, y, w, h, r);
    ctx.lineWidth = LW; ctx.strokeStyle = COL.ink; ctx.stroke();
  }
  function guide(x, y, w, h, alpha = 1) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setLineDash([10, 10]); ctx.lineDashOffset = 0;
    rr(x, y, w, h, 6);
    ctx.lineWidth = LW; ctx.strokeStyle = COL.guide; ctx.stroke();
    ctx.restore();
  }
  function ring(cx, cy, r, alpha = 1, dashed = true) {
    if (alpha <= 0 || r <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha;
    if (dashed) ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = LW; ctx.strokeStyle = dashed ? COL.guide : COL.ink; ctx.stroke();
    ctx.restore();
  }
  // unit-space Path2D at (x, y), k px per unit
  function shape(path, x, y, k, mode = 'fill', rot = 0) {
    if (k <= 0.01) return;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(k, k);
    if (mode === 'fill') { ctx.fillStyle = COL.ink; ctx.fill(path, 'evenodd'); }
    else { ctx.lineWidth = LW / k; ctx.lineJoin = 'round'; ctx.strokeStyle = COL.ink; ctx.stroke(path); }
    ctx.restore();
  }

  // ------------------------------------------------------------------ subjects
  // Drear: unit = cloud height. o: {mode, blink, lx, ly (look -1..1), sx, sy (squash), eyeFill}
  function drear(x, y, k, o = {}) {
    if (k <= 0.01) return;
    const mode = o.mode || 'fill';
    const sx = o.sx || 1, sy = o.sy || 1;
    ctx.save();
    ctx.translate(x, y + 0.5 * k * (1 - sy));     // squash around the bottom edge
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(sx, sy);
    ctx.save(); ctx.scale(k, k);
    if (mode === 'fill') { ctx.fillStyle = COL.ink; ctx.fill(G.drear.body); }
    else { ctx.lineWidth = LW / (k * Math.sqrt(sx * sy)); ctx.strokeStyle = COL.ink; ctx.stroke(G.drear.body); }
    ctx.restore();
    const b = clamp01(o.blink || 0), lx = o.lx || 0, ly = o.ly || 0;
    for (const e of G.drear.eyes) {
      const w = e.w * k, h = Math.max(e.h * k * (1 - 0.9 * b), w * 0.28);
      const ex = (e.x + lx * e.w * 0.42) * k, ey = (e.y + ly * e.h * 0.16 + 0.04 * e.h * b) * k;
      rr(ex - w / 2, ey - h / 2, w, h, Math.min(w, h) / 2);
      if (mode === 'fill') { ctx.fillStyle = o.eyeFill || COL.eye; ctx.fill(); }
      else { ctx.lineWidth = LW / Math.sqrt(sx * sy); ctx.strokeStyle = COL.ink; ctx.stroke(); }
    }
    ctx.restore();
  }

  // Gravity mark with articulated arms. unit = full mark extent.
  // lobes: [{a: angle, r: distance (unit)}], ext: neck extension 0..1 (applies to lobes at r = D)
  function neckHalf(s) {
    const N = G.grav.neck;
    if (s <= N[0][0]) return G.grav.w;
    for (let i = 1; i < N.length; i++) if (N[i][0] >= s) {
      const f = (s - N[i - 1][0]) / (N[i][0] - N[i - 1][0]);
      return lerp(N[i - 1][1], N[i][1], f);
    }
    return N[N.length - 1][1];
  }
  function gravityLive(x, y, k, lobes, ext, scaleLobe = 1) {
    const g = G.grav;
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(0, 0, g.hubR * k, 0, Math.PI * 2); ctx.fill();
    for (const L of lobes) {
      const ca = Math.cos(L.a), sa = Math.sin(L.a);
      ctx.beginPath(); ctx.arc(ca * L.r * k, sa * L.r * k, g.R * k * scaleLobe, 0, Math.PI * 2); ctx.fill();
      if (ext > 0.001 && Math.abs(L.r - g.D) < 1e-4) {
        // neck drawn from s0 (grows out of the lobe towards the hub as ext -> 1)
        const N = g.neck, sB = N[N.length - 1][0];
        const s0 = lerp(sB, 0, ext);
        const pts = [];
        const steps = 48;
        for (let i = 0; i <= steps; i++) { const s = lerp(s0, sB + 0.004, i / steps); pts.push([s, neckHalf(s)]); }
        ctx.save(); ctx.rotate(L.a); ctx.scale(k, k);
        ctx.beginPath();
        pts.forEach(([s, h], i) => (i ? ctx.lineTo(s, -h) : ctx.moveTo(s, -h)));
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath(); ctx.fill();
        if (ext < 0.999) { ctx.beginPath(); ctx.arc(s0, 0, neckHalf(s0), 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ text
  let CAP = 0.727;
  function font(size, weight) { ctx.font = `${size}px ${weight || FONT}`; ctx.letterSpacing = `${(-0.012 * size).toFixed(2)}px`; }
  function measure(s, size) { font(size); return ctx.measureText(s).width; }
  // a line of word groups; gaps[i] = extra px before group i; anchor: 'center' | 'left'
  // items may be {mark: true, size} for an inline Gravity mark
  function textLine(items, x, cy, size, o = {}) {
    font(size);
    const space = ctx.measureText(' ').width;
    const widths = items.map((it) => (typeof it === 'string' ? ctx.measureText(it).width : it.w));
    const gaps = o.gaps || [];
    let total = widths.reduce((a, b) => a + b, 0) + space * (items.length - 1);
    for (let i = 1; i < items.length; i++) total += gaps[i] || 0;
    let cx = o.anchor === 'left' ? x : x - total / 2;
    const base = cy + (CAP * size) / 2;
    ctx.save();
    ctx.fillStyle = COL.ink; ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    items.forEach((it, i) => {
      if (i) cx += space + (gaps[i] || 0);
      if (typeof it === 'string') { font(size); ctx.fillText(it, cx, base); }
      else if (it.mark) shape(G.gravity, cx + it.w / 2, cy, it.w, 'fill');
      cx += widths[i];
    });
    ctx.restore();
    return total;
  }
  // gap that closes like the reference's end title
  const gapClose = (t, t0, size, d = 0.7, amount = 1.05) => (1 - E.outExpo(seg(t, t0, t0 + d))) * amount * size;

  // ------------------------------------------------------------------ crops (zoomed outline art)
  // crop = {draw(k) : paints subject at origin with k px/unit, vx, vy, span, rot, zoom}
  function cropArt(c, t) {
    return (x, y, w, h) => {
      const span = c.span * (1 - (c.zoom || 0.03) * Math.max(0, t - (c.t0 || 0)));
      const k = w / span;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      if (c.rot) ctx.rotate(c.rot);
      ctx.translate(-c.vx * k, -c.vy * k);
      c.draw(k, t);
      ctx.restore();
    };
  }
  const markCrop = (path) => (k) => shape(path, 0, 0, k, 'line');
  const glyphCrop = (txt) => (k) => {
    ctx.save(); ctx.font = `${k}px ${FONT}`; ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic'; ctx.lineWidth = LW; ctx.strokeStyle = COL.ink; ctx.lineJoin = 'round';
    ctx.strokeText(txt, 0, 0);
    ctx.restore();
  };
  const drearCrop = (blinks = []) => (k, t) => {
    let b = 0; for (const tb of blinks) b = Math.max(b, blink(t, tb, 0.24));
    drear(0, 0, k, { mode: 'line', blink: b });
  };

  // ------------------------------------------------------------------ the big panel sequences
  // initial growth from the bottom-left corner of BOX
  const growSize = (t, t0) => BOX.s * (0.95 * E.ioExpo(seg(t, t0, t0 + 1.05)) + 0.05 * E.outCubic(seg(t, t0 + 0.8, t0 + 1.7)));
  // corner split progress (new square grows from bottom-left, old shrinks to top-right)
  const splitU = (t, ts) => 0.93 * E.ioExpo(seg(t, ts, ts + 0.7)) + 0.07 * E.outCubic(seg(t, ts + 0.55, ts + 1.15));

  // seq = {tGrow, crops:[{t0 (split time; first = tGrow), ...crop}], tEnd}
  function drawSequence(seq, t) {
    const cs = seq.crops;
    let i = 0;
    while (i + 1 < cs.length && t >= cs[i + 1].t0) i++;
    const S = BOX.s, x0 = BOX.x, y0 = BOX.y;
    if (i === 0) {
      const s = growSize(t, cs[0].t0);
      panel(x0, y0 + S - s, s, s, cropArt(cs[0], t));
      return;
    }
    const u = splitU(t, cs[i].t0);
    const sn = S * u, so = S * (1 - u);
    if (u < 0.999) guide(x0, y0, S, S);
    panel(x0 + S - so, y0, so, so, cropArt(cs[i - 1], t));
    panel(x0, y0 + S - sn, sn, sn, cropArt(cs[i], t));
  }
  const panelRight = (seq, t) => BOX.x + growSize(t, seq.crops[0].t0);
  const wipeAlpha = (seq, t) => 1 - seg(growSize(t, seq.crops[0].t0) / BOX.s, 0.72, 0.9);
  function wipeClip(seq, t) {
    const s = growSize(t, seq.crops[0].t0);
    const right = BOX.x + s, top = BOX.y + BOX.s - s;
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(0, top, right, H - top); ctx.clip('evenodd');
  }

  // ------------------------------------------------------------------ timeline
  const T = {
    title1: 0.3, grow1: 2.5, split1: [4.5, 6.0, 7.0, 7.5], fan: 8.0,
    conv: [10.5, 10.25, 10.0, 9.75],               // conversion time per family icon (0..3)
    merge: 12.0, mergeEnd: 12.4, text2: 13.0, text2Out: 16.0,
    orbitIn: 16.6, orbit0: 17.0, orbit1: 20.6, orbitOut: 21.15,
    words: [22.0, 23.0, 24.0, 25.0], lockup1: 26.0, collapse1: 29.3,
    demo1: 30.0,                                   // someone using Opium 5 (src/demos.js)
    drear: 60.0, title2: 60.3, grow2: 63.0, split2: [65.5, 66.75, 67.75], grid: 68.75, drearSolid: 69.65,
    tasks: [70.0, 70.5, 71.0, 71.5, 71.875, 72.25, 72.5, 72.75], gridEnd: 73.25,
    ring: 73.5, absorb: 75.6, gulp: 76.1, text3: 77.25, text4: 80.25,
    demo2: 83.5,                                   // someone using Drear (src/demos.js)
    final: 113.5, footer: 115.0,
  };
  T.blinks = [T.drear + 1.2, T.drear + 2.75, T.grow2 + 1.55, T.split2[1] + 0.45, T.split2[2] + 0.55,
    T.ring + 0.65, T.gulp + 0.45, T.text3 + 1.35, T.text4 + 1.65, T.final + 3.1, T.final + 5.5];
  window.CUES = T;

  // part 1 crop sequence
  const SEQ1 = { crops: [] };
  const SEQ2 = { crops: [] };
  function buildSequences() {
    // glyph metrics for the giant letter crops (unit = font size)
    ctx.font = `1000px ${FONT}`; ctx.letterSpacing = '0px';
    const m = (s) => { const q = ctx.measureText(s); return { l: -q.actualBoundingBoxLeft / 1000, r: q.actualBoundingBoxRight / 1000, t: -q.actualBoundingBoxAscent / 1000, b: q.actualBoundingBoxDescent / 1000 }; };
    const L1 = MODEL[0], L2 = MODEL[MODEL.length - 1];
    const mO = m(L1), m5 = m(L2), mi = m('i');
    const at = (mm, fx, fy) => [lerp(mm.l, mm.r, fx), lerp(mm.t, mm.b, fy)];
    const rad = Math.PI / 180;
    const [oX, oY] = at(mO, 0.86, 0.2);
    const [fX, fY] = at(m5, 0.72, 0.66);
    const [iX, iY] = at(mi, 0.5, 0.1);
    SEQ1.crops = [
      { t0: T.grow1, draw: markCrop(G.gravity), vx: 0.17, vy: -0.13, span: 0.30, rot: 0, zoom: 0.02, mrot: -45 * rad },
      { t0: T.split1[0], draw: glyphCrop(L1), vx: oX, vy: oY, span: 0.46, rot: -8 * rad },
      { t0: T.split1[1], draw: glyphCrop(L2), vx: fX, vy: fY, span: 0.42, rot: 0 },
      { t0: T.split1[2], draw: markCrop(G.gravity), vx: 0, vy: 0, span: 0.34, rot: 0, zoom: 0.06 },
      { t0: T.split1[3], draw: glyphCrop('i'), vx: iX, vy: iY + 0.12, span: 0.5, rot: 12 * rad },
    ];
    // the first crop shows one arm turned to the diagonal
    const c0 = SEQ1.crops[0];
    c0.draw = (k) => shape(G.gravity, 0, 0, k, 'line', -45 * rad);
    SEQ2.crops = [
      { t0: T.grow2, draw: drearCrop([T.grow2 + 1.55]), vx: 0.0, vy: 0.012, span: 0.44, rot: -16 * rad },
      { t0: T.split2[0], draw: drearCrop(), vx: 0.06, vy: -0.33, span: 0.66, rot: 9 * rad },
      { t0: T.split2[1], draw: drearCrop([T.split2[1] + 0.45]), vx: -0.2, vy: 0.13, span: 0.62, rot: -7 * rad },
      { t0: T.split2[2], draw: drearCrop([T.split2[2] + 0.55]), vx: 0, vy: 0, span: 1.32, rot: 0, zoom: 0.02 },
    ];
  }

  // ------------------------------------------------------------------ PART 1 — Opium 5
  const TITLE = 92;

  function p1Title(t) {
    if (t < T.title1 || t > T.grow1 + 1.3) return;
    ctx.save();
    let a = 1;
    if (t >= T.grow1) { wipeClip(SEQ1, t); a = wipeAlpha(SEQ1, t); }
    if (a > 0) textLine(['Introducing', MODEL], W / 2, H / 2, TITLE, { gaps: [0, gapClose(t, T.title1, TITLE)], alpha: a });
    ctx.restore();
  }

  // family staircase -> solid row -> merged mark
  const FAM_ICON = 185, FAM_GAP = 235;
  function famRowX(i, t) {
    const contract = E.ioCubic(seg(t, T.conv[0] + 0.3, T.merge)) * 0.14;
    const merge = E.inQuart(seg(t, T.merge, T.mergeEnd));
    return W / 2 + (i - 1.5) * FAM_GAP * (1 - contract) * (1 - merge);
  }
  function p1Family(t) {
    if (t < T.fan || t > T.text2Out + 0.7) return;
    const fam = G.gravityFamily;
    const step = 145, size = 243;
    const pFanBase = seg(t, T.fan + 0.04, T.fan + 0.42);
    const drift = E.ioCubic(seg(t, T.fan + 0.4, T.conv[0] + 0.2));
    const sc = 1 - 0.15 * drift;
    const slide = E.ioCubic(seg(t, T.conv[3], T.conv[0] + 0.3)) * 60;   // staircase moves out of the row's way
    const crops = [
      { vx: 0.0, vy: -0.16, span: 0.78 }, { vx: 0.1, vy: -0.1, span: 0.84 },
      { vx: 0.08, vy: 0.0, span: 0.88 }, { vx: 0, vy: 0, span: 0.82 },
    ];
    // panels (bottom-left first so the top-right one sits on top)
    for (let i = 0; i < 4; i++) {
      if (t >= T.conv[i]) continue;
      const p = E.outQuart(clamp01((pFanBase - (3 - i) * 0.08) / 0.76));
      const cx = W / 2 + (i - 1.5) * step * p * sc - slide, cy = H / 2 - (i - 1.5) * step * p * sc + slide;
      const s = lerp(560, size, p) * sc;
      const c = Object.assign({ t0: T.fan, zoom: 0.04, draw: markCrop(fam[i]) }, crops[i]);
      panel(cx - s / 2, cy - s / 2, s, s, cropArt(c, t));
    }
    // solid icons flying into a row, then merging into the full mark
    for (let i = 0; i < 4; i++) {
      if (t < T.conv[i]) continue;
      const p = E.outQuart(seg(t, T.conv[i], T.conv[i] + 0.42));
      const fromX = W / 2 + (i - 1.5) * step * sc - slide, fromY = H / 2 - (i - 1.5) * step * sc + slide;
      const x = lerp(fromX, famRowX(i, t), p), y = lerp(fromY, H / 2, p);
      const pop = 1 + 0.12 * Math.sin(Math.PI * seg(t, T.conv[i], T.conv[i] + 0.3));
      const k = FAM_ICON * lerp(0.75, 1, E.outBack(seg(t, T.conv[i], T.conv[i] + 0.3))) * pop;
      if (t < T.mergeEnd) shape(fam[i], x, y, k, 'fill');
    }
    if (t >= T.mergeEnd) {
      // merged mark: pop, then rise to make room for the text, then centre again
      const pop = spring(t - T.mergeEnd, 2.6, 0.3);
      const up = E.ioCubic(seg(t, T.text2 - 0.25, T.text2 + 0.35));
      const back = E.ioCubic(seg(t, T.text2Out, T.text2Out + 0.6));
      const k = lerp(lerp(FAM_ICON, 230, up), 360, back) * lerp(1.18, 1, pop);
      const y = lerp(lerp(H / 2, 405, up), H / 2, back);
      if (t < T.orbitIn) shape(G.gravity, W / 2, y, k, 'fill');
    }
  }

  function p1Text2(t) {
    if (t < T.text2 || t > T.text2Out + 0.3) return;
    const a = 1 - seg(t, T.text2Out, T.text2Out + 0.22);
    const dy = 18 * E.inCubic(seg(t, T.text2Out, T.text2Out + 0.22));
    textLine(['A new family', 'of models'], W / 2, 700 + dy, TITLE, { gaps: [0, gapClose(t, T.text2, TITLE)], alpha: a });
  }

  // orbit: lobes detach, swing round on dashed orbits, come home
  function p1Orbit(t) {
    if (t < T.orbitIn || t > T.words[0] - 0.05) return;
    const g = G.grav, k = 360;
    const ext = (1 - E.ioCubic(seg(t, T.orbitIn, T.orbit0))) + E.ioCubic(seg(t, T.orbit1 + 0.12, T.orbitOut));
    const p = seg(t, T.orbit0, T.orbit1);
    const out = E.ioCubic(seg(p, 0, 0.28)) * (1 - E.ioCubic(seg(p, 0.72, 1)));
    const f = [1.3, 1.85, 2.4, 2.95];
    const spin = E.ioQuart(p);
    const lobes = [];
    for (let i = 0; i < 4; i++) {
      const a0 = -Math.PI / 2 + i * Math.PI / 2;
      const r = g.D * (1 + (f[i] - 1) * out);
      const a = a0 + 2 * Math.PI * 2 * spin - out * 0.95 * (f[i] - 1);
      lobes.push({ a, r: p > 0 && p < 1 ? r : g.D, a0, f: f[i] });
      // dashed orbit + short motion trail
      ring(W / 2, H / 2, r * k, out);
      if (out > 0.02) {
        const vel = 2 * (spin - E.ioQuart(Math.max(0, p - 0.02)));
        const len = Math.min(1.4, vel * 40);
        if (len > 0.02) {
          ctx.save(); ctx.globalAlpha = out; ctx.beginPath();
          ctx.arc(W / 2, H / 2, r * k, a - len, a); ctx.lineWidth = LW; ctx.strokeStyle = COL.ink; ctx.stroke(); ctx.restore();
        }
      }
    }
    const pop = t > T.orbitOut ? spring(t - T.orbitOut, 2.4, 0.32) : 1;
    const ks = t > T.orbitOut ? k * lerp(1.12, 1, pop) : k;
    const leave = E.inBack(seg(t, T.words[0] - 0.42, T.words[0] - 0.06), 2.2);
    const kk = ks * (1 - leave);
    if (kk > 0.5) gravityLive(W / 2, H / 2, kk, lobes.map((L) => ({ a: L.a, r: L.r })), clamp01(ext), 1 - 0.18 * out);
  }

  // single-word beats; letters close in
  function p1Words(t) {
    const words = ['Think.', 'Reason.', 'Code.', 'Create.'];
    for (let i = 0; i < 4; i++) {
      const t0 = T.words[i], t1 = i < 3 ? T.words[i + 1] : T.lockup1;
      if (t < t0 || t >= t1) continue;
      const size = 150;
      const pIn = E.outExpo(seg(t, t0, t0 + 0.55));
      font(size);
      ctx.letterSpacing = `${lerp(0.14, -0.015, pIn) * size}px`;
      ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.save();
      const s = 1 + 0.025 * seg(t, t0, t1);
      ctx.translate(W / 2, H / 2); ctx.scale(s, s);
      ctx.fillText(words[i], 0, (CAP * size) / 2);
      ctx.restore();
    }
  }

  function lockup1Layout(t) {
    const size = 128, mk = 150, gap = 46;
    const w = measure(MODEL, size);
    const total = mk + gap + w;
    return { size, mk, gap, x0: W / 2 - total / 2, w };
  }
  function p1Lockup(t) {
    if (t < T.lockup1 || t > T.drear) return;
    const L = lockup1Layout(t);
    const col = E.inBack(seg(t, T.collapse1, T.collapse1 + 0.45), 1.8);
    const s = 1 - col;
    if (s <= 0.002) return;
    ctx.save();
    const push = 1 + 0.035 * E.ioCubic(seg(t, T.lockup1 + 0.6, T.collapse1));
    ctx.translate(W / 2, H / 2 - 20); ctx.scale(s * push, s * push); ctx.translate(-W / 2, -(H / 2 - 20));
    const mp = spring(t - T.lockup1, 2.3, 0.33);
    shape(G.gravity, L.x0 + L.mk / 2, H / 2 - 20, L.mk * mp, 'fill');
    ctx.save();
    const r = L.x0 + L.mk / 2; ctx.beginPath(); ctx.rect(r, 0, W - r, H); ctx.clip();
    const slide = (1 - E.outExpo(seg(t, T.lockup1 + 0.08, T.lockup1 + 0.8))) * -90;
    textLine(lastWordSplit(MODEL), L.x0 + L.mk + L.gap + slide, H / 2 - 20, L.size,
      { anchor: 'left', gaps: [0, gapClose(t, T.lockup1 + 0.08, L.size, 0.8, 0.7)] });
    ctx.restore();
    const a = E.outCubic(seg(t, T.lockup1 + 0.75, T.lockup1 + 1.3));
    const dy = (1 - a) * 14;
    textLine(['by', BRAND], L.x0 + L.mk + L.gap + 4, H / 2 + 92 + dy, 40, { anchor: 'left', alpha: a });
    ctx.restore();
  }

  // ------------------------------------------------------------------ PART 2 — Drear
  const DREAR_H = 230;
  function drearIntroState(t) {
    const t0 = T.drear;
    const pIn = t - t0;
    const sc = spring(pIn, 1.9, 0.34);
    const sq = Math.sin(Math.min(1, pIn / 0.5) * Math.PI) * 0.1 * (1 - seg(pIn, 0.3, 0.8));
    let b = Math.max(blink(t, T.drear + 1.2), blink(t, T.drear + 2.75));
    let lx = 0;
    lx += -E.ioCubic(seg(t, t0 + 1.55, t0 + 1.8)) + E.ioCubic(seg(t, t0 + 1.95, t0 + 2.2)) * 2 - E.ioCubic(seg(t, t0 + 2.4, t0 + 2.6));
    return { k: DREAR_H * sc, sx: 1 + sq, sy: 1 - sq, blink: b, lx };
  }
  function p2Intro(t) {
    if (t < T.drear || t > T.grow2 + 1.3) return;
    ctx.save();
    let a = 1;
    if (t >= T.grow2) { wipeClip(SEQ2, t); a = wipeAlpha(SEQ2, t); }
    if (a <= 0) { ctx.restore(); return; }
    ctx.globalAlpha = a;
    const s = drearIntroState(t);
    drear(W / 2, 415, s.k, { sx: s.sx, sy: s.sy, blink: s.blink, lx: s.lx });
    if (t >= T.title2) textLine(['Introducing', PRODUCT], W / 2, 700, TITLE, { gaps: [0, gapClose(t, T.title2, TITLE)], alpha: a });
    ctx.restore();
  }

  // 3x3 grid of tasks around Drear
  const TASKS = ['code', 'globe', 'doc', 'chart', 'mail', 'calendar', 'image', 'search'];
  const RING_ORDER = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const CELL = 240;
  function lookAt(t) {
    // Drear's gaze while converting tasks
    let lx = 0, ly = 0;
    for (let i = 0; i < 8; i++) {
      const tc = T.tasks[i], tn = i < 7 ? T.tasks[i + 1] : T.gridEnd;
      const w = E.ioCubic(seg(t, tc - 0.22, tc - 0.06)) * (1 - E.ioCubic(seg(t, tn - 0.22, tn - 0.06)) * (i < 7 ? 1 : 1));
      const [gx, gy] = RING_ORDER[i];
      const nrm = Math.hypot(gx, gy);
      lx += (gx / nrm) * w; ly += (gy / nrm) * w;
    }
    return [lx, ly];
  }
  function p2Grid(t) {
    if (t < T.grid || t > T.text3 + 0.8) return;
    const x0 = BOX.x, y0 = BOX.y, S = BOX.s;
    const pSub = seg(t, T.grid, T.grid + 0.85);
    const cellsLive = t >= T.grid + 0.85;
    // Drear in the centre cell: outline shrinking in, then solid
    const kOutline = lerp(S / 1.32, CELL / 1.42, E.ioQuart(seg(pSub, 0, 0.5)));
    // gaze / hop
    let [lx, ly] = lookAt(t);
    let hop = 0;
    for (const tc of T.tasks) hop = Math.max(hop, Math.sin(Math.PI * seg(t, tc, tc + 0.22)) * 0.07);
    if (!cellsLive) {
      panel(x0, y0, S, S, (x, y, w, h) => {
        drear(x + w / 2, y + h / 2, kOutline, { mode: 'line' });
      });
      // grid lines growing from the middle
      ctx.save(); ctx.lineWidth = LW; ctx.strokeStyle = COL.ink;
      for (let j = 1; j <= 2; j++) {
        const p = E.outQuart(clamp01(seg(pSub, 0.4, 0.85) * 1.15 - (j - 1) * 0.15));
        const half = (S / 2) * p;
        ctx.beginPath();
        ctx.moveTo(x0 + j * CELL, y0 + S / 2 - half); ctx.lineTo(x0 + j * CELL, y0 + S / 2 + half);
        ctx.moveTo(x0 + S / 2 - half, y0 + j * CELL); ctx.lineTo(x0 + S / 2 + half, y0 + j * CELL);
        ctx.stroke();
      }
      ctx.restore();
      // icons scale in
      RING_ORDER.forEach(([gx, gy], i) => {
        const p = E.outBack(clamp01((pSub - 0.58 - i * 0.025) / 0.25));
        if (p > 0) shape(G.icons[TASKS[i]], x0 + (gx + 1.5) * CELL, y0 + (gy + 1.5) * CELL, 112 * p, 'line');
      });
      return;
    }
    // ring phase timing
    const pRing = E.ioCubic(seg(t, T.ring, T.ring + 0.6));
    const spinP = seg(t, T.ring + 0.4, T.gulp);
    const spin = 2 * Math.PI * 1.35 * E.inCubic(spinP);
    const absorb = E.inQuart(seg(t, T.absorb, T.gulp));
    const cx = W / 2, cy = H / 2;
    // cells (each an individual panel so they can dissolve one by one)
    const corner = (gx, gy) => [gx < 0 && gy < 0 ? 6 : 0, gx > 0 && gy < 0 ? 6 : 0, gx > 0 && gy > 0 ? 6 : 0, gx < 0 && gy > 0 ? 6 : 0];
    RING_ORDER.forEach(([gx, gy], i) => {
      if (t >= T.tasks[i]) return;
      panel(x0 + (gx + 1) * CELL, y0 + (gy + 1) * CELL, CELL, CELL, null, corner(gx, gy));
    });
    if (t < T.gridEnd) panel(x0 + CELL, y0 + CELL, CELL, CELL, null, 0);
    // icons
    RING_ORDER.forEach(([gx, gy], i) => {
      const tc = T.tasks[i];
      if (t >= T.gulp) return;
      const gxp = cx + gx * CELL, gyp = cy + gy * CELL;
      if (t < tc) { shape(G.icons[TASKS[i]], gxp, gyp, 112, 'line'); return; }
      const ang0 = Math.atan2(gy, gx);
      const R = 300 * (1 - absorb);
      const ang = ang0 + spin;
      const rx = cx + Math.cos(ang) * R, ry = cy + Math.sin(ang) * R;
      const x = lerp(gxp, rx, pRing), y = lerp(gyp, ry, pRing);
      const pop = 1 + 0.16 * Math.sin(Math.PI * seg(t, tc, tc + 0.28));
      const k = 112 * pop * lerp(1, 0.86, pRing) * (1 - absorb * 0.92);
      if (k > 1) shape(G.icons[TASKS[i]], x, y, k, 'fill');
    });
    // Drear
    if (t < T.drearSolid) {
      drear(cx, cy, kOutline, { mode: 'line' });
    } else {
      const wake = spring(t - T.drearSolid, 2.6, 0.32);
      let b = 1 - E.outCubic(seg(t, T.drearSolid + 0.1, T.drearSolid + 0.35));
      b = Math.max(b, blink(t, T.ring + 0.65), blink(t, T.gulp + 0.45));
      // gaze follows the ring while spinning
      if (t >= T.ring + 0.3) {
        const w = E.ioCubic(seg(t, T.ring + 0.3, T.ring + 0.7)) * (1 - E.ioCubic(seg(t, T.gulp - 0.15, T.gulp)));
        lx = lerp(lx, Math.cos(-Math.PI / 2 + spin * 1.0), w);
        ly = lerp(ly, Math.sin(-Math.PI / 2 + spin * 1.0), w);
      }
      const gulp = t >= T.gulp ? Math.exp(-(t - T.gulp) * 5) * Math.cos((t - T.gulp) * 22) : 0;
      const sq = hop + 0.14 * gulp;
      const toText = E.ioCubic(seg(t, T.text3 - 0.3, T.text3 + 0.3));
      const k = lerp(CELL / 1.42 * lerp(1.1, 1, wake), DREAR_H, toText) * (1 + 0.1 * E.outCubic(seg(t, T.ring, T.ring + 0.6)) * (1 - toText));
      const y = lerp(cy, 415, toText);
      if (t < T.text3 + 0.5) drear(cx, y, k, { blink: b, lx, ly, sx: 1 + sq, sy: 1 - sq });
    }
  }

  function drearFinalLayout() {
    const big = 170, small = 40, dh = 236, gap = 58;
    const tw = measure(PRODUCT, big);
    const dw = dh * G.drear.aspect;
    const total = dw + gap + tw;
    const x0 = W / 2 - total / 2;
    return { big, small, dh, dw, gap, tw, x0, dx: x0 + dw / 2, tx: x0 + dw + gap, cy: 500 };
  }
  // Drear on its own between the grid and the end card
  function p2Hero(t) {
    if (t < T.text3 + 0.5) return;
    if (t >= T.demo2 && t < T.final) return;          // meanwhile Drear lives in the demo window
    const L = drearFinalLayout();
    const p = E.ioQuart(seg(t, T.final, T.final + 0.75));
    const x = lerp(W / 2, L.dx, p), y = lerp(415, L.cy, p), k = lerp(DREAR_H, L.dh, p);
    let b = Math.max(blink(t, T.text3 + 1.35), blink(t, T.text4 + 1.65), blink(t, T.final + 3.1), blink(t, T.final + 5.5));
    let lx = 0, ly = 0;
    // reads the text, then looks back at us
    lx += E.ioCubic(seg(t, T.final + 4.0, T.final + 4.3)) * (1 - E.ioCubic(seg(t, T.final + 4.9, T.final + 5.2)));
    ly += 0.6 * E.ioCubic(seg(t, T.text3 + 1.75, T.text3 + 2.05)) * (1 - E.ioCubic(seg(t, T.text3 + 2.65, T.text3 + 2.95)));
    const hop = Math.sin(Math.PI * seg(t, T.final + 0.62, T.final + 0.9)) * 0.06;
    drear(x, y, k, { blink: b, lx, ly, sx: 1 + hop, sy: 1 - hop });
  }

  function p2Texts(t) {
    // "One agent. Many tasks."
    if (t >= T.text3 && t < T.text4 + 0.3) {
      const a = 1 - seg(t, T.text4 - 0.05, T.text4 + 0.2);
      const dy = -16 * E.inCubic(seg(t, T.text4 - 0.05, T.text4 + 0.2));
      textLine(['One agent.', 'Many tasks.'], W / 2, 700 + dy, TITLE, { gaps: [0, gapClose(t, T.text3, TITLE)], alpha: a });
    }
    const L = drearFinalLayout();
    // "Powered by [mark] Opium 5" before the Drear demo...
    if (t >= T.text4 + 0.1 && t < T.demo2 + 0.3) {
      const a = 1 - seg(t, T.demo2 - 0.1, T.demo2 + 0.25);
      const dy = 14 * E.inCubic(seg(t, T.demo2 - 0.1, T.demo2 + 0.25));
      const mark = { mark: true, w: TITLE * 0.92 };
      textLine(['Powered by', mark, MODEL], W / 2, 700 + dy, TITLE, { gaps: [0, gapClose(t, T.text4 + 0.1, TITLE), 0], alpha: a });
    }
    // ...and again under the wordmark on the end card
    if (t >= T.final + 0.55) {
      const a = E.outCubic(seg(t, T.final + 0.55, T.final + 1.2));
      const mark = { mark: true, w: L.small * 0.92 };
      textLine(['Powered by', mark, MODEL], L.tx + 4, L.cy + 78 + (1 - a) * 12, L.small, { anchor: 'left', alpha: a });
    }
    // the wordmark
    if (t >= T.final + 0.45) {
      ctx.save();
      const dxNow = lerp(W / 2, L.dx, E.ioQuart(seg(t, T.final, T.final + 0.75)));
      const r = dxNow + L.dw * 0.42; ctx.beginPath(); ctx.rect(r, 0, W - r, H); ctx.clip();
      const q = E.outExpo(seg(t, T.final + 0.45, T.final + 1.25));
      const slide = (1 - q) * -150;
      font(L.big);
      ctx.letterSpacing = `${lerp(0.05, -0.015, q) * L.big}px`;
      ctx.fillStyle = COL.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(PRODUCT, L.tx + slide, L.cy - 36 + (CAP * L.big) / 2);
      ctx.restore();
    }
    // footer
    if (t >= T.footer) {
      const a = E.outCubic(seg(t, T.footer, T.footer + 0.6));
      const dy = (1 - a) * 16;
      ctx.save(); ctx.globalAlpha = a;
      const size = 34, mk = 44;
      const tw = measure(BRAND, size);
      const total = mk + 16 + tw;
      const x0 = W / 2 - total / 2;
      shape(G.gravity, x0 + mk / 2, 975 + dy, mk, 'fill');
      textLine([BRAND], x0 + mk + 16, 975 + dy, size, { anchor: 'left' });
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ frame
  function renderFrame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
    // part 1
    p1Title(t);
    if (t >= T.grow1 && t < T.fan) drawSequence(SEQ1, t);
    p1Family(t);
    p1Text2(t);
    p1Orbit(t);
    if (t >= T.words[0] && t < T.lockup1) p1Words(t);
    p1Lockup(t);
    if (window.DEMOS) window.DEMOS.demo1(t);
    // part 2
    p2Intro(t);
    if (t >= T.grow2 && t < T.grid) drawSequence(SEQ2, t);
    p2Grid(t);
    // end card: a slow push-in once everything has landed
    const push = 1 + 0.03 * E.ioCubic(seg(t, T.final + 0.9, DURATION));
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(push, push); ctx.translate(-W / 2, -H / 2);
    p2Hero(t);
    p2Texts(t);
    ctx.restore();
    if (window.DEMOS) window.DEMOS.demo2(t);
  }

  // shared with src/demos.js
  window.FX = {
    get ctx() { return ctx; }, get G() { return G; }, get CAP() { return CAP; },
    W, H, COL, LW, E, T, MODEL, PRODUCT, BRAND, DREAR_H, TITLE,
    clamp01, lerp, seg, spring, blink, rr, panel, guide, ring, shape, drear, gravityLive, textLine, font, measure, gapClose,
  };

  window.setupFilm = async function (canvas) {
    ctx = canvas.getContext('2d', { alpha: false });
    G = window.GEO;
    const faces = [
      new FontFace(FONT, 'url(../fonts/InterDisplay-Regular.otf)'),
      new FontFace('UI', 'url(../fonts/Inter-Regular.otf)'),
      new FontFace('UIM', 'url(../fonts/Inter-Medium.otf)'),
      new FontFace('MONO', 'url(../fonts/JetBrainsMono-Regular.ttf)'),
      new FontFace('MONOB', 'url(../fonts/JetBrainsMono-SemiBold.ttf)'),
    ];
    for (const f of faces) { await f.load(); document.fonts.add(f); }
    ctx.font = `1000px ${FONT}`;
    CAP = ctx.measureText('H').actualBoundingBoxAscent / 1000;
    buildSequences();
    if (window.DEMOS) window.DEMOS.setup();
    return { W, H, DURATION };
  };
  window.renderFrame = renderFrame;
})();
