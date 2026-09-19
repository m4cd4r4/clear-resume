#!/usr/bin/env node
// Save a handover for the current repo. The body is read from stdin.
//   node save.mjs --title "Short title" <<'EOF'
//   ...handover markdown...
//   EOF
// With CLEAR_RESUME_WEB=1 (or --commit) it is also pushed to its own ref,
// clear-resume/<branch>, for cloud sessions whose home folder does not survive.
import { readFileSync } from "node:fs";
import { repoInfo, saveHandover } from "./lib/store.mjs";
import { commitHandover, webEnabled } from "./lib/web.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

let body = "";
try {
  body = readFileSync(0, "utf8");
} catch {
  // no stdin
}

try {
  const { path, superseded } = saveHandover({ cwd: process.cwd(), title: arg("--title"), body });
  console.log(`Saved handover: ${path}`);
  for (const p of superseded) console.log(`Archived older handover for this branch: ${p}`);
  if (webEnabled() || process.argv.includes("--commit")) {
    const { top, branch } = repoInfo(process.cwd());
    const r = commitHandover(top, path, branch);
    if (r.pushed) console.log(`Pushed to ${r.ref} (your branch is untouched), so a new cloud session can load it.`);
    else console.log(`Could not push the handover to ${r.ref} (${r.error}). A new cloud session will not see it.`);
  }
  console.log("After /clear, the next session in this repo loads it automatically.");
} catch (err) {
  console.error(`clear-resume: ${err.message}`);
  process.exit(1);
}
