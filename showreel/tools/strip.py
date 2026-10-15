#!/usr/bin/env python3
"""Frame strips for motion review / contact sheets from a rendered PNG sequence.

    strip.py <frames_dir> <out.png> <start_frame>[,<start_frame>...] [count] [step] [thumb_w]
    strip.py <frames_dir> <out.png> --sheet <frame>,<frame>,... [cols] [thumb_w]
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 14)


def load(i):
    return Image.open(os.path.join(src, f'f_{i:05d}.png')).convert('RGB')


if sys.argv[3] == '--sheet':
    frames = [int(x) for x in sys.argv[4].split(',')]
    cols = int(sys.argv[5]) if len(sys.argv) > 5 else 4
    tw = int(sys.argv[6]) if len(sys.argv) > 6 else 480
    rows_of = [frames[i:i + cols] for i in range(0, len(frames), cols)]
    label = False
else:
    starts = [int(x) for x in sys.argv[3].split(',')]
    count = int(sys.argv[4]) if len(sys.argv) > 4 else 8
    step = int(sys.argv[5]) if len(sys.argv) > 5 else 1
    tw = int(sys.argv[6]) if len(sys.argv) > 6 else 320
    rows_of = [[s + k * step for k in range(count)] for s in starts]
    cols = count
    label = True

th = tw * 9 // 16
pad = 4
lab = 20 if label else 0
sheet = Image.new('RGB', (cols * (tw + pad) + pad, len(rows_of) * (th + pad + lab) + pad), (24, 24, 24))
d = ImageDraw.Draw(sheet)
for r, row in enumerate(rows_of):
    for c, i in enumerate(row):
        x, y = pad + c * (tw + pad), pad + r * (th + pad + lab)
        sheet.paste(load(i).resize((tw, th), Image.LANCZOS), (x, y + lab))
        if label:
            d.text((x + 2, y + 2), f'f{i}  {i / 60:.3f}s  b{i / 60 / 0.46875:.2f}', fill=(220, 220, 220), font=font)
sheet.save(out)
print(out, sheet.size)
