# Changelog

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
