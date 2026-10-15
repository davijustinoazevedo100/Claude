#!/usr/bin/env python3
"""Tile rendered stills into a labelled contact sheet: contact.py <dir> <out.png> [cols] [thumb_w]"""
import sys, os, glob
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 480
files = sorted(glob.glob(os.path.join(src, 't_*.png')), key=lambda f: float(os.path.basename(f)[2:-4]))
ims = [Image.open(f).convert('RGB') for f in files]
th = int(tw * 9 / 16)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 30) + 8), (40, 40, 40))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 16)
except Exception:
    font = ImageFont.load_default()
for k, (f, im) in enumerate(zip(files, ims)):
    x = 8 + (k % cols) * (tw + 8)
    y = 8 + (k // cols) * (th + 30)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 22))
    t = float(os.path.basename(f)[2:-4])
    d.text((x, y + 2), f"t={t:.3f}s  beat {t / 0.46875:.2f}", fill=(230, 230, 230), font=font)
sheet.save(out)
print(out, sheet.size)
