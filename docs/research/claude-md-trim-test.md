# Does trimming a project CLAUDE.md change the work? Test design

Status: design only, nothing run. Written 2026-10-12 (AWST), before any run, so the prediction below cannot be fitted afterwards.

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
