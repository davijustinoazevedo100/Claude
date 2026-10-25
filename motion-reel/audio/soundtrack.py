#!/usr/bin/env python3
"""Soundtrack for the motion reel, synthesised from nothing but numpy/scipy.

120 BPM in A minor. Every drum, chord, whoosh and impact is generated here and
placed on the same cue times the picture uses (see src/scenes/*), so the sound
design is locked to the animation frame by frame.

    python3 audio/soundtrack.py out/soundtrack.wav
"""
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
DUR = 48.0
N = int(SR * DUR)
BEAT = 0.5
BAR = 2.0
rng = np.random.default_rng(20261015)


def midi(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


def tt(n):
    return np.arange(n) / SR


# --------------------------------------------------------------------- filters
def _sos(kind, f, order=2):
    if kind == "band":
        return signal.butter(order, f, btype="bandpass", fs=SR, output="sos")
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")


def lp(x, f, order=2):
    return signal.sosfilt(_sos("low", min(f, SR * 0.45), order), x)


def hp(x, f, order=2):
    return signal.sosfilt(_sos("high", f, order), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos("band", [lo, min(hi, SR * 0.45)], order), x)


def sweep_bp(x, f0, f1, q=1.2, block=256, curve=1.0):
    """Band-pass whose centre glides from f0 to f1 (log space), block-wise."""
    y = np.zeros_like(x)
    nb = int(np.ceil(len(x) / block))
    zi = None
    for b in range(nb):
        u = (b / max(1, nb - 1)) ** curve
        fc = f0 * (f1 / f0) ** u
        lo, hi = fc / (1 + 0.5 / q), min(fc * (1 + 0.5 / q), SR * 0.45)
        sos = signal.butter(2, [lo, hi], btype="bandpass", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        seg = x[b * block:(b + 1) * block]
        out, zi = signal.sosfilt(sos, seg, zi=zi)
        y[b * block:b * block + len(seg)] = out
    return y


def sweep_lp(x, f0, f1, block=256, curve=1.0):
    y = np.zeros_like(x)
    nb = int(np.ceil(len(x) / block))
    zi = None
    for b in range(nb):
        u = (b / max(1, nb - 1)) ** curve
        fc = min(f0 * (f1 / f0) ** u, SR * 0.45)
        sos = signal.butter(2, fc, btype="low", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        seg = x[b * block:(b + 1) * block]
        out, zi = signal.sosfilt(sos, seg, zi=zi)
        y[b * block:b * block + len(seg)] = out
    return y


# --------------------------------------------------------------------- oscillators
def saw(freq, n, phase=0.0):
    """PolyBLEP band-limited sawtooth; freq may be scalar or per-sample."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,)).copy()
    dt = f / SR
    ph = (phase + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    u = ph[m] / dt[m]
    y[m] -= u + u - u * u - 1
    m = ph > 1 - dt
    u = (ph[m] - 1) / dt[m]
    y[m] -= u * u + u + u + 1
    return y


def sine(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return np.sin(phase + 2 * np.pi * np.cumsum(f) / SR)


def fades(x, a=0.002, r=0.01):
    n = len(x)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    x[:na] *= np.linspace(0, 1, na)
    x[-nr:] *= np.linspace(1, 0, nr)
    return x


# --------------------------------------------------------------------- mixer
class Bus:
    def __init__(self):
        self.x = np.zeros((2, N))

    def add(self, sig, t, gain=1.0, pan=0.0):
        sig = np.asarray(sig, dtype=float)
        if sig.ndim == 1:
            th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
            sig = np.stack([sig * np.cos(th), sig * np.sin(th)]) * np.sqrt(2)
        i0 = int(round(t * SR))
        a, b = max(0, i0), min(N, i0 + sig.shape[1])
        if b <= a:
            return
        self.x[:, a:b] += gain * sig[:, a - i0:b - i0]


drums, bass, music, sfx, send = Bus(), Bus(), Bus(), Bus(), Bus()


# --------------------------------------------------------------------- instruments
def kick(level=1.0):
    n = int(0.5 * SR)
    t = tt(n)
    f = 50 + 125 * np.exp(-t / 0.04)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    click = hp(rng.standard_normal(n), 2000) * np.exp(-t / 0.004)
    return fades(np.tanh(1.8 * (body + 0.18 * click)) * level, 0.0005, 0.05)


def clap():
    n = int(0.4 * SR)
    t = tt(n)
    e = np.zeros(n)
    for k, d in enumerate([0.0, 0.010, 0.021, 0.030]):
        i = int(d * SR)
        tau = 0.0055 if k < 3 else 0.13
        e[i:] += np.exp(-(t[i:] - d) / tau) * (0.75 if k < 3 else 1.0)
    nz = bp(rng.standard_normal(n), 900, 5200)
    body = np.sin(2 * np.pi * 210 * t) * np.exp(-t / 0.03) * 0.4
    return fades((nz * e + body) * 0.55, 0.0005, 0.05)


def hat(open_=False):
    n = int((0.5 if open_ else 0.09) * SR)
    t = tt(n)
    metal = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (317, 457, 593, 811, 1007, 1213))
    x = hp(rng.standard_normal(n) * 0.7 + metal * 0.12, 7200, 4)
    return fades(x * np.exp(-t / (0.2 if open_ else 0.028)) * 0.5, 0.0005, 0.02)


def crash(dur=2.4, bright=1.0):
    n = int(dur * SR)
    t = tt(n)
    out = []
    for _ in range(2):
        metal = sum(np.sign(np.sin(2 * np.pi * f * t + rng.random() * 6)) for f in (340, 513, 667, 791, 1123, 1517))
        x = hp(rng.standard_normal(n) + 0.15 * metal, 3200, 2)
        x = lp(x, 9000 + 5000 * bright)
        out.append(x * (np.exp(-t / 0.9) * 0.8 + 0.2 * np.exp(-t / 0.15)))
    return np.stack(out) * 0.35


def boom(dur=2.2, f0=70, f1=36, level=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.25)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    x += lp(rng.standard_normal(n), 180) * np.exp(-t / 0.12) * 0.8
    return fades(np.tanh(1.5 * x) * level, 0.001, 0.2)


def snare(pitch=1.0, level=1.0):
    n = int(0.22 * SR)
    t = tt(n)
    nz = bp(rng.standard_normal(n), 1500 * pitch, 8000) * np.exp(-t / 0.06)
    tone = np.sin(2 * np.pi * 185 * pitch * t) * np.exp(-t / 0.04)
    return fades((nz * 0.7 + tone * 0.5) * level, 0.0005, 0.03)


def pluck(m, dur=0.32, bright=1.0, wave_="saw"):
    n = int(dur * SR)
    t = tt(n)
    f = midi(m)
    x = saw(f, n) + 0.5 * saw(f * 1.004, n, 0.3) if wave_ == "saw" else np.sign(sine(f, n)) * 0.7
    dark = lp(x, 600)
    lit = lp(x, 2500 + 3500 * bright)
    y = dark + (lit - dark) * np.exp(-t / 0.05)
    return fades(y * np.exp(-t / 0.18) * 0.5, 0.001, 0.03)


def bell(m, dur=2.5, level=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = midi(m)
    y = (
        np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9)
        + 0.5 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.5)
        + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.25)
        + 0.12 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.08)
    )
    return fades(y * 0.35 * level, 0.001, 0.2)


def marimba(m, level=1.0):
    n = int(0.9 * SR)
    t = tt(n)
    f = midi(m)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.28) + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.05)
    y += 0.15 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.012)
    return fades(y * 0.5 * level, 0.0008, 0.1)


def pad(notes, dur, attack=0.35, release=0.8, cutoff=1700, level=1.0):
    n = int((dur + release) * SR)
    t = tt(n)
    L = np.zeros(n)
    R = np.zeros(n)
    for m in notes:
        f = midi(m)
        for d, side in ((-0.09, 0), (0.0, 0.5), (0.1, 1)):
            v = saw(f * 2 ** (d / 12), n, rng.random())
            L += v * (1 - side)
            R += v * side
    env = np.clip(t / attack, 0, 1) * np.clip((dur + release - t) / release, 0, 1)
    env = env ** 1.5
    L = lp(L, cutoff) * env
    R = lp(R, cutoff) * env
    return np.stack([L, R]) * (0.08 / np.sqrt(len(notes))) * level


def bass_note(m, dur, level=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = midi(m)
    x = saw(f, n) + 0.6 * saw(f * 1.003, n, 0.5)
    dark = lp(x, 260)
    lit = lp(x, 1400)
    y = dark + (lit - dark) * np.exp(-t / 0.07)
    sub = np.sin(2 * np.pi * f * t) * 0.7
    env = np.clip(t / 0.004, 0, 1) * np.clip((dur - t) / 0.02, 0, 1)
    return np.tanh(1.4 * (y * 0.55 + sub)) * env * 0.5 * level


def lead(m, dur, level=1.0):
    n = int((dur + 0.25) * SR)
    t = tt(n)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) / 0.2, 0, 1)
    f = midi(m) * vib
    x = saw(f, n) * 0.7 + saw(f * 1.006, n, 0.2) * 0.5 + 0.3 * np.sign(sine(f / 2, n))
    x = lp(x, 3200)
    env = np.clip(t / 0.01, 0, 1) * np.where(t < dur, 0.85 + 0.15 * np.exp(-t / 0.1), np.exp(-(t - dur) / 0.08))
    return fades(x * env * 0.22 * level, 0.001, 0.05)


# --------------------------------------------------------------------- sfx
def whoosh(dur, f0=300, f1=4000, peak=0.6, level=1.0, curve=1.0):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    x = sweep_bp(rng.standard_normal(n), f0, f1, q=1.1, curve=curve)
    env = np.where(t < peak, (t / peak) ** 2, ((1 - t) / (1 - peak)) ** 1.5)
    return fades(x * env * level * 0.9, 0.002, 0.02)


def riser(dur, f0=200, f1=5000, level=1.0):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    nz = sweep_bp(rng.standard_normal(n), f0 * 2, f1, q=0.9, curve=1.6)
    tone = saw(midi(45) * 2 ** (t * 2.5), n) * 0.12
    tone = lp(tone, 3000)
    env = t ** 2.4
    return fades((nz * 0.8 + tone) * env * level, 0.002, 0.01)


def reverse_crash(dur=1.0, level=1.0):
    c = crash(dur + 0.1)[:, : int(dur * SR)]
    c = c[:, ::-1] * np.linspace(0, 1, c.shape[1]) ** 1.5
    return c * level


def pop(f0=900, f1=280, dur=0.12, level=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.02)
    return fades(sine(f, n) * np.exp(-t / 0.05) * level * 0.6, 0.0005, 0.02)


def tick(f=3200, level=1.0):
    n = int(0.02 * SR)
    t = tt(n)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.003) + 0.3 * hp(rng.standard_normal(n), 4000) * np.exp(-t / 0.002)
    return fades(x * level * 0.4, 0.0002, 0.005)


def boing(f=170, dur=0.6, level=1.0):
    n = int(dur * SR)
    t = tt(n)
    fr = f * (1 + 0.35 * np.exp(-t * 6) * np.sin(2 * np.pi * 9 * t))
    return fades(sine(fr, n) * np.exp(-t / 0.22) * 0.5 * level, 0.001, 0.05)


def sparkle(bus, t0, t1, count, mlo=84, mhi=100, level=0.25, seed=0):
    r = np.random.default_rng(seed)
    for _ in range(count):
        t = t0 + r.random() * (t1 - t0)
        m = int(r.integers(mlo, mhi))
        bus.add(bell(m, 0.6, level * (0.4 + 0.6 * r.random())), t, pan=r.uniform(-0.8, 0.8))


# --------------------------------------------------------------------- score
# Pad voicing and bass root (A1, F1, C2, G1) for each chord.
CHORDS = {
    "Am": ([57, 60, 64, 67, 71], 33),
    "F": ([53, 57, 60, 64, 67], 29),
    "C": ([55, 60, 62, 64, 67], 36),
    "G": ([55, 59, 62, 64, 69], 31),
}
TIMELINE = (
    [(0, 4, "Am")]
    + [(4 + 2 * k, 6 + 2 * k, ["Am", "F", "C", "G"][k % 4]) for k in range(18)]
    + [(40, 42, "G")]
)
TIMELINE = [c for c in TIMELINE if c[0] < 40] + [(40, 42, "G")]


def chord_at(t):
    for a, b, c in TIMELINE:
        if a <= t < b:
            return c
    return "Am"


def in_spans(t, spans):
    return any(a <= t < b for a, b in spans)


KICK_SPANS = [(4.0, 10.0), (11.5, 22.0), (28.0, 40.0)]
HAT_SPANS = [(4.0, 22.0), (28.0, 40.0)]
BASS_SPANS = [(4.0, 22.0), (28.0, 40.0)]
ARP_SPANS = [(4.0, 40.0)]
kick_times = []

# Drums.
for b in range(int(DUR / BEAT)):
    t = b * BEAT
    if in_spans(t, KICK_SPANS):
        drums.add(kick(1.0), t, 0.95)
        kick_times.append(t)
        if b % 2 == 1:
            drums.add(clap(), t, 0.5, 0.05)
            send.add(clap(), t, 0.12)
    if in_spans(t, HAT_SPANS):
        drums.add(hat(), t + 0.25, 0.32, 0.3)
        if in_spans(t, [(16.0, 22.0), (28.0, 40.0)]):
            drums.add(hat(), t + 0.125, 0.12, -0.3)
            drums.add(hat(), t + 0.375, 0.12, -0.3)
        if b % 4 == 3 and in_spans(t, [(16.0, 22.0), (28.0, 34.0)]):
            drums.add(hat(True), t + 0.25, 0.22, 0.4)

# Snare roll build into the second drop, with a breath of silence before it.
roll = [(26.0, 27.0, 0.25), (27.0, 27.5, 0.125), (27.5, 27.875, 0.0625)]
for a, b_, step in roll:
    t = a
    while t < b_ - 1e-9:
        u = (t - 26.0) / 1.875
        drums.add(snare(1.0 + 0.6 * u, 0.25 + 0.65 * u), t, 0.6, 0.0)
        send.add(snare(1.0 + 0.6 * u, 0.25 + 0.65 * u), t, 0.15)
        t += step

# Bass: off-beat eighths on the chord root.
for b in range(int(DUR / BEAT)):
    t = b * BEAT
    if in_spans(t, BASS_SPANS):
        root = CHORDS[chord_at(t)][1]
        bass.add(bass_note(root, 0.22), t + 0.25, 0.75)
        if b % 4 == 0:
            bass.add(bass_note(root, 0.2, 0.8), t, 0.55)
# Low drone under the intro and the breakdown.
for a, b_, m, g in [(0.2, 4.0, 33, 0.18), (22.0, 28.0, 33, 0.14)]:
    n = int((b_ - a) * SR)
    x = sine(midi(m), n) * np.clip(tt(n) / 1.2, 0, 1) * np.clip((b_ - a - tt(n)) / 0.4, 0, 1)
    bass.add(x, a, g)

# Pads follow the chords; louder in the breakdown.
for a, b_, c in TIMELINE:
    notes = CHORDS[c][0]
    if a < 4:
        music.add(pad(notes, b_ - a - 0.2, attack=1.6, release=0.4, cutoff=900, level=0.8), a + 0.2)
        continue
    lvl = 1.5 if 22 <= a < 28 else 0.75
    cut = 2600 if 22 <= a < 28 else 1500
    p = pad(notes, b_ - a, attack=0.08, release=0.5, cutoff=cut, level=lvl)
    music.add(p, a)
    send.add(p, a, 0.5)

# 16th-note arpeggio, filtered down in the breakdown.
PATTERN = [0, 2, 4, 1, 3, 2, 4, 3]
for s in range(int(40.0 / 0.125)):
    t = s * 0.125
    if not in_spans(t, ARP_SPANS):
        continue
    notes = CHORDS[chord_at(t)][0]
    m = notes[PATTERN[s % 8]] + 12
    brk = 22 <= t < 28
    if 10.0 <= t < 11.5:
        continue
    bright = 0.3 if brk else (1.0 if t >= 28 else 0.7)
    g = 0.22 if brk else 0.3
    x = pluck(m, 0.3, bright)
    pan = 0.35 if s % 2 else -0.35
    music.add(x, t, g, pan)
    send.add(x, t, g * 0.5)
    # Ping-pong echo of every other note.
    if s % 2 == 0:
        music.add(x, t + 0.1875, g * 0.35, -pan)
        music.add(x, t + 0.375, g * 0.15, pan)

# Lead melody over the second drop.
MEL = [
    (0, 69, 0.5), (0.5, 72, 0.5), (1, 76, 1.0), (2, 74, 0.5), (2.5, 72, 0.5), (3, 76, 0.75), (3.75, 79, 0.25),
    (4, 81, 1.0), (5, 79, 0.5), (5.5, 76, 0.5), (6, 72, 1.0), (7, 74, 1.0),
    (8, 76, 0.5), (8.5, 79, 0.5), (9, 84, 1.0), (10, 83, 0.5), (10.5, 79, 0.5), (11, 76, 1.0),
]
for bt, m, d in MEL:
    x = lead(m, d * BEAT * 0.95)
    music.add(x, 28.0 + bt * BEAT, 0.85, 0.05)
    send.add(x, 28.0 + bt * BEAT, 0.35)
    music.add(x, 28.0 + bt * BEAT + 0.375, 0.25, -0.5)

# --------------------------------------------------------------------- sound design on cues
# 01 — PONTO
sfx.add(pop(950, 300, 0.14), 0.40, 0.55)
send.add(pop(950, 300, 0.14), 0.40, 0.3)
for i in range(26):
    if i % 2 == 0 or i > 20:
        sfx.add(tick(2600 + 200 * (i % 3), 0.5), 0.62 + i * 0.022, 0.35, (i / 25) * 0.6 - 0.3)
sfx.add(whoosh(0.5, 300, 1800, 0.5, 0.25), 1.6, 0.6)
sfx.add(boing(140, 0.35, 0.6), 2.0, 0.4)
for t, m in zip([2.5, 2.875, 3.125, 3.25], [64, 69, 72, 76]):
    sfx.add(marimba(m), t, 0.75)
    send.add(marimba(m), t, 0.35)
sfx.add(riser(0.27, 400, 3000, 0.5), 3.28, 0.6)
sfx.add(whoosh(0.45, 200, 6000, 0.85, 0.9, 1.4), 3.55, 0.8)
sfx.add(reverse_crash(0.45, 0.8), 3.55, 0.8)

# Impacts (shared by every drop): boom + crash, sent to the reverb.
for t, g in [(4.0, 1.0), (10.0, 0.55), (16.0, 0.75), (22.0, 0.9), (28.0, 1.25), (34.0, 0.6)]:
    sfx.add(boom(2.0, 72, 30, 1.0), t, 0.75 * g)
    sfx.add(crash(2.4), t, 0.8 * g)
    send.add(crash(2.4), t, 0.25 * g)

# 02 — TIPOGRAFIA
sfx.add(whoosh(0.4, 400, 3000, 0.5, 0.35), 4.04, 0.5, -0.2)
sfx.add(whoosh(0.3, 800, 5000, 0.6, 0.4), 4.34, 0.45, -0.5)
sfx.add(whoosh(0.3, 5000, 800, 0.4, 0.4), 4.68, 0.45, 0.5)
for i, t in enumerate([5.0, 5.06, 5.12, 5.2, 5.28, 5.3]):
    sfx.add(tick(3800 - i * 200, 0.6), t, 0.3, -0.4 + i * 0.16)
sfx.add(whoosh(0.34, 400, 4000, 0.8, 0.6, 1.3), 6.16, 0.55)
WORD_T = [6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5]
for k, t in enumerate(WORD_T):
    notes = CHORDS[chord_at(t)][0]
    stab = pad([m + 12 for m in notes[:4]], 0.16, attack=0.005, release=0.12, cutoff=4200, level=2.4)
    music.add(stab, t, 1.0)
    send.add(stab, t, 0.8)
    drums.add(clap(), t, 0.35)
sfx.add(boom(0.8, 90, 40, 0.8), 6.5, 0.45)                      # RITMO punch
for d in (0.0, 0.025, 0.05, 0.075, 0.1):
    sfx.add(tick(1800, 0.8), 7.0 + d, 0.4)                       # FORMA flips
sfx.add(whoosh(0.3, 6000, 600, 0.25, 0.6), 7.5, 0.55, 0.7)      # TEMPO slide in from the right
for d in range(8):
    sfx.add(bell(88 + (d * 5) % 12, 0.25, 0.5), 8.0 + d * 0.033, 0.3, (d % 2) * 1.2 - 0.6)  # COR
sfx.add(boom(0.6, 120, 50, 0.7), 8.5, 0.5)                       # PESO
sfx.add(whoosh(0.45, 300, 3000, 0.3, 0.5), 9.0, 0.35, -0.9)      # ESPAÇO, stereo spread
sfx.add(whoosh(0.45, 300, 3000, 0.3, 0.5), 9.0, 0.35, 0.9)
sfx.add(boing(220, 0.5, 0.6), 9.5, 0.45)                          # MOVIMENTO wave
for i in range(9):
    sfx.add(whoosh(0.18, 1200, 6000, 0.7, 0.35), 9.72 + i * 0.008, 0.25, 1 if i % 2 else -1)

# 03 — TIMING
sfx.add(whoosh(0.6, 300, 2500, 0.5, 0.35), 10.05, 0.4)
sfx.add(whoosh(0.5, 2500, 500, 0.5, 0.45), 10.8, 0.45, -0.6)
for k in range(5):
    sfx.add(tick(2400 + k * 300, 0.5), 10.9 + k * 0.07, 0.25)
    sfx.add(pop(700 + k * 120, 300 + k * 60, 0.1, 0.8), 1.25 + 10 + k * 0.04, 0.35, -0.5 + k * 0.25)
sfx.add(tick(3000, 0.7), 11.4, 0.4)
# The bounce row is audible: one knock per bounce of bounce.out.
for p, m in [(0.3636, 76), (0.7273, 74), (0.9091, 72), (1.0, 69)]:
    sfx.add(marimba(m, 0.9), 11.4 + p * 2.0, 0.45, 0.4)
sfx.add(boing(300, 0.7, 0.6), 11.4 + 0.364, 0.3, 0.2)              # spring overshoot peak
sparkle(sfx, 13.5, 13.9, 14, 88, 100, 0.35, seed=3)
sfx.add(whoosh(0.5, 3000, 400, 0.4, 0.4), 14.15, 0.4)
sfx.add(riser(1.0, 300, 3000, 0.6), 14.5, 0.45)
sfx.add(pop(500, 160, 0.25, 0.9), 15.3, 0.5)
sfx.add(boing(120, 0.6, 0.9), 15.42, 0.45)
sfx.add(whoosh(0.45, 300, 5000, 0.85, 0.8, 1.3), 15.55, 0.6)

# 04 — FORMA: each morph blips a rising chord tone.
for k, (t, m) in enumerate(zip([16.5, 17.0, 17.5, 18.0, 18.5, 19.0, 19.5], [72, 76, 79, 83, 84, 88, 91])):
    sfx.add(bell(m, 1.0, 0.8), t, 0.35, -0.4 + k * 0.13)
    send.add(bell(m, 1.0, 0.8), t, 0.25)
    sfx.add(whoosh(0.22, 900, 3500, 0.35, 0.3), t, 0.25)
sfx.add(whoosh(0.5, 500, 5000, 0.4, 0.5), 20.0, 0.45)
for k, m in enumerate([81, 84, 88, 91, 93, 96]):
    sfx.add(bell(m, 0.8, 0.6), 20.5 + k * 0.02, 0.22, -0.8 + k * 0.32)
sfx.add(whoosh(0.4, 5000, 600, 0.6, 0.45), 21.0, 0.4)
sfx.add(reverse_crash(0.55, 0.9), 21.42, 0.6)
sfx.add(whoosh(0.5, 4000, 150, 0.85, 0.6, 0.7), 21.45, 0.45)

# 05 — PARTÍCULAS
sfx.add(whoosh(0.9, 6000, 300, 0.08, 0.9), 22.0, 0.6)
sparkle(sfx, 22.1, 24.3, 40, 84, 98, 0.2, seed=5)
sfx.add(whoosh(2.0, 200, 1400, 0.5, 0.25, 1.0), 22.3, 0.35, -0.5)
sfx.add(riser(1.0, 300, 4000, 0.6), 24.3, 0.45)
sparkle(sfx, 24.3, 25.4, 32, 88, 100, 0.2, seed=6)
sfx.add(bell(69, 3.0, 0.8), 25.3, 0.35)
send.add(bell(69, 3.0, 0.8), 25.3, 0.5)
sfx.add(riser(1.85, 200, 7000, 1.0), 26.0, 0.5)
sfx.add(reverse_crash(0.4, 1.0), 27.55, 0.7)

# 06 — PROFUNDIDADE
sfx.add(whoosh(1.1, 5000, 400, 0.15, 0.7), 28.15, 0.45)
sfx.add(whoosh(0.8, 300, 3000, 0.5, 0.5), 30.55, 0.4, -0.4)
sfx.add(whoosh(1.0, 400, 2500, 0.6, 0.5), 31.95, 0.4, 0.4)
sfx.add(whoosh(0.45, 3000, 200, 0.7, 0.6), 33.15, 0.45)
sfx.add(whoosh(0.46, 300, 6000, 0.85, 0.8, 1.3), 33.5, 0.55)

# 07 — DADOS: the odometer ticks follow the count.
last = -1.0
prev = -1
for i in range(int(1.7 * 1000)):
    t = 34.15 + i / 1000
    u = min(1.0, (t - 34.15) / 1.55)
    v = 2880 * (1 - 2 ** (-10 * u)) if u < 1 else 2880
    tens = int(v // 10)
    if tens != prev and t - last >= 0.028:
        sfx.add(tick(2200 + 900 * (1 - u), 0.55), t, 0.3, -0.5)
        last = t
        prev = tens
for i in range(8):
    sfx.add(pop(500 + i * 90, 250 + i * 40, 0.1, 0.7), 34.35 + i * 0.07, 0.35, 0.3 + i * 0.07)
for i in range(4):
    sfx.add(tick(3000 + i * 400, 0.7), 35.2 + i * 0.08, 0.3, 0.5)
sfx.add(whoosh(1.2, 300, 1500, 0.5, 0.3), 34.9, 0.3, -0.7)
sfx.add(bell(84, 0.8, 0.7), 36.05, 0.3, -0.3)
sfx.add(whoosh(0.4, 3000, 400, 0.5, 0.4), 39.3, 0.4)
sfx.add(whoosh(0.34, 400, 3000, 0.8, 0.7), 39.66, 0.55)
sfx.add(boom(1.2, 60, 35, 0.6), 40.0, 0.45)

# 08 — ASSINATURA
sfx.add(whoosh(0.4, 300, 2500, 0.7, 0.4), 40.15, 0.4)
for k, (t, m) in enumerate([(40.58, 81), (40.62, 84), (40.69, 88), (40.76, 93)]):
    sfx.add(bell(m, 2.5, 0.9), t, 0.35, -0.3 + k * 0.2)
    send.add(bell(m, 2.5, 0.9), t, 0.4)
sfx.add(whoosh(0.6, 500, 3500, 0.5, 0.35), 41.1, 0.35)
# The final hit: a wide A minor 9 with sub, crash and a long tail.
final = [33, 45, 52, 57, 60, 64, 67, 71, 76]
fp = pad(final, 4.6, attack=0.01, release=1.2, cutoff=3000, level=3.2)
music.add(fp, 42.0, 1.0)
send.add(fp, 42.0, 0.9)
for m in (57, 64, 69, 72, 76):
    sfx.add(bell(m, 4.0, 0.7), 42.0, 0.3)
    send.add(bell(m, 4.0, 0.7), 42.0, 0.3)
sfx.add(boom(3.5, 68, 34, 1.0), 42.0, 0.8)
sfx.add(crash(3.2), 42.0, 0.9)
send.add(crash(3.2), 42.0, 0.4)
sfx.add(whoosh(0.75, 2000, 9000, 0.5, 0.25), 42.0, 0.3, 0.6)
sfx.add(reverse_crash(0.5, 0.5), 45.6, 0.45)
for k, m in enumerate([88, 84, 81]):
    sfx.add(bell(m, 1.2, 0.5), 46.45 + k * 0.06, 0.25, 0.3 - k * 0.3)
sfx.add(pop(1600, 900, 0.08, 0.8), 47.3, 0.45)
send.add(pop(1600, 900, 0.08, 0.8), 47.3, 0.4)

# --------------------------------------------------------------------- mix
# Sidechain: everything melodic ducks under the kick.
duck = np.ones(N)
t_all = tt(N)
for tk in kick_times:
    i0 = int(tk * SR)
    seg = t_all[i0:i0 + int(0.4 * SR)] - tk
    g = 1 - 0.55 * np.exp(-seg / 0.11) * (1 - np.exp(-seg / 0.003))
    duck[i0:i0 + len(seg)] = np.minimum(duck[i0:i0 + len(seg)], g)


def make_ir(dur=2.8, decay=0.62):
    n = int(dur * SR)
    t = tt(n)
    out = []
    for ch in range(2):
        x = rng.standard_normal(n)
        ir = lp(x, 3000) * np.exp(-t / decay) + 0.5 * hp(x, 3000) * np.exp(-t / (decay * 0.4))
        ir = np.concatenate([np.zeros(int(0.022 * SR)), ir])[:n]
        for d, g in [(0.011, 0.6), (0.017, 0.4), (0.029, 0.3), (0.043, 0.25)]:
            ir[int((d + ch * 0.0037) * SR)] += g * 6
        out.append(ir / np.sqrt(np.sum(ir ** 2)))
    return out


ir = make_ir()
wet = np.stack([signal.fftconvolve(send.x[c], ir[c])[:N] for c in range(2)])
wet = hp(wet, 180)

mix = drums.x * 0.8 + bass.x * duck * 0.7 + music.x * duck * 1.6 + sfx.x * 0.8 + wet * 0.6
# The breath of silence right before the second drop.
gap = np.ones(N)
a, b_ = int(27.875 * SR), int(28.0 * SR)
gap[a:b_] = np.linspace(1, 0.15, b_ - a) ** 2
mix *= gap
mix = signal.sosfilt(signal.butter(2, 28, "high", fs=SR, output="sos"), mix)
# Glue: gentle saturation, then peak normalise with headroom for the encoder.
mix = np.tanh(1.1 * mix / np.max(np.abs(mix))) / np.tanh(1.1)
end = np.ones(N)
end[-int(0.5 * SR):] = np.linspace(1, 0, int(0.5 * SR)) ** 2
mix *= end
mix = mix / np.max(np.abs(mix)) * 0.891  # -1 dBFS

out = sys.argv[1] if len(sys.argv) > 1 else "out/soundtrack.wav"
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
rms = 20 * np.log10(np.sqrt(np.mean(mix ** 2)) + 1e-12)
print(f"wrote {out}: {DUR:.1f}s, {SR} Hz stereo, RMS {rms:.1f} dBFS")
