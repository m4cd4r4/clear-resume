---
name: handover
description: Write a short handover for the current work so a fresh session (after /clear) picks it up automatically. Use for '/handover', 'write a handover', 'hand this off', 'save my place before I clear'.
---

# handover

Write a handover a fresh session can act on without this conversation, then save it.
After the user runs `/clear`, the plugin's SessionStart hook loads it for them.

## 1. Check the facts first

Run these rather than recalling them. A handover with a wrong branch or a stale
"next step" costs the next session more than it saves.

```bash
git branch --show-current
git status --short
git log --oneline -5
```

## 2. Write it

Aim for under 40 lines.

Write for someone who has never seen this project. The next session has none of
this conversation and none of your reasoning, so every reference has to stand on
its own: name files by path, name decisions by what was decided rather than "as
discussed", and never say "the usual place" or "the file we changed".

`Next action` comes second, straight after the goal, because it is the line that
gets read first and acted on.

```markdown
# <title>

## Goal
One or two sentences: what this work is for, and what "done" means.

## Next action
The single first thing to do, concrete enough to run: a command, or a file:line
and the change to make there. Not a topic to look into.

## State
- Branch, last commit, PR number if there is one.
- Done and verified, with how it was verified (the command, and what it printed).
- In progress, uncommitted, or unverified. Say which.

## Decisions already made
Choices the user settled that the next session must not reopen. One line each,
with the reason if the decision looks arbitrary without it.

## Do not
Traps, approaches already tried and failed, anything off-limits. Say what happened,
so it is not retried in a slightly different form.

## Key files
- path/to/file - why it matters
```

Leave out sections that would be empty; an empty heading costs the reader a stop.
Do not include secrets, tokens or passwords: the file is plain text on disk.

## 3. Save it

Pass the handover on stdin with a short title. Use a quoted heredoc so `$` and
backticks in the text are kept as written:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/save.mjs" --title "<short title>" <<'EOF'
<the handover markdown>
EOF
```

It saves one JSON record under `~/.clear-resume/handovers/`. Saving again on the
same branch archives the earlier handover, so there is only ever one waiting per
branch.

With `CLEAR_RESUME_WEB=1` set (for Claude Code on the web), it also commits
`.clear-resume/HANDOVER.md` on the current branch and pushes it, so the next cloud
session can find it. If the output says the push failed, push the branch before
telling the user to start a new session.

## 4. Tell the user

One line: the saved path, and that running `/clear` now will load it in the fresh session.
