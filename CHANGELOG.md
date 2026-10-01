# Changelog

## Unreleased

### Added

- **Interactive auto-continue in VS Code** (phase 2, in progress). `/clear-resume:auto <off|on|unlimited|n>`
  sets how many times a window may continue by itself; a status-bar item shows and steps it.
  When the nudge fires in a window with budget left, Claude commits, saves a handover and ends
  its turn, and the extension opens the next conversation from it. The old tab closes when it
  can be named. Two continued sessions in a row with no commit stop the chain.
- **Terminal mode for auto-continue.** New setting `clearResume.autoContinue.mode`: `same`
  (default) continues on the surface the session ran on, `panel` or `terminal` force one. In
  terminal mode the next session starts in a new VS Code terminal with no keypress, and the
  old terminal closes. A `claude` started in any terminal of the window can now use
  `/clear-resume:auto`.
  See [docs/AUTO-CONTINUE.md](docs/AUTO-CONTINUE.md) and
  [docs/findings-auto-continue-phase2.md](docs/findings-auto-continue-phase2.md).

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
