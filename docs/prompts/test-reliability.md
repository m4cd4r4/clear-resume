# cornerman wave 1: test reliability Brief

Open this in a **fresh Claude Code session** in this worktree. Don't carry context from the session that wrote it.

## First action: rebase before doing anything else

```bash
git fetch origin main --quiet
git rebase origin/main
```

## The problem

A red full-suite run of cornerman carries no information: `test/web.test.mjs` and `plugin/packages/store/test/sync.test.mjs` fail intermittently (32 then 6 failures on 2026-11-04 under load) and pass alone every time, and vitest's `Timeout calling "onTaskUpdate"` makes a run exit 1 even with every test green. Separately, the site gates (`site/check.mjs`, `copycheck.mjs`, `factcheck.mjs`, `extract-results.test.mjs`, `site/video/video-check.mjs`) run only locally; `.github/workflows/pages.yml` runs none of them.

## Source of truth (read these BEFORE coding)

1. `docs/no-bloat/PROJECT-PLAN.md`: the plan this PR is wave 1 of. Its rules are settled.
2. `docs/CLAUDE-TODO.md` items 1, 6 and 17.6: the run tables and the corrected diagnosis (files already run serially, `fileParallelism: false`, so the shared state survives between files).
3. `vitest.config.mjs`, `test/web.test.mjs`, `plugin/packages/store/test/sync.test.mjs`
4. `.github/workflows/pages.yml` and the site gate scripts named above

If this brief contradicts the code, the code wins.

## What's in scope

The two flaky test files, their helpers and temp-dir handling, `vitest.config.mjs`, a CI workflow (new job or the pages workflow) that runs the site gates.

## Out of scope

Product code under `plugin/` and `extension/src/`, except a test seam if one is unavoidable. Site copy.

## What "good" looks like

- Find the shared state first and name it. Each git-driving test gets its own temp root; teardown retries the unlink on Windows EPERM.
- The `onTaskUpdate` RPC timeout no longer appears (likely: those tests' sync git calls block the worker; make them async or isolate the file).
- Full suite green 3 runs in a row, including one while the machine is busy (check CPU first and say what it was).
- `retry` only as a last resort, and say so in the PR if used.
- A PR that breaks a site gate fails CI.

## Required deliverables

1. The diagnosis in the PR: what was shared, with the run that proves it.
2. The fix and the CI job. 3 consecutive full-suite results in the PR.
3. Update `docs/CLAUDE-TODO.md` items 1, 6 and 17.6 to done, and the Status table in `docs/no-bloat/PROJECT-PLAN.md`.
4. One issue, one PR with "Closes #N" and the `pr-evidence` section. Squash-merge is autonomous for this solo repo once CI and evidence are green; no release.

## Constraints

- One PR. Branch `fix/test-reliability`. No new runtime dependencies.
- Run vitest as `npx vitest run` from the repo root.
- No version bump, no release (plan rule 5).