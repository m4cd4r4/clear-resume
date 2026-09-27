#!/usr/bin/env node
// SessionStart hook (startup | clear): loads the waiting handover for this repo
// into the new session's context, then archives it so it loads exactly once.
// Any failure exits 0 with no output: a broken plugin must never block a session.
// It never writes to the user's repo. The one thing it may delete there is an
// untracked working-tree handover it just loaded, and only once the output is out.
// "Out" means the write succeeded: a reader that has gone away (EPIPE) gets nothing,
// so the copy stays and loads next time (security review 2, 2026-09-27).
import { readFileSync } from "node:fs";
import { run } from "./lib/hook.mjs";

let out = null;
try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  out = run(input);
} catch {
  // never block a session
}
if (!out) process.exit(0);
// The failure is reported to the write callback below; without a listener the
// same error, emitted as an event, would crash the hook first.
process.stdout.on("error", () => {});
try {
  process.stdout.write(JSON.stringify(out), (err) => {
    if (!err) {
      try {
        out.afterOutput?.();
      } catch {
        // The copy stays, and may load again: better twice than never.
      }
    }
    process.exit(0);
  });
} catch {
  process.exit(0);
}
