#!/usr/bin/env node
// PostToolUse hook (opt-in auto mode, CLEAR_RESUME_AUTO=1): warns once per
// session, mid-turn, when the context passes CLEAR_RESUME_NUDGE_AT. The Stop
// hook cannot see this: it only runs when a turn ends, and compaction does not
// wait for one.
// Any failure exits 0 with no output: a broken plugin must never block a session.
import { readFileSync } from "node:fs";
import { runMidTurn } from "./lib/nudge.mjs";

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const out = runMidTurn(input);
  if (out) process.stdout.write(JSON.stringify(out));
} catch {
  // never block a session
}
process.exit(0);
