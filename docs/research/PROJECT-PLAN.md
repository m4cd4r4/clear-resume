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

Worktree slugs: `clear-resume-quality` (wave 4), `solaisoft-research-context-rot` (wave 5).

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
