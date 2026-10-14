import sys, wave, json, numpy as np, sherpa_onnx
M=sys.argv[1]; w=wave.open(sys.argv[2]); sr=w.getframerate(); a=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
rec=sherpa_onnx.OfflineRecognizer.from_transducer(encoder=f"{M}/encoder.int8.onnx",decoder=f"{M}/decoder.int8.onnx",joiner=f"{M}/joiner.int8.onnx",tokens=f"{M}/tokens.txt",model_type="nemo_transducer",num_threads=4)
out=[]
for win in sys.argv[4:]:
    t0,t1=map(float,win.split("-"))
    seg=a[int(t0*sr):int(t1*sr)]
    s=rec.create_stream(); s.accept_waveform(sr,seg); rec.decode_stream(s)
    r=s.result
    print(f"[{t0:6.2f}-{t1:6.2f}] {r.text}",flush=True)
    toks=list(zip(r.tokens,[t0+x for x in r.timestamps], list(getattr(r,'durations',[]) or [0]*len(r.tokens))))
    # group into words (sentencepiece: '▁' marks word start)
    words=[]
    for tk,ts,d in toks:
        if tk.startswith("▁") or tk.startswith(" ") or not words: words.append([tk.lstrip("▁ "),ts,ts+d])
        else: words[-1][0]+=tk; words[-1][2]=ts+d
    print("   ", " ".join(f"{w}@{s:.2f}-{e:.2f}" for w,s,e in words))
    out+=words
json.dump(out,open(sys.argv[3],"w"),ensure_ascii=False,indent=0)
