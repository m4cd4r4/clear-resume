---
description: Let this VS Code window continue itself - after a handover, the clear-resume extension opens the next conversation. Takes off, on (3), unlimited, or a number.
argument-hint: off | on | unlimited | <number>
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/auto.mjs" *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/auto.mjs" $ARGUMENTS`

Tell the user the line above in one sentence, and nothing else. If it says nothing
was set, say why in its words.
