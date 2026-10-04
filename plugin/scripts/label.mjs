#!/usr/bin/env node
// Print the label a worktree registry entry goes by, so a script that mints the
// worktree names its window and its kickoff handover the way the sidebar does.
//   node label.mjs <slug> --registry <path/to/registry.json>
// Prints JSON: { row, slug, short, context, plan, seq, total, wave }.
// The registry path can also come from CLEAR_RESUME_REGISTRY.
import { readFileSync } from "node:fs";
import { entryLabel } from "../packages/store/lanes.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const slug = process.argv[2];
const path = arg("--registry") || process.env.CLEAR_RESUME_REGISTRY;
if (!slug || slug.startsWith("--") || !path) {
  console.error("usage: label.mjs <slug> --registry <registry.json>");
  process.exit(64);
}

try {
  const entries = JSON.parse(readFileSync(path, "utf8")).entries ?? [];
  const entry = entries.find((e) => e.slug === slug);
  if (!entry) {
    console.error(`no registry entry for ${slug}`);
    process.exit(3);
  }
  console.log(JSON.stringify(entryLabel(entry, entries)));
} catch (err) {
  console.error(`clear-resume: ${err.message}`);
  process.exit(1);
}
