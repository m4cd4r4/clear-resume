# Out-of-scope follow-ups

Spotted while doing the polish-and-launch work, deliberately not fixed there. Each one is
its own change; nothing here is a blocker for that PR.

## 1. Two tests are flaky on Windows under a parallel run

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
