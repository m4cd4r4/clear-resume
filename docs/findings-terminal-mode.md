# Findings: terminal mode, first end-to-end run

Recorded from the first end-to-end run of terminal mode on `feat/auto-continue-vscode`,
2026-10-01 20:54 to 2026-10-02 08:35 AWST. Measured on Windows 11, VS Code 1.138, Claude Code
2.1.286; extension built from 1cd9d20, `clearResume.autoContinue.mode` = `terminal`. Design:
[AUTO-CONTINUE.md](AUTO-CONTINUE.md), "Phase 2b".

## The run

A test repo (`I:/Scratch/cr-e2e`) where each session appends links to a chain with a script
and commits, until the nudge asks it to hand over.

| Segment | Surface | Links | How it ended |
|---|---|---|---|
| 1 | panel | 1-261 | void: see "Plugins load when the tab opens" |
| 2 | panel, handover loaded by hand | 262-516 | nudge at 180k, auto handover; the extension archived it seconds later and opened a terminal (22:13:05) |
| 3 | terminal, opened by the extension | 517-688 | stopped by hand: no nudge could fire (finding 2) |

The panel-to-terminal handoff worked: the record carried the window key and `surface:
panel`, the extension archived it (`via: "extension"`) and started `claude "Continue from
... .md ..."` in a new terminal with no keypress. Two things then stopped the chain.

## 1. The CLI's trust prompt waits in a terminal nobody is watching

The terminal session started, then sat idle for ten hours: no transcript, no commits, no
hook processes. It was waiting on "Do you trust the files in this folder?".

The CLI's check, read from `claude.exe` 2.1.286: `projects?.[key]?.hasTrustDialogAccepted
=== true` in `~/.claude.json`, where `key` is the git root of the cwd (forward slashes).
The lookup is exact:

- **No parent walk.** `I:/Scratch` was trusted, `I:/Scratch/cr-e2e` had no entry, so it asked.
- **No case folding.** The file holds `C:/Scratch/Donnacha: true` beside
  `c:/Scratch/Donnacha: false` as separate keys.

Panel sessions never show the prompt, so a folder used only from the panel is untrusted as
far as a terminal is concerned. The fix (`cliTrusts` in `extension/src/terminal.ts`) applies
the same rule before opening a terminal and continues in the panel when it fails. It folds
nothing and walks nothing on purpose: a false "untrusted" costs one panel continue, a false
"trusted" hangs the chain without a sign.

## 2. An inherited nested-session marker turns the transcript off, so the nudge never fires

Once the prompt was accepted, segment 3 ran 172 links but its context was never measured.
The CLI printed "Transcript saving is off - inherited CLAUDE_CODE_CHILD_SESSION marker".
The nudge (`plugin/scripts/lib/nudge.mjs`) reads context size from `transcript_path`; with
no transcript, `lastContextTokens` returns null and the Stop and PostToolUse hooks say
nothing. The session would have run until Claude Code compacted on its own. **As built,
terminal mode could not complete a chain.**

Where the marker came from is not established. Ruled out:

- VS Code itself: its main process was started by `explorer.exe` (2026-10-01 20:37), not
  from a Claude session.
- Claude Code's VS Code extension: the only variable it adds to terminals
  (`environmentVariableCollection`) is `CLAUDE_CODE_SSE_PORT`.
- The User and Machine environment, and the PowerShell profiles.
- This extension: `createTerminal` added only `CLEAR_RESUME_WINDOW` and `CLEAR_RESUME_TERMINAL`.

Not checked: the Git Bash startup files (the window's default terminal profile).

The fix does not depend on the source. Claude Code's own extension deletes `CLAUDECODE`,
`CLAUDE_CODE_CHILD_SESSION`, `TRACEPARENT` and `TRACESTATE` from the environment every time
it starts the CLI. `terminalEnv` sets the same four to `null`, which `createTerminal` reads as
"unset". If the marker comes from the shell's own startup files, unsetting it in the terminal's
environment will not help; the re-run will show which.

## 3. The auto-mode classifier can stop an unattended chain

Both a panel session (link 345) and the terminal session (link 689, auto mode on) were
refused "Permission denied by the auto mode classifier" on the same `bash link.sh` call that
had passed hundreds of times. A person was asked each time; in an unattended chain that is
where the chain stops.

Not a code fix. An unattended chain needs a settings allow rule for every command its loop
runs, and its handovers must not tell the next session to stop and ask (segment 2's did,
which is why the terminal session asked).

## Plugins load when the tab opens

Segment 1 is void. Its panel tab opened at 20:54, the marketplace was pointed at the branch
at 20:55, and the session ran the plugin it loaded at open: 0.3.0 from `main`, without
`lib/auto.mjs`. It saved a plain handover with no auto stamp. A panel tab loads plugins when
it opens, not at its first prompt, so a test must open its tab after the switch.

## Smaller things seen

- **Panel sessions ignore `terminal.integrated.env.windows`.** The run set
  `CLEAR_RESUME_NUDGE_AT=110000` there; panel sessions used the plugin option `nudge_at`
  (180000). Only terminal sessions see that setting.
- **`archivedBy.owner` is empty** when the extension archives a record.
- **The load hook reported segment 1's handover as "belongs to another open window"** although
  its owner process (37284) had exited. Owner liveness in `plugin/scripts/lib/owner.mjs` needs
  a look.

## Test-protocol mistakes, so the next run avoids them

- Someone answered "Bump to 3" in the E2E chat during segment 2. That ran
  `/clear-resume:auto 3` and reset the window budget, so this run says nothing about budget
  accounting. Nobody types into an E2E window during a run.
- See finding 3: handovers in an unattended chain must not tell the next session to ask.
