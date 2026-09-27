---
workflow: general-video
mode: autonomous
message: "Write a handover, clear, and the work walks into the next session on its own"
aspect: 1920x1080 and 1080x1920
fps: 30
duration: 36
architecture: monolithic
---

# Storyboard - clear-resume demo

One story, two cuts. `vertical/story.js` holds the markup, the words and the one timeline;
`index.html` (16:9) and `vertical/index.html` (9:16) each supply a canvas and a stylesheet
and mount it, so the two cuts cannot drift apart in wording or timing.

Within a cut there is one composition. The window chrome, the context meter and the
background decoratives persist across every phase; the phases are internal sections, per
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

- src: `vertical/story.js` phase `p1`
- window: 0.0 - 8.5s
- rules: `stat-bars-and-fills` (progress fill), `sine-wave-loop`, `ambient-glow-bloom`
- beat: A session in `widget-shop` on `feat/cart-totals`. The user's question is already
  on screen; tool lines print one per cue while the context meter climbs from 34 to 78
  per cent and its fill deepens past 70. Ghost word `WORK`. The 9:16 window is taller, so
  it shows more of the earlier scrollback.

## Frame 2 - handover

- src: `vertical/story.js` phase `p2`
- window: 8.5 - 19.0s
- rules: `discrete-text-sequence` + `context-sensitive-cursor` (typed prompt),
  `waterfall-entry` (the brief's lines arrive), `stat-bars-and-fills`
- beat: `/clear-resume:handover` types itself behind a blinking caret. The handover
  cascades in - the README's own example, in the order `skills/handover/SKILL.md`
  specifies: goal, next action, state, decisions. Claude saves it (`Bash node save.mjs
  --title "Cart totals rounding"`) and the script answers in the plugin's voice, exactly
  as it prints: `Saved handover "Cart totals rounding" (id 4f9c2e7).` and `After /clear,
  the next session in ~/code/widget-shop loads it automatically.` Ghost word `HANDOVER`.

## Frame 3 - clear

- src: `vertical/story.js` phase `p3`
- window: 19.0 - 23.0s
- rules: `discrete-text-sequence`, `stat-bars-and-fills` (the fill collapsing),
  `nudge-curve` (the content leaving as one group)
- beat: `/clear` types and submits. The session content leaves upward as one group and
  the meter collapses to 4 per cent. The window stays. Ghost word `CLEAR`.

## Frame 4 - resume

- src: `vertical/story.js` phase `p4`
- window: 23.0 - 32.0s
- rules: `spring-pop-entrance` (the status chip), `waterfall-entry` (Claude's answer),
  `stat-bars-and-fills`
- beat: A fresh session. The hook's line pops in first, exactly as the SessionStart hook
  prints it: `clear-resume: loaded handover "Cart totals rounding" (saved just now).` The
  meter rises to 11 per cent as the handover lands in context. Only then does the user
  type `carry on`, and Claude answers from the handover - its title, the next action, the
  state - and runs that next action. The meter sits under a fifth. Ghost word `RESUME`.

## Frame 5 - close

- src: `vertical/story.js` section `close`
- window: 32.0 - 36.0s
- rules: `waterfall-entry`
- beat: The window recedes. Name, one line, and the install as two commands:
  `claude plugin marketplace add https://github.com/m4cd4r4/clear-resume` and
  `claude plugin install clear-resume@clear-resume`. The 9:16 cut is too narrow for the
  first on one line, so it breaks with a shell continuation (`\`) and an indented URL.
