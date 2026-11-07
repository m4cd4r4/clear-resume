---
name: stats
description: Show this month's relay windows, sessions and relays by repo, and last month's totals. Use for '/cornerman:stats', 'cornerman stats', 'how much did the relay run this month'.
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" *)
---

# stats

Run this, exactly as written, with nothing chained before or after it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs"
```

Show the user what it prints, as it prints it, in a code block. Add nothing unless they ask
a question about it.

What the numbers mean, if asked: a window is one Claude Code window the relay ran in, sessions
are the sessions it carried, and relays are the times it cleared and continued a session. They
come from the relay files under `~/.cornerman/relay/` and, once a window has been idle 14 days
and its file removed, from its line in `~/.cornerman/ledger/`. The command only reads.
