"""Original calm soundtrack for the Pomar Distribuidora spot (60 s, D major, 72 BPM).

Everything is synthesized here (no samples): felt piano, warm pad, soft bass,
marimba and celesta-like bells, a light shaker and reverse swells, through a
synthetic hall reverb. Accents land on the animation cues exported by
`node tools/render.cjs cues tools/cues.json`, so sound and picture stay in sync.

Usage: python3 tools/music.py tools/cues.json output/trilha-pomar.wav
"""
import json, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
DUR = 60.0
N = int((DUR + 0.5) * SR)
BPM = 72
BEAT = 60 / BPM
BAR = 4 * BEAT
E8 = BEAT / 2
rng = np.random.default_rng(11)


def bar(n, beat=0.0):
    return (n - 1) * BAR + beat * BEAT


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lowpass(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x, axis=-1)


def highpass(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x, axis=-1)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x, axis=-1)


class Stem:
    """stereo track with a dry part and a reverb send"""

    def __init__(self, send):
        self.x = np.zeros((2, N))
        self.send = send

    def add(self, y, t, pan=0.0, gain=1.0):
        i = int(round(t * SR))
        if i >= N:
            return
        if y.ndim == 1:
            th = (pan + 1) * np.pi / 4
            y = np.stack([y * np.cos(th), y * np.sin(th)]) * np.sqrt(2)
        if i < 0:
            y, i = y[:, -i:], 0
        y = y[:, : N - i]
        self.x[:, i:i + y.shape[1]] += y * gain


# ---------------------------------------------------------------- instruments
def piano(m, vel=0.5, hold=None):
    f = mtof(m)
    T = float(np.clip(1.4 + 480 / f, 2.0, 6.5))
    n = int(T * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    bright = 0.35 + 0.55 * vel
    for k in range(1, 15):
        fk = k * f * np.sqrt(1 + 0.00038 * k * k)
        if fk > 11000:
            break
        a = bright ** (k - 1) / k ** 1.3
        t1, t2 = 0.3 * T / (1 + 0.5 * (k - 1)), T / (1 + 0.32 * (k - 1))
        env = 0.55 * np.exp(-t / t1) + 0.45 * np.exp(-t / t2)
        for det in (-0.7, 0.7):                       # two strings, slightly apart
            y += 0.5 * a * env * np.sin(2 * np.pi * fk * 2 ** (det / 1200) * t + rng.uniform(0, 6.283))
    a = int(0.007 * SR)
    y[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    th = rng.normal(0, 1, int(0.05 * SR)) * np.exp(-np.arange(int(0.05 * SR)) / SR / 0.01)
    y[: len(th)] += 0.05 * lowpass(th, 600)            # soft felt thump
    if hold is not None and hold < T:
        k0, rel = int(hold * SR), int(0.45 * SR)
        env = np.ones(n)
        env[k0:k0 + rel] = np.cos(np.linspace(0, np.pi / 2, len(env[k0:k0 + rel]))) ** 2
        env[k0 + rel:] = 0
        y *= env
    return y * vel


def pad(notes, dur, att=1.0, rel=1.5):
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    y = np.zeros((2, n))
    for m in notes:
        f = mtof(m)
        for j, det in enumerate((-9, -3, 3.5, 9.5)):
            fd = f * 2 ** (det / 1200)
            v = np.zeros(n)
            for k in range(1, 10):
                if fd * k > 5000:
                    break
                v += np.exp(-(k - 1) / 2.0) / k * np.sin(2 * np.pi * fd * k * t + rng.uniform(0, 6.283))
            pn = (-0.7, -0.25, 0.25, 0.7)[j]
            th = (pn + 1) * np.pi / 4
            y[0] += v * np.cos(th)
            y[1] += v * np.sin(th)
    env = np.ones(n)
    a = int(att * SR)
    env[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    r0 = int(dur * SR)
    env[r0:] = np.cos(np.linspace(0, np.pi / 2, n - r0)) ** 2
    env *= 1 + 0.07 * np.sin(2 * np.pi * 0.17 * t + rng.uniform(0, 6.283))
    return lowpass(y * env, 1700)


def bass(m, dur, vel=0.6):
    f = mtof(m)
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2 * f * t) + 0.14 * np.sin(2 * np.pi * 3 * f * t)
    env = np.minimum(1, t / 0.05) * (0.72 + 0.28 * np.exp(-t / 0.7))
    k0 = int(dur * SR)
    env[k0:] *= np.cos(np.linspace(0, np.pi / 2, n - k0)) ** 2
    return lowpass(y * env, 520) * vel


def marimba(m, vel=0.5, muted=False):
    f = mtof(m)
    d1 = (0.09 if muted else 0.42) * (1 + 260 / f)
    n = int(min(3.0, d1 * 6) * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * f * t) * np.exp(-t / d1)
         + 0.22 * np.sin(2 * np.pi * 3.93 * f * t) * np.exp(-t / (d1 * 0.16))
         + 0.05 * np.sin(2 * np.pi * 9.2 * f * t) * np.exp(-t / (d1 * 0.05)))
    a = int(0.0015 * SR)
    y[:a] *= np.linspace(0, 1, a)
    click = rng.normal(0, 1, int(0.01 * SR)) * np.exp(-np.arange(int(0.01 * SR)) / SR / 0.0025)
    y[: len(click)] += 0.03 * lowpass(click, 2500)
    return y * vel


def bell(m, vel=0.5, T=2.6):
    f = mtof(m)
    n = int(T * 2.2 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for r, amp, dk in ((1, 1.0, 1.0), (2.0, 0.32, 0.5), (3.0, 0.1, 0.3), (4.17, 0.07, 0.16), (5.43, 0.03, 0.1)):
        if f * r < 15000:
            y += amp * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6.283)) * np.exp(-t / (T * dk * 0.45))
    a = int(0.002 * SR)
    y[:a] *= np.linspace(0, 1, a)
    return y * vel


def shaker(vel=0.5):
    n = int(0.14 * SR)
    t = np.arange(n) / SR
    y = bandpass(rng.normal(0, 1, n), 4200, 11000) * np.minimum(1, t / 0.008) * np.exp(-t / 0.035)
    return y * vel


def reverse_swell(notes, length, ir):
    parts = [piano(m, 0.5) for m in notes]
    x = np.zeros(max(len(p) for p in parts))
    for p in parts:
        x[: len(p)] += p
    tail = fftconvolve(x, ir[0])[: int(length * SR)]
    y = tail[::-1] * np.linspace(0, 1, len(tail)) ** 1.5
    return y / (np.max(np.abs(y)) + 1e-9)


def make_ir(T60=2.5, length=3.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for ch in range(2):
        noise = rng.normal(0, 1, n)
        for lo, hi, T in ((None, 350, T60 * 1.1), (350, 1800, T60), (1800, 5500, T60 * 0.68), (5500, None, T60 * 0.4)):
            if lo is None:
                b = lowpass(noise, hi)
            elif hi is None:
                b = highpass(noise, lo)
            else:
                b = bandpass(noise, lo, hi)
            ir[ch] += b * np.exp(-6.91 * t / T)
    ir[:, : int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    pre = int(0.022 * SR)
    ir = np.concatenate([np.zeros((2, pre)), ir[:, : n - pre]], axis=1)
    for d, a, ch in ((0.011, 0.5, 0), (0.017, 0.45, 1), (0.026, 0.35, 0), (0.033, 0.33, 1), (0.047, 0.25, 0), (0.058, 0.22, 1)):
        ir[ch, int(d * SR)] += a * 8
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def rms(x):
    return np.sqrt(np.mean(x[:, np.abs(x).max(axis=0) > 1e-4] ** 2) + 1e-12) if x.ndim == 2 else np.sqrt(np.mean(x ** 2))


# ---------------------------------------------------------------- score
CH = {
    'Dmaj9': dict(pad=[50, 57, 61, 64, 66], bass=38, arp=[62, 69, 76, 78, 81, 78, 76, 69]),
    'G/D': dict(pad=[50, 55, 59, 62, 66], bass=38, arp=[62, 67, 71, 74, 78, 74, 71, 67]),
    'Bm11': dict(pad=[54, 59, 62, 64, 69], bass=35, arp=[59, 66, 74, 76, 81, 76, 74, 66]),
    'Gmaj9': dict(pad=[55, 59, 62, 66, 69], bass=43, arp=[55, 62, 69, 71, 78, 71, 69, 62]),
    'Asus': dict(pad=[52, 57, 62, 66, 69], bass=33, arp=[57, 64, 74, 76, 78, 76, 74, 64]),
    'A': dict(pad=[52, 57, 61, 64, 69], bass=33, arp=[57, 64, 73, 76, 81, 76, 73, 64]),
    'F#m7': dict(pad=[52, 57, 61, 66, 69], bass=42, arp=[54, 61, 69, 73, 76, 73, 69, 61]),
}
HARM = [(1, 0, 4, 'Dmaj9'), (2, 0, 4, 'G/D'), (3, 0, 4, 'Dmaj9'), (4, 0, 4, 'Bm11'), (5, 0, 4, 'Gmaj9'),
        (6, 0, 2, 'Asus'), (6, 2, 2, 'A'), (7, 0, 4, 'Dmaj9'), (8, 0, 4, 'Bm11'), (9, 0, 4, 'Gmaj9'),
        (10, 0, 2, 'Asus'), (10, 2, 2, 'A'), (11, 0, 4, 'Dmaj9'), (12, 0, 4, 'F#m7'), (13, 0, 4, 'Gmaj9'),
        (14, 0, 4, 'Asus'), (15, 0, 2, 'Gmaj9'), (15, 2, 2, 'Asus'), (16, 0, 4, 'Dmaj9'), (17, 0, 4, 'G/D'),
        (18, 0, 4, 'Dmaj9')]
MELODY = [(7, 0, 1.5, 78), (7, 1.5, .5, 76), (7, 2, 1, 74), (7, 3, 1, 81),
          (8, 0, 1.5, 78), (8, 1.5, .5, 76), (8, 2, .5, 74), (8, 2.5, .5, 71), (8, 3, 1, 74),
          (9, 0, 1, 71), (9, 1, 1, 74), (9, 2, 1.5, 78), (9, 3.5, .5, 81),
          (10, 0, 1.5, 76), (10, 1.5, .5, 78), (10, 2, 2, 76),
          (11, 0, 1.5, 81), (11, 1.5, .5, 78), (11, 2, 1, 76), (11, 3, 1, 74),
          (12, 0, 1.5, 73), (12, 1.5, .5, 76), (12, 2, 2, 81),
          (13, 0, 1, 83), (13, 1, .5, 81), (13, 1.5, .5, 78), (13, 2, 2, 74)]


def main(cues_path, out_path):
    cue = json.load(open(cues_path))
    ir = make_ir()
    S = {k: Stem(send) for k, send in
         (('pad', 0.35), ('piano', 0.3), ('bass', 0.05), ('bell', 0.45), ('pluck', 0.4), ('shaker', 0.2), ('swell', 0.25))}
    hum = lambda: rng.normal(0, 0.006)

    # harmony bed
    for i, (b, beat, beats, name) in enumerate(HARM):
        c = CH[name]
        t0 = bar(b, beat)
        dur = beats * BEAT
        last = i == len(HARM) - 1
        S['pad'].add(pad(c['pad'], DUR - t0 + 0.2 if last else dur + 0.25, att=2.6 if i == 0 else 1.0), t0 - (0 if i == 0 else 0.25))
        if 3 <= b <= 15:
            S['bass'].add(bass(c['bass'], dur - 0.05, 0.62), t0 + 0.01)
            if beats == 4 and b in (7, 8, 9, 11, 12, 13):
                S['bass'].add(bass(c['bass'] + 7, BEAT * 0.9, 0.36), t0 + 3 * BEAT)
        # piano broken chords
        if 3 <= b <= 15:
            eighths = range(int(beat * 2), int((beat + beats) * 2))
            dense = 7 <= b <= 14
            dyn = {3: .8, 4: .85, 5: .9, 6: .9, 14: .78, 15: .72}.get(b, 1.0)
            for e in eighths:
                if not dense and e % 2:
                    continue
                m = c['arp'][e % 8]
                v = [0.5, 0.33, 0.4, 0.32, 0.44, 0.31, 0.38, 0.3][e % 8] * dyn * (0.9 if dense else 1.0)
                S['piano'].add(piano(m, v + rng.normal(0, 0.02), hold=None), bar(b) + e * E8 + hum(), pan=(m - 68) / 40)
            if 11 <= b <= 13:
                S['piano'].add(piano(c['bass'] + (12 if c['bass'] > 40 else 24), 0.34), t0 + hum(), pan=-0.2)

    # opening: soft high notes over the sunrise
    for t, m, v in ((0.42, 86, 0.32), (1.67, 81, 0.2), (bar(2), 78, 0.24), (bar(2, 2), 74, 0.2)):
        S['bell'].add(bell(m, v, T=3.2), t, pan=0.15)
    S['piano'].add(piano(62, 0.32), bar(2) + 0.01, pan=-0.1)
    S['piano'].add(piano(69, 0.26), bar(2, 2), pan=0.05)

    # sprouts: leaves open on a rising pentatonic line
    for t, m in zip(cue['sprouts'], (74, 76, 78, 81, 83, 86)):
        S['pluck'].add(marimba(m, 0.42), t, pan=(m - 80) / 14)
    for t, m in zip(cue['sproutsBack'], (69, 71, 74, 76)):
        S['pluck'].add(marimba(m, 0.24), t, pan=-0.35)
    # the sun travels into the tree
    for k, m in enumerate((74, 78, 81, 86)):
        S['bell'].add(bell(m, 0.18 + 0.03 * k, T=2.0), 9.25 + k * 0.28, pan=0.2 * k - 0.3)
    # fruits appear on 16ths: a sparkling Bm11 arpeggio
    for t, m in zip(cue['fruits'], (71, 74, 78, 81, 83, 81, 78, 74, 76, 78, 81, 83, 86)):
        S['pluck'].add(marimba(m, 0.26), t, pan=(m - 78) / 12)
    # oranges land in the crate: muted wooden taps
    for t, m in zip(cue['drops'], (57, 64, 61, 69, 64)):
        S['pluck'].add(marimba(m, 0.5, muted=True), t, pan=0.25)
    S['pluck'].add(marimba(74, 0.32) + 0, cue['cratePop'], pan=0.0)
    S['pluck'].add(marimba(81, 0.22), cue['cratePop'] + 0.01, pan=0.1)
    S['pluck'].add(marimba(50, 0.55, muted=True), cue['crateLand'], pan=-0.1)
    for t, m in zip([cue['hubPin']] + cue['pins'], (74, 78, 81, 86)):
        S['pluck'].add(marimba(m, 0.36), t, pan=(m - 80) / 12)

    # melody on celesta-like bells (bars 7-13), the three values ring on bar 14
    for b, beat, d, m in MELODY:
        S['bell'].add(bell(m, 0.36, T=min(3.0, 1.2 + d)), bar(b, beat) + hum(), pan=0.12)
    for t, m in zip(cue['values'], (78, 81, 86)):
        S['bell'].add(bell(m, 0.42, T=3.0), t, pan=0.1)
        S['pluck'].add(marimba(m - 12, 0.22), t, pan=-0.1)

    # gentle motion while the truck drives and the route is drawn
    for k in range(int((bar(14) - bar(10)) / E8)):
        t = bar(10) + k * E8
        fade = min(1, k / 8) * min(1, (bar(14) - t) / (2 * BEAT))
        S['shaker'].add(shaker((0.55 if k % 2 else 0.32) * fade), t + hum(), pan=0.35)

    # logo: arrival chord, chime when the original logo is complete, closing phrase
    for k, m in enumerate((50, 57, 62, 66, 69, 73, 76)):
        S['piano'].add(piano(m, 0.42 - 0.02 * k), bar(16) + k * 0.045, pan=(m - 64) / 30)
    for k, m in enumerate((86, 90, 93, 98)):
        S['bell'].add(bell(m, 0.34 - 0.05 * k, T=3.6), cue['logoDone'] + k * 0.075, pan=-0.2 + 0.15 * k)
    for t, m, v in ((cue['tagline'], 81, 0.34), (cue['tagline'] + BEAT, 78, 0.3), (cue['tagline'] + 2 * BEAT, 76, 0.28), (cue['tagline'] + 2.5 * BEAT, 74, 0.3)):
        S['piano'].add(piano(m, v), t, pan=0.1)
    for k, m in enumerate((50, 57, 61, 64, 69)):
        S['piano'].add(piano(m, 0.3), bar(18) + k * 0.06, pan=(m - 60) / 30)
    S['bell'].add(bell(86, 0.18, T=3.6), bar(18) + 0.4, pan=0.2)

    # reverse swells into the big transitions
    for hit, notes, length in ((cue['wipe'], [62, 69, 74, 78], 2.0), (bar(10), [57, 64, 69, 73], 1.6),
                               (cue['cover'], [57, 62, 66, 69], 1.6), (bar(16), [62, 66, 69, 74, 78], 2.4)):
        S['swell'].add(reverse_swell(notes, length, ir), hit - length, pan=0.0)

    # ---------------------------------------------------------------- mix
    target = {'pad': -27, 'piano': -24.5, 'bass': -32.5, 'bell': -27, 'pluck': -29, 'shaker': -40, 'swell': -31}
    dry = np.zeros((2, N))
    send = np.zeros((2, N))
    for k, st in S.items():
        g = 10 ** (target[k] / 20) / rms(st.x)
        dry += st.x * g
        send += st.x * g * st.send
        print(f'{k:7s} gain {20 * np.log10(g):6.1f} dB')
    wl = fftconvolve(send[0] + 0.35 * send[1], ir[0])[:N]
    wr = fftconvolve(send[1] + 0.35 * send[0], ir[1])[:N]
    mix = dry + 0.55 * np.stack([wl, wr])
    mix = highpass(mix, 42)
    t = np.arange(N) / SR
    mix *= np.clip((DUR - t) / 2.6, 0, 1) ** 1.5                 # final fade
    mix = mix[:, : int(DUR * SR)]
    peak = np.max(np.abs(mix))
    mix *= 0.89 / peak
    mix = np.tanh(mix * 1.05) / np.tanh(1.05)
    pcm = np.clip(mix.T * 32767 + rng.uniform(-0.5, 0.5, mix.T.shape) + rng.uniform(-0.5, 0.5, mix.T.shape), -32768, 32767).astype('<i2')
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('wrote', out_path, f'peak {20 * np.log10(peak):.1f} dBFS before normalising')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
