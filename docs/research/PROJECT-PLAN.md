# Context-rot research: project plan

Started 2026-10-11. Owner: Macdara. Status lives in the table at the bottom; update it as each wave lands.

## Goal

One honest research post at `solaisoft.com/research/<slug>` (solaisoft repo, `app/research/[slug]`) that says what the
A/B study found, with pros and cons:

- Clearing early to save money gives little: at list price the session that never compacts used 1.6x the tokens and
  cost about 6% more (Sonnet 5.5, n=3 vs n=5). Relay and auto-compaction cost the same (US$9.08 vs US$9.19, n=5 each).
- Handing over before the prompt cache expires saves about 10x on the return (US$1.56 cold vs US$0.15 to US$0.17,
  Sonnet 5.5, 390k context, n=3).
- Quality vs context length: what the literature says, plus two measurements of our own (below).

The post links to the animated results page (m4cd4r4.github.io/clear-resume) and the GitHub repo. The results page
gains a Quality section from the same data pipeline (`site/extract-results.mjs` -> `results.json`).

## Decisions (Macdara, 2026-10-11)

- Experiments funded: **recall probes** and **grading the finished sites**. Not funded: compaction-vs-handover
  fidelity, fresh API builds.
- Venue: `solaisoft.com/research` (not a new /labs section; `/lab` is the internal design sandbox).
- API: research key at `~/.claude/secrets/anthropic-research-key`, ~US$200 credit this month (his figure; no balance
  endpoint). Verified with a 1-token call 2026-10-11. **Rotate it after the runs** (it was pasted into chat).

## Decisions (Macdara, 2026-10-11, later the same day)

The A/B found no cost benefit in handing over at 180k against auto-compaction (no published arm used 250k; corrected 2026-10-23), and a ~10x saving on an idle return. New direction:

- **Lead with the idle handover.** The page and README lead with handing over before the prompt cache expires, cost on the
  axis. The relay-vs-compaction charts move to a research page, kept as evidence. The README's top video (the relay
  replay) is replaced. Do not claim "no benefit": the finding is "no measured cost benefit vs auto-compaction".
- **Quality is the main question, not a side section.** If a fresh session with a handover answers and builds better
  than the same session at long context, find the context size where that starts, and test whether ~250k is near it.
  This may matter as much as the idle saving. It reverses the earlier "not funded: compaction-vs-handover fidelity".
- **Cost-benefit across sessions:** measure from real transcripts (the idle-cost script below), not from guesses.
- **P5 approved** (5-minute cache; uses the research key, inside the US$150 budget). The cache lifetime is set by the
  Claude Code client, reportedly moved from 1 hour to 5 minutes in March 2026 (DevClass, anthropics/claude-code#32671),
  so the 60-minute thesis needs checking, not assuming.

Honest-design notes for the quality work:

- A handover cannot hold more information than the full context. The only way it wins is if the model uses a long
  context worse than a short one. The probes test that directly: same question, full context vs fresh context + note.
- The note is written by the model AT that long context, so a degraded writer yields a degraded note. Test it: write the
  note at each fill point, do not reuse one.
- Recall probes measure retrieval. "Better output" needs a task-level test as well (continue the build from that point,
  grade the result mechanically). Wave 6 sketches it; get Macdara's approval on spend before running it.
- Fix the predictions, the questions and the scoring (exact answers, no judge model where avoidable) before any run.

## Rules carried from the A/B study

- Predictions written into `I:/Scratch/_ab/RESULTS.md` BEFORE each run, with a timestamp. Report every one, in or out.
- Every number on a page carries its n, and goes through the FACTS ledger (`site/FACTS.md`, `factcheck.mjs`).
- Costs are API-equivalent and say so. Never imply the relay is cheaper than auto-compaction.
- Hard budget: the harness sums `usage` cost per call and stops at **US$150** total, US$50 under the credit.

## Waves

| Wave | Work | Spend | Output (reserved paths) | Gate |
|---|---|---|---|---|
| 1 | Literature review on context rot | none | `I:/Scratch/_ab/context-rot-literature.md` | read by Macdara |
| 1 | Site grading: design + run (checklist, broken links, Lighthouse, blind rubric with the arm hidden) on the 13 finished Sonnet builds and 8 Opus builds | < US$10 | `I:/Scratch/_ab/grade/` | predictions first |
| 2 | Recall-probe design: harness, question set, fill points, cost estimate | < US$2 (smoke) | `I:/Scratch/_ab/probes/` | Macdara approves the spend |
| 3 | Recall probes: run | ~US$25-80 est. | `I:/Scratch/_ab/probes/results*.json`, RESULTS.md section | predictions first |
| 4 | Results page Quality section (clear-resume PR) | none | `site/` | checks green, screenshots 1440/390 |
| 5 | Research post (solaisoft PR), animated, links out | none | solaisoft `app/research/<slug>` content | **prod deploy ask-first** |

Added 2026-10-11 (later):

| Wave | Work | Spend | Output (reserved paths) | Gate |
|---|---|---|---|---|
| 2b | Handover-size sweep, recall: the wave 2 harness at fill points 50k, 100k, 150k, 180k, 250k, 350k, 450k. Arm A full context, arm B fresh context + a note written at that point (one note call per point). Optional arm C: Claude Code's own compaction summary at the same point | within wave 2/3 budget; arm C needs approval | `I:/Scratch/_ab/probes/sweep*.json` | predictions first (where does B overtake A?) |
| 6 | Task-level quality: continue the build from a fill point with the next PLAN items, in a fresh session with a note vs the full context; grade mechanically (PLAN items, tests, Lighthouse, links). Sketch only until wave 2b shows a gap | est. US$40-100, Macdara approves | `I:/Scratch/_ab/quality/` | wave 2b result |
| 7 | Idle-cost script: scan `~/.claude/projects` transcripts for every gap over the cache TTL, estimate cold-return cost and the handover alternative, in dollars, per user over a period. Ships as a command | none | clear-resume `scripts/` + test | test asserts a known transcript |
| 8 | Site restructure: idle-first page with cost on the axis, relay-vs-compaction to `site/research.html`, new idle video, README top video swapped. Several PRs | none | `site/`, README | checks green, screenshots 1440/390; Pages dispatch needs Macdara's go |
| 9 | P5: 5-minute cache idle return (research key). Settles the TTL question | ~US$2-4 | `I:/Scratch/_ab/` + RESULTS.md section | prediction written first |

Order: wave 7 and wave 9 first (cheap, they decide whether the idle thesis holds and what it is worth), then 2b, then 8
once the numbers are in, then 6 if 2b shows a gap.

Worktree slugs: `clear-resume-quality` (wave 4), `solaisoft-research-context-rot` (wave 5), `clear-resume-idle-cost`
(wave 7), `clear-resume-restructure` (wave 8).

## Recall-probe sketch (wave 2 decides the details)

- Source: the never-compacting Sonnet transcripts (`site-sonnet/compact*`), which grow past 400k in one session.
- At fixed fill points (about 50k, 150k, 300k, 450k), cut the transcript there, append one question, ask the API.
  Questions have answers fixed by the run's own git history and files (e.g. "which file holds the colour tokens set
  in item 3?"): early facts (rot candidates) and recent facts (control).
- Comparison arm: a fresh context holding only the relay's handover note at the same point (what clear-resume gives).
- Prompt caching: one cache write per fill point, then many questions as cache reads. Rough cost at list price:
  3 transcripts x 4 points of writes ~US$11, ~360 questions of reads ~US$11, Sonnet 5.5. Opus doubles it.
- Risks: Claude Code's system prompt and tool schemas are not in the transcript, so the replay is not the exact
  context the agent saw (state it on the page); tool_use/tool_result pairs must stay valid; scoring needs exact
  answers, not a judge model, wherever possible.

## Site-grading sketch

- Mechanical first: PLAN.md acceptance items present, HTML validity, broken links, Lighthouse (median of 3), console
  errors. These need no model.
- Blind rubric second: a judge model sees two sites with the arm hidden, pairwise, both orders. Flag it on the page
  as a model judgement.

## Status

| Wave | State | Where |
|---|---|---|
| 1 literature | running 2026-10-11 | `_ab/context-rot-literature.md` |
| 1 grading | not started | |
| 2-5 | not started | |
| 2b, 6, 7, 8, 9 | planned 2026-10-11, not started | this file |
