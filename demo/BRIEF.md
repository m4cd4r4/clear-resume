---
workflow: general-video
flow: automation
storyboard: no
message: "Clear often, lose nothing."
destination: github-readme (16:9); linkedin and threads (9:16)
aspect: 1920x1080 and 1080x1920
language: en
length: 75s
angle: explainer (shift-handover note metaphor)
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

## v3 (2026-09-28)

- Takeaway: "Clear often, lose nothing." ELI5: a viewer who has never heard of a context
  window must follow it; the first card defines "context" in plain words.
- Side cards use the shift-handover note metaphor, at most about twelve words each, one claim
  per card, no em-dash, en-dash or ellipsis. Each card's paraphrase is in STORYBOARD.md.
- Numbers are the author's own: 104 /clears, 20 to 28 Sep 2026, medians. Context before
  /clear 197,536 tokens; freed per /clear 102,088; the note about 780 (estimate), about 0.4%.
  The source line is always on screen with them. No quality or work-per-token claim.
- Terminal text is the captured output (`D:/Scratch/cr-video3-sandbox/captured-text.md`),
  shortened only by leaving lines out. User and Claude lines are labelled.
- Not made by Anthropic; the close says so.
