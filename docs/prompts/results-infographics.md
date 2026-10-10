# Results Infographics Brief

Open this in a **fresh Claude Code session** in `I:/Scratch/clear-resume-results-infographics/`. Do not carry context from the current session.

## First action: rebase before doing anything else

```bash
git fetch origin main --quiet
git rebase origin/main
```

Resolve any conflicts now. The brief was written against main at 4151370 (2026-10-10).

## The problem

The site front page (live at https://m4cd4r4.github.io/clear-resume/) still leads with the old replay and the 91.0M vs 565.6M estimate. The new A/B runs measured something different and more modest. Macdara wants a slick animated infographic page of the NEW findings, plus a HyperFrames MP4 cut from the same data for X and LinkedIn. It is also a portfolio piece for his web design and development skill.

This session builds the PIPELINE with the current data as placeholders. More tests are planned; the final numbers drop in when they finish, and which findings make the final cut is decided then.

## Decisions already made by Macdara (2026-10-10)

- Output: live web page + HyperFrames video, both reading ONE JSON data file so the numbers always agree.
- Old demo: the new findings become `site/index.html`; the old replay moves to a clearly labelled archive page (still reachable, 565.6M always called an estimate).
- Which findings ship: DEFERRED until all tests are done. Build a component for each candidate so any can be included or dropped by config.
- Honesty model: show the CONDITIONS where clear-resume does best, never cherry-picked best runs. Plot every run as a dot with the median marked. Put n and caveats on screen, not in footnotes. Where a prediction was written before a run, show predicted vs measured.

## Source of truth (read these BEFORE designing or coding)

1. `I:/Scratch/_ab/RESULTS.md`: the write-up of every A/B. Read all of it first.
2. [docs/launch/readme-lead-draft.md](docs/launch/readme-lead-draft.md): the copy rules in its header and the agreed framing of each finding.
3. [site/FACTS.md](site/FACTS.md), [site/factcheck.mjs](site/factcheck.mjs), [site/copycheck.mjs](site/copycheck.mjs): every number and phrase on the site is gated by these. Extend them, never bypass.
4. [site/buildstats.mjs](site/buildstats.mjs) `measure()`, [site/runstats.js](site/runstats.js), [site/model.js](site/model.js), [site/app.js](site/app.js): the current page's data and animation code.
5. `I:/Scratch/cr-e2e/replay/extract.mjs`: how the old replay was built from transcripts.

If anything in this brief contradicts those files, the files win.

## Data (all on disk; the transcripts are the recording)

- `I:/Scratch/_ab/site-sonnet/`: n=3 relay (`relay`, `relay-r2`, `relay-r3`) vs n=3 auto-compaction at ~177k (`compact200`, `-r2`, `-r3`), plus one 1M session that never compacted (`compact`). Each arm has `home/.claude/projects/**/*.jsonl`, `out/`, `cr-e2e/`. Summary: `measure-2026-10-08.json`.
  - Relay finished 3 of 3; compaction 2 of 3 (`compact200` stopped after item 20, following its 2nd compaction).
  - Completed-run cost US$12.21 vs US$13.03: a tie, within the spread.
  - Both about 1.4x fewer tokens than the one long session (35.1M vs 49.8M; n=1 on that side).
- Idle handover: `_ab/idle-results.json`, `_ab/idle2-results.json`, `_ab/idle-live/`. 390k session: cold return US$1.56 vs warm handover about US$0.30 (n=1 Sonnet; Opus US$3.13 vs US$0.24).
- Model switch at 390k: `_ab/switch/results.json`, `results-warm.json`.
- Config-floor runs: `_ab/site-sonnet/measure-2026-10-08-floor.json`.
- Token method: dedupe assistant messages by id; sum input + cache read + cache creation (same as `site/buildstats.mjs` `measure()`).

## What's in scope

- A new extract script (under `site/` or `scripts/`) and its test.
- `site/results.json` (or similar) as the single data file.
- `site/index.html`, `site/styles.css`, new page JS; the old page moved to an archive path.
- A HyperFrames composition (new folder, for example `site/video/`) and the rendered MP4 under `site/media/`.
- `site/FACTS.md` entries and the factcheck/copycheck fixtures.

## Out of scope (do NOT modify)

- `plugin/`, `extension/`, `hooks/`, `skills/`: no product code changes.
- `README.md` lead: the README rewrite is a separate pending draft awaiting Macdara's go.
- `.github/workflows/pages.yml` behaviour, and no Pages dispatch.

## Hero visual (recommended, not mandatory)

A side-by-side race on a shared timeline. One relay run: the context climbs and resets at each clear (a sawtooth) while PLAN items tick to 30/30. Against it, the compaction run that stopped: two drops, then a halt at item 20 with 10 items open. Use the real per-reply context from the transcripts.

## What "good" looks like

- A reader understands each finding in under 10 seconds, with its n visible.
- Every run appears; nothing is hidden to flatter the result.
- Motion explains the data (the race, values counting up, dots landing). It is not decoration. `prefers-reduced-motion` gets a static, complete version.
- It looks like a deliberate, premium design and avoids the default Claude look. Name the palette in the design brief; do not use clay or maroon.
- Works at 390 px wide with no horizontal scroll.
- The page and the MP4 show identical numbers because both read the same JSON.

## Required deliverables

1. Extract: transcripts -> results.json (per-run series: timestamp, context tokens per reply, clears and compactions, plan item ticks, tool calls; per-run totals). A node test asserts the totals reproduce the RESULTS.md table values exactly.
2. Design rationale in plain text before any page code (palette, type, layout, motion plan).
3. New index + archive page; factcheck and copycheck green.
4. HyperFrames composition reading results.json; render a 30-45 s MP4 at 16:9 (plus 1:1 if cheap).
5. Screenshots at 1440 and 390, read by you, before calling any visual done. Load the page in Brave with no console errors. Grab a frame of the race from the MP4 and check its numbers.
6. One PR. In the PR body, list which data slots are still placeholders.

## Suggested workflow

1. Read the source-of-truth files. Run `/pre-build` if scope feels loose.
2. Build and test the extract first: it is the foundation for both outputs.
3. `/design-brief`, then `/build-frontend`, then `/design-review`.
4. `/hyperframes`, then `/hyperframes-core` before writing composition HTML.
5. `/commit` with an `## Evidence` section.

## Constraints

- One PR. Branch: `feat/results-infographics`.
- Copy rules: no em or en dashes, no metaphor, no negation-shaped phrasing, never imply the plugin is official, 565.6M is always called an estimate, NEVER say the relay is cheaper than auto-compaction (measured cost was equal), and every percentage carries its n.
- Merging the PR is fine. Publishing to GitHub Pages (pages.yml dispatch) needs Macdara's explicit go every time: it changes launch claims.
- External scripts only from a CDN pinned to a version (GSAP from cdnjs is fine), or vendored.

## Out-of-scope follow-ups (capture, don't build)

Append to [docs/CLAUDE-TODO.md](docs/CLAUDE-TODO.md). Do not fix inline.

## Why this brief is structured this way

The old page's headline was an estimate against a chat that never compacts; the new numbers are smaller but measured. The data file, the honesty model and the factcheck gate exist so that a polished page cannot drift into overselling.