#!/usr/bin/env node
// Save a handover for the current repo. The body is read from stdin.
//   node save.mjs --title "Short title" <<'EOF'
//   ...handover markdown...
//   EOF
// With CLEAR_RESUME_WEB=1 (or --commit) it is also committed to the repo and
// pushed, for cloud sessions whose home folder may not survive.
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
    const r = commitHandover(repoInfo(process.cwd()).top, path);
    if (r.pushed) console.log(`Committed and pushed ${r.path}, so a new cloud session can load it.`);
    else if (r.committed) console.log(`Committed ${r.path} but the push failed (${r.error}). Push the branch before ending the session.`);
    else console.log(`Wrote ${r.path} but could not commit it (${r.error}). Commit and push it before ending the session.`);
  }
  console.log("After /clear, the next session in this repo loads it automatically.");
} catch (err) {
  console.error(`clear-resume: ${err.message}`);
  process.exit(1);
}
