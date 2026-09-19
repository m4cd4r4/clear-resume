#!/usr/bin/env node
// Stop hook (opt-in auto mode, CLEAR_RESUME_AUTO=1): nudges once per session to
// write a handover and /clear when the context passes CLEAR_RESUME_NUDGE_AT.
// Any failure exits 0 with no output: a broken plugin must never block a session.
import { readFileSync } from "node:fs";
import { runStop } from "./lib/nudge.mjs";

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const out = runStop(input);
  if (out) process.stdout.write(JSON.stringify(out));
} catch {
  // never block a session
}
process.exit(0);
