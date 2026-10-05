Task: build a demo website for clear-resume (a Claude Code plugin) in `site/`, working through the checklist in `site/PLAN.md`, one item at a time, top to bottom, until every item is ticked. `site/` starts with only `PLAN.md`, `shot.sh`, `.gitignore`, `fonts/` and `source/` (which holds `fixture/`). Everything else you write.

## Finish line

When every box in `site/PLAN.md` is ticked and committed: do NOT save a handover, reply RELAY-SITE-DONE and end your turn.

Until then, do not end your turn. Do not stop to summarise, check in or ask for review. clear-resume will ask you to hand over when the context gets large (the request arrives in a tool result); follow it, and the relay continues the work in a fresh session.

## This run is unattended

- Never ask a question, never call AskUserQuestion, never wait for an answer. When something is unclear, pick the simplest option that fits this file, note the choice in the commit message, and keep going.
- Do not run /design-brief, /build-frontend, /review-frontend or any other skill that asks questions. Do not dispatch subagents. This file is the brief.
- Stay inside I:/Scratch/cr-e2e. Never read or write outside it (a permission prompt stalls the run with nobody there to answer).
- Never read an earlier version of this site (no `git show`, `git checkout` or `git diff` of commits before the tag `site-v5-base`). Build from this file, PLAN.md and site/source/.
- Use the Read, Glob, Grep, Edit and Write tools for files. Use Bash only for these exact command shapes, one command per call, no `cd`, no `&&`, no pipes:
  `bash site/shot.sh`, `bash site/shot.sh 9000`, `bash site/shot.sh <height> <page>.html`, `bash site/shot.sh <height> <page>.html slices`, `git add site`, `git commit -m "..."`, `git status`, `git log ...`, `git diff ...`, `node <file under site/>`, `node site/buildstats.mjs site/source/fixture --since 2026-10-04T02:35:00Z`.
- Never start a dev server. The pages are opened from disk.

## Commit rhythm

- One commit per PLAN.md item, message `site: <item number>. <item text, shortened>`. Tick the box in PLAN.md in the same commit. The one exception is item 30: its message starts `final: 30.`, because a commit can never list itself in the build log, so the build log and every site: count stay true at HEAD.
- Big items take several commits: commit at least every ~30 minutes of work, and in a review item commit once per section. Two sessions in a row without a commit stops the relay.

## Look at it (required)

Before every commit that touches HTML or CSS: run `bash site/shot.sh` (pass a taller height such as `bash site/shot.sh 9000` once the page is long, and add `slices` to read a long page at a legible size), then Read `site/shots/desktop-top.png`, `site/shots/mobile-top.png` and the two `-full` shots (or the slices), and fix what you see. In the mobile shots a red OVERFLOW badge in the grey strip on the right means something is wider than 390 px: fix it before committing. A Stop hook blocks a turn that edits HTML/CSS without reading an image.

## The pages

Static HTML, CSS and JS: `site/index.html`, `site/how-it-works.html`, `site/changelog.html`, `site/styles.css`, `site/app.js`, `site/model.js`, `site/runstats.js`. No npm, no build step, no frameworks, no external requests (no CDNs, no web font services, no images from the web). The fonts are the files in `site/fonts/`, loaded with `@font-face` from a relative path. Must work opened from disk.

Who it is for: a Claude Code user whose long chats slow down and lose the thread. The one thing they should do: install the plugin with the relay on.

The site tells one story: this plugin let Claude build this site by itself, across sessions, with automatic clears. The page shows that run, then how to get the same.

index.html, five sections, in order:

1. **Hero.** The H1 is exactly "Clear the chat. Keep the work." and one subline. Straight under them, at full content width, the media box (spec below): it is the first thing you see at every width. Under the box, the two relay install commands, each with a copy button: `claude plugin marketplace add https://github.com/m4cd4r4/clear-resume` first, then the relay install (README.md:101 to 110: install is two commands, and the plugin install fails until the marketplace is added). An install command never appears without the `marketplace add` line before it.
2. **What it does.** Save a handover, `/clear`, carry on, shown as ONE terminal transcript built from the README's real command output (no cards, no three columns).
3. **The relay.** The recommended way to use it: what it does in one or two sentences, off by default, the Claude Code version it needs, and the sawtooth context chart (spec below) of this site's own build. Never claim the relay stops or waits when Claude needs input.
4. **Proof.** Two parts, each under its own h3, because they are different runs. The h2 and the first h3 are switched by `crRun.source` (`data-when`): for "run" the h2 is "Proof" and the h3 "This site's build"; for "fixture" the h2 is "Sample data" and the h3 "Sample: an earlier relay run". No heading names this build over sample data. First h3: the counter strip of sessions, automatic clears, site: commits, minutes, tokens sent. Values are slots filled by `site/buildstats.mjs` (spec below). Second h3 names the measurement and its date: 191 real `/clear` loads, median 195k before and 97k after, a median drop of 101k, from a separate 2026-10-03 run of `scripts/measure.mjs` (STATUS.md line 40). Every figure in that strip carries the word "median" in its own label ("median before", "median after", "median drop"). No sentence explains how the median drop was computed: STATUS.md gives the three figures and no method. Its source line names the open PR with STATUS.md's snapshot date: "as of 2026-10-03, scripts/measure.mjs is on the open PR #57, not in the released plugin" (STATUS.md lines 3 to 4, 40 and 69). Any state taken from STATUS.md (open PR, in flight, not released) carries "as of 2026-10-03". It is a different run from this build: never say "the same run".
5. **Install.** Leads with the relay one-liner (copy button), then the manual way as the fallback (install, then `/clear-resume:handover`, `/clear`, `go`), then one line for the VS Code extension. Then the FAQ, exactly three `<details>`: "Does anything leave my machine?", "What does it need?", "When does the relay stop?", each answered from the README. "What does it need?" keeps every condition of the relay requirement: 2.1.275 or later, in a terminal, not yet proven from the VS Code chat panel (README.md:81). "When does the relay stop?" gives every case the sources list, including CHANGELOG.md:20 to 21 (it stays out of the way for a subagent's save, a failed save, an interrupted turn and headless runs), or says the list is partial.

how-it-works.html carries the depth: the handover, the loop diagram, the worked example, the comparison of `/compact`, `--resume`, `/clear` and clear-resume, the model, start size, settings. changelog.html: releases and the build log.

Footer on every page: the licence and independence line, links to all three pages and GitHub, and on index.html the one-line colophon (PLAN.md lists it). No "Built by itself" section.

## Media box (hero)

- Paths are fixed: `site/media/replay.mp4` and `site/media/replay-poster.jpg`. They are added after this run by a script; do not create them, and do not create `site/media/`.
- `<video>` with `muted`, `playsinline`, `autoplay`, `loop`, `preload="metadata"` and the poster. A visible pause/play button over the video (44 px, labelled, keyboard reachable) toggles playback.
- Under `prefers-reduced-motion: reduce`: no autoplay; the poster shows with a play button, and play starts only on click.
- Until the files exist: the video's error event, or the poster failing to load, swaps the box to a fallback: a looping terminal feed of the loop (context climbs, nudge, handover saved, `/clear`, handover loaded, carries on), text only, pure CSS/JS. Reduced motion shows its final frame. The box keeps one aspect ratio (16:9) in both states, so nothing moves when the files arrive.
- Caption under the box: "Replay of the run that built this page." Shown only when the video loads; hidden in the fallback state. The video's `aria-label` is the same sentence. Both are FACTS.md lines whose source is `TASK.md: Media box` (the video is made from this run's transcripts after the run); this is the only place TASK.md may be a source.
- Fallback feed lines that are not verbatim plugin output (for example "Claude carries on from the handover", which is README narration) start with `# ` and use the narration style, the same as the What it does transcript.
- A line styled as user input is only something the user types on that path. On a "with the nudge on" path the save is narration (`# Claude is asked to save a handover`, README.md:197), never a typed `/clear-resume:handover` line.

## Build stats (site/buildstats.mjs, run after the run)

The real numbers of this build exist only after the run ends, so the page holds marked slots and a script fills them. You write and test the script; after the run it is run once on the real transcripts and committed as `stats: ...`. The build log on changelog.html says so in one line.

- Usage: `node site/buildstats.mjs <transcripts-dir> [--since <iso time>]`. `--since` defaults to the commit time of the tag `site-v5-base` (`git log -1 --format=%cI site-v5-base`).
- Reads every `*.jsonl` in the directory. A session belongs to the run when its first record is at or after `--since` and its first user prompt starts with "Read TASK.md and do it." or "Continue from the clear-resume handover". The run is the chain from the first "Read TASK.md and do it." session, in start order, up to the record whose assistant text contains RELAY-SITE-DONE. A second "Read TASK.md" session starts a different run: stop before it.
- The first user prompt is the first `type: "user"` record whose `message.content` is a string, that is not `isMeta`, and whose content, after leading whitespace, does not start with `<`. Every relayed session opens with a `<command-name>/clear</command-name>` record and caveat wrappers before the real prompt; taking the first string record instead finds 1 session where the run had 13 (v4 attempt 1). Test it: copy one fixture continuation file to a temp dir, prepend a user record whose content is `<command-name>/clear</command-name>`, and check the chain still counts it.
- Per session: start, end, and one point per unique assistant `message.id`: [minutes since the run started, context tokens], where context = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
- Totals: sessions; automatic clears = sessions minus 1; site: commits = `git log site-v5-base..HEAD --grep "^site:" --oneline` counted; minutes = run start to the RELAY-SITE-DONE record, one decimal; tokens sent = sum of context over every point, written as millions with one decimal (50.2M).
- Runs `node site/buildlog.mjs` first, so the build log ends with the last site: commit (the `stats:` commit is not a site: commit, so every count is true at the final commit).
- Writes three things, each between marker comments, replacing what is there: `site/runstats.js` (one global `crRun = { source, since, sessions: [{ id, start, end, points }], totals }`, where `source` is "fixture" when the directory is `site/source/fixture`, else "run"); the values into every `data-stat` slot on the pages (`sessions`, `clears`, `commits`, `minutes`, `tokens`, `first`, `last`, the last two as AWST times from git); and their lines in FACTS.md (ids F90 to F96, each line stating the figure, what it counts and "buildstats.mjs").
- Test it with `node site/buildstats.mjs site/source/fixture --since 2026-10-04T02:35:00Z`. The fixture is an earlier relay run trimmed to timestamps and usage: it must give 9 sessions, 8 clears, 52.8 minutes and 50.2M tokens (commits come from this repo's git log, so they differ). Commit the fixture output: the page must render with it during the run.
- While `crRun.source` is "fixture", the relay section and the proof strip each show a visible label "Sample data from an earlier run. Replaced after this build." in the ghost text colour. It disappears when the source is "run".
- Fixture figures and this repo's git figures never sit together. While the source is "fixture", buildstats.mjs writes "n/a" into the git slots (`commits`, `first`, `last`), and the index colophon is hidden. Every source line beside a stat is chosen from `crRun.source`: for "run" it reads "Source: this site's build transcripts (buildstats.mjs)" (chart) or "Source: this site's build transcripts and git log (buildstats.mjs)" (strip); for "fixture" it reads "Source: transcripts of an earlier relay run (site/source/fixture), buildstats.mjs". Each wording has its own FACTS.md line.
- factcheck.mjs, when `crRun.source` is "run", re-derives the git figures at HEAD and fails when they differ: the `commits` slot against `git log site-v5-base..HEAD --grep "^site:" --oneline` counted, `first` and `last` against the AWST times of the oldest and newest of those commits, and the build log's row count against the same count. When the source is "fixture" it checks that the git slots read "n/a" and the colophon is hidden. In both modes it checks the build log's row count against the site: count at HEAD.

## Sawtooth chart (relay section)

Inline SVG drawn by app.js from `crRun`: x = minutes since the run started, y = context tokens (0 to 220k), one line per session, a vertical hairline at each clear, the nudge level as a dashed ghost line showing that run's own setting. buildstats.mjs reads it from the run's nudge text in the transcripts (the tool-result line that says "threshold Nk") into `crRun.nudgeAt`; when the transcripts hold no such line (the trimmed fixture), `nudgeAt` is null and the line is labelled "plugin default, 180k (this run's setting is not recorded)". Axis labels in mono. Readable at 390 (at least 300 px tall there, labels never overlap). A text alternative under it states the session count and peak range from `crRun`. The chart's source line follows `crRun.source` (Build stats above).

## Model spec (site/model.js, checked by site/simtest.mjs)

`model.js` defines one global, `crModel`, with no DOM access, so node can load it. Constants: `STEP = 5000` (new tokens per reply), `HANDOVER = 780`, `SUMMARY = 8000`, `COMPACT_AT = 0.9`.

`crModel.run({ window, start, clearAt, work })` returns `{ clear, base }`. Each is one walk:

- clear: limit = `clearAt`, floor = `start + HANDOVER`. base: limit = `round(window * COMPACT_AT)`, floor = `start + SUMMARY`.
- Throw if `limit < floor + STEP`.
- Start at `ctx = start`. While `done < work`: `add = min(STEP, work - done)`; if `ctx + add > limit`, count a reset and set `ctx = floor`; then `ctx += add`, `done += add`, `reread += ctx`, count a reply, track the peak, push the point `[done, ctx]` (also push `[done, floor]` at each reset, and `[0, start]` first).
- Return `{ resets, peak, reread, replies, pts, limit }`. Also export the four constants and `compactAt(window)`.

`simtest.mjs` loads model.js in node and prints ok / FAIL per case, exiting non-zero on any FAIL. Cases, all must pass:

1. start 20k, clearAt 100k, work 400k, window 1M: clear resets 5 times.
2. Same: clear peaks at exactly 100k.
3. Same: both runs make 80 replies.
4. Same: the first stretch's reread equals the sum of 25k, 30k, ... 100k.
5. Defaults (1M, start 21k, clearAt 180k, work 2M): clear peak never passes clearAt.
6. Defaults: base peak never passes 90% of the window.
7. Defaults: clear rereads less than base.
8. Start 85k vs 21k: rereads more.
9. Start 85k vs 21k: resets more often.
10. A 200k window compacts at 180k.
11. clearAt below start + HANDOVER + STEP throws instead of looping.

UI (on how-it-works.html) defaults: window 1M, start 21k (range 15k to 150k, marks at 21k and 85k), clear at 180k (range 50k to the window's compaction point minus one step), task size 2M (range 200k to 5M). On a 200k window, say the base run compacts on its own. Assumptions shown in "How the model works": 5k per reply, reread summed over every reply, a 780-token handover stated with the README's own qualifiers (README.md:96: "About 780 tokens in the handover, an estimate", "Measured on the author's own 104 /clears, 20 to 28 Sep 2026, medians"), never as a fixed size, compaction at 90% keeping an 8k summary (both assumed, not measured), and that on the API cache reads are billed at a tenth of the input price. It also lists every simplification: the model clears at or below clear-at, while the plugin nudges once context is past the size and Claude then saves, so real peaks pass it (README.md:212). Labelled a model, not a measurement.

Any sentence outside the details list that uses an assumed constant (the 90% compaction point, the 8k summary, 5k per reply) says "assumed" in that same sentence. The start-size hint under the slider holds no figures of its own: it reads "Typical values: see Start size below" and links to that section, where each figure has its conditions and its own source line.

## Measured by hand (copy into FACTS.md as-is)

- Stock Claude Code starts at 21,200 tokens before your first message: Claude Code 2.1.289, Opus 5.5, empty CLAUDE_CONFIG_DIR, cwd with no CLAUDE.md, .claude or .mcp.json above it, 0 MCP servers, 27 tools. One headless "say hi" run; cache_creation_input_tokens 21,200 + input_tokens 2, read from the first assistant message. (measured 2026-10-04)
- Caveat for anyone repeating it: a cwd under your home folder picks up ~/.claude and ~/.mcp.json as project config (the same probe from such a cwd read 58,978).
- The author's sessions start at 77k to 99k (rules, skills, MCP).
- On the API, cache reads are billed at a tenth of the input price (Anthropic prompt caching pricing).

## Look

Monochrome terminal, the visual language of the replay video: a terminal feed, a chart, a counter strip. Name these tokens on `:root` and use nothing else:

- background `#0a0a0a`, surface `#121212`, hairline `#262626`
- text `#f2f2f2`, secondary text `#8c8c8c`
- ghost `#5a5a5a` for strokes and dashed lines only; ghost text uses `#808080`

No hue anywhere: no amber, no accent colour, no gradients, glows or glassmorphism. Action and status are shown by brightness, weight and border: a button is a `#f2f2f2` border with text, or text on a `#f2f2f2` fill; focus is a 2 px `#f2f2f2` outline; a success state is a text change ("Copied"). In charts, clear-resume is the text colour and anything compared with it is the secondary colour or ghost.

Type: JetBrains Mono (400, 700) for terminal content, commands, numbers, labels and the counter strip; Montserrat (400, 600, 700) for headings and prose. Both from `site/fonts/` via `@font-face` with `font-display: swap`, falling back to `ui-monospace, Consolas, monospace` and `system-ui, sans-serif`.

Fewer boxes: no grids of identical cards, no empty cards, no stat cards padded around one number. Use the terminal feed, the chart, the counter strip, hairline rules and plain text.

Layout: max width about 1120 px, compact spacing, 16 px side gutter at 390, no horizontal scroll at 390, tap targets at least 44 px. Respect `prefers-reduced-motion`. Visible focus styles. Contrast at least 4.5:1 for text.

## Copy rules

- Every fact comes from `site/source/` (README.md, CHANGELOG.md, STATUS.md), the "Measured by hand" block above, this repo's `git log`, or `buildstats.mjs`. This file is not a source: wording it suggests still needs a source line, and if none supports it, drop it. No fact from memory. If a fact is not in the sources, leave it out.
- Record each claim in `site/FACTS.md` before using it, one line each, in this shape: `F12 | page: "<the sentence exactly as the page shows it>" | source: "<the source sentence, quoted>" | README.md:65`. The ledger holds sentences, not just figures: the words that join a number to a thing ("in this build", "stay", "real") are claims too.
- Every element on a page that states a number or a claim carries `data-fact="F12"` (several ids space-separated). `node site/factcheck.mjs` (you write it) fails when: visible text holds a number outside a `data-fact` element; an id is missing from FACTS.md; the element's visible text does not match its line's page quote (whitespace-normalised); the source quote lacks a number the page quote shows; or the page quote uses one of "real", "actual", "live", "same", "measured", "always", "never", "only", "every", "all", "nothing" and the source quote does not. Version numbers and numbers inside commands count.
- Keep the qualifiers. When shortening, never drop a condition, exception or limit that changes whether the claim holds for the reader: a measurement keeps its conditions (or links to them), a privacy line keeps its exceptions (sync, web mode), a result keeps its source's "not yet proven" line. A caveat for someone repeating a measurement is never turned into advice to the reader.
- Keep words that say a list is partial. When a source says "These are the common cases" (README.md:170) or "three options that are not set yet" (README.md:113), the page keeps that wording; it never turns a partial list into a complete rule or a total.
- Which handover loads: keep the README's cases in full (README.md:154 to 170): the window that wrote it while open, the only one waiting from a closed window on any branch and 7 days old or less, other windows only list it, after compaction only this window's own handover. Add that a handover loads in the checkout it was saved in (CHANGELOG.md:85), and say these are the common cases.
- Every attribute that a reader or screen reader gets as text is a claim: `aria-label`, `alt`, `title` and `<figcaption>` each need a FACTS.md line, and factcheck.mjs checks them like visible text.
- A sentence keeps its antecedent. "Reread what a session started from, or @-mention it" (README.md:178) is about the copy in `~/.clear-resume/loaded/`; on the page it sits next to that path and names it.
- Each row or figure with a different source has its own source line. One source line never sits under figures from two sources (the 21,200 measurement and the author's 77k to 99k are two sources).
- A requirement keeps all of its source conditions wherever it is repeated (version, "in a terminal", "not yet proven from the VS Code chat panel").
- A version requirement attaches only to the feature its source names. When one sentence covers several options, it gives each its own minimum: the nudge settings in `/config` need 2.1.269 (CHANGELOG.md:41 to 42); the relay needs 2.1.275 and older builds ignore it (CHANGELOG.md:21 to 22).
- A release line keeps its source subsection: a line from "Known limitations" is labelled "Known limitation".
- A sentence about a step done after the run (buildstats.mjs, the `stats:` commit) is switched by `crRun.source` (`data-when`): future tense for "fixture" ("will come from ... and be committed as stats:"), past tense for "run".
- A FACTS.md source quote is a verbatim substring of the file it cites, and factcheck.mjs fails when it is not (whitespace-normalised). A figure written by a script cites that script with a verbatim line of its code. Never cite a script for wording that only TASK.md contains.
- A release line about a command keeps the flags the source says it needs (CHANGELOG.md:31 to 32 for 0.3.0's runner caps).
- Never move a sentence out of its section into a general statement (the uninstall section's "stay until you delete that folder" is about uninstalling). Never call demo material "real": the README's "Cart totals rounding" handover in the widget-shop repo is an example.
- Figures from different runs never share a heading or a "same"/"this run" link: each figure names its own source (script, date) beside it.
- Opt-in paths are labelled: the nudge and the relay are off by default (Manual is the default), so a diagram or step that shows them says "with the nudge on" or "with the relay on". Diagram node labels use exactly those words: the /clear node says "you type it" and "or the plugin, with the relay on", never "you or relay".
- A script that writes copy derives only values. Every word around those values is copy and needs its own FACTS.md line, and copycheck and factcheck cover script-written regions too.
- Each figure on a page shows what it measured and a small source line under it (ghost text, mono). No grading adjectives about numbers (no "only", "just", "massive", "a healthy").
- The README's "real run, 3 Oct 2026" caption (7 sessions, 26 commits, 38.1M tokens) and the 3 Oct link.sh run describe other runs. Leave both out.
- The relay enable command is the README's `claude plugin install clear-resume@clear-resume --config auto_nudge=true --config relay=10`. Say it works in a terminal, as the README does.
- No count, time or sha typed by hand: derive it from `git log` or a script, and say which in FACTS.md. This run's commits are `git log site-v5-base..HEAD --grep "^site:"`; older site: commits belong to earlier builds and are never counted.
- index.html has at most 250 visible words, counted by `site/copycheck.mjs` over the body's visible text excluding `<pre>`, `<code>`, `<svg>` and `aria-hidden` content. Less copy than feels necessary. Short sentences, plain words.
- No em dashes, no en dashes, no ellipsis character. No "not just X" or "not X, but Y" constructions.
- No invented quotes, users, ratings, download counts or testimonials.

## Replies

- Never put markdown file links in a reply (a Stop hook rejects them). Write paths as plain text.

## Handovers

When clear-resume asks for one, the handover must: name the next unticked PLAN.md item and anything half-done; say "Read TASK.md and site/PLAN.md, then continue"; repeat the finish line (all of PLAN.md ticked, then RELAY-SITE-DONE with no handover); repeat that the run is unattended (never ask, never end the turn early unless clear-resume asks for a handover); and repeat the screenshot rule. Never tell the next session to stop and ask.
