#!/usr/bin/env node
// clear-resume run: a headless claude -p that hands over and resumes itself.
//   node run.mjs --max-segments 4 --total-budget-usd 60 --prompt-file task.txt \
//     [--nudge-at 180000] [--store DIR] [--event-log FILE --label NAME] [--alert-cmd CMD] \
//     -- claude -p --max-turns 500 --max-budget-usd 40 [other claude flags]
// Exit codes: the last segment's own when a segment ends with no handover (the
// work is done, or failed without one), 2 bad usage, 3 stall guard, 4 a cap.
// Design: docs/AUTO-CONTINUE.md.
import { runChain } from "./lib/run.mjs";

process.exitCode = await runChain(process.argv.slice(2));
