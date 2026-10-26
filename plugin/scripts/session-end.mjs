#!/usr/bin/env node
// SessionEnd hook: keeps what the session left on screen (tables, lists, links, paths and its
// last replies) in <store>/artifacts/<session id>/, so a list read a moment before /clear is
// still there afterwards. A handover records its session's id and finds the folder by it.
// Any failure exits 0 with no output: a broken plugin must never block a session.
// CLEAR_RESUME_ARTIFACTS=0 turns it off.
import { readFileSync } from "node:fs";

try {
  if (process.env.CLEAR_RESUME_ARTIFACTS !== "0") {
    const input = JSON.parse(readFileSync(0, "utf8") || "{}");
    const transcript = String(input.transcript_path || "");
    const sessionId = String(input.session_id || "");
    if (transcript && sessionId) {
      const { extractArtifacts } = await import("./lib/artifacts.mjs");
      const { writeCapture } = await import("../packages/store/artifacts.mjs");
      const { storeRoot } = await import("./lib/store.mjs");
      const { items, lastScreen } = extractArtifacts(transcript);
      // A session that said nothing worth keeping leaves no folder.
      if (items.length) writeCapture(storeRoot(), { sessionId, repoPath: input.cwd || "", capturedAt: new Date().toISOString(), items, lastScreen });
    }
  }
} catch {
  // never block a session
}
process.exit(0);
