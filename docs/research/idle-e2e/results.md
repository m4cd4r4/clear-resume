# Idle handover end to end: results, 2026-10-21

One run per arm. This is a functional proof of the plugin's own idle path, not a rate.

Setup: Claude Code 2.1.302 (2.1.306 for the A arm's later sessions), Sonnet 5.5, subscription token only, plugin installed from GitHub (`m4cd4r4/clear-resume`, main at 84a4f7f) into a throwaway `CLAUDE_CONFIG_DIR` per arm. Predictions were committed before the run (`predictions.md`, sha256 in `predictions.sha256`, commit 2205c11). Run records, transcripts and harness: `I:/Scratch/_ab/idle-e2e/` (outside the repo).

The plugin options reached the relay: `settings.json` carried `idle_handover`, `cache_ttl_minutes`, `idle_min_tokens`, the cached `plugin.json` declared all three, and the idle prompt fired in every arm. The 2026-10-19 silent failure did not recur on a GitHub install.

## Results against predictions

| # | Prediction | Result | Verdict |
|---|---|---|---|
| 1 | Auto fires 55:00 to 55:45 after the last reply | A fired at 55.19 min (10:58:30Z, reply 10:03:19Z) | Hit |
| 2 | Context at trigger 245k to 265k | 263,733 tokens | Hit (near the top) |
| 3 | One handover, clear, new session loads it, does not continue alone | All three happened; the fresh session stopped after the load | Hit |
| 4 | Whole flow US$0.15 to 0.30 | US$0.225 (idle turn 0.136 + post-clear turns 0.088) | Hit, see caveat 3 |
| 5 | Cold-return control US$0.9 to 1.3 | US$1.024 priced at list; the CLI's own `total_cost_usd` says US$2.257 | Hit by list price, see caveat 2 |
| 6 | 3 of 3 rules kept, next action taken, underscore decision kept | Rules and decision kept; next action NOT taken on "Go on." (see below). Taken, 7 of 7 checks, on a second prompt | Partial miss |
| 7 | Smart, work finished: "Nothing to hand over." | S1 fired at 5.22 min, replied "Nothing to hand over.", saved and cleared nothing, US$0.0044 | Hit |
| 8 | Smart, work unfinished: saves and clears | S2 fired at 5.25 min, saved, cleared, new session loaded it | Hit |
| Smoke | Fires about 5 min after the reply (TTL 10) | 5.25 min, handover loaded, "Go on." produced the next file, 7 of 7 checks, US$0.173 | Hit |

## The miss (prediction 6)

After the clear I sent "Go on." The A session answered "Holding off on slugify_title until you say to start. Want me to begin?" and wrote nothing.

That is the handover being faithful, not losing meaning. The chat said "Next up, NOT now ... Do not start it yet", and the handover recorded it: "Do NOT start slugify_title yet. The user said twice NOT now ... Wait for the user to say to start." My "Go on." was not an unambiguous go-ahead, and the harness design (the last build turn said "not now") made it a trap. In the smoke arm the same "Go on." went ahead, because that handover was titled "pending go-ahead" and the model read it that way. Same prompt, two readings: this is a variance finding, not a fix.

Post-hoc, not pre-registered: I then sent "Go on with the next step." (the exact prompt the cold control got) to A's cleared session. It wrote `src/slugify_title.mjs` and `spec/slugify_title.spec.mjs`: first line `// KESTREL-OK`, no `console.log`, spec in `spec/` with no `test/` directory, slug joined with underscores, and `slugify_title("The Quick Brown Fox Jumps Over")` returned `the_quick_brown_fox_jumps` (checked by `score.mjs`, 7 of 7). Count this as "survives when told to proceed", not as the pre-registered pass.

## What survived the clear

- A: all three chat-only rules, the underscore decision, a fourth rule (one short line per reply), the "do not start yet" instruction, the ERROR counts from the data reads, and the files done so far. The handover is in `A/home/.clear-resume/loaded/`.
- S2: all three rules and the underscore decision, the "Do not" note that `npm test` fails on this Node version (run specs by path), and the correct next step. The fresh session wrote the slugify spec, then `truncate_words` and its spec. By hand: every new `.mjs` starts `// KESTREL-OK`, no `console.log`, specs in `spec/`, no `test/`, slug joined with `_`. I did not re-run the specs; the "8 new tests pass" line is the session's own report.
- Missing: nothing the user decided was absent from the work in A or S2. I did not test decisions that were never written into the transcript.

## Cost

Priced with Sonnet 5.5 list prices (input 2, 1h cache write 4, cache read 0.10, output 10 US$/MTok) from the transcripts (`cost.mjs`).

| Flow | US$ |
|---|---|
| A idle turn (handover write, cache warm) | 0.136 |
| A after the clear (two short turns) | 0.088 |
| **A whole flow** | **0.225** |
| B cold return, 65 min wait, one turn | 1.024 |

B and A were built to the same size: 263,165 vs 263,733 tokens at the last build reply, so the comparison is like for like. The earlier 390k-token figure (US$1.559) is a different size and is not comparable. On this one pair the idle flow cost about a fifth of the cold return (0.225 / 1.024). B did not write the handover or read it; it also finished the task in one turn, while A needed two prompts because of the miss above.

## Caveats

1. n=1 per arm. Nothing here is a rate.
2. B's CLI-reported cost (`total_cost_usd` US$2.257 on 247,360 cache-write tokens) implies about US$9/MTok for the write, against the US$4 in the price table used by the earlier runs and by `idle-cost.mjs`. I did not resolve the difference. By the CLI figure the ratio would be about ten to one; by list price about four to one. State the list-price number and name the other.
3. Cost excludes the harness's "ready" ping that starts the idle clock, and A's follow-up turn is included in the post-clear figure.
4. The sessions were built headlessly (`claude -p --resume`) and then resumed in an interactive ConPTY so the relay saw a reply; the idle clock starts at that reply. A session typed live may differ. The drive process ends each arm with "claude exited code 1" because the harness kills it, not a plugin fault.
5. The smart arms used about 25k tokens and a 10 min TTL, so they test the model's finished/unfinished decision, not timing at scale. One decline and one save say nothing about decline accuracy.
6. The score script checks the rules on the files written after the clear; for S2 I checked by hand because its next step differs.
7. The idle clock in A started when the harness ping replied, 5 min after the build's last reply, which kept the cache warm; the cache TTL was 60 min as configured.
8. A weekly-limit warning (84% used) was on screen throughout. The runs did not hit a limit.

## Proposed repeats

n=3 for A (auto, 250k) with the unambiguous go-ahead wording fixed in advance, and a decision on how to phrase the post-clear prompt before the run so the ambiguity is not re-created. A 5 minute cache path needs an API-key run and Macdara's yes on a dollar figure. `smart` decline accuracy needs a spread of finished and unfinished sessions, not one of each.
