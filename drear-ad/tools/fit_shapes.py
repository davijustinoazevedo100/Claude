"""Fit clean vector geometry to the two raster logos.

  python3 tools/fit_shapes.py assets/drear.png assets/gravity.png src/shapes.js

Drear  -> union of circles (one per bump) + two stadium-shaped eyes.
Gravity -> centre circle + 4 lobes (circles) joined by flared necks; each neck side is a
           cubic Bezier fitted to the measured half-width profile (tangent to the stem and
           to the lobe circle).
"""
import sys, json
import numpy as np, cv2
from PIL import Image
from scipy.optimize import least_squares

S = 4  # contour supersampling


def fit_circle(p):
    x, y = p[:, 0], p[:, 1]
    sol, *_ = np.linalg.lstsq(np.c_[x, y, np.ones_like(x)], x * x + y * y, rcond=None)
    cx, cy = sol[0] / 2, sol[1] / 2
    return cx, cy, float(np.sqrt(sol[2] + cx * cx + cy * cy))


def upmask(mask):
    m = cv2.resize(mask.astype(np.float32), None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
    m = cv2.GaussianBlur(m, (0, 0), S * 0.6)
    return (m > 0.5).astype(np.uint8)


def contour(mask):
    cs, _ = cv2.findContours(upmask(mask), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return [c[:, 0, :].astype(np.float64) / S + 0.5 / S - 0.5 for c in cs]


# ---------------------------------------------------------------- Drear cloud
def fit_cloud(path):
    im = np.array(Image.open(path).convert('RGBA')).astype(np.float32) / 255
    solid = im[..., 3] > 0.5
    body = solid & (im[..., :3].mean(-1) < 0.5)
    c = max(contour(solid), key=len)
    n, k = len(c), 12 * S
    a = c[(np.arange(n) - k) % n]; d = c[(np.arange(n) + k) % n]
    v1, v2 = c - a, d - c
    turn = np.arctan2(v1[:, 0] * v2[:, 1] - v1[:, 1] * v2[:, 0], (v1 * v2).sum(1))
    conc = -turn * np.sign(np.median(turn))
    cand = [i for i in range(n) if conc[i] > 0.35 and conc[i] >= conc[(i + np.arange(-k, k + 1)) % n].max()]
    notch = []
    for i in cand:  # merge plateaus
        if notch and min(abs(i - notch[-1]), n - abs(i - notch[-1])) < 2 * k:
            if conc[i] > conc[notch[-1]]: notch[-1] = i
            continue
        notch.append(i)
    if len(notch) > 1 and min(abs(notch[0] - notch[-1]), n - abs(notch[0] - notch[-1])) < 2 * k:
        notch.pop()
    circles = []
    for i0, i1 in zip(notch, notch[1:] + [notch[0] + n]):
        cx, cy, r = fit_circle(c[np.arange(i0 + 6 * S, i1 - 6 * S) % n])
        circles.append(dict(cx=cx, cy=cy, r=r))
    es, _ = cv2.findContours(upmask(solid & ~body), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    eyes = []
    for e in sorted(es, key=lambda e: cv2.boundingRect(e)[0]):
        if cv2.contourArea(e) < 1000 * S * S: continue
        x, y, w, h = cv2.boundingRect(e)
        eyes.append(dict(x=x / S, y=y / S, w=w / S, h=h / S))
    # symmetrise the eyes (same size, same top)
    w = np.mean([e['w'] for e in eyes]); h = np.mean([e['h'] for e in eyes]); y = np.mean([e['y'] for e in eyes])
    eyes = [dict(x=e['x'] + (e['w'] - w) / 2, y=y, w=w, h=h) for e in eyes]
    print('cloud circles', len(circles), 'eyes', eyes)
    return dict(circles=circles, eyes=eyes, size=list(solid.shape[::-1]))


# ---------------------------------------------------------------- Gravity mark
def fit_gravity(path):
    ink = 1 - np.array(Image.open(path).convert('L')).astype(np.float32) / 255
    c = max(contour(ink > 0.5), key=len)
    ys, xs = np.nonzero(ink > 0.5)
    cx0, cy0 = xs.mean(), ys.mean()
    d = np.hypot(c[:, 0] - cx0, c[:, 1] - cy0)
    th = np.degrees(np.arctan2(c[:, 1] - cy0, c[:, 0] - cx0))
    off = np.minimum.reduce([np.abs(((th - a + 180) % 360) - 180) for a in (0, 90, 180, -90)])
    ccx, ccy, cr = fit_circle(c[(d < 90) & (off > 25)])
    lobes = []
    for a in (-90, 0, 90, 180):
        da = np.abs(((th - a + 180) % 360) - 180)
        lobes.append(fit_circle(c[(d > 190) & (da < 60)]))
    D = float(np.mean([np.hypot(l[0] - ccx, l[1] - ccy) for l in lobes]))
    R = float(np.mean([l[2] for l in lobes]))

    # half-width profile along the 4 arms (sub-pixel edges), averaged
    prof_s = np.arange(64, 236, 1.0)
    halves = []
    for a in (-90, 0, 90, 180):
        ux, uy = np.cos(np.radians(a)), np.sin(np.radians(a)); vx, vy = -uy, ux
        ts = np.arange(-120, 120, 0.25)
        hs = []
        for s in prof_s:
            X = (ccx + ux * s + vx * ts).astype(np.float32); Y = (ccy + uy * s + vy * ts).astype(np.float32)
            v = cv2.remap(ink, X[None], Y[None], cv2.INTER_LINEAR)[0]
            i0 = len(ts) // 2; l = r = i0
            while l > 0 and v[l - 1] > 0.5: l -= 1
            while r < len(ts) - 1 and v[r + 1] > 0.5: r += 1
            el = ts[l] + (ts[l - 1] - ts[l]) * (v[l] - 0.5) / (v[l] - v[l - 1] + 1e-9)
            er = ts[r] + (ts[r + 1] - ts[r]) * (v[r] - 0.5) / (v[r] - v[r + 1] + 1e-9)
            hs.append((er - el) / 2)
        halves.append(hs)
    half = np.mean(halves, 0)

    def bez(p, u):
        w, phi, ha, hb = p
        s0 = np.sqrt(cr * cr - w * w)
        P0 = np.array([s0, w]); P3 = np.array([D - R * np.cos(phi), R * np.sin(phi)])
        T3 = np.array([np.sin(phi), np.cos(phi)])
        P1 = P0 + np.array([ha, 0.0]); P2 = P3 - T3 * hb
        u = u[:, None]
        return ((1 - u) ** 3) * P0 + 3 * ((1 - u) ** 2) * u * P1 + 3 * (1 - u) * u * u * P2 + u ** 3 * P3

    def model(p, s):
        w, phi = p[0], p[1]
        sB = D - R * np.cos(phi)
        q = bez(p, np.linspace(0, 1, 800))
        h = np.interp(s, q[:, 0], q[:, 1])
        circ = np.sqrt(np.clip(R * R - (D - s) ** 2, 0, None))
        return np.where(s < sB, h, circ)

    res = least_squares(lambda p: model(p, prof_s) - half, x0=[11.0, np.radians(45), 40, 40],
                        bounds=([5, np.radians(15), 1, 1], [20, np.radians(80), 200, 200]))
    w, phi, ha, hb = res.x
    err = model(res.x, prof_s) - half
    print(f'gravity centre=({ccx:.2f},{ccy:.2f}) r={cr:.2f}  D={D:.2f} R={R:.2f}')
    print(f'neck w={w:.3f} phi={np.degrees(phi):.2f}deg ha={ha:.2f} hb={hb:.2f}  maxerr={np.abs(err).max():.3f} rms={np.sqrt((err**2).mean()):.3f}')
    s0 = float(np.sqrt(cr * cr - w * w))
    P0 = [s0, w]; P3 = [D - R * np.cos(phi), R * np.sin(phi)]
    T3 = [np.sin(phi), np.cos(phi)]
    P1 = [s0 + ha, w]; P2 = [P3[0] - T3[0] * hb, P3[1] - T3[1] * hb]
    return dict(cx=ccx, cy=ccy, r=cr, D=D, R=R, w=w, phi=phi,
                neck=[P0, P1, P2, P3], size=list(ink.shape[::-1]))


if __name__ == '__main__':
    out = dict(drear=fit_cloud(sys.argv[1]), gravity=fit_gravity(sys.argv[2]))
    with open(sys.argv[3], 'w') as f:
        f.write('// generated by tools/fit_shapes.py\nwindow.SHAPES = ' + json.dumps(out, indent=1) + ';\n')
    print('wrote', sys.argv[3])
