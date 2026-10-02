# Findings: interactive auto-continue (phase 2)

Recorded while building phase 2 on `feat/auto-continue-vscode` (2026-10-01). Measured on
Windows 11, VS Code 1.138, Claude Code 2.1.285. Design: [AUTO-CONTINUE.md](AUTO-CONTINUE.md).

## Claude Code chat tabs, as another extension sees them

- A chat tab is a `TabInputWebview` whose `viewType` contains `claudeVSCodePanel`
  (`mainThreadWebview-claudeVSCodePanel`).
- Every chat tab is labelled `Claude Code`. Nothing on the tab names its session.
- `vscode.window.tabGroups.close(tab)` closes it and returns `true`.

So the old session's tab can only be named by elimination: it was the one Claude tab in the
window before the continue, and the continue added exactly one more. In any other layout the
extension closes nothing, because a wrong guess closes a live session
(`extension/src/oldtab.ts`).

## Testing the extension in a second VS Code

1. **A throwaway profile does not isolate Claude Code.** `--user-data-dir` and
   `--extensions-dir` give VS Code its own state, but a copy of the Claude Code extension in that
   window still reads and writes the real `~/.claude`. Signing in there rewrote
   `~/.claude/.credentials.json`, and every Claude Code session open on the machine restarted.
   Launch any test window that holds the Claude Code extension with `CLAUDE_CONFIG_DIR` set to a
   throwaway folder, and do not sign in inside it.
2. **A VS Code launched from inside VS Code's own terminal exits silently.** It inherits
   `ELECTRON_RUN_AS_NODE=1` and runs as plain node. Clear every `ELECTRON_*` and `VSCODE_*`
   variable first.
3. **A pending silent update blocks new VS Code processes.** While the background installer
   waits for every window to close, it holds the `vscode-updating` mutex, and a new process
   exits with "Code is currently being updated". The portable zip build has no installer, so
   it starts anyway.

## Testing the plugin side

- **Which copy of the plugin is live depends on the marketplace type.** With a directory
  marketplace (`/plugin marketplace add <local path>`), `${CLAUDE_PLUGIN_ROOT}` is
  `<that path>/plugin`, the checkout itself, not `~/.claude/plugins/cache/...`. Editing the
  cache changes nothing. To test a branch, point the marketplace at a worktree of that branch,
  and start a new session: hooks, skills and commands are read at session start.
- **A command added on a branch is missing until then.** `/clear-resume:auto` did not exist in
  a session started against the main checkout, because `commands/` did not exist there.
- **Clicking the status bar during a test rewrites the budget.** Each click steps
  off -> 3 -> unlimited and writes a fresh record (`used: 0`), so a click can leave the window
  at off just before a save, and the save is then correctly not stamped auto.

## The window key

Measured on 2026-09-30 and still true here: a hook's `CLAUDE_PID` has the window's extension
host as its parent, and that host is the clear-resume extension's own `process.pid`. The test
window's host started at the same second the extension estimated from `process.uptime()`.
