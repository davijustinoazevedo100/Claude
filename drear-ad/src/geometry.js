// Vector artwork for the ad, built once with paper.js boolean ops and handed to the
// renderer as Path2D objects in normalised units (every shape fits a 1x1 box centred
// on the origin, so "size" at draw time is simply the pixel height of that box).
(function () {
  const P = paper;
  P.setup(new P.Size(16, 16));
  const pt = (x, y) => new P.Point(x, y);

  const unite = (a, b) => { const r = a.unite(b); a.remove(); b.remove(); return r; };
  const subtract = (a, b) => { const r = a.subtract(b); a.remove(); b.remove(); return r; };
  const uniteAll = (items) => items.reduce((acc, it) => (acc ? unite(acc, it) : it), null);
  const circle = (x, y, r) => new P.Path.Circle(pt(x, y), r);
  const ellipse = (x, y, rx, ry) => new P.Path.Ellipse({ center: pt(x, y), radius: [rx, ry] });
  const rrect = (x, y, w, h, r) => new P.Path.Rectangle({ rectangle: new P.Rectangle(x, y, w, h), radius: r });
  function capsule(x1, y1, x2, y2, wd) {
    const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    const p = rrect(-wd / 2, -wd / 2, len + wd, wd, wd / 2);
    p.rotate(ang, pt(0, 0)); p.translate(pt(x1, y1));
    return p;
  }
  const polyline = (pts, wd) => uniteAll(pts.slice(1).map((q, i) => capsule(pts[i][0], pts[i][1], q[0], q[1], wd)));
  const polygon = (pts) => { const p = new P.Path(pts.map(([x, y]) => pt(x, y))); p.closed = true; return p; };

  // item -> Path2D, mapping (cx, cy, scale) so the result is in unit space
  function toPath2D(item, cx, cy, scale) {
    item.translate(pt(-cx, -cy));
    item.scale(1 / scale, pt(0, 0));
    const d = item.pathData;
    item.remove();
    return new Path2D(d);
  }

  const S = window.SHAPES;
  const G = {};

  // ------------------------------------------------------------------ Drear cloud
  {
    const d = S.drear;
    const parts = d.circles.map((c) => circle(c.cx, c.cy, c.r));
    // polygon through the circle centres guarantees the middle is solid
    parts.push(polygon(d.circles.map((c) => [c.cx, c.cy])));
    const sil = uniteAll(parts);
    const b = sil.bounds;
    const cx = b.center.x, cy = b.center.y, sc = b.height;
    G.drear = {
      aspect: b.width / b.height,
      body: toPath2D(sil, cx, cy, sc),
      // eyes as stadiums (centre, half sizes) so they can blink / look around
      eyes: d.eyes.map((e) => ({
        x: (e.x + e.w / 2 - cx) / sc, y: (e.y + e.h / 2 - cy) / sc,
        w: e.w / sc, h: e.h / sc,
      })),
    };
  }

  // ------------------------------------------------------------------ Gravity mark
  {
    const g = S.gravity;
    const [P0, P1, P2, P3] = g.neck;
    // one arm along +x: stem from inside the hub, flared neck (cubic), lobe circle
    function arm() {
      const p = new P.Path();
      p.moveTo(pt(0, -g.w));
      p.lineTo(pt(P0[0], -P0[1]));
      p.cubicCurveTo(pt(P1[0], -P1[1]), pt(P2[0], -P2[1]), pt(P3[0], -P3[1]));
      p.arcTo(pt(g.D + g.R, 0), pt(P3[0], P3[1]));
      p.cubicCurveTo(pt(P2[0], P2[1]), pt(P1[0], P1[1]), pt(P0[0], P0[1]));
      p.lineTo(pt(0, g.w));
      p.closePath();
      return p;
    }
    const ext = 2 * (g.D + g.R);
    G.gravityExtent = ext;
    // arms are indexed clockwise from the top: 0 = up, 1 = right, 2 = down, 3 = left
    function mark(arms) {
      const parts = [circle(0, 0, g.r)];
      for (const k of arms) { const a = arm(); a.rotate(-90 + 90 * k, pt(0, 0)); parts.push(a); }
      return toPath2D(uniteAll(parts), 0, 0, ext);
    }
    G.gravity = mark([0, 1, 2, 3]);
    G.gravityFamily = [mark([0]), mark([0, 1]), mark([0, 1, 2]), mark([0, 1, 2, 3])];
    // pieces for the orbit animation (unit space)
    G.grav = {
      hubR: g.r / ext, D: g.D / ext, R: g.R / ext, w: g.w / ext,
      // half-width profile of the neck, sampled along the arm axis (unit space)
      neck: (() => {
        const out = [];
        const B = (u, a, b, c, d) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c + u ** 3 * d;
        for (let i = 0; i <= 200; i++) {
          const u = i / 200;
          out.push([B(u, P0[0], P1[0], P2[0], P3[0]) / ext, B(u, P0[1], P1[1], P2[1], P3[1]) / ext]);
        }
        return out;
      })(),
    };
  }

  // ------------------------------------------------------------------ task icons (100-unit box)
  const icon = {};
  icon.code = uniteAll([
    polyline([[-17, -26], [-41, 0], [-17, 26]], 11),
    polyline([[17, -26], [41, 0], [17, 26]], 11),
    capsule(7, -34, -7, 34, 11),
  ]);
  icon.doc = (() => {
    let page = rrect(-33, -44, 66, 88, 10);
    page = subtract(page, polygon([[8, -50], [40, -50], [40, -18]]));          // cut corner
    page = subtract(page, polyline([[9.5, -46], [9.5, -19.5], [36, -19.5]], 6)); // frees the folded flap
    for (const [y, w] of [[2, 40], [16, 40], [30, 26]]) page = subtract(page, capsule(-20, y, -20 + w, y, 7));
    return page;
  })();
  icon.search = uniteAll([
    subtract(circle(-8, -8, 34), circle(-8, -8, 21)),
    capsule(17, 17, 37, 37, 16),
  ]);
  icon.calendar = (() => {
    let base = rrect(-42, -30, 84, 74, 12);
    base = subtract(base, rrect(-42, -16, 84, 5, 0));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) base = subtract(base, rrect(-29 + c * 22, -2 + r * 21, 14, 13, 3.5));
    base = unite(base, capsule(-20, -42, -20, -24, 10));
    return unite(base, capsule(20, -42, 20, -24, 10));
  })();
  icon.chart = uniteAll([
    rrect(-40, 6, 22, 38, 6), rrect(-11, -14, 22, 58, 6), rrect(18, -40, 22, 84, 6),
  ]);
  icon.mail = (() => {
    let env = rrect(-44, -31, 88, 62, 11);
    env = subtract(env, polyline([[-33, -18], [0, 8], [33, -18]], 8));
    return env;
  })();
  icon.image = (() => {
    let fr = rrect(-43, -36, 86, 72, 12);
    fr = subtract(fr, circle(16, -14, 9));
    fr = subtract(fr, polygon([[-33, 26], [-10, -6], [6, 14], [14, 4], [33, 26]]));
    return fr;
  })();
  icon.globe = (() => {
    let g = circle(0, 0, 43);
    g = subtract(g, subtract(ellipse(0, 0, 21, 44), ellipse(0, 0, 14, 37)));
    g = subtract(g, rrect(-44, -3.5, 88, 7, 0));
    g = subtract(g, rrect(-3.5, -44, 7, 88, 0));
    g = subtract(g, subtract(circle(0, 0, 37), circle(0, 0, 30)));
    return unite(g, subtract(circle(0, 0, 44), circle(0, 0, 37)));
  })();
  G.icons = {};
  for (const k of Object.keys(icon)) G.icons[k] = toPath2D(icon[k], 0, 0, 100);

  window.GEO = G;
})();
