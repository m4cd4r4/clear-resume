# clear-resume

Clear the chat. Keep the goal, the next step and the decisions.

Before you `/clear` a long Claude Code chat, type `/clear-resume:handover`. Claude writes a short note about the work, called a handover: the goal, the next action, where things stand, the decisions made and what already failed. The plugin saves it. After `/clear`, the fresh session starts with the handover already loaded, so you type `go` and Claude carries on. Nothing to paste.

In one measured run, Claude built a site across 15 sessions with 91.0M tokens. The same work as one long chat, with no clears, comes to about 565.6M tokens (an estimate, and an upper bound).

## Use it

1. `/clear-resume:handover`: Claude reads your branch, your changes and your last few commits, then writes and saves the handover.
2. `/clear`: the fresh session loads it.
3. `go`: Claude carries on from it.

Two optional settings, both off by default:

- **Nudge** (`auto_nudge`): when the chat's context passes **Nudge at** (180k tokens by default), Claude is asked once per session to save a handover.
- **Relay** (`relay`): after Claude saves a handover, the plugin runs `/clear` and submits the prompt that continues from it, up to the number of clears you allow. It stops when the budget is used or when two continued sessions in a row make no new commit. Needs Claude Code 2.1.275 or later.

## What it runs, stores and sends

- **Hooks.** `SessionStart` (startup, clear and compact) loads a waiting handover. `PostToolUse` and `Stop` check the context size for the nudge and the relay. Each hook runs `node` on a script in this plugin, and exits quietly if Node 18 or later is missing.
- **A mod** (`hooks/relay.ts`) runs the relay: it runs `/clear` and submits one fixed prompt, "Continue from the clear-resume handover that was just loaded.", only when the relay is on.
- **Git, read-only by default.** The plugin runs `git` in your repo to read the branch, status and recent commits. It never switches your branch or touches your index or files, and outside web mode (below) it never commits or pushes.
- **Storage.** Handovers are plain text files on your disk, in `~/.clear-resume`. Each loaded handover is also copied to `~/.clear-resume/loaded/` for 30 days. Keep secrets out of them.
- **Network: nothing by default.** No telemetry, no analytics, no web requests. Two opt-in modes use git and nothing else:
  - **Sync** pushes and pulls the store to a private git remote that you set up.
  - **Web mode** (`CLEAR_RESUME_WEB=1`, for Claude Code on the web) pushes each handover to its own `clear-resume/<branch>` branch on your repo's `origin`, and runs one `git fetch origin` at session start. Handovers found in git are listed as untrusted and never loaded on their own.

## Requirements

Node 18 or later and git. On Windows, Claude Code runs plugin hooks through Git Bash, which comes with Git for Windows.

## More

- Full README, with the replay video and comparisons with `/compact` and `--resume`: https://github.com/m4cd4r4/clear-resume
- How it works, every setting and the opt-in modes: https://github.com/m4cd4r4/clear-resume/blob/main/docs/HOW-IT-WORKS.md
- Site: https://m4cd4r4.github.io/clear-resume

MIT licence.
