# Changelog

## Unreleased

- **Idle handover** (off by default). New plugin options `idle_handover` (`off`, `toast`, `auto`),
  `cache_ttl_minutes` (60) and `idle_min_tokens` (100000). About 5 minutes before the prompt cache
  would expire, on a large context, the relay mod shows a message or asks for a handover, once per
  session. In one measurement (n=1) a handover written while warm cost about 5 times less than
  resuming cold.

## VS Code extension 0.4.1

- New icon, matching the plugin's: a line carried across a break, the work surviving `/clear`.
  The marketplace icon and the sidebar icon both change. Nothing else in the extension changes.

## 0.4.0

### Added

- **`/relay` for one window.** `/relay off|on|unlimited|<n>` overrides the `relay` option for the
  window you type it in and starts its count over; a bare `/relay` reports the count. The relay
  now always loads, so `/relay` can turn it on where the option is off.
- **A countdown of the clears left.** The status line shows it while the relay is on. The VS Code
  chat panel draws no plugin status line, so a toast shows it there after each continue.
- **The relay works from the VS Code chat panel.** Proven on Claude Code 2.1.288: `/clear` and the
  continue prompt run in the same tab with no keypress.
- The relay writes each window's state to `<store>/relay/<key>.json` and takes a budget set from
  outside the session, which the extension's status bar uses (below).
- `scripts/label.mjs <slug> --registry <file>` prints a worktree's plan label as JSON, and
  `save.mjs --unowned` writes a handover for a session that has not started yet.

### VS Code extension 0.4.0

- **Context pie** in the status bar, filling towards `nudge_at`: amber from 80%, red past it. Its
  hover card shows the relay, the chain of continued sessions and an upper bound on what the clears
  saved.
- **Relay item** showing this window's clears used against its budget, with a picker to change it.
- **Worktrees view**: the repo's git worktrees, oldest first, each opening in its own window; with
  `clearResume.registryPath` set, rows name their plan row and wave, and queued entries show under
  Next up.
- With two VS Code windows on one repo, each status bar now names its own window's handover and
  reads its own session's context, not the folder's newest.

### Changed

- The README and How it works document the relay, the headless runner and the new status-bar
  items.

## 0.3.2

### Changed

- **The relay stops when work stalls.** With `relay` set (including `unlimited`), it stops after
  two continued sessions in a row make no new commit, and says so, the same rule the headless
  runner uses. Outside a git repo only the budget applies.
- With the relay on, the context nudge tells Claude to end without a handover when the task is
  finished, so the relay does not resume a finished job.

## 0.3.1

### Added

- **The relay: clear and continue with no keypress.** Set the `relay` option (in `/config` or
  `/plugin configure`) to a number of clears per Claude Code window, or `unlimited`. After Claude
  saves a handover, clear-resume runs `/clear` when the turn ends and submits the prompt that
  continues from it. It stays out of the way for a subagent's save, a failed save, an interrupted
  turn and headless runs, and it stops at its budget and says so. Off by default. Needs Claude Code
  2.1.275 or later; an older build ignores it and the rest of clear-resume works as before.

## 0.3.0

### Added

- **Headless runs continue themselves.** `node plugin/scripts/run.mjs` runs `claude -p` in
  segments. When a segment's context passes the nudge size, Claude commits, saves a handover and
  ends; the runner starts a fresh process from that handover, with no `/clear` and nobody typing.
  It needs caps (`--max-segments`, `--total-budget-usd`, and the command's own `--max-turns` and
  `--max-budget-usd`), keeps its handovers in a store of its own, and stops the chain when two
  continued segments in a row make no new commit. See [docs/AUTO-CONTINUE.md](docs/AUTO-CONTINUE.md).
- A handover saved under the runner records `auto`, `chain` (which segment wrote it) and
  `budget` (continues left). A handover you write yourself is unchanged.

## 0.2.1

### Added

- **The nudge has settings in Claude Code.** Turn it on and set its size with
  `/plugin configure clear-resume@clear-resume`, or in `/config` in Claude Code 2.1.269 or later.
  Claude Code keeps the Nudge at setting between 50000 and 1000000 tokens. In the Claude Code panel
  in VS Code, set them from a terminal with `claude plugin install clear-resume@clear-resume --config`.
  The environment variables still work: `CLEAR_RESUME_AUTO` wins whenever it is set, and
  `CLEAR_RESUME_NUDGE_AT` wins when it is a positive number.

## 0.2.0

Write one short handover on purpose, `/clear`, and that window's fresh session picks it up. Other
open windows on the same project only list it, and it can sync across machines over your own git remote.

```bash
claude plugin marketplace add https://github.com/m4cd4r4/clear-resume
claude plugin install clear-resume@clear-resume
```

Already installed? Run `claude plugin marketplace update clear-resume`, then
`claude plugin update clear-resume@clear-resume`, and restart Claude Code.

### Added

- **Each handover belongs to the window that wrote it.** `/clear` loads this window's own handover.
  A handover that another open window owns is only listed.
- **`load.mjs --peek`** reads a handover without taking it; **`--take`** moves another window's
  handover to this one.
- **CI** runs the test suite on Windows, macOS and Linux.
- **The handover a window loaded stays readable.** Each load writes a copy to
  `~/.clear-resume/loaded/`, and the load message names it on a second line. `load.mjs --peek`
  and `--take` also work on a handover that has already loaded, so a closed window's handover
  can be read or moved again.
- **A VS Code extension** (`macdara.clear-resume`, on the Marketplace and Open VSX) shows a sidebar
  of waiting handovers with a Loaded group at the top, and a status-bar item naming the handover
  this workspace loaded. Click either to open the readable copy.

### Changed

- **A window is its Claude Code process id plus the time that process started.** A closed
  window's pid that Windows hands to a new process no longer looks like an open window, and on
  macOS and Linux the plugin now recognises a Claude Code native binary named after its version.
- **After compaction, only this window's own handover loads.** Anything else waiting is listed.
- **Printed output names a handover by its title and a short id**, with paths relative to `~`,
  so no machine or user name appears in it.
- **The save names the folder whose next session loads the handover.** A handover loads in the
  checkout it was saved in; a save in a git worktree says so.
- **The PostToolUse and Stop hooks return at once** unless auto mode is on.
- **Installing copies only the plugin runtime:** 34 files, with no npm install. The plugin
  now lives in the repo's `plugin/` folder; tests, the demo and the extension stay out of it.
- **The auto-mode nudge shows as a status line** instead of a Stop hook error, and names the
  plugin's own `/clear-resume:handover` skill.
- **Saving a handover does not ask for permission.** The skill's save command is pre-approved.
  When Claude starts the skill on its own in manual mode, Claude Code asks once to use it.
- **Claude is asked to name the loaded handover in its first reply.** It does not always do so;
  the load line is the reliable signal.
- **If Node.js 18 or later is missing,** the hooks print one line saying so instead of a hook
  error.

### Fixed

- **In a cloned repo, a handover carried by git is listed as untrusted and never loaded.** A
  committed `.clear-resume/HANDOVER.md`, or in web mode a remote `clear-resume/*` ref, used to
  load as this session's own work. A handover dated in the future no longer sorts newest.
- **The session-start hook never writes to your repo.** It used to remove a loaded working-tree
  copy with `git rm` and a commit on your branch, and force-push the handover ref.
- The install command uses HTTPS. The `owner/repo` shorthand clones over SSH and fails without
  an SSH key.

### Known limitations

- Built and used daily on Windows 11. macOS and Linux pass CI but have not been tested by hand.
- Needs Node.js 18 or later on your PATH. On Windows, Claude Code runs the hooks through Git Bash.
- In web mode, the list of waiting handovers shows full repo paths.
- The loop runs on `/clear`. A session started with `--resume` or `/resume` loads nothing.
