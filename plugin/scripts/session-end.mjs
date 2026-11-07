#!/usr/bin/env node
// SessionEnd hook: keeps what the session left on screen (tables, lists, links, paths and its
// last replies) in <store>/artifacts/<session id>/, so a list read a moment before /clear is
// still there afterwards. A handover records its session's id and finds the folder by it.
// Any failure exits 0 with no output: a broken plugin must never block a session.
// CORNERMAN_ARTIFACTS=0 turns it off.
import { readFileSync } from "node:fs";

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  if (input.session_id && input.reason && input.reason !== "clear") {
    try {
      const { listWaiting, archive, repoKey, storeRoot } = await import("./lib/store.mjs");
      const { isOpenQuestion } = await import("./lib/select.mjs");
      const { markConsumed } = await import("./lib/web.mjs");
      const { isSynced, pushInBackground } = await import("../packages/store/sync.mjs");
      const root = storeRoot();
      let retired = false;
      for (const h of listWaiting(root)) {
        if (h.meta.sessionId === input.session_id && isOpenQuestion(h) && !h.meta.takenAt) {
          archive(root, null, h.path, { via: "session-end" });
          markConsumed(root, repoKey(h.meta.repo), h.meta);
          retired = true;
        }
      }
      if (retired && isSynced(root)) pushInBackground(root);
    } catch {
      // never block a session
    }
  }
  if (process.env.CORNERMAN_ARTIFACTS !== "0") {
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
