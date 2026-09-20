# clear-resume

A Claude Code plugin for a simple habit: write a handover, clear the session, and pick up
where you left off in a fresh context. Nothing to paste and nothing to type after `/clear`.

## Why

Long Claude Code sessions carry every earlier message into every new one. Clearing often and
resuming from a short written handover keeps each message's context small. In one user's
transcripts, median context per call fell from about 290k tokens to 193k in the week this
habit was automated (N = 196k calls). That is less context per message, not necessarily
fewer tokens in total.

## How it works

1. Run `/clear-resume:handover`. Claude checks git, writes a short handover (goal, state,
   next action, decisions, traps) and saves it under `~/.clear-resume/<repo>/waiting/`.
2. Type `/clear`.
3. The plugin's SessionStart hook loads the handover into the fresh context and moves it to
   `archive/`, so it loads exactly once.

When several handovers wait for one repo (two windows on different branches), the one for
the current branch loads and the rest are listed, never guessed. A lone handover from another
branch loads too, because a new cloud session starts on a new branch. Handovers older than 7
days are listed, not loaded.

## Install

Requires Node 18 or later and git. Clone the repo, then start Claude Code with the plugin:

```bash
git clone https://github.com/m4cd4r4/clear-resume
claude --plugin-dir ./clear-resume
```

`--plugin-dir` loads it for that session. There is no marketplace listing.

## Settings

All optional, set as environment variables (for example in the `env` block of
`~/.claude/settings.json`):

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

- **Nudge at a threshold.** Once the session's context is above `CLEAR_RESUME_NUDGE_AT`,
  Claude is asked once per session to write a handover and tell you to type `/clear`. The
  size is read from the session transcript on disk. Pick a threshold well above your
  session-start size (rules, CLAUDE.md and tool schemas), or the nudge fires on almost every
  session.
  
  It is checked in two places, because one turn can cross the threshold and be compacted
  without ever ending: after each tool call, where it warns and lets the turn continue, and
  when a turn ends, where it blocks so the handover gets written before anything else. The
  two share one mark, so you are interrupted once per session either way.
- **After compaction.** When Claude Code compacts the context, the plugin tells the new
  context to re-check git and file state, and loads a waiting handover if there is one. This
  part is always on.

As a backstop, set auto-compaction to fire well before the window is full with
`/autocompact` (or the `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable), for example
at 250k tokens.

## Claude Code on the web (opt-in)

A cloud session's home folder is not kept between sessions, and a new cloud session can start
from a cached clone that is behind your last push. With `CLEAR_RESUME_WEB=1`, the handover skill
also pushes the handover to its own branch, `clear-resume/<your-branch>`, as a single commit
holding only `.clear-resume/HANDOVER.md`. Your branch, index and files are never touched. The
next session fetches, loads the handover once, and overwrites that branch with an empty commit
(a cloud session is allowed to force-push but not to delete a branch). One such branch per
branch you work on stays on the remote; delete them yourself whenever you like.

Set it in the repo's `.claude/settings.json`, since a cloud session does not read your local
settings:

```json
{ "env": { "CLEAR_RESUME_WEB": "1" } }
```

## Privacy

Everything runs locally. The plugin reads your repo's git state and, in auto mode, the tail
of the current session's transcript file to measure context size. It sends nothing anywhere.
Handovers are plain text: do not put secrets in them. In web mode the handover is committed
and pushed to your repo's remote, so anyone who can read that repo can read it.

## Limitations

- Cannot trigger `/clear` or `/compact`: you type `/clear`.
- Web mode passed a live test on Claude Code on the web on 2026-09-19: saved in one cloud session, loaded in the next.
- In web mode the hook runs one `git fetch origin` (5-second limit) before searching, because a cloud session can start from a cached clone. Offline, it searches what is already fetched.

## Development

```bash
npm install
npx vitest run
```

## Licence

MIT

## Syncing two machines

The store is a folder of small JSON files whose names carry the machine that wrote
them, so two machines can never write the same path. That makes it a git repo that
cannot conflict on creates.

```
node scripts/sync.mjs init git@github.com:you/your-store.git   # once per machine
node scripts/sync.mjs                                          # a sync by hand
```

Use a **private** repo. The store holds every handover you have written - repo
paths, branch names, whatever was in context at the time.

Once it is set up, a session start pulls before it decides what to offer you, and
writing a handover pushes in the background. Both fail soft: offline, a remote that
has gone away, or a store that was never set up all leave the session working
exactly as it did before.

Deleting a handover writes a tombstone rather than removing the file, because an
absent file is not a delete - the machine that still has the original would put it
back. Tombstones are unlinked for real after 90 days, by whichever machine sees
them expire first.

### Setting up the second machine

The first machine runs `init` against an empty private repo, as above. The second
one already has a store to join, so it clones instead:

```bash
git clone git@github.com:you/your-store.git ~/.clear-resume
git clone https://github.com/m4cd4r4/clear-resume
claude --plugin-dir ./clear-resume
```

That is the whole setup. `init` is for creating the store; running it against a
store that already exists elsewhere is how you end up with two of them.

If the second machine already has handovers of its own, do not clone over them -
move them aside, clone, then copy the JSON files back into `handovers/`. Their
filenames carry the machine that wrote them, so they cannot collide with anything
already there.

For the VS Code sidebar, install the extension from a packaged build rather than
from source:

```bash
cd clear-resume/extension && npm install && node esbuild.mjs
npx @vscode/vsce package --no-dependencies --allow-missing-repository
code --install-extension clear-resume-*.vsix --force
```

Do **not** launch an Extension Development Host to try it. On Windows
`code --extensionDevelopmentPath` attaches to the running VS Code and restarts it,
closing every window you have open.

### What each machine does on its own

| When | What happens | If the network is down |
|---|---|---|
| Session start | Pull, then prune expired records | Session starts normally, 8s cap |
| Handover saved | Push, detached, in the background | The change waits for the next push |
| Sidebar pin, delete, archive | Push, detached | Same |
| Two machines rewrote one record | Later `updatedAt` wins | n/a - settled at the next pull |

Set `CLEAR_RESUME_SYNC=off` on a machine that should keep a private store.

### Proving it before you trust it

```bash
node scripts/drill.mjs                    # synthetic store, no network
node scripts/drill.mjs <your-store-url>   # your real store, at its real size
```

Two machines, four fights: the same record rewritten on both in each push order,
a delete racing an edit, and simultaneous creates. Then it checks the two stores
agree record for record.

Given a URL it **clones** your store into a throwaway bare repo and pushes only
there. Your remote is read, never written, and `~/.clear-resume` is never opened.

