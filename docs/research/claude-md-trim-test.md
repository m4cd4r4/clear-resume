# Does trimming a project CLAUDE.md change the work? Test design

Status: run 2026-10-12 to 2026-10-13 (AWST), 40 scored runs. Results are at the end of this file. The design and prediction below were written 2026-10-12 before any run and are unchanged.

## Question

The solaisoft `.claude/CLAUDE.md` is 4.5k tokens, loaded on every reply in that repo. A trimmed copy of about 2.0k tokens keeps the rules the code cannot teach and moves the rest behind a pointer. Does the trimmed file change cost, rule violations or pass rate?

Why test: the sources we have disagree on size. An ETH Zurich paper (138 real issues) found context files do not raise success and add about 20% cost. One creator deleted a repo's CLAUDE.md across 44 tasks and exactly one rule broke (the rule the code could not teach). Both are one source each. We have not measured our own.

## Money at stake, stated first

Each 1k tokens loaded on every solaisoft reply is worth about US$17 a month (solaisoft is roughly 35% of replies, an estimate). Saving about 2.5k tokens is therefore about US$45 a month. The test is cheap enough to pay back inside a month, but the larger value is the answer for the global rules (about 10k tokens, loaded in every project).

## Proposed split of the current file (216 lines)

| Section | Lines | Action | Reason |
|---|---|---|---|
| Display copy: paraphrase test | 5-32 | Keep, shorten | Judgement check a script cannot make |
| Label test | 34-68 | Keep the rule, delete the part `check:structure` already enforces | The script fails on `restates-below` and `ui-instruction` |
| Word budgets | 70-81 | Move to docs, keep one line | Commands are in the script and the JSON |
| Acceptance scenarios | 83-90 | Keep one line (also fixes "The The") | Pointer |
| Service line: web design | 92-135 | Keep the decisions, delete skill descriptions | The skill list already describes `/tam-builder` and `/prospect-to-pitch`; the 2026-09-18 offer rules cannot be derived from code |
| Editing a Squarespace site | 137-182 | Move to `docs/portal/SQUARESPACE-REFERENCE.md`, keep a 3-line pointer | About 2k tokens loaded on every reply for a task done rarely |
| Middleware is proxy.ts | 184-189 | Keep | A `middleware.ts` is silently ignored |
| Client work / docs/ map | 191-204 | Keep, shorten | Load-rule: Glob and Grep do not load a nested CLAUDE.md |
| Work-surface data files | 206-210 | Keep | Three lines |
| /client portal: TailAdmin | 212-216 | Delete | History; `package.json` shows it |

Approved by Macdara 2026-10-12: all four edit groups go into arm B (Squarespace move with pointer, service-line compression, shorter paraphrase and label tests, portal history deleted and word-budget commands moved). Anything not in the table stays as it is.

## Design

- **Arms:** A is the current file. B is the trimmed file. Everything else is held constant: repo pinned to one commit in a throwaway worktree, same `MEMORY.md`, same global rules, model Sonnet 5.5 at medium effort (half the price of Opus 5.5; result may differ on Opus), `--max-turns` and `--max-budget-usd` on every run.
- **Isolation:** no push, no deploy, no network side effects. The Squarespace task is plan-only.
- **n:** 5 runs per arm per task, order randomised. Four tasks, so 40 runs.
- **Tasks, one per rule class:**

| Task | Rule it exercises | Check (script or fixed rubric, not the author model) |
|---|---|---|
| T1: add a 3-question FAQ section to /pricing | paraphrase test, label test, word budget | `check:copy`, `check:structure`, `check:words` pass; no eyebrow without a fact; rubric on each line |
| T2: step list to change a hero text on a Squarespace site (plan only) | the three Squarespace hazards | rubric 0-3: `setContent`, disable first, unauthenticated `curl` check |
| T3: draft the walk-in offer for a Squarespace-site prospect | the 2026-09-18 service-line decision | offers a custom build; does not offer in-place enhancement; no `/services/site-refresh` |
| T4: add an auth gate for `/partners` | proxy.ts | edits `proxy.ts`, does not create `middleware.ts` |

- **Measures per run:** first-reply tokens, total cost at list price, check result or rubric score, rule violations, number of files read (does arm B read more to compensate).
- **Grading:** scripts first. Rubric items are string checks on the transcript and diff. Where a model must judge, it is a different model from the one that wrote (Opus judging Sonnet), as the Short on self-checks found.

## Prediction (before any run)

- Arm B first reply is about 2.5k tokens smaller (about 3% of the 83k floor).
- T1 and T4: no change in pass rate.
- T3: arm B passes as often as A, because the decision stays in the file.
- T2: arm B drops unless the pointer makes the agent read the reference. If B passes 5 of 5, the move is safe. If B drops to 3 of 5 or lower, the Squarespace hazards must stay inline.
- Cost per run: arm B 3% to 6% lower, within run-to-run noise (the Shorts saw US$2.11 vs US$1.33 on one task).

## Limits

- n=5 per cell detects large effects only (5 of 5 against 2 of 5). A small accuracy loss would not show.
- Sonnet 5.5, one repo, four tasks. It does not generalise to every task or to Opus.
- The 35% solaisoft share and the dollar values are estimates from transcripts since 3 Oct.

## Cost

About 40 runs at roughly US$0.3 to US$1.5 each on Sonnet 5.5, so US$12 to US$60 plus judging. No spend until approved. The research key stays a path only.

## Results (2026-10-13)

Sonnet 5.5, medium effort, n=5 per arm per task, repo pinned at `e0916392`, runs and scoring in `claude-md-trim-test/` (`run.mjs`, `score.mjs`, `results/`). Cost is the CLI's own total at list price, billed to a throwaway research key.

| Task | A (current) pass | B (trimmed) pass | A mean cost | B mean cost | A reads | B reads |
|---|---|---|---|---|---|---|
| T1 pricing FAQ for Custom | 5/5 | 5/5 | US$0.489 | US$0.382 | 6.0 | 4.0 |
| T2 Squarespace plan | 5/5 | 4/5 | US$0.277 | US$0.367 | 1.2 | 2.2 |
| T3 walk-in offer | 5/5 | 4/5 | US$0.202 | US$0.198 | 0.0 | 0.0 |
| T4 auth gate for /partners | 5/5 | 5/5 | US$0.318 | US$0.338 | 5.2 | 5.2 |

- **First reply is 2.7k tokens smaller on arm B** (74.1k to 74.7k against 76.6k to 77.4k), against a predicted 2.5k to 2.8k. `claude -p` loads the project CLAUDE.md, so the comparison is valid.
- **No rule that arm B kept was broken more often than in arm A.** The two arm B misses are T2-B-4 (verify-before-save expressed as a payload diff, which the string check did not count) and T3-B-1 (a hook-driven clarifying question instead of a draft, not a rule violation). At n=5 this rules out large drops only.
- **Cost is not lower on arm B.** Differences are inside run-to-run noise except T2, where B reads `SQUARESPACE-REFERENCE.md` in 5 of 5 runs against 1 of 5 for A (A carries the hazards inline), costing about US$0.09 more per run. The saving is the 2.7k tokens on every reply that does not touch Squarespace.
- **T1 (Custom plan):** no eyebrow added in any run in either arm. Nine of ten added an H2 "Questions about Custom" style heading, equally across arms. The repo checks `check:copy`, `check:structure`, `check:words` were NOT run (the worktrees have no typescript, playwright or server), so the paraphrase and label rules are only screened by reading the diffs and a banned-character check.
- **T2 rubric was changed after reading the replies:** "disable the page first" applies to new or duplicated pages, and the task edits an existing page, so it is reported as info and "verify the block before SAVE" took its place. The T2 and T3 checks are string matches, and the T3 offer lines were also read by hand.

### Invalid runs and spend

- Two attempts were invalid and discarded: a first pair of runs where the prompt reached the agent as one word (Windows `shell: true` split it; the runner now passes the prompt on stdin), and a first T1 whose prompt named the Complete plan, which no longer exists at the pinned commit (kept in `results/_invalid-t1-complete/`). In that invalid T1 all 10 runs stopped to ask and edited nothing, which also shows the ask-before-writing-display-copy rule held in both arms.
- Total spend about US$16.4 including the invalid runs (about US$4.1 of it).
- The user's global hooks load in headless runs and add the same noise to both arms.

### Limits

One model (Sonnet 5.5), one repo, four tasks, n=5. A small accuracy loss would not show. Not tested: Opus, global rules, any task outside these four, the repo's own T1 checks.

### Reading

Arm B holds every rule these tasks exercise and trims 2.7k tokens (about 3%) from every reply in the repo, while making Squarespace tasks about a third dearer. Adopting it is a judgement on how often Squarespace work happens against how many replies are not Squarespace work.
