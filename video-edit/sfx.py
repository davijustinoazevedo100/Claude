"""Synthesized sound design for the edit, mixed under the cleaned-up voice.

Usage: python3 sfx.py voice.wav mix.wav total_seconds
"""
import sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(3)

def t_(d): return np.arange(int(d * SR)) / SR
def norm(x): return x / (np.max(np.abs(x)) + 1e-9)

def onepole_lp(x, fc):
    """one-pole low-pass with a per-sample cutoff (Hz)"""
    fc = np.broadcast_to(fc, x.shape)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); z = 0.0
    for i in range(len(x)):
        z = (1 - a[i]) * x[i] + a[i] * z; y[i] = z
    return y

def pop(d=0.12):
    t = t_(d)
    f = 1100 * np.exp(-t * 14) + 320
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 32)
    x[:96] += rng.normal(0, 0.6, 96) * np.linspace(1, 0, 96)
    return norm(x)

def whoosh(d=0.5, up=True):
    t = t_(d); k = t / d
    env = np.sin(np.pi * k ** (0.6 if up else 1.4)) ** 2
    fc = 400 + 5000 * np.sin(np.pi * k) ** 2
    n = rng.normal(0, 1, len(t))
    x = onepole_lp(n, fc) - onepole_lp(n, fc * 0.12)
    return norm(x * env)

def impact(d=1.6, sub=60):
    t = t_(d)
    f = sub * np.exp(-t * 2.5) + sub * 0.6
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    crack = onepole_lp(rng.normal(0, 1, len(t)), 1400) * np.exp(-t * 16) * 3
    x = np.tanh((body * 1.6 + crack) * 1.8)
    return norm(x)

def chime(d=0.9, base=1320):
    t = t_(d)
    x = sum(np.sin(2 * np.pi * base * m * t) * np.exp(-t * (5 + 3 * m)) / m for m in (1, 1.5, 2, 3))
    return norm(x * (1 - np.exp(-t * 400)))

def shimmer(d=0.8):
    x = np.zeros(int(d * SR))
    for k in range(10):
        st = int(rng.uniform(0, d * 0.6) * SR); f = rng.uniform(2200, 5200)
        tt = t_(d)[: len(x) - st]
        x[st:] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 9) * rng.uniform(0.4, 1)
    return norm(x)

def tick():
    t = t_(0.012)
    n = rng.normal(0, 1, len(t))
    return norm((n - onepole_lp(n, 2500)) * np.exp(-t * 600))

def flutter(d=0.9):
    t = t_(d)
    n = rng.normal(0, 1, len(t))
    x = (onepole_lp(n, 1800) - onepole_lp(n, 300)) * np.abs(np.sin(2 * np.pi * 13 * t)) ** 3
    return norm(x * np.sin(np.pi * t / d))

def drone(d):
    t = t_(d)
    x = (np.sin(2 * np.pi * 55 * t) + np.sin(2 * np.pi * 55.8 * t) + 0.5 * np.sin(2 * np.pi * 82.5 * t)
         + 0.6 * onepole_lp(rng.normal(0, 1, len(t)), 220))
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.9 * t)
    env = np.minimum(1, np.minimum(t / 0.5, (d - t) / 0.6))
    return norm(x * np.clip(env, 0, 1))

def place(bus, x, at, db, pan=0.0):
    g = 10 ** (db / 20)
    i = int(at * SR); j = min(len(bus), i + len(x))
    if j <= i: return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    bus[i:j, 0] += x[: j - i] * g * l * 1.41
    bus[i:j, 1] += x[: j - i] * g * r * 1.41

def reverb(x, wet=0.18, d=0.7):
    t = t_(d)
    ir = rng.normal(0, 1, (len(t), 2)) * np.exp(-t * 6)[:, None]
    ir /= np.sqrt((ir ** 2).sum(0))
    n = len(x) + len(ir)
    y = np.stack([np.fft.irfft(np.fft.rfft(x[:, c], n) * np.fft.rfft(ir[:, c], n), n)[: len(x)] for c in range(2)], 1)
    return x + wet * y

if __name__ == "__main__":
    total = float(sys.argv[3])
    w = wave.open(sys.argv[1]); assert w.getframerate() == SR and w.getnchannels() == 2
    voice = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2).astype(np.float64) / 32768
    N = int(total * SR)
    v = np.zeros((N, 2)); v[: min(N, len(voice))] = voice[:N]
    end = len(voice) / SR                       # soften the hard cut at the very end of the recording
    fo = t_(0.12); i0 = int((end - 0.12) * SR)
    v[i0:i0 + len(fo)] *= np.linspace(1, 0, len(fo))[:, None]

    fx = np.zeros((N, 2))
    P = pop(); WH = whoosh(); WO = whoosh(0.4, up=False); IM = impact(); IMs = impact(1.0, 80)
    # hook
    place(fx, whoosh(0.35), 0.0, -12); place(fx, P, 0.02, -15, -0.3); place(fx, P, 0.14, -15, 0.3)
    place(fx, IMs, 0.24, -11); place(fx, WO, 0.82, -16)
    place(fx, P, 0.95, -17, 0.5)                                         # wave
    place(fx, WH, 2.45, -15, -0.6); place(fx, P, 2.66, -17, -0.5)       # name tag
    place(fx, WO, 4.12, -19, -0.6)
    place(fx, P, 5.40, -13, -0.4); place(fx, chime(0.8, 990), 5.45, -21, -0.4)   # DIA 1
    place(fx, WH, 5.95, -16, -0.7); place(fx, tick(), 6.50, -18, -0.8)
    place(fx, P, 6.30, -15, 0.6)                                         # dev card + loading
    for k in range(12): place(fx, tick(), 6.62 + k * 0.125, -27, 0.6)
    place(fx, chime(0.7, 1568), 8.05, -21, 0.6)
    place(fx, P, 8.50, -13, -0.6); place(fx, P, 9.42, -16, 0.0)          # choice cards
    place(fx, IMs, 10.02, -13, 0.6); place(fx, WO, 10.80, -15)
    place(fx, shimmer(), 11.80, -16, -0.6); place(fx, P, 11.82, -15, -0.6)   # survival on palm
    place(fx, WH, 12.66, -17, -0.6); place(fx, WO, 13.55, -19, -0.6)
    place(fx, P, 14.86, -14, 0.7); place(fx, drone(1.9), 14.80, -23, 0.5)    # zombie on palm
    place(fx, IM, 15.76, -8, 0.4); place(fx, flutter(), 15.82, -18, 0.8); place(fx, flutter(0.7), 15.98, -20, 0.2)
    place(fx, WO, 16.35, -17, 0.6)
    place(fx, P, 17.20, -15, 0.6); place(fx, IMs, 19.62, -15, 0.6); place(fx, WO, 20.70, -19, 0.6)   # friend
    place(fx, IM, 21.78, -7, 0.4); place(fx, chime(0.8, 1320), 22.30, -17, 0.6)                      # decision
    place(fx, WO, 23.00, -19, 0.6)
    place(fx, WH, 24.52, -15, 0.6); place(fx, P, 24.72, -17, 0.6)       # Davi
    place(fx, whoosh(0.6), end - 0.1, -12); place(fx, IM, end + 0.15, -9)    # outro
    place(fx, P, end + 0.30, -14); place(fx, drone(total - end), end, -21)
    fx = reverb(fx)

    mix = v + fx
    pk = np.max(np.abs(mix))
    m = np.abs(mix)                                                      # soft knee above 0.75, ceiling ~0.97
    mix = np.where(m > 0.75, np.sign(mix) * (0.75 + 0.22 * np.tanh((m - 0.75) / 0.22)), mix)
    out = wave.open(sys.argv[2], "wb"); out.setnchannels(2); out.setsampwidth(2); out.setframerate(SR)
    out.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes()); out.close()
    print("peak in", round(pk, 3))
