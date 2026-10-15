/* Flat geometric illustrations + a tiny scene-graph for the Pomar Distribuidora spot.
   Every animated thing is a "node": a plain state object {x,y,r,s,sx,sy,o} that GSAP
   tweens and flush() writes to its <g>. Content is drawn around the node's pivot (0,0). */

const NS = 'http://www.w3.org/2000/svg';
const C = {
  paper: '#F7F7F7',            // exact background of the original logo
  orange: '#FE6902', orangeShade: '#E35700', orangeTint: '#FFE6D3',
  green: '#06A34E', greenShade: '#04813F', greenDeep: '#045C2E',
  greenLight: '#62C98B', greenTint: '#DCF1E3', mint: '#EAF6EE', sky: '#E4F3EA',
  ink: '#0D3B24', sub: '#557A63', white: '#FFFFFF',
  red: '#E8423A', redShade: '#C2302A', berry: '#EE3F4A', berryShade: '#C92B37',
  yellow: '#FFC53A', yellowShade: '#EFA514', yellowLight: '#FFE28E',
  purple: '#7A3A93', purpleShade: '#57286C',
  lime: '#86C440', limeShade: '#66A52B', unripe: '#A2CC45', unripeShade: '#86B232',
  brown: '#6B4426', asphalt: '#33403A', tire: '#252E29',
};

let _uid = 0;
const uid = (p = 'u') => `${p}${++_uid}`;
let DEFS = null;
function setDefs(d) { DEFS = d; }

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/* ---------------------------------------------------------------- nodes */
const NODES = [];
function node(e, init) {
  const n = Object.assign({ x: 0, y: 0, r: 0, s: 1, sx: 1, sy: 1, o: 1, ax: 0, ay: 0, ar: 0, as: 0 }, init || {});
  n.el = e; NODES.push(n); return n;
}
const N = (parent, init, attrs) => node(el('g', attrs || {}, parent), init);

function flush() {
  for (const n of NODES) {
    const s = n.s * (1 + n.as), kx = s * n.sx, ky = s * n.sy;
    const vis = n.o > 0.002 && Math.abs(kx) > 1e-4 && Math.abs(ky) > 1e-4;
    if (!vis) { if (n._v !== false) { n.el.setAttribute('display', 'none'); n._v = false; } continue; }
    if (n._v !== true) { n.el.removeAttribute('display'); n._v = true; }
    const tr = `translate(${(n.x + n.ax).toFixed(2)},${(n.y + n.ay).toFixed(2)}) rotate(${(n.r + n.ar).toFixed(3)}) scale(${kx.toFixed(5)},${ky.toFixed(5)})`;
    if (tr !== n._t) { n.el.setAttribute('transform', tr); n._t = tr; }
    const o = Math.min(1, n.o).toFixed(3);
    if (o !== n._o) { n.el.setAttribute('opacity', o); n._o = o; }
  }
}

/* ---------------------------------------------------------------- drawing helpers */
/* base shape + darker crescent on the lower right; returns {g, base, shade} */
function toned(parent, shapeFn, fill, shade, dx = -14, dy = -14) {
  const g = el('g', {}, parent);
  const id = uid('cl');
  shapeFn(el('clipPath', { id }, DEFS));
  const inner = el('g', { 'clip-path': `url(#${id})` }, g);
  const sh = shapeFn(inner); sh.setAttribute('fill', shade);
  const top = shapeFn(inner); top.setAttribute('fill', fill);
  top.setAttribute('transform', `translate(${dx},${dy})`);
  g.base = top; g.shade = sh;
  return g;
}

function shine(parent, cx, cy, rx, ry, rot = -35, op = 0.3) {
  return el('ellipse', { cx, cy, rx, ry, fill: '#fff', opacity: op, transform: `rotate(${rot} ${cx} ${cy})` }, parent);
}

/* leaf from base (0,0) to tip (len,0), rotated; light midrib */
function leaf(parent, { x = 0, y = 0, len = 50, w = 16, rot = 0, fill = C.green, vein = C.greenLight, veinOp = 0.9 } = {}) {
  const g = el('g', { transform: `translate(${x},${y}) rotate(${rot})` }, parent);
  el('path', { d: `M0,0 C${len * 0.28},${-w} ${len * 0.72},${-w} ${len},0 C${len * 0.72},${w} ${len * 0.28},${w} 0,0 Z`, fill }, g);
  if (vein) el('path', { d: `M${len * 0.08},0 Q${len * 0.5},${-w * 0.12} ${len * 0.86},0`, stroke: vein, 'stroke-width': Math.max(2, w * 0.16), 'stroke-linecap': 'round', fill: 'none', opacity: veinOp }, g);
  return g;
}

const stroke = (d, color, w, parent, extra = {}) =>
  el('path', Object.assign({ d, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, extra), parent);

/* ---------------------------------------------------------------- produce */
const ART = {
  laranja(p) {
    const g = el('g', {}, p);
    toned(g, q => el('circle', { cx: 0, cy: 8, r: 70 }, q), C.orange, C.orangeShade, -15, -15);
    for (const [x, y] of [[-30, 30], [-8, 44], [22, 34], [38, 6], [8, 12], [-20, 4]]) el('circle', { cx: x, cy: y, r: 2.2, fill: C.orangeShade, opacity: 0.55 }, g);
    shine(g, -28, -22, 17, 9);
    stroke('M0,-60 C1,-68 3,-74 7,-79', C.greenShade, 7, g);
    leaf(g, { x: 5, y: -76, len: 50, w: 16, rot: -16 });
    return g;
  },
  maca(p) {
    const g = el('g', {}, p);
    const d = 'M0,-44 C20,-64 72,-60 76,-10 C80,40 46,78 18,72 C8,70 -8,70 -18,72 C-46,78 -80,40 -76,-10 C-72,-60 -20,-64 0,-44 Z';
    toned(g, q => el('path', { d }, q), C.red, C.redShade, -14, -14);
    shine(g, -36, -22, 15, 9, -50);
    stroke('M0,-42 C0,-58 3,-70 9,-79', C.brown, 7, g);
    leaf(g, { x: 6, y: -66, len: 44, w: 15, rot: -28 });
    return g;
  },
  banana(p) {
    const g = el('g', { transform: 'rotate(-8)' }, p);
    const d = 'M-70,-56 C-80,6 -26,72 66,38 C78,34 88,22 88,12 C40,38 -26,22 -50,-58 Z';
    toned(g, q => el('path', { d }, q), C.yellow, C.yellowShade, 10, -12);
    stroke('M-56,-36 C-46,4 -6,30 52,26', C.yellowLight, 6, g, { opacity: 0.9 });
    el('path', { d: 'M-72,-56 L-66,-74 L-50,-70 L-50,-58 Z', fill: C.limeShade }, g);
    el('circle', { cx: 87, cy: 15, r: 6, fill: C.brown }, g);
    return g;
  },
  uva(p) {
    const g = el('g', { transform: 'translate(0,6)' }, p);
    stroke('M0,-44 C0,-56 2,-64 8,-72', C.brown, 6, g);
    leaf(g, { x: 4, y: -62, len: 48, w: 19, rot: -24 });
    const rows = [[-30, [-45, -15, 15, 45]], [-2, [-30, 0, 30]], [26, [-15, 15]], [54, [0]]];
    for (const [y, xs] of rows) for (const x of xs) {
      toned(g, q => el('circle', { cx: x, cy: y, r: 17.5 }, q), C.purple, C.purpleShade, -5, -5);
      el('circle', { cx: x - 6, cy: y - 6, r: 4, fill: '#fff', opacity: 0.32 }, g);
    }
    return g;
  },
  morango(p) {
    const g = el('g', { transform: 'translate(0,4)' }, p);
    const d = 'M0,74 C-36,62 -70,18 -66,-18 C-63,-48 -30,-56 0,-46 C30,-56 63,-48 66,-18 C70,18 36,62 0,74 Z';
    toned(g, q => el('path', { d }, q), C.berry, C.berryShade, -12, -12);
    for (const [x, y] of [[-40, -18], [-14, -22], [14, -22], [40, -18], [-28, 6], [0, 2], [28, 6], [-14, 28], [14, 28], [0, 50], [-48, 6], [48, 6]])
      el('ellipse', { cx: x, cy: y, rx: 2.8, ry: 4.4, fill: C.yellowLight, transform: `rotate(${x * 0.4} ${x} ${y})` }, g);
    shine(g, -38, -30, 10, 6, -30, 0.28);
    for (const a of [-165, -125, -90, -55, -15]) leaf(g, { x: 0, y: -46, len: 30, w: 9, rot: a, vein: null });
    stroke('M0,-50 C1,-60 4,-66 8,-72', C.greenShade, 6, g);
    return g;
  },
  limao(p) {
    const g = el('g', { transform: 'rotate(-18)' }, p);
    const d = 'M-76,0 C-72,-40 -32,-56 0,-56 C32,-56 72,-40 76,0 C72,40 32,56 0,56 C-32,56 -72,40 -76,0 Z';
    toned(g, q => el('path', { d }, q), C.lime, C.limeShade, -12, -12);
    el('ellipse', { cx: -77, cy: 0, rx: 7, ry: 6, fill: C.limeShade }, g);
    el('ellipse', { cx: 77, cy: 0, rx: 7, ry: 6, fill: C.lime }, g);
    shine(g, -26, -26, 20, 8, -12, 0.3);
    leaf(g, { x: 8, y: -52, len: 40, w: 13, rot: -50 });
    return g;
  },
  melancia(p) {
    const g = el('g', { transform: 'rotate(-10) translate(0,-14)' }, p);
    el('path', { d: 'M-86,-24 A86,86 0 0 0 86,-24 Z', fill: C.green }, g);
    el('path', { d: 'M-86,-24 A86,86 0 0 0 86,-24 L74,-24 A74,74 0 0 1 -74,-24 Z', fill: C.greenShade, opacity: 0.35 }, g);
    el('path', { d: 'M-75,-24 A75,75 0 0 0 75,-24 Z', fill: '#EAF7D6' }, g);
    el('path', { d: 'M-67,-24 A67,67 0 0 0 67,-24 Z', fill: '#FF5A64' }, g);
    el('path', { d: 'M-67,-24 A67,67 0 0 0 67,-24 L50,-24 A50,50 0 0 1 -50,-24 Z', fill: '#E8434F', opacity: 0.35 }, g);
    for (const a of [25, 52, 80, 108, 135, 62, 98]) {
      const r = a === 62 || a === 98 ? 20 : 38, rad = a * Math.PI / 180;
      const x = Math.cos(rad) * r, y = -24 + Math.sin(rad) * r;
      el('ellipse', { cx: x, cy: y, rx: 3.4, ry: 6, fill: '#2B2B2B', transform: `rotate(${a - 90} ${x} ${y})` }, g);
    }
    return g;
  },
  tomate(p) {
    const g = el('g', { transform: 'translate(0,6)' }, p);
    toned(g, q => el('ellipse', { cx: 0, cy: 4, rx: 72, ry: 64 }, q), C.red, C.redShade, -14, -13);
    shine(g, -32, -24, 16, 9, -30);
    for (const a of [-172, -128, -90, -52, -8]) leaf(g, { x: 0, y: -56, len: a === -90 ? 18 : 30, w: 8, rot: a, vein: null });
    stroke('M0,-58 C0,-66 2,-72 6,-76', C.greenShade, 6, g);
    return g;
  },
  cenoura(p) {
    const g = el('g', { transform: 'rotate(-28) translate(0,4)' }, p);
    for (const [a, l] of [[-118, 50], [-90, 58], [-62, 50]]) leaf(g, { x: 0, y: -48, len: l, w: 11, rot: a, fill: a === -90 ? C.green : C.greenShade, vein: null });
    const d = 'M-28,-46 C-10,-58 14,-56 30,-44 C32,-8 14,50 0,88 C-14,50 -32,-8 -28,-46 Z';
    toned(g, q => el('path', { d }, q), '#FF8A1C', '#E8700A', -9, -6);
    for (const [y, w] of [[-22, 16], [2, 12], [26, 9], [48, 6]]) stroke(`M${-w},${y} q${w * 0.7},4 ${w * 1.2},0`, '#E8700A', 4, g, { opacity: 0.8 });
    return g;
  },
  brocolis(p) {
    const g = el('g', { transform: 'translate(0,-4)' }, p);
    toned(g, q => el('path', { d: 'M-20,8 L-14,80 C-6,88 6,88 14,80 L20,8 Z' }, q), '#A6D267', '#86B84A', -6, 0);
    stroke('M-6,20 L-18,6 M6,24 L18,8', '#86B84A', 7, g);
    const fl = [[-46, -4, 28], [46, -4, 28], [-24, -30, 30], [24, -30, 30], [0, -8, 32], [-30, 18, 22], [30, 18, 22], [0, -46, 24]];
    for (const [x, y, r] of fl) toned(g, q => el('circle', { cx: x, cy: y, r }, q), '#2E9B48', '#1D7A36', -6, -6);
    for (const [x, y] of [[-44, -10], [-20, -38], [22, -36], [44, -10], [2, -16], [-4, -50]]) el('circle', { cx: x, cy: y, r: 4, fill: '#69C27A', opacity: 0.8 }, g);
    return g;
  },
  alface(p) {
    const g = el('g', {}, p);
    for (let i = 0; i < 8; i++) {
      const a = i * 45 + 12, rad = a * Math.PI / 180;
      el('circle', { cx: Math.cos(rad) * 40, cy: Math.sin(rad) * 36 + 6, r: 38, fill: i % 2 ? '#5FB33E' : '#6FC04A' }, g);
    }
    toned(g, q => el('circle', { cx: 0, cy: 6, r: 52 }, q), '#8FD15A', '#73BA44', -8, -8);
    toned(g, q => el('circle', { cx: 0, cy: 4, r: 30 }, q), '#C3E68A', '#A9D86E', -5, -5);
    for (const a of [200, 250, 300, 340, 30, 80, 130, 160]) {
      const rad = a * Math.PI / 180;
      stroke(`M${Math.cos(rad) * 30},${Math.sin(rad) * 28 + 4} L${Math.cos(rad) * 70},${Math.sin(rad) * 62 + 6}`, '#fff', 3, g, { opacity: 0.45 });
    }
    return g;
  },
  pimentao(p) {
    const g = el('g', { transform: 'translate(0,6)' }, p);
    const d = 'M0,-44 C30,-58 70,-40 68,0 C66,40 48,72 26,72 C16,72 10,64 0,64 C-10,64 -16,72 -26,72 C-48,72 -66,40 -68,0 C-70,-40 -30,-58 0,-44 Z';
    toned(g, q => el('path', { d }, q), C.yellow, C.yellowShade, -12, -12);
    stroke('M-18,-34 C-26,6 -24,40 -18,60 M18,-34 C26,6 24,40 18,60', C.yellowShade, 4, g, { opacity: 0.55 });
    shine(g, -40, -14, 9, 18, 10, 0.3);
    el('ellipse', { cx: 0, cy: -46, rx: 18, ry: 8, fill: C.greenShade }, g);
    stroke('M0,-50 C-1,-60 3,-68 12,-74', C.green, 9, g);
    return g;
  },
  berinjela(p) {
    const g = el('g', { transform: 'rotate(8) translate(-4,6)' }, p);
    const d = 'M-22,-42 C10,-58 56,-30 68,14 C78,52 54,80 22,78 C-8,76 -32,50 -38,14 C-42,-12 -40,-32 -22,-42 Z';
    toned(g, q => el('path', { d }, q), C.purple, C.purpleShade, -12, -12);
    shine(g, -16, -8, 9, 22, -30, 0.25);
    for (const a of [-190, -140, -95, -50]) leaf(g, { x: -24, y: -40, len: 26, w: 9, rot: a + 40, vein: null });
    stroke('M-26,-44 C-30,-56 -28,-66 -20,-74', C.greenShade, 8, g);
    return g;
  },
  abacate(p) {
    const g = el('g', { transform: 'rotate(14)' }, p);
    const egg = s => `M0,${-74 * s} C${34 * s},${-74 * s} ${56 * s},${-20 * s} ${62 * s},${20 * s} C${68 * s},${60 * s} ${40 * s},${84 * s} 0,${84 * s} C${-40 * s},${84 * s} ${-68 * s},${60 * s} ${-62 * s},${20 * s} C${-56 * s},${-20 * s} ${-34 * s},${-74 * s} 0,${-74 * s} Z`;
    el('path', { d: egg(1), fill: '#2C6E2F' }, g);
    el('path', { d: egg(0.86), fill: '#C9E27E', transform: 'translate(0,4)' }, g);
    el('path', { d: egg(0.62), fill: '#E6F1B0', transform: 'translate(0,10)' }, g);
    toned(g, q => el('circle', { cx: 0, cy: 26, r: 26 }, q), '#8D5A2E', '#6E4220', -6, -6);
    el('circle', { cx: -8, cy: 18, r: 6, fill: '#fff', opacity: 0.3 }, g);
    return g;
  },
};
const PRODUCE = Object.keys(ART);

/* ---------------------------------------------------------------- props */

/* fruit hanging on a tree; colours can be tweened from unripe to ripe */
function treeFruit(parent, x, y, r = 36, ripe = false) {
  const n = N(parent, { x, y, s: 0 });
  const t = toned(n.el, q => el('circle', { cx: 0, cy: 0, r }, q), ripe ? C.orange : C.unripe, ripe ? C.orangeShade : C.unripeShade, -r * 0.22, -r * 0.22);
  shine(n.el, -r * 0.38, -r * 0.34, r * 0.24, r * 0.13, -35, 0.32);
  n.top = N(n.el, { x: 0, y: -r * 0.9 });                      // stem + leaf, can grow separately
  stroke(`M0,0 C0,${-r * 0.15} ${r * 0.03},${-r * 0.25} ${r * 0.08},${-r * 0.35}`, C.greenShade, r * 0.11, n.top.el);
  leaf(n.top.el, { x: r * 0.06, y: -r * 0.28, len: r * 0.8, w: r * 0.26, rot: -20 });
  n.base = t.base; n.shade = t.shade;
  return n;
}

/* green perforated plastic crate, typical of produce distribution; origin = bottom centre */
function crate(parent, { w = 300, h = 150 } = {}) {
  const g = el('g', {}, parent);
  el('ellipse', { cx: 0, cy: 2, rx: w * 0.56, ry: 12, fill: '#000', opacity: 0.12 }, g);
  el('rect', { x: -w / 2, y: -h, width: w, height: h, rx: 16, fill: C.green }, g);
  el('rect', { x: -w / 2, y: -h, width: w, height: 26, rx: 12, fill: C.greenShade }, g);
  el('rect', { x: -38, y: -h + 7, width: 76, height: 12, rx: 6, fill: C.greenDeep }, g);
  const cols = 6, rows = 2, hw = (w - 56) / cols - 12;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    el('rect', { x: -w / 2 + 28 + c * (hw + 12) + 6, y: -h + 44 + r * 44, width: hw, height: 28, rx: 9, fill: C.greenDeep, opacity: 0.85 }, g);
  el('rect', { x: -w / 2, y: -10, width: w, height: 10, rx: 5, fill: C.greenShade }, g);
  return g;
}

/* young sprout with nodes for growing; origin = soil */
function sprout(parent, x, y, h = 70, lean = 0) {
  const n = N(parent, { x, y });
  const stem = stroke(`M0,0 Q${lean * 0.5},${-h * 0.55} ${lean},${-h}`, C.greenShade, Math.max(4, h * 0.09), n.el);
  const L = N(n.el, { x: lean, y: -h, s: 0 });
  const R = N(n.el, { x: lean, y: -h, s: 0 });
  leaf(L.el, { len: h * 0.55, w: h * 0.17, rot: -150 });
  leaf(R.el, { len: h * 0.62, w: h * 0.19, rot: -32, fill: C.greenLight, vein: '#B6E8C9' });
  return { n, stem, L, R };
}

/* round orchard tree; origin = trunk base */
function tree(parent, x, y, { s = 1, light = false } = {}) {
  const n = N(parent, { x, y });
  const trunk = N(n.el, { sy: 0 });
  const tc = light ? '#3E9C62' : C.greenShade, ts = light ? '#2F8551' : '#036B34';
  toned(trunk.el, q => el('path', { d: `M${-16 * s},0 C${-14 * s},${-60 * s} ${-12 * s},${-120 * s} ${-6 * s},${-170 * s} L${6 * s},${-170 * s} C${12 * s},${-120 * s} ${14 * s},${-60 * s} ${16 * s},0 Z` }, q), tc, ts, -8, 0);
  stroke(`M${-4 * s},${-120 * s} Q${-30 * s},${-150 * s} ${-44 * s},${-188 * s}`, tc, 10 * s, trunk.el);
  stroke(`M${4 * s},${-110 * s} Q${34 * s},${-140 * s} ${50 * s},${-182 * s}`, tc, 10 * s, trunk.el);
  const canopy = N(n.el, { x: 0, y: -260 * s });
  const blobs = [[0, -10, 118], [-96, 30, 84], [96, 30, 86], [-56, -60, 82], [62, -62, 80], [0, 54, 90], [-130, -16, 56], [134, -20, 58]];
  const base = light ? '#86D6A6' : C.green, sh = light ? '#66C68E' : C.greenShade;
  const parts = blobs.map(([bx, by, br]) => {
    const b = N(canopy.el, { x: bx * s, y: by * s, s: 0 });
    toned(b.el, q => el('circle', { cx: 0, cy: 0, r: br * s }, q), base, sh, -10 * s, -12 * s);
    return b;
  });
  for (const [hx, hy, hr] of [[-52, -70, 22], [40, -40, 16], [-100, 10, 14]]) {
    const b = N(canopy.el, { x: hx * s, y: hy * s, s: 0 });
    el('circle', { r: hr * s, fill: '#fff', opacity: 0.13 }, b.el);
    parts.push(b);
  }
  return { n, trunk, canopy, parts };
}

/* side-view box truck, facing right; origin = ground under the middle */
function truck(parent, x, y, logoHref) {
  const n = N(parent, { x, y });
  el('ellipse', { cx: -40, cy: 4, rx: 400, ry: 14, fill: '#000', opacity: 0.13 }, n.el);
  const body = N(n.el);
  const b = body.el;
  el('rect', { x: -420, y: -96, width: 660, height: 34, rx: 10, fill: C.asphalt }, b);
  // cargo box: paper colour = logo background, so the logo image sits seamlessly
  el('rect', { x: -430, y: -360, width: 560, height: 272, rx: 20, fill: '#DCE4DE' }, b);
  el('rect', { x: -430, y: -366, width: 560, height: 266, rx: 20, fill: C.paper }, b);
  el('rect', { x: -430, y: -146, width: 560, height: 22, fill: C.green }, b);
  el('rect', { x: -430, y: -124, width: 560, height: 8, fill: C.orange }, b);
  el('image', { href: logoHref, x: -418, y: -350, width: 200, height: 200 }, b);
  const tx = el('text', { x: -210, y: -248, 'font-family': 'Outfit', 'font-weight': 700, 'font-size': 54, fill: C.greenShade, 'letter-spacing': 5 }, b);
  tx.textContent = 'POMAR';
  const tx2 = el('text', { x: -208, y: -210, 'font-family': 'Outfit', 'font-weight': 500, 'font-size': 20.5, fill: C.orange, 'letter-spacing': 6.2 }, b);
  tx2.textContent = 'DISTRIBUIDORA';
  // cab
  toned(b, q => el('path', { d: 'M140,-62 L140,-268 C140,-280 148,-288 160,-288 L236,-288 C252,-288 262,-282 270,-268 L318,-176 C324,-164 326,-156 326,-144 L326,-62 Z' }, q), C.orange, C.orangeShade, -10, -6);
  el('path', { d: 'M168,-266 L236,-266 C246,-266 252,-262 258,-252 L292,-190 L168,-190 Z', fill: '#DDF1F4' }, b);
  el('path', { d: 'M184,-266 L210,-266 L176,-190 L168,-190 L168,-230 Z', fill: '#fff', opacity: 0.6 }, b);
  stroke('M162,-176 L162,-80', C.orangeShade, 4, b, { opacity: 0.8 });
  el('rect', { x: 176, y: -170, width: 30, height: 9, rx: 4.5, fill: C.orangeShade }, b);
  el('rect', { x: 314, y: -132, width: 18, height: 26, rx: 6, fill: '#FFE08A' }, b);
  el('rect', { x: 300, y: -84, width: 40, height: 22, rx: 8, fill: C.asphalt }, b);
  const wheels = [];
  for (const wx of [-300, -176, 226]) {
    const w = el('g', { transform: `translate(${wx},-44)` }, n.el);
    el('circle', { r: 46, fill: C.tire }, w);
    el('circle', { r: 24, fill: '#DADFDC' }, w);
    const spin = N(w);
    for (let i = 0; i < 5; i++) { const a = i * 72 * Math.PI / 180; el('circle', { cx: Math.cos(a) * 14, cy: Math.sin(a) * 14, r: 3.4, fill: '#8C9690' }, spin.el); }
    el('circle', { r: 6, fill: '#8C9690' }, w);
    wheels.push(spin);
  }
  return { n, body, wheels };
}

function cloud(parent, x, y, s = 1) {
  const n = N(parent, { x, y, s });
  el('path', { d: 'M-90,20 C-110,20 -110,-14 -84,-16 C-82,-46 -40,-56 -22,-34 C-10,-64 44,-62 50,-24 C80,-30 98,0 84,20 Z', fill: '#fff' }, n.el);
  return n;
}

/* map pin with a disc for an icon; origin = tip */
function pin(parent, x, y, color = C.greenShade, disc = '#fff') {
  const n = N(parent, { x, y, s: 0 });
  el('ellipse', { cx: 0, cy: 0, rx: 20, ry: 6, fill: '#000', opacity: 0.14 }, n.el);
  el('path', { d: 'M0,0 C-10,-18 -44,-48 -44,-82 C-44,-108 -24,-128 0,-128 C24,-128 44,-108 44,-82 C44,-48 10,-18 0,0 Z', fill: color }, n.el);
  el('circle', { cx: 0, cy: -84, r: 31, fill: disc }, n.el);
  n.icon = el('g', { transform: 'translate(0,-84)' }, n.el);
  return n;
}

const ICON = {
  carrinho(p, c) { // supermarket cart
    stroke('M-18,-13 L-12,-13 L-6,7 L14,7 L18,-7 L-9,-7', c, 4.5, p);
    el('circle', { cx: -3, cy: 14, r: 3.4, fill: c }, p); el('circle', { cx: 11, cy: 14, r: 3.4, fill: c }, p);
  },
  talheres(p, c) { // fork + knife
    stroke('M-8,-16 L-8,16 M-13,-16 L-13,-5 Q-8,1 -3,-5 L-3,-16', c, 4, p);
    stroke('M9,16 L9,-16 Q16,-8 14,4 L9,4', c, 4, p);
  },
  cesta(p, c) { // produce basket
    stroke('M-17,-3 L17,-3 L12,15 L-12,15 Z M-9,-3 L-2,-16 M9,-3 L2,-16', c, 4, p);
    stroke('M-5,3 L-4,9 M4,3 L3,9', c, 3.5, p);
  },
};
