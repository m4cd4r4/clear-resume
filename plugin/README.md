# clear-resume

Clear the chat. Keep the goal, the next step and the decisions.

Before you `/clear` a long Claude Code chat, type `/clear-resume:handover`. Claude writes a short note about the work, called a handover: the goal, the next action, where things stand, the decisions made and what already failed. The plugin saves it. After `/clear`, the fresh session starts with the handover already loaded, so you type `go` and Claude carries on. Nothing to paste.

In one measured run, Claude built a site across 15 sessions with 91.0M tokens. The same work as one long chat, with no clears, comes to about 565.6M tokens (an estimate, and an upper bound).

## Use it

1. `/clear-resume:handover`: Claude reads your branch, your changes and your last few commits, then writes and saves the handover.
2. `/clear`: the fresh session loads it.
3. `go`: Claude carries on from it.

Optional settings, all off by default:

- **Nudge** (`auto_nudge`): when the chat's context passes **Nudge at** (180k tokens by default), Claude is asked once per session to save a handover.
- **Relay** (`relay`): after Claude saves a handover, the plugin runs `/clear` and submits the prompt that continues from it, up to the number of clears you allow. It stops when the budget is used or when two continued sessions in a row make no new commit. Needs Claude Code 2.1.275 or later.
- **Idle handover** (`idle_handover`: `off`, `toast` or `auto`; with `cache_ttl_minutes`, default 60, and `idle_min_tokens`, default 100000): when you have been away until about 5 minutes before the prompt cache would expire and the context is at least `idle_min_tokens`, show a message (`toast`) or ask Claude for a handover (`auto`), once per session. Measured once (n=1, Sonnet 5.5, 390k tokens): resuming cold cost US$1.56, a handover written while the cache was warm US$0.30 in all. Details: [HOW-IT-WORKS](../docs/HOW-IT-WORKS.md#idle-handover-before-the-cache-expires).

## What it runs, stores and sends

- **Hooks.** `SessionStart` (startup, clear and compact) loads a waiting handover. `PostToolUse` and `Stop` check the context size for the nudge and the relay. Each hook runs `node` on a script in this plugin, and exits quietly if Node 18 or later is missing.
- **Git, read-only by default.** The plugin runs `git` in your repo to read the branch, status and recent commits. It never switches your branch or touches your index or files, and outside web mode (below) it never commits or pushes.
- **Storage.** Handovers are plain text files on your disk, in `~/.clear-resume`. Each loaded handover is also copied to `~/.clear-resume/loaded/` for 30 days. Keep secrets out of them.
- **Network: nothing by default.** No telemetry, no analytics, no web requests. Two opt-in modes use git and nothing else:
  - **Sync** pushes and pulls the store to a private git remote that you set up.
  - **Web mode** (`CLEAR_RESUME_WEB=1`, for Claude Code on the web) pushes each handover to its own `clear-resume/<branch>` branch on your repo's `origin`, and runs one `git fetch origin` at session start. Handovers found in git are listed as untrusted and never loaded on their own.

### The relay mod (`hooks/relay.ts`)

A mod is a function-hooks module that runs inside Claude Code. This one runs the relay. It also runs the optional idle handover (below), and nothing else.

- **When it is active.** Only when Relay is on: the `relay` setting, or `/relay` typed in that window. Otherwise it registers the `/relay` command and the status line, and nothing more.
- **Programs it starts.** One: `git rev-parse HEAD` in the current repo, with a 5 second timeout (the `headOf` function). The stall guard compares the commit before and after each continued session, to stop when two in a row make no new commit. If git is missing or fails, it carries on without the check. It starts no other program.
- **Slash command it runs.** `/clear`, once after Claude saves a handover, and only while the number of clears used is below the budget you set.
- **Prompt it submits.** After the clear, as if you typed it: "Continue from the clear-resume handover that was just loaded." It contains no conversation text.
- **Files it writes.** A status file at `~/.clear-resume/relay/<key>.json` (or `$CLEAR_RESUME_HOME/relay/<key>.json`). Fields: `v`, `key`, `cwd`, `sessions` (this window's session ids, up to 100), `limit`, `configured`, `used`, `stalled`, `applied`, `updatedAt`. Only the VS Code status bar reads it (the extension that ships with clear-resume), to show the clears left. The mod also reads `<key>.set.json` beside it, which the status bar writes to change the budget. It writes no settings, build, start-up or instructions file.
- **Idle handover.** Only when `idle_handover` is `toast` or `auto`. It then reads the clock and the context size (`$.session.usage()`; if the host gives none, the tail of the session transcript under `~/.claude/projects`, or `$CLAUDE_CONFIG_DIR/projects`) after each reply, counts the tool calls and turns in flight, and every 30 seconds may show a toast or, with `auto`, submit "Write a clear-resume handover now, with the /clear-resume:handover skill." as if you typed it. It writes one marker file, `~/.clear-resume/.nudged/<session id>` (the one the context nudge also writes), so it acts once per session. It sends nothing anywhere.
- **What it adds.** The `/relay` command (`off`, `on`, `unlimited` or a number), the status line entry that shows the clears left, and toasts that report a stop or a refused command.
- **Network.** It sends nothing anywhere. No data leaves your machine.
- **The `tool.call` and `turn.start` hooks.** They only count calls and turns in flight, for the idle handover. They do not filter, rewrite or deny anything.
- **The `command.run` hook.** It is the handler for the plugin's own `/relay` command, and it only answers that command. It does not filter, rewrite or decide on any other command.

## Requirements

Node 18 or later and git. On Windows, Claude Code runs plugin hooks through Git Bash, which comes with Git for Windows.

## More

- Full README, with the replay video and comparisons with `/compact` and `--resume`: https://github.com/m4cd4r4/clear-resume
- How it works, every setting and the opt-in modes: https://github.com/m4cd4r4/clear-resume/blob/main/docs/HOW-IT-WORKS.md
- Site: https://m4cd4r4.github.io/clear-resume

MIT licence.
