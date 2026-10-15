#!/usr/bin/env python3
"""Spectrogram + level envelope of a WAV with the 128 BPM beat grid: spectrogram.py in.wav out.png"""
import sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
with wave.open(src) as w:
    sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, 2).mean(1) / 32768
hop, nfft = 240, 4096
frames = np.lib.stride_tricks.sliding_window_view(np.pad(x, (nfft // 2, nfft // 2)), nfft)[::hop] * np.hanning(nfft)
S = 20 * np.log10(np.abs(np.fft.rfft(frames, axis=1)) + 1e-9)
freqs = np.fft.rfftfreq(nfft, 1 / sr)
Wpx, Hpx = 1800, 520
fy = np.geomspace(30, 16000, Hpx)
idx = np.searchsorted(freqs, fy)
img = S[:, idx].T[::-1]
img = np.clip((img - img.max() + 80) / 80, 0, 1)
cols = np.linspace(0, img.shape[1] - 1, Wpx).astype(int)
img = img[:, cols]
rgb = (np.stack([img ** 0.6, img ** 1.4, img ** 3 * 0.6 + img * 0.25], -1) * 255).astype(np.uint8)
canvas = Image.new('RGB', (Wpx, Hpx + 200), (12, 12, 14))
canvas.paste(Image.fromarray(rgb), (0, 0))
d = ImageDraw.Draw(canvas)
dur = len(x) / sr
beat = 60 / 128
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 12)
# rms envelope
n = int(sr * 0.01)
rms = np.sqrt(np.convolve(x ** 2, np.ones(n) / n, 'same'))[:: n]
pts = [(i / len(rms) * Wpx, Hpx + 190 - min(1, r * 4) * 170) for i, r in enumerate(rms)]
d.line(pts, fill=(255, 120, 60), width=1)
for k in range(33):
    px = k * beat / dur * Wpx
    d.line([(px, 0), (px, Hpx + 200)], fill=(80, 80, 255) if k % 4 == 0 else (45, 45, 70), width=1)
    d.text((px + 2, Hpx + 2), str(k), fill=(200, 200, 220), font=font)
for f in (100, 1000, 10000):
    py = Hpx - np.searchsorted(fy, f)
    d.text((2, py), f'{f}Hz', fill=(180, 180, 180), font=font)
canvas.save(out)
print(out)
