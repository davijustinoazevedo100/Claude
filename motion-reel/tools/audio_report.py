"""Render a picture of the soundtrack (loudness + spectrogram) for review."""
import sys, wave
import numpy as np
from PIL import Image, ImageDraw
from scipy import signal

path = sys.argv[1]
out = sys.argv[2]
with wave.open(path) as w:
    sr = w.getframerate(); ch = w.getnchannels()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, ch).astype(float) / 32768
m = x.mean(axis=1)
W, H1, H2 = 1920, 260, 600
img = Image.new('RGB', (W, H1 + H2 + 30), (16, 16, 20))
d = ImageDraw.Draw(img)
dur = len(m) / sr
# Loudness envelope (RMS per column) and peak.
hop = len(m) / W
for i in range(W):
    seg = m[int(i * hop):int((i + 1) * hop)]
    if not len(seg): continue
    r = np.sqrt(np.mean(seg ** 2)); p = np.max(np.abs(seg))
    d.line([(i, H1 / 2 - p * H1 / 2), (i, H1 / 2 + p * H1 / 2)], fill=(70, 70, 90))
    d.line([(i, H1 / 2 - r * H1 / 2), (i, H1 / 2 + r * H1 / 2)], fill=(255, 140, 90))
f, t, S = signal.spectrogram(m, sr, nperseg=2048, noverlap=1536)
S = 10 * np.log10(S + 1e-12)
fmin, fmax = 30, 16000
logf = np.log10(np.clip(f, 1, None))
rows = np.linspace(np.log10(fmin), np.log10(fmax), H2)[::-1]
cols = np.linspace(0, t[-1], W)
fi = np.clip(np.searchsorted(logf, rows), 0, len(f) - 1)
ti = np.clip(np.searchsorted(t, cols), 0, len(t) - 1)
Z = S[np.ix_(fi, ti)]
Z = np.clip((Z + 110) / 80, 0, 1)
rgb = np.stack([Z ** 0.8 * 255, Z ** 1.5 * 200, Z ** 3 * 255], axis=-1).astype(np.uint8)
img.paste(Image.fromarray(rgb), (0, H1 + 30))
for s in range(0, int(dur) + 1, 2):
    x0 = s / dur * W
    d.line([(x0, 0), (x0, H1 + H2 + 30)], fill=(60, 60, 70) if s % 6 else (120, 120, 140))
    if s % 4 == 0: d.text((x0 + 3, H1 + 8), f'{s}s', fill=(200, 200, 210))
for fr in [100, 1000, 10000]:
    y = H1 + 30 + (np.log10(fmax) - np.log10(fr)) / (np.log10(fmax) - np.log10(fmin)) * H2
    d.text((4, y - 12), f'{fr}Hz', fill=(220, 220, 220))
img.save(out)
# Section levels.
for a, b in [(0,4),(4,10),(10,16),(16,22),(22,28),(28,34),(34,40),(40,48)]:
    seg = m[int(a*sr):int(b*sr)]
    print(f'{a:>2}-{b:<2}s  RMS {20*np.log10(np.sqrt(np.mean(seg**2))+1e-9):6.1f} dBFS  peak {20*np.log10(np.max(np.abs(seg))+1e-9):6.1f}')
print('DC', x.mean(axis=0), 'clipped samples', int(np.sum(np.abs(x) > 0.999)))
