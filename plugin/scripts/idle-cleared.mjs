#!/usr/bin/env node
// Print what became of the handover a session saved, for the relay mod's notice
// after an idle clear (a mod may not import node:fs).
//   node idle-cleared.mjs <session id>
// Prints {status, loaded, title, repo, next}, or nothing (exit 1) when the session saved
// none. loaded: a session start or /clear-resume:load took it, not a hand in the sidebar.
import { listAll, storeRoot } from "../packages/store/store.mjs";
import { LOADED_VIA } from "./lib/store.mjs";

const NEXT_MAX = 160;

// The first line under "## Next action": the handover template's own heading.
function nextAction(body) {
  const line = /^## Next action\s*\n+([^\n]+)/m.exec(String(body ?? ""))?.[1]?.trim() ?? "";
  return line.length > NEXT_MAX ? `${line.slice(0, NEXT_MAX - 3).trimEnd()}...` : line;
}

// listAll is newest first, so this is the session's latest save.
const record = listAll(storeRoot()).find((h) => h.sessionId === process.argv[2]);
if (!record) process.exit(1);
console.log(
  JSON.stringify({
    status: record.status,
    loaded: record.status === "archived" && LOADED_VIA.has(record.archivedBy?.via),
    title: record.title,
    repo: record.repo ?? "",
    next: nextAction(record.body),
  }),
);
