"""per-frame face box + green-toy mask stats -> track.json"""
import sys, json, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
src, fdet, out = sys.argv[1:4]
det = vision.FaceDetector.create_from_options(vision.FaceDetectorOptions(
    base_options=mpt.BaseOptions(model_asset_path=fdet), running_mode=vision.RunningMode.VIDEO, min_detection_confidence=0.4))
cap = cv2.VideoCapture(src); fps = cap.get(cv2.CAP_PROP_FPS); W = int(cap.get(3)); H = int(cap.get(4))
fr = []; i = 0; last = -1
k3 = np.ones((3, 3), np.uint8)
while True:
    ok, f = cap.read()
    if not ok: break
    t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
    ms = int(round(t * 1000)); ms = max(ms, last + 1); last = ms
    r = det.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(f, cv2.COLOR_BGR2RGB)), ms)
    face = None
    if r.detections:
        b = max(r.detections, key=lambda d: d.bounding_box.width).bounding_box
        face = [b.origin_x, b.origin_y, b.width, b.height]
    hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (35, 70, 40), (90, 255, 255))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k3)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    toy = None
    if n > 1:
        j = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        if st[j, cv2.CC_STAT_AREA] > 1500:
            x, y, w, h, a = st[j]
            ys, xs = np.nonzero(lab[y:y + max(4, h // 12), x:x + w] == j)
            top = [float(x + xs.mean()), float(y)]
            sharp = float(cv2.Laplacian(cv2.cvtColor(f[y:y+h, x:x+w], cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
            toy = {"box": [int(x), int(y), int(w), int(h)], "area": int(a), "c": [float(cen[j][0]), float(cen[j][1])], "top": top, "sharp": sharp}
    fr.append({"i": i, "t": t, "face": face, "toy": toy}); i += 1
json.dump({"fps": fps, "W": W, "H": H, "frames": fr}, open(out, "w"))
print(fps, W, H, i, sum(1 for x in fr if x["face"]), sum(1 for x in fr if x["toy"]))
