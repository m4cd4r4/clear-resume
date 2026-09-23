# Out-of-scope follow-ups

Spotted while doing the polish-and-launch work, deliberately not fixed there. Each one is
its own change; nothing here is a blocker for that PR.

## 1. `sync.test.mjs` tolerates a Windows temp-cleanup race

Known before this work started. The suite reports 122 passed / 1 failed on Windows, the
failure being an EPERM in `packages/store/test/sync.test.mjs`'s temp cleanup, reproducible on
unmodified `origin/main`. It is tolerated rather than fixed, so the suite has no clean green
on this platform and a real regression in that file would be easy to wave through. Fix the
teardown (retry the unlink, or hold no handles across it) rather than keeping the tolerance.

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
