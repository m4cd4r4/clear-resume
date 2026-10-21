# Idle toggle in the hover card Brief

Open this in a **fresh Claude Code session** in this worktree. Do not carry context from any other session.

## First action: rebase before doing anything else

This worktree was created from `origin/feat/idle-mode-live-override` (PR #136, stacked on #132). Either may have merged or been rebased since. Before anything else:

```bash
git fetch origin --quiet
gh pr view 132 --json state,mergedAt -q .state
gh pr view 136 --json state,mergedAt -q .state
```

If both are MERGED, rebase this branch onto `origin/main`. If only #132 is merged, rebase onto `origin/feat/idle-mode-live-override`. If neither, rebase onto `origin/feat/idle-mode-live-override`. Say which case applied.

## The problem

PR #134 moved Nudge and Hand over out of the status bar into the pie's hover card, because they are set-and-forget actions. The idle handover item (PRs #132 and #136) was built before that and still sits in the bar permanently, showing `idle off` for most users, where nothing can be acted on. Auto and smart act without the user (write a handover and clear), so those states deserve a visible bar item. Macdara agreed on 2026-10-21: idle goes in the hover card like Nudge, and the bar item shows only when the mode is not off.

## Source of truth (read these first)

1. [extension/src/stats-status.ts](extension/src/stats-status.ts): the idle item (`idleItem`, `pickIdle`) and how #134 builds the hover card links (`links: { handover, log, nudge, handNow }`).
2. [plugin/packages/store/relay-state.mjs](plugin/packages/store/relay-state.mjs) (around the `links.handNow` line) and [plugin/packages/store/relay-state.d.mts](plugin/packages/store/relay-state.d.mts): the card builder and its types.
3. [extension/src/idle-mode.ts](extension/src/idle-mode.ts): `idleText`, `windowIdleMode`, `settingsIdleMode`, `IDLE_DETAIL`.
4. [test/store/relay-state.test.mjs](test/store/relay-state.test.mjs) (see the `links = { nudge, handNow }` case) and [test/idle-mode.test.mjs](test/idle-mode.test.mjs).
5. `gh pr view 134` for how Nudge and Hand over were moved; follow the same pattern.

If this brief contradicts those files, the files win.

## What is in scope

- Add an idle line to the hover card: the current mode and a link that opens the existing `clearResume.pickIdle` picker, built the way the nudge link is.
- Show the status-bar idle item only when the effective mode is not `off`. Keep its click behaviour and tooltip.
- Fix `relay-state.d.mts` so the card `links` type declares `nudge` and `handNow` (and the new idle link). `npx tsc --noEmit -p extension` currently reports one error for this, present on main since #134. After your change tsc must be clean.
- Tests: the card builder gets the idle link; a unit test for "bar item hidden when off, shown otherwise" if the logic can be pulled into a pure function.

## Out of scope (do NOT modify)

- The relay (`plugin/hooks/relay.ts`) and the per-window override mechanism (#136).
- The nudge default and nudge items.
- Anything in `docs/research/`.
- Do not merge any PR.

## What good looks like

- Default user (idle off): the bar shows no idle item, and the hover card has an idle line reading "off" with a link that opens the picker.
- A user with auto or smart: the bar shows `idle auto` or `idle smart`, and the card line agrees.
- Changing the mode in the picker updates both within the usual refresh.
- tsc clean, full suite green, and one real look at the result.

## Required deliverables

1. A short written design note (which file owns what) before code.
2. The change in the in-scope files, with tests.
3. tsc, extension build, `npm test` and `npm run test:mod` results.
4. A live look in a throwaway VS Code: harness at `I:/Scratch/_ab/idle-e2e/vsc.mjs` (`node vsc.mjs launch | shot <name> | eval <js> | key <k> | stop`). It uses its own user-data-dir and extensions-dir, never signs in, and is NOT an Extension Development Host. Build the extension first (`npm run build` in `extension/`). Dismiss the two welcome pages with eval clicks ("Continue without Signing In", "Get Started"). Screenshot the bar with idle off and with idle auto, and the hover card; read the images yourself and say you did. Hover the pie to open the card; if hover is hard to drive over CDP, say what you could not see.

## Constraints

- One PR. Branch name: `feat/idle-in-hover-card`. Base it on the branch the first section tells you to use, and set the PR base to match (stacked on #136 if it is unmerged).
- Open the PR with an `## Evidence` section. Do not merge.
- Subscription only, no API key. Never launch an Extension Development Host from Macdara's shell. Stop the throwaway VS Code by its own PID.
- No new display copy beyond the idle line label; offer Macdara wording options only if the existing strings do not fit.

## Out-of-scope follow-ups (capture, do not build)

Append to `docs/CLAUDE-TODO.md`: measure the idle-off overhead of the 30 second timer (already recorded in #136; do not duplicate it).

## Why this brief is structured this way

An idle item that always shows `idle off` is bar clutter for most users, and #134 already set the pattern for settings like it. The risk is the card builder living in shared store code with an out-of-date type file, so the brief names both files and requires tsc clean.