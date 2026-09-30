#!/usr/bin/env node
// Set or show this VS Code window's auto-continue budget.
//
//   node scripts/auto.mjs 3          three continues, then it stops and waits for you
//   node scripts/auto.mjs on         the same as 3
//   node scripts/auto.mjs unlimited
//   node scripts/auto.mjs off
//   node scripts/auto.mjs            show what is set
import { runAuto } from "./lib/auto.mjs";

const { ok, text } = runAuto(process.argv.slice(2));
(ok ? console.log : console.error)(text);
process.exit(ok ? 0 : 1);
