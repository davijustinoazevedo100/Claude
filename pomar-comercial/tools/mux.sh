#!/usr/bin/env bash
# Normalises the soundtrack to -16 LUFS (two-pass loudnorm, linear) and muxes it with the rendered video.
# Usage: tools/mux.sh <video.mp4> <music.wav> <out.mp4>
# Writes <out.mp4>, plus the normalised music next to it as trilha-pomar.wav / trilha-pomar.m4a.
set -euo pipefail
V=$1; A=$2; OUT=$3
DIR=$(dirname "$OUT")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

J=$(ffmpeg -hide_banner -nostats -i "$A" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$J" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
AF="loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true"

ffmpeg -y -hide_banner -loglevel error -i "$A" -af "$AF" -ar 48000 -c:a pcm_s16le "$TMP/music.wav"
cp "$TMP/music.wav" "$DIR/trilha-pomar.wav"
ffmpeg -y -hide_banner -loglevel error -i "$TMP/music.wav" -c:a aac -b:a 256k -movflags +faststart "$DIR/trilha-pomar.m4a"
ffmpeg -y -hide_banner -loglevel error -i "$V" -i "$TMP/music.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k \
  -shortest -movflags +faststart "$OUT"
echo "ok: $OUT"
