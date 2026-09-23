---
workflow: general-video
mode: autonomous
message: "Write a handover, clear, and the work walks into the next session on its own"
aspect: 1920x1080
fps: 30
duration: 36
architecture: monolithic
---

# Storyboard - clear-resume demo

One composition, `index.html`. The window chrome, the context meter and the background
decoratives persist across every phase; the phases are internal divs, per
`hyperframes-core` composition archetype C (several beats sharing continuous state
collapse into one root rather than into sequential slots). There are no hard scene cuts,
so there is nothing to dispatch and no sub-composition files.

Registry search ran before planning: `npx hyperframes catalog --query "terminal window
with typed commands"` returned `code-terminal-run`, a genuine match for a single
command-and-output panel. It is not mounted, because it registers one fixed timeline key
and runs exactly one command per mount, and this piece is four phases inside one
persistent window. Its typing law is reused instead - the chars-at-time row table built
once before the timeline registers, `showChars` revealing characters across text nodes in
document order, and an integer-cycle caret - which is the same mechanism as
`discrete-text-sequence` and `context-sensitive-cursor`.

## Frame 1 - work

- src: `index.html` phase `p1`
- window: 0.0 - 8.5s
- rules: `stat-bars-and-fills` (progress fill), `sine-wave-loop`, `ambient-glow-bloom`
- beat: A session in `widget-shop` on `feat/cart-totals`. The user's question is already
  on screen; tool lines print one per cue while the context meter climbs from 34 to 78
  per cent and its fill deepens past 70. Ghost word `WORK`.

## Frame 2 - handover

- src: `index.html` phase `p2`
- window: 8.5 - 19.0s
- rules: `discrete-text-sequence` + `context-sensitive-cursor` (typed prompt),
  `waterfall-entry` (the brief's lines arrive), `stat-bars-and-fills`
- beat: `/clear-resume:handover` types itself behind a blinking caret. The handover
  cascades in - the README's own example, in the order `skills/handover/SKILL.md`
  specifies: goal, next action, state, decisions. A saved-to line names the real store
  path, `~/.clear-resume/handovers/`. Ghost word `HANDOVER`.

## Frame 3 - clear

- src: `index.html` phase `p3`
- window: 19.0 - 23.0s
- rules: `discrete-text-sequence`, `stat-bars-and-fills` (the fill collapsing),
  `nudge-curve` (the content leaving as one group)
- beat: `/clear` types and submits. The session content leaves upward as one group and
  the meter collapses to 4 per cent. The window stays. Ghost word `CLEAR`.

## Frame 4 - resume

- src: `index.html` phase `p4`
- window: 23.0 - 32.5s
- rules: `spring-pop-entrance` (the status chip), `waterfall-entry` (the restored
  handover), `stat-bars-and-fills`
- beat: A fresh session. The hook's line prints exactly as `scripts/lib/hook.mjs` writes
  it: `clear-resume: loaded handover "Cart totals rounding" (saved 2h ago).` The handover
  is already in context, and Claude states the next action without being asked. The meter
  sits at 11 per cent. Ghost word `RESUME`.

## Frame 5 - close

- src: `index.html` phase `p5`
- window: 32.5 - 36.0s
- rules: `waterfall-entry`
- beat: The window recedes. Name, one line, and the install command.
