import sys, json, cv2, mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
opts=vision.HandLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=sys.argv[2]),running_mode=vision.RunningMode.VIDEO,num_hands=2,min_hand_detection_confidence=0.3,min_hand_presence_confidence=0.3,min_tracking_confidence=0.3)
det=vision.HandLandmarker.create_from_options(opts)
cap=cv2.VideoCapture(sys.argv[1]); fps=cap.get(cv2.CAP_PROP_FPS); W=int(cap.get(3)); H=int(cap.get(4))
out=[]; i=0
while True:
    ok,fr=cap.read()
    if not ok: break
    t=cap.get(cv2.CAP_PROP_POS_MSEC)
    img=mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(fr,cv2.COLOR_BGR2RGB))
    r=det.detect_for_video(img,int(round(t)) if t>0 else i*50)
    hs=[]
    for lm,hd in zip(r.hand_landmarks,r.handedness):
        hs.append({"side":hd[0].category_name,"score":hd[0].score,"lm":[[p.x*W,p.y*H,p.z] for p in lm]})
    out.append({"i":i,"t":t/1000,"hands":hs}); i+=1
json.dump({"fps":fps,"W":W,"H":H,"frames":out},open(sys.argv[3],"w"))
print(fps,W,H,i)
