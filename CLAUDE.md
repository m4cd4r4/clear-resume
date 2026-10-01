# clear-resume: working in this repo

clear-resume is an open-source tool and a public record of how it is built. Keep the
history readable for someone who was not there.

| Path | What |
|---|---|
| `plugin/` | the Claude Code plugin: hooks, skills, commands, scripts |
| `plugin/packages/store/` | the handover store, shared by the plugin and the extension |
| `extension/` | the VS Code extension (sidebar, status bar, auto-continue) |
| `docs/` | design docs and findings |
| `test/` | vitest, run with `npm test` |

## Hygiene, every change

1. **A branch and a PR.** Never commit to `main`. One feature or fix per PR; small commits
   with conventional messages that say why.
2. **Findings go in the repo, in the same PR.** Anything learned by measuring or probing
   (how Claude Code or VS Code actually behaves, a trap a test fell into) goes in
   `docs/findings-<topic>.md`: what was measured, on which versions, and what it means for the
   code. A finding that lives only in a chat or a private note is lost.
3. **Design docs stay true.** When code changes what a design doc says, update the doc in the
   same PR, including its status line.
4. **CHANGELOG `## Unreleased`** gets a user-facing line for every feature or fix.
5. **The PR description matches the branch.** Update it when the scope or status changes;
   a draft lists what is still to do.
6. **Tests first** for logic. Code that needs the `vscode` API is kept thin; the decision it
   makes goes in a plain function with a unit test (`extension/src/oldtab.ts` is the pattern).

## Testing a branch for real

Read [docs/findings-auto-continue-phase2.md](docs/findings-auto-continue-phase2.md) first. In
short:

- With a directory marketplace the live plugin is the checkout, not the plugin cache. Point
  the marketplace at a worktree of the branch and start a new session.
- A second VS Code for testing needs a throwaway `--user-data-dir`, `--extensions-dir` and
  `CLAUDE_CONFIG_DIR`. Without the last one, a sign-in there replaces the login of every
  Claude Code session on the machine. Never sign in inside a test window.
