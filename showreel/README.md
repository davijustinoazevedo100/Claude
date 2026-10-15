# Claude — Motion Reel 2026

A 15-second motion-design showreel, **1920×1080 at 60 fps with a synthesized soundtrack**, where every frame and every sound is generated from code. No stock footage, templates, plug-ins or samples.

**Video:** [`output/claude-motion-reel-2026.mp4`](output/claude-motion-reel-2026.mp4) · contact sheet: [`output/contact-sheet.png`](output/contact-sheet.png)

The whole piece sits on a 128 BPM grid (32 beats = exactly 15.000 s). Cuts, impacts and staggers are timed in beats, and the score is written against the same grid.

## The cut

| Beats | Time | Section | What's happening |
|---|---|---|---|
| 0–4 | 0.00–1.88 s | **01 Squash & Stretch** | The animator's first exercise, done properly. Ballistic arcs whose ground contacts land on 1, 2, 2.5, 2.75 and 2.875. Contact squash, velocity stretch, onion skins, a live value graph and principle call-outs, then a camera push into the ball that fills the frame on the drop. |
| 4–10 | 1.88–4.69 s | **02 Kinetic Type** | *"I speak MOTION fluently."* Per-letter springs on Anybody's variable **width** axis (50→150), a travelling weight/width wave with live axis readouts, an outlined marquee stack and a venetian-blind wipe. The full stop is the ball from 01. |
| 10–14 | 4.69–6.56 s | **03 Shape Systems** | A Bauhaus tile system grows radially out of that dot. Every motif is a resampled polygon, so anything morphs into anything. Each beat triggers a different wave: rotate, morph, colour flip, row slide. The grid then collapses back into the dot. |
| 14–18 | 6.56–8.44 s | **04 3D / CGI** | Match cut: the flat circle becomes a raymarched sphere. It splits into five glossy candy blobs that orbit, merge with gooey bridges and pulse on the beat, then re-absorbs and shrinks into a UI toggle knob while a blue iris opens out of it. |
| 18–22 | 8.44–10.31 s | **05 UI Motion** | A motion-tool dashboard assembles around that knob. There's an easing editor with springy bezier handles, a timeline whose playhead tracks this reel, a choreographed cursor driving the toggle and slider, counters, a palette and a toast. |
| 22–25 | 10.31–11.72 s | **06 Generative** | The UI is sampled into about 20k particles that disintegrate along a wavefront and ride a curl-noise flow field. On beat 25 they spiral-implode into a single point. |
| 25–28 | 11.72–13.13 s | **07 Range** | Pull-back reveal: that point is the centre tile of a 3×3 grid of *live* miniatures of every previous scene, re-rendered in real time, plus sound and code tiles. The camera then dives back into the dot. |
| 28–32 | 13.13–15.00 s | **08 Hello** | The dot slams down, the wordmark is squeezed out of it letter by letter, and the dot lands as the full stop. Then the subtitle decodes, the dot does one last bounce, and the reel fades out. |

The orange dot is the through-line: ball → full stop → tile → sphere → knob → particle core → logo.

## How it's built

- **Renderer** — `index.html` and `src/` (plain ES modules, no dependencies). Each scene is a pure function of time `render(ctx, t)`, drawn on a 2D canvas. Section 04 is a WebGL2 raymarcher (`src/gl.js`): smooth-min metaballs, a procedural studio environment, clear-coat Fresnel reflections, analytic silhouette anti-aliasing, and a flat↔lit mix that makes the 2D/3D match cuts possible.
- **Motion blur** — real sub-frame accumulation with a 180° shutter: 3–8 samples per frame, more on fast moves. Digital readouts snap to the frame clock so ticking numbers stay crisp.
- **Typography** — Anybody (variable width + weight), Instrument Serif Italic, JetBrains Mono and Inter. Canvas can't set `font-variation-settings`, so the width axis is exposed by registering one `FontFace` per width step and compensating the fractional remainder with a sub-pixel x-scale.
- **Easing language** — a few signature cubic-beziers (`snap`, `out`, `in`, `soft`) plus damped springs, used everywhere so the motion feels like one hand made it.
- **Sound** — `audio/score.py` synthesizes everything with numpy/scipy:
  - Drums: 909-style kick, clap, hats.
  - Bass and harmony: pluck bass, side-chained supersaw pads over an F-minor i–VI–III–VII progression.
  - Sound design, placed on the visual cues: FM plucks and bells, pitched ball bounces, split-flap clicks for the tile flips, bubbles for the blob mitosis, UI clicks for the cursor, a granular dissolve for the particles, risers and impacts.
  - Mastered to about −14 LUFS.
- **Pipeline** — `render.mjs` drives headless Chromium in parallel workers, deterministically frame by frame, writes a PNG sequence, then ffmpeg adds a touch of film grain and encodes H.264 + AAC.

## Rebuild

Requires Node 18+, Playwright with Chromium, Python 3 with numpy and scipy, and ffmpeg.

```bash
python3 audio/score.py audio/soundtrack.wav        # ~15 s
node render.mjs frames --workers 4                 # 900 frames -> build/frames
node render.mjs encode                             # -> output/claude-motion-reel-2026.mp4

# handy while iterating
node render.mjs stills --times 1.2,5.6,9.6 --scale 0.5 --sub 1
python3 tools/contact.py build/stills build/sheet.png 4 480
python3 tools/spectrogram.py audio/soundtrack.wav build/spec.png
```

Serve the folder and open `index.html?play&audio=audio/soundtrack.wav` for a real-time preview. It runs without motion blur, so it's lighter than the offline render.

Fonts are from Google Fonts (SIL Open Font License).
