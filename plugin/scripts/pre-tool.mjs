#!/usr/bin/env node
// PreToolUse hook on the Skill tool: allows the one handover-skill call the relay
// asked for while the user was away (plugin/hooks/relay.ts, idleCheck). In a profile
// that had not allowed the skill, that call waited on "Use skill
// /clear-resume:handover?" with nobody to answer, and no handover was saved (rig
// run, 2026-10-30).
//
// The relay writes <store>/.asked/<slug of the session id> holding { at } just before
// it submits the prompt. This hook allows the call only for that session, only
// within ASK_WINDOW_MS of the ask, and removes the mark, so the grant is used once.
// Any other skill or tool, or no fresh mark, prints nothing: the user's own
// permission rules decide as before.
// Any failure exits 0 with no output: a broken plugin must never block a session.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { slugify, storeRoot } from "./lib/store.mjs";

export const HANDOVER_SKILL = "clear-resume:handover";
// The idle prompt is answered in seconds; a mark older than this was never used.
export const ASK_WINDOW_MS = 15 * 60_000;

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const slug = slugify(input.session_id ?? "");
  if (input.tool_name === "Skill" && input.tool_input?.skill === HANDOVER_SKILL && slug) {
    const mark = join(storeRoot(), ".asked", slug);
    const at = Number(JSON.parse(readFileSync(mark, "utf8"))?.at);
    const age = Date.now() - at;
    if (age >= 0 && age < ASK_WINDOW_MS) {
      rmSync(mark, { force: true });
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: "clear-resume asked for this handover while the session was idle.",
          },
        }),
      );
    }
  }
} catch {
  // no mark, or bad input: say nothing
}
process.exit(0);
