#!/usr/bin/env node
// Save a handover for the current repo. The body is read from stdin.
//   node save.mjs --title "Short title" <<'EOF'
//   ...handover markdown...
//   EOF
import { readFileSync } from "node:fs";
import { saveHandover } from "./lib/store.mjs";

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
  console.log("After /clear, the next session in this repo loads it automatically.");
} catch (err) {
  console.error(`clear-resume: ${err.message}`);
  process.exit(1);
}
