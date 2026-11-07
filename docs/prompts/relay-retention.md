# cornerman wave 2: relay retention Brief

Open this in a **fresh Claude Code session** in this worktree. Don't carry context from the session that wrote it.

## First action: rebase before doing anything else

```bash
git fetch origin main --quiet
git rebase origin/main
```

Then one housekeeping step, done from the **main checkout** `I:/Scratch/clear-resume`, never from inside the folder it removes: wave 1's worktree `I:/Scratch/clear-resume-test-reliability` (branch `fix/test-reliability`, PR #179 merged, issue #178 closed) is ready for `bash ~/.claude/scripts/wt-finish.sh test-reliability`. Confirm it is clean and pushed first.

## The problem

Two things grow without limit. The relay mod writes one `<key>.json` per window ever opened into `<store>/relay` and nothing removes them (1,366 files on 2026-11-04, 734 on 2026-11-07). The sidebar posts about 1.3 MB to its webview on every store change with Archived shown (1,933 archived rows), even while the Archived section is closed.

## Source of truth (read these BEFORE coding)

1. `docs/no-bloat/PROJECT-PLAN.md`: this PR is wave 2. Its six rules are settled; do not reopen them. Rule 1 (delete only files cornerman wrote), 2 (ledger line first), 3 (in the plugin, detached SessionStart job, 24 h marker) and 4 (handovers never deleted; archived rows sent only when Archived is opened) all bind this PR. **The plan says 14 days; TODO 17.2 says 30. The plan wins.**
2. `docs/CLAUDE-TODO.md` items 17.2 and 17.3.
3. `plugin/hooks/relay.ts` (`relayDir`, what the state and `<key>.set.json` files hold) and `plugin/packages/store/relay-state.mjs` (how a live session is matched to a window, via `~/.claude/sessions/<pid>.json`).
4. `plugin/hooks/hooks.json` and `plugin/scripts/hook-entry.cjs` (the SessionStart path the job hangs off; it must return at once).
5. `extension/src/sidebar.ts`, `sidebar-model.ts`, `sidebar-page.ts` (what is posted, and when).
6. The reference implementation of the same pattern: m4cd4r4/questlog PR #26 ("ledger then delete rows past retention, from a once-a-day SessionStart job") and the stress-test table in questlog's `docs/no-bloat/PROJECT-PLAN.md`. Reuse its ledger line shape and its marker-claim approach where they fit; do not import questlog code.

If this brief contradicts the code, the code wins.

## What's in scope

- A retention job in the plugin: ledger line to `~/.cornerman/ledger/YYYY-MM.jsonl` (repo, relays used, applied), then delete relay window files idle 14 days with no live session.
- Its SessionStart wiring, marker file and tests.
- The sidebar sending archived rows only when the Archived section is opened.
- The plan Status table, in this same PR: test-reliability merged (#179), host-perf merged (#177), relay-retention PR open.
- `docs/CLAUDE-TODO.md` 17.2 and 17.3 marked done.

## Out of scope

- Anything under `~/.claude/sessions` (rule 1: read it, never delete from it).
- Handover files, in any state (rule 4).
- The `/cornerman:stats` command and "This month" section (wave 3).
- Version bumps and releases (rule 5).
- The vitest RPC timeout (Vikunja #3686).

## What "good" looks like

- A relay file is deleted only when it is cornerman's own, idle 14 days by its own timestamp, and no live session maps to it. Every deletion has its ledger line written first; a crash between the two never loses the line.
- A file that cannot be deleted (locked, read-only) is ledgered once and retried next run with no duplicate line.
- SessionStart time does not grow: the job is detached and skipped by the 24 h marker. Several sessions starting together run it once.
- With Archived closed, the sidebar post no longer carries archived rows; opening Archived shows them as before.
- Real store: a dry run on a **copy** of `~/.cornerman/relay` lists what would go, and the count is checked by hand against the 14-day and live-session rules, before the job ever runs on the real folder.

## Required deliverables

1. The design in plain text before code: ledger line fields, idle measure, live-session match, marker claim.
2. Code and tests: unit tests for the filter (idle, live, not ours), the ledger-first order and the marker; a test with 3 sessions in one folder (`rules/dev-environment.md`, plugin rule). Neutral fixture paths only.
3. Measured: the sidebar post size with Archived closed, before and after, on the real store.
4. Dry-run output on the copy, in the PR. The first real run is ask-first (it deletes data); log it with `change-log.js`.
5. One issue, one PR with "Closes #N" and the `pr-evidence` section; full suite via `npm test`, CI green on 3 OSes.

## Suggested workflow

1. Read the source files above, then questlog PR #26's diff.
2. Run `/pre-build` if the ledger fields or the live-session match are unclear after reading.
3. Build the filter and ledger first, with tests; wire SessionStart last.
4. Develop the plugin in the sandbox: `node ~/.claude/scripts/plugin-dev.mjs <this worktree>` (never install a dev build into the live config).
5. Sidebar change, measure, then the dry run on the copy.

## Constraints

- One PR. Branch `feat/relay-retention`. No new runtime dependencies.
- Run vitest as `npx vitest run` from the repo root; `npm test` is the results-reading wrapper. A few ignored `onTaskUpdate` replies are known noise (Vikunja #3686); any other error is real.
- No version bump, no release.

## Out-of-scope follow-ups (capture, don't build)

Append to `docs/CLAUDE-TODO.md`. Do not fix inline.

## Why this brief is structured this way

Deleting files is the one-way door here. An age-based clean-up in 0.5.x emptied 860 handovers (restored 2026-11-02), which is why the plan makes the ledger come first, keeps handovers out of reach, and why this brief asks for a dry run on a copy before the real folder.