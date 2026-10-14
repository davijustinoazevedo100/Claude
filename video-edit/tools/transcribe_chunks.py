import sys, json, wave, numpy as np, sherpa_onnx
M=sys.argv[1]; w=wave.open(sys.argv[2]); sr=w.getframerate(); a=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
hop=int(sr*0.02); n=len(a)//hop
db=20*np.log10(np.array([np.sqrt(np.mean(a[i*hop:(i+1)*hop]**2)) for i in range(n)])+1e-6)
sil=db<float(sys.argv[4]); minsil=int(float(sys.argv[5])/0.02)
# find silence runs
cuts=[];i=0
while i<n:
    if sil[i]:
        j=i
        while j<n and sil[j]: j+=1
        if j-i>=minsil: cuts.append(((i+j)//2)*0.02)
        i=j
    else: i+=1
bounds=[0.0]+cuts+[len(a)/sr]
rec=sherpa_onnx.OfflineRecognizer.from_whisper(encoder=f"{M}/medium-encoder.int8.onnx",decoder=f"{M}/medium-decoder.int8.onnx",tokens=f"{M}/medium-tokens.txt",language="pt",task="transcribe",num_threads=4,tail_paddings=800)
res=[]
for t0,t1 in zip(bounds[:-1],bounds[1:]):
    seg=a[int(t0*sr):int(t1*sr)]
    seg=np.concatenate([np.zeros(int(0.3*sr),np.float32),seg,np.zeros(int(0.3*sr),np.float32)])
    s=rec.create_stream(); s.accept_waveform(sr,seg); rec.decode_stream(s)
    print(f"[{t0:6.2f}-{t1:6.2f}] {s.result.text}",flush=True)
    res.append({"start":t0,"end":t1,"text":s.result.text.strip()})
json.dump(res,open(sys.argv[3],"w"),ensure_ascii=False,indent=1)
