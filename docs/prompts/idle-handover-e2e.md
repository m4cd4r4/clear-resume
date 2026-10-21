# Idle handover end-to-end test and VS Code control brief

Open this in a fresh Claude Code session in the worktree. Do not carry context from any other session.

## First action: rebase before doing anything else

```bash
git fetch origin main --quiet
git rebase origin/main
```

## The problem

clear-resume has an idle handover (`idle_handover` = off, toast, smart or auto): before the prompt cache expires, Claude writes a handover and the session clears, so returning costs a fraction of a cold rewrite. Macdara wants to sell this as a major feature: walk away, pay little on return, lose little meaning.

What is proven, and what is not:

- Proven (price, harness): a cold return to a 390k-token Sonnet 5.5 session cost US$1.559 in 3 of 3 runs. A handover written while the cache was warm plus a fresh session reading it cost US$0.152 to 0.168 (n=3). Those runs used a scripted handover in `I:/Scratch/_ab/idle3.mjs`, not the plugin's own idle feature.
- Proven (mechanism, n=1): one live run on 2026-10-10 showed the toast and `auto` firing. It was a functional check, not a measurement.
- NOT proven: the plugin's idle `auto`/`smart` path firing at the right moment in a real session, the cost of that whole flow, and whether the rules, goal and next step survive it. `smart` declining correctly was never measured.
- Known failure: on 2026-10-19 Macdara's own install had this feature silently dead because the plugin cache's `plugin.json` did not declare `idle_handover`, `cache_ttl_minutes`, `idle_min_tokens`, so Claude Code never passed them to the relay.
- The VS Code extension has no idle control at all (no mention of idle in `extension/src` or `extension/package.json`).

## Source of truth (read these first)

1. [plugin/hooks/relay.ts](plugin/hooks/relay.ts): idleMode, idleDue, idleCheck, idleTick, idleEffective. It acts only in an INTERACTIVE session (`r.interactive`), never under the headless runner, so `claude -p` cannot test it.
2. [plugin/.claude-plugin/plugin.json](plugin/.claude-plugin/plugin.json): the three idle options and their defaults.
3. [scripts/idle-cost.mjs](scripts/idle-cost.mjs): prices a cold return from local transcripts.
4. `I:/Scratch/_ab/idle3.mjs`, `idle2.mjs`, and the sections "Idle gap" and "Planned tests: results" in `I:/Scratch/_ab/RESULTS.md`: how the earlier price runs were set up and read.
5. `I:/Scratch/_ab/idle-live/` (the 2026-10-10 live check): its home dir and any logs show how an interactive run was driven. Find how it was automated before inventing a harness.
6. [README.md](README.md) idle handover section and [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md): the claims this test must back or correct.

If this brief contradicts those files, the files win.

## What is in scope

Part 1, the test (run first, in this session):

- Prove the plugin's own idle `auto` path end to end, in an isolated config, on the subscription. Flow: build a session to roughly 250k tokens of context on a small repo, with 3 standing rules given only in chat and a clear next step; leave it idle until about 5 minutes before the 60 minute cache expires; confirm the relay writes a handover and clears; confirm the fresh session loads it and continues.
- Record: context size at the idle trigger, the time it fired against the cache expiry, the handover contents, the cost of the whole flow (use `scripts/idle-cost.mjs` and transcripts), and a cold-return control priced the same way.
- Score after the clear: are the 3 chat-only rules kept on the next task (check by script, as in `I:/Scratch/_ab/probes/t7` and `t8`), is the stated next action taken, and is anything the user decided missing from the work.
- Also check `smart`: one run where the work is genuinely finished (it should decline with "Nothing to hand over.") and one where it is not (it should save).
- Run once, then report. Do not claim a rate from one run. If it works, say what n=1 shows and propose the repeat count.

Part 2, the VS Code control (only after Part 1 passes, as its own PR):

- A status-bar item in the extension showing the idle mode (off, toast, smart, auto) with a click-to-change picker, like the relay item in `extension/src/stats-status.ts`. Writes the plugin option the same way the relay picker does.

## Out of scope (do not modify)

- The nudge default (PR #130 is open and separate).
- The relay stall guard, the handover skill, and store code, except for a bug the test proves.
- Anything under `I:/Scratch/_ab` except new files you add for this test.

## Hard constraints

- Subscription only. Use the token at `~/.claude/secrets/claude-oauth-token` via `CLAUDE_CODE_OAUTH_TOKEN`. NEVER use an API key or `anthropic-research-key`; any API-key spend needs Macdara's yes on a dollar figure.
- Isolated config: a throwaway `CLAUDE_CONFIG_DIR` (no CLAUDE.md, memory, skills, rules or MCPs) and, for any VS Code instance, a throwaway `--user-data-dir` and `--extensions-dir`. NEVER sign in inside a test instance and never launch a VS Code Extension Development Host from Macdara's shell (it kills his open windows). Prefer a plain terminal `claude` session in the isolated config.
- Install the plugin from GitHub (`claude plugin marketplace add m4cd4r4/clear-resume`), not the local folder, so the run also tests the real install path. Confirm `plugin.json` options reach the relay (the 10-19 failure).
- Do not delete or change anything outside your worktree and your own test dirs. Do not touch Macdara's `~/.claude/settings.json` or plugin cache.
- Predictions first: write the expected outcome (fires at about 55 minutes idle, cost near US$0.15 to 0.3, 3 of 3 rules kept) to a file and hash it before the run. Report misses.
- Report what the test could and could not see. One run is a functional proof, not a rate.

## What "good" looks like

- A short results note in `docs/research/` that says, with n: whether the idle auto path fired on time, what the flow cost against the cold control, and whether rules and next step survived. Misses and caveats next to the numbers.
- If it fails, the failing step named in one sentence with the evidence, and a fix PR only if the cause is clear.
- Part 2: a PR with the status item and picker, tests passing, and a screenshot read at 1440 and 390 if any web page changes (the extension itself is checked by its tests and a throwaway-profile run).

## Deliverables

1. Predictions file plus hash.
2. The run record (transcripts, costs, handover text) kept under the worktree's `docs/research/idle-e2e/` or a path outside the repo noted in the results.
3. Results note.
4. Part 2 PR after Part 1 passes.

## Suggested workflow

1. Rebase. Read the source-of-truth files. Find how `idle-live` was driven.
2. Write and hash predictions.
3. Prove access cheaply first: one tiny call to prove the OAuth token works, free disk space, and that the plugin options arrive in the relay.
4. Run the test in the background in chunks; the idle wait is about an hour, so poll sparingly.
5. Score, write up, then build Part 2.

## Out-of-scope follow-ups (capture, don't build)

Append to `docs/CLAUDE-TODO.md`: repeat runs for a rate, API-key 5 minute cache path, `smart` decline accuracy at scale.

## Why this brief is structured this way

The idle handover is about to be marketed on a price result that came from a scripted harness. A feature sold as "small loss of meaning" needs one run of the real plugin showing it, and it silently failed once already on the author's own machine.