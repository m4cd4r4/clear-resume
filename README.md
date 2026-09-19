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

## Auto mode (opt-in)

Claude Code cannot run `/clear` from a hook, so the plugin can only get close to automatic.

- **Nudge at a threshold.** When a turn ends and the session's context is above
  `CLEAR_RESUME_NUDGE_AT`, Claude is asked once per session to write a handover and tell you
  to type `/clear`. The size is read from the session transcript on disk. Pick a threshold
  well above your session-start size (rules, CLAUDE.md and tool schemas), or the nudge fires
  on almost every session.
- **After compaction.** When Claude Code compacts the context, the plugin tells the new
  context to re-check git and file state, and loads a waiting handover if there is one. This
  part is always on.

As a backstop, set auto-compaction to fire well before the window is full with
`/autocompact` (or the `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable), for example
at 250k tokens.

## Claude Code on the web (opt-in)

A cloud session's home folder is not kept between sessions: in a live test it was gone in the next session. With `CLEAR_RESUME_WEB=1`, the handover skill also commits
`.clear-resume/HANDOVER.md` on the current branch and pushes it. The next session finds it in
its working tree or on any already-fetched remote branch, loads it once, and deletes the
working-tree copy in a commit of its own. Only that one file is ever committed: your staged
and untracked work is left alone.

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
- The web fallback has passed one live test on Claude Code on the web (save in one cloud session, load in the next).
- In web mode the hook runs one `git fetch origin` (5-second limit) before searching, because a cloud session can start from a cached clone. Offline, it searches what is already fetched.

## Development

```bash
npm install
npx vitest run
```

## Licence

MIT
