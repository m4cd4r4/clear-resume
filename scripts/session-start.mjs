#!/usr/bin/env node
// SessionStart hook (startup | clear): loads the waiting handover for this repo
// into the new session's context, then archives it so it loads exactly once.
// Any failure exits 0 with no output: a broken plugin must never block a session.
import { readFileSync } from "node:fs";
import { run } from "./lib/hook.mjs";

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const out = run(input);
  if (out) process.stdout.write(JSON.stringify(out));
} catch {
  // never block a session
}
process.exit(0);
