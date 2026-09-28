# How clear-resume works

The details behind the [README](../README.md).

## What a handover looks like

Claude writes something like this, under 40 lines, with empty sections left out:

```markdown
# Cart totals rounding

## Goal
Make the basket total match the line items when a discount is applied.

## Next action
Run `npm test -- totals` and fix the failing case for a 3-for-2 offer.

## State
- Branch `feat/cart-totals`, last commit `a1b2c3d`, no PR yet.
- Rounding helper written in `src/money.js`, unit tests pass.
- The checkout summary component is not wired up yet.

## Decisions already made
Round at the line, not at the total.

## Key files
- src/money.js - the rounding helper
```

The skill also has a `Do not` section for traps and approaches that already failed. The next
session is told to treat branch, file and status claims as a snapshot and check them before
acting, because a branch or a file can move between sessions.

## Where handovers live

One JSON file per handover in `~/.clear-resume/handovers/`, named
`<machine>-<pid>-<time>.json`. `CLEAR_RESUME_HOME` moves the whole store.

A handover is filed against the folder the session started in, even after a `cd`. It loads only
in that checkout. A handover written in a git worktree is not offered in the repo's main
checkout, and one written in the main checkout is not offered in a worktree.

| Record | What happens | When |
|---|---|---|
| Waiting | Listed, not loaded (the sidebar's Stale group) | After 7 days |
| Waiting | Never deleted, however old | |
| Loaded (archived) | Body dropped, record kept as a tombstone | 30 days after loading |
| Tombstone | File deleted | 90 days after that |

Pinning a handover in the sidebar keeps it out of the Stale group and the two deletion timers.
The hook still lists, and does not load, a pinned handover older than 7 days. The store is tidied
at every session start and when the sidebar starts.

Beside the handovers folder, each repo gets a folder with a `consumed.txt` log (one line per loaded handover)
and auto mode keeps one marker file per nudged session in `.nudged/`. Nothing prunes either.

### The readable copy

Each time a handover loads, the plugin also writes it as plain markdown to
`~/.clear-resume/loaded/<repo>-<title>-<id>.md` (title, repo, branch, when it was saved and
loaded, then the body) and prints the path on the line under the load message. Open it to reread
what the session started from, or @-mention it in another session. The name holds no user or
machine name. A copy is deleted 30 days after its handover loaded, with the record's body. The
folder has a `.gitignore`, so sync never pushes the copies. If the copy cannot be written, the
handover still loads and no path is printed.

## Which handover loads

At session start, `/clear` or compaction, the hook looks at the handovers waiting for this repo
and applies the first rule that fits. "Fresh" means no more than 7 days old and not dated more than 5
minutes in the future.

1. The newest fresh handover this window wrote loads, whatever its branch.
2. A handover that belongs to another open window never loads here. It is listed.
3. Otherwise the newest fresh handover on your current branch loads.
4. Otherwise, if only one handover is waiting for this repo and it is fresh, it loads,
   whatever its branch.
5. Otherwise nothing loads. The hook lists the handovers by title and branch, and Claude asks
   which one you want.

The handover that loads is marked archived, so it loads once. Any others still waiting are
listed under it. A handover that is not fresh is only ever listed.

After compaction, the session loads only its own window's handover. Anything else waiting is
listed.

A window is its Claude Code process: the process id plus the time that process started, so a
new process that reuses a closed window's pid is not mistaken for it. If the pid is in use but
the process list cannot be read in time, the plugin assumes the window is still open, and its
handover is listed rather than loaded. If this window's own start time cannot be read, no
handover counts as its own: one on the current branch still loads by rule 3, and after
compaction nothing loads.

In web mode, a handover carried in git is listed as untrusted repo content and never loaded.
See [Claude Code on the web](#claude-code-on-the-web-opt-in).

## Reading or moving a handover: --peek and --take

The listing gives Claude the command for each handover. To run it yourself, from inside the
repo, the script is
`~/.claude/plugins/cache/clear-resume/clear-resume/<version>/scripts/load.mjs`.

| Command | What it does |
|---|---|
| `node load.mjs` | Lists what is waiting for this repo: short id, title, branch. |
| `node load.mjs <id>` | Prints it and archives it. If another open window owns it, prints it and leaves it waiting. |
| `node load.mjs --peek <id>` | Prints it and never archives it. |
| `node load.mjs --take <id>` | Prints it and archives it here, whoever owns it. |

A handover can be named by its short id, its file name or its exact title.

`--peek` and `--take` also find a handover that has already loaded, so one from a window that has
since closed can still be read. `--take` on a loaded handover puts it back to waiting as this
window's, and it loads at this window's next `/clear`. A load by this script writes the readable
copy too.

## Settings

All optional. Set them as environment variables, for example in the `env` block of
`~/.claude/settings.json`:

| Variable | Default | What it does |
|---|---|---|
| `CLEAR_RESUME_AUTO` | off | `1` turns on the context-size nudge. |
| `CLEAR_RESUME_NUDGE_AT` | `180000` | Context size, in tokens, that triggers the nudge. |
| `CLEAR_RESUME_WEB` | off | `1` also carries handovers in git, for Claude Code on the web. |
| `CLEAR_RESUME_MAX_AGE_DAYS` | `7` | Older handovers are listed, not loaded. |
| `CLEAR_RESUME_HOME` | `~/.clear-resume` | Where handovers are stored. |
| `CLEAR_RESUME_SYNC` | on once set up | Sync only runs after `sync.mjs init` makes the store a git repo. `off` stops the plugin's pull and push on this machine. The sidebar does not read it. |
| `CLEAR_RESUME_SYNC_TIMEOUT_MS` | `8000` | How long a session start waits on the pull before giving up. |

The VS Code sidebar does not read Claude Code's settings. If you move the store, set the
sidebar's `clearResume.storePath` to the same folder.

## Auto mode (opt-in)

Claude Code cannot run `/clear` from a hook, so the plugin can only get close to automatic.

With `CLEAR_RESUME_AUTO=1`, once the session's context passes `CLEAR_RESUME_NUDGE_AT`, Claude
is asked, once per session, to write a handover and tell you to type `/clear`. The size is read
from the tail of the session transcript on disk. Set the threshold well above your
session-start size (rules, CLAUDE.md and tool schemas) or it fires on almost every session.

It is checked after each tool call, where it warns and lets the turn continue, and when a turn
ends, where it keeps the turn going so the handover gets written first. The first matters
because one long turn can cross the threshold and be compacted without ever ending. The two
share one mark, so you are interrupted once per session.

You see one status line, such as `clear-resume: context is about 182k tokens (nudge at 180k).
Claude is asked to save a handover, then you can type /clear.` It is a note, not an error. At a
turn end, the instruction to Claude also shows, labelled `Stop hook feedback`.

After any compaction the plugin tells the new context to re-check git and file state. That part
is always on.

As a backstop, set auto-compaction to fire well before the window is full, with
`/autocompact` or the `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable, for example at
250k tokens.

## Claude Code on the web (opt-in)

A cloud session's home folder, and the store in it, is not kept between sessions. With
`CLEAR_RESUME_WEB=1`, saving a handover also pushes it to its own branch on `origin`,
`clear-resume/<your-branch>`, as a single commit holding only `.clear-resume/HANDOVER.md`.
Your branch, index and files are not touched.

A new cloud session can start from a cached clone that is behind your last push, so the next
session with web mode on runs one `git fetch origin`, limited to 5 seconds (offline, it uses
what is already fetched). Then it looks for handovers in git: on `clear-resume/*` branches of
the remote, and in a `.clear-resume/HANDOVER.md` committed to the repo. It lists up to three
of them as untrusted repo content, each with a command that prints it, counts the rest, and
never loads them. Anyone who can push to the repo could have written them. Ask Claude to print
the one you want. A handover still waiting in your store, or loaded once, is not listed again.

An untracked `.clear-resume/HANDOVER.md` in your working tree is treated as yours: it can load
like a stored handover, and it is deleted once it has loaded.

The session-start hook never commits, pushes or changes a branch in your repo; in web mode its
only git write there is that fetch. Nothing deletes the `clear-resume/*` branches: the next
save from the same branch overwrites one, and you can delete them yourself. Outside web mode
the plugin does not look for handovers in git at all.

A cloud session does not read your local settings, so set it in the repo's
`.claude/settings.json`:

```json
{ "env": { "CLEAR_RESUME_WEB": "1" } }
```

## Syncing two machines (optional)

Handover file names carry the machine that wrote them, so two machines never create the same
file, and the store can be a git repo that never conflicts on creates.

Run these from a clone of this repo, on each machine, against the same **private** repo
(empty at the start):

```bash
git clone https://github.com/m4cd4r4/clear-resume
cd clear-resume
node plugin/scripts/sync.mjs init git@github.com:you/your-store.git
```

On the second machine, `init` merges the handovers it already has with the store on the
remote. A machine with none yet can clone the store into `~/.clear-resume` (or your
`CLEAR_RESUME_HOME`) instead. `node plugin/scripts/sync.mjs` runs a sync by hand. The store holds
every handover you have written, with repo paths, branch names and whatever was in context, so
keep the repo private.

After that, a session start pulls before deciding what to offer, and a save pushes in the
background. Both fail soft: offline, or with a remote that has gone, the session works as
before.

A delete writes a tombstone rather than removing the file, because the machine that still has
the original would put an absent file back. Tombstones are deleted for real after 90 days, by
whichever machine sees them expire first.

Both machines write one file: each repo's `consumed.txt`. If both add to it between syncs, the
merge keeps this machine's copy. That log only stops a web-mode handover being listed twice,
so the cost is a repeat listing.

### What each machine does on its own

| When | What happens | If the network is down |
|---|---|---|
| Session start | Pull, then prune expired records | Session starts normally, 8s cap |
| Handover saved | Push, detached, in the background | The change waits for the next push |
| Sidebar resume, pin, delete | Push, detached | Same |
| Two machines rewrote one record | Later `updatedAt` wins | Settled at the next pull |

`CLEAR_RESUME_SYNC=off` stops the plugin's sync on one machine. The sidebar reads its own
environment, not Claude Code's settings, so it still pushes its own changes.

### Proving it before you trust it

From the same clone:

```bash
node scripts/drill.mjs                    # synthetic store, no network
node scripts/drill.mjs <your-store-url>   # your real store, at its real size
```

Two machines, four fights: the same record rewritten on both in each push order, a delete
racing an edit, and simultaneous creates. Then it checks the two stores agree record for
record. Given a URL, it clones your store into a throwaway bare repo and pushes only there:
your remote is read, never written, and `~/.clear-resume` is never opened.

## The VS Code sidebar (optional)

A separate extension in [`extension/`](../extension/README.md) gives you a **Handovers**
sidebar: browse every handover grouped into current repo, other repos and stale, pin one to
keep it out of the timers, and resume one into a Claude Code tab with the prompt pre-filled and
unsent. A **Loaded** group at the top lists the handovers loaded in the last 24 hours, and a
status-bar item names the one this workspace loaded, such as
`Handover: Cart totals rounding (loaded 3h ago)`. Either opens the readable copy. It reads and
writes the same store as the plugin.

The plugin covers the common path. The sidebar is for the rest: an older handover, one from
another repo, or one you want to read before you resume it.

Install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=macdara.clear-resume)
or [Open VSX](https://open-vsx.org/extension/macdara/clear-resume):

```bash
code --install-extension macdara.clear-resume
```

To build and install your own copy from a clone of this repo instead:

```bash
cd extension
npm install
node esbuild.mjs
npx @vscode/vsce package --no-dependencies --allow-missing-repository --out clear-resume.vsix
code --install-extension clear-resume.vsix --force
```

Do not launch an Extension Development Host to try it. On Windows
`code --extensionDevelopmentPath` attaches to the running VS Code and restarts it, closing every
window you have open.

## Cost

- **A turn.** Writing a handover is Claude doing work: it runs a few git commands and writes
  under 40 lines.
- **No permission prompt for the save.** The handover skill pre-approves the plugin's own
  `save.mjs` and `load.mjs`, and nothing else, for the turn the skill runs in. The git commands
  it runs are read-only. If Claude starts the skill without you typing `/clear-resume:handover`,
  Claude Code asks once whether to use the skill.
- **Files on disk.** One small JSON file per handover, plain text and not encrypted, and a
  markdown copy of each loaded one, removed on the timers in
  [Where handovers live](#where-handovers-live).
- **The session-start hook.** It runs at every start, `/clear` and compaction, with a 10-second
  limit. It reads git and the store. When handovers are waiting, it also reads the process list,
  within a time budget that keeps the hook inside its limit. With sync set up it first pulls,
  for up to 8 seconds. In web mode it also fetches, for up to 5 seconds.
- **Two more hooks.** PostToolUse runs after every tool call and Stop after every turn, auto
  mode or not. With auto mode off, each starts node and exits before importing anything else. In
  auto mode each reads the last 256 KB of the transcript file, and reads further back, up to
  16 MB, only when that part holds no main-thread assistant turn with a token count.

## Privacy

The plugin runs locally. What it reads:

- Your repo's git state: top folder, branch and worktrees. In web mode, also the
  `clear-resume/*` refs and any committed `.clear-resume/HANDOVER.md`.
- The process list, to tell Claude windows apart: process id, parent id, name and start time.
- The start of the current session's transcript, when a handover is saved, to find the folder
  the session started in. In auto mode, also the end of it, to measure the context size.

What it writes: each handover record holds its title and body, the repo path, branch, machine
name, and the owning window's process id and start time. What the plugin prints names a
handover by its title and a short id, not its file name, which holds the machine name. The one
exception is the warning printed when a save cannot find its own record again. The readable copy
of a loaded handover is named after the repo folder and the title, and its path is printed
relative to `~`.

A loaded handover becomes part of the session's context, like any text Claude reads.

Two things leave your machine, and only if you turn them on:

- **Sync** pushes the whole store to the git remote you give it. Use a private repo.
- **Web mode** pushes each handover to your repo's remote, with its title, branch and the
  repo's local path. Anyone who can read that repo can read it.

Handovers are plain text. Do not put secrets in them.

## Limitations

- It cannot trigger `/clear` or `/compact`. You type `/clear`.
- A handover loads on its own only in the window that wrote it, while that window is open.
  Once that window has closed, the branch rules in [Which handover loads](#which-handover-loads)
  decide.
- A handover loads only in the checkout it was written in. Another worktree of the same repo,
  or its main checkout, does not see it.
- Nothing loads on `--resume` or `/resume`. The hook runs at startup, `/clear` and compaction.
- When the process list cannot be read in time, a handover whose window may still be open is
  listed, not loaded. `load.mjs --take` moves it.
- The hooks stay silent on failure by design, so a broken plugin never blocks a session. The
  cost is that a genuine fault is quiet too.
- The hooks run `node` from your PATH. Without Node 18 or later there, a session start shows
  one line saying so and nothing loads.
- On Windows, Claude Code runs plugin hooks through Git Bash, which comes with Git for Windows.
- Web mode was run live on Claude Code on the web once, on 2026-09-19, before it changed to
  listing handovers instead of loading them. It has not been tested there since.
- macOS and Linux have not been tested by hand. The test suite runs on both in CI.

## Troubleshooting: my handover did not load

1. **Did the save succeed?** Its last line is `After /clear, the next session in <folder> loads
   it automatically.` If it printed a `WARNING`, load the handover with the command in it.
2. **Is it another open window's?** It is listed. Read it with `--peek`, or move it here with
   `--take`.
3. **Is it older than 7 days?** It is listed. Load it by hand, or raise
   `CLEAR_RESUME_MAX_AGE_DAYS`.
4. **Were several waiting on other branches?** They are listed. Say which one.
5. **Did you start with `--resume` or `/resume`?** The hook does not run then.
6. **Is the new session in the same folder?** A handover loads only in the checkout it was
   written in, the folder the save names. A save made in a worktree says so.
7. **Did the session start with `clear-resume needs Node.js 18 or later on your PATH`?** Install
   Node 18 or later where Claude Code can find it, and restart Claude Code.
8. **Still nothing?** Run `load.mjs` from inside the repo to list what is waiting, and ask Claude
   to run `node --version`: the hooks need `node` on the PATH Claude Code sees.

## Updating and contributing

### Updating

```bash
claude plugin marketplace update clear-resume
claude plugin update clear-resume@clear-resume
```

Restart Claude Code afterwards.

### Trying it without installing

The repo is its own marketplace (`.claude-plugin/marketplace.json`), and the plugin itself is the
`plugin/` folder. To load it for one session only:

```bash
git clone https://github.com/m4cd4r4/clear-resume
claude --plugin-dir ./clear-resume/plugin
```

### Running the tests

```bash
npm install
npx vitest run
```

The plugin itself runs on Node 18 or later. The test tooling (Vite 7) needs Node 20.19+ or
22.12+. CI runs the suite on Node 22 on Windows, macOS and Linux.

An install copies `plugin/` and nothing else. Tests, the extension, the demo and the dev scripts
in `scripts/` stay in the repo. `plugin/` has no `package.json`, so an install runs no `npm`,
and `test/plugin-footprint.test.mjs` fails if that changes.

### Developing this plugin

Installing the plugin copies `plugin/` into
`~/.claude/plugins/cache/clear-resume/clear-resume/<version>/`, and a session loads that copy,
not your checkout. A change you merge reaches your install only after an update:

```bash
git pull --ff-only                                  # 1. bring the repo up to date
claude plugin marketplace update clear-resume       # 2. re-read the marketplace
claude plugin update clear-resume@clear-resume      # 3. copy the new version into the cache
```

Where step 2 reads from depends on how you added the marketplace. Added from the GitHub URL, it
reads GitHub's `main`, so a change arrives once it is pushed there. Added from a local clone
(`claude plugin marketplace add <path>`), it reads that clone. Skipping steps 2 and 3 left a
merged fix unused three times between 2026-09-20 and 2026-09-27.

**In the primary checkout, a `git pull` on `main` can run steps 2 and 3 for you.**
`.githooks/post-merge` and `.githooks/post-rewrite` (a merge or fast-forward pull, and a
`--rebase` one) run the two `claude plugin` commands when the branch is `main`, the checkout is
the primary one (not a linked worktree), and the pull touched `plugin/` or
`.claude-plugin/`. It never fails the pull: it prints one line saying
what it did and exits 0. The logic is in `scripts/lib/auto-update-hook.mjs`, tested by
`test/auto-update.test.mjs` and `test/auto-update-hook.test.mjs`. It is opt-in per clone,
because `core.hooksPath` is local git config and a clone does not inherit it:

```bash
git config core.hooksPath .githooks
```

How the demo video was made is in [`demo/`](../demo/README.md).
