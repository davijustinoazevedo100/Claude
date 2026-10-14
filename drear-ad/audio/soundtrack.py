"""Score + sound design for the 2-minute Opium 5 / Drear film (all synthesised).

  python3 audio/soundtrack.py build/cues.json build/soundtrack_raw.wav

Every cue comes from the animation (node render.mjs cues build/cues.json), so hits,
whooshes, key presses and clicks land on their frames. 120 BPM in D major.

Sections
  0:00  Opium 5 intro      plucks + pad, kick/clap groove, breakdown for the orbit, word hits
  0:30  Opium 5 in use     FM electric piano "focus" groove that leaves room for the typing,
                           builds through the diagram, code and the simulation
  1:00  Drear intro        bright and playful, four-on-the-floor, task-conversion melody
  1:23  Drear in use       driving groove; every task panel that starts adds a layer,
                           every finished task rings a bell; success chord, approval
  1:53  End card           sonic logo on the electric piano, final chord, tail
"""
import json, sys, wave
import numpy as np
from scipy import signal

SR = 48000
DUR = 120.0
BEAT = 0.5
N = int(DUR * SR)
rng = np.random.default_rng(11)
C = json.load(open(sys.argv[1]))
tN = np.arange(N) / SR

# buses (stereo)
BUS = {k: np.zeros((N, 2)) for k in ('pad', 'keys', 'pluck', 'bass', 'drums', 'fx', 'foley', 'verb', 'echo')}


# ------------------------------------------------------------------ helpers
def tt(d): return np.arange(int(d * SR)) / SR
def db(x): return 10 ** (x / 20)
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def norm(x): return x / (np.max(np.abs(x)) + 1e-12)
def noise(n): return rng.normal(0, 1, n)


def place(bus, x, at, gain_db=0.0, pan=0.0):
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l, x * r], 1) * np.sqrt(2)
    i = int(round(at * SR)); j0 = max(0, -i); i = max(0, i)
    j = min(N, i + len(x) - j0)
    if j > i: BUS[bus][i:j] += x[j0:j0 + (j - i)] * db(gain_db)


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), 'low'); return signal.lfilter(b, a, x, axis=0)
def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high'); return signal.lfilter(b, a, x, axis=0)
def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], 'band'); return signal.lfilter(b, a, x, axis=0)


def onepole_sweep(x, fc):
    a = np.exp(-2 * np.pi * np.asarray(fc) / SR)
    y = np.empty_like(x); z = 0.0
    for i in range(len(x)):
        z = (1 - a[i]) * x[i] + a[i] * z; y[i] = z
    return y


def saw(f, d, ph=0.0):
    n = int(d * SR); dt = f / SR
    p = (ph + dt * np.arange(n)) % 1.0
    y = 2 * p - 1
    m = p < dt; x = p[m] / dt; y[m] -= x + x - x * x - 1
    m = p > 1 - dt; x = (p[m] - 1) / dt; y[m] -= x * x + x + x + 1
    return y


def window(t, a, b, fi=0.3, fo=0.3):
    return np.clip(np.minimum((t - a) / fi, (b - t) / fo), 0, 1)


# ------------------------------------------------------------------ instruments
def epiano(m, d, vel=0.8):
    """two-pair FM electric piano (body 1:1 + 'tine' 1:14)"""
    f = mtof(m); t = tt(d + 1.4)
    i1 = (0.7 + 1.3 * vel) * np.exp(-t / 0.55) + 0.22
    body = np.sin(2 * np.pi * f * t + i1 * np.sin(2 * np.pi * f * t))
    i2 = 1.2 * vel * np.exp(-t / 0.025)
    tine = np.sin(2 * np.pi * f * t + i2 * np.sin(2 * np.pi * 14 * f * t)) * np.exp(-t / 0.3)
    dec = 2.2 if m < 70 else 1.4 if m < 82 else 0.9
    amp = (1 - np.exp(-t / 0.0025)) * np.exp(-t / dec) * np.clip((d + 0.4 - t) / 0.4, 0, 1)
    return (body + 0.32 * tine) * amp * (0.55 + 0.45 * vel)


def pad_note(m, d, att=0.9, rel=1.6, fc=1500):
    f = mtof(m); n = int((d + rel) * SR); t = np.arange(n) / SR
    out = np.zeros((n, 2))
    det = (-24, -14, -6, 0, 7, 15, 25)
    for k, c in enumerate(det):
        v = saw(f * 2 ** (c / 1200), d + rel, rng.random())
        pan = np.linspace(-0.8, 0.8, len(det))[k]
        out[:, 0] += v * np.cos((pan + 1) * np.pi / 4); out[:, 1] += v * np.sin((pan + 1) * np.pi / 4)
    out = lp(out, fc, 2)
    shimmer = np.sin(2 * np.pi * 2 * f * t + 0.3 * np.sin(2 * np.pi * 0.2 * t))
    out += 0.12 * shimmer[:, None]
    env = np.clip(t / att, 0, 1) ** 1.5 * np.where(t < d, 1, np.exp(-(t - d) / (rel / 4)))
    return out * env[:, None] / len(det)


def pluck(m, d=0.5, bright=1.0):
    f = mtof(m); t = tt(d)
    x = saw(f, d, rng.random()) + 0.6 * saw(f * 1.004, d, rng.random()) + 0.3 * np.sin(2 * np.pi * f * t)
    e = np.exp(-t / 0.075)
    y = lp(x, 5200 * bright) * e + lp(x, 700) * (1 - e)
    return y * (1 - np.exp(-t / 0.0015)) * np.exp(-t / 0.24)


def bell(m, d=1.8, bright=1.0):
    f = mtof(m); t = tt(d)
    idx = 2.4 * bright * np.exp(-t / 0.5)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3.5 * f * t))
    y += 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.4)
    return y * (1 - np.exp(-t / 0.001)) * np.exp(-t / 0.7)


def bass_note(m, d):
    f = mtof(m); t = tt(d + 0.06)
    sub = np.sin(2 * np.pi * f * t)
    mid = lp(saw(f, d + 0.06, rng.random()), 520, 2) * 0.35
    env = (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.9) * np.clip((d + 0.06 - t) / 0.06, 0, 1)
    return np.tanh(1.3 * (sub + mid) * env)


def kick(d=0.5, punch=1.0):
    t = tt(d)
    f = 47 + 135 * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    click = hp(noise(len(t)), 3000) * np.exp(-t / 0.0018) * 0.5 * punch
    knock = np.sin(2 * np.pi * 1300 * t) * np.exp(-t / 0.004) * 0.25 * punch
    return np.tanh(1.5 * (body + click + knock))


def clap(d=0.4):
    t = tt(d); x = np.zeros(len(t))
    for k, off in enumerate((0, 0.009, 0.019, 0.031)):
        i = int(off * SR); tl = t[: len(t) - i]
        x[i:] += np.exp(-tl / (0.006 if k < 3 else 0.11))
    n = bp(noise(len(t)), 1100, 3800)
    return norm(n * x)


def hat(open_=False):
    d = 0.32 if open_ else 0.07; t = tt(d)
    metal = sum(np.sign(np.sin(2 * np.pi * f * t + rng.random() * 6)) for f in (317 * 4, 470 * 4, 593 * 4, 837 * 4, 1016 * 4, 1191 * 4))
    x = hp(0.6 * metal + noise(len(t)), 7200, 2)
    return norm(x * np.exp(-t / (0.09 if open_ else 0.016)))


def shaker():
    t = tt(0.07)
    return norm(bp(noise(len(t)), 4500, 11000) * (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.028))


def rim():
    t = tt(0.06)
    return norm(np.sin(2 * np.pi * 1750 * t) * np.exp(-t / 0.008) + 0.5 * bp(noise(len(t)), 2000, 6000) * np.exp(-t / 0.004))


def impact(d=3.5, sub=44, air=1.0):
    t = tt(d)
    f = sub * (1 + 1.3 * np.exp(-t / 0.12))
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    crack = lp(noise(len(t)), 2400) * np.exp(-t / 0.09) * 1.1 * air
    air_ = hp(noise(len(t)), 5000) * np.exp(-t / 0.5) * 0.1 * air
    return norm(np.tanh(1.2 * (boom + crack)) + air_)


def whoosh(d=0.55, peak=0.6, lo=300, hi=5500):
    t = tt(d); k = t / d
    env = np.where(k < peak, (k / peak) ** 2, ((1 - k) / (1 - peak)) ** 1.5)
    fc = lo + (hi - lo) * np.sin(np.pi * np.clip(k / (2 * peak), 0, 1)) ** 2 * env
    nz = noise(len(t))
    x = onepole_sweep(nz, fc + 50) - onepole_sweep(nz, (fc + 50) * 0.15)
    return norm(x * env)


def riser(d=2.0, f0=200, f1=1800, tone=True):
    t = tt(d); k = t / d
    nz = noise(len(t))
    fc = f0 + (f1 * 3 - f0) * k ** 2
    x = onepole_sweep(nz, fc) - onepole_sweep(nz, fc * 0.25)
    if tone:
        g = np.cumsum(f0 + (f1 - f0) * k ** 1.6) / SR
        x = x + 0.22 * (np.sin(2 * np.pi * g) + 0.5 * np.sin(2 * np.pi * 1.5 * g))
    env = k ** 2.2 * (1 - np.exp(-(1 - k) * 60))
    return norm(x * env)


def downlifter(d=1.4):
    t = tt(d); k = t / d
    x = onepole_sweep(noise(len(t)), 6000 * (1 - k) ** 2 + 200)
    return norm(x * np.exp(-k * 3) * (1 - np.exp(-t / 0.01)))


def shimmer(d=1.4, n=16, notes=(86, 88, 90, 93, 95, 98)):
    x = np.zeros(int(d * SR))
    for _ in range(n):
        st = int(rng.uniform(0, d * 0.55) * SR); f = mtof(rng.choice(notes))
        tl = np.arange(len(x) - st) / SR
        x[st:] += np.sin(2 * np.pi * f * tl) * np.exp(-tl / 0.18) * rng.uniform(0.3, 1)
    return norm(x)


# UI foley
def key_down(space=False):
    d = 0.08; t = tt(d)
    click = hp(noise(len(t)), 2600) * np.exp(-t / 0.0011)
    f0 = rng.uniform(1300, 2100) if not space else rng.uniform(650, 900)
    body = bp(noise(len(t)), f0 * 0.6, f0 * 1.5) * np.exp(-t / (0.011 if not space else 0.022))
    thock = np.sin(2 * np.pi * rng.uniform(170, 250) * t) * np.exp(-t / 0.009) * (0.45 if not space else 0.9)
    return norm(0.7 * click + 0.8 * body + 0.4 * thock)


def key_up():
    t = tt(0.03)
    return norm(hp(noise(len(t)), 3500) * np.exp(-t / 0.0015) + 0.3 * bp(noise(len(t)), 1500, 4000) * np.exp(-t / 0.006))


def mouse_click():
    t = tt(0.05)
    y = hp(noise(len(t)), 3000) * np.exp(-t / 0.0008) * 0.7 + np.sin(2 * np.pi * 2600 * t) * np.exp(-t / 0.004) * 0.5 + np.sin(2 * np.pi * 1150 * t) * np.exp(-t / 0.006) * 0.35
    return norm(y)


def soft_tick():
    t = tt(0.012)
    return norm(bp(noise(len(t)), 4000, 9000) * np.exp(-t / 0.0015))


def pop(f0=380, f1=980, d=0.12):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.018)
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035) * (1 - np.exp(-t / 0.0005)))


def gulp(d=0.32):
    t = tt(d)
    f = 140 + 520 * np.exp(-t / 0.06)
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09) * (1 - np.exp(-t / 0.0005)))


def blip(f=2300, d=0.05):
    t = tt(d)
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.011) * (1 - np.exp(-t / 0.0003))


def thud(d=0.6):
    t = tt(d)
    f = 60 + 90 * np.exp(-t / 0.05)
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16) + 0.3 * lp(noise(len(t)), 800) * np.exp(-t / 0.02))


def draw_tone(d=1.0):
    t = tt(d); k = t / d
    x = onepole_sweep(noise(len(t)), 900 + 3500 * k) - onepole_sweep(noise(len(t)), 300 + 1000 * k)
    tone = np.sin(2 * np.pi * np.cumsum(mtof(81) * (1 + 0.5 * k)) / SR) * 0.2
    return norm((x + tone) * np.sin(np.pi * k) ** 1.2)


# ------------------------------------------------------------------ harmony
CH = {  # bass root, pad voicing, arp tones, e-piano voicing
    'Bm9':   (35, [59, 62, 66, 69, 73], [71, 74, 78, 81, 85], [62, 66, 69, 73]),
    'Gmaj9': (31, [59, 62, 66, 69, 74], [67, 71, 74, 78, 81], [59, 62, 66, 69]),
    'Dadd9': (38, [57, 62, 64, 66, 69], [74, 76, 78, 81, 86], [62, 64, 66, 69]),
    'A6':    (33, [57, 61, 64, 66, 71], [69, 73, 76, 78, 83], [61, 64, 66, 71]),
    'D/F#':  (30, [57, 62, 64, 66, 69], [74, 76, 78, 81, 86], [62, 66, 69, 76]),
    'Em9':   (28, [55, 59, 62, 66, 71], [71, 74, 78, 79, 83], [59, 62, 66, 67]),
    'Asus':  (33, [57, 62, 64, 69, 71], [69, 71, 76, 81, 83], [62, 64, 69, 71]),
    'Asus2': (33, [57, 59, 64, 69, 71], [69, 71, 76, 81, 83], [59, 64, 69, 71]),
    'Bm7':   (35, [59, 62, 66, 69, 74], [71, 74, 78, 81, 86], [62, 66, 69, 74]),
    'Gmaj7': (31, [59, 62, 66, 67, 71], [67, 71, 74, 79, 83], [59, 62, 66, 71]),
}
PROG = {
    'A': ['Bm9', 'Gmaj9', 'Dadd9', 'A6'],
    'B': ['Gmaj9', 'D/F#', 'Em9', 'Asus'],
    'C': ['Dadd9', 'Asus2', 'Bm7', 'Gmaj7'],
    'D': ['Bm9', 'Gmaj9', 'Dadd9', 'A6'],
}
D1, D2, FINAL = C['demo1'], C['demo2'], C['final']
d1, d2 = C['d1'], C['d2']


def section(t):
    if t < D1: return 'A', 0.0
    if t < C['drear']: return 'B', D1
    if t < 84.0: return 'C', C['drear']
    return 'D', 84.0


def chord_at(t):
    if t >= FINAL - 0.02: return CH['Dadd9']
    s, t0 = section(t)
    bar = int((t - t0 + 1e-6) // 2)
    return CH[PROG[s][bar % 4]]


# ================================================================== SCORE
def pad_level(t):
    if 29.3 <= t < 30.0 or 59.3 <= t < 60.0: return -40
    if 16.0 <= t < 21.2: return 1.5
    if 26.0 <= t < 29.3: return 0
    if D1 <= t < C['drear']: return -4
    return -3


bar_starts = np.arange(0, DUR, 2.0)
for t0 in bar_starts:
    if t0 >= FINAL - 1.6: break
    lvl = pad_level(t0 + 0.3)
    if lvl < -30: continue
    voicing = chord_at(t0 + 0.05)[1]
    fc = 1900 if 16 <= t0 < 22 else 1350
    for m in voicing:
        place('pad', pad_note(m, 2.0, att=0.45 if t0 else 1.8, rel=1.3, fc=fc), t0, -23 + lvl)
for m in CH['Dadd9'][1] + [74, 78]:                         # final chord: one long swell
    place('pad', pad_note(m, DUR - FINAL, att=0.25, rel=1.2, fc=1700), FINAL, -22)
_f = tt(DUR - FINAL)                                         # ...over a low D
place('bass', (np.sin(2 * np.pi * mtof(38) * _f) + 0.25 * np.sin(2 * np.pi * mtof(50) * _f)) * np.clip(_f / 0.05, 0, 1) * np.exp(-_f / 3.5), FINAL, -19)

ARP = [0, 2, 1, 3, 2, 4, 3, 1]


def arp(a, b, div=2, gain=-24, octave=0, bright=1.0, pans=(-0.35, 0.35), echo=-8, seed_off=0):
    step = BEAT / div; k = seed_off
    t = np.ceil(a / step - 1e-9) * step
    while t < b - 1e-6:
        tones = chord_at(t + 0.001)[2]
        m = tones[ARP[k % len(ARP)] % len(tones)] + 12 * octave
        w = float(window(np.array(t), a, b, 0.8, 0.4))
        if w > 0.01:
            acc = 1.8 if (k % (4 * div)) == 0 else 0
            x = pluck(m, 0.6, bright)
            g = gain + acc + 20 * np.log10(w)
            place('pluck', x, t, g, pans[k % 2])
            place('echo', x, t, g + echo, pans[k % 2])
        k += 1; t += step


arp(2.5, 12.4, 2, -24)
arp(13.0, 16.0, 1, -26)
arp(16.6, 21.0, 4, -26, octave=1, bright=0.6, pans=(-0.7, 0.7), echo=-4)
arp(26.4, 29.2, 1, -26)
arp(d1['canvasIn'], 44.4, 2, -27, bright=0.7)
arp(d1['send2'] + 0.9, d1['run'], 2, -26)
arp(d1['run'] + 0.2, 58.4, 4, -27, octave=1, bright=0.65, pans=(-0.7, 0.7), echo=-4)
arp(66.75, 76.1, 2, -23)
arp(73.5, 76.0, 4, -29, octave=1, bright=0.7, pans=(-0.7, 0.7))
arp(77.25, 83.4, 1, -26)
arp(92.0, 106.6, 2, -24)
arp(d2['panels'][1], 106.6, 4, -30, octave=1, bright=0.55, pans=(-0.75, 0.75), echo=-3, seed_off=3)
arp(114.0, 118.5, 1, -28, bright=0.6)


def ep_chords(a, b, gain=-19, pattern=((0, 1.0, 0.8), (1.5, 0.45, 0.55)), spread=0.012):
    for t0 in bar_starts:
        if t0 < a - 1e-6 or t0 >= b: continue
        voicing = chord_at(t0 + 0.05)[3]
        for off, dur, vel in pattern:
            tb = t0 + off
            if tb >= b: continue
            for i, m in enumerate(voicing):
                place('keys', epiano(m, dur * 2, vel), tb + i * spread, gain - 2 * (i > 1), -0.2 + 0.13 * i)


def logo(at, gain=-15, final=False):
    notes = [(0, 81, 0.9), (0.25, 86, 0.85), (0.5, 90, 0.9), (1.0, 88, 0.8)]
    if final: notes += [(1.5, 86, 0.95)]
    for dt, m, v in notes:
        place('keys', epiano(m, 1.4, v), at + dt, gain)
        place('echo', epiano(m, 1.4, v), at + dt, gain - 6)


ep_chords(30.0, 59.3, -19)
ep_chords(77.25, 83.5, -21, pattern=((0, 1.6, 0.6),))
ep_chords(84.0, 92.0, -20)
ep_chords(106.8, 111.9, -21, pattern=((0, 1.6, 0.65),))
ep_chords(92.0, 106.6, -25, pattern=((0, 0.9, 0.55), (1.0, 0.4, 0.45)))
logo(C['title1'] + 0.05, -17)
logo(C['lockup1'] + 0.05, -15)
logo(FINAL + 0.05, -13, final=True)
for i, (dt_, m) in enumerate([(0.0, 81), (0.25, 86), (0.5, 88), (0.75, 93), (1.25, 90), (1.5, 88)]):   # Drear's motif
    place('pluck', pluck(m, 0.6, 1.2), C['drear'] + 0.25 + dt_, -19, (-0.3, 0.3)[i % 2])
    place('echo', pluck(m, 0.6, 1.2), C['drear'] + 0.25 + dt_, -25)


def bass(a, b, gain=-21, div=2):
    step = BEAT / div; t = np.ceil(a / step - 1e-9) * step; k = 0
    while t < b - 1e-6:
        root = chord_at(t + 0.001)[0] + 12
        w = float(window(np.array(t), a, b, 0.4, 0.3))
        if w > 0.01:
            oct_ = 12 if (div == 2 and k % 4 == 3) else 0
            place('bass', bass_note(root + oct_, step * 0.9), t, gain + (0 if k % 2 == 0 else -3) + 20 * np.log10(w))
        k += 1; t += step


bass(4.5, 12.4)
bass(22.0, 29.25, -22, 1)
bass(38.0, 44.4, -24, 1)
bass(d1['send2'] + 0.9, 58.4, -22)
bass(63.0, 76.1)
bass(77.25, 83.4, -24, 1)
bass(92.0, 106.6, -21)
bass(106.8, 111.9, -24, 1)

kicks = []


def kick_run(a, b, every=1.0, gain=-11, punch=1.0):
    t = np.ceil(a / (BEAT * every) - 1e-9) * BEAT * every
    while t < b - 1e-6:
        kicks.append(t); place('drums', kick(punch=punch), t, gain); t += BEAT * every


def pattern(fn, a, b, step, offs, gain, pan=0.0, jitter=0.0, accent=None):
    t = np.floor(a / step) * step; k = 0
    while t < b - 1e-6:
        for o in offs:
            tp = t + o
            if a <= tp < b:
                place('drums', fn(), tp, gain + (accent(k) if accent else 0) + rng.normal(0, jitter), pan)
        t += step; k += 1


kick_run(4.5, 12.0, 2, -12)
kick_run(38.0, 44.4, 2, -15, 0.7)
kick_run(d1['send2'] + 0.9, d1['run'], 2, -14, 0.8)
kick_run(d1['run'] + 0.15, 58.4, 1, -13)
kick_run(63.0, 66.75, 2, -13)
kick_run(66.75, 76.0, 1, -12)
kick_run(77.25, 83.25, 4, -15)
kick_run(92.0, 106.6, 1, -12)
kick_run(106.8, 111.8, 4, -15)
off2 = lambda k: 3 if k % 2 else 0
pattern(clap, 8.0, 12.0, 1.0, [0.5], -20, 0.05)
pattern(clap, d1['codeTab'], 58.4, 1.0, [0.5], -23, 0.05)
pattern(clap, 68.75, 76.0, 1.0, [0.5], -19, 0.05)
pattern(clap, d2['panels'][2], 106.6, 1.0, [0.5], -19, 0.05)
pattern(lambda: hat(), 6.0, 12.0, 0.5, [0.25], -28, 0.25, 1.0)
pattern(shaker, 30.4, 44.4, 0.25, [0.0], -36, -0.3, 1.5, off2)
pattern(lambda: hat(), d1['codeTab'], 58.4, 0.5, [0.25], -29, 0.25, 1.0)
pattern(lambda: hat(), 66.75, 76.0, 0.25, [0.0], -32, 0.25, 1.5, off2)
pattern(lambda: hat(True), 68.75, 76.0, 1.0, [0.75], -31, -0.2)
pattern(shaker, 84.0, 92.0, 0.25, [0.0], -35, -0.3, 1.5, off2)
pattern(lambda: hat(), d2['panels'][0], 106.6, 0.25, [0.0], -31, 0.25, 1.5, off2)
pattern(rim, d2['panels'][3], 106.6, 2.0, [0.75, 1.25, 1.75], -30, -0.35)


# ================================================================== SOUND DESIGN (cue-locked)
def S(x, at, g, pan=0.0, rv=-9, bus='fx'):
    place(bus, x, at, g, pan); place('verb', x, at, g + rv, pan)


S(impact(3.2, 44, 0.6), C['title1'], -10, rv=-6)
S(shimmer(1.6), C['title1'] + 0.05, -26)
S(mouse_click(), C['grow1'], -26, -0.5)
S(whoosh(0.9, 0.62, 250, 4200), C['grow1'] + 0.05, -19, -0.2)
for i, ts in enumerate(C['split1']):
    S(soft_tick(), ts, -24, -0.5)
    S(whoosh(0.6, 0.6), ts + 0.02, -21, 0.2 * (-1) ** i)
S(whoosh(0.45, 0.4, 500, 7000), C['fan'] - 0.05, -20, 0.3)
for i in range(4): S(soft_tick(), C['fan'] + 0.04 + 0.06 * i, -23, 0.4 - 0.25 * i)
for i, tc in enumerate(sorted(C['conv'])):
    S(pop(260, 720 + 120 * i), tc, -20, 0.5 - 0.33 * i)
    S(bell([81, 85, 88, 93][i], 1.4, 0.8), tc, -22, 0.5 - 0.33 * i, rv=-5)
S(riser(0.42, 300, 1600), C['merge'], -21)
S(impact(2.6, 52, 0.8), C['mergeEnd'], -11, rv=-5)
S(shimmer(1.4), C['mergeEnd'] + 0.03, -24)
S(impact(2.0, 58, 0.4), C['text2'], -17, rv=-6)
S(whoosh(0.6, 0.3, 400, 3000), C['text2Out'], -23)
S(pop(700, 260, 0.2), C['orbitIn'], -22)
S(riser(1.0, 180, 900), C['orbit1'] - 0.45, -24)
S(soft_tick(), C['orbitOut'], -18)
S(kick(0.5), C['orbitOut'], -14)
S(impact(2.0, 50, 0.5), C['orbitOut'], -16, rv=-6)
_sub = tt(C['orbitOut'] - C['orbitIn'] + 0.4)
place('bass', (np.sin(2 * np.pi * mtof(38) * _sub) + 0.35 * np.sin(2 * np.pi * mtof(50) * _sub)) * window(_sub, 0, _sub[-1], 0.8, 0.5), C['orbitIn'], -27)


def orbit_angles(t):
    p = np.clip((t - C['orbit0']) / (C['orbit1'] - C['orbit0']), 0, 1)
    io_c = lambda x: np.where(x < 0.5, 4 * x ** 3, 1 - (-2 * x + 2) ** 3 / 2)
    io_q = lambda x: np.where(x < 0.5, 8 * x ** 4, 1 - (-2 * x + 2) ** 4 / 2)
    out = io_c(np.clip(p / 0.28, 0, 1)) * (1 - io_c(np.clip((p - 0.72) / 0.28, 0, 1)))
    f = np.array([1.3, 1.85, 2.4, 2.95]); a0 = -np.pi / 2 + np.arange(4) * np.pi / 2
    return a0[None] + 2 * np.pi * 2 * io_q(p)[:, None] - out[:, None] * 0.95 * (f[None] - 1), out


_ts = np.arange(C['orbit0'], C['orbit1'], 1 / 240)
_ang, _out = orbit_angles(_ts)
for i in range(4):
    a = np.unwrap(_ang[:, i]) - np.pi / 2
    for c in np.nonzero(np.floor(a[1:] / (2 * np.pi)) != np.floor(a[:-1] / (2 * np.pi)))[0]:
        if _out[c] > 0.15: S(whoosh(0.32, 0.5, 600 + 300 * i, 6000 - 600 * i), _ts[c] - 0.16, -29 + 4 * _out[c], 0, -10)

for k, tw in enumerate(C['words']):
    S(kick(0.6, 1.4), tw, -11, bus='drums')
    S(clap(), tw, -19, rv=-4)
    S(impact(1.4, 60 + 6 * k, 0.5), tw, -17, rv=-6)
    for m in chord_at(tw)[3]: place('keys', epiano(m + 12, 1.2, 0.75), tw, -22, 0)
S(riser(0.95, 200, 2000), C['lockup1'] - 0.95, -18)
S(impact(3.5, 42, 1.0), C['lockup1'], -7, rv=-4)
S(shimmer(2.0, 20), C['lockup1'] + 0.05, -22)
S(riser(0.7, 400, 3000), C['collapse1'], -19)
S(whoosh(0.5, 0.85, 300, 6000), C['collapse1'] + 0.05, -21)

# demo 1
S(impact(2.2, 56, 0.35), D1, -16, rv=-6)
S(downlifter(1.2), D1 + 0.05, -27)
S(riser(0.9, 300, 2200), d1['run'] - 0.75, -22)
S(impact(2.4, 50, 0.6), d1['run'] + 0.1, -13, rv=-5)
S(draw_tone(4.4), C['sim'][0], -25, 0, -5)
S(shimmer(4.0, 40), C['sim'][0] + 0.2, -27, 0, -4)
for i, m in enumerate([81, 86, 90]): S(bell(m, 2.2, 0.7), C['ringIn'] + i * 0.12, -23, -0.3 + 0.3 * i, rv=-4)
S(riser(0.6, 300, 2600), D1 + 29.3, -20)

# part 2
S(pop(300, 1100, 0.18), C['drear'], -13, rv=-6)
S(impact(2.4, 50, 0.4), C['drear'], -12, rv=-6)
S(impact(1.6, 62, 0.3), C['title2'], -20, rv=-6)
S(mouse_click(), C['grow2'], -26, -0.5)
S(whoosh(0.9, 0.62, 250, 4200), C['grow2'] + 0.05, -19, -0.2)
for i, ts in enumerate(C['split2']):
    S(soft_tick(), ts, -24, -0.5)
    S(whoosh(0.6, 0.6), ts + 0.02, -21, 0.2 * (-1) ** i)
for i in range(8): S(soft_tick(), C['grid'] + 0.45 + 0.035 * i, -26, -0.6 + 0.17 * i)
S(pop(280, 900, 0.16), C['drearSolid'], -17)
TASK_NOTES = [74, 76, 78, 81, 83, 86, 88, 90]
RING = [(-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)]
for i, tc in enumerate(C['tasks']):
    pan = 0.55 * RING[i][0]
    S(bell(TASK_NOTES[i], 1.2, 0.9), tc, -19, pan, rv=-4)
    S(pop(240, 620 + 40 * i, 0.12), tc, -23, pan)
S(whoosh(0.5, 0.5, 400, 3000), C['gridEnd'], -24)
S(whoosh(0.7, 0.55), C['ring'], -20)
S(riser(C['gulp'] - C['ring'] - 0.4, 160, 1400), C['ring'] + 0.4, -20)
S(gulp(), C['gulp'], -11, rv=-8)
S(impact(2.6, 46, 0.7), C['gulp'], -10, rv=-5)
S(impact(1.8, 58, 0.4), C['text3'], -17, rv=-6)
S(impact(1.8, 58, 0.4), C['text4'] + 0.1, -17, rv=-6)

# demo 2
S(impact(2.2, 56, 0.35), D2, -16, rv=-6)
S(downlifter(1.2), D2 + 0.05, -27)
S(riser(1.0, 250, 1800), d2['run'] - 0.2, -24)
S(impact(2.0, 52, 0.5), 92.0, -15, rv=-5)
for i, tdn in enumerate(sorted(d2['done'])):
    S(bell([86, 90, 93, 98][i], 1.6, 0.9), tdn + 0.1, -18, 0.3 * (-1) ** i, rv=-4)
S(riser(0.6, 400, 2400), d2['card'] - 0.6, -21)
S(impact(2.6, 48, 0.6), d2['card'], -12, rv=-5)
for i, m in enumerate([74, 78, 81, 86, 90]): S(bell(m, 2.4, 0.8), d2['card'] + 0.05 + i * 0.09, -21, -0.4 + 0.2 * i, rv=-4)
S(shimmer(1.8, 24), d2['card'] + 0.1, -24)
for i, m in enumerate([86, 93]): S(bell(m, 1.6, 0.7), C['approve'] + 0.04 + i * 0.1, -21, 0.2, rv=-4)
S(riser(1.1, 220, 2400), FINAL - 1.1, -19)

# end card
S(impact(4.2, 41, 1.0), FINAL, -6, rv=-4)
S(shimmer(2.4, 24), FINAL + 0.05, -21)
S(bell(86, 3.0, 0.6), C['footer'], -23, 0, -4)
S(bell(93, 3.0, 0.6), C['footer'] + 0.12, -27, 0.2, -4)

# UI foley from the demos
for tk in C['keys']:
    space = rng.random() < 0.16
    pan = rng.uniform(-0.18, 0.18)
    place('foley', key_down(space), tk, -21 + rng.normal(0, 1.5) + (1.5 if space else 0), pan)
    place('foley', key_up(), tk + rng.uniform(0.05, 0.085), -30 + rng.normal(0, 1.5), pan)
for tc in C['clicks']:
    place('foley', mouse_click(), tc, -19, 0.25)
    place('foley', mouse_click(), tc + 0.075, -27, 0.25)
for ts in C['sends']:
    S(whoosh(0.35, 0.4, 600, 6000), ts + 0.02, -23, 0.1)
    S(pop(420, 1050, 0.12), ts + 0.1, -21, rv=-10)
for tp in C['pops']: S(pop(rng.uniform(320, 420), rng.uniform(880, 1100), 0.1), tp, -27, rng.uniform(-0.3, 0.3), rv=-12)
for tk in C['softKeys'][::2]: place('foley', soft_tick(), tk, -36 + rng.normal(0, 1.5), 0.35)
for ts in C['scans']: place('foley', soft_tick(), ts, -31, 0.4)
for tl in C['lines']: place('foley', soft_tick(), tl, -31, 0.3)
for td in C['draws']: S(draw_tone(1.0), td, -27, 0.2, rv=-6)
for th in C['thumps']: S(thud(), th, -19, rv=-8)
for tw in C['whooshes']: S(whoosh(0.5, 0.5, 400, 4500), tw, -27, rng.uniform(-0.4, 0.4), rv=-10)
for b in C['blinks']: place('foley', blip(2600, 0.05), b, -35); place('foley', blip(1900, 0.05), b + 0.07, -37)


# ================================================================== MIX
def pingpong(x, d=0.375, fb=0.4, n=7):
    y = np.zeros_like(x); mono = x[:, 0] + x[:, 1]
    for k in range(1, n + 1):
        sh = int(d * SR * k)
        if sh >= len(x): break
        y[sh:, k % 2] += lp(mono[:-sh], 3800 - 300 * k, 1) * fb ** k * 0.5
    return y


def reverb(x, rt=2.4, pre=0.018):
    t = tt(rt)
    lo = noise(len(t) * 2).reshape(-1, 2) * np.exp(-t * 6.9 / rt)[:, None]
    hi = noise(len(t) * 2).reshape(-1, 2) * np.exp(-t * 6.9 / (rt * 0.45))[:, None]
    ir = lp(lo, 2500) + hp(hi, 2500) * 0.6
    ir[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]
    ir = np.concatenate([np.zeros((int(pre * SR), 2)), ir])
    ir /= np.sqrt((ir ** 2).sum(0))
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)


def chorus(x, rate=0.8, depth=0.0025, base=0.008):
    i = np.arange(len(x)); out = np.zeros_like(x)
    for c, ph in enumerate((0, np.pi / 2)):
        dly = (base + depth * np.sin(2 * np.pi * rate * i / SR + ph)) * SR
        out[:, c] = np.interp(i - dly, i, x[:, c], left=0)
    return 0.6 * x + 0.55 * out


duck = np.ones(N)                                            # sidechain from the kicks
for k in kicks:
    i = int(k * SR); j = min(N, i + int(0.32 * SR))
    duck[i:j] = np.minimum(duck[i:j], 1 - np.exp(-(tN[i:j] - k) / 0.11))
duck_soft = 1 - 0.32 * (1 - duck)
duck_bass = 1 - 0.6 * (1 - duck)

keys = chorus(hp(BUS['keys'], 120))
trem = 1 + 0.12 * np.sin(2 * np.pi * 3.4 * tN)
keys[:, 0] *= trem; keys[:, 1] *= 2 - trem
pad = hp(BUS['pad'], 140) * duck_soft[:, None]
plk = hp(BUS['pluck'], 160) * duck_soft[:, None]
bas = lp(BUS['bass'], 900) * duck_bass[:, None]
drm = BUS['drums']
music = pad + plk + bas + drm + keys * duck_soft[:, None]
send = BUS['verb'] + 0.25 * pad + 0.22 * plk + 0.3 * keys + 0.15 * hp(drm, 400)
pp = pingpong(BUS['echo'] + 0.15 * keys)
mix = music + BUS['fx'] + BUS['foley'] + reverb(send + 0.3 * pp) * 0.85 + pp * 0.9

mix = hp(mix, 26, 2)                                         # master
env = np.sqrt(lp(np.mean(mix ** 2, 1), 6, 1).clip(1e-12))
thr = db(-17)
mix *= np.where(env > thr, (env / thr) ** (1 / 2.2 - 1), 1.0)[:, None]
mix /= np.max(np.abs(mix)) + 1e-9
mix *= db(-1.5)
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
mix *= (np.clip((DUR - tN) / 1.8, 0, 1) ** 1.5)[:, None]
mix[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]

w = wave.open(sys.argv[2], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
print('wrote', sys.argv[2], f'rms {20 * np.log10(np.sqrt(np.mean(mix ** 2))):.1f} dBFS')
