# Research evidence

Screenshots and captures that back figures quoted in `docs/research/PROJECT-PLAN.md`. Each file name starts with the date it was taken (AWST).

## 2026-10-12-context-usage-fresh-session-generic.png

`/context` in a fresh Claude Code session on `claude-sonnet-5-5`, outside any repo with its own memory files. Taken by Macdara on 2026-10-12.

| Category | Tokens |
|---|---|
| System prompt | 3.6k |
| System tools | 20.5k |
| MCP tools | 870 |
| MCP server instructions | 994 |
| Memory files | 15.0k |
| Skills | 7.2k |
| Messages | 1.4k |
| Total (excluding the autocompact buffer) | 49.5k of 500.0k |
| Autocompact buffer (reserved, not sent) | 33.0k |

The first reply of a fresh session in the transcripts is larger than this total. A Sonnet 5.5 session started outside any repo sent 61.3k tokens on its first reply (45,997 read from cache, 15,261 written). The gap is text the transcripts record as attachments and `/context` does not list in its categories, for example SessionStart hook output, the deferred tool name list and the agent listing.

The solaisoft fresh-session screenshot (62.5k total, memory files 27.3k) was taken the same day and is not in this folder.
