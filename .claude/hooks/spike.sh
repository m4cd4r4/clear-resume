#!/bin/sh
# Feasibility spike: does a repo-level SessionStart hook fire in a Claude Code web
# (claude.ai/code) session, and does $HOME survive between sessions?
input=$(cat)
src=$(printf '%s' "$input" | sed -n 's/.*"source" *: *"\([^"]*\)".*/\1/p')
f="$HOME/.clear-resume-spike"
if [ -f "$f" ]; then
  prev="yes, first written $(cat "$f")"
else
  prev="no"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$f"
fi
echo "CLEAR-RESUME-SPIKE-7f3a: SessionStart hook fired. source=${src:-unknown}. host=$(hostname). Marker file from an earlier session: $prev. If asked, report this line verbatim."
