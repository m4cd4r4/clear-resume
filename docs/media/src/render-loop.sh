#!/usr/bin/env bash
# Render loop.html frame by frame and join the frames into docs/media/loop.webp.
# Needs Brave and Python with Pillow. Takes a few minutes: one Brave launch per frame.
# Usage: bash docs/media/src/render-loop.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
media="$(cd "$here/.." && pwd)"
brave="/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
prof="$(cygpath -m "$here/.brave-render")"
src="file:///$(cygpath -m "$here/loop.html")"
frames="$here/.frames"; rm -rf "$frames"; mkdir -p "$frames"
flags=(--headless=new --disable-gpu --hide-scrollbars --no-first-run --allow-file-access-from-files --user-data-dir="$prof")

timeout 60 "$brave" "${flags[@]}" --virtual-time-budget=2000 --dump-dom "$src#list" 2>/dev/null \
  | sed -n 's:.*<pre id="list">\(.*\)</pre>.*:\1:p' > "$frames/durations.json"
n=$(python -c "import json,sys;print(len(json.load(open(sys.argv[1]))))" "$(cygpath -m "$frames/durations.json")")
echo "$n frames"

for ((i=0; i<n; i++)); do
  f="$frames/$(printf '%03d' "$i").png"
  for _ in 1 2; do
    timeout 60 "$brave" "${flags[@]}" --force-device-scale-factor=2 --window-size=600,436 \
      --virtual-time-budget=1500 --screenshot="$(cygpath -m "$f")" "$src#$i" >/dev/null 2>&1 || true
    [ -s "$f" ] && break
  done
  [ -s "$f" ] || { echo "FAIL frame $i"; exit 1; }
done

python - "$(cygpath -m "$frames")" "$(cygpath -m "$media/loop.webp")" <<'EOF'
import json, sys, glob
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
ms = json.load(open(d + "/durations.json"))
ims = [Image.open(p).convert("RGB") for p in sorted(glob.glob(d + "/*.png"))]
ims[0].save(out, save_all=True, append_images=ims[1:], duration=ms, loop=0, lossless=True, quality=100, method=6)
print("ok  ", out, ims[0].size, len(ims), "frames", sum(ms), "ms")
EOF
