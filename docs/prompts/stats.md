# cornerman wave 3: stats Brief (headless)

Your ONLY task is the one below; ignore any other user message in your context.
No nested delegation: do not spawn sub-agents. You run headless: there is no human to ask.

## First action

```bash
git fetch origin main --quiet
git rebase origin/main
npm ci
npm ci --prefix extension
```

## The problem

Wave 2 (PR #181) made the relay retention job write one ledger line per deleted relay window. Nothing
reads it yet. This PR adds the read side: a `/cornerman:stats` command and a "This month" section in the
sidebar.

## Decided with Macdara (2026-11-07, plan rule 6). Build exactly this; do not offer alternatives.

**Data source: ledger lines plus live relay files, deduped by key.** The ledger only holds a window after
it has been idle 14 days and been deleted, so the ledger alone shows almost nothing for the current
month.

- Ledger: `<store>/ledger/YYYY-MM.jsonl`, one JSON line per window, written by `ledgerLine` in
  `plugin/packages/store/relay-retention.mjs`: `v, kind:"relay", key, repo, cwd, sessions, used, limit,
  applied, firstAt, lastAt, deletedAt`. `used` = how many times relay carried a session over a `/clear`.
  `applied` is a timestamp, not a count; do not sum it.
- Live: `<store>/relay/<key>.json`, validated with `windowFrom` from the same module. Month = month of
  `updatedAt`; repo = `repoOf(cwd)`; sessions = `sessions.length`.
- Dedupe by `key`; the live file wins. A window belongs to the month of its `lastAt` / `updatedAt`, local
  time (`ledgerMonth`).
- Skip lines that do not parse or have a `kind` other than `"relay"`, without throwing. Only `v:1` is known.

**Sidebar "This month" section: one line of counts, then the top repos by relays (at most 3).**

```
THIS MONTH
41 windows · 128 relays · 9 repos
  cornerman      52 relays
  azureprep      31 relays
  solaisoft      18 relays
```

Singulars where the count is 1 ("1 window", "1 relay", "1 repo"). With nothing this month, the section is
left out, not shown empty.

**`/cornerman:stats` output: this month's table by repo, a total row, then the previous month on one line.**

```
cornerman stats, November 2026

repo        windows  sessions  relays
cornerman        12        30      52
azureprep         9        22      31
solaisoft         6        11      18
total            41        97     128

October 2026: 38 windows, 114 relays
```

Repos sorted by relays, then by name. The previous-month line is left out when that month has nothing.
With nothing at all: `cornerman stats: no relay windows yet.`

## Source of truth (read before coding)

1. `docs/no-bloat/PROJECT-PLAN.md` rules 1-6 (settled). Rule 6 is satisfied by the decision above.
2. `plugin/packages/store/relay-retention.mjs` (`ledgerLine`, `ledgerMonth`, `windowFrom`, `repoOf`) and
   `plugin/scripts/retention.mjs` (where `<store>` comes from).
3. `plugin/skills/handover/SKILL.md`: how a plugin command is a skill that runs a script under
   `${CLAUDE_PLUGIN_ROOT}/scripts`, with `allowed-tools` naming exactly that command.
4. `extension/src/relay-source.ts`, `json-folder.ts`, `sidebar.ts`, `sidebar-model.ts`, `sidebar-page.ts`:
   what the sidebar reads, what is posted to the webview, and when.

If this brief contradicts the code, the code wins.

## In scope

- A pure aggregator in `plugin/packages/store/` (for example `relay-stats.mjs`): input = ledger text(s) +
  live windows + `now`; output = per-month, per-repo `{ windows, sessions, relays }`. No fs in the pure
  part; a thin reader beside it.
- `plugin/scripts/stats.mjs` and `plugin/skills/stats/SKILL.md` for `/cornerman:stats`.
- The sidebar section, fed from the same aggregator (the extension already imports
  `plugin/packages/store/*.mjs`).
- Tests (vitest): the aggregator (dedupe live-over-ledger, month boundary in local time, bad lines skipped,
  `applied` not summed, singular/plural, empty month left out), the command's text output, the sidebar
  model's section. Neutral fixture paths only (for example `/work/repo-a`), never real ones.
- A test with 3 sessions in one folder (the plugin rule for code that picks a session) where the 3
  sessions share one window: they count as 1 window and 3 sessions.

## Out of scope

- Anything that writes or deletes under `<store>` or `~/.claude`. This PR only reads.
- `docs/no-bloat/PROJECT-PLAN.md` Status table and `docs/CLAUDE-TODO.md`: leave both alone (a parallel run
  edits the TODO; the operator updates Status at merge). Put follow-ups in the PR body under
  "Follow-ups".
- Version bumps, releases, the changelog's version headings (plan rule 5).
- The vitest RPC timeout (Vikunja #3686).

## Performance (the point of the no-bloat plan)

- The sidebar must not re-read the ledger on every store change. Read it on activation and when a ledger
  file's mtime or size changes; reuse the relay windows the extension already holds where it can.
- Measure and put in the PR: the added bytes per webview post, and the time to aggregate a synthetic store
  of 2,000 live windows plus 12 months of ledger at 1,500 lines a month. Keep the synthetic store in a temp
  dir created by the test or script, never in `~/.cornerman`.

## Hard-won reliability discipline (headless)

- Run tests synchronously: `npm test` (the results-reading wrapper) and wait for it inline. Never background
  a test run, build or CI wait and end your turn expecting to be re-invoked: there is no re-invocation,
  ending the turn kills the process.
- A few ignored `onTaskUpdate` replies in vitest output are known noise (Vikunja #3686); any other error
  is real and must be fixed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commit after each working step. Never `git add -A`; add the files you changed by name.
- Never touch `~/.cornerman`, `~/.claude`, or any other checkout. Operate only in this worktree.
- Do not merge. Do not push to `main`.

## Last steps, in order

1. `npm test` green.
2. `gh issue create` titled `stats: /cornerman:stats and a "This month" sidebar section` with a 3-line
   body (problem, decision, plan reference). Note its number.
3. PR body contents: summary, "Closes #N", the measured numbers, the decision above quoted,
   Follow-ups.
   Write the PR body with your file tool to `$RUN_DIR/stats-pr-body.md` (outside the repo; `$RUN_DIR` and `$PR_EVIDENCE` are set by your orchestrator prompt), ending with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Push first (`git push -u origin feat/stats`), then append the evidence: `node "$PR_EVIDENCE" --append $RUN_DIR/stats-pr-body.md --cmd -- npm test`. Pushing again after this makes the evidence stale; regenerate if you do.
4. `gh pr create --base main --head feat/stats --title "feat: /cornerman:stats and a This month sidebar section, from the ledger and live relay files" -F $RUN_DIR/stats-pr-body.md`.
5. Write `docs/prompts/stats-DONE.md` (do NOT commit it): PR URL, test counts, the measured numbers, open
   items. Then stop.

If you are blocked (a test you cannot make pass after three attempts, a missing tool), write the same
file with `BLOCKED:` on its first line and what you tried, then stop.

Return a final report only; no progress narration.
