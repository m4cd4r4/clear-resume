# clear-resume

A Claude Code plugin for one habit: write a handover, clear the session, carry on in a fresh
context. Nothing to paste and nothing to type after `/clear`.

## Why

A Claude Code session sends every earlier message with every new one, so a long session gets
more expensive and less accurate as it goes. Clearing resets that, but clearing loses your
place, so in practice nobody clears until the session is already struggling.

This plugin removes the reason not to clear. You ask for a handover, Claude writes a short
brief about the work, and the next session picks it up on its own.

## The loop

1. Run `/clear-resume:handover`. Claude checks git, writes a short brief (goal, state, next
   action, decisions, traps) and saves it to
   `~/.clear-resume/handovers/<machine>-<pid>-<timestamp>.json`.
2. Type `/clear`.
3. The plugin's SessionStart hook puts that handover into the fresh session's context and
   marks it archived, so it loads exactly once.

That is the whole thing. Step 3 needs no input from you: the hook runs on every session
start, clear and compaction, and stays silent when there is nothing waiting.

### What a handover looks like

Claude writes something like this, under 40 lines, with empty sections left out:

```markdown
# Cart totals rounding

## Goal
Make the basket total match the line items when a discount is applied.

## State
- Branch `feat/cart-totals`, last commit `a1b2c3d`, no PR yet.
- Rounding helper written in `src/money.js`, unit tests pass.
- The checkout summary component is not wired up yet.

## Next action
Run `npm test -- totals` and fix the failing case for a 3-for-2 offer.

## Decisions already made
Round at the line, not at the total.

## Key files
- src/money.js - the rounding helper
```

The next session is told to treat those claims as a snapshot and re-check them, because a
branch or a file can move between sessions.

### When more than one is waiting

Two windows on one repo write two handovers. The plugin never guesses between them:

- A handover for the branch you are on loads.
- If none matches your branch but exactly one is waiting, that one loads. A cloud session
  starts on a fresh branch, so a mismatch there is normal.
- Otherwise it lists them by title and branch and waits for you to say which.
- A handover older than 7 days is listed, never loaded, so a forgotten one cannot land in
  unrelated work.

## Install

Node 18 or later, and git.

```bash
claude plugin marketplace add m4cd4r4/clear-resume
claude plugin install clear-resume@clear-resume
```

The repo is its own marketplace, so that is the whole install. To try it for one session
without installing anything:

```bash
git clone https://github.com/m4cd4r4/clear-resume
claude --plugin-dir ./clear-resume
```

## What it costs you

- **A turn.** Writing a handover is Claude doing work: it runs a few git commands and writes
  30-odd lines.
- **Files on disk.** One small JSON file per handover under `~/.clear-resume/handovers/`,
  plain text, holding whatever the handover said. Resumed handovers are kept for 30 days and
  then removed; nothing grows without limit, but nothing is encrypted either.
- **Two hooks per session.** SessionStart on every start, clear and compaction. In auto mode,
  also a PostToolUse and a Stop hook, each reading the tail of the transcript file.

## Settings

All optional, set as environment variables, for example in the `env` block of
`~/.claude/settings.json`:

| Variable | Default | What it does |
|---|---|---|
| `CLEAR_RESUME_AUTO` | off | `1` turns on the context-size nudge (below). |
| `CLEAR_RESUME_NUDGE_AT` | `180000` | Context size, in tokens, that triggers the nudge. |
| `CLEAR_RESUME_WEB` | off | `1` also carries handovers in git, for Claude Code on the web. |
| `CLEAR_RESUME_MAX_AGE_DAYS` | `7` | Older handovers are listed, not loaded. |
| `CLEAR_RESUME_HOME` | `~/.clear-resume` | Where handovers are stored. |
| `CLEAR_RESUME_SYNC` | on | `off` stops syncing entirely, both directions. |
| `CLEAR_RESUME_SYNC_TIMEOUT_MS` | `8000` | How long a session start waits on the pull before giving up. |

## Auto mode (opt-in)

Claude Code cannot run `/clear` from a hook, so the plugin can only get close to automatic.

- **Nudge at a threshold.** Once the session's context passes `CLEAR_RESUME_NUDGE_AT`, Claude
  is asked, once per session, to write a handover and tell you to type `/clear`. The size is
  read from the session transcript on disk. Set the threshold well above your session-start
  size (rules, CLAUDE.md and tool schemas) or it fires on almost every session.

  It is checked in two places, because one long turn can cross the threshold and be compacted
  without ever ending: after each tool call, where it warns and lets the turn continue, and
  when a turn ends, where it blocks so the handover gets written first. The two share one
  mark, so you are interrupted once per session either way.
- **After compaction.** When Claude Code compacts the context, the plugin tells the new
  context to re-check git and file state, and loads a waiting handover if there is one. This
  part is always on.

As a backstop, set auto-compaction to fire well before the window is full, with
`/autocompact` or the `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable, for example at
250k tokens.

## Claude Code on the web (opt-in)

A cloud session's home folder is not kept between sessions, and a new cloud session can start
from a cached clone that is behind your last push. With `CLEAR_RESUME_WEB=1` the handover
skill also pushes the handover to its own branch, `clear-resume/<your-branch>`, as a single
commit holding only `.clear-resume/HANDOVER.md`. Your branch, index and files are never
touched. The next session fetches, loads the handover once, and overwrites that branch with an
empty commit (a cloud session may force-push but may not delete a branch). One such branch per
branch you work on stays on the remote; delete them yourself whenever you like.

Set it in the repo's `.claude/settings.json`, since a cloud session does not read your local
settings:

```json
{ "env": { "CLEAR_RESUME_WEB": "1" } }
```

## The VS Code sidebar (optional)

A separate extension in [`extension/`](extension) gives you a **Handovers** sidebar: browse
every handover grouped into current repo, other repos and stale, pin one to keep it out of the
timers, and resume one into a Claude Code tab with the prompt pre-filled and unsent. It reads
and writes the same store as the plugin.

The plugin covers the common path. The sidebar is for the rest: an older handover, one from
another repo, or one you want to read before you resume it.

Install it from a packaged build rather than from source:

```bash
cd extension && npm install && node esbuild.mjs
npx @vscode/vsce package --no-dependencies --allow-missing-repository
code --install-extension clear-resume-*.vsix --force
```

Do **not** launch an Extension Development Host to try it. On Windows
`code --extensionDevelopmentPath` attaches to the running VS Code and restarts it, closing
every window you have open.

## Syncing two machines (optional)

The store is a folder of small JSON files whose names carry the machine that wrote them, so
two machines can never write the same path. That makes it a git repo that cannot conflict on
creates.

```bash
node scripts/sync.mjs init git@github.com:you/your-store.git   # once per machine
node scripts/sync.mjs                                          # a sync by hand
```

Use a **private** repo. The store holds every handover you have written: repo paths, branch
names, whatever was in context at the time.

Once it is set up, a session start pulls before deciding what to offer you, and writing a
handover pushes in the background. Both fail soft: offline, a remote that has gone away, or a
store that was never set up all leave the session working exactly as it did before.

Deleting a handover writes a tombstone rather than removing the file, because an absent file
is not a delete and the machine that still has the original would put it back. Tombstones are
unlinked for real after 90 days, by whichever machine sees them expire first.

### Setting up the second machine

The first machine runs `init` against an empty private repo, as above. The second one already
has a store to join, so it clones instead:

```bash
git clone git@github.com:you/your-store.git ~/.clear-resume
claude plugin marketplace add m4cd4r4/clear-resume
claude plugin install clear-resume@clear-resume
```

That is the whole setup. `init` is for creating a store; running it against a store that
already exists elsewhere is how you end up with two of them.

If the second machine already has handovers of its own, do not clone over them. Move them
aside, clone, then copy the JSON files back into `handovers/`. Their filenames carry the
machine that wrote them, so they cannot collide with anything already there.

### What each machine does on its own

| When | What happens | If the network is down |
|---|---|---|
| Session start | Pull, then prune expired records | Session starts normally, 8s cap |
| Handover saved | Push, detached, in the background | The change waits for the next push |
| Sidebar pin, delete, archive | Push, detached | Same |
| Two machines rewrote one record | Later `updatedAt` wins | Settled at the next pull |

Set `CLEAR_RESUME_SYNC=off` on a machine that should keep a private store.

### Proving it before you trust it

```bash
node scripts/drill.mjs                    # synthetic store, no network
node scripts/drill.mjs <your-store-url>   # your real store, at its real size
```

Two machines, four fights: the same record rewritten on both in each push order, a delete
racing an edit, and simultaneous creates. Then it checks the two stores agree record for
record.

Given a URL it **clones** your store into a throwaway bare repo and pushes only there. Your
remote is read, never written, and `~/.clear-resume` is never opened.

## Privacy

Everything runs locally and the plugin sends nothing anywhere by itself. It reads your repo's
git state and, in auto mode, the tail of the current session's transcript file to measure
context size.

Two things leave your machine only if you turn them on:

- **Sync** pushes the whole store to the git remote you give it. Use a private repo.
- **Web mode** commits and pushes the handover to your repo's remote, so anyone who can read
  that repo can read it.

Handovers are plain text. Do not put secrets in them.

## Limitations

- It cannot trigger `/clear` or `/compact`. You type `/clear`.
- The hook stays silent on failure by design, so a broken plugin never blocks a session. The
  cost is that a genuine fault is quiet too.
- In web mode the hook runs one `git fetch origin` with a 5-second limit before searching,
  because a cloud session can start from a cached clone. Offline, it searches what is already
  fetched.

## Development

```bash
npm install
npx vitest run
```

Web mode was tested live on Claude Code on the web on 2026-09-19: saved in one cloud session,
loaded in the next.

## Licence

MIT
