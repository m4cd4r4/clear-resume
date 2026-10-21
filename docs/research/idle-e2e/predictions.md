# Predictions, written 2026-10-21 before any run

Setup: Claude Code 2.1.302, Sonnet 5.5, plugin installed from GitHub (m4cd4r4/clear-resume, main at 84a4f7f) into a throwaway config with idle_handover=auto, cache_ttl_minutes=60, idle_min_tokens=100000.

Main run (arm A, auto, ~250k context):
1. The idle path fires between 55:00 and 55:45 min after the last reply (tick is 30 s; due window 55 to 60 min).
2. Context at the trigger is 245k to 265k tokens.
3. The relay writes one handover, clears, and the new session loads it. The fresh session does not continue on its own.
4. Whole flow cost (idle turn plus the fresh session until the next task is done) is US$0.15 to 0.30.
5. Cold-return control (arm B, same build recipe, headless resume after the 60 min cache lapses, same next-step prompt) costs US$0.9 to 1.3.
6. After the clear, 3 of 3 chat-only rules are kept on the next task, the stated next action is taken (src/slugify_title.mjs plus its spec), and the underscore-separator decision survives.

Smart mode (short TTL 10 min, small context, so only the model's decision is tested, not the timing):
7. Work finished (arm S1): it replies "Nothing to hand over.", saves nothing, clears nothing.
8. Work unfinished (arm S2): it saves a handover and the session clears.

Smoke (auto, TTL 10, ~30k context): fires about 5 min after the reply.

Likely misses I expect to report: the pty driver can mis-detect reply end; a resumed session may differ from one typed live; one run per arm is not a rate.
