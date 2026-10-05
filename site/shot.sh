#!/usr/bin/env bash
# Headless Brave screenshots of a site page into site/shots/.
# Usage: bash site/shot.sh [full-page-height] [page.html]   (defaults 6000, index.html)
# Writes desktop-top.png (1440x900), mobile-top.png (390x844),
# desktop-full.png (1440xH) and mobile-full.png (390xH). For a page other than
# index.html the names get its prefix: how-it-works-desktop-top.png and so on.
# Optional third argument "slices": also writes desktop-sNN.png and
# mobile-sNN.png, the page in 1600 px tall slices that stay readable.
#
# Headless Brave will not lay out narrower than ~500 px, so mobile shots render
# the page inside a 390 px iframe on a 500 px window. The grey strip on the
# right carries a badge: green "ok" = no horizontal overflow at 390, red
# "OVERFLOW" = something is wider than 390 and must be fixed.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
brave="/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
out="$here/shots"
prof="$(cygpath -m "$here/.brave-shot")"
full="${1:-6000}"
pg="${2:-index.html}"
[ -f "$here/$pg" ] || { echo "no such page: site/$pg"; exit 1; }
pre=""; [ "$pg" = index.html ] || pre="${pg%.html}-"
slices="${3:-}"
mkdir -p "$out"

cat > "$out/_m.html" <<'EOF'
<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#3a3a3a;overflow:hidden}iframe{display:block;width:390px;border:0;background:#fff}#w{position:fixed;left:394px;top:4px;width:102px;font:bold 11px/1.3 monospace;color:#fff;word-wrap:break-word}</style></head>
<body><iframe id="f"></iframe><div id="w">?</div>
<script>var q=new URLSearchParams(location.search),f=document.getElementById('f'),fw=+(q.get('w')||390);f.style.width=fw+'px';f.style.height=(q.get('h')||844)+'px';f.style.marginTop=-(q.get('y')||0)+'px';if(fw>500)w.style.display='none';f.onload=function(){try{var d=f.contentDocument.documentElement;w.textContent='inner '+f.contentWindow.innerWidth+' scroll '+d.scrollWidth+(d.scrollWidth>fw?' OVERFLOW':' ok');w.style.background=d.scrollWidth>fw?'#c00':'#060'}catch(e){w.textContent='no access: '+e.name}};f.src='../'+(q.get('p')||'index.html')</script></body></html>
EOF

shoot() { # name window-width height url
  local file
  file="$(cygpath -m "$out/$1.png")"
  rm -f "$out/$1.png"
  # timeout + one retry: a fresh profile's first launch has hung forever before
  for _ in 1 2; do
    timeout 60 "$brave" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
      --allow-file-access-from-files --user-data-dir="$prof" --window-size="$2,$3" \
      --virtual-time-budget=4000 --screenshot="$file" "$4" >/dev/null 2>&1 || true
    [ -s "$out/$1.png" ] && break
  done
  if [ -s "$out/$1.png" ]; then echo "ok   site/shots/$1.png"; else echo "FAIL $1"; return 1; fi
}

page="file:///$(cygpath -m "$here/$pg")"
mob="file:///$(cygpath -m "$out/_m.html")"
# Third argument "print": print the page to site/shots/<page>-print.pdf (A4,
# print media) instead of taking screenshots. Read the PDF to check it.
if [ "$slices" = print ]; then
  pdf="$out/${pg%.html}-print.pdf"; rm -f "$pdf"
  for _ in 1 2; do
    timeout 60 "$brave" --headless=new --disable-gpu --no-first-run --no-pdf-header-footer \
      --allow-file-access-from-files --user-data-dir="$prof" --virtual-time-budget=4000 \
      --print-to-pdf="$(cygpath -m "$pdf")" "$page" >/dev/null 2>&1 || true
    [ -s "$pdf" ] && break
  done
  if [ -s "$pdf" ]; then echo "ok   site/shots/${pg%.html}-print.pdf"; else echo "FAIL print"; exit 1; fi
  exit 0
fi
shoot "${pre}desktop-top" 1440 900 "$page"
shoot "${pre}mobile-top" 500 844 "$mob?h=844&p=$pg"
shoot "${pre}desktop-full" 1440 "$full" "$page"
shoot "${pre}mobile-full" 500 "$full" "$mob?h=$full&p=$pg"
if [ "$slices" = slices ]; then
  rm -f "$out/${pre}"desktop-s*.png "$out/${pre}"mobile-s*.png
  n=0
  for ((y=0; y<full; y+=1600)); do
    n=$((n+1)); id=$(printf '%02d' "$n")
    shoot "${pre}desktop-s$id" 1440 1600 "$mob?w=1440&h=$full&y=$y&p=$pg"
    shoot "${pre}mobile-s$id" 500 1600 "$mob?h=$full&y=$y&p=$pg"
  done
fi
echo "Now Read the PNGs. In the mobile shots, a red OVERFLOW badge in the grey strip is a bug to fix."
