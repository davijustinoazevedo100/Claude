"""Motion-graphics edit for the "sobrevivência ou terror" devlog video.

Usage:
  python3 edit.py render  <workdir> <out.mp4>
  python3 edit.py preview <workdir> <out.jpg> t1,t2,...

<workdir> must contain: input.mp4, hands.json, voice.wav, assets/, fonts/
"""
import functools, json, math, os, subprocess, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1920, 1080, 30
SRC_SCALE, SRC_XOFF = 1.5, 7.5          # 1290x720 -> 1935x1080, crop 7px each side
OUTRO = 2.2

WORK = sys.argv[2]
A = lambda *p: os.path.join(WORK, *p)

# ----------------------------------------------------------------------------- easing
def c01(x): return 0.0 if x < 0 else 1.0 if x > 1 else x
def e_out_back(x, s=1.9):
    x = c01(x) - 1; return 1 + (s + 1) * x ** 3 + s * x ** 2
def e_out(x): x = c01(x); return 1 - (1 - x) ** 3
def e_in(x): x = c01(x); return x ** 3
def e_io(x): x = c01(x); return 3 * x * x - 2 * x ** 3
def lerp(a, b, x): return a + (b - a) * x
def pop(t, t0, t1, din=0.35, dout=0.22):
    """scale envelope: springy in at t0, quick shrink out ending at t1"""
    if t < t0 or t > t1: return 0.0
    return e_out_back((t - t0) / din) * (1 - e_in((t - (t1 - dout)) / dout))
def fade(t, t0, t1, din=0.15, dout=0.15):
    if t < t0 or t > t1: return 0.0
    return c01((t - t0) / din) * c01((t1 - t) / dout)

# ----------------------------------------------------------------------------- fonts / text
FONT = {
    "black": A("fonts", "Montserrat-Black.ttf"), "xbold": A("fonts", "Montserrat-ExtraBold.ttf"),
    "anton": A("fonts", "Anton.ttf"), "ops": A("fonts", "BlackOpsOne.ttf"),
    "creep": A("fonts", "Creepster.ttf"),
}
_fc, _tc = {}, {}
def font(name, size):
    k = (name, size)
    if k not in _fc: _fc[k] = ImageFont.truetype(FONT[name], size)
    return _fc[k]

def text_img(txt, fname, size, fill=(255, 255, 255), stroke=0, stroke_fill=(0, 0, 0),
             shadow=0, glow=None, glow_r=14, track=0):
    """Render text to a tight RGBA image (with stroke, drop shadow, outer glow)."""
    k = (txt, fname, size, fill, stroke, stroke_fill, shadow, glow, glow_r, track)
    if k in _tc: return _tc[k]
    f = font(fname, size)
    pad = stroke + max(shadow, 0) + (glow_r * 2 if glow else 0) + 8
    if track:
        widths = [f.getlength(ch) + track for ch in txt]
        tw = int(sum(widths) - track)
    else:
        tw = int(f.getlength(txt))
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
    out.alpha_composite(draw(fill + (255,) if len(fill) == 3 else fill, stroke_fill, stroke))
    out = out.crop(out.getbbox())
    _tc[k] = out
    return out

# ----------------------------------------------------------------------------- sprites
def load_anim(name):
    im = Image.open(A("assets", name)); frames = []
    for i in range(getattr(im, "n_frames", 1)):
        im.seek(i); frames.append(im.convert("RGBA"))
    dur = (im.info.get("duration") or 42) / 1000.0
    return frames, dur

ANIM = {}
def anim(name, t, t0=0.0):
    if name not in ANIM: ANIM[name] = load_anim(name)
    fr, dur = ANIM[name]
    return fr[int(max(t - t0, 0) / dur) % len(fr)]

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
    inner = Image.new("RGBA", im.size, (0, 0, 0, 0)); di = ImageDraw.Draw(inner)
    di.ellipse((pad + w * 0.12, pad + h * 0.12, pad + w * 0.88, pad + h * 0.88), fill=color + (70,))
    inner = inner.filter(ImageFilter.GaussianBlur(blur * 1.5))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.alpha_composite(inner); out.alpha_composite(g); out.alpha_composite(g); out.alpha_composite(im)
    return out

@functools.lru_cache(None)
def panel(w, h, r=28, fill=(14, 16, 22, 215), border=None, bw=4):
    im = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((20, 28, 20 + w, 28 + h), r, fill=(0, 0, 0, 120))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    d.rounded_rectangle((20, 20, 20 + w, 20 + h), r, fill=fill, outline=(border + (255,)) if border else None, width=bw if border else 0)
    return im

_rc = {}
def static(name):
    if name not in _rc: _rc[name] = Image.open(A("assets", name)).convert("RGBA")
    return _rc[name]

def place(canvas, sp, cx, cy, scale=1.0, rot=0.0, alpha=1.0, anchor=(0.5, 0.5)):
    """Composite sprite `sp` onto canvas with its anchor point at (cx, cy)."""
    if scale <= 0.01 or alpha <= 0.004: return
    w, h = sp.size
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    s = sp.resize((nw, nh), Image.LANCZOS if scale < 1 else Image.BICUBIC) if (nw, nh) != (w, h) else sp
    ax, ay = anchor[0] * nw, anchor[1] * nh
    if rot:
        # rotate about the anchor point
        big = Image.new("RGBA", (int(nw * 2.2) + 4, int(nh * 2.2) + 4), (0, 0, 0, 0))
        bx, by = big.size[0] // 2, big.size[1] // 2
        big.alpha_composite(s, (int(bx - ax), int(by - ay)))
        s = big.rotate(rot, resample=Image.BICUBIC); ax, ay = bx, by
    if alpha < 0.999:
        a = s.getchannel("A").point(lambda v: int(v * alpha)); s = s.copy(); s.putalpha(a)
    x0, y0 = int(round(cx - ax)), int(round(cy - ay))
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(s.size[0], W - x0), min(s.size[1], H - y0)
    if sx1 <= sx0 or sy1 <= sy0: return
    if (sx0, sy0, sx1, sy1) != (0, 0) + s.size: s = s.crop((sx0, sy0, sx1, sy1))
    canvas.alpha_composite(s, (x0 + sx0, y0 + sy0))

# ----------------------------------------------------------------------------- source video
cap = cv2.VideoCapture(A("input.mp4"))
SRC, STS = [], []
while True:
    ok, fr = cap.read()
    if not ok: break
    SRC.append(fr)
HJ = json.load(open(A("hands.json")))
STS = np.array([f["t"] for f in HJ["frames"]])[:len(SRC)]
DUR = float(STS[-1]) + 1 / HJ["fps"]

def src_index(t):
    return int(np.clip(np.searchsorted(STS, t + 1e-4, side="right") - 1, 0, len(SRC) - 1))

# grade: gentle S-curve + warmth + saturation, upscale, sharpen, vignette
_x = np.arange(256) / 255.0
_curve = np.clip(_x - 0.035 * np.sin(2 * np.pi * _x), 0, 1)
LUT_B = (np.clip(_curve * 0.975, 0, 1) * 255).astype(np.uint8)
LUT_G = (np.clip(_curve * 1.0, 0, 1) * 255).astype(np.uint8)
LUT_R = (np.clip(_curve * 1.025, 0, 1) * 255).astype(np.uint8)
yy, xx = np.mgrid[0:H, 0:W]
VIG = (1 - 0.28 * np.clip(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.68)) ** 2, 0, 1) ** 1.3).astype(np.float32)[..., None]
_gcache = {}
def graded(i):
    if i in _gcache: return _gcache[i]
    fr = SRC[i]
    fr = cv2.merge([cv2.LUT(fr[..., 0], LUT_B), cv2.LUT(fr[..., 1], LUT_G), cv2.LUT(fr[..., 2], LUT_R)])
    f = fr.astype(np.float32)
    l = (0.114 * f[..., 0] + 0.587 * f[..., 1] + 0.299 * f[..., 2])[..., None]
    f = l + (f - l) * 1.14
    f = cv2.resize(f, (int(1290 * SRC_SCALE), H), interpolation=cv2.INTER_CUBIC)[:, 7:7 + W]
    bl = cv2.GaussianBlur(f, (0, 0), 1.2)
    f = np.clip((f * 1.45 - bl * 0.45) * VIG, 0, 255)
    _gcache[i] = f
    if len(_gcache) > 12: _gcache.pop(next(iter(_gcache)))
    return f

def v(x, y):  # source px -> 1080p video px
    return x * SRC_SCALE - SRC_XOFF, y * SRC_SCALE

# ----------------------------------------------------------------------------- hand tracks
def track(t0, t1, xlo, xhi):
    idx = [i for i, f in enumerate(HJ["frames"]) if t0 <= f["t"] <= t1]
    P = np.full((len(idx), 3), np.nan)
    for k, i in enumerate(idx):
        for h in HJ["frames"][i]["hands"]:
            lm = np.array(h["lm"])
            c = lm[[0, 5, 9, 13, 17], :2].mean(0)
            if xlo <= c[0] <= xhi:
                P[k] = [c[0], c[1], np.linalg.norm(lm[0, :2] - lm[9, :2])]
    for j in range(3):  # fill gaps
        ok = ~np.isnan(P[:, j]); P[:, j] = np.interp(np.arange(len(P)), np.flatnonzero(ok), P[ok, j])
    k = np.exp(-0.5 * (np.arange(-4, 5) / 1.3) ** 2); k /= k.sum()
    Ps = np.stack([np.convolve(np.pad(P[:, j], 4, mode="edge"), k, "valid") for j in range(3)], 1)
    return dict(zip(idx, Ps))

TR_SURV = track(11.40, 13.95, 0, 700)
TR_ZOMB = track(14.70, 16.70, 850, 1290)
def anchor(tr, i):
    keys = sorted(tr)
    i = min(max(i, keys[0]), keys[-1])
    x, y, s = tr[i]
    X, Y = v(x, y)
    return X, Y, s * SRC_SCALE

# ----------------------------------------------------------------------------- subtitles
# (word, start, end); "|" starts a new caption line
WORDS = [
    ("TUDO", 1.00, 1.40), ("BEM?", 1.40, 1.92),
    ("|MEU", 1.95, 2.15), ("NOME", 2.15, 2.42), ("É", 2.42, 2.62), ("PEDRO", 2.62, 3.25),
    ("|É", 4.40, 4.86), ("MEU", 5.20, 5.40), ("PRIMEIRO", 5.40, 5.72), ("DIA", 5.72, 6.20),
    ("|TENTANDO", 6.26, 6.76), ("DESENVOLVER", 6.76, 7.42), ("UM", 7.50, 7.75), ("JOGO", 7.75, 8.26),
    ("|DE", 8.30, 8.52), ("SOBREVIVÊNCIA", 8.52, 9.42), ("OU", 9.46, 9.72), ("DE", 9.72, 10.06), ("TERROR.", 10.06, 10.80),
    ("|ENTÃO,", 11.15, 11.72),
    ("|ESSE", 11.74, 12.16), ("LADO", 12.16, 12.55), ("DE", 12.60, 12.80), ("SOBREVIVÊNCIA", 12.80, 13.90),
    ("|E", 14.12, 14.40), ("ESSE", 14.40, 14.84), ("OUTRO", 14.84, 15.18), ("LADO", 15.18, 15.75), ("DE", 15.78, 16.02), ("TERROR.", 16.02, 16.76),
    ("|E", 16.96, 17.10), ("MEU", 17.10, 17.30), ("AMIGO", 17.30, 17.76), ("JÁ", 17.82, 18.20), ("ESTÁ", 18.20, 18.50), ("FAZENDO", 18.50, 18.96),
    ("|UM", 18.96, 19.12), ("JOGO", 19.12, 19.40), ("DE", 19.40, 19.64), ("TERROR,", 19.64, 20.14),
    ("|ENTÃO", 20.14, 20.50), ("EU", 20.50, 20.66), ("ACHO", 20.66, 20.88), ("QUE", 20.88, 21.04),
    ("|VAMOS", 21.10, 21.38), ("FAZER", 21.38, 21.62), ("UM", 21.62, 21.72), ("DE", 21.72, 21.84), ("TERROR,", 21.84, 22.24), ("CLARO!", 22.30, 22.74),
    ("|E", 23.15, 23.38), ("TAMBÉM...", 23.38, 23.92),
    ("|O", 23.92, 24.05), ("NOME", 24.05, 24.30), ("DELE", 24.30, 24.62), ("É", 24.62, 24.74), ("DAVI.", 24.74, 25.30),
]
LINES = []
for w, s, e in WORDS:
    if w.startswith("|") or not LINES: LINES.append([]); w = w.lstrip("|")
    LINES[-1].append((w, s, e))

GREEN, RED, YELLOW, CYAN = (80, 255, 120), (255, 52, 52), (255, 222, 40), (60, 220, 255)
def word_color(w):
    k = w.strip(".,!?").upper()
    if k.startswith("SOBREVIV"): return GREEN
    if k.startswith("TERROR"): return RED
    if k == "PEDRO": return YELLOW
    if k == "DAVI": return CYAN
    return None

SUB_SIZE, SUB_Y, SUB_SPACE = 68, 968, 20
def draw_subs(cv, t):
    for li, line in enumerate(LINES):
        ls, le = line[0][1], line[-1][2]
        nxt = LINES[li + 1][0][1] if li + 1 < len(LINES) else le + 0.6
        end = min(le + 0.45, nxt)
        if not (ls - 0.02 <= t <= end): continue
        a_line = c01((end - t) / 0.08)
        items = []
        for n, (w, s, e) in enumerate(line):
            kc = word_color(w)
            e2 = le + 0.12 if n == len(line) - 1 else max(e, s + 0.12)
            act = c01((t - s) / 0.05) * c01((e2 - t) / 0.07)          # smooth "currently spoken" amount
            col = kc or (YELLOW if act > 0.5 else (255, 255, 255))
            sp = text_img(w, "black", SUB_SIZE, fill=col, stroke=7, stroke_fill=(8, 8, 10), shadow=5)
            k = (t - s) / 0.16
            sc = (lerp(0.55, 1.0, e_out_back(k, 2.6)) if t >= s else 1.0) * (1 + 0.10 * act)
            items.append((sp, s, sc, k))
        # lay out with the live scales so a growing word pushes its neighbours instead of overlapping
        tot = sum(sp.size[0] * max(sc, 1.0) for sp, s, sc, k in items) + SUB_SPACE * (len(items) - 1)
        x = W / 2 - tot / 2
        for sp, s, sc, k in items:
            wdt = sp.size[0] * max(sc, 1.0)
            if t >= s - 0.01:
                place(cv, sp, x + wdt / 2, SUB_Y + (1 - e_out(k)) * 14, sc, 0, c01(k * 2.5) * a_line, (0.5, 0.62))
            x += wdt + SUB_SPACE

# ----------------------------------------------------------------------------- particles
RNG = np.random.default_rng(7)
DOT = {c: radial(40, c, 1.6) for c in [GREEN, YELLOW, RED, (255, 140, 40), (255, 255, 255)]}
def emit(cv, t, t0, t1, ox, oy, n, color, spread=140, rise=220, life=1.1, size=(10, 26), seed=0):
    r = np.random.default_rng(seed)
    for k in range(n):
        birth = t0 + r.random() * max(t1 - t0 - life * 0.5, 0.05)
        age = (t - birth) / life
        dx, sz, ph, wob = r.normal(0, spread * 0.45), r.uniform(*size), r.uniform(0, 6.28), r.uniform(10, 30)
        if not (0 <= age <= 1): continue
        x = ox + dx * (0.4 + age) + math.sin(ph + age * 5) * wob
        y = oy - rise * e_out(age) * r.uniform(0.6, 1.2)
        place(cv, DOT[color], x, y, sz / 40 * (1 - age * 0.6), 0, math.sin(math.pi * age) * 0.95)

# ----------------------------------------------------------------------------- graphic pieces
def name_tag(cv, t, t0, t1, top, name, color, x, align="left", y=440):
    if not (t0 <= t <= t1): return
    k_in = e_out((t - t0) / 0.45); k_out = e_in((t - (t1 - 0.3)) / 0.3)
    lbl = text_img(top, "black", 40, fill=(12, 12, 14), track=4)
    big = text_img(name, "anton", 200, fill=(255, 255, 255), stroke=0, shadow=8)
    bw = max(lbl.size[0] + 40, big.size[0]) + 30
    sign = 1 if align == "left" else -1
    off = ((1 - k_in) + k_out) * -sign * (bw + 160)
    ox = x + off                                   # outer edge (left edge for left tags, right edge for right)
    # label pill
    lab = panel(lbl.size[0] + 40, lbl.size[1] + 26, r=14, fill=color + (255,))
    lw = lab.size[0] - 40
    lx = ox if sign > 0 else ox - lw
    place(cv, lab, lx - 20, y - 20, 1, 0, 1, (0, 0))
    place(cv, lbl, lx + 20, y + (lbl.size[1] + 26) / 2, 1, 0, 1, (0, 0.5))
    # big name, revealed with a little delay
    kb = e_out((t - t0 - 0.08) / 0.45)
    bx = ox + (1 - kb) * -sign * 60
    place(cv, big, bx if sign > 0 else bx - big.size[0], y + lbl.size[1] + 40, 1, 0, c01((t - t0 - 0.08) / 0.15), (0, 0))
    # accent bar under it
    bar_w = int(bw * e_out((t - t0 - 0.15) / 0.4))
    if bar_w > 4:
        bar = Image.new("RGBA", (bar_w, 18), color + (255,))
        place(cv, bar, ox + (0 if sign > 0 else -bar_w), y + lbl.size[1] + 40 + big.size[1] + 24, 1, 0, 1, (0, 0.5))

def dia_badge(cv, t):
    t0 = 5.40
    if t < t0: return
    cal = static("Tear-Off_Calendar.png")
    big = text_img("DIA 1", "anton", 170, fill=(255, 255, 255), stroke=8, stroke_fill=(10, 10, 12), shadow=8)
    # phase 1: big pop on the left wall, phase 2: fly to top-left corner badge
    fly = e_io((t - 6.05) / 0.45)
    s_in = e_out_back((t - t0) / 0.4, 2.2)
    cx, cy = lerp(560, 120, fly), lerp(380, 74, fly)
    if fly < 1:
        sc = s_in * lerp(1.0, 0.28, fly)
        place(cv, radial(520, (255, 210, 60), 2.2), cx, cy, sc, 0, 0.55 * (1 - fly))
        place(cv, cal, cx - 190 * sc, cy - 10, sc * 0.95, -8 + 8 * fly, 1)
        place(cv, big, cx + 90 * sc, cy, sc, 0, 1)
    if fly > 0.85:
        a = c01((fly - 0.85) / 0.15)
        d1 = text_img("DIA 01", "anton", 52, fill=(255, 255, 255))
        d2 = text_img("DEVLOG", "black", 22, fill=(255, 210, 60), track=3)
        pw = 22 + 64 + 14 + d1.size[0] + 16 + d2.size[0] + 26
        p = panel(pw, 84, r=42, fill=(12, 12, 16, 210), border=(255, 210, 60), bw=3)
        place(cv, p, 24, 32, 1, 0, a, (0, 0))
        place(cv, cal, 44 + 22 + 32, 94, 0.26, 0, a)
        place(cv, d1, 44 + 22 + 64 + 14, 94, 1, 0, a, (0, 0.5))
        place(cv, d2, 44 + 22 + 64 + 14 + d1.size[0] + 16, 95, 1, 0, a, (0, 0.5))
        pr = c01((t - 6.5) / 0.5)
        if 0 < pr < 1:
            place(cv, ring(pw, 84, (255, 210, 60), 4, 6), 44 + pw / 2, 94, 1 + pr * 0.25, 0, (1 - pr) * 0.8)

def dev_card(cv, t):
    t0, t1 = 6.30, 8.20
    sc = pop(t, t0, t1)
    if sc <= 0: return
    cx, cy = 1640, 320
    place(cv, radial(560, (120, 90, 255), 2.4), cx, cy - 20, sc, 0, 0.5)
    pad = static("Video_Game.png"); tools = static("Hammer_and_Wrench.png")
    bob = math.sin(t * 4) * 8
    place(cv, pad, cx, cy - 40 + bob, sc * 1.05, math.sin(t * 3) * 5, 1)
    place(cv, tools, cx + 130, cy - 160 - bob, sc * 0.55, 20 + math.sin(t * 5) * 10, 1)
    pw, ph = 400, 28
    k = e_io((t - (t0 + 0.25)) / 1.55)
    place(cv, panel(pw, ph, r=14, fill=(20, 16, 40, 170), border=(255, 255, 255), bw=3), cx, cy + 140, sc, 0, 1)
    if k > 0.02:
        fill = Image.new("RGBA", (max(2, int((pw - 10) * k)), ph - 10), (0, 0, 0, 0))
        ImageDraw.Draw(fill).rounded_rectangle((0, 0, fill.size[0] - 1, ph - 11), 8, fill=(150, 120, 255, 255))
        place(cv, fill, cx - (pw - 10) / 2 * sc, cy + 140, sc, 0, 1, (0, 0.5))
    lbl = text_img("CRIANDO UM JOGO...", "black", 42, fill=(255, 255, 255), stroke=6, stroke_fill=(20, 12, 50), shadow=3)
    place(cv, lbl, cx, cy + 205, sc, 0, 1)
    pct = text_img(f"{int(k * 100)}%", "anton", 44, fill=(255, 255, 255), stroke=5, stroke_fill=(20, 12, 50))
    place(cv, pct, cx - pw / 2 - 10, cy + 140, sc, 0, 1, (1, 0.5))

def choice_cards(cv, t):
    # left: survival (appears on "sobrevivência"), right: terror (on "terror")
    out = 11.05
    for side, t0, title, fnt, col, icon in (
        (-1, 8.50, "SOBREVIVÊNCIA", "ops", GREEN, "Camping.png"),
        (1, 10.02, "TERROR", "creep", RED, "Zombie.png"),
    ):
        sc = pop(t, t0, out + (0.0 if side < 0 else 0.08), 0.4, 0.3)
        if sc <= 0: continue
        cx, cy = (560, 380) if side < 0 else (1650, 380)
        cw, ch = 470, 380
        p = panel(cw, ch, r=34, fill=(10, 12, 16, 205), border=col, bw=5)
        tilt = -4 * side + math.sin(t * 2.5 + side) * 1.5
        place(cv, radial(700, col, 2.5), cx, cy, sc, 0, 0.45)
        place(cv, p, cx, cy, sc, tilt, 1)
        ic = anim(icon, t, t0) if icon == "Zombie.png" else static(icon)
        place(cv, ic, cx, cy - 55 + math.sin(t * 4 + side) * 6, sc * 0.95, tilt, 1)
        if fnt == "creep":
            tt = text_img(title, fnt, 104, fill=col, stroke=5, stroke_fill=(0, 0, 0), glow=(150, 0, 0), glow_r=10)
        else:
            tt = text_img(title, fnt, 52, fill=col, stroke=4, stroke_fill=(0, 0, 0), glow=(0, 90, 20), glow_r=8)
        place(cv, tt, cx, cy + 125, sc, tilt, 1)
    # "OU?" + thinking face, above his head, on "ou"
    sc = pop(t, 9.42, out, 0.35, 0.25)
    if sc > 0:
        place(cv, anim("Thinking_Face.png", t, 9.42), 1030, 82, sc * 0.48, 0, 1)
        place(cv, text_img("OU?", "anton", 96, fill=(255, 255, 255), stroke=8, stroke_fill=(10, 10, 12), shadow=6), 1160, 80, sc, 0, 1)

@functools.lru_cache(None)
def beam(w, h, color):
    """soft hologram light cone rising from the palm"""
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    v_ = yy_ / h                                    # 0 top .. 1 bottom
    half = (0.5 - 0.22 * v_) * w                    # wide at the top, narrow at the palm
    a = np.clip(1 - np.abs(xx_ - w / 2) / half, 0, 1) ** 1.5 * (v_ ** 1.6) * 0.55
    arr = np.zeros((h, w, 4), np.uint8); arr[..., :3] = color; arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA").filter(ImageFilter.GaussianBlur(6))

def survival_on_hand(cv, t, i):
    t0, t1 = 11.80, 13.78
    sc = pop(t, t0, t1, 0.45, 0.22)
    if sc <= 0: return None
    X, Y, S = anchor(TR_SURV, i)
    X, Y = cam_pt(X, Y)
    base = Y - 0.05 * S
    hover = base - 50 - 30 * e_out((t - t0) / 0.5)        # floats up off the palm
    bob = math.sin((t - t0) * 3.2) * 7
    place(cv, ring(300, 78, GREEN, 5, 7), X, base, sc * (1 + 0.05 * math.sin(t * 6)), 0, 0.95)
    place(cv, beam(330, 300, GREEN), X, base, sc, 0, 0.9, (0.5, 1.0))
    place(cv, radial(640, GREEN, 2.3), X, hover - 170, sc, 0, 0.5)
    place(cv, static("Backpack.png"), X - 205, hover - 250 - bob, sc * 0.52, 12 + math.sin(t * 2.6) * 6, 1)
    place(cv, static("Camping.png"), X, hover + bob, sc * 1.45, math.sin(t * 2.4) * 2.5, 1, (0.5, 0.86))
    place(cv, FIRE(t - t0), X - 120, hover + 20 + bob, sc * 0.30, 0, 1, (0.5, 0.9))
    place(cv, static("Axe.png"), X + 185, hover - 95 + bob * 1.4, sc * 0.62, -25 + math.sin(t * 3) * 6, 1)
    emit(cv, t, t0 + 0.15, t1, X, hover - 40, 24, YELLOW, 200, 300, 1.1, (8, 24), 11)
    emit(cv, t, t0 + 0.15, t1, X, base - 10, 16, GREEN, 170, 260, 1.2, (10, 26), 12)
    ls = pop(t, 12.78, t1, 0.4, 0.22)
    if ls > 0:
        lab = text_img("SOBREVIVÊNCIA", "ops", 74, fill=GREEN, stroke=6, stroke_fill=(5, 25, 10), glow=(0, 120, 30), glow_r=12)
        lx = min(max(X, lab.size[0] / 2 + 30), W - lab.size[0] / 2 - 30)
        place(cv, lab, lx, hover - 405 + bob * 0.5, ls, -3, 1)
    return X, base

FIRE_FR = None
def FIRE(dt):
    global FIRE_FR
    if FIRE_FR is None:
        im = Image.open(A("assets", "fire_noto.webp")); FIRE_FR = []
        for k in range(im.n_frames):
            im.seek(k); FIRE_FR.append(im.convert("RGBA"))
    return FIRE_FR[int(dt / 0.04) % len(FIRE_FR)]

BATS = [(-1.0, 1.10, 0.62, 0.00), (0.7, 1.25, 0.55, 0.08), (-0.4, 1.40, 0.48, 0.18), (1.1, 1.05, 0.50, 0.26), (-1.4, 1.3, 0.42, 0.34)]
def zombie_on_hand(cv, t, i):
    t0, t1 = 14.86, 16.52
    sc = pop(t, t0, t1, 0.42, 0.2)
    if sc <= 0: return None
    X, Y, S = anchor(TR_ZOMB, i)
    X, Y = cam_pt(X, Y)
    X = min(X, W - 215)                                  # keep the whole zombie on screen
    base = Y - 0.12 * S
    hover = base - 40 - 25 * e_out((t - t0) / 0.5)
    bob = math.sin((t - t0) * 3.0) * 6
    flick = 0.75 + 0.25 * math.sin(t * 37) * math.sin(t * 13)
    place(cv, ring(320, 82, RED, 5, 8), X, base, sc * (1 + 0.05 * math.sin(t * 7)), 0, 0.95)
    place(cv, beam(340, 280, (255, 40, 40)), X, base, sc, 0, 0.9, (0.5, 1.0))
    place(cv, radial(680, (255, 20, 20), 2.1), X, hover - 190, sc, 0, 0.6 * flick)
    place(cv, anim("Zombie.png", t, t0), X, hover + bob, sc * 1.62, math.sin(t * 2.2) * 3, 1, (0.5, 0.93))
    emit(cv, t, t0 + 0.1, t1, X, hover - 20, 20, RED, 190, 280, 1.0, (8, 22), 21)
    emit(cv, t, t0 + 0.1, t1, X, base - 20, 12, (255, 140, 40), 160, 300, 0.9, (6, 16), 22)
    for k, (dx, dur, s, dl) in enumerate(BATS):        # bats burst out on "terror"
        bt = (t - 15.80 - dl) / dur
        if 0 <= bt <= 1:
            bx = X + dx * 560 * e_out(bt) + math.sin(bt * 9 + k) * 30
            by = hover - 220 - 600 * e_out(bt) + math.sin(bt * 7 + k) * 35
            place(cv, anim("Bat.png", t, 15.8 + k * 0.1), bx, by, s * (0.7 + 0.6 * bt), dx * -12, 1 - e_in(bt))
    ls = pop(t, 15.78, t1, 0.32, 0.2)
    if ls > 0:
        slam = 1 + 1.4 * (1 - e_out((t - 15.78) / 0.22))
        lab = text_img("TERROR", "creep", 160, fill=RED, stroke=7, stroke_fill=(0, 0, 0), glow=(170, 0, 0), glow_r=14)
        lx = min(max(X, lab.size[0] / 2 + 30), W - lab.size[0] / 2 - 30)
        jit = (math.sin(t * 61) * 3, math.cos(t * 53) * 3)
        place(cv, lab, lx + jit[0], hover - 520 + jit[1], ls * slam, 4, c01((t - 15.78) / 0.06))
    return X, base

def friend_card(cv, t):
    t0, t1 = 17.20, 20.95
    sc = pop(t, t0, t1, 0.42, 0.28)
    if sc <= 0: return
    cx, cy = 1665, 330
    place(cv, panel(420, 330, r=34, fill=(12, 14, 20, 215), border=CYAN, bw=4), cx, cy, sc, 0, 1)
    place(cv, anim("Handshake.png", t, t0), cx, cy - 55, sc * 0.75, 0, 1)
    place(cv, text_img("MEU AMIGO", "black", 50, fill=(255, 255, 255), stroke=0, shadow=3), cx, cy + 70, sc, 0, 1)
    k = pop(t, 19.62, t1, 0.35, 0.28)
    if k > 0:
        st = text_img("JÁ FAZ UM DE", "xbold", 28, fill=(200, 210, 230), track=2)
        tr = text_img("TERROR", "creep", 56, fill=RED, stroke=3, stroke_fill=(0, 0, 0))
        x0 = cx - (st.size[0] + 14 + tr.size[0]) / 2 * k * sc
        place(cv, st, x0, cy + 130, k * sc, 0, 1, (0, 0.5))
        place(cv, tr, x0 + (st.size[0] + 14) * k * sc, cy + 126, k * sc, -4, 1, (0, 0.5))
        place(cv, anim("Skull.png", t, 19.62), cx + 190, cy - 150, k * sc * 0.55, 14, 1)

def decision(cv, t):
    t0, t1 = 21.80, 23.25
    sc = pop(t, t0, t1, 0.3, 0.3) * 0.78
    if sc <= 0: return
    slam = 1 + 1.6 * (1 - e_out((t - t0) / 0.2))
    cx, cy = 1655, 380
    al = c01((t - t0) / 0.05)
    place(cv, radial(760, (255, 10, 10), 2.2), cx, cy, sc, 0, 0.6 * al)
    stamp = Image.new("RGBA", (560, 300), (0, 0, 0, 0))
    ImageDraw.Draw(stamp).rounded_rectangle((8, 8, 552, 292), 26, fill=(10, 0, 0, 120), outline=RED + (255,), width=12)
    place(cv, stamp, cx, cy + 10, sc * slam, -7, al)
    place(cv, text_img("DECIDIDO:", "black", 42, fill=(255, 255, 255), stroke=6, stroke_fill=(0, 0, 0), track=3), cx, cy - 80, sc * slam, -7, al)
    place(cv, text_img("TERROR", "creep", 170, fill=RED, stroke=7, stroke_fill=(0, 0, 0), glow=(150, 0, 0), glow_r=14), cx, cy + 40, sc * slam, -7, al)
    k = pop(t, 22.30, t1, 0.35, 0.3)
    if k > 0:
        place(cv, static("Check_Mark_Button.png"), cx + 175, cy - 118, k * 0.5, 10, 1)
        place(cv, anim("Zombie.png", t, 22.3), cx + 140, cy + 185, k * 0.78, -8, 1)

def outro(cv, t):
    k = t - DUR
    if k < 0: return
    a = c01(k / 0.35)
    sc = e_out_back(k / 0.5, 2.0)
    place(cv, radial(900, (180, 0, 0), 2.0), W / 2, 430, 1, 0, 0.7 * a)
    place(cv, anim("Zombie.png", t, DUR), W / 2, 330, sc * 1.4, 0, a)
    s2 = e_out_back((k - 0.25) / 0.5, 2.0)
    place(cv, text_img("CONTINUA...", "creep", 190, fill=RED, stroke=8, stroke_fill=(0, 0, 0), glow=(140, 0, 0), glow_r=16), W / 2, 620, s2, 0, c01((k - 0.25) / 0.1))
    s3 = c01((k - 0.7) / 0.3)
    place(cv, text_img("DIA 2 EM BREVE", "black", 48, fill=(255, 255, 255), stroke=5, stroke_fill=(0, 0, 0), track=6), W / 2, 760 + (1 - e_out(s3)) * 30, 1, 0, s3)
    fo = c01((k - (OUTRO - 0.35)) / 0.35)
    if fo > 0:
        cv.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * fo))))

def hook(cv, t):
    """opening title over the first second (before he starts talking)"""
    t1 = 1.02
    if t > t1: return
    k_out = e_in((t - (t1 - 0.2)) / 0.2)
    s1 = e_out_back(t / 0.3, 2.2) * (1 - k_out)
    s2 = e_out_back((t - 0.12) / 0.3, 2.2) * (1 - k_out)
    s3 = e_out_back((t - 0.22) / 0.3, 2.2) * (1 - k_out)
    place(cv, text_img("SOBREVIVÊNCIA", "ops", 120, fill=GREEN, stroke=8, stroke_fill=(5, 25, 10), glow=(0, 120, 30), glow_r=14), W / 2, 360, s1, -4, 1)
    place(cv, text_img("OU", "anton", 110, fill=(255, 255, 255), stroke=8, stroke_fill=(0, 0, 0), shadow=6), W / 2, 505, s2, 0, 1)
    place(cv, text_img("TERROR?", "creep", 210, fill=RED, stroke=8, stroke_fill=(0, 0, 0), glow=(150, 0, 0), glow_r=16), W / 2, 660, s3, 4, 1)

def wave(cv, t):
    sc = pop(t, 0.95, 1.95, 0.35, 0.2)
    if sc > 0: place(cv, anim("Waving_Hand_Medium_Skin_Tone.png", t, 0.95), 1560, 330, sc * 1.0, 0, 1)

# ----------------------------------------------------------------------------- camera
SHAKES = [(10.06, 7, 0.30), (15.78, 18, 0.45), (19.64, 6, 0.3), (21.80, 22, 0.5), (24.74, 5, 0.25)]
def zoom_env(t):
    z, cx, cy = 1.0, W / 2, H / 2
    z += 0.14 * (1 - e_out(t / 0.7))                                   # intro push-out
    z += 0.07 * e_out((t - 2.60) / 0.25) * (1 - e_io((t - 3.30) / 0.4))  # punch on "Pedro"
    z += 0.04 * e_io((t - 11.7) / 2.0) * (1 - e_io((t - 13.7) / 0.4))  # drift on survival
    z += 0.05 * e_io((t - 14.8) / 1.0) * (1 - e_io((t - 16.5) / 0.4))  # drift on zombie
    z += 0.04 * e_out((t - 15.78) / 0.12) * (1 - e_io((t - 15.9) / 0.6))
    z += 0.09 * e_out((t - 21.80) / 0.12) * (1 - e_io((t - 22.9) / 0.5))  # decision punch
    z += 0.05 * e_out((t - 24.70) / 0.2) * (1 - e_io((t - 25.3) / 0.4))  # "Davi"
    if 11.0 < t < 14.2: cx, cy = 700, 640
    elif 14.2 <= t < 17.0: cx, cy = 1300, 640
    elif 21.0 < t < 23.5: cx, cy = 1250, 430
    elif 2.0 < t < 4.0 or 24.0 < t: cx, cy = 1080, 420
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

def chroma(f, amt):
    if amt < 0.5: return f
    a = int(amt); out = f.copy()
    out[:, a:, 2] = f[:, :-a, 2]; out[:, :-a, 0] = f[:, a:, 0]
    return out

# red vignette for horror beats
RV = (np.clip((((xx - W / 2) / (W * 0.5)) ** 2 + ((yy - H / 2) / (H * 0.5)) ** 2 - 0.35) / 1.0, 0, 1) ** 1.4).astype(np.float32)[..., None]
def red_amt(t):
    a = 0.0
    a += 0.45 * fade(t, 14.9, 16.6, 0.4, 0.3)
    a += 0.45 * c01(1 - (t - 15.78) / 0.5) * (t >= 15.78)
    a += 0.35 * c01(1 - (t - 19.64) / 0.5) * (t >= 19.64)
    a += 0.45 * fade(t, 21.80, 23.2, 0.05, 0.4) + 0.4 * c01(1 - (t - 21.80) / 0.45) * (t >= 21.8)
    return min(a, 1.0)

def flash_amt(t):
    return 0.85 * c01(1 - t / 0.3)

# ----------------------------------------------------------------------------- frame
def render(t):
    global CAM
    outro_k = t - DUR
    i = src_index(min(t, DUR - 0.01))
    f = graded(i)
    if outro_k >= 0:
        f = cv2.GaussianBlur(f, (0, 0), 1 + 14 * e_out(outro_k / 0.6)) * (1 - 0.55 * e_out(outro_k / 0.6))
    if t < 1.05:  # soften the background under the hook title
        f = cv2.GaussianBlur(f, (0, 0), 9 * (1 - e_in(t / 1.05)) + 0.1) * (1 - 0.35 * (1 - e_in(t / 1.05)))
    CAM = zoom_env(t)
    z, cx, cy, sx, sy = CAM
    M = np.float32([[z, 0, (1 - z) * cx + sx], [0, z, (1 - z) * cy + sy]])
    f = cv2.warpAffine(f, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    ra = red_amt(t)
    if ra > 0:
        m = np.minimum(RV * ra * 0.75, 0.8)
        f = f * (1 - m) + m * np.array([10, 5, 120], np.float32)
    ca = 0
    for t0 in (15.78, 21.80):
        if 0 <= t - t0 < 0.22: ca = max(ca, 14 * (1 - (t - t0) / 0.22))
    f = chroma(f, ca)

    cv = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hook(cv, t); wave(cv, t)
    name_tag(cv, t, 2.55, 4.45, "MEU NOME É", "PEDRO", YELLOW, 90, "left")
    dev_card(cv, t); choice_cards(cv, t)
    survival_on_hand(cv, t, i); zombie_on_hand(cv, t, i)
    friend_card(cv, t); decision(cv, t)
    name_tag(cv, t, 24.62, DUR + 0.25, "O NOME DELE É", "DAVI", CYAN, 1850, "right")
    if outro_k < 0.2: dia_badge(cv, t)
    if t < DUR + 0.1: draw_subs(cv, t)
    outro(cv, t)

    ov = np.asarray(cv, dtype=np.float32)
    a = ov[..., 3:4] / 255.0
    f = f * (1 - a) + ov[..., 2::-1] * a
    fa = flash_amt(t)
    if fa > 0: f = f + (255 - f) * min(fa, 1)
    return np.clip(f, 0, 255).astype(np.uint8)

if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "preview":
        ts = [float(x) for x in sys.argv[4].split(",")]
        tiles = [cv2.resize(render(t), (960, 540)) for t in ts]
        for tl, t in zip(tiles, ts): cv2.putText(tl, f"{t:.2f}", (12, 34), 0, 1, (0, 255, 255), 2)
        while len(tiles) % 2: tiles.append(np.zeros_like(tiles[0]))
        cv2.imwrite(sys.argv[3], np.vstack([np.hstack(tiles[k:k + 2]) for k in range(0, len(tiles), 2)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
    else:
        n = int((DUR + OUTRO) * FPS)
        enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                "-i", A("mix.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
                                "-pix_fmt", "yuv420p", "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                                "-shortest", sys.argv[3]], stdin=subprocess.PIPE)
        for k in range(n):
            enc.stdin.write(render(k / FPS).tobytes())
            if k % 60 == 0: print(f"frame {k}/{n}", flush=True)
        enc.stdin.close(); enc.wait()
