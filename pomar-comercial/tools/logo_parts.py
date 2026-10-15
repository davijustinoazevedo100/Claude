"""Split the ORIGINAL logo into reveal layers without altering it.

Every pixel of the original image is assigned to the nearest logo part
(orange circle, crescent, stem, two leaves). Each layer keeps the original
RGB values and only gets a 0/255 alpha, so stacking all five layers over the
same #F7F7F7 background reproduces the original image exactly. The layers are
used only to reveal the logo piece by piece in the final scene.

Usage: python3 logo_parts.py <logo-original.png> <out_dir> <scale>
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out, scale = sys.argv[1], sys.argv[2], float(sys.argv[3])
os.makedirs(out, exist_ok=True)

im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(int)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
H, W = R.shape

orange = (R > 200) & (G < 170) & (B < 90)
green = (G > R + 50) & (G > B + 20)
lab, n = ndimage.label(green)
comps = []
for k in range(1, n + 1):
    ys, xs = np.nonzero(lab == k)
    if len(xs) < 50:
        continue
    comps.append(dict(k=k, n=len(xs), x0=xs.min(), x1=xs.max(), y0=ys.min(), y1=ys.max(),
                      cx=xs.mean(), cy=ys.mean()))
comps.sort(key=lambda c: -c["n"])
crescent = comps[0]                                   # largest green shape, right side
rest = sorted(comps[1:], key=lambda c: -c["y1"])      # stem reaches lowest
stem = rest[0]
leaves = sorted(rest[1:], key=lambda c: c["cy"])      # upper leaf first
assert crescent["x0"] > stem["x1"] - 10, "unexpected layout"

parts = {"orange": orange, "crescent": lab == crescent["k"], "stem": lab == stem["k"],
         "leafTop": lab == leaves[0]["k"], "leafBottom": lab == leaves[1]["k"]}
names = list(parts)
L = np.zeros((H, W), np.int32)
for i, nm in enumerate(names, 1):
    L[parts[nm]] = i
# nearest-part partition of the whole image (background included)
_, (iy, ix) = ndimage.distance_transform_edt(L == 0, return_indices=True)
region = L[iy, ix]

# geometry (original pixel units)
oy, ox = np.nonzero(orange)
ocx, ocy = ox.mean(), oy.mean()
orad = float(np.sqrt(orange.sum() / np.pi))
geo = {"size": [W, H], "orange": {"cx": ocx, "cy": ocy, "r": orad}}

def pts(mask):
    ys, xs = np.nonzero(mask)
    return np.stack([xs, ys], 1).astype(float)

sp = pts(parts["stem"])
geo["stem"] = {"bbox": [float(sp[:, 0].min()), float(sp[:, 1].min()), float(sp[:, 0].max()), float(sp[:, 1].max())]}
for nm in ("leafTop", "leafBottom"):
    lp = pts(parts[nm])
    # base = leaf pixel closest to the stem, tip = leaf pixel farthest from the base
    d = np.min(np.hypot(lp[:, None, 0] - sp[None, ::7, 0], lp[:, None, 1] - sp[None, ::7, 1]), 1)
    base = lp[np.argmin(d)]
    tip = lp[np.argmax(np.hypot(*(lp - base).T))]
    geo[nm] = {"base": base.tolist(), "tip": tip.tolist()}
cp = pts(parts["crescent"])
ang = np.degrees(np.arctan2(cp[:, 1] - ocy, cp[:, 0] - ocx))
geo["crescent"] = {"angMin": float(ang.min()), "angMax": float(ang.max()),
                   "rMin": float(np.hypot(*(cp - [ocx, ocy]).T).min()),
                   "rMax": float(np.hypot(*(cp - [ocx, ocy]).T).max())}
allfg = pts(L > 0)
geo["bbox"] = [float(allfg[:, 0].min()), float(allfg[:, 1].min()), float(allfg[:, 0].max()), float(allfg[:, 1].max())]
gap = np.min(np.hypot(sp[:, None, 0] - ox[None, ::5], sp[:, None, 1] - oy[None, ::5]))
geo["stemToOrangeGapPx"] = float(gap)

# resample the original once to the display scale (no other processing)
SW, SH = round(W * scale), round(H * scale)
big = im.resize((SW, SH), Image.LANCZOS)
big.save(os.path.join(out, "logo-full.png"))
reg_big = np.asarray(Image.fromarray(region.astype(np.uint8)).resize((SW, SH), Image.NEAREST))
rgb = np.asarray(big)
for i, nm in enumerate(names, 1):
    alpha = np.where(reg_big == i, 255, 0).astype(np.uint8)
    Image.fromarray(np.dstack([rgb, alpha])).save(os.path.join(out, f"part-{nm}.png"))

# check: the five layers over the background rebuild the resampled original exactly
acc = np.zeros_like(rgb)
for i in range(1, len(names) + 1):
    acc[reg_big == i] = rgb[reg_big == i]
assert np.array_equal(acc, rgb)

def sc(v):
    if isinstance(v, dict):
        return {k: (v[k] if k.startswith("ang") or k == "stemToOrangeGapPx" else sc(v[k])) for k in v}
    if isinstance(v, (list, tuple)):
        return [sc(x) for x in v]
    return float(v) * scale

geo_s = sc(geo)
geo_s["scale"] = scale
with open(os.path.join(out, "logo-geo.json"), "w") as f:
    json.dump(geo_s, f, indent=1)
print(json.dumps(geo_s, indent=1))
