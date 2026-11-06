# No-bloat plan: cornerman (with Questlog in parallel)

Decided with Macdara on 2026-11-06 (grilling session). Questlog has a matching plan in m4cd4r4/questlog
`docs/no-bloat/PROJECT-PLAN.md`. Goal: plugins that stay fast and small however long they are used.

## Rules (settled, do not reopen)

1. A plugin deletes only files it wrote itself. `~/.claude/sessions` belongs to Claude Code: cornerman stops
   scanning it whole, and never deletes from it.
2. Before a file is deleted, one line about it goes to a monthly ledger, `~/.cornerman/ledger/YYYY-MM.jsonl`.
   The ledger syncs with the store (private remote m4cd4r4/clear-resume-store) when sync is set up.
3. Deletion runs in the plugin, not the extension (some users have only the plugin): a SessionStart hook starts
   a detached job and returns at once; a marker file skips it when it ran in the last 24 h.
4. Handovers are never deleted. Archived rows are sent to the sidebar only when Archived is opened.
   (An age-based clean-up in 0.5.x emptied 860 handovers; they were restored on 2026-11-02.)
5. No release until all three waves are merged in both repos. Then cornerman 0.7.2 and the next Questlog
   ship together. Every release step is ask-first. Version bumps only in the release PR.
6. New display copy (stats wording) goes to Macdara as options before it is built.

## Wave 1: trust the tests, finish the host-perf work

| Slug | PR | TODO items |
|---|---|---|
| `test-reliability` | Flaky git tests get their own temp roots and a retrying teardown; site gates run in CI | 1, 17.6, 6 |
| `host-perf` | Process check only for sessions cornerman tracks; async `worktreePaths`; measure the idle-off timer and start it only when needed | 17.5, 17.4, "Idle-off overhead (PR #136)" |

Questlog wave 1 in parallel: `freshness` (its TODO 3).
Alongside: a drafted issue for anthropics/claude-code about `~/.claude/sessions` never being cleaned
(49,304 files on 2026-11-06), for Macdara to file.

Gate: both wave-1 PRs merged, full suite green twice in a row on an idle machine.

## Wave 2: retention

| Slug | PR | TODO items |
|---|---|---|
| `relay-retention` | Ledger line (repo, relays used, applied), then delete relay window files idle 14 days with no live session; archived handovers loaded lazily | 17.2, 17.3 |

Questlog wave 2: `card-retention` (finished cards 7 days, unfinished 30 days, after a ledger line).

## Wave 3: stats and polish

| Slug | PR | TODO items |
|---|---|---|
| `stats` | `/cornerman:stats` command and a "This month" sidebar section, read from the ledger. Wording as options first | new |
| `ux-polish` | `save.mjs` path spellings; nudge says it once; sticky search box | 3, 4, 11 |

Questlog wave 3: `stats` (`/questlog:stats` and a panel section).

## Deferred

Items 9 (idle research runs, needs a spend decision), 10 (screen reader), 12 (session strip and bulk actions),
13 (repo-and-branch rule on the real store). Questlog TODO 2 and 4.

## Status

| Wave | Slug | State |
|---|---|---|
| 1 | test-reliability | not started |
| 1 | host-perf | not started |
| 2 | relay-retention | blocked on wave 1 |
| 3 | stats | blocked on wave 2 |
| 3 | ux-polish | blocked on wave 2 |
