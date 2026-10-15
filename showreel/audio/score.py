#!/usr/bin/env python3
"""Soundtrack + sound design for the reel, synthesized from scratch.

128 BPM, F minor, 32 beats = 15.000 s. The music (drums, bass, pads, plucks)
and every sound effect are generated with numpy/scipy; each effect is placed on
a cue that mirrors an on-screen event in src/scenes/*.js.

    python3 audio/score.py [out.wav]
"""
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
BPM = 128
BEAT = 60 / BPM
DUR = 15.0
N = int(SR * DUR)
TAIL = SR * 4
rng = np.random.default_rng(128)


def b(n):
    return n * BEAT


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


# ------------------------------------------------------------------ mixing

class Bus:
    def __init__(self):
        self.x = np.zeros((2, N + TAIL))

    def add(self, sig, t, gain=1.0, pan=0.0):
        """Mix mono/stereo `sig` at time t (s). `pan` may be a number or a per-sample array (-1..1)."""
        if sig.ndim == 1:
            a = (np.asarray(pan) + 1) * np.pi / 4
            st = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
        else:
            st = sig
        i = int(round(t * SR))
        if i < 0:
            st = st[:, -i:]
            i = 0
        n = min(st.shape[1], self.x.shape[1] - i)
        if n > 0:
            self.x[:, i:i + n] += st[:, :n] * gain


drums, bass, pads, keys, fx, verb_send, delay_send = (Bus() for _ in range(7))


# ------------------------------------------------------------------ dsp helpers

def sos(kind, fc, order=2):
    return signal.butter(order, fc, kind, fs=SR, output='sos')


def lp(x, fc, order=2):
    return signal.sosfilt(sos('lowpass', min(fc, SR * 0.45), order), x, axis=-1)


def hp(x, fc, order=2):
    return signal.sosfilt(sos('highpass', fc, order), x, axis=-1)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(sos('bandpass', [lo, min(hi, SR * 0.45)], order), x, axis=-1)


def tv_filter(x, fc, kind='lowpass', bw=1.0, block=128):
    """Time-varying Butterworth filter (cutoff per sample), block-wise with state carry."""
    y = np.zeros_like(x)
    zi = None
    for s in range(0, len(x), block):
        e = min(len(x), s + block)
        f = float(np.clip(fc[s], 25, SR * 0.44))
        if kind == 'bandpass':
            lo, hi = f / (1 + bw / 2), min(f * (1 + bw / 2), SR * 0.45)
            so = signal.butter(1, [lo, hi], 'bandpass', fs=SR, output='sos')
        else:
            so = signal.butter(2, f, kind, fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((so.shape[0], 2))
        y[s:e], zi = signal.sosfilt(so, x[s:e], zi=zi)
    return y


def phase(freq, n):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return np.cumsum(f) / SR


def polyblep(ph, dt):
    out = np.zeros_like(ph)
    m = ph < dt
    x = ph[m] / dt[m]
    out[m] = x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    out[m] = x * x + x + x + 1
    return out


def saw(freq, dur, ph0=0.0):
    n = int(dur * SR)
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    ph = (ph0 + np.cumsum(dt)) % 1.0
    return 2 * ph - 1 - polyblep(ph, dt)


def sine(freq, dur, ph0=0.0):
    n = int(dur * SR)
    return np.sin(2 * np.pi * (phase(freq, n) + ph0))


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def env_exp(dur, tau, attack=0.002):
    t = tt(dur)
    return np.exp(-t / tau) * (1 - np.exp(-t / max(attack, 1e-5)))


def fade(x, fin=0.003, fout=0.01):
    n = x.shape[-1]
    a, c = int(fin * SR), int(fout * SR)
    w = np.ones(n)
    if a:
        w[:a] = np.linspace(0, 1, a)
    if c:
        w[-c:] *= np.linspace(1, 0, c)
    return x * w


# ------------------------------------------------------------------ instruments

def kick(big=False):
    dur = 1.4 if big else 0.5
    t = tt(dur)
    f = 50 + (190 if big else 150) * np.exp(-t / (0.05 if big else 0.03))
    body = np.sin(2 * np.pi * phase(f, len(t))) * np.exp(-t / (0.55 if big else 0.21))
    click = hp(noise(dur), 2500) * np.exp(-t / 0.0035) * 0.35
    x = np.tanh(1.8 * (body + click)) * 0.95
    return fade(x, 0.0005, 0.02)


def clap():
    dur = 0.7
    t = tt(dur)
    e = np.zeros_like(t)
    for off in (0.0, 0.010, 0.021):
        e += (t >= off) * np.exp(-np.clip(t - off, 0, None) / 0.0065)
    e += (t >= 0.028) * np.exp(-np.clip(t - 0.028, 0, None) / 0.16) * 0.55
    return fade(bp(noise(dur), 850, 5200) * e * 1.1)


METAL = np.array([1, 1.3419, 1.7616, 2.1564, 2.6253, 3.0743]) * 3250


def metallic(dur):
    t = tt(dur)
    x = sum(np.sign(np.sin(2 * np.pi * f * t + rng.random() * 6)) for f in METAL) / 6
    return x


def hat(open_=False, vel=1.0):
    dur = 0.45 if open_ else 0.09
    tau = 0.15 if open_ else 0.021
    x = hp(noise(dur) * 0.7 + metallic(dur) * 0.6, 7000, 3) * env_exp(dur, tau, 0.0004)
    return fade(x * vel)


def crash(dur=2.4, tau=0.95):
    x = hp(noise(dur) * 0.8 + metallic(dur) * 0.45, 4200, 2) * env_exp(dur, tau, 0.001)
    return fade(lp(x, 13000))


def bass_note(m, dur):
    f = midi(m)
    t = tt(dur)
    s = saw(f, dur) * 0.55 + saw(f * 1.004, dur, 0.3) * 0.45
    fc = 220 + 1900 * np.exp(-t / 0.055)
    x = tv_filter(s, fc) * 0.9 + np.sin(2 * np.pi * f * t) * 0.75
    e = np.minimum(1, t / 0.003) * (0.55 + 0.45 * np.exp(-t / 0.07))
    return fade(np.tanh(1.4 * x * e) * 0.9, 0.001, 0.025)


def supersaw(notes, dur, fc=2400, voices=5, cents=16, attack=0.04, release=0.35, width=0.75, fc_curve=None):
    n = int(dur * SR)
    out = np.zeros((2, n))
    for m in notes:
        for v in range(voices):
            k = (v - (voices - 1) / 2) / ((voices - 1) / 2)
            f = midi(m) * 2 ** (k * cents / 1200)
            x = saw(f, dur, rng.random())
            a = (k * width + 1) * np.pi / 4
            out[0] += x * np.cos(a)
            out[1] += x * np.sin(a)
    out /= np.sqrt(len(notes) * voices)
    if fc_curve is not None:
        out = np.vstack([tv_filter(out[0], fc_curve), tv_filter(out[1], fc_curve)])
    else:
        out = lp(out, fc, 2)
    t = np.arange(n) / SR
    e = np.minimum(1, t / attack) * np.clip((dur - t) / release, 0, 1)
    return out * e


def stab(notes, dur=0.42, bright=5200):
    t = tt(dur)
    fc = 500 + bright * np.exp(-t / 0.07)
    x = supersaw(notes, dur, voices=5, cents=20, attack=0.002, release=0.12, fc_curve=fc)
    return x * np.exp(-t / 0.22)


def pluck(f, dur=0.6, ratio=2.0, index=2.2, tau=0.26):
    t = tt(dur)
    mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t / 0.07)
    return fade(np.sin(2 * np.pi * f * t + mod) * env_exp(dur, tau, 0.001))


def bell(f, dur=1.6):
    t = tt(dur)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 1.6 * np.exp(-t / 0.5)
    return fade(np.sin(2 * np.pi * f * t + mod) * env_exp(dur, 0.55, 0.001))


def marimba(f, dur=0.5):
    t = tt(dur)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.22) + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.03)
    x += 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.008)
    return fade(x * (1 - np.exp(-t / 0.0008)))


def bloop(f0, dur=0.32, drop=1.3):
    t = tt(dur)
    f = f0 * (1 + drop * np.exp(-t / 0.022))
    x = np.sin(2 * np.pi * phase(f, len(t))) * env_exp(dur, 0.11, 0.0015)
    x += np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.045) * 0.45
    return fade(x)


def bubble(f0, dur=0.16, up=True):
    t = tt(dur)
    f = f0 * (1 + (1.4 if up else -0.45) * (1 - np.exp(-t / 0.035)))
    return fade(np.sin(2 * np.pi * phase(f, len(t))) * env_exp(dur, 0.05, 0.002))


def click(f=3200, vel=1.0):
    t = tt(0.03)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.0018) + hp(noise(0.03), 3000) * np.exp(-t / 0.0012) * 0.5
    return fade(x * vel, 0, 0.005)


def thock(f=380):
    t = tt(0.09)
    return fade(np.sin(2 * np.pi * phase(f * (1 - 0.25 * (1 - np.exp(-t / 0.02))), len(t))) * np.exp(-t / 0.025))


def flap():
    t = tt(0.035)
    x = bp(noise(0.035), 1200, 4200) * np.exp(-t / 0.004) + np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.006) * 0.4
    return fade(x, 0, 0.004)


def clack(f):
    t = tt(0.08)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.018) + bp(noise(0.08), 1500, 6000) * np.exp(-t / 0.003) * 0.6
    return fade(x)


def chirp(f, dur=0.014):
    t = tt(dur)
    return fade(np.sign(np.sin(2 * np.pi * f * t)) * 0.5 * np.exp(-t / 0.006), 0.0005, 0.003)


def whoosh(dur, f0, f1, pan0=0.0, pan1=0.0, shape='bell', bw=1.2, peak=0.5):
    t = tt(dur)
    u = t / dur
    fc = f0 * (f1 / f0) ** u
    x = tv_filter(noise(dur), fc, 'bandpass', bw)
    if shape == 'bell':
        e = np.where(u < peak, (u / peak) ** 2, ((1 - u) / (1 - peak)) ** 1.6)
    elif shape == 'rise':
        e = u ** 2.2
    else:  # fall
        e = (1 - u) ** 2
    pan = pan0 + (pan1 - pan0) * u
    return x * e, pan


def riser(dur, f0=180, f1=1400):
    t = tt(dur)
    u = t / dur
    f = f0 * (f1 / f0) ** (u ** 1.5)
    s = saw(f, dur) + saw(f * 1.5, dur, 0.3) * 0.5 + saw(f * 2.01, dur, 0.6) * 0.3
    s = tv_filter(s, 400 + 6000 * u ** 2)
    nz = tv_filter(noise(dur), 800 + 9000 * u ** 1.5, 'highpass')
    return (s * 0.35 + nz * 0.6) * u ** 2.4


def boom(dur=2.2):
    t = tt(dur)
    f = 30 + 52 * np.exp(-t / 0.28)
    x = np.sin(2 * np.pi * phase(f, len(t))) * np.exp(-t / 0.75)
    x += lp(noise(dur), 260) * np.exp(-t / 0.09) * 1.2
    return fade(np.tanh(1.5 * x), 0.0008, 0.05)


def wobble(dur=0.45, f=87.3):
    t = tt(dur)
    s = saw(f, dur) + saw(f * 2.003, dur, 0.4) * 0.6
    fc = 300 + 2600 * np.sin(np.pi * t / dur) ** 2 * (0.6 + 0.4 * np.sin(2 * np.pi * t * 9))
    return tv_filter(s, fc) * np.sin(np.pi * t / dur) ** 0.8


# ------------------------------------------------------------------ harmony

CH = {
    'Eb': [51, 55, 58, 65],          # Eb add9 (sus feel)
    'Fm': [53, 56, 60, 63, 67],      # Fm9
    'Db': [49, 53, 56, 60, 63],      # Dbmaj9
    'Ab': [51, 56, 58, 60, 63],      # Ab add9 / Eb
}
ROOT = {'Eb': 39, 'Fm': 41, 'Db': 37, 'Ab': 44}
PROG = [(0, 4, 'Eb'), (4, 8, 'Fm'), (8, 12, 'Db'), (12, 16, 'Ab'), (16, 20, 'Eb'),
        (20, 24, 'Fm'), (24, 26, 'Db'), (26, 28, 'Eb'), (28, 32, 'Fm')]
PENTA = [65, 68, 70, 72, 75, 77, 80, 82, 84, 87, 89]  # F minor pentatonic, F4 up


def chord_at(beat):
    for a, c, name in PROG:
        if a <= beat < c:
            return name
    return 'Fm'


# ------------------------------------------------------------------ the arrangement

def music():
    # intro pad (bar 1): filtered, swelling, no pump
    d = b(4) + 0.3
    fcc = 500 + 1300 * (tt(d) / d) ** 1.5
    pads.add(supersaw(CH['Eb'], d, attack=1.2, release=0.4, fc_curve=fcc), 0, 0.5)
    # riser + reverse crash into the drop
    fx.add(riser(b(1.6), 160, 1100), b(2.4), 0.55)
    rc = crash(1.2, 0.5)[::-1]
    fx.add(rc * np.linspace(0, 1, len(rc)) ** 2, b(4) - len(rc) / SR, 0.5, 0.0)

    # drums
    for k in range(4, 28):
        drums.add(kick(), b(k), 0.95)
    for k in range(5, 28, 2):
        drums.add(clap(), b(k), 0.5)
        verb_send.add(clap(), b(k), 0.18)
    for k in range(4, 28):
        if k + 0.5 >= 27.5:
            break
        op = k % 2 == 1
        drums.add(hat(open_=op, vel=0.9 if op else 0.75), b(k + 0.5), 0.28, 0.15)
        if k >= 16:
            for sub, v in ((0.25, 0.35), (0.75, 0.5)):
                drums.add(hat(vel=v), b(k + sub), 0.26, -0.2)
    for at in (b(4), b(12), b(20)):
        drums.add(crash(), at, 0.32, 0.25)

    # bass: offbeat 8ths on the chord root
    for k in range(4, 28):
        if k + 0.5 >= 27.5:
            break
        r = ROOT[chord_at(k)]
        bass.add(bass_note(r, b(0.42)), b(k + 0.5), 0.5)
        if k % 4 == 0:
            bass.add(np.sin(2 * np.pi * midi(r - 12) * tt(b(0.9))) * env_exp(b(0.9), 0.3, 0.004), b(k), 0.16)

    # pads per chord, pumped later by the sidechain
    for a, c, name in PROG[1:-1]:
        d = b(c - a) + 0.25
        pads.add(supersaw(CH[name], d, fc=2600 if a < 16 else 3400, attack=0.02, release=0.25), b(a), 0.42)

    # stabs on the big typographic hits
    for at, name, g in ((4, 'Fm', 0.5), (5, 'Fm', 0.55), (8, 'Db', 0.35), (14, 'Ab', 0.3), (18, 'Eb', 0.3)):
        st = stab([m + 12 for m in CH[name]])
        keys.add(st, b(at), g)
        verb_send.add(st, b(at), 0.12)

    # pluck arpeggios: shapes (bars 3-4) and UI (bars 5-6)
    for k16 in range(10 * 4, 14 * 4):
        beat = k16 / 4
        notes = CH[chord_at(beat)]
        m = notes[[0, 2, 4, 1, 3, 4, 2, 1][k16 % 8] % len(notes)] + 12
        p = pluck(midi(m), 0.4, 2.0, 1.6, 0.14)
        keys.add(p, b(beat), 0.14, 0.35 * np.sin(k16))
        delay_send.add(p, b(beat), 0.05)
    for k8 in range(18 * 2, 22 * 2):
        beat = k8 / 2
        notes = CH[chord_at(beat)]
        m = notes[(k8 * 3) % len(notes)] + 24
        p = bell(midi(m), 0.9)
        keys.add(p, b(beat), 0.06, 0.4 * np.cos(k8))
        delay_send.add(p, b(beat), 0.05)

    # implosion riser (particles) and the dive riser (recap)
    fx.add(riser(b(25) - b(23.7), 120, 900), b(23.7), 0.4)
    rv = crash(1.0, 0.45)[::-1]
    fx.add(rv * np.linspace(0, 1, len(rv)) ** 2, b(25) - len(rv) / SR, 0.45)
    fx.add(riser(b(28) - b(26.4), 200, 2200), b(26.4), 0.6)
    # snare roll accelerating into the drop (stops for the breath at 27.5)
    t_ = b(26)
    step = b(0.25)
    while t_ < b(27.5) - 1e-6:
        g = 0.12 + 0.3 * (t_ - b(26)) / (b(27.5) - b(26))
        drums.add(clap(), t_, g)
        t_ += step
        if t_ > b(27):
            step = b(0.125)

    # the final chord (beat 28) rings out under the end card
    d = DUR - b(28) + 0.2
    tail = supersaw(CH['Fm'] + [72, 79], d, fc=4200, attack=0.004, release=0.6)
    tail *= np.exp(-tt(d) / 1.6)
    pads.add(tail, b(28), 0.55)
    verb_send.add(tail, b(28), 0.25)
    bass.add(np.sin(2 * np.pi * midi(41) * tt(2.0)) * env_exp(2.0, 0.8, 0.003), b(28), 0.35)
    # end-card arpeggio
    for k, m in enumerate([77, 80, 84, 87, 89, 84, 80, 87, 91, 89, 84]):
        at = b(28.5 + k * 0.25)
        if at > DUR - 0.3:
            break
        p = pluck(midi(m), 0.7, 3.0, 1.2, 0.3)
        keys.add(p, at, 0.12 * (1 - k / 14), 0.5 * np.sin(k * 1.7))
        delay_send.add(p, at, 0.08)


def sound_design():
    def place(sig, at, gain, pan=0.0, verb=0.0, dly=0.0):
        fx.add(sig, at, gain, pan)
        if verb:
            verb_send.add(sig, at, gain * verb, pan)
        if dly:
            delay_send.add(sig, at, gain * dly, pan)

    # ---- 01 squash & stretch
    w, p = whoosh(0.5, 500, 1800, -0.9, -0.2, 'bell', 1.0, 0.75)
    place(w, 0.0, 0.25, p)
    for k, (c, x, m, g) in enumerate(zip([1, 2, 2.5, 2.75, 2.875], [560, 820, 912, 948, 960], [65, 68, 72, 75, 77], [1, .8, .6, .45, .35])):
        place(bloop(midi(m)), b(c) - 0.005, 0.5 * g, (x - 960) / 960, 0.25)
    for at, x in ((b(1) - 0.02, 440), (b(1) + 0.07, 720), (b(1.38), 720), (b(2.4), 880), (b(3.02), 1110)):
        place(click(2600, 0.6), at, 0.18, (x - 960) / 960 * 0.8, 0.2)
    # anticipation stretch, then the leap toward camera
    d = b(3.5) - b(3.15)
    tone = np.sin(2 * np.pi * phase(np.linspace(220, 330, int(d * SR)), int(d * SR)))
    place(tone * np.linspace(0, 1, len(tone)) ** 1.5, b(3.15), 0.07, 0, 0.2)
    w, p = whoosh(b(4) - b(3.45), 250, 3500, 0, 0, 'rise', 1.4)
    place(w, b(3.45), 0.45, p)

    # ---- 02 kinetic type
    place(boom(1.6), b(4), 0.4)
    for n, m in enumerate([72, 75, 77, 80, 84, 87]):
        place(pluck(midi(m + 12), 0.3, 2.0, 0.8, 0.08), b(4) + n * 0.032, 0.08, -0.3 + n * 0.12, 0.3)
    w, p = whoosh(0.35, 600, 2400, 0, 0, 'bell', 1.0)
    place(w, b(4.75), 0.18, p)
    place(wobble(0.5, midi(41)), b(5), 0.28, 0, 0.15)
    place(wobble(b(1.05), midi(53)), b(6), 0.16, 0, 0.2)
    for k in (-3, -2, -1, 1, 2, 3):
        w, p = whoosh(0.38, 400 + 120 * abs(k), 2200, 0, np.sign(k) * 0.6, 'bell', 1.2, 0.35)
        place(w, b(7) + 0.035 * abs(k), 0.07, p)
    w, p = whoosh(b(7.9) - b(7.35), 300, 4000, -0.7, 0.7, 'bell', 1.0, 0.6)
    place(w, b(7.35), 0.3, p)
    for j in range(9):
        place(click(1800 + 140 * j, 0.9), b(7.4) + j * 0.012 + 0.16, 0.16, 0.8 if j % 2 == 0 else -0.8)
    for n, m in enumerate([65, 67, 68, 70, 72, 73, 75, 77]):
        place(pluck(midi(m + 12), 0.55, 2.0, 1.0, 0.18), b(8) + n * 0.028, 0.12, -0.5 + n * 0.14, 0.4)
    place(bloop(midi(77)), b(8.5), 0.4, 0.4, 0.3)
    place(bloop(midi(84), 0.22), b(8.75), 0.22, 0.4, 0.3)
    for k in range(14):
        place(chirp(2400 + 900 * rng.random()), b(8.7) + k * 0.028, 0.035, 0.0, 0.1)
    for n, m in enumerate([89, 87, 84, 82, 80, 77, 75, 72]):
        place(pluck(midi(m), 0.4, 2.0, 0.7, 0.12), b(9.25) + n * 0.028, 0.07, -0.5 + n * 0.14, 0.4)
    w, p = whoosh(0.5, 2500, 300, 0, 0, 'bell', 1.0, 0.3)
    place(w, b(9.3), 0.12, p)
    # ---- 03 shape systems: tiles pop out radially from the dot
    for k in range(18):
        at = b(9.85) + 0.012 + k * 0.0075 + 0.02 * rng.random()
        place(marimba(midi(PENTA[rng.integers(0, 8)] + 12)), at, 0.1, rng.uniform(-0.8, 0.8), 0.25)
    for k in range(12):
        place(clack(1400 + 90 * k), b(11) + k * 0.024 + 0.12, 0.13, -0.8 + 0.14 * k, 0.12)
    place(wobble(0.42, midi(56)), b(12), 0.2, 0, 0.2)
    w, p = whoosh(0.4, 900, 2600, 0, 0, 'bell', 0.8)
    place(w, b(12), 0.12, p)
    for k in range(12):
        place(flap(), b(12.5) + k * 0.028 + 0.14, 0.22, 0.8 - 0.14 * k)
    for pan0 in (-0.8, 0.8):
        w, p = whoosh(0.42, 350, 1800, pan0, -pan0, 'bell', 1.1, 0.45)
        place(w, b(13), 0.16, p)
    w, p = whoosh(b(14) - b(13.3), 300, 5000, 0, 0, 'rise', 1.0)
    place(w, b(13.3), 0.3, p)

    # ---- 04 3D: the circle gains a body
    place(boom(1.8), b(14), 0.24)
    for m in (77, 84, 89, 96):
        place(bell(midi(m), 2.2), b(14) + 0.02, 0.05, rng.uniform(-0.5, 0.5), 0.6)
    for i, (m, x) in enumerate(zip([68, 72, 75, 80, 84], [-1, 1, 0.35, -0.45, 0.85])):
        place(bubble(midi(m)), b(14.5) + i * 0.045, 0.22, x * 0.7, 0.35)
    for k in (15, 16, 17):
        place(bell(midi([84, 87, 89][k - 15]), 1.4), b(k), 0.045, [-0.5, 0.5, 0][k - 15], 0.6, 0.3)
    w, p = whoosh(b(17.5) - b(14.6), 200, 900, -0.6, 0.6, 'bell', 0.9, 0.5)
    place(w, b(14.6), 0.08, p)
    for i, m in enumerate([84, 80, 77, 75, 72]):
        place(bubble(midi(m), 0.14, up=False), b(17.0) + i * 0.06, 0.16, rng.uniform(-0.6, 0.6), 0.3)
    w, p = whoosh(b(18) - b(17.5), 400, 6000, 0, 0.3, 'rise', 1.0)
    place(w, b(17.5), 0.3, p)
    place(bloop(midi(84), 0.2, 0.8), b(18) - 0.004, 0.3, 0.17, 0.2)

    # ---- 05 UI motion
    for dd, x in zip([0, 0.06, 0.1, 0.14, 0.18, 0.22], [1010, 1460, 1010, 510, 1460, 510]):
        place(bubble(1300 + 600 * dd, 0.09), b(18.12) + dd + 0.05, 0.1, (x - 960) / 960 * 0.8, 0.15)
    place(click(3000), b(19.0), 0.35, 0.17, 0.1)
    place(thock(420), b(19.0) + 0.02, 0.3, 0.17)
    place(click(3600, 0.7), b(19.0) + 0.09, 0.22, 0.2)
    place(click(2800), b(19.78), 0.3, -0.05)
    for fps in range(13, 61):
        # detent ticks while the frame-rate slider is dragged 12 -> 60 fps
        u = (fps - 12) / 48
        v = np.arccos(1 - 2 * u) / np.pi  # invert the in-out curve (approx.)
        place(click(1800 + 30 * fps, 0.4), b(19.75) + v * (b(20.3) - b(19.75)), 0.06, -0.1 + u * 0.35)
    w, p = whoosh(0.4, 700, 2500, 1.0, 0.6, 'bell', 1.0, 0.35)
    place(w, b(20.6), 0.12, p)
    place(bell(midi(84), 1.2), b(20.85), 0.09, 0.6, 0.4)
    place(bell(midi(89), 1.2), b(20.85) + 0.09, 0.09, 0.6, 0.4)
    place(click(2900), b(21.0), 0.32, 0.55)
    for k in range(4):
        place(bloop(midi(89), 0.15, 0.7), b(21.0 + 0.5 * k) + 0.002, 0.07, 0.55)

    # ---- 06 generative: disintegration grains follow the wavefront left -> right
    for g in range(420):
        xg = rng.random()
        at = b(22) + 0.6 * xg + 0.09 * rng.random()
        f = 2000 + 7000 * rng.random()
        d = 0.006 + 0.012 * rng.random()
        grain = bp(noise(d + 0.01), f * 0.8, f * 1.25)[: int(d * SR)] * np.hanning(int(d * SR))
        place(grain, at, 0.05, xg * 1.6 - 0.8, 0.3)
    w, p = whoosh(0.9, 400, 3000, -0.8, 0.8, 'bell', 1.4, 0.45)
    place(w, b(22), 0.16, p)
    w, p = whoosh(b(24) - b(22.6), 250, 1200, 0.6, -0.6, 'bell', 1.6, 0.5)
    place(w, b(22.6), 0.12, p)
    # implosion flash
    place(boom(1.4), b(25), 0.22)
    place(crash(1.8, 0.7), b(25), 0.25, 0, 0.3)
    for m in (89, 96, 101):
        place(bell(midi(m), 1.5), b(25) + 0.01, 0.04, rng.uniform(-0.6, 0.6), 0.7)

    # ---- 07 recap: tile pops on 32nds, rising
    for k, m in enumerate([77, 80, 82, 84, 87, 89, 92, 94]):
        place(pluck(midi(m), 0.35, 1.0, 0.5, 0.09), b(25.125 + k * 0.125) + 0.03, 0.12, rng.uniform(-0.6, 0.6), 0.25)
        place(click(2600 + 120 * k, 0.6), b(25.125 + k * 0.125) + 0.02, 0.06)
    for k in range(10):
        place(chirp(2000 + 1500 * rng.random()), b(25.3) + k * 0.045, 0.02, rng.uniform(-0.7, 0.7))
    w, p = whoosh(b(27.55) - b(26.95), 2800, 300, 0, 0, 'bell', 1.2, 0.7)
    place(w, b(26.95), 0.18, p)
    d = b(27.98) - b(27.55)
    tone = np.sin(2 * np.pi * phase(np.linspace(196, 330, int(d * SR)), int(d * SR)))
    place(tone * np.linspace(0, 1, len(tone)) ** 1.5, b(27.55), 0.06, 0, 0.2)

    # ---- 08 hello
    place(kick(big=True), b(28), 0.9)
    place(boom(2.6), b(28), 0.48)
    place(crash(3.0, 1.3), b(28), 0.4, 0, 0.35)
    w, p = whoosh(0.7, 3000, 300, 0, 0, 'fall', 1.5)
    place(w, b(28), 0.22, p)
    for i in range(6):
        place(bubble(midi(72 + [0, 3, 5, 7, 10, 12][i]), 0.1), b(28) + 0.02 + i * 0.04, 0.15, (i - 2.5) * -0.15, 0.3)
    for k in range(26):
        place(pluck(midi(PENTA[rng.integers(4, 11)] + 12), 0.25, 3.0, 0.6, 0.06), b(28) + 0.03 + 0.5 * rng.random() ** 1.6, 0.05, rng.uniform(-0.9, 0.9), 0.5)
    for k in range(22):
        place(chirp(2200 + 1600 * rng.random(), 0.012), b(28.55) + k * 0.034, 0.03, rng.uniform(-0.3, 0.3))
    for k in range(26):
        place(chirp(2600 + 1600 * rng.random(), 0.01), b(29.1) + k * 0.02, 0.018, rng.uniform(-0.3, 0.3))
    place(click(2200, 0.6), b(28.7), 0.08, 0, 0.3)
    place(bloop(midi(77)), b(30) - 0.004, 0.35, 0.47, 0.35)
    place(bloop(midi(84), 0.22), b(30.5) - 0.004, 0.18, 0.47, 0.35)


# ------------------------------------------------------------------ render

def sidechain_curve():
    t = np.arange(N + TAIL) / SR
    g = np.ones_like(t)
    for k in range(4, 28):
        u = t - b(k)
        m = (u >= 0) & (u < BEAT)
        g[m] = np.minimum(g[m], 1 - 0.72 * np.exp(-u[m] / 0.11))
    # the breath before the final hit: everything musical drops out
    m = (t >= b(27.5)) & (t < b(28))
    g[m] = 0.0
    return g


def make_ir(rt60=2.0, dur=2.8, seed=3):
    r = np.random.default_rng(seed)
    t = tt(dur)
    ir = r.standard_normal((2, len(t)))
    low = lp(ir, 3000)
    ir = low * np.exp(-6.91 * t / rt60) + (ir - low) * np.exp(-6.91 * t / (rt60 * 0.3))
    ir[:, : int(0.014 * SR)] = 0
    for k, (d, g) in enumerate([(0.011, 0.6), (0.017, 0.5), (0.023, 0.42), (0.031, 0.35), (0.041, 0.3), (0.053, 0.24)]):
        ir[k % 2, int(d * SR)] += g * 8
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
    return ir


def render(out_path):
    music()
    sound_design()
    sc = sidechain_curve()
    for bus in (bass, pads):
        bus.x *= sc
    keys.x *= np.where((np.arange(N + TAIL) / SR >= b(27.5)) & (np.arange(N + TAIL) / SR < b(28)), 0.0, 1.0)
    drums.x = np.tanh(drums.x * 1.1) / 1.1
    # sends
    ir = make_ir()
    v = verb_send.x
    wet = np.vstack([signal.fftconvolve(v[0], ir[0])[: v.shape[1]], signal.fftconvolve(v[1], ir[1])[: v.shape[1]]])
    wet = hp(wet, 180)
    dl = np.zeros_like(delay_send.x)
    d = int(b(0.75) * SR)
    for k in range(1, 6):
        src = delay_send.x * (0.42 ** k)
        ch = (k + 1) % 2
        dl[ch, k * d:] += src[0, : dl.shape[1] - k * d] * 0.5 + src[1, : dl.shape[1] - k * d] * 0.5
    dl = lp(hp(dl, 300), 6000)
    mix = drums.x * 0.9 + bass.x * 0.85 + pads.x * 0.55 + keys.x * 0.9 + fx.x * 1.0 + wet * 0.9 + dl * 0.6
    mix = hp(mix, 30)
    mix = mix - 0.38 * hp(mix, 8500)  # ~-4 dB high shelf: tame the fizz
    mix = mix + 0.25 * bp(mix, 700, 2600)  # a little presence
    # glue: gentle bus compression + soft clip
    env = np.sqrt(np.maximum(signal.sosfilt(sos('lowpass', 8), np.mean(mix ** 2, axis=0)), 0) + 1e-12)
    thr = 0.3
    gain = np.where(env > thr, (thr / env) ** 0.28, 1.0)
    mix = mix * gain
    mix = mix[:, :N]
    # closing fade to match the picture
    t = np.arange(N) / SR
    f0 = b(31.15)
    fadecurve = np.where(t < f0, 1.0, np.cos(np.clip((t - f0) / (DUR - f0), 0, 1) * np.pi / 2) ** 1.5)
    mix *= fadecurve
    mix *= 0.92 / np.max(np.abs(mix))
    mix = np.tanh(mix * 1.05) / np.tanh(1.05)
    mix *= 0.89 / np.max(np.abs(mix))
    pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    rms = np.sqrt(np.mean(mix ** 2))
    print(f'wrote {out_path}: {N / SR:.3f}s, peak {np.max(np.abs(mix)):.3f}, rms {20 * np.log10(rms):.1f} dBFS')


if __name__ == '__main__':
    render(sys.argv[1] if len(sys.argv) > 1 else 'audio/soundtrack.wav')
