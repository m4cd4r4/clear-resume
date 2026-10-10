# Results infographics: design rationale

Written before any page code, 2026-10-10. Plain text. Branch `feat/results-infographics`.

## Job of the page

Sell a visitor (a Claude Code user with long chats) on the plugin by showing what was measured, and show
Macdara's web design and development skill. The first screen must carry the claim and the evidence:
a 30-item website build run three times with clear-resume and three times with Claude Code's own
auto-compaction. Honesty is the design brief: every run is a dot, every n is on screen, nothing hides.

## Palette: "Night Ledger"

Neutral near-black ground (the site's existing tokens, `--bg #0a0a0a`, `--surface #121212`, `--hairline`
`#262626`, text `#f2f2f2`) so the header, footer and the other two pages stay unchanged. Two data colours
carry the comparison, a third is neutral, and one marks a prediction:

| Role | Name | Hex | Why |
|---|---|---|---|
| relay (clear-resume) | Signal teal | `#2dd4bf` | cool, reads as "ours" on near-black |
| auto-compaction | Amber | `#f5a524` | warm, a different hue AND a different shape (dashed line, square marks), so colour is never the only cue |
| one long session | Slate | `#94a3b8` | the neutral reference |
| prediction | White ring | `#f2f2f2` stroke only | a prediction is a mark, not a result |

Clay, maroon and any brown are out. Colour is used on data marks only; text stays on the neutral text
tokens. Measured on `--bg`: teal 10.64:1, amber 9.70:1, slate 7.72:1, all above 4.5:1, and `check.mjs` proves it.
Colour-blind safety: teal against amber differs in hue (blue against yellow for deuteranopes), and every
series is also told apart by line style and mark shape and by a direct label, never a legend alone.

## Type

Existing vendored faces, so no new request and the site stays one family: Montserrat 700 for headings,
JetBrains Mono 700 for numerals (tabular, so counting numbers do not jitter) and chart labels.
Big numerals are the visual hook: 56 to 96 px at 1440, 40 to 56 px at 390.

## Layout

One column, `--max 1120px`, 56 px section rhythm already in `styles.css`.

1. Header (existing nav, plus "Results" first and "Earlier demo" in the footer).
2. Hero: H1, one-line sub, one sentence setting up the experiment, then the race. No install commands above
   the race; one "Install" link sits beside the sub and the full commands stay in the Install section.
3. The race (hero visual), full width: two stacked panels on a shared minutes axis.
4. How to read it (one line): a dot is one run, the tick is the median, a hollow dot did not finish.
5. Findings, each one section: a plain-language claim with its n, one chart, one caveat line.
   `finish` (30 of 30 items), `tokens` (against one long session), `cost` (a tie), `floor` (config size,
   predicted against measured), `idle` (cold return against warm handover, n=1).
6. Install, FAQ, footer (existing blocks) and a link to the earlier demo.

Findings are components. Which ones show is `site/media/results/page.js` (`crPage.show`), read by the page.
A finding left out of `show` is removed from the page by `results-page.js`; its static HTML and FACTS rows
can be deleted when the final cut is made. The video lists its scenes in `site/video/index.html` and has to
be edited by hand to match the final cut. Headline figures are medians of finished runs (the 1.4x ratio is
from means, as in RESULTS.md).

## The race (the hero visual)

x = minutes since the run started, y = context tokens (0 to 220k), both panels on the same scales.
Teal panel: one relay run, a sawtooth: the line climbs to about 190k and drops to about 24k at each clear.
Amber panel: one auto-compaction run: it drops to about 15k at each compaction (dashed marker with the
exact before and after tokens), and the stopped run ends at item 20 with a "stopped, 10 items open" flag.
Under each panel, 30 cells fill as PLAN items are committed (real commit times). Live read-outs: items,
context now, clears or compactions so far. Defaults: relay run 1 against auto-compaction run 1 (the one
that stopped). The run pickers (1, 2, 3 on each side) show any of the six runs, so the stopped run is not
the only one a reader can see and a finished one is one tap away.

## Motion plan

Motion explains the data: the race cursor sweeps time (about 14 s, ease linear, so minutes read true),
lines draw with it, cells fill at their real commit times, read-outs count. Dot plots: dots drop into
place in run order, then the median tick and the range line draw. Numbers count up once on first view.
`IntersectionObserver` starts each chart. A replay button and a scrubber (a labelled range input) sit on the
race. `prefers-reduced-motion: reduce` renders the final frame of every chart, complete, with no sweep.
Shared renderers (`charts-core.js`, `chart-race.js`, `chart-dots.js`) draw every chart from `crResults` at a
progress value, and `chart-specs.js` builds each finding's chart spec. The video calls the same functions,
so the page and the MP4 cannot disagree.

## Honesty rules in the UI

- Every dot is a run; the n is printed beside the group (`n=3`).
- The median is marked, not the best run. Cost and tokens are shown as ranges, and where ranges overlap the
  copy says so.
- The run that stopped is hollow and labelled "stopped at item 20" and is excluded from finished-run
  medians, in the plot and in words.
- The idle result carries "n=1" in its heading.
- The config-floor plot shows the prediction (written before the runs) as a ring beside the measured dots.
- Copy never says the relay is cheaper than auto-compaction. Cost is a tie within the spread.
- 565.6M only appears on the archive page and is called an estimate there.

## Copy and gates

Terse. `copycheck` keeps its 250 visible-word cap on `index.html`; chart labels live in SVG text. Every
figure is a `data-res` slot filled from `results.js` and every sentence is a `data-fact` row in FACTS.md
whose source is a path into `results.json` (checked by an extended `factcheck`) or a quoted line of the
RESULTS.md method text copied into FACTS.md.

## Video

HyperFrames, 1920x1080, 41.5 s, 30 fps, in `site/video/`: title, the race with the stop at 20, finish cells,
dots for tokens and cost, idle handover, end card with n and caveats on screen. It reads the page's own
chart files, copied into the gitignored `site/video/assets/` by `build.mjs` (HyperFrames rejects `../`
paths). Every figure is a `data-res` slot filled from `results.js`; `video-check.mjs` fails on a digit
outside a slot, a path missing from `results.json`, the `copycheck` wording rules, and token drift from
`styles.css`. The chart clock is a pure function of the timeline time, so seeking draws the right frame.
Render: `node site/video/build.mjs`, then `npx hyperframes@0.8.144 render site/video --output
site/media/results-video.mp4 --quality delivery`. The 1080x1080 cut is not built (follow-up in
`docs/CLAUDE-TODO.md`).

## Placeholders

All five findings are real measurements today. More tests are planned: the PR body lists which slots are
still placeholders (the `show` list, the choice of default runs in the race, and the finding order).
