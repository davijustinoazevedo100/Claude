#!/bin/sh
# Full pipeline: vector fit -> timeline cues -> soundtrack -> 60 fps render.
#   ./build.sh            (needs node 18+, python3 with numpy/scipy/opencv/pillow, ffmpeg)
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
mkdir -p build output
python3 -P tools/fit_shapes.py assets/drear.png assets/gravity.png src/shapes.js
node render.mjs cues build/cues.json
python3 -P audio/soundtrack.py build/cues.json build/soundtrack_raw.wav
./audio/normalize.sh build/soundtrack_raw.wav build/soundtrack.wav
node render.mjs video output/drear-opium5-ad.mp4 --fps 60 --audio build/soundtrack.wav
node render.mjs stills build/poster 119.5 && cp build/poster/t_119.50.png output/poster.png
