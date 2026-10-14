"""Motion-graphics edit for devlog "dia 2" (o NPC / meu primeiro brinquedo).

Output timeline:  cold-open hook (source 64.6-68.05 s) -> "DIA 2" title -> full video with graphics -> outro.

Usage:
  python3 edit.py render   <workdir> <out.mp4> [workers]
  python3 edit.py preview  <workdir> <out.jpg> T1,T2,...    (output-timeline seconds)
  python3 edit.py previewm <workdir> <out.jpg> t1,t2,...    (source seconds, inside the main section)

<workdir> must contain: frames.u8 (raw bgr24 frames of the input), track.json (tools/analyze.py),
assets/, fonts/ and, for render, mix.wav (sfx.py).
"""
import functools, json, math, os, subprocess, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

W, H, FPS = 1920, 1080, 30
SW, SH = 848, 478
S = W / SW                                  # 848x478 -> 1920x1082, crop 1 px top/bottom
WORK = sys.argv[2]
A = lambda *p: os.path.join(WORK, *p)

# ----------------------------------------------------------------------------- timeline
HOOK_SRC, HOOK_D = 64.60, 3.45              # cold open: "ele vai... morrer"
TITLE_D = 2.4
MAIN0 = HOOK_D + TITLE_D
TJ = json.load(open(A("track.json")))
STS = np.array([f["t"] for f in TJ["frames"]])
NSRC = len(STS)
SRC_DUR = float(STS[-1]) + 1 / TJ["fps"]
OUTRO_D = 3.2
MAIN1 = MAIN0 + SRC_DUR
TOTAL = MAIN1 + OUTRO_D
CUT = 32.39                                 # the real jump cut in the recording

# ----------------------------------------------------------------------------- easing
def c01(x): return 0.0 if x < 0 else 1.0 if x > 1 else x
def e_out_back(x, s=1.9):
    x = c01(x) - 1; return 1 + (s + 1) * x ** 3 + s * x ** 2
def e_out(x): x = c01(x); return 1 - (1 - x) ** 3
def e_in(x): x = c01(x); return x ** 3
def e_io(x): x = c01(x); return 3 * x * x - 2 * x ** 3
def lerp(a, b, x): return a + (b - a) * x
def pop(t, t0, t1, din=0.35, dout=0.22, s=1.9):
    """scale envelope: springy in at t0, quick shrink out ending at t1"""
    if t < t0 or t > t1: return 0.0
    return e_out_back((t - t0) / din, s) * (1 - e_in((t - (t1 - dout)) / dout))
def fade(t, t0, t1, din=0.15, dout=0.15):
    if t < t0 or t > t1: return 0.0
    return c01((t - t0) / din) * c01((t1 - t) / dout)
def bump(t, t0, d=0.25):
    """0 -> 1 -> 0 hump starting at t0"""
    k = (t - t0) / d
    return math.sin(math.pi * k) if 0 <= k <= 1 else 0.0
def decay(t, t0, d):
    return (1 - (t - t0) / d) if 0 <= t - t0 <= d else 0.0

# ----------------------------------------------------------------------------- fonts / text
FONT = {
    "black": "Montserrat-Black.ttf", "xbold": "Montserrat-ExtraBold.ttf", "bold": "Montserrat-Bold.ttf",
    "anton": "Anton.ttf", "ops": "BlackOpsOne.ttf", "creep": "Creepster.ttf", "bungee": "Bungee.ttf",
    "pixel": "PressStart2P.ttf", "bebas": "BebasNeue.ttf",
}
_fc, _tc = {}, {}
def font(name, size):
    k = (name, size)
    if k not in _fc: _fc[k] = ImageFont.truetype(A("fonts", FONT[name]), size)
    return _fc[k]

def text_img(txt, fname, size, fill=(255, 255, 255), stroke=0, stroke_fill=(0, 0, 0),
             shadow=0, glow=None, glow_r=14, track=0, grad=None):
    """Text as a tight RGBA image: stroke, drop shadow, outer glow, letter tracking, vertical gradient fill."""
    k = (txt, fname, size, fill, stroke, stroke_fill, shadow, glow, glow_r, track, grad)
    if k in _tc: return _tc[k]
    f = font(fname, size)
    pad = stroke + max(shadow, 0) + (glow_r * 2 if glow else 0) + 8
    widths = [f.getlength(ch) + track for ch in txt] if track else None
    tw = int(sum(widths) - track) if track else int(f.getlength(txt))
    asc, desc = f.getmetrics()
    w, h = tw + 2 * pad, asc + desc + 2 * pad
    def draw(col, scol, sw, dx=0, dy=0):
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        if track:
            x = pad + dx
            for ch, cw in zip(txt, widths):
                d.text((x, pad + dy), ch, font=f, fill=col, stroke_width=sw, stroke_fill=scol); x += cw
        else:
            d.text((pad + dx, pad + dy), txt, font=f, fill=col, stroke_width=sw, stroke_fill=scol)
        return im
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if glow:
        g = draw(glow + (255,), glow + (255,), stroke + 4).filter(ImageFilter.GaussianBlur(glow_r))
        out.alpha_composite(g); out.alpha_composite(g)
    if shadow:
        s = draw((0, 0, 0, 170), (0, 0, 0, 170), stroke, shadow, shadow).filter(ImageFilter.GaussianBlur(3))
        out.alpha_composite(s)
    if grad:
        if stroke: out.alpha_composite(draw(stroke_fill + (255,), stroke_fill, stroke))
        m = draw((255, 255, 255, 255), (0, 0, 0, 0), 0).getchannel("A")
        g = np.zeros((h, w, 4), np.uint8)
        ys = np.clip((np.arange(h) - pad) / max(asc + desc, 1), 0, 1)[:, None]
        cols = np.array(grad, np.float32)
        seg = ys * (len(cols) - 1); i0 = np.minimum(seg.astype(int), len(cols) - 2); fr = seg - i0
        g[..., :3] = (cols[i0] * (1 - fr[..., None]) + cols[i0 + 1] * fr[..., None]).astype(np.uint8)
        g[..., 3] = np.asarray(m)
        out.alpha_composite(Image.fromarray(g, "RGBA"))
    else:
        out.alpha_composite(draw(fill + (255,) if len(fill) == 3 else fill, stroke_fill, stroke))
    out = out.crop(out.getbbox())
    _tc[k] = out
    return out

# ----------------------------------------------------------------------------- sprites
ANIM = {}
def load_anim(name, max_side=320):
    im = Image.open(A("assets", name)); frames, durs = [], []
    for i in range(getattr(im, "n_frames", 1)):
        im.seek(i)
        fr = im.convert("RGBA")
        if max(fr.size) > max_side: fr = fr.resize((max_side, max_side), Image.LANCZOS)
        frames.append(fr); durs.append((im.info.get("duration") or 40) / 1000.0)
    return frames, np.cumsum(durs)

def anim(name, t, t0=0.0, speed=1.0):
    if name not in ANIM: ANIM[name] = load_anim(name)
    fr, cum = ANIM[name]
    x = (max(t - t0, 0) * speed) % cum[-1]
    return fr[min(int(np.searchsorted(cum, x, side="right")), len(fr) - 1)]

_rc = {}
def static(name, max_side=320):
    if name not in _rc:
        im = Image.open(A("assets", name)).convert("RGBA")
        if max(im.size) > max_side and not name.startswith("toy"): im = im.resize((max_side, max_side), Image.LANCZOS)
        _rc[name] = im
    return _rc[name]

@functools.lru_cache(None)
def radial(size, color, power=2.0):
    yy, xx = np.mgrid[-1:1:size * 1j, -1:1:size * 1j]
    a = np.clip(1 - np.sqrt(xx ** 2 + yy ** 2), 0, 1) ** power
    arr = np.zeros((size, size, 4), np.uint8); arr[..., :3] = color; arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")

@functools.lru_cache(None)
def ring(w, h, color, width=6, blur=8):
    pad = blur * 3
    im = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse((pad, pad, pad + w, pad + h), outline=color + (255,), width=width)
    g = im.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.alpha_composite(g); out.alpha_composite(g); out.alpha_composite(im)
    return out

@functools.lru_cache(None)
def panel(w, h, r=28, fill=(14, 16, 22, 215), border=None, bw=4):
    im = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((20, 28, 20 + w, 28 + h), r, fill=(0, 0, 0, 120))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    d.rounded_rectangle((20, 20, 20 + w, 20 + h), r, fill=fill, outline=(border + (255,)) if border else None, width=bw if border else 0)
    return im

@functools.lru_cache(None)
def star4(size, color):
    """four-point sparkle"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c, r, q = size / 2, size / 2, size * 0.09
    d.polygon([(c, 0), (c + q, c - q), (size, c), (c + q, c + q), (c, size), (c - q, c + q), (0, c), (c - q, c - q)], fill=color + (255,))
    g = im.filter(ImageFilter.GaussianBlur(size * 0.06)); out = Image.new("RGBA", im.size); out.alpha_composite(g); out.alpha_composite(im)
    return out

@functools.lru_cache(None)
def rect_sprite(w, h, color):
    return Image.new("RGBA", (w, h), color + (255,))

def place(canvas, sp, cx, cy, scale=1.0, rot=0.0, alpha=1.0, anchor=(0.5, 0.5)):
    """Composite sprite `sp` onto canvas with its anchor point at (cx, cy)."""
    if scale <= 0.01 or alpha <= 0.004: return
    w, h = sp.size
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    s = sp.resize((nw, nh), Image.LANCZOS if scale < 1 else Image.BICUBIC) if (nw, nh) != (w, h) else sp
    ax, ay = anchor[0] * nw, anchor[1] * nh
    if rot:
        big = Image.new("RGBA", (int(nw * 2.2) + 4, int(nh * 2.2) + 4), (0, 0, 0, 0))
        bx, by = big.size[0] // 2, big.size[1] // 2
        big.alpha_composite(s, (int(bx - ax), int(by - ay)))
        s = big.rotate(rot, resample=Image.BICUBIC); ax, ay = bx, by
    if alpha < 0.999:
        a = s.getchannel("A").point(lambda v: int(v * alpha)); s = s.copy(); s.putalpha(a)
    x0, y0 = int(round(cx - ax)), int(round(cy - ay))
    cw, ch = canvas.size
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(s.size[0], cw - x0), min(s.size[1], ch - y0)
    if sx1 <= sx0 or sy1 <= sy0: return
    if (sx0, sy0, sx1, sy1) != (0, 0) + s.size: s = s.crop((sx0, sy0, sx1, sy1))
    canvas.alpha_composite(s, (x0 + sx0, y0 + sy0))

def overlay_draw(img, fn):
    """ImageDraw replaces pixels instead of blending; draw translucent shapes on a layer and composite it"""
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0)); fn(ImageDraw.Draw(lay)); img.alpha_composite(lay)

def tinted(sp, color, a=1.0):
    """flat-colour version of a sprite (silhouettes, rim glows)"""
    arr = np.zeros(sp.size[::-1] + (4,), np.uint8); arr[..., :3] = color
    arr[..., 3] = (np.asarray(sp.getchannel("A"), np.float32) * a).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")

def grow(sp, pad):
    out = Image.new("RGBA", (sp.size[0] + 2 * pad, sp.size[1] + 2 * pad), (0, 0, 0, 0)); out.alpha_composite(sp, (pad, pad)); return out

# ----------------------------------------------------------------------------- particles
RNG = np.random.default_rng(7)
def emit(cv, t, t0, t1, ox, oy, n, color, spread=140, rise=220, life=1.1, size=(10, 26), seed=0, sprite=None):
    r = np.random.default_rng(seed)
    for k in range(n):
        birth = t0 + r.random() * max(t1 - t0 - life * 0.5, 0.05)
        age = (t - birth) / life
        dx, sz, ph, wob = r.normal(0, spread * 0.45), r.uniform(*size), r.uniform(0, 6.28), r.uniform(10, 30)
        if not (0 <= age <= 1): continue
        x = ox + dx * (0.4 + age) + math.sin(ph + age * 5) * wob
        y = oy - rise * e_out(age) * r.uniform(0.6, 1.2)
        sp = sprite or radial(40, color, 1.6)
        place(cv, sp, x, y, sz / sp.size[0] * (1 - age * 0.6), age * 90 if sprite else 0, math.sin(math.pi * age) * 0.95)

def burst(cv, t, t0, ox, oy, n, sprite_fn, speed=(500, 1100), life=0.9, size=(18, 46), seed=0, grav=900):
    """radial explosion of sprites with gravity"""
    age = t - t0
    if not (0 <= age <= life * 1.3): return
    r = np.random.default_rng(seed)
    for k in range(n):
        ang, sp_, sz, lf, spin = r.uniform(0, 2 * math.pi), r.uniform(*speed), r.uniform(*size), life * r.uniform(0.7, 1.3), r.uniform(-400, 400)
        if age > lf: continue
        drag = (1 - math.exp(-3 * age)) / 3
        x = ox + math.cos(ang) * sp_ * drag
        y = oy + math.sin(ang) * sp_ * drag + 0.5 * grav * age * age * 0.5
        sp = sprite_fn(k)
        place(cv, sp, x, y, sz / sp.size[0] * (1 - 0.5 * age / lf), spin * age, 1 - e_in(age / lf))

CONF_COLS = [(255, 70, 90), (255, 210, 50), (70, 220, 120), (70, 170, 255), (190, 110, 255), (255, 255, 255)]
def confetti(cv, t, t0, ox, oy, n=60, seed=5):
    age = t - t0
    if not (0 <= age <= 2.2): return
    r = np.random.default_rng(seed)
    for k in range(n):
        ang = r.uniform(-math.pi * 0.95, -math.pi * 0.05); sp_ = r.uniform(700, 1500)
        vx, vy = math.cos(ang) * sp_, math.sin(ang) * sp_
        drag = (1 - math.exp(-2.6 * age)) / 2.6
        x = ox + vx * drag + math.sin(age * r.uniform(3, 7) + k) * 40 * age
        y = oy + vy * drag + 420 * age * age
        col = CONF_COLS[k % len(CONF_COLS)]
        w_ = int(r.uniform(12, 22)); h_ = int(w_ * r.uniform(0.4, 0.7))
        flip = abs(math.cos(age * r.uniform(6, 14) + k))
        place(cv, rect_sprite(w_, max(2, int(h_ * (0.25 + 0.75 * flip))), col), x, y, 1, r.uniform(0, 360) + age * r.uniform(-500, 500), 1 - e_in((age - 1.4) / 0.8))

# ----------------------------------------------------------------------------- source video
SRC = np.memmap(A("frames.u8"), np.uint8, "r", shape=(NSRC, SH, SW, 3))
def src_index(t):
    return int(np.clip(np.searchsorted(STS, t + 1e-4, side="right") - 1, 0, NSRC - 1))

_x = np.arange(256) / 255.0
_curve = np.clip(_x - 0.03 * np.sin(2 * np.pi * _x), 0, 1) ** 1.04          # gentle S, slightly richer mids
LUT_B = (np.clip(_curve * 0.97, 0, 1) * 255).astype(np.uint8)
LUT_G = (np.clip(_curve * 0.995, 0, 1) * 255).astype(np.uint8)
LUT_R = (np.clip(_curve * 1.02, 0, 1) * 255).astype(np.uint8)
yy, xx = np.mgrid[0:H, 0:W]
_rr = ((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.68)) ** 2
VIG = (1 - 0.26 * np.clip(_rr, 0, 1) ** 1.3).astype(np.float32)[..., None]
EDGE = (np.clip((_rr - 0.25) / 0.9, 0, 1) ** 1.5).astype(np.float32)[..., None]      # 0 centre .. 1 corners
del _rr
_gcache = {}
def graded(i):
    if i in _gcache: return _gcache[i]
    fr = np.asarray(SRC[i])
    fr = cv2.merge([cv2.LUT(fr[..., 0], LUT_B), cv2.LUT(fr[..., 1], LUT_G), cv2.LUT(fr[..., 2], LUT_R)])
    f = fr.astype(np.float32)
    l = (0.114 * f[..., 0] + 0.587 * f[..., 1] + 0.299 * f[..., 2])[..., None]
    f = l + (f - l) * 1.12
    f = cv2.resize(f, (W, 1082), interpolation=cv2.INTER_LANCZOS4)[1:1 + H]
    bl = cv2.GaussianBlur(f, (0, 0), 1.5)
    f = np.clip((f * 1.5 - bl * 0.5) * VIG, 0, 255)
    _gcache[i] = f
    if len(_gcache) > 6: _gcache.pop(next(iter(_gcache)))
    return f

def v(x, y):  # source px -> output px
    return x * S, y * S - 1

# ----------------------------------------------------------------------------- tracks (face for the camera, green toy for overlays)
def _smooth(a, sig):
    k = np.exp(-0.5 * (np.arange(-3 * sig, 3 * sig + 1) / sig) ** 2); k /= k.sum()
    return np.convolve(np.pad(a, len(k) // 2, mode="edge"), k, "valid")
_fc_ = np.array([[f["face"][0] + f["face"][2] / 2, f["face"][1] + f["face"][3] * 0.45] if f["face"] else [np.nan, np.nan] for f in TJ["frames"]])
for j in range(2):
    ok = ~np.isnan(_fc_[:, j]); _fc_[:, j] = np.interp(np.arange(NSRC), np.flatnonzero(ok), _fc_[ok, j])
FACE = np.stack([_smooth(_fc_[:, 0], 12), _smooth(_fc_[:, 1], 12)], 1) * S

def _toy_track():
    P = np.full((NSRC, 5), np.nan)            # cx, cy, top_x, top_y, size
    for f in TJ["frames"]:
        ty = f["toy"]
        if ty: P[f["i"]] = [ty["c"][0], ty["c"][1], ty["top"][0], ty["top"][1], max(ty["box"][2], ty["box"][3])]
    out = {}
    for t0, t1 in ((36.55, 46.0), (49.4, 51.1)):
        idx = np.flatnonzero((STS >= t0) & (STS <= t1))
        Q = P[idx].copy()
        for j in range(5):
            ok = ~np.isnan(Q[:, j])
            if ok.sum() < 2: continue
            Q[:, j] = _smooth(np.interp(np.arange(len(Q)), np.flatnonzero(ok), Q[ok, j]), 2)
        for i, q in zip(idx, Q): out[int(i)] = q * S
    return out
TOY = _toy_track()
def toy_at(i):
    if i in TOY: return TOY[i]
    return None

# ----------------------------------------------------------------------------- camera
# (t, amplitude, attack, hold, release)
PUNCH = [(0.80, 0.07, 0.12, 0.6, 0.4), (3.84, 0.06, 0.1, 0.5, 0.5), (9.60, 0.05, 0.12, 0.6, 0.5),
         (13.04, 0.20, 0.10, 0.75, 0.35), (16.88, 0.06, 0.1, 0.8, 0.5), (19.60, 0.05, 0.12, 0.8, 0.6),
         (24.00, 0.04, 0.2, 1.0, 0.6), (34.38, 0.06, 0.1, 0.5, 0.4), (35.10, 0.07, 0.08, 1.2, 0.4),
         (36.86, 0.05, 0.1, 0.6, 0.5), (50.12, 0.05, 0.12, 0.8, 0.6), (66.84, 0.10, 0.06, 1.0, 0.6),
         (71.64, 0.06, 0.1, 0.7, 0.4)]
SHAKES = [(3.84, 8, 0.3), (6.95, 6, 0.25), (9.62, 5, 0.25), (16.88, 9, 0.35), (21.20, 6, 0.3),
          (CUT, 10, 0.3), (34.38, 5, 0.3), (50.12, 5, 0.25), (66.84, 30, 0.75), (67.30, 10, 0.3), (71.64, 6, 0.3)]
def zoom_env(t, i):
    z = 1.012 + 0.010 * math.sin(t * 0.45)                                    # slow breathing push
    z += 0.22 * (1 - e_out(t / 0.7))                                          # push-out from the title
    for t0, amp, a, h, r in PUNCH:
        z += amp * e_out((t - t0) / a) * (1 - e_io((t - (t0 + h)) / r))
    z += 0.22 * e_io((t - 63.64) / 3.2) * (1 - e_io((t - 67.9) / 0.7))       # suspense creep onto the face
    fx, fy = FACE[i]
    cx, cy = lerp(W / 2, fx, 0.8), lerp(H / 2, fy, 0.8)
    sx = sy = 0.0
    for t0, amp, d in SHAKES:
        k = (t - t0) / d
        if 0 <= k <= 1:
            a = amp * (1 - k) ** 2
            sx += a * math.sin(t * 95); sy += a * math.cos(t * 83)
    return z, cx, cy, sx, sy

CAM = (1.0, W / 2, H / 2, 0, 0)
def cam_pt(x, y):
    z, cx, cy, sx, sy = CAM
    return (x - cx) * z + cx + sx, (y - cy) * z + cy + sy

def warp(f, cam):
    z, cx, cy, sx, sy = cam
    M = np.float32([[z, 0, (1 - z) * cx + sx], [0, z, (1 - z) * cy + sy]])
    return cv2.warpAffine(f, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

# ----------------------------------------------------------------------------- frame effects
def chroma(f, amt):
    if amt < 0.5: return f
    a = max(1, int(round(amt))); out = f.copy()
    out[:, a:, 2] = f[:, :-a, 2]; out[:, :-a, 0] = f[:, a:, 0]
    return out

def glitch(f, amt, seed):
    """horizontal slice displacement + per-slice RGB split"""
    if amt <= 0.02: return f
    r = np.random.default_rng(seed); out = f.copy()
    for _ in range(int(6 + 14 * amt)):
        y0 = int(r.uniform(0, H - 10)); hh = int(r.uniform(6, 30 + 90 * amt)); dx = int(r.normal(0, 60 * amt))
        sl = np.roll(f[y0:y0 + hh], dx, axis=1)
        if r.random() < 0.5: sl = sl.copy(); sl[..., r.integers(0, 3)] *= r.uniform(0.3, 1.6)
        out[y0:y0 + hh] = sl
    return chroma(out, 10 * amt)

def desat(f, k):
    if k <= 0: return f
    l = (0.114 * f[..., 0] + 0.587 * f[..., 1] + 0.299 * f[..., 2])[..., None]
    return f + (l - f) * k

_grain = None
def grain(f, t, amt=4.0):
    global _grain
    if _grain is None:
        r = np.random.default_rng(1)
        _grain = [cv2.resize(r.normal(0, 1, (H // 2, W // 2)).astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)[..., None] for _ in range(6)]
    return f + _grain[int(t * FPS) % 6] * amt

SCAN = (0.86 + 0.14 * (np.arange(H) % 4 < 2)).astype(np.float32)[:, None, None]
def vhs(f, t, k):
    """old VHS memory: washed warm colour, scanlines, colour bleed, rolling noise bar, wobble"""
    if k <= 0: return f
    g = desat(f, 0.55) * np.array([0.86, 0.97, 1.12], np.float32) + np.array([6, 8, 18], np.float32)
    g = cv2.GaussianBlur(g, (0, 0), 1.6)
    g = chroma(g, 6)
    r = np.random.default_rng(int(t * FPS))
    off = (np.sin(np.arange(H) / 23 + t * 9) * 2.5 + r.normal(0, 0.7, H)).astype(np.int32)
    by = int((t * 260) % (H + 200)) - 100                     # rolling tracking-noise band
    for y0 in range(max(0, by), min(H, by + 46)):
        off[y0] += int(r.normal(0, 9))
    rows = (np.arange(W)[None, :] - off[:, None]) % W
    g = g[np.arange(H)[:, None], rows]
    lo, hi = max(0, by), min(H, by + 46)
    if hi > lo: g[lo:hi] = g[lo:hi] * 0.7 + r.uniform(60, 200, (hi - lo, W, 1)).astype(np.float32) * 0.3
    g = g * SCAN
    return f + (g - f) * k

def spotlight(f, cx, cy, rad, amt):
    if amt <= 0: return f
    m = np.clip((np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) - rad) / (rad * 0.6), 0, 1).astype(np.float32)[..., None]
    return f * (1 - m * amt)


# ----------------------------------------------------------------------------- subtitles
# (word, start, end) in source seconds; "|" starts a new caption line. Timings from Parakeet TDT, text cross-checked with Whisper.
WORDS = [
    ("TUDO", 0.00, 0.18), ("BEM?", 0.18, 0.40), ("MEU", 0.40, 0.56), ("NOME", 0.56, 0.68), ("É", 0.68, 0.80), ("PEDRO", 0.80, 1.36),
    ("|EU", 1.52, 1.76), ("TÔ", 1.76, 2.08), ("TENTANDO", 2.08, 2.48), ("DESENVOLVER", 2.48, 3.20),
    ("|JOGOS", 3.20, 3.68), ("DE", 3.68, 3.84), ("TERROR.", 3.84, 4.90),
    ("|O", 5.12, 5.26), ("DE", 5.26, 5.52), ("SOBREVIVÊNCIA", 5.52, 6.40),
    ("|VAI", 6.56, 6.80), ("PRA", 6.80, 7.20), ("LÁ.", 7.20, 7.90),
    ("|E", 8.16, 8.40), ("TAMBÉM", 8.40, 8.80), ("HOJE", 8.80, 9.04), ("É", 9.04, 9.20), ("O", 9.20, 9.36), ("DIA", 9.36, 9.60), ("2", 9.60, 9.98),
    ("|TENTANDO", 10.00, 10.40), ("DESENVOLVER.", 10.40, 10.98),
    ("|EU", 11.04, 11.20), ("TIVE", 11.20, 11.60), ("MUITO", 11.60, 11.76), ("TEMPO", 11.76, 12.16), ("PRA", 12.16, 12.48), ("ISSO.", 12.48, 13.00),
    ("|CLARAMENTE.", 13.04, 13.90),
    ("|ENTÃO...", 14.96, 15.70),
    ("|EU", 15.84, 16.16), ("TENHO", 16.16, 16.56), ("MAIS", 16.56, 16.88), ("SPOILERS", 16.88, 17.68), ("PRA", 17.68, 18.00), ("DAR.", 18.00, 18.75),
    ("|VAI", 18.80, 19.12), ("TER", 19.12, 19.36), ("UM", 19.36, 19.60), ("NPC", 19.60, 20.40),
    ("|NO", 20.48, 20.72), ("JOGO", 20.72, 21.04), ("DE", 21.04, 21.20), ("TERROR.", 21.20, 21.80),
    ("|E", 21.84, 22.16), ("ELE...", 22.16, 23.05),
    ("|É", 23.12, 23.44), ("O", 23.44, 23.68), ("MEU", 23.68, 24.00), ("BRINQUEDO", 24.00, 24.75), ("FAVORITO.", 24.75, 25.65),
    ("|EU", 25.76, 26.08), ("BRINCO", 26.08, 26.48), ("DESDE", 26.48, 27.04), ("CRIANÇA", 27.04, 27.68), ("COM", 27.68, 27.84), ("ELE.", 27.84, 28.20),
    ("|E", 28.32, 28.64), ("EU", 28.64, 28.88), ("VOU", 28.88, 29.04), ("DAR", 29.04, 29.20), ("UM", 29.20, 29.36), ("CORTEZINHO", 29.36, 30.20),
    ("|RÁPIDO", 30.24, 30.80), ("PRA", 30.80, 31.12), ("MOSTRAR", 31.12, 31.68), ("ELE.", 31.68, 32.20),
    ("|ISSO", 33.51, 33.82), ("É", 33.82, 33.98), ("COMO", 33.98, 34.38), ("MÁGICA!", 34.38, 35.10),
    ("|VOLTEI", 35.10, 35.66), ("RÁPIDO,", 35.66, 36.14), ("NÉ?", 36.14, 36.70),
    ("|OLHA!", 36.86, 37.70),
    ("|ESSE", 37.82, 38.22), ("CARINHA", 38.22, 38.94), ("AQUI", 38.94, 39.40),
    ("|É", 39.58, 40.22), ("O", 40.22, 40.46), ("MEU", 40.46, 40.94), ("PRIMEIRO", 40.94, 41.50), ("BRINQUEDO.", 41.50, 42.46),
    ("|TÁ", 42.70, 43.10), ("ATÉ", 43.10, 43.34), ("ESCRITO", 43.34, 43.74), ("EM", 43.74, 43.82), ("CIMA", 43.82, 44.06),
    ("|DA", 44.06, 44.14), ("CABEÇA", 44.14, 44.46), ("DELE,", 44.46, 44.78),
    ("|PRA", 44.78, 44.94), ("QUEM", 44.94, 45.10), ("NÃO", 45.10, 45.26), ("ENTENDEU.", 45.26, 45.85),
    ("|ENTÃO,", 46.44, 47.50), ("É", 47.64, 47.96), ("ISSO.", 47.96, 48.44),
    ("|ESSE", 48.44, 48.76), ("VAI", 48.76, 48.92), ("SER", 48.92, 49.16), ("UM", 49.16, 49.32), ("DOS", 49.32, 49.48), ("NOSSOS", 49.48, 50.12),
    ("|NPCs", 50.12, 50.92), ("PRINCIPAIS.", 50.92, 51.60),
    ("|ELE", 51.80, 52.12), ("VAI", 52.12, 52.44), ("ESTAR", 52.44, 52.76), ("COM", 52.76, 53.08), ("VOCÊ", 53.08, 53.64),
    ("|DURANTE", 53.64, 54.40), ("O", 54.84, 55.16), ("JOGO", 55.16, 55.80), ("TODO.", 55.80, 56.52),
    ("|ENTÃO...", 57.24, 57.90),
    ("|ELE", 58.68, 58.92), ("VAI", 58.92, 59.24), ("TE", 59.24, 59.48), ("PERSEGUIR...", 59.48, 60.40),
    ("|E", 61.72, 62.04), ("VAI", 62.04, 62.52), ("TE", 62.52, 62.68), ("DANDO", 62.68, 63.08), ("DICAS.", 63.08, 63.60),
    ("|MAS", 63.64, 63.96), ("NUM", 63.96, 64.12), ("MOMENTO", 64.12, 64.70),
    ("|ELE", 64.84, 65.16), ("VAI...", 65.16, 66.40),
    ("|É,", 68.20, 68.76), ("APESAR", 68.76, 69.40), ("DE", 69.40, 69.64), ("TUDO", 69.64, 69.96), ("ISSO,", 69.96, 70.40),
    ("|O", 70.52, 70.76), ("JOGO", 70.76, 71.08), ("VAI", 71.08, 71.32), ("FICAR", 71.32, 71.64), ("BOM.", 71.64, 72.44),
]
LINES = []
for w_, s_, e_ in WORDS:
    if w_.startswith("|") or not LINES: LINES.append([]); w_ = w_.lstrip("|")
    LINES[-1].append((w_, s_, e_))

GREEN, RED, YELLOW, CYAN = (80, 255, 120), (255, 52, 52), (255, 222, 40), (60, 220, 255)
ORANGE, PINK, PURPLE = (255, 150, 30), (255, 110, 175), (200, 130, 255)
KEYC = {"TERROR": RED, "SOBREVIVÊNCIA": GREEN, "PEDRO": YELLOW, "NPC": CYAN, "NPCS": CYAN, "SPOILERS": ORANGE,
        "DIA": YELLOW, "2": YELLOW, "MÁGICA": PURPLE, "BRINQUEDO": PINK, "FAVORITO": PINK, "CARINHA": GREEN,
        "BOM": GREEN, "CORTEZINHO": CYAN, "CLARAMENTE": YELLOW, "PRIMEIRO": PINK, "PERSEGUIR": ORANGE, "DICAS": YELLOW}
def word_color(w_):
    return KEYC.get(w_.strip(".,!?").upper())

SUB_SIZE, SUB_Y, SUB_SPACE = 66, 972, 20
def draw_subs(cv, t):
    for li, line in enumerate(LINES):
        ls, le = line[0][1], line[-1][2]
        nxt = LINES[li + 1][0][1] if li + 1 < len(LINES) else le + 0.6
        end = min(le + 0.45, nxt)
        if not (ls - 0.02 <= t <= end): continue
        a_line = c01((end - t) / 0.08)
        items = []
        for n, (w_, s_, e_) in enumerate(line):
            kc = word_color(w_)
            e2 = le + 0.12 if n == len(line) - 1 else max(e_, s_ + 0.12)
            act = c01((t - s_) / 0.05) * c01((e2 - t) / 0.07)
            col = kc or (YELLOW if act > 0.5 else (255, 255, 255))
            sp = text_img(w_, "black", SUB_SIZE, fill=col, stroke=7, stroke_fill=(8, 8, 10), shadow=5)
            k = (t - s_) / 0.16
            sc = (lerp(0.55, 1.0, e_out_back(k, 2.6)) if t >= s_ else 1.0) * (1 + 0.10 * act)
            items.append((sp, s_, sc, k))
        tot = sum(sp.size[0] * max(sc, 1.0) for sp, s_, sc, k in items) + SUB_SPACE * (len(items) - 1)
        x = W / 2 - tot / 2
        for sp, s_, sc, k in items:
            wdt = sp.size[0] * max(sc, 1.0)
            if t >= s_ - 0.01:
                place(cv, sp, x + wdt / 2, SUB_Y + (1 - e_out(k)) * 14, sc, 0, c01(k * 2.5) * a_line, (0.5, 0.62))
            x += wdt + SUB_SPACE

# ----------------------------------------------------------------------------- shared pieces
RX = 1530                      # centre of the free wall area on the right (the face lives in x≈380-1100)

def name_tag(cv, t, t0, t1, top, name, color, x, align="left", y=440):
    if not (t0 <= t <= t1): return
    k_in = e_out((t - t0) / 0.45); k_out = e_in((t - (t1 - 0.3)) / 0.3)
    lbl = text_img(top, "black", 40, fill=(12, 12, 14), track=4)
    big = text_img(name, "anton", 200, fill=(255, 255, 255), stroke=0, shadow=8)
    bw = max(lbl.size[0] + 40, big.size[0]) + 30
    sign = 1 if align == "left" else -1
    ox = x + ((1 - k_in) + k_out) * -sign * (bw + 160)
    lab = panel(lbl.size[0] + 40, lbl.size[1] + 26, r=14, fill=color + (255,))
    lw = lab.size[0] - 40
    lx = ox if sign > 0 else ox - lw
    place(cv, lab, lx - 20, y - 20, 1, 0, 1, (0, 0))
    place(cv, lbl, lx + 20, y + (lbl.size[1] + 26) / 2, 1, 0, 1, (0, 0.5))
    kb = e_out((t - t0 - 0.08) / 0.45)
    bx = ox + (1 - kb) * -sign * 60
    place(cv, big, bx if sign > 0 else bx - big.size[0], y + lbl.size[1] + 40, 1, 0, c01((t - t0 - 0.08) / 0.15), (0, 0))
    bar_w = int(bw * e_out((t - t0 - 0.15) / 0.4))
    if bar_w > 4:
        place(cv, rect_sprite(bar_w, 18, color), ox + (0 if sign > 0 else -bar_w), y + lbl.size[1] + 40 + big.size[1] + 24, 1, 0, 1, (0, 0.5))

def card_img(w, h, border, fill=(12, 12, 18, 220), r=34, bw=5):
    im = Image.new("RGBA", (w + 60, h + 60), (0, 0, 0, 0))
    im.alpha_composite(panel(w, h, r, fill, border, bw), (10, 10))
    return im

def red_x(cv, cx, cy, size, k1, k2, width=26):
    d = ImageDraw.Draw(cv)
    for k, (a, b) in ((k1, ((-1, -1), (1, 1))), (k2, ((1, -1), (-1, 1)))):
        if k <= 0: continue
        x0, y0 = cx + a[0] * size / 2, cy + a[1] * size / 2
        x1, y1 = lerp(x0, cx + b[0] * size / 2, k), lerp(y0, cy + b[1] * size / 2, k)
        d.line((x0, y0, x1, y1), fill=(10, 0, 0, 230), width=width + 10)
        d.line((x0, y0, x1, y1), fill=(255, 40, 40, 255), width=width)

TOY_IMG = None
def toy_img():
    global TOY_IMG
    if TOY_IMG is None:
        im = Image.open(A("assets", "toy.png")).convert("RGBA")
        im = im.resize((im.size[0] * 2, im.size[1] * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(3, 120, 2))
        a = im.getchannel("A")
        im = ImageEnhance.Brightness(ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(1.55)).enhance(1.2)).enhance(0.95)
        im.putalpha(a)
        TOY_IMG = im
    return TOY_IMG

@functools.lru_cache(None)
def toy_silhouette(rim):
    t_ = toy_img(); p = 30
    out = Image.new("RGBA", (t_.size[0] + 2 * p, t_.size[1] + 2 * p), (0, 0, 0, 0))
    glow = grow(tinted(t_, rim), p).filter(ImageFilter.GaussianBlur(12))
    out.alpha_composite(glow); out.alpha_composite(glow)
    out.alpha_composite(grow(tinted(t_, rim), p).filter(ImageFilter.GaussianBlur(2)))
    out.alpha_composite(grow(tinted(t_, (8, 6, 12)), p), (0, 0))
    return out

@functools.lru_cache(None)
def toy_glow(color):
    t_ = toy_img(); p = 40
    out = grow(tinted(t_, color), p).filter(ImageFilter.GaussianBlur(16))
    o2 = Image.new("RGBA", out.size); o2.alpha_composite(out); o2.alpha_composite(out); o2.alpha_composite(grow(t_, p))
    return o2

def toy_gray():
    t_ = toy_img(); g = t_.convert("LA").convert("RGBA"); g.putalpha(t_.getchannel("A")); return g

# ----------------------------------------------------------------------------- graphics, in story order (t = source seconds)
def g_wave(cv, t):
    sc = pop(t, 0.0, 0.92, 0.3, 0.2)
    if sc > 0: place(cv, anim("n_wave.webp", t), 1500, 380, sc * 0.8, 0, 1)

def g_dev(cv, t):
    """'tentando desenvolver jogos de terror': loading card that glitches into a horror card"""
    t0, t1, tx = 2.10, 4.95, 3.84
    sc = pop(t, t0, t1, 0.4, 0.25)
    if sc <= 0: return
    hor = t >= tx
    gl = decay(t, tx, 0.3)
    jx = math.sin(t * 90) * 14 * gl
    cx, cy = RX, 400
    col = RED if hor else (150, 120, 255)
    place(cv, radial(640, col, 2.4), cx, cy, sc, 0, 0.5 + 0.3 * gl)
    place(cv, panel(440, 400, 34, (12, 10, 16, 215), col, 5), cx + jx, cy, sc, -2, 1)
    if not hor:
        bob = math.sin(t * 4) * 8
        place(cv, static("f_Video_Game.png"), cx, cy - 70 + bob, sc * 0.95, math.sin(t * 3) * 5, 1)
        place(cv, static("f_Hammer_and_Wrench.png"), cx + 140, cy - 150 - bob, sc * 0.42, 20 + math.sin(t * 5) * 10, 1)
        k = e_io((t - (t0 + 0.2)) / (tx - t0 - 0.25))
        pw, ph = 340, 26
        place(cv, panel(pw, ph, 13, (20, 16, 40, 200), (255, 255, 255), 3), cx, cy + 82, sc, 0, 1)
        if k > 0.02:
            fl = Image.new("RGBA", (max(2, int((pw - 10) * k)), ph - 10), (0, 0, 0, 0))
            ImageDraw.Draw(fl).rounded_rectangle((0, 0, fl.size[0] - 1, ph - 11), 8, fill=(150, 120, 255, 255))
            place(cv, fl, cx - (pw - 10) / 2 * sc, cy + 82, sc, 0, 1, (0, 0.5))
        place(cv, text_img("DESENVOLVENDO...", "black", 32, stroke=5, stroke_fill=(20, 12, 50)), cx, cy + 140, sc, 0, 1)
    else:
        s2 = e_out_back((t - tx) / 0.3, 2.4)
        place(cv, anim("n_ghost.webp", t, tx), cx - 95, cy - 70 + math.sin(t * 5) * 8, sc * s2 * 0.62, -8, 1)
        place(cv, anim("f_Zombie.png", t, tx), cx + 95, cy - 70, sc * s2 * 0.8, 6, 1)
        place(cv, text_img("JOGOS DE", "black", 36, stroke=5, stroke_fill=(0, 0, 0)), cx + jx, cy + 70, sc * s2, -2, 1)
        place(cv, text_img("TERROR", "creep", 120, fill=RED, stroke=6, stroke_fill=(0, 0, 0), glow=(150, 0, 0), glow_r=12), cx - jx, cy + 150, sc * s2, -2, 1)

def g_surv(cv, t):
    """'o de sobrevivência vai pra lá': survival card gets crossed out and flung off screen"""
    t0, tx, tf, t1 = 5.20, 6.56, 6.98, 7.55
    if not (t0 <= t <= t1): return
    s = e_out_back((t - t0) / 0.4)
    card = card_img(420, 380, GREEN)
    c = card.size[0] / 2
    place(card, anim("n_camping.webp", t, t0), c, 175, 0.72, 0, 1)
    place(card, text_img("SOBREVIVÊNCIA", "ops", 40, fill=GREEN, stroke=4, stroke_fill=(0, 0, 0), glow=(0, 90, 20), glow_r=8), c, 335, 1, 0, 1)
    red_x(card, c, card.size[1] / 2, 300, e_out((t - tx) / 0.14), e_out((t - tx - 0.12) / 0.14))
    fl = e_in((t - tf) / 0.5)
    cx, cy = RX + 1100 * fl, 400 - 380 * fl + 900 * fl * fl
    rot = 3 + math.sin(t * 3) * 2 - 200 * fl
    place(cv, radial(600, GREEN, 2.4), RX, 400, s * (1 - fl), 0, 0.4)
    place(cv, card, cx, cy, s * (1 - 0.3 * fl), rot, 1)
    if t >= tf: emit(cv, t, tf, tf + 0.4, RX + 60, 400, 12, (255, 255, 255), 200, 120, 0.5, (8, 20), 31)

def calendar_page(num, header=(230, 40, 50)):
    im = Image.new("RGBA", (300, 330), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 10, 299, 329), 28, fill=(250, 248, 244, 255))
    d.rounded_rectangle((0, 10, 299, 100), 28, fill=header + (255,)); d.rectangle((0, 70, 299, 100), fill=header + (255,))
    for x in (80, 220):
        d.rounded_rectangle((x - 9, 0, x + 9, 34), 9, fill=(60, 60, 70, 255))
    lbl = text_img("DIA", "black", 48, fill=(255, 255, 255), track=6)
    im.alpha_composite(lbl, (150 - lbl.size[0] // 2, 56 - lbl.size[1] // 2 + 4))
    n = text_img(num, "anton", 190, fill=(30, 30, 36))
    im.alpha_composite(n, (150 - n.size[0] // 2, 218 - n.size[1] // 2))
    return im

_cal = {}
def cal_pages():
    if not _cal:
        _cal["back"] = calendar_page("2"); _cal["front"] = calendar_page("1")
        sh = Image.new("RGBA", (340, 370), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((20, 34, 320, 352), 28, fill=(0, 0, 0, 120))
        _cal["shadow"] = sh.filter(ImageFilter.GaussianBlur(10))
    return _cal

BADGE_X, BADGE_Y = 44, 74
def g_calendar(cv, t):
    """'hoje é o dia 2': page "1" tears off revealing "2", then it flies into the corner badge"""
    t0, tear, fly0 = 9.10, 9.60, 10.45
    if t < t0: return
    fly = e_io((t - fly0) / 0.45)
    if fly < 1:
        s_in = e_out_back((t - t0) / 0.38, 2.2)
        cx, cy = lerp(RX, BADGE_X + 50, fly), lerp(410, BADGE_Y + 20, fly)
        sc = s_in * lerp(1.0, 0.2, fly)
        p = cal_pages()
        place(cv, radial(600, (255, 210, 60), 2.3), cx, cy, sc, 0, 0.55 * (1 - fly))
        place(cv, p["shadow"], cx, cy, sc, -4, 1)
        place(cv, p["back"], cx, cy, sc, -4, 1)
        k = (t - tear) / 0.7
        if k < 0:
            place(cv, p["front"], cx, cy, sc, -4 + math.sin(t * 9) * 0.6, 1)
        elif k <= 1 and fly == 0:
            # torn page: swings down from its right ring and falls away
            place(cv, p["front"], cx + 40 * k + 160 * k * k, cy + 900 * k * k, sc * (1 - 0.1 * k), -4 - 70 * e_out(k * 1.4), 1 - e_in(k))
        if t >= tear:
            burst(cv, t, tear + 0.02, cx, cy, 18, lambda k: star4(48, (255, 220, 80) if k % 2 else (255, 255, 255)), (500, 900), 0.8, (20, 40), 41, 300)
    if fly > 0.8:
        a = c01((fly - 0.8) / 0.2) * (1 - c01((t - (MAIN1 - MAIN0) + 0.2) / 0.25))
        draw_badge(cv, t, a, fly0 + 0.45)

def draw_badge(cv, t, a, t_ring):
    d1 = text_img("DIA 02", "anton", 52, fill=(255, 255, 255))
    d2 = text_img("DEVLOG", "black", 22, fill=(255, 210, 60), track=3)
    pw = 22 + 64 + 14 + d1.size[0] + 16 + d2.size[0] + 26
    p = panel(pw, 84, r=42, fill=(12, 12, 16, 210), border=(255, 210, 60), bw=3)
    place(cv, p, 24, 32, 1, 0, a, (0, 0))
    place(cv, static("f_Tear-Off_Calendar.png"), 44 + 22 + 32, 94, 0.26, 0, a)
    place(cv, d1, 44 + 22 + 64 + 14, 94, 1, 0, a, (0, 0.5))
    place(cv, d2, 44 + 22 + 64 + 14 + d1.size[0] + 16, 95, 1, 0, a, (0, 0.5))
    pr = c01((t - t_ring) / 0.5)
    if 0 < pr < 1:
        place(cv, ring(pw, 84, (255, 210, 60), 4, 6), 44 + pw / 2, 94, 1 + pr * 0.25, 0, (1 - pr) * 0.8)

def g_time(cv, t):
    """'eu tive muito tempo pra isso': hourglass + clock ring sweeping fast"""
    t0, t1 = 11.10, 13.12
    sc = pop(t, t0, t1, 0.4, 0.18)
    if sc <= 0: return
    cx, cy = RX, 390
    place(cv, radial(620, (80, 170, 255), 2.4), cx, cy, sc, 0, 0.45)
    # clock face ring with a fast sweeping hand
    R = 190
    face = Image.new("RGBA", (2 * R + 20, 2 * R + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(face)
    d.ellipse((10, 10, 2 * R + 10, 2 * R + 10), fill=(14, 18, 30, 210), outline=(255, 255, 255, 255), width=8)
    for k in range(12):
        an = k * math.pi / 6; r0 = R - (26 if k % 3 == 0 else 16)
        d.line((R + 10 + math.cos(an) * r0, R + 10 + math.sin(an) * r0, R + 10 + math.cos(an) * (R - 6), R + 10 + math.sin(an) * (R - 6)), fill=(255, 255, 255, 255), width=6 if k % 3 == 0 else 3)
    sweep = (t - t0) * 720
    overlay_draw(face, lambda d_: d_.pieslice((22, 22, 2 * R - 2, 2 * R - 2), -90, -90 + sweep % 360, fill=(80, 170, 255, 90)))
    for ln, sp_, wd in ((R * 0.55, 60, 10), (R * 0.8, 720, 6)):
        an = math.radians((t - t0) * sp_ * 6 - 90)
        d.line((R + 10, R + 10, R + 10 + math.cos(an) * ln, R + 10 + math.sin(an) * ln), fill=(255, 255, 255, 255), width=wd)
    d.ellipse((R - 2, R - 2, R + 22, R + 22), fill=(255, 210, 60, 255))
    place(cv, face, cx, cy - 20, sc, 0, 1)
    place(cv, anim("n_hourglass2.webp", t, t0), cx + 175, cy + 150, sc * 0.55, 10, 1)
    place(cv, text_img("MUITO TEMPO", "black", 54, stroke=7, stroke_fill=(10, 20, 40), shadow=4), cx, cy + 230, sc, -3, 1)

def g_smirk(cv, t):
    t0, t1 = 13.04, 14.55
    sc = pop(t, t0, t1, 0.3, 0.2, 2.4)
    if sc <= 0: return
    place(cv, radial(520, (255, 210, 60), 2.4), 1420, 360, sc, 0, 0.4)
    place(cv, anim("n_smirk.webp", t, t0), 1420, 360, sc * 0.95, -8 + math.sin(t * 6) * 3, 1)
    place(cv, anim("n_sparkles.webp", t, t0), 1560, 230, sc * 0.4, 0, 1)

def g_dots(cv, t):
    t0, t1 = 14.90, 15.80
    sc = pop(t, t0, t1, 0.3, 0.18)
    if sc <= 0: return
    b = Image.new("RGBA", (260, 170), (0, 0, 0, 0)); d = ImageDraw.Draw(b)
    d.rounded_rectangle((6, 6, 250, 120), 54, fill=(255, 255, 255, 255), outline=(20, 20, 24, 255), width=6)
    d.polygon([(50, 112), (30, 164), (96, 116)], fill=(255, 255, 255, 255), outline=(20, 20, 24, 255))
    d.line((52, 116, 32, 160, 92, 118), fill=(20, 20, 24, 255), width=6)
    d.rectangle((50, 108, 92, 116), fill=(255, 255, 255, 255))
    for k in range(3):
        yb = 63 - 16 * max(0, math.sin((t - t0) * 9 - k * 0.9))
        d.ellipse((64 + k * 50 - 15, yb - 15, 64 + k * 50 + 15, yb + 15), fill=(40, 40, 48, 255))
    place(cv, b, 1270, 330, sc, 0, 1, (0.12, 0.95))

@functools.lru_cache(None)
def tape_strip(length=3400, h=92):
    im = Image.new("RGBA", (length, h), (255, 212, 0, 255)); d = ImageDraw.Draw(im)
    txt = text_img("SPOILER", "anton", 66, fill=(12, 12, 12))
    x = 0
    while x < length:
        for k in range(5):                                    # hazard stripes block
            x0 = x + k * 36
            d.polygon([(x0, h), (x0 + 18, h), (x0 + 18 + h * 0.5, 0), (x0 + h * 0.5, 0)], fill=(12, 12, 12, 255))
        x += 5 * 36 + 50
        im.alpha_composite(txt, (x, (h - txt.size[1]) // 2)); x += txt.size[0] + 50
    d.rectangle((0, 0, length, 7), fill=(12, 12, 12, 255)); d.rectangle((0, h - 8, length, h), fill=(12, 12, 12, 255))
    sh = Image.new("RGBA", (length, h + 40), (0, 0, 0, 0)); ImageDraw.Draw(sh).rectangle((0, 26, length, h + 20), fill=(0, 0, 0, 140))
    out = sh.filter(ImageFilter.GaussianBlur(8)); out.alpha_composite(im, (0, 10))
    return out

def g_spoiler(cv, t):
    """'eu tenho mais spoilers pra dar': caution tapes + police lights"""
    t0, t1 = 16.80, 18.95
    if not (t0 <= t <= t1 + 0.1): return
    # police light washes on the edges
    a = fade(t, t0, t1, 0.15, 0.3)
    ph = int((t - t0) * 7) % 2
    place(cv, radial(1100, (255, 30, 40), 1.6), -60, 540, 1, 0, a * (0.75 if ph == 0 else 0.15))
    place(cv, radial(1100, (40, 90, 255), 1.6), W + 60, 540, 1, 0, a * (0.75 if ph == 1 else 0.15))
    strip = tape_strip()
    for k, (ti, y, ang, dirn) in enumerate(((16.88, 175, -5, 1), (16.98, 800, 4, -1))):
        kin = e_out((t - ti) / 0.28); kout = e_in((t - (t1 - 0.3)) / 0.3)
        if kin <= 0: continue
        off = int(((t - t0) * 260 * dirn) % 1000)
        crop = strip.crop((off, 0, off + 2300, strip.size[1]))
        x = W / 2 + dirn * -1 * (1 - kin) * 2600 + dirn * kout * 2600
        place(cv, crop, x, y, 1, ang, 1)
    sc = pop(t, 16.84, t1, 0.35, 0.22)
    if sc > 0:
        place(cv, anim("n_siren.webp", t, 16.84), RX + 120, 470, sc * 0.95, math.sin(t * 20) * 4, 1)
        place(cv, anim("n_shush.webp", t, 17.6), RX - 120, 540, pop(t, 17.62, t1, 0.3, 0.2) * 0.6, -6, 1)

def pixel_box(w, h, fill=(10, 10, 20, 235), border=(255, 255, 255)):
    im = Image.new("RGBA", (w + 16, h + 16), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rectangle((8, 0, w + 8, h + 16), fill=border + (255,)); d.rectangle((0, 8, w + 16, h + 8), fill=border + (255,))
    d.rectangle((14, 6, w + 2, h + 10), fill=fill); d.rectangle((6, 14, w + 10, h + 2), fill=fill)
    d.rectangle((14, 14, w + 2, h + 2), outline=border + (120,), width=2)
    return im

def g_npc(cv, t):
    """'vai ter um NPC no jogo de terror. E ele... é o meu brinquedo favorito'"""
    # 8-bit unlock banner, typed
    tb0, tb1 = 19.52, 22.95
    if tb0 <= t <= tb1:
        k_in = e_out_back((t - tb0) / 0.4, 1.6); k_out = e_in((t - (tb1 - 0.3)) / 0.3)
        y = lerp(-120, 100, k_in) - 260 * k_out
        full = "NOVO NPC DESBLOQUEADO!"
        n = int(c01((t - 19.62) / 0.75) * len(full))
        txt = text_img(full, "pixel", 34, fill=(255, 222, 40))
        box = pixel_box(txt.size[0] + 60, 74)
        place(cv, box, W / 2, y, 1, 0, 1)
        if n:
            part = text_img(full[:n], "pixel", 34, fill=(255, 222, 40))
            place(cv, part, W / 2 - txt.size[0] / 2, y + 2, 1, 0, 1, (0, 0.5))
        if n == len(full):
            for sx in (-1, 1):
                place(cv, star4(56, (255, 240, 150)), W / 2 + sx * (txt.size[0] / 2 + 70), y, 0.8 + 0.3 * math.sin(t * 12), t * 90 * sx, 1)
    # mystery character card
    t0, t1 = 19.75, 25.78
    sc = pop(t, t0, t1, 0.42, 0.25)
    if sc <= 0: return
    fav = c01((t - 24.0) / 0.3)
    redf = decay(t, 21.2, 0.45) * (0.5 + 0.5 * math.sin(t * 60))
    rim = tuple(int(lerp(c, p, fav)) for c, p in zip(lerp_col(CYAN, RED, redf), PINK)) if fav else lerp_col(CYAN, RED, redf)
    card = card_img(420, 560, rim, (16, 10, 30, 225))
    c = card.size[0] / 2
    place(card, radial(420, rim, 2.0), c, 270, 1, 0, 0.35 + 0.15 * math.sin(t * 4))
    sil = toy_silhouette(CYAN if not fav else PINK)
    place(card, sil, c, 300 + math.sin(t * 2.5) * 6, 0.62, 0, 1)
    if not fav:
        q = text_img("?", "bungee", 120, fill=(255, 255, 255), stroke=6, stroke_fill=(0, 0, 0), glow=CYAN, glow_r=10)
        place(card, q, c + 120, 120 + math.sin(t * 5) * 6, 0.9 + 0.08 * math.sin(t * 7), 12, 1)
    nm = pixel_box(300, 48, (0, 0, 0, 230), rim)
    place(card, nm, c, 532, 1, 0, 1)
    place(card, text_img("???" if not fav else "FAVORITO", "pixel", 26, fill=(255, 255, 255) if not fav else PINK), c, 532, 1, 0, 1)
    place(cv, card, RX + 40, 480, sc, 2, 1)
    if fav:
        emit(cv, t, 24.05, 25.7, RX + 40, 560, 14, PINK, 260, 420, 1.2, (60, 110), 51, sprite=anim("n_heart.webp", t, 24.0))
        hs = pop(t, 24.0, t1, 0.35, 0.22, 2.6)
        place(cv, anim("n_heart.webp", t, 24.0), RX + 210, 240, hs * 0.55, 14, 1)

def lerp_col(a, b, k):
    return tuple(int(lerp(x, y, k)) for x, y in zip(a, b))

def g_vhs_overlay(cv, t):
    """drawn into the pre-effect layer so it gets the VHS treatment too"""
    t0, t1 = 25.76, 28.30
    if not (t0 <= t <= t1): return
    place(cv, text_img("▶ PLAY" if False else "PLAY", "pixel", 40, fill=(255, 255, 255), shadow=4), W - 70, 78, 1, 0, 1, (1, 0.5))
    tri = Image.new("RGBA", (40, 44), (0, 0, 0, 0)); ImageDraw.Draw(tri).polygon([(0, 0), (40, 22), (0, 44)], fill=(255, 255, 255, 255))
    place(cv, tri, W - 70 - text_img("PLAY", "pixel", 40, fill=(255, 255, 255), shadow=4).size[0] - 24, 78, 1, 0, 1, (1, 0.5))
    secs = int(t)
    place(cv, text_img(f"SP  0:00:{secs:02d}", "pixel", 26, fill=(255, 255, 255), shadow=3), W - 70, 140, 1, 0, 1, (1, 0.5))
    sc = pop(t, t0 + 0.15, t1, 0.4, 0.2)
    if sc > 0:
        place(cv, anim("f_Baby.png", t, t0), RX, 410, sc * 1.25, math.sin(t * 3) * 4, 1)
        place(cv, text_img("DESDE CRIANÇA", "pixel", 34, fill=(255, 255, 255), stroke=4, stroke_fill=(0, 0, 0)), RX, 610, sc, 0, 1)
        place(cv, anim("n_heart.webp", t, t0), RX + 150, 290, sc * 0.4, 12, 1)

CUT_P0, CUT_P1 = np.array([-60.0, 250.0]), np.array([1980.0, 820.0])
CUT_U = (CUT_P1 - CUT_P0) / np.linalg.norm(CUT_P1 - CUT_P0)
CUT_N = np.array([CUT_U[1], -CUT_U[0]])           # points up-right
CUT_ANG = math.degrees(math.atan2(CUT_U[1], CUT_U[0]))
def g_scissors(cv, t):
    """'vou dar um cortezinho rápido': dashed cut line, scissors run along it, then the real cut splits the frame"""
    t0, ts0, ts1 = 29.36, 29.85, CUT - 0.04
    if not (t0 <= t < CUT): return
    L = np.linalg.norm(CUT_P1 - CUT_P0)
    draw_k = e_out((t - t0) / 0.45)
    u_sc = e_io((t - ts0) / (ts1 - ts0))
    d = ImageDraw.Draw(cv)
    dash, gap = 34, 20
    s = 0.0
    while s < L * draw_k:
        a = CUT_P0 + CUT_U * s; b = CUT_P0 + CUT_U * min(s + dash, L * draw_k)
        if s > u_sc * L:
            d.line((*a, *b), fill=(0, 0, 0, 160), width=12)
            d.line((*a, *b), fill=(255, 255, 255, 255), width=6)
        s += dash + gap
    if u_sc > 0:                                          # cut part: thin glowing slit
        a = CUT_P0; b = CUT_P0 + CUT_U * u_sc * L
        d.line((*a, *b), fill=(255, 255, 255, 90), width=14)
        d.line((*a, *b), fill=(255, 255, 255, 255), width=3)
    if t >= ts0 - 0.2:
        p = CUT_P0 + CUT_U * max(u_sc, 0.0) * L
        sn = math.sin((t - ts0) * 26)                     # snip snip
        sc_ = anim("n_scissors.webp", t, ts0, 1.8)
        place(cv, sc_, p[0], p[1], 0.85 + 0.05 * sn, 90 - CUT_ANG, c01((t - ts0 + 0.2) / 0.2), (0.5, 0.42))
        emit(cv, t, ts0, ts1, p[0], p[1], 3, (255, 255, 255), 30, 40, 0.3, (6, 14), int(t * 10))

def g_magic(cv, t):
    """'isso é como mágica!'"""
    t0, tm, t1 = 33.40, 34.38, 35.15
    sc = pop(t, t0, t1, 0.4, 0.2)
    if sc <= 0: return
    place(cv, radial(700, (170, 90, 255), 2.2), RX, 420, sc, 0, 0.5)
    sway = math.sin((t - t0) * 7) * 18
    place(cv, anim("n_wand.webp", t, t0), RX - 30, 400, sc * 1.6, sway, 1)
    emit(cv, t, t0 + 0.1, t1, RX + 60, 330, 26, (255, 230, 120), 260, 260, 0.9, (14, 34), 61, sprite=star4(40, (255, 236, 150)))
    burst(cv, t, tm, RX + 60, 330, 26, lambda k: star4(48, [(255, 236, 150), (210, 160, 255), (255, 255, 255)][k % 3]), (600, 1200), 0.9, (20, 46), 62, 200)
    ms = pop(t, tm, t1, 0.32, 0.2, 2.6)
    if ms > 0:
        place(cv, text_img("MÁGICA!", "bungee", 116, stroke=7, stroke_fill=(30, 0, 50), glow=(150, 60, 255), glow_r=16,
                           grad=((255, 240, 160), (255, 140, 220), (170, 110, 255))), RX, 650, ms, -4, 1)

def speedlines(cv, t, cx, cy, amt):
    if amt <= 0: return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    r = np.random.default_rng(int(t * 15))
    for k in range(80):
        an = r.uniform(0, 2 * math.pi); r0 = r.uniform(560, 820); r1 = r0 + r.uniform(400, 1000); wd = r.uniform(0.004, 0.012)
        p = [(cx + math.cos(an) * r0, cy + math.sin(an) * r0), (cx + math.cos(an - wd) * r1, cy + math.sin(an - wd) * r1),
             (cx + math.cos(an + wd) * r1, cy + math.sin(an + wd) * r1)]
        d.polygon(p, fill=(255, 255, 255, int(r.uniform(120, 230))))
    if amt < 1: lay.putalpha(lay.getchannel("A").point(lambda v_: int(v_ * amt)))
    cv.alpha_composite(lay)

def g_fast(cv, t, i):
    """'voltei rápido, né?'"""
    t0, t1 = 35.10, 36.75
    a = fade(t, t0, t1, 0.08, 0.25)
    if a <= 0: return
    fx, fy = cam_pt(*FACE[i])
    speedlines(cv, t, fx, fy, a)
    sc = pop(t, t0 + 0.05, t1, 0.3, 0.2, 2.4)
    place(cv, radial(560, (255, 220, 60), 2.3), RX + 60, 380, sc, 0, 0.5)
    place(cv, anim("n_zap.webp", t, t0), RX + 60, 380, sc * 1.25, -10, 1)

def g_toy_reveal(cv, t, i):
    """'olha! esse carinha aqui': ring + eyes on the tracked toy"""
    t0, t1 = 36.86, 39.55
    q = toy_at(i)
    if q is None or not (t0 <= t <= t1): return None
    cx, cy = cam_pt(q[0], q[1]); size = q[4] * CAM[0]
    sc = pop(t, t0, t1, 0.4, 0.25)
    place(cv, ring(int(size * 1.15), int(size * 1.25), GREEN, 7, 9), cx, cy, sc * (1 + 0.04 * math.sin(t * 8)), 0, 0.95)
    es = pop(t, 36.90, 38.30, 0.3, 0.2, 3.0)                 # game "alert" exclamation over its head
    if es > 0:
        hx, hy = cam_pt(q[2], q[3])
        place(cv, text_img("!", "bungee", 170, fill=RED, stroke=9, stroke_fill=(255, 255, 255), shadow=6), hx, max(hy - 30, 160), es, 0, 1, (0.5, 1.0))
    burst(cv, t, 36.88, cx, cy, 16, lambda k: star4(46, (200, 255, 200) if k % 2 else (255, 255, 255)), (500, 900), 0.7, (18, 40), 91, 200)
    return cx, cy, size

def nameplate(t):
    lab = text_img("MEU PRIMEIRO BRINQUEDO", "black", 40, stroke=5, stroke_fill=(0, 0, 0))
    w_ = lab.size[0] + 150; h_ = 132
    im = Image.new("RGBA", (w_ + 40, h_ + 70), (0, 0, 0, 0))
    im.alpha_composite(panel(w_, h_, 22, (10, 12, 20, 225), (255, 210, 60), 4), (0, 0))
    tag = pixel_box(70, 26, CYAN + (255,), (255, 255, 255))
    im.alpha_composite(tag, (110, 26))
    t1_ = text_img("NPC", "pixel", 18, fill=(0, 0, 0)); im.alpha_composite(t1_, (110 + 43 - t1_.size[0] // 2, 26 + 21 - t1_.size[1] // 2))
    t2_ = text_img("Nv. 1", "pixel", 18, fill=(255, 255, 255)); im.alpha_composite(t2_, (210, 47 - t2_.size[1] // 2))
    im.alpha_composite(lab, (108, 66))
    hpw = lab.size[0]; d = ImageDraw.Draw(im)
    d.rounded_rectangle((110, 128, 110 + hpw, 142), 6, fill=(40, 10, 10, 255))
    d.rounded_rectangle((110, 128, 110 + hpw, 142), 6, fill=(70, 230, 110, 255))
    d.rounded_rectangle((110, 128, 110 + hpw, 133), 3, fill=(170, 255, 190, 255))
    medal = static("f_1st_Place_Medal.png")
    im.alpha_composite(medal.resize((104, 104), Image.LANCZOS), (6, 36))
    # pointer to the head
    cxp = 20 + w_ / 2
    d.polygon([(cxp - 26, h_ + 18), (cxp + 26, h_ + 18), (cxp, h_ + 52)], fill=(255, 210, 60, 255))
    # shine sweep on "escrito"
    sw = (t - 43.34) / 0.5
    if 0 <= sw <= 1:
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
        x = -80 + sw * (w_ + 160)
        sd.polygon([(x, 20), (x + 60, 20), (x + 10, h_ + 20), (x - 50, h_ + 20)], fill=(255, 255, 255, 110))
        m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rounded_rectangle((20, 20, 20 + w_, 20 + h_), 22, fill=255)
        sh.putalpha(Image.fromarray(np.minimum(np.asarray(sh.getchannel("A")), np.asarray(m))))
        im.alpha_composite(sh)
    return im, cxp

def g_nameplate(cv, t, i):
    """'é o meu primeiro brinquedo. Tá até escrito em cima da cabeça dele' -> a game NPC nameplate over his head"""
    t0, t1 = 40.90, 45.95
    q = toy_at(i)
    if q is None or not (t0 <= t <= t1): return
    sc = pop(t, t0, t1, 0.42, 0.25) * (1 + 0.12 * bump(t, 43.34, 0.3) + 0.15 * bump(t, 44.14, 0.3))
    im, cxp = nameplate(t)
    hx, hy = cam_pt(q[2], q[3])
    hy -= 20 + 16 * bump(t, 44.14, 0.3) + 6 * math.sin(t * 4)
    s = sc * 1.12
    half = im.size[0] / 2 * s
    x = min(max(hx, half + 20), W - half - 20)
    y = max(hy, im.size[1] * s * 0.82 + 10)
    place(cv, im, x, y, s, 0, 1, (cxp / im.size[0], (im.size[1] - 18) / im.size[1]))
    if t >= 43.34:
        burst(cv, t, 43.36, x, y - 90, 14, lambda k: star4(44, (255, 230, 120)), (400, 800), 0.7, (16, 34), 71, 200)

TRAITS = [  # (time, icon, text, colour)
    (51.80, "f_Pushpin.png", "SEMPRE COM VOCÊ", (255, 255, 255)),
    (59.48, "f_Footprints.png", "TE PERSEGUE", ORANGE),
    (62.68, "f_Light_Bulb.png", "TE DÁ DICAS", YELLOW),
    (66.84, "n_skull.webp", "VAI MORRER", RED),
]
DEATH = 66.84
def g_charcard(cv, t):
    """'esse vai ser um dos nossos NPCs principais' ... -> a character sheet that fills in as he talks"""
    t0, t1 = 49.95, 68.55
    if not (t0 <= t <= t1): return
    sc = pop(t, t0, t1, 0.45, 0.3)
    dead = c01((t - DEATH) / 0.5)
    sus = c01((t - 63.64) / 0.6) * (1 - c01((t - DEATH) / 0.1))
    cw, ch = 520, 770
    border = lerp_col(CYAN, RED, dead)
    card = card_img(cw, ch, border, (10, 14, 24, 228))
    d = ImageDraw.Draw(card)
    ox, oy = 30, 30
    # header
    hs = e_out_back((t - 50.12) / 0.35, 2.4) if t >= 50.12 else 0.0
    hdr = text_img("NPC PRINCIPAL", "bungee", 50, fill=border, stroke=0, glow=border, glow_r=8)
    place(card, text_img("PERSONAGEM", "pixel", 16, fill=(160, 180, 200)), ox + cw / 2, oy + 34, 1, 0, 1)
    if hs > 0: place(card, hdr, ox + cw / 2, oy + 82, hs, 0, 1)
    # portrait
    px0, py0, px1, py1 = ox + 30, oy + 120, ox + cw - 30, oy + 440
    d.rounded_rectangle((px0, py0, px1, py1), 20, fill=(18, 30, 44, 255), outline=border + (255,), width=3)
    for gx in range(px0 + 20, px1, 40): d.line((gx, py0 + 4, gx, py1 - 4), fill=(40, 70, 90, 120), width=1)
    for gy in range(py0 + 20, py1, 40): d.line((px0 + 4, gy, px1 - 4, gy), fill=(40, 70, 90, 120), width=1)
    pc = (ox + cw / 2, (py0 + py1) / 2)
    place(card, radial(380, border, 2.0), pc[0], pc[1], 1, 0, 0.5)
    tg = toy_glow(border)
    if dead > 0:
        g = toy_gray(); gg = grow(g, 40)
        tg2 = Image.blend(tg, gg, dead)
        place(card, tg2, pc[0], pc[1] + 6, 0.5, math.sin(t * 2) * 3 * (1 - dead), 1)
        red_x(card, pc[0], pc[1], 240, e_out((t - DEATH - 0.1) / 0.15), e_out((t - DEATH - 0.22) / 0.15), 20)
    else:
        place(card, tg, pc[0], pc[1] + 6 + math.sin(t * 2.4) * 6, 0.5, math.sin(t * 2) * 3, 1)
    # HP bar
    hy = oy + 470
    place(card, text_img("HP", "pixel", 22, fill=(255, 255, 255)), ox + 40, hy, 1, 0, 1, (0, 0.5))
    bx0, bx1 = ox + 100, ox + cw - 40
    hp = 1 - e_io((t - DEATH - 0.05) / 0.6)
    d.rounded_rectangle((bx0, hy - 12, bx1, hy + 12), 8, fill=(50, 12, 16, 255))
    if hp > 0.01:
        hc = lerp_col((70, 230, 110), (255, 60, 40), 1 - hp)
        d.rounded_rectangle((bx0, hy - 12, bx0 + (bx1 - bx0) * hp, hy + 12), 8, fill=hc + (255,))
    # traits
    for k, (tt, icon, txt, col) in enumerate(TRAITS):
        if t < tt: continue
        ki = e_out((t - tt) / 0.35)
        ry = oy + 530 + k * 62
        xo = (1 - ki) * 120
        fl = decay(t, tt, 0.4)
        if fl > 0: overlay_draw(card, lambda d_: d_.rounded_rectangle((ox + 24, ry - 26, ox + cw - 24, ry + 26), 12, fill=col + (int(90 * fl),)))
        ic = anim(icon, t, tt) if icon.startswith("n_") or icon in ("f_Footprints.png",) else static(icon)
        jit = math.sin(t * 70) * 4 * decay(t, tt, 0.5) if k == 3 else 0
        place(card, ic, ox + 56 + xo, ry, 0.2 if icon.startswith("n_") else 0.24, 0, ki)
        place(card, text_img(txt, "black", 34, fill=col, stroke=4, stroke_fill=(0, 0, 0)), ox + 96 + xo + jit, ry, 1, 0, ki, (0, 0.5))
    # "jogo todo" progress under trait 0
    if t >= 53.4:
        k = e_io((t - 53.64) / 2.9)
        y0 = oy + 530 + 26
        d.rounded_rectangle((ox + 96, y0, ox + cw - 40, y0 + 8), 4, fill=(40, 50, 70, 255))
        d.rounded_rectangle((ox + 96, y0, ox + 96 + (cw - 136) * k, y0 + 8), 4, fill=CYAN + (255,))
    shake = math.sin(t * 80) * 16 * decay(t, DEATH, 0.6)
    alpha = 1 - 0.45 * sus
    place(cv, card, RX + 70 + shake, 480, sc * 0.94, 1.5 + 3 * dead, alpha)
    if dead > 0:
        place(cv, anim("n_skull.webp", t, DEATH), RX + 300, 150, pop(t, DEATH + 0.1, t1, 0.3, 0.25, 2.4) * 0.6, 12, 1)

HB = [64.05, 64.85, 65.50, 66.05, 66.50]          # heartbeats in the suspense build (also used by the sound design)
def heartbeat(t):
    return max([decay(t, h, 0.32) ** 1.5 for h in HB] + [0.0])

def g_morrer(cv, t):
    """'...MORRER!' - big slam title"""
    t0, t1 = DEATH, 68.15
    if not (t0 <= t <= t1): return
    k = (t - t0)
    sc = (1 + 1.3 * (1 - e_out(k / 0.18))) * (1 - e_in((t - (t1 - 0.25)) / 0.25))
    jit = (math.sin(t * 61) * 6, math.cos(t * 53) * 6)
    place(cv, radial(1200, (120, 0, 0), 1.6), 960, 500, 1, 0, 0.7 * c01(k / 0.05) * (1 - e_in((t - (t1 - 0.3)) / 0.3)))
    place(cv, text_img("MORRER!", "creep", 270, fill=RED, stroke=9, stroke_fill=(0, 0, 0), glow=(170, 0, 0), glow_r=20), 900 + jit[0], 520 + jit[1], sc, -3, c01(k / 0.04))
    ps = pop(t, 67.30, t1, 0.25, 0.25, 2.8)
    if ps > 0:
        slam = 1 + 1.2 * (1 - e_out((t - 67.30) / 0.16))
        st = Image.new("RGBA", (470, 130), (0, 0, 0, 0))
        ImageDraw.Draw(st).rounded_rectangle((6, 6, 464, 124), 18, fill=(255, 255, 255, 235), outline=RED + (255,), width=10)
        place(st, text_img("PLOT TWIST", "anton", 84, fill=(200, 20, 20)), 235, 66, 1, 0, 1)
        place(cv, st, 560, 230, ps * slam * 0.9, 8, 1)

def g_ending(cv, t):
    """'apesar de tudo isso, o jogo vai ficar bom'"""
    t0 = 70.70
    if t < t0: return
    cx, cy = RX + 40, 330
    for k in range(5):
        tk = 70.95 + k * 0.17
        s = e_out_back((t - tk) / 0.3, 2.6) if t >= tk else 0
        x = cx + (k - 2) * 124
        place(cv, star4(150, (255, 240, 180)), x, cy, 0.7 * s * bump(t, tk, 0.4), t * 60, 0.8)
        if s > 0: place(cv, anim("n_star.webp", t, tk), x, cy - 6 * math.sin(t * 6 + k), s * 0.38, 0, 1)
    ts = pop(t, 71.64, 99, 0.35, 0.2, 2.4)
    if ts > 0:
        place(cv, radial(560, (80, 255, 140), 2.2), cx, 560, ts, 0, 0.45)
        place(cv, anim("n_thumbs.webp", t, 71.64), cx, 560, ts * 0.95, -6 + math.sin(t * 5) * 4, 1)
    confetti(cv, t, 71.64, cx, 640, 70, 9)

def g_suspense_red(t):
    a = 0.55 * heartbeat(t) * (63.6 <= t <= 66.84)
    a += 0.30 * decay(t, 3.84, 0.45) + 0.35 * decay(t, 21.20, 0.45)
    a += 0.85 * fade(t, DEATH, 68.4, 0.03, 0.8)
    return min(a, 1.0)

def letterbox(t):
    return 118 * e_io((t - 63.55) / 0.5) * (1 - e_io((t - 67.95) / 0.5))

def bars(cv, h):
    if h <= 0.5: return
    d = ImageDraw.Draw(cv); hh = int(round(h))
    d.rectangle((0, 0, W, hh), fill=(0, 0, 0, 255)); d.rectangle((0, H - hh, W, H), fill=(0, 0, 0, 255))

# red vignette for the horror beats
RV = (np.clip((((xx - W / 2) / (W * 0.5)) ** 2 + ((yy - H / 2) / (H * 0.5)) ** 2 - 0.3) / 1.0, 0, 1) ** 1.3).astype(np.float32)[..., None]
RED_BGR = np.array([10, 5, 130], np.float32)

_split = {}
def split_transition(f_new, t):
    """the real jump cut: the old shot splits along the scissors line and the halves slide apart"""
    k = (t - CUT) / 0.55
    if not (0 <= k < 1): return f_new
    if "old" not in _split:
        i_old = src_index(CUT - 0.05)
        _split["old"] = warp(graded(i_old), zoom_env(CUT - 0.05, i_old))
        side = ((xx - CUT_P0[0]) * CUT_N[0] + (yy - CUT_P0[1]) * CUT_N[1]).astype(np.float32)
        _split["up"] = np.clip(side / 1.5 + 0.5, 0, 1); _split["lo"] = 1 - _split["up"]
    old = _split["old"]; d = 1500 * e_in(k) + 60 * e_out(k / 0.2)
    out = f_new
    for m, sgn in ((_split["up"], 1), (_split["lo"], -1)):
        M = np.float32([[1, 0, CUT_N[0] * d * sgn], [0, 1, CUT_N[1] * d * sgn]])
        piece = cv2.warpAffine(old, M, (W, H), borderMode=cv2.BORDER_CONSTANT)
        mm = cv2.warpAffine(m, M, (W, H), borderMode=cv2.BORDER_CONSTANT)[..., None]
        out = out * (1 - mm) + piece * mm
    return out

# ----------------------------------------------------------------------------- the three non-main sections
def hook_frame(T):
    """cold open: source 64.6-68.05 s, graded dark, 'ELE VAI... MORRER?!'"""
    global CAM
    t = HOOK_SRC + T
    i = src_index(t)
    fx, fy = FACE[i]
    z = 1.01 + 0.13 * e_io(T / HOOK_D) + 0.08 * e_out((t - DEATH) / 0.08) * (t >= DEATH)
    sx = sy = 0
    k = (t - DEATH) / 0.7
    if 0 <= k <= 1: sx, sy = 28 * (1 - k) ** 2 * math.sin(t * 95), 28 * (1 - k) ** 2 * math.cos(t * 83)
    CAM = (z, lerp(W / 2, fx, 0.85), lerp(H / 2, fy, 0.85), sx, sy)
    f = warp(graded(i), CAM)
    f = desat(f, 0.8) * (0.72 - 0.12 * heartbeat(t))
    ra = 0.5 + 0.4 * heartbeat(t) + 0.5 * decay(t, DEATH, 0.6)
    f = f * (1 - RV * ra * 0.8) + RV * ra * 0.8 * RED_BGR
    ga = decay(t, DEATH, 0.35) + c01((T - (HOOK_D - 0.28)) / 0.28) * 1.2
    if ga > 0: f = glitch(f, min(ga, 1.3), int(T * FPS))
    cv = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bars(cv, 118)
    # toy silhouette: "ele"
    ss = e_out((T - 0.15) / 0.6) * (1 + 0.06 * heartbeat(t))
    if t < DEATH:
        place(cv, toy_silhouette(RED), 1560, 500, ss * 0.95, 0, 0.95)
    else:
        kk = (t - DEATH) / 0.9
        place(cv, toy_silhouette(RED), 1560 + 30 * kk, 500 + 260 * kk * kk, 0.95 * (1 + 0.15 * kk), 25 * e_out(kk), 1 - e_in(kk))
    full = "ELE VAI..."
    n = int(c01((t - 64.84) / 0.75) * len(full))
    if n and t < DEATH + 0.1:
        place(cv, text_img(full[:n], "anton", 120, stroke=8, stroke_fill=(0, 0, 0), shadow=6), 300, 820, 1, 0, 1 - c01((t - DEATH) / 0.1), (0, 0.5))
    if t >= DEATH:
        kk = t - DEATH
        sc = 1 + 1.4 * (1 - e_out(kk / 0.16))
        jit = (math.sin(t * 61) * 7, math.cos(t * 53) * 7)
        place(cv, text_img("MORRER?!", "creep", 280, fill=RED, stroke=9, stroke_fill=(0, 0, 0), glow=(170, 0, 0), glow_r=20), 960 + jit[0], 540 + jit[1], sc, -3, c01(kk / 0.04))
        place(cv, anim("n_skull.webp", t, DEATH), 1560, 250, pop(t, DEATH + 0.12, 99, 0.3, 0.2, 2.4) * 0.7, 10, 1)
    return f, cv, max(0.0, 0.9 * decay(t, DEATH, 0.12)), 7.0

def title_frame(u):
    """'DEVLOG · DIA 2' title card"""
    i0 = src_index(0.0)
    bg = cv2.GaussianBlur(graded(i0), (0, 0), 24) * 0.22
    glow_k = 0.7 + 0.3 * math.sin(u * 5)
    bg = bg + (RV * -0.15 + (1 - RV) * 0.0) * 0 + (1 - EDGE) * np.array([8, 4, 70], np.float32) * glow_k
    ga = decay(u, 0.0, 0.22) * 1.2 + decay(u, 0.55, 0.22)
    if ga > 0: bg = glitch(bg, ga, int(u * FPS) + 999)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    emit(lay, u, 0.0, 2.4, 960, 1100, 70, (255, 120, 40), 1400, 900, 1.6, (6, 18), 81)
    a1 = c01((u - 0.12) / 0.25)
    place(lay, text_img("DEVLOG", "black", 46, fill=(255, 210, 60), track=22), 960 + (1 - e_out((u - 0.12) / 0.4)) * -80, 330, 1, 0, a1)
    dia = text_img("DIA", "anton", 280, stroke=0, shadow=10)
    two = text_img("2", "anton", 330, fill=RED, glow=(200, 0, 0), glow_r=20, shadow=10)
    gap = 40
    tw = dia.size[0] + gap + two.size[0]
    x0 = 960 - tw / 2
    s1 = (1 + 1.2 * (1 - e_out((u - 0.30) / 0.18))) if u >= 0.30 else 0
    s2 = (1 + 1.5 * (1 - e_out((u - 0.55) / 0.18))) if u >= 0.55 else 0
    place(lay, dia, x0 + dia.size[0] / 2, 540, s1, 0, c01((u - 0.30) / 0.05))
    place(lay, two, x0 + dia.size[0] + gap + two.size[0] / 2, 530, s2, -4, c01((u - 0.55) / 0.05))
    bw = int(760 * e_out((u - 0.75) / 0.5))
    if bw > 4: place(lay, rect_sprite(bw, 10, RED), 960, 712, 1, 0, 1)
    full = "CRIANDO UM JOGO DE TERROR"
    n = int(c01((u - 0.9) / 0.6) * len(full))
    if n:
        ref = text_img(full, "xbold", 40, track=8)
        place(lay, text_img(full[:n], "xbold", 40, track=8), 960 - ref.size[0] / 2, 776, 1, 0, 1, (0, 0.5))
    zt = e_in((u - 2.02) / 0.38)
    if zt > 0:
        s = 1 + 2.8 * zt
        lay = lay.resize((int(W * s), int(H * s)), Image.BILINEAR).crop((int((W * s - W) / 2), int((H * s - H) / 2), int((W * s - W) / 2) + W, int((H * s - H) / 2) + H))
        lay.putalpha(lay.getchannel("A").point(lambda v_: int(v_ * (1 - zt))))
    flash = 0.6 * decay(u, 0.55, 0.15) + 0.8 * c01((u - 2.25) / 0.15)
    return bg, lay, flash, 6.0

def outro_frame(o):
    i = NSRC - 1
    f = cv2.GaussianBlur(graded(i), (0, 0), 1 + 16 * e_out(o / 0.6)) * (1 - 0.6 * e_out(o / 0.6))
    f = f * (1 - RV * 0.5) + RV * 0.5 * RED_BGR
    cv = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    s = e_out_back(o / 0.55, 2.0)
    place(cv, radial(900, (190, 0, 0), 2.0), 960, 400, 1, 0, 0.6 * c01(o / 0.35))
    place(cv, toy_glow(RED), 960, 330 + math.sin(o * 3) * 10, s * 0.75, math.sin(o * 2) * 4, c01(o / 0.2))
    s2 = e_out_back((o - 0.3) / 0.5, 2.0)
    place(cv, text_img("CONTINUA...", "creep", 190, fill=RED, stroke=8, stroke_fill=(0, 0, 0), glow=(140, 0, 0), glow_r=16), 960, 650, s2, 0, c01((o - 0.3) / 0.1))
    s3 = c01((o - 0.8) / 0.3)
    place(cv, text_img("DIA 3 EM BREVE", "black", 50, stroke=5, stroke_fill=(0, 0, 0), track=6), 960, 780 + (1 - e_out(s3)) * 30, 1, 0, s3)
    fo = c01((o - (OUTRO_D - 0.45)) / 0.45)
    if fo > 0: cv.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * fo))))
    return f, cv, 0.0, 5.0

def main_frame(t):
    global CAM
    i = src_index(min(t, SRC_DUR - 0.01))
    CAM = zoom_env(t, i)
    f = warp(graded(i), CAM)
    f = split_transition(f, t)
    if 25.70 <= t <= 28.40:                              # VHS flashback
        k = c01((t - 25.76) / 0.1) * c01((28.30 - t) / 0.1)
        pre = Image.new("RGBA", (W, H), (0, 0, 0, 0)); g_vhs_overlay(pre, t)
        ov = np.asarray(pre, dtype=np.float32); a = ov[..., 3:4] / 255.0
        f = f * (1 - a) + ov[..., 2::-1] * a
        f = vhs(f, t, k)
    q = toy_at(i)
    if q is not None and 37.6 <= t <= 39.6:              # spotlight on the toy
        cx, cy = cam_pt(q[0], q[1])
        f = spotlight(f, cx, cy, q[4] * CAM[0] * 0.75, 0.5 * fade(t, 37.75, 39.55, 0.3, 0.3))
    sus = e_io((t - 63.64) / 3.0) * (1 - e_io((t - 67.9) / 0.7))
    if sus > 0:
        f = desat(f, 0.75 * sus) * (1 - 0.18 * sus - 0.14 * heartbeat(t))
    ra = g_suspense_red(t)
    if ra > 0:
        m = np.minimum(RV * ra * 0.8, 0.85)
        f = f * (1 - m) + m * RED_BGR
    ga = max(decay(t, 3.84, 0.25) * 0.8, decay(t, 25.74, 0.16), decay(t, 28.28, 0.16), decay(t, DEATH, 0.35) * 1.2)
    if ga > 0: f = glitch(f, ga, int(t * FPS))
    ca = 14 * max(decay(t, DEATH, 0.3), decay(t, 16.88, 0.2) * 0.6, decay(t, 34.38, 0.2) * 0.5)
    f = chroma(f, ca)

    cv = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bars(cv, letterbox(t))
    g_wave(cv, t)
    name_tag(cv, t, 0.72, 2.20, "MEU NOME É", "PEDRO", YELLOW, 1850, "right", 420)
    g_dev(cv, t); g_surv(cv, t); g_calendar(cv, t); g_time(cv, t); g_smirk(cv, t); g_dots(cv, t)
    g_spoiler(cv, t); g_npc(cv, t); g_scissors(cv, t); g_magic(cv, t); g_fast(cv, t, i)
    g_toy_reveal(cv, t, i); g_nameplate(cv, t, i); g_charcard(cv, t); g_morrer(cv, t); g_ending(cv, t)
    if not (DEATH - 0.02 <= t <= 68.2): draw_subs(cv, t)
    flash = max(0.9 * decay(t, 0.0, 0.28), 0.8 * decay(t, CUT, 0.14), 0.95 * decay(t, DEATH, 0.08), 0.35 * decay(t, 71.64, 0.12))
    return f, cv, flash, 4.0

# ----------------------------------------------------------------------------- frame
def render(T):
    if T < HOOK_D: f, cv, flash, gr = hook_frame(T)
    elif T < MAIN0: f, cv, flash, gr = title_frame(T - HOOK_D)
    elif T < MAIN1: f, cv, flash, gr = main_frame(T - MAIN0)
    else: f, cv, flash, gr = outro_frame(T - MAIN1)
    ov = np.asarray(cv, dtype=np.float32)
    a = ov[..., 3:4] / 255.0
    f = f * (1 - a) + ov[..., 2::-1] * a
    if flash > 0: f = f + (255 - f) * min(flash, 1)
    f = grain(f, T, gr)
    return np.clip(f, 0, 255).astype(np.uint8)

def render_chunk(args):
    k0, k1, path = args
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-profile:v", "high",
                            "-threads", "2", path], stdin=subprocess.PIPE)
    for k in range(k0, k1):
        enc.stdin.write(render(k / FPS).tobytes())
        if (k - k0) % 90 == 0: print(f"[{k0}-{k1}] frame {k}", flush=True)
    enc.stdin.close(); enc.wait()
    return path

def contact(ts, path, conv):
    tiles = []
    for t_ in ts:
        tl = cv2.resize(render(conv(t_)), (960, 540), interpolation=cv2.INTER_AREA)
        cv2.putText(tl, f"{t_:.2f}", (12, 34), 0, 1, (0, 255, 255), 2); tiles.append(tl)
    while len(tiles) % 2: tiles.append(np.zeros_like(tiles[0]))
    cv2.imwrite(path, np.vstack([np.hstack(tiles[k:k + 2]) for k in range(0, len(tiles), 2)]), [cv2.IMWRITE_JPEG_QUALITY, 88])

if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "preview":
        contact([float(x) for x in sys.argv[4].split(",")], sys.argv[3], lambda x: x)
    elif mode == "previewm":
        contact([float(x) for x in sys.argv[4].split(",")], sys.argv[3], lambda x: x + MAIN0)
    elif mode == "frame":
        cv2.imwrite(sys.argv[3], render(float(sys.argv[4])))
    else:
        import multiprocessing as mp_
        nw = int(sys.argv[4]) if len(sys.argv) > 4 else 4
        n = int(round(TOTAL * FPS))
        bounds = np.linspace(0, n, nw * 3 + 1).astype(int)
        jobs = [(int(a), int(b), A(f"chunk_{j:02d}.mp4")) for j, (a, b) in enumerate(zip(bounds[:-1], bounds[1:]))]
        with mp_.get_context("fork").Pool(nw) as pool:
            parts = pool.map(render_chunk, jobs, chunksize=1)
        with open(A("chunks.txt"), "w") as fh:
            for p in parts: fh.write(f"file '{p}'\n")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", A("chunks.txt"), "-i", A("mix.wav"),
                        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                        "-shortest", sys.argv[3]], check=True)
        print("done", n, "frames")
