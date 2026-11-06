# cornerman wave 1: host perf Brief

Open this in a **fresh Claude Code session** in this worktree. Don't carry context from the session that wrote it.

## First action: rebase before doing anything else

```bash
git fetch origin main --quiet
git rebase origin/main
```

## The problem

PR #174 stopped the sidebar refresh and relay poll blocking the VS Code extension host. Three smaller costs remain:

1. `claudeProcesses` in `extension/src/stats-status.ts` reads every `<pid>.json` in `~/.claude/sessions` and signals each pid with `process.kill(pid, 0)` on the 5 s status-bar poll. That folder belongs to Claude Code, is never cleaned, and held 49,304 files on 2026-11-06. The reads are async; the signals are not.
2. `worktreePaths` (`plugin/packages/store/worktree.mjs:72`) spawns git synchronously the first time each folder is asked about.
3. The relay (`plugin/hooks/relay.ts`, PR #136) runs a 30 s idle timer in every session even with idle off, reading `<key>.idle.json` each look. Not measured.

## Source of truth (read these BEFORE coding)

1. `docs/no-bloat/PROJECT-PLAN.md`: rule 1 (a plugin deletes only what it wrote: never delete from `~/.claude/sessions`).
2. `docs/CLAUDE-TODO.md` items 17.4, 17.5 and "Idle-off overhead from the live mode override (PR #136)".
3. `extension/src/stats-status.ts`, `plugin/packages/store/worktree.mjs`, `plugin/hooks/relay.ts`, `extension/src/idle-mode.ts`
4. `test/exthost-block.test.mjs` and `test/fixtures/big-store.mjs`: how the longest event-loop block is measured.

If this brief contradicts the code, the code wins.

## What's in scope

Those three paths and their tests.

## Out of scope

Retention or deleting anything (wave 2). The sidebar refresh path already fixed in #174.

## What "good" looks like

- `claudeProcesses` signals only pids of sessions cornerman already tracks (relay files, store records), not every file in the folder. Status bar shows the same live sessions as before.
- `worktreePaths` never blocks the host.
- Idle-off overhead measured (CPU and file reads over a long idle-off session). If it is more than noise, start the timer only when `<key>.idle.json` first appears.
- Timing test: the status-bar poll with a 50,000-file sessions fixture blocks under 50 ms. Red first, then green. Check CPU load before trusting a red result.

## Required deliverables

1. Timing test red against current main, with the number. Then green.
2. Idle-off measurement in the PR, before and after if changed.
3. Draft (do not file) an issue for anthropics/claude-code: `~/.claude/sessions` keeps a `.json` and `.key` per process forever (49,304 files on 2026-11-06). Save it as `docs/no-bloat/claude-code-sessions-issue.md` in this PR; Macdara files it.
4. Update `docs/CLAUDE-TODO.md` 17.4, 17.5 and the idle-off item, and the plan's Status table.
5. One issue, one PR with "Closes #N" and `pr-evidence`. Squash-merge is autonomous once green; no release.

## Constraints

- One PR. Branch `perf/host-perf`. No new runtime dependencies. No version bump.
- Never install a dev build into live VS Code or the live Claude config; no Extension Development Host without a throwaway `--user-data-dir` and `CLAUDE_CONFIG_DIR`.
- Run vitest as `npx vitest run` from the repo root.