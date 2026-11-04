# Cornerman extension-host freeze Brief

Open this in a **fresh Claude Code session** in this worktree. Don't carry context from the session that wrote it.

## First action: rebase before doing anything else

```bash
git fetch origin main --quiet
git rebase origin/main
```

## The problem

The installed cornerman VS Code extension (0.7.1) freezes the shared VS Code extension host for 2 to 4 s at a time. When that happens the Claude Code panel shows "Claude Code stopped responding in this tab" and its input box disappears. Macdara sees it several times a day, worst in the solaisoft workspace (the most sessions and handovers). Once it needed a window reload.

Evidence, 2026-11-04:
- `%APPDATA%/Code/logs/20261104T074011/window*/renderer.log`: VS Code's own unresponsive-host profiler blames `macdara.cornerman` 38 times today and `macdara.questlog` twice.
- The CPU profiles VS Code saved are `F:/Temp/exthost-*.cpuprofile`. Aggregate them with `node F:/Temp/claude/c0161b7746718d37/41675af3-8b08-46e4-9043-a8d1a52fa3c2/scratchpad/prof.cjs <files>` (copy it into the worktree if the scratchpad is gone).
- Self-time across 7 profiles: readFileUtf8 5.0 s, stat 4.4 s, resolveStore (dist/extension.js:249 in 0.7.1) 4.3 s, path.join 2.7 s, an anonymous function at extension.js:2018 2.6 s, peekOf 1.9 s, shortAge 1.3 s, cachedRecord 1.0 s, listAll 0.7 s, validSessionId 0.7 s.
- PR #160 (cache parsed handovers in listAll) is already in 0.7.1 and did not fix it. Synchronous stat/read per tick and repeated resolveStore remain.

## Source of truth (read these BEFORE coding)

1. `extension/src/sidebar-model.ts` (peekOf / cachedRecord path)
2. `plugin/packages/store/store.mjs` (listAll, resolveStore, the #160 cache)
3. `plugin/packages/store/view.mjs` (shortAge)
4. `extension/src/extension.ts` and `extension/src/tree.ts` (what triggers refreshes, and how often)
5. `test/sidebar-model.test.mjs`, `test/store/` (existing test style)

If this brief contradicts the code, the code wins.

## What's in scope

The extension's refresh path and the store functions it calls from the extension host.

## Out of scope

Hook and relay behaviour, handover format, README and site copy. The Questlog extension: profile it and note whether it has the same pattern in `docs/CLAUDE-TODO.md`, but do not change it.

## What "good" looks like

- No synchronous fs (readFileSync, statSync, existsSync) on any path the extension host runs on a timer or on file-watch events.
- Store resolution memoised; invalidation is driven by a file watcher, not by polling stat on every tick.
- With a large fixture store (several hundred handovers, 3 sessions in one folder), one sidebar refresh blocks the event loop for under 50 ms. Measure it, don't estimate it.
- The sidebar shows the same rows as before. Existing tests pass.

## Required deliverables

1. The fixture and timing test first, failing against current main (red), with the measured number.
2. The fix, green against the same test.
3. A before and after profile from the plugin-dev sandbox, aggregated with prof.cjs.
4. One PR (issue first, PR says "Closes #N", squash-merge per the repo practice). Merge needs Macdara's yes.

## Suggested workflow

1. Rebase. Read the source files above.
2. `/tdd`: write the fixture and timing test.
3. Fix, run the full test suite.
4. Run it in the sandbox: `node ~/.claude/scripts/plugin-dev.mjs <this-worktree>`. Never install a dev build into the live config.

## Constraints

- One PR. Branch `fix/cornerman-exthost-freeze`.
- No new runtime dependencies.
- No release in this session. Releases are batched on Macdara's day after a live check (memory: plugin-releases-batched-2026-10-30). Bump the version only in the release PR.

## Out-of-scope follow-ups (capture, don't build)

Append to `docs/CLAUDE-TODO.md`.

## Why this brief is structured this way

#160 cached one function and shipped without measuring the host block, so the freeze survived it. This time the timing test comes first and proves the fix.