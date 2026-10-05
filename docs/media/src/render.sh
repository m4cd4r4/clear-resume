#!/usr/bin/env bash
# Render the README cards in cards.html to docs/media/<card>.png at 2x, with a
# transparent background, each cropped to its card. Needs Brave and Python with Pillow.
# Usage: bash docs/media/src/render.sh [card ...]   (default: every card)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
media="$(cd "$here/.." && pwd)"
brave="/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
prof="$(cygpath -m "$here/.brave-render")"
src="file:///$(cygpath -m "$here/cards.html")"
cards=("$@"); [ ${#cards[@]} -gt 0 ] || cards=(banner problem nudge numbers copy windows)

for c in "${cards[@]}"; do
  out="$media/$c.png"; rm -f "$out"
  for _ in 1 2; do
    timeout 60 "$brave" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
      --allow-file-access-from-files --user-data-dir="$prof" --force-device-scale-factor=2 \
      --default-background-color=00000000 --window-size=1400,1400 \
      --virtual-time-budget=3000 --screenshot="$(cygpath -m "$out")" "$src#$c" >/dev/null 2>&1 || true
    [ -s "$out" ] && break
  done
  [ -s "$out" ] || { echo "FAIL $c"; exit 1; }
  python - "$out" <<'EOF'
import sys
from PIL import Image
p = sys.argv[1]
im = Image.open(p).convert("RGBA")
im.crop(im.getchannel("A").getbbox()).save(p, optimize=True)
print("ok  ", p.split("/")[-1], Image.open(p).size)
EOF
done
echo "Now Read each PNG at full size before committing."
