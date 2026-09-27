---
workflow: general-video
flow: automation
storyboard: no
message: "Write a handover, clear, and the work walks into the next session on its own"
destination: github-readme (16:9); linkedin and threads (9:16)
aspect: 1920x1080 and 1080x1920
language: en
length: 36s
angle: mechanism
---

## Intent

A demo for the clear-resume README, and a vertical cut of the same piece for LinkedIn and
Threads. A stranger who has never used the plugin should watch it once and understand the
loop: a session fills up, a handover is written, the session is cleared, and the fresh
session already has the work. The register is a developer tool being shown, not sold: a
terminal that behaves, no voiceover, no music.

## Notes

- Authored frames only. Nothing is screen-captured, because the repo is public and a
  capture takes whatever is on screen with it.
- Every name in it is invented: repo `widget-shop` at `~/code/widget-shop`, branch
  `feat/cart-totals`, commit `a1b2c3d`, handover id `4f9c2e7`. No real path, username,
  hostname, client or company appears anywhere.
- The handover body on screen is the same example the README carries, so the two agree.
- Every line in the plugin's voice is what the scripts print (plugin 0.1.6): the two lines
  `scripts/save.mjs` prints after a save, and the SessionStart hook's line after `/clear`,
  `clear-resume: loaded handover "Cart totals rounding" (saved just now).`
- The order after `/clear` is the order a real session shows: the hook's line first, then
  the user types "carry on", then Claude answers from the handover. Claude says nothing
  before it is asked.
- The close card shows the install as two commands, with the marketplace named by its
  HTTPS URL.
- The context meter shows Claude Code's own context filling and emptying. It is not a
  claim about what the plugin saves; no number in this demo asserts a saving.
- No BGM, no SFX, no narration. Deliberate: the piece is 36 seconds of reading.
- The 9:16 cut has to read on a phone held upright without zooming: no text under 28px at
  1080 wide.
