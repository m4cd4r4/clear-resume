# Out-of-scope follow-ups

Spotted while doing the polish-and-launch work, deliberately not fixed there. Each one is
its own change; nothing here is a blocker for that PR.

## 1. Two tests are flaky on Windows under a parallel run

**Done 2026-11-06 (issue #178).** Nothing was shared between files: every git-driving test already
had its own `mkdtemp` folder, and no test git process outlived its run. Two separate causes, both
measured that day:

- **Exit 1 with every test green.** A probe test that only blocks the worker (no git) gets
  `Timeout calling "onTaskUpdate"` once a file holds more than about 60s of synchronous work
  (8 x 12s, 12 x 6s, 2 x 35s, 1 x 65s; 8 x 3s is clean). The runner moves between tests on
  microtasks only, so the RPC reply is never read. `test/setup/yield-between-tests.mjs` gives the
  event loop one `setImmediate` turn after each test, which cleared the probe.
- **Failures were the clock, not the code.** At 87% CPU the full suite ran 1,219s and failed 3 tests,
  all on the 30s timeout, with single tests taking 17-39s. vitest cannot stop a synchronous test, so
  the limit only relabelled slow passes. `web`, `sync`, `sync-guard` and `hook-safety` now use 120s
  (`test/helpers/git-temp.mjs`), and their teardown retries EPERM for about 21s, then warns and
  leaves the folder rather than fail the test. No `retry`.
- **The product's own git limits, under load.** A busier run the same afternoon (single sync tests
  up to 82s) failed `hook-safety` on `commitHandover`'s 8s push limit. Test seam:
  `CORNERMAN_TEST_GIT_SLACK` (`plugin/packages/store/git-slack.mjs`) multiplies the fixed limits in
  `web.mjs` (8s, 5s fetch) and `sync.mjs` (30s); vitest sets 4. Unset in real use. Explicit budgets
  and the merge budgets are not scaled, so the budget tests still test budgets.
- **`exthost-block` read 64.6ms against 50ms** in that run. It now takes the best of three passes;
  a real regression (182ms and 800ms before #174) is slow on every pass. Checked: a 10ms ceiling fails.

**Still open:** the yield works between tests, not inside one. A single synchronous test over 60s
(seen at 82s on a heavily shared machine, 162s with every core busy) still ends the run with the
RPC error. vitest's `onUnhandledError` filter does not catch it (tried). The real fix is running the
product's git calls off the worker thread, about half a day across ~45 tests; not done here.

The history below is kept as the record.

Carried in as "the suite reports 122 passed / 1 failed on Windows, an EPERM temp-cleanup race
in `packages/store/test/sync.test.mjs`, pre-existing". Four runs of the same tree on
2026-09-23 say something different:

| Run | Result | Failing |
|---|---|---|
| 1 (before this branch's edits) | 122 passed, 1 failed | not captured |
| 2 | 123 passed, 1 failed | not captured |
| 3 | 122 passed, 2 failed | `test/web.test.mjs > fetches first on the same branch too`, `packages/store/test/sync.test.mjs > a delete beats a concurrent edit when the delete is later` |
| 4 | **124 passed, 0 failed** | none |
| `web.test.mjs` alone | 11 passed | none |
| `sync.test.mjs` alone | 18 passed | none |

Two more full runs on 2026-09-23, on the tree that adds `demo/` and touches only `README.md`:

| Run | Result | Failing |
|---|---|---|
| 5 | 121 passed, 3 failed | all three in `test/web.test.mjs`: `finds the handover on another pushed branch, once`, `fetches first on the same branch too`, `empties the handover ref once loaded` |
| 6 | 121 passed, 3 failed | the same three |
| `web.test.mjs` alone | 11 passed | none |
| 7 (same tree, 20 minutes after run 6) | **124 passed, 0 failed** | none, but the process still **exited 1** on an unhandled `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` |
| 8 (same tree, 5 minutes after run 7) | 123 passed, 1 failed | `test/web.test.mjs > fetches first on the same branch too` |

**The distribution, in one line.** Eight runs of one unchanged tree have returned 124/0,
123/1, 122/1, 122/2 and 121/3. Every failure has been in `test/web.test.mjs` or
`packages/store/test/sync.test.mjs`, both of which pass in isolation every time they have
been asked. No run has ever failed a test outside those two files. So the useful summary is
not a count: **a red run of this suite carries no information until the named file has been
re-run alone.**

So it is not one deterministic failure and it is not confined to one file. Both flaky tests
drive real `git` processes against temp directories, both pass in isolation, and the whole
suite can pass outright.

Run 7 adds the piece that was missing: **the exit code and the test results are two separate
signals here.** A run can report 124 passed and still exit 1, because the `onTaskUpdate` RPC
timeout is an unhandled error rather than a test failure - which is the exact artefact the
comment in `vitest.config.mjs` was written about. Any CI gate or guard that reads only the
exit code will call a fully green run red.

**Correct the diagnosis before fixing it.** "Contention under parallel execution" cannot be
the whole answer: `vitest.config.mjs` already sets `fileParallelism: false`, so the files run
one after another, and tests within a file run serially too. Whatever the shared resource is,
it survives between files - a shared temp root, a leftover `git` process, or state left on
disk by an earlier file. Runs 5 and 6 failed identically, which is the closest thing to a
repeatable signal anyone has had here, so start there; but run 7 shows the tree is not
reliably red either, so reproduce before assuming a fix worked.

This matters because "expect 1 failure" trains everyone to wave a failure through. Either
fix the two tests (serialise the ones that shell out to git, or give each its own
temp root and retry the teardown unlink), or mark them with vitest's `retry`, so a red run
means something again.

## 2. Version numbers disagree across three manifests

`package.json` says `"version": "0.1.0"`. `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json` say `0.1.1`. `extension/package.json` is independently at
`0.2.1`, which is fine because it ships separately. The first two should not disagree. Fold
this into whatever the next release does; the polish PR fenced version numbers off on
purpose.

## 3. `scripts/save.mjs` prints one directory in three spellings

Its output renders the same path three ways in one run: Windows backslashes, forward slashes
with the 8.3 short name, and forward slashes with the long name, so it reads as three
different locations. The record path also leads, when the last line (what happens after
`/clear`) is the one that changes what the reader does. Text only, no logic. Detail in
`docs/findings-polish-and-launch.md`, section 1.3. Out of scope for the polish PR because its
in-scope list named the SessionStart surface, not the save surface.

## 4. The auto-mode nudge explains itself twice

`scripts/lib/nudge.mjs:96-100` is five sentences and 63 words, and the mid-turn variant at
`:123-126` repeats the same explanation of the mechanism. Both are aimed at Claude, who needs
the instruction rather than the rationale. Text only. Same scope reason as item 3.

## 5. `extension/README.md` claims the store never syncs

It says "Nothing is uploaded and nothing syncs." That is true of the extension in isolation
and false of the store it reads: the plugin syncs it to a git remote when
`scripts/sync.mjs init` has been run, and the extension's own pin, delete and archive push in
that case too. Reword to scope the claim to the extension's own behaviour.

## 6. Site gates and the video are not run by CI

**Done 2026-11-06 (issue #178).** `test.yml` already ran most site gates on every PR (ubuntu leg);
it now also runs `extract-results.test.mjs` and `video/video-check.mjs`, and the step runs even when
vitest fails. Checked by putting a stray figure into `site/video/index.html`: the loop exited 1.

`.github/workflows/pages.yml` copies only `site/*.html`, the CSS, scripts, `fonts/` and `media/`, and runs
none of `site/check.mjs`, `copycheck.mjs`, `factcheck.mjs`, `extract-results.test.mjs` or
`site/video/video-check.mjs`. They pass locally; nothing stops a merge that breaks them. Wiring them into a
CI job is a workflow change, so it was left out of the results-infographics PR.

## 7. 1:1 cut of the results video

`site/video/index.html` is 1920x1080 only. A 1080x1080 cut for LinkedIn needs the narrow chart layouts
(width under 600) scaled up and a second root. Not built; the 16:9 file is `site/media/results-video.mp4`.

## 8. The video is a scene list written by hand

When the final cut of findings is decided, the scene list in `site/video/index.html` and the `show` list in
`site/media/results/page.js` have to be edited separately. A shared list would remove the second edit.

## 9. Idle e2e follow-ups (from docs/research/idle-e2e/results.md)

- Repeat arm A (auto, ~250k) n=3 for a rate; fix the post-clear prompt wording before the run ("Go on." was read as "wait" once and as "go" once).
- Resolve why the CLI `total_cost_usd` for a 247k cold write (US$2.257) is about 2.2x the list-price figure (US$1.024).
- API-key 5 minute cache path: needs Macdara's yes on a dollar figure first.
- `smart` decline accuracy at scale: a spread of finished and unfinished sessions, not one of each.

## Idle-off overhead from the live mode override (PR #136)

With the per-window override, the relay registers the tool and turn counters and runs the 30 second idle
timer in every session, idle off included; each look reads `<key>.idle.json`. With idle off it shows no
toast or status message (`idleCheck` returns before any), and it costs no model tokens.

**Measured (host-perf, 2026-11-06), left as it is.** Counted under `claude plugin test` with idle and the
relay off over 300 mock seconds: 10 reads of `<key>.idle.json` (one per 30 s tick) against 300 reads of
`<key>.handover.json` from the 1 s hand-over poll; each look also resolves `relayDir` (4 `env.get`, 2
`fs.exists` in the mock). The idle tick is 3% of the mod's background file work. Its real file work costs
~0.5 ms CPU per tick on a loaded machine: 960 reads and ~0.5 s CPU over an 8 h idle-off session. Noise, so
the timer is not made lazy. If the relay's background cost ever matters, the 1 s hand-over poll is the
place to look (30 times the idle tick).

## 10. Sidebar webview: not verified with a real screen reader

The restyled sidebar (`extension/src/sidebar-page.ts`) is an ARIA tree with arrow, Home/End and one tab stop.
Only the DOM and key handling were measured. NVDA or Narrator has not been run against it.

## 11. Sidebar search box scrolls away with the list

The Handovers search box is part of the scrolling list, not sticky. Left as is in the restyle.


## 12. Sidebar session strip and group-header bulk actions (from the hierarchy pass)

Left out of the hierarchy PR (#139) by choice, each its own change: a session strip showing context, nudge,
idle and Hand over in the sidebar, and bulk actions on a group header (for example clearing Stale). Both
need Macdara's go-ahead, and any new display copy goes to him as options first.

## 13. The repo-and-branch rule is only checked on six pairs (low priority)

Every row is one line now (PRs #146, #147), so `where()` in `extension/src/sidebar-model.ts` no longer builds
a visible second line. It still builds the tooltip and the opened peek: it hides the branch when its last
segment is a whole word in the repo name, and the repo when the branch already contains it. It is tested on
six hand-picked pairs, not against the real store. Run it over every record in `~/.cornerman` and read
what it collapses if a tooltip ever looks wrong.

## 14. Group Stale and Archived by repo (done)

Macdara asked (2026-10-23) whether handovers should be organised by repo. Decided: not for Loaded or the
waiting groups, where newest first matters and a third tree level would bury it. Stale (98) and Archived
(1,167) are the lists that would gain from a repo level, with counts, collapsed by default. A row's "repo"
is the worktree folder name (`examworthy-seal-flip`), but every record also carries `mainPath`, the root
repo's path (`schema.mjs` fills it, falling back to `repoPath`), so a group can key on `mainPath` and label
itself with that folder's name. Check old records written before `mainPath` existed: they fall back to
`repoPath`, so their worktrees would still form their own group.

## 15. Loaded above the waiting groups only when it is from this repo (done)

Today the order is Current repo, Other repos, Loaded, Stale, Archived. Right after `/clear` a person wants to
see what they just resumed, which sits under Other repos when other projects have waiting handovers. Idea:
put Loaded first only when a loaded handover belongs to the open repo or its worktrees (the same test
`loadedHere` in `plugin/packages/store/view.mjs` already applies). Model change in `handoverSections`, with a
test for each order.

## 16. Waiting handovers archive themselves when the work is done

Found 2026-10-23: five examworthy seal kickoff stubs (written 10-18 at worktree creation) sat under Other
repos as waiting for 5 to 6 days after the work shipped, because nothing consumed them. Macdara prefers
guardrails to an Archive button. A waiting handover should archive itself when any of these holds, checked in
this order of cost:

1. Its worktree folder (`repoPath`) no longer exists on disk. No network. **Done** (`prune()` in
   `store.mjs`, `via: "abandoned"`; this machine's records only, and the folder's parent must exist).
2. ~~A session has started in its folder.~~ Dropped: unsafe. The session that saved a handover keeps running
   in that folder and would archive its own handover.
3. **Done** (`merged.mjs`, `via: "merged"`, run async once per extension activation; counts a PR merged
   after the handover was written, none open). Its branch's PR is merged. Ask the forge (`gh pr list --head <branch> --state all`), not git ancestry,
   since squash merges defeat ancestry. Costs a network call, so run it off the refresh path.

Archive with `archivedBy.via` of a new value (the five done by hand used "manual"), and keep it out of
`LOADED_VIA` so it never shows as Loaded. Tests: a record per rule, one that must stay waiting, and a check
that a kickoff in a live worktree with no session yet is left alone.

## 17. Follow-ups from the extension-host freeze fix (2026-11-04)

Found while fixing the freeze (sidebar refresh 182 ms and relay poll 800 ms of blocked host, now 25 ms and
0.2 ms; `test/exthost-block.test.mjs`, `scripts/perf/refresh-profile.mjs`). Captured, not built:

1. **Questlog has the same pattern** (separate extension, not changed here). `pollLive` runs every 5 s
   (`MIN_LIVE_S`) and `readRows` does `readdirSync` plus a `readFileSync` per file over `~/.claude/questlog`
   (1,053 files on 2026-11-04). VS Code's profiler blamed `macdara.questlog` twice that day; across 40 saved
   profiles its `update` holds 5.4 s inclusive, `readRows` 3.9 s. Same fix: a watcher-fed in-memory copy.
2. **The relay folder is never cleaned up**: 1,366 `<key>.json` files, one per window ever opened. The
   status bar now reads them from memory, but the folder still grows. Prune window files older than 30 days
   with no live session, in the relay mod or `prune()`.
3. **The sidebar still posts ~1.3 MB per store change** with showArchived on (1,933 archived rows). Rows
   are cached and serialised once, so the host cost is ~25 ms, but rows of a closed section could be left
   out until the page opens it.
4. **Done (host-perf, 2026-11-06).** `worktreePaths` spawned git synchronously the first time each folder
   was asked about: 83 to 245 ms of blocked host on a repo with 46 worktrees. The extension now calls
   `worktreePathsAsync` (same memo, same answer): 4.5 to 8.8 ms. Guarded by `test/exthost-block.test.mjs`.
5. **Closed, measured (host-perf, 2026-11-06).** The 49,304 files in `~/.claude/sessions` were not Claude
   Code's: 49,300 were `session-<ms>.json` from a local Obsidian session hook (since fixed outside this
   repo). Claude Code's own `<pid>.json` and `.key` files are removed when the process exits (14 of each,
   all live). The `/^\d+\.json$/` filter already skipped the hook's files, so `claudeProcesses` blocked
   ~10 ms on the full folder and signalled only 14 pids. A folder of 50,000 leftover `<pid>.json` files
   would block 830 to 1,230 ms; that has never been seen, so it is not guarded.
6. **Done 2026-11-06, see item 1 (issue #178).** **`test/web.test.mjs` flakes in the full suite.** On 2026-11-04 two full runs failed 32 and 6 tests
   (5 files, then this file only), and the suite ran 1,591 s against 835 s earlier the same day. Alone it
   passes 14/14 in about 100 s but still reports vitest's `Timeout calling "onTaskUpdate"`: its sync git
   calls block the worker long enough to miss vitest's RPC. Make those calls async, or give the file
   its own pool (`poolMatchGlobs`) with a longer `teardownTimeout`.
