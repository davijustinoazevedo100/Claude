"""Sound design for the dia-2 edit: synthesized music bed + effects, mixed under the cleaned-up voice.

Usage: python3 sfx.py voice.wav mix.wav
(voice.wav: 48 kHz stereo, already cleaned/normalised; see README for the ffmpeg chain)
Timeline constants mirror edit.py.
"""
import sys, wave
import numpy as np
from scipy.signal import butter, lfilter

SR = 48000
rng = np.random.default_rng(3)

HOOK_SRC, HOOK_D, TITLE_D, OUTRO_D = 64.60, 3.45, 2.4, 3.2
MAIN0 = HOOK_D + TITLE_D
DEATH, CUT = 66.84, 32.39
HB = [64.05, 64.85, 65.50, 66.05, 66.50]

def t_(d): return np.arange(int(d * SR)) / SR
def norm(x): return x / (np.max(np.abs(x)) + 1e-9)
def lp(x, fc, o=2): b, a = butter(o, min(fc, SR * 0.45) / (SR / 2)); return lfilter(b, a, x)
def hp(x, fc, o=2): b, a = butter(o, fc / (SR / 2), "high"); return lfilter(b, a, x)
def bp(x, f0, f1, o=2): b, a = butter(o, [f0 / (SR / 2), min(f1, SR * 0.45) / (SR / 2)], "band"); return lfilter(b, a, x)
def noise(d): return rng.normal(0, 1, int(d * SR))

def onepole_lp(x, fc):
    """one-pole low-pass with a per-sample cutoff (short signals only)"""
    fc = np.broadcast_to(fc, x.shape)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); z = 0.0
    for i in range(len(x)):
        z = (1 - a[i]) * x[i] + a[i] * z; y[i] = z
    return y

def square(ph, duty=0.5): return np.where((ph / (2 * np.pi)) % 1 < duty, 1.0, -1.0)
def saw(ph): return 2 * ((ph / (2 * np.pi)) % 1) - 1
def phase(f): return 2 * np.pi * np.cumsum(np.broadcast_to(f, np.shape(f))) / SR

# ----------------------------------------------------------------------------- one-shots
def pop(d=0.12):
    t = t_(d); f = 1100 * np.exp(-t * 14) + 320
    x = np.sin(phase(f)) * np.exp(-t * 32)
    x[:96] += rng.normal(0, 0.6, 96) * np.linspace(1, 0, 96)
    return norm(x)

def whoosh(d=0.5, up=True):
    t = t_(d); k = t / d
    env = np.sin(np.pi * k ** (0.6 if up else 1.4)) ** 2
    fc = 400 + 5000 * np.sin(np.pi * k) ** 2
    n = noise(d)
    return norm((onepole_lp(n, fc) - onepole_lp(n, fc * 0.12)) * env)

def impact(d=1.6, sub=60):
    t = t_(d); f = sub * np.exp(-t * 2.5) + sub * 0.6
    body = np.sin(phase(f)) * np.exp(-t * 3.2)
    crack = lp(noise(d), 1400) * np.exp(-t * 16) * 3
    return norm(np.tanh((body * 1.6 + crack) * 1.8))

def boom(d=3.0):
    t = t_(d)
    sub = np.sin(phase(38 * np.exp(-t * 0.6) + 22)) * np.exp(-t * 1.3)
    mid = lp(noise(d), 500) * np.exp(-t * 4) * 1.5
    return norm(np.tanh((sub * 2 + mid + impact(d, 55) * 0.8) * 1.4))

def chime(d=0.9, base=1320):
    t = t_(d)
    x = sum(np.sin(2 * np.pi * base * m * t) * np.exp(-t * (5 + 3 * m)) / m for m in (1, 1.5, 2, 3))
    return norm(x * (1 - np.exp(-t * 400)))

def shimmer(d=0.8, n=10, seed=0):
    r = np.random.default_rng(seed); x = np.zeros(int(d * SR))
    for k in range(n):
        st = int(r.uniform(0, d * 0.6) * SR); f = r.uniform(2200, 5200)
        tt = t_(d)[: len(x) - st]
        x[st:] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 9) * r.uniform(0.4, 1)
    return norm(x)

def tick(f=2500):
    t = t_(0.014); n = noise(0.014)
    return norm((n - lp(n, f, 1)) * np.exp(-t * 600) + np.sin(2 * np.pi * f * 0.8 * t) * np.exp(-t * 500) * 0.5)

def heartbeat():
    t = t_(0.5)
    def thump(f, d0):
        tt = np.clip(t - d0, 0, None)
        return np.sin(2 * np.pi * f * tt * (1 + 0.3 * np.exp(-tt * 30))) * np.exp(-tt * 18) * (t >= d0)
    return norm(np.tanh((thump(52, 0.0) + 0.75 * thump(46, 0.17)) * 2.2))

def riser(d=1.2):
    t = t_(d); k = t / d
    n = noise(d); fc = 300 + 7000 * k ** 2
    x = onepole_lp(n, fc) - onepole_lp(n, fc * 0.2)
    tone = np.sin(phase(180 + 900 * k ** 2)) * 0.5 + np.sin(phase(181.5 + 905 * k ** 2)) * 0.5
    return norm((x + tone * 0.6) * k ** 2.2)

def drone(d, f0=55):
    t = t_(d)
    x = (np.sin(2 * np.pi * f0 * t) + np.sin(2 * np.pi * f0 * 1.013 * t) + 0.5 * np.sin(2 * np.pi * f0 * 1.5 * t)
         + 0.6 * lp(noise(d), 220))
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.9 * t)
    env = np.clip(np.minimum(t / 0.5, (d - t) / 0.6), 0, 1)
    return norm(x * env)

def glitchfx(d=0.25, seed=0):
    r = np.random.default_rng(seed); x = np.zeros(int(d * SR)); i = 0
    while i < len(x):
        L = int(r.uniform(0.008, 0.035) * SR); f = r.choice([180, 330, 660, 1200, 2400, 90])
        seg = square(phase(np.full(L, f))) if r.random() < 0.6 else r.normal(0, 1, L)
        x[i:i + L] = seg[: len(x) - i] * r.uniform(0.3, 1); i += L
    x = np.round(x * 6) / 6                                       # bit-crush
    return norm(x * np.clip(np.minimum(t_(d) / 0.005, (d - t_(d)) / 0.02), 0, 1))

def scratch(d=0.42):
    """record scratch: a short noisy chord dragged back and forth"""
    src_t = t_(0.6)
    src = sum(saw(2 * np.pi * f * src_t) for f in (196, 247, 294)) + noise(0.6) * 0.6
    t = t_(d)
    pos = 0.18 + 0.12 * np.sin(2 * np.pi * 2.4 * t) * np.sin(np.pi * t / d)
    x = np.interp(pos * SR, np.arange(len(src)), src)
    return norm(bp(x, 300, 4000) * np.sin(np.pi * t / d) ** 0.5)

def siren(d):
    t = t_(d)
    f = np.where((t % 0.7) < 0.35, 700, 960).astype(float)
    f = lp(f, 30, 1)
    ph = phase(f)
    x = np.sin(ph) + 0.35 * np.sin(3 * ph)
    return norm(bp(x, 400, 3500) * np.clip(np.minimum(t / 0.1, (d - t) / 0.3), 0, 1))

def shush(d=0.55):
    t = t_(d)
    return norm(bp(noise(d), 2500, 9000) * np.sin(np.pi * (t / d) ** 0.7) ** 1.5)

def chip(freqs, step=0.07, last=0.25, duty=0.25):
    """8-bit arpeggio"""
    out = []
    for k, f in enumerate(freqs):
        d = last if k == len(freqs) - 1 else step
        t = t_(d)
        out.append(square(phase(np.full(len(t), f)), duty) * np.exp(-t * (4 if k == len(freqs) - 1 else 10)))
    return norm(lp(np.concatenate(out), 6000))

def blip(f=880, d=0.045):
    t = t_(d); return norm(square(phase(np.full(len(t), f)), 0.5) * np.exp(-t * 40))

def alert():
    a = chip([1047], last=0.07); b = chip([1568], last=0.32, duty=0.5)
    return norm(np.concatenate([a, b]))

def tear(d=0.38):
    t = t_(d); n = noise(d)
    crack = np.zeros(len(t))
    for st in rng.uniform(0, d * 0.9, 40):
        i = int(st * SR); L = min(600, len(t) - i)
        crack[i:i + L] += np.exp(-np.arange(L) / 60) * rng.uniform(0.3, 1)
    return norm(bp(n, 1500, 7000) * (0.3 + crack) * np.sin(np.pi * t / d) ** 0.4)

def snip():
    t = t_(0.09)
    one = hp(noise(0.09), 3000) * np.exp(-t * 90) + np.sin(2 * np.pi * 3400 * t) * np.exp(-t * 70) * 0.6
    x = np.zeros(int(0.12 * SR)); x[: len(one)] += one; x[int(0.03 * SR): int(0.03 * SR) + len(one)] += one * 0.7
    return norm(x)

def zap(d=0.45):
    t = t_(d)
    x = saw(phase(np.full(len(t), 85.0))) * (0.5 + 0.5 * square(phase(np.full(len(t), 60.0)))) + hp(noise(d), 4000) * 0.8
    return norm(lp(x, 5000) * np.exp(-t * 6))

def clunk():
    t = t_(0.45)
    thud = np.sin(2 * np.pi * 70 * t) * np.exp(-t * 25)
    click = hp(noise(0.45), 2000) * np.exp(-t * 120)
    whir = np.sin(2 * np.pi * 120 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t)) * np.clip((t - 0.08) / 0.1, 0, 1) * np.exp(-t * 3) * 0.4
    return norm(thud + click + whir)

def hiss(d):
    t = t_(d); return norm(bp(noise(d), 3000, 12000) * np.clip(np.minimum(t / 0.1, (d - t) / 0.1), 0, 1))

def slash():
    t = t_(0.18); n = noise(0.18)
    return norm(onepole_lp(n, 9000 * np.exp(-t * 8) + 400) * np.exp(-t * 14))

def boing(d=0.35):
    t = t_(d); f = 300 + 180 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 6)
    return norm(np.sin(phase(f)) * np.exp(-t * 7))

def crackle(d=0.6, n=50, seed=4):
    r = np.random.default_rng(seed); x = np.zeros(int(d * SR))
    for st in r.uniform(0, d * 0.8, n):
        i = int(st * SR); L = min(400, len(x) - i)
        x[i:i + L] += hp(r.normal(0, 1, L), 2000) * np.exp(-np.arange(L) / 40) * r.uniform(0.2, 1)
    return norm(x)

def sweep_tone(d, f0, f1):
    t = t_(d); k = t / d
    return norm(np.sin(phase(f0 + (f1 - f0) * k)) * np.sin(np.pi * k) * 0.8)

# ----------------------------------------------------------------------------- music bed (lo-fi chiptune, A minor)
BPM = 100; BEAT = 60 / BPM
CHORDS = [(57, [57, 60, 64]), (53, [53, 57, 60]), (50, [50, 53, 57]), (52, [52, 56, 59])]   # Am F Dm E (midi)
def mf(m): return 440 * 2 ** ((m - 69) / 12)

def music(total):
    N = int(total * SR); out = np.zeros(N)
    nbars = int(total / (4 * BEAT)) + 1
    def add(x, at, g):
        i = int(at * SR); j = min(N, i + len(x))
        if j > i: out[i:j] += x[: j - i] * g
    kick_t = t_(0.35); kick = np.sin(phase(110 * np.exp(-kick_t * 30) + 45)) * np.exp(-kick_t * 9)
    sn_t = t_(0.2); snare = (bp(noise(0.2), 900, 6000) * 0.8 + np.sin(2 * np.pi * 185 * sn_t) * 0.6) * np.exp(-sn_t * 22)
    hat_t = t_(0.05); hat = hp(noise(0.05), 7000) * np.exp(-hat_t * 90)
    for b in range(nbars):
        root, tones = CHORDS[b % 4]
        b0 = b * 4 * BEAT
        for q in range(4):
            add(kick, b0 + q * BEAT, 0.9 if q in (0, 2) else 0.0)
            if q in (1, 3): add(snare, b0 + q * BEAT, 0.35)
        add(kick, b0 + 2.5 * BEAT, 0.5)
        for e in range(8): add(hat, b0 + e * BEAT / 2, 0.16 if e % 2 else 0.09)
        # bass: 8ths
        for e, on in enumerate([1, 0, 1, 1, 0, 1, 1, 1]):
            if not on: continue
            d = BEAT / 2 * 0.9; t = t_(d)
            f = mf(root - 24 + (12 if e == 7 else 0))
            x = lp(saw(phase(np.full(len(t), f))) + 0.5 * square(phase(np.full(len(t), f))), 520) * np.exp(-t * 5)
            add(x, b0 + e * BEAT / 2, 0.33)
        # pluck arp: 16ths, pulse wave
        pat = [0, 1, 2, 1, 0, 1, 2, 3, 0, 2, 1, 2, 0, 1, 2, 3]
        for s_, k in enumerate(pat):
            m = tones[k % 3] + 12 * (1 + k // 3)
            d = BEAT / 4 * 1.6; t = t_(d)
            x = square(phase(np.full(len(t), mf(m))), 0.25) * np.exp(-t * 16)
            add(lp(x, 3200), b0 + s_ * BEAT / 4, 0.07)
        # pad
        d = 4 * BEAT; t = t_(d)
        pad = sum(saw(phase(np.full(len(t), mf(m) * dt))) for m in tones for dt in (0.997, 1.003))
        env = np.clip(np.minimum(t / 0.6, (d - t) / 0.4), 0, 1)
        add(lp(pad, 900) * env, b0, 0.05)
    return out

def tape_stop(x, at, d=0.75):
    """slow the music down to a halt starting at `at` seconds, silence after"""
    i0 = int(at * SR); n = int(d * SR)
    tau = np.arange(n) / SR
    pos = i0 + (tau - tau ** 2 / (2 * d)) * SR
    seg = np.interp(pos, np.arange(len(x)), x) * np.linspace(1, 0.3, n)
    y = x.copy(); y[i0:i0 + n] = seg; y[i0 + n:] = 0
    return y

def wobble(x, t0, t1):
    """VHS wow & flutter + muffled top end on a section"""
    i0, i1 = int(t0 * SR), int(t1 * SR)
    tau = np.arange(i1 - i0) / SR
    pos = i0 + (tau + 0.006 * np.sin(2 * np.pi * 1.1 * tau) / (2 * np.pi * 1.1) + 0.002 * np.sin(2 * np.pi * 7 * tau) / (2 * np.pi * 7)) * SR
    seg = lp(np.interp(pos, np.arange(len(x)), x), 1500, 2) * 0.8
    k = np.clip(np.minimum(tau / 0.08, (tau[-1] - tau) / 0.08), 0, 1)
    y = x.copy(); y[i0:i1] = x[i0:i1] * (1 - k) + seg * k
    return y

# ----------------------------------------------------------------------------- mix
def place(bus, x, at, db, pan=0.0):
    g = 10 ** (db / 20)
    i = int(at * SR); j = min(len(bus), i + len(x))
    if j <= i or i < 0: return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    bus[i:j, 0] += x[: j - i] * g * l * 1.41
    bus[i:j, 1] += x[: j - i] * g * r * 1.41

def reverb(x, wet=0.18, d=0.9):
    t = t_(d)
    ir = rng.normal(0, 1, (len(t), 2)) * np.exp(-t * 5)[:, None]
    ir /= np.sqrt((ir ** 2).sum(0))
    n = len(x) + len(ir)
    y = np.stack([np.fft.irfft(np.fft.rfft(x[:, c], n) * np.fft.rfft(ir[:, c], n), n)[: len(x)] for c in range(2)], 1)
    return x + wet * y

def envelope(v, att=0.01, rel=0.25):
    e = np.abs(v).max(1)
    e = np.sqrt(lp(e ** 2, 20, 1).clip(0))
    out = np.empty_like(e); z = 0.0
    a_, r_ = np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR))
    for i in range(0, len(e), 48):                               # 1 ms steps
        x = e[i]; c = a_ ** 48 if x > z else r_ ** 48
        z = c * z + (1 - c) * x; out[i:i + 48] = z
    return out

if __name__ == "__main__":
    w = wave.open(sys.argv[1]); assert w.getframerate() == SR and w.getnchannels() == 2
    voice = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2).astype(np.float64) / 32768
    SRC_DUR = len(voice) / SR
    MAIN1 = MAIN0 + SRC_DUR; TOTAL = MAIN1 + OUTRO_D
    N = int(TOTAL * SR)
    M = lambda t: MAIN0 + t                                       # source seconds -> output seconds

    # voice: cold-open excerpt (with a touch of reverb) + full take
    v = np.zeros((N, 2))
    a, b = int(HOOK_SRC * SR), int((HOOK_SRC + HOOK_D - 0.05) * SR)
    hk = voice[a:b].copy(); f = np.linspace(0, 1, 960)[:, None]; hk[:960] *= f; hk[-2400:] *= np.linspace(1, 0, 2400)[:, None]
    hk = reverb(hk, 0.22, 1.2)
    v[: len(hk)] += hk
    i0 = int(MAIN0 * SR); v[i0:i0 + len(voice)] += voice[: N - i0]
    v[i0 + len(voice) - 4800: i0 + len(voice)] *= np.linspace(1, 0, 4800)[:, None]

    fx = np.zeros((N, 2))
    P = pop(); WH = whoosh(); WO = whoosh(0.4, up=False); IM = impact(); IMs = impact(1.0, 80)
    # --- cold open
    place(fx, drone(HOOK_D + 0.3, 41), 0.0, -17)
    for h in HB:
        if h >= HOOK_SRC: place(fx, heartbeat(), h - HOOK_SRC, -9)
    place(fx, riser(1.1), DEATH - HOOK_SRC - 1.1, -15)
    place(fx, boom(), DEATH - HOOK_SRC, -6); place(fx, glitchfx(0.3, 1), DEATH - HOOK_SRC, -16)
    place(fx, glitchfx(0.3, 2), HOOK_D - 0.28, -14)
    # --- title
    T0 = HOOK_D
    place(fx, whoosh(0.35), T0, -14); place(fx, IMs, T0 + 0.30, -11); place(fx, IM, T0 + 0.55, -8); place(fx, glitchfx(0.22, 3), T0 + 0.55, -18)
    for k in range(25): place(fx, tick(3000), T0 + 0.9 + k * 0.024, -26)
    place(fx, riser(0.8), T0 + 1.6, -15); place(fx, whoosh(0.5), T0 + 2.0, -12)
    place(fx, chime(1.0, 1568), T0 + 2.38, -20)
    # --- main
    place(fx, P, M(0.02), -16, 0.5)                                                   # wave
    place(fx, WH, M(0.70), -16, 0.7); place(fx, P, M(0.86), -18, 0.7)                 # name tag
    place(fx, P, M(2.10), -15, 0.6)                                                   # dev card
    for k in range(12): place(fx, tick(), M(2.35 + k * 0.12), -27, 0.6)
    place(fx, glitchfx(0.25, 4), M(3.84), -15, 0.5); place(fx, IMs, M(3.84), -12, 0.4)
    place(fx, WO, M(4.80), -18, 0.6)
    place(fx, P, M(5.20), -15, 0.6)                                                   # survival card
    place(fx, slash(), M(6.56), -13, 0.6); place(fx, slash(), M(6.68), -13, 0.6)
    place(fx, WH, M(6.95), -13, 0.8)
    place(fx, P, M(9.10), -15, 0.6); place(fx, tear(), M(9.58), -12, 0.6)             # calendar
    place(fx, chime(0.8, 1319), M(9.65), -19, 0.6); place(fx, shimmer(0.6, 8, 1), M(9.62), -20, 0.6)
    place(fx, WH, M(10.42), -18, -0.6); place(fx, chime(0.6, 1760), M(10.90), -24, -0.8)
    place(fx, P, M(11.10), -16, 0.6)                                                  # clock
    for k in range(23): place(fx, tick(2200 if k % 2 else 3000), M(11.2 + k * 0.083), -22, 0.6)
    place(fx, scratch(), M(13.00), -12); place(fx, P, M(13.10), -17, 0.4)            # "claramente"
    place(fx, P, M(14.90), -18, 0.3)
    for k in range(3): place(fx, blip(660 + 110 * k, 0.03), M(15.05 + k * 0.11), -28, 0.3)
    place(fx, siren(2.1), M(16.84), -24, 0.6)                                         # spoiler
    place(fx, WH, M(16.84), -14, -0.6); place(fx, WH, M(16.94), -14, 0.6); place(fx, IMs, M(16.90), -13)
    place(fx, shush(), M(17.62), -18, 0.3); place(fx, WO, M(18.65), -17)
    place(fx, WH, M(19.50), -17)                                                      # NPC unlock banner
    for k in range(22): place(fx, blip(988 if k % 2 else 784), M(19.62 + k * 0.034), -27)
    place(fx, chip([784, 1047, 1319, 1568]), M(20.40), -18)
    place(fx, P, M(19.78), -15, 0.6); place(fx, drone(1.6, 82), M(19.8), -27, 0.6)
    place(fx, glitchfx(0.25, 5), M(21.20), -17, 0.5)
    for k in range(5): place(fx, P, M(24.05 + k * 0.28), -24, 0.6)                   # hearts
    place(fx, chime(1.0, 1047), M(24.02), -21, 0.6)
    place(fx, clunk(), M(25.70), -13); place(fx, glitchfx(0.18, 6), M(25.74), -17)   # VHS
    place(fx, hiss(2.55), M(25.76), -31); place(fx, glitchfx(0.18, 7), M(28.26), -17)
    place(fx, whoosh(0.45), M(29.36), -21, -0.8)                                      # dashed line
    for k in range(10): place(fx, snip(), M(29.9 + k * 0.245), -17, -0.8 + 1.6 * k / 9)
    place(fx, slash(), M(CUT - 0.02), -10); place(fx, WH, M(CUT), -12); place(fx, IMs, M(CUT + 0.02), -12)
    place(fx, shimmer(1.0, 12, 2), M(33.45), -19, 0.6)                                # magic
    place(fx, shimmer(1.0, 18, 3), M(34.38), -14, 0.6); place(fx, chime(1.1, 1568), M(34.40), -17, 0.6)
    place(fx, whoosh(0.3), M(35.08), -12); place(fx, zap(), M(35.14), -17, 0.6)       # fast
    place(fx, alert(), M(36.88), -14, 0.5); place(fx, shimmer(0.6, 8, 4), M(36.88), -21, 0.5)
    place(fx, impact(0.8, 50), M(37.75), -20)                                         # spotlight
    place(fx, chip([523, 659, 784, 1047]), M(40.92), -18, 0.5)                        # nameplate
    place(fx, chime(0.7, 2093), M(43.34), -20, 0.5); place(fx, boing(), M(44.12), -19, 0.5)
    place(fx, WH, M(49.92), -16, 0.6); place(fx, P, M(50.05), -15, 0.6)               # character card
    place(fx, chip([659, 784, 988, 1319]), M(50.12), -18, 0.6)
    for k, tt in enumerate((51.80, 59.48, 62.68)):
        place(fx, chip([880 + 110 * k, 1175 + 147 * k], 0.05, 0.12), tt + MAIN0, -20, 0.6)
    place(fx, sweep_tone(2.9, 300, 900), M(53.64), -31, 0.6)
    # suspense + death
    place(fx, drone(3.4, 41), M(63.60), -15)
    for h in HB: place(fx, heartbeat(), M(h), -9)
    place(fx, riser(1.25), M(DEATH - 1.25), -14)
    place(fx, boom(), M(DEATH), -5); place(fx, glitchfx(0.35, 8), M(DEATH), -15)
    place(fx, chip([392, 330, 262, 196, 131], 0.09, 0.4, 0.5), M(DEATH + 0.05), -19, 0.6)
    place(fx, IM, M(67.30), -12, -0.5)                                                # plot twist stamp
    place(fx, WO, M(68.25), -18); place(fx, WO, M(68.45), -18, 0.6)
    for k, f_ in enumerate((1047, 1175, 1319, 1568, 1760)): place(fx, chime(0.7, f_), M(70.95 + k * 0.17), -20, 0.4 + 0.1 * k)
    place(fx, P, M(71.64), -13, 0.6); place(fx, crackle(), M(71.66), -16, 0.6); place(fx, impact(0.6, 90), M(71.64), -18)
    # outro
    place(fx, whoosh(0.6), MAIN1 - 0.1, -12); place(fx, IM, MAIN1 + 0.15, -9)
    place(fx, IMs, MAIN1 + 0.32, -13); place(fx, drone(OUTRO_D, 55), MAIN1, -20)
    fx = reverb(fx)

    # music: starts with the main section, tape-stops into the suspense, returns for the ending
    mus = np.zeros(N)
    raw = music(TOTAL - MAIN0 + 1)
    mus[int(MAIN0 * SR):] = raw[: N - int(MAIN0 * SR)]
    mus = wobble(mus, M(25.76), M(28.30))
    back = mus.copy()
    mus = tape_stop(mus, M(63.64))
    ret = np.clip((np.arange(N) / SR - M(68.35)) / 1.2, 0, 1)
    mus = mus + back * ret
    m_env = np.clip(np.arange(N) / SR - MAIN0, 0, 1) * np.clip((TOTAL - np.arange(N) / SR) / 1.0, 0, 1)
    duck = 1 - 0.55 * np.clip(envelope(v) / 0.12, 0, 1)
    mus = mus * m_env * duck * 10 ** (-17 / 20) / (np.abs(raw).max() + 1e-9) * 1.75
    mus2 = np.stack([mus, mus], 1)
    mus2[:, 0] = mus + 0.3 * np.roll(mus, 360); mus2[:, 1] = mus + 0.3 * np.roll(mus, 720)

    mix = v + fx + mus2 * 0.8
    if len(sys.argv) > 3:                                          # optional: dump stems for level checks
        for nm, st in (("voice", v), ("fx", fx), ("music", mus2 * 0.8)):
            o = wave.open(f"{sys.argv[3]}/{nm}.wav", "wb"); o.setnchannels(2); o.setsampwidth(2); o.setframerate(SR)
            o.writeframes((np.clip(st, -1, 1) * 32767).astype(np.int16).tobytes()); o.close()
    pk = np.max(np.abs(mix))
    m = np.abs(mix)
    mix = np.where(m > 0.75, np.sign(mix) * (0.75 + 0.22 * np.tanh((m - 0.75) / 0.22)), mix)
    out = wave.open(sys.argv[2], "wb"); out.setnchannels(2); out.setsampwidth(2); out.setframerate(SR)
    out.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes()); out.close()
    print("peak in", round(pk, 3), "total", round(TOTAL, 3))
