# clear-resume

A Claude Code plugin for a simple habit: write a handover, clear the session, and pick up
where you left off in a fresh context.

Status: early. The first commits are a feasibility spike, kept in the history on purpose.

## Why

Long Claude Code sessions carry every earlier message into every new one. Clearing often and
resuming from a short written handover keeps each message's context small. In one user's
transcripts, median context per call fell from about 290k tokens to 193k in the week this
habit was automated (N = 196k calls). That is less context per message, not necessarily
fewer tokens in total.

## Plan

- `/handover` skill: writes a short handover for the current work.
- SessionStart hook: after `/clear` (or a new session), loads the waiting handover
  automatically, so there is nothing to type.
- Runs locally only. Reads nothing outside your machine and sends nothing anywhere.

## Auto mode (opt-in)

Claude Code cannot run `/clear` from a hook, so the plugin can only get close to automatic.
Auto mode does two things:

1. **Nudge at a threshold.** When a turn ends and the session's context is above
   `CLEAR_RESUME_NUDGE_AT` tokens (default 180000), Claude is asked once per session to
   write a handover and tell you to type `/clear`. The size is read from the session
   transcript on disk. Pick a threshold well above your session-start size (rules,
   CLAUDE.md and tool schemas), or the nudge fires on almost every session.
2. **Safety net after compaction.** When Claude Code compacts the context, the plugin
   tells the new context to re-check git and file state, and loads a waiting handover if
   there is one. This part is always on.

Turn the nudge on in `~/.claude/settings.json`:

```json
{
  "env": {
    "CLEAR_RESUME_AUTO": "1",
    "CLEAR_RESUME_NUDGE_AT": "180000"
  }
}
```

## Claude Code on the web (opt-in)

Handovers are saved under `~/.clear-resume/` on the machine running Claude Code. In a
cloud session that folder has survived a new session in testing, but not reliably enough
to depend on. With `CLEAR_RESUME_WEB=1`, `/handover` also commits
`.clear-resume/HANDOVER.md` on the current branch and pushes it. The next session finds
it in its working tree or on any already-fetched remote branch, loads it once, and
deletes the working-tree copy in a commit of its own. Only that one file is ever
committed: your staged and untracked work is left alone.

Set it in the repo's `.claude/settings.json`, since a cloud session does not read your
local settings:

```json
{ "env": { "CLEAR_RESUME_WEB": "1" } }
```

## Compaction backstop

For a backstop, set auto-compaction to fire well before the window is full with
`/autocompact` (or the `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable), for
example at 250k tokens.

## Licence

MIT
