"""Synthesised score + sound design for the Opium 5 / Drear film.

  python3 audio/soundtrack.py build/cues.json build/soundtrack_raw.wav

The timeline comes from the animation itself (node render.mjs cues build/cues.json),
so every tick, whoosh and hit lands on the frame it belongs to. 120 BPM, D major.
"""
import json, sys, wave
import numpy as np
from scipy import signal

SR = 48000
DUR = 60.0
BEAT = 0.5
N = int(DUR * SR)
rng = np.random.default_rng(7)
C = json.load(open(sys.argv[1]))

dry = np.zeros((N, 2))
verb = np.zeros((N, 2))      # reverb send
echo = np.zeros((N, 2))      # ping-pong delay send


def tt(d): return np.arange(int(d * SR)) / SR
def db(x): return 10 ** (x / 20)
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def norm(x): return x / (np.max(np.abs(x)) + 1e-12)


def place(bus, x, at, gain_db=0.0, pan=0.0):
    """add mono/stereo x at time `at` (s); pan -1..1 (equal power)"""
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l, x * r], 1) * np.sqrt(2)
    i = int(round(at * SR))
    j0 = max(0, -i); i = max(0, i)
    j = min(N, i + len(x) - j0)
    if j > i: bus[i:j] += x[j0:j0 + (j - i)] * db(gain_db)


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), 'low'); return signal.lfilter(b, a, x, axis=0)
def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high'); return signal.lfilter(b, a, x, axis=0)
def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], 'band'); return signal.lfilter(b, a, x, axis=0)


def onepole_sweep(x, fc):
    """one-pole low-pass with per-sample cutoff"""
    a = np.exp(-2 * np.pi * np.asarray(fc) / SR)
    y = np.empty_like(x); z = 0.0
    for i in range(len(x)):
        z = (1 - a[i]) * x[i] + a[i] * z; y[i] = z
    return y


def saw(f, d, ph=0.0):
    """PolyBLEP band-limited sawtooth"""
    n = int(d * SR); dt = f / SR
    p = (ph + dt * np.arange(n)) % 1.0
    y = 2 * p - 1
    m = p < dt; x = p[m] / dt; y[m] -= x + x - x * x - 1
    m = p > 1 - dt; x = (p[m] - 1) / dt; y[m] -= x * x + x + x + 1
    return y


# ------------------------------------------------------------------ instruments
def pad_note(m, d, att=0.9, rel=1.4, fc=1500, bright=0.0):
    f = mtof(m)
    n = int((d + rel) * SR)
    out = np.zeros((n, 2))
    for k, c in enumerate((-11, -5, 0, 6, 12)):
        v = saw(f * 2 ** (c / 1200), d + rel, rng.random())
        pan = (-0.7, 0.4, 0.0, -0.4, 0.7)[k]
        out[:, 0] += v * np.cos((pan + 1) * np.pi / 4); out[:, 1] += v * np.sin((pan + 1) * np.pi / 4)
    out = lp(out, fc * (1 + bright), 2)
    t = np.arange(n) / SR
    env = np.minimum(1, t / att) * np.where(t < d, 1, np.exp(-(t - d) / (rel / 4)))
    return out * env[:, None] / 5


def pluck(m, d=0.6, bright=1.0):
    f = mtof(m); t = tt(d)
    idx = bright * 2.2 * np.exp(-t * 16)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 2 * f * t))
    y += 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 12)
    env = np.exp(-t * 6.5) * (1 - np.exp(-t * 1200))
    return y * env


def bass_note(m, d):
    f = mtof(m); t = tt(d + 0.08)
    y = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    env = (1 - np.exp(-t * 400)) * np.exp(-t * 2.2) * np.clip((d + 0.08 - t) / 0.08, 0, 1)
    return np.tanh(1.4 * y * env)


def kick(d=0.5, punch=1.0):
    t = tt(d)
    f = 44 + 120 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9.0)
    click = hp(rng.normal(0, 1, len(t)), 2500) * np.exp(-t * 350) * 0.35 * punch
    return np.tanh(1.6 * (body + click))


def hat(d=0.07, open_=False):
    t = tt(d if not open_ else 0.25)
    n = hp(rng.normal(0, 1, len(t)), 7000, 2)
    return n * np.exp(-t * (60 if not open_ else 14))


def snap(d=0.35):
    t = tt(d)
    n = bp(rng.normal(0, 1, len(t)), 900, 6000)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    return norm(n * np.exp(-t * 18) + 0.6 * tone)


def impact(d=3.0, sub=46, air=1.0):
    t = tt(d)
    f = sub * (1 + 1.4 * np.exp(-t * 9))
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.9)
    crack = lp(rng.normal(0, 1, len(t)), 2200) * np.exp(-t * 9) * 1.2 * air
    hiss = hp(rng.normal(0, 1, len(t)), 5000) * np.exp(-t * 4) * 0.12 * air
    return norm(np.tanh(1.3 * (boom + crack)) + hiss)


def whoosh(d=0.55, peak=0.6, lo=300, hi=5500):
    t = tt(d); k = t / d
    env = np.where(k < peak, (k / peak) ** 2, ((1 - k) / (1 - peak)) ** 1.5)
    fc = lo + (hi - lo) * np.sin(np.pi * np.clip(k / (2 * peak), 0, 1)) ** 2 * env
    nz = rng.normal(0, 1, len(t))
    x = onepole_sweep(nz, fc + 50) - onepole_sweep(nz, (fc + 50) * 0.15)
    return norm(x * env)


def riser(d=2.0, f0=200, f1=1800):
    t = tt(d); k = t / d
    nz = rng.normal(0, 1, len(t))
    fc = f0 + (f1 * 3 - f0) * k ** 2
    x = onepole_sweep(nz, fc) - onepole_sweep(nz, fc * 0.25)
    tone = np.sin(2 * np.pi * np.cumsum(f0 + (f1 - f0) * k ** 1.6) / SR) * 0.25
    env = k ** 2.2 * (1 - np.exp(-(1 - k) * 60))
    return norm((x + tone) * env)


def tick(f=3200, d=0.03):
    t = tt(d)
    return norm(np.sin(2 * np.pi * f * t) * np.exp(-t * 260) + 0.4 * hp(rng.normal(0, 1, len(t)), 4000) * np.exp(-t * 600))


def pop(f0=320, f1=980, d=0.16):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * 55)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26) * (1 - np.exp(-t * 3000))
    return norm(y)


def gulp(d=0.32):
    t = tt(d)
    f = 140 + 520 * np.exp(-t * 16)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11) * (1 - np.exp(-t * 2000))
    return norm(y)


def blip(f=2300, d=0.05):
    t = tt(d)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 90) * (1 - np.exp(-t * 4000))


def chime(m=86, d=2.5):
    f = mtof(m); t = tt(d)
    y = sum(np.sin(2 * np.pi * f * r * t) * np.exp(-t * (2.2 + 1.6 * i)) / (1 + i) for i, r in enumerate((1, 2.0, 2.76, 4.07)))
    return norm(y * (1 - np.exp(-t * 2000)))


def shimmer(d=1.2, n=14):
    x = np.zeros(int(d * SR))
    for _ in range(n):
        st = int(rng.uniform(0, d * 0.5) * SR); f = mtof(rng.choice([86, 88, 90, 93, 95, 98]))
        tl = np.arange(len(x) - st) / SR
        x[st:] += np.sin(2 * np.pi * f * tl) * np.exp(-tl * 6) * rng.uniform(0.3, 1)
    return norm(x)


# ------------------------------------------------------------------ harmony
# chords: (bass root midi, pad voicing midi, arp tones midi)
CH = {
    'Bm9':   (35, [59, 62, 66, 69, 73], [71, 74, 78, 81, 85]),
    'Gmaj9': (31, [59, 62, 66, 69, 74], [67, 71, 74, 78, 81]),
    'Dadd9': (38, [57, 62, 64, 66, 69], [74, 76, 78, 81, 86]),
    'A6':    (33, [57, 61, 64, 66, 71], [69, 73, 76, 78, 83]),
    'Asus2': (33, [57, 59, 64, 69, 71], [69, 71, 76, 81, 83]),
    'Bm7':   (35, [59, 62, 66, 69, 74], [71, 74, 78, 81, 86]),
    'Gmaj7': (31, [59, 62, 66, 67, 71], [67, 71, 74, 79, 83]),
}
P1 = ['Bm9', 'Gmaj9', 'Dadd9', 'A6']
P2 = ['Dadd9', 'Asus2', 'Bm7', 'Gmaj7']


def chord_at(t):
    bar = int(t // 2)
    if t < 30: return CH[P1[bar % 4]]
    if t >= C['final']: return CH['Dadd9']
    return CH[P2[(bar - 15) % 4]]


def window(t, a, b, fi=0.3, fo=0.3):
    return np.clip(np.minimum((t - a) / fi, (b - t) / fo), 0, 1)


# ------------------------------------------------------------------ score
# pad: one chord per bar, level automation by section
def pad_level(t):
    if t < 2.0: return -4
    if 29.3 <= t < 30.0: return -30
    if 16.0 <= t < 21.2: return 2
    if 26.0 <= t < 29.3: return -1
    if t >= C['final']: return 0
    return -5


for bar in range(30):
    t0 = bar * 2.0
    if 29.3 <= t0 + 1.9 < 30.0: continue
    root, voicing, _ = chord_at(t0 + 0.01)
    d = 2.0 if t0 + 2 <= DUR else DUR - t0
    if t0 >= C['final'] - 0.5:            # final chord: one long swell to the end
        if t0 > C['final']: continue
        d = DUR - t0
    fc = 1700 if 16 <= t0 < 22 else 1300
    lvl = pad_level(t0 + 0.5)
    for m in voicing:
        place(dry, pad_note(m, d, att=0.5 if t0 else 1.8, rel=1.2, fc=fc), t0, -24 + lvl)
        place(verb, pad_note(m, d, att=0.5 if t0 else 1.8, rel=1.2, fc=fc * 0.8), t0, -28 + lvl)

# arpeggio plucks
ARP = [0, 2, 1, 3, 2, 4, 3, 1]
def arp_section(a, b, div=2, gain=-25, octave=0, bright=1.0, pans=(-0.35, 0.35)):
    step = BEAT / div
    k = 0
    t = np.ceil(a / step) * step
    while t < b - 1e-6:
        _, _, tones = chord_at(t + 0.001)
        m = tones[ARP[k % len(ARP)] % len(tones)] + 12 * octave
        w = float(window(np.array(t), a, b, 0.6, 0.4))
        if w > 0:
            accent = 1.6 if (k % (4 * div)) == 0 else 0
            x = pluck(m, 0.7, bright)
            place(dry, x, t, gain + accent + 20 * np.log10(w + 1e-6), pans[k % 2])
            place(echo, x, t, gain - 6 + 20 * np.log10(w + 1e-6), pans[k % 2])
            place(verb, x, t, gain - 8, 0)
        k += 1; t += step

arp_section(2.5, 12.4, div=2, gain=-23)
arp_section(13.0, 16.0, div=1, gain=-25)
arp_section(16.6, 21.0, div=4, gain=-25, octave=1, bright=0.6, pans=(-0.7, 0.7))
arp_section(26.4, 29.2, div=1, gain=-25)
arp_section(33.0, 46.1, div=2, gain=-22)
arp_section(43.5, 46.0, div=4, gain=-27, octave=1, bright=0.7, pans=(-0.7, 0.7))
arp_section(47.25, 53.4, div=1, gain=-25)
arp_section(54.0, 58.5, div=1, gain=-27, bright=0.6)

# soft sub drone under the orbit breakdown
_t = tt(C['orbitOut'] - C['orbitIn'] + 0.4)
_d = (np.sin(2 * np.pi * mtof(38) * _t) + 0.35 * np.sin(2 * np.pi * mtof(50) * _t)) * window(_t, 0, _t[-1], 0.8, 0.5)
place(dry, _d, C['orbitIn'], -27)

# Drear's little motif when he appears
for i, (dt_, m) in enumerate([(0.0, 81), (0.25, 86), (0.5, 88), (0.75, 93), (1.25, 90), (1.5, 88)]):
    place(dry, pluck(m, 0.6, 1.2), C['drear'] + 0.25 + dt_, -22, (-0.3, 0.3)[i % 2])
    place(echo, pluck(m, 0.6, 1.2), C['drear'] + 0.25 + dt_, -28)

# bass (8ths with a little swing of velocity), ducked by the kick
def bass_section(a, b, gain=-17, div=2):
    step = BEAT / div; t = np.ceil(a / step) * step; k = 0
    while t < b - 1e-6:
        root = chord_at(t + 0.001)[0] + 12
        w = float(window(np.array(t), a, b, 0.4, 0.3))
        if w > 0:
            place(dry, bass_note(root, step * 0.92), t, gain + (0 if k % 2 == 0 else -4) + 20 * np.log10(w + 1e-6))
        k += 1; t += step

bass_section(4.5, 12.4, gain=-23)
bass_section(22.0, 29.25, div=1, gain=-24)
bass_section(33.0, 46.1, gain=-23)
bass_section(47.25, 58.0, div=1, gain=-25)

# drums
kicks = []
def kick_section(a, b, every=1.0, gain=-9):
    t = np.ceil(a / (BEAT * every)) * BEAT * every
    while t < b - 1e-6:
        kicks.append(t); place(dry, kick(), t, gain); t += BEAT * every
kick_section(4.5, 12.0, every=2, gain=-13)
kick_section(36.75, 46.0, every=1, gain=-14)
kick_section(33.0, 36.75, every=2, gain=-14)
kick_section(47.25, 53.25, every=4, gain=-16)
for t in np.arange(6.25, 12.0, BEAT):                      # off-beat hats
    place(dry, hat(), t, -31, 0.25)
for t in np.arange(37.0, 46.0, BEAT / 2):
    place(dry, hat(), t, -33 if (t * 4) % 2 else -30, 0.25)
for t in np.arange(38.75, 46.0, 2 * BEAT):
    place(dry, snap(), t + BEAT, -24, -0.1); place(verb, snap(), t + BEAT, -28)

# ------------------------------------------------------------------ sound design on the cues
P = lambda x, at, g, pan=0.0, rv=-8: (place(dry, x, at, g, pan), place(verb, x, at, g + rv, pan))

P(impact(3.2, 44, 0.6), C['title1'], -9, 0, -6)
P(shimmer(1.6), C['title1'] + 0.05, -24, 0)
P(tick(2600), C['grow1'], -22, -0.5)
P(whoosh(0.9, 0.62, 250, 4200), C['grow1'] + 0.05, -17, -0.2)
for i, ts in enumerate(C['split1']):
    P(tick(3000 + 300 * i), ts, -23, -0.5)
    P(whoosh(0.6, 0.6), ts + 0.02, -19, 0.2 * (-1) ** i)
P(whoosh(0.45, 0.4, 500, 7000), C['fan'] - 0.05, -18, 0.3)
for i in range(4): P(tick(2400 + 260 * i, 0.025), C['fan'] + 0.04 + 0.06 * i, -22, 0.4 - 0.25 * i)
for i, tc in enumerate(sorted(C['conv'])):
    P(pop(260, 700 + 120 * i, 0.14), tc, -17, 0.5 - 0.33 * i)
    P(pluck([81, 85, 88, 93][i], 0.8, 1.3), tc, -20, 0.5 - 0.33 * i)
P(riser(0.42, 300, 1600), C['merge'], -19, 0)
P(impact(2.6, 52, 0.8), C['mergeEnd'], -10, 0, -5)
P(shimmer(1.4), C['mergeEnd'] + 0.03, -22)
P(impact(2.0, 58, 0.4), C['text2'], -16, 0, -6)
P(whoosh(0.6, 0.3, 400, 3000), C['text2Out'], -21)
P(pop(700, 260, 0.2), C['orbitIn'], -20)
P(riser(1.0, 180, 900), C['orbit1'] - 0.45, -22)
P(tick(1800, 0.05), C['orbitOut'], -16)
P(kick(0.5), C['orbitOut'], -12)
P(impact(2.0, 50, 0.5), C['orbitOut'], -15, 0, -6)

# orbit swooshes: each lobe passing the bottom of its orbit, panned with its position
def orbit_angles(t):
    p = np.clip((t - C['orbit0']) / (C['orbit1'] - C['orbit0']), 0, 1)
    def io_cubic(x): return np.where(x < 0.5, 4 * x ** 3, 1 - (-2 * x + 2) ** 3 / 2)
    def io_quart(x): return np.where(x < 0.5, 8 * x ** 4, 1 - (-2 * x + 2) ** 4 / 2)
    out = io_cubic(np.clip(p / 0.28, 0, 1)) * (1 - io_cubic(np.clip((p - 0.72) / 0.28, 0, 1)))
    f = np.array([1.3, 1.85, 2.4, 2.95])
    a0 = -np.pi / 2 + np.arange(4) * np.pi / 2
    return a0[None] + 2 * np.pi * 2 * io_quart(p)[:, None] - out[:, None] * 0.95 * (f[None] - 1), out
ts = np.arange(C['orbit0'], C['orbit1'], 1 / 240)
ang, out = orbit_angles(ts)
for i in range(4):
    a = np.unwrap(ang[:, i]) - np.pi / 2
    cross = np.nonzero(np.floor(a[1:] / (2 * np.pi)) != np.floor(a[:-1] / (2 * np.pi)))[0]
    for c in cross:
        if out[c] < 0.15: continue
        P(whoosh(0.32, 0.5, 600 + 300 * i, 6000 - 600 * i), ts[c] - 0.16, -27 + 4 * out[c], 0, -10)

for k, tw in enumerate(C['words']):
    P(kick(0.6, 1.4), tw, -10)
    P(snap(), tw, -17, 0, -4)
    P(impact(1.4, 60 + 6 * k, 0.5), tw, -16, 0, -6)
    root, voicing, _ = CH[P1[(int(tw // 2)) % 4]]
    for m in voicing[1:4]: P(pluck(m + 12, 1.0, 0.9), tw, -22, 0, -4)
P(riser(0.95, 200, 2000), C['lockup1'] - 0.95, -17)
P(impact(3.5, 42, 1.0), C['lockup1'], -6, 0, -4)
P(shimmer(2.0, 20), C['lockup1'] + 0.05, -21)
P(riser(0.7, 400, 3000), C['collapse1'], -18)
P(whoosh(0.5, 0.85, 300, 6000), C['collapse1'] + 0.05, -20)

P(pop(300, 1100, 0.18), C['drear'], -12, 0, -6)
P(impact(2.4, 50, 0.4), C['drear'], -11, 0, -6)
P(impact(1.6, 62, 0.3), C['title2'], -19, 0, -6)
blinks = [31.2, 32.75, 34.55, 37.2, 38.3, 44.15, 46.55, 48.6, 51.9, 56.6, 59.0]
for b in blinks: place(dry, blip(2600, 0.05), b, -33); place(dry, blip(1900, 0.05), b + 0.07, -35)
P(tick(2600), C['grow2'], -22, -0.5)
P(whoosh(0.9, 0.62, 250, 4200), C['grow2'] + 0.05, -17, -0.2)
for i, ts_ in enumerate(C['split2']):
    P(tick(3000 + 300 * i), ts_, -23, -0.5)
    P(whoosh(0.6, 0.6), ts_ + 0.02, -19, 0.2 * (-1) ** i)
for i in range(8): P(tick(2200 + 180 * i, 0.025), C['grid'] + 0.2 + 0.035 * i, -25, -0.6 + 0.17 * i)
P(pop(280, 900, 0.16), C['drearSolid'], -15)
TASK_NOTES = [74, 76, 78, 81, 83, 86, 88, 90]
RING = [(-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)]
for i, tc in enumerate(C['tasks']):
    pan = 0.55 * RING[i][0]
    P(pluck(TASK_NOTES[i], 0.9, 1.4), tc, -17, pan, -4)
    P(pop(240, 620 + 40 * i, 0.12), tc, -21, pan)
P(whoosh(0.5, 0.5, 400, 3000), C['gridEnd'], -22)
P(whoosh(0.7, 0.55), C['ring'], -18)
P(riser(C['gulp'] - C['ring'] - 0.4, 160, 1400), C['ring'] + 0.4, -18)
P(gulp(), C['gulp'], -9, 0, -8)
P(impact(2.6, 46, 0.7), C['gulp'], -9, 0, -5)
P(impact(1.8, 58, 0.4), C['text3'], -16, 0, -6)
P(impact(1.8, 58, 0.4), C['text4'] + 0.1, -16, 0, -6)
P(riser(1.2, 220, 2200), C['final'] - 1.2, -18)
P(impact(4.0, 41, 1.0), C['final'], -5, 0, -4)
P(shimmer(2.4, 24), C['final'] + 0.05, -20)
P(chime(86, 3.0), C['footer'], -21, 0, -4)
P(chime(93, 3.0), C['footer'] + 0.12, -25, 0.2, -4)

# ------------------------------------------------------------------ effects buses
def pingpong(x, d=0.375, fb=0.38, n=6):
    y = np.zeros_like(x); src = x.copy()
    for k in range(1, n + 1):
        sh = int(d * SR * k)
        if sh >= len(x): break
        g = fb ** k
        ch = k % 2
        y[sh:, ch] += lp(src[:-sh, 0] + src[:-sh, 1], 3500 - 300 * k, 1) * g * 0.5
    return y

def reverb(x, rt=2.6):
    t = tt(rt)
    ir = rng.normal(0, 1, (len(t), 2)) * np.exp(-t * 6.9 / rt)[:, None]
    ir = lp(ir, 6000)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    ir /= np.sqrt((ir ** 2).sum(0))
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)

mix = dry + pingpong(echo) * 0.9
mix += reverb(verb + pingpong(echo) * 0.4) * 0.9

# kick sidechain on the whole bed (gentle)
duck = np.ones(N)
tN = np.arange(N) / SR
for k in kicks:
    i = int(k * SR); j = min(N, i + int(0.3 * SR))
    duck[i:j] = np.minimum(duck[i:j], 1 - 0.35 * np.exp(-(tN[i:j] - k) / 0.09))
mix *= duck[:, None]

# master: high-pass, glue compression, soft clip, fade
mix = hp(mix, 28, 2)
env = np.sqrt(lp(np.mean(mix ** 2, 1), 8, 1).clip(1e-12))
thr = db(-18)
gain = np.where(env > thr, (env / thr) ** (1 / 2.5 - 1), 1.0)
mix *= gain[:, None]
mix /= np.max(np.abs(mix)) + 1e-9
mix *= db(-1.5)
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
fade = np.clip((DUR - tN) / 1.6, 0, 1) ** 1.5
mix *= fade[:, None]
mix[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]

w = wave.open(sys.argv[2], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
print('wrote', sys.argv[2], f'rms {20 * np.log10(np.sqrt(np.mean(mix ** 2))):.1f} dBFS')
