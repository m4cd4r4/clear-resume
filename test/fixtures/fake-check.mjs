#!/usr/bin/env node
// A stand-in for a --done-check command. It logs each call and exits with the next
// code in CHECK_CODES (a JSON array; the last code repeats), printing lines the
// tests look for in the continuation prompt.
//   CHECK_CODES  e.g. "[1,0]"
//   CHECK_LOG    file; one line is appended per call
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const log = process.env.CHECK_LOG;
const codes = JSON.parse(process.env.CHECK_CODES ?? "[0]");
const n = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).length : 0;
const code = codes[Math.min(n, codes.length - 1)];
appendFileSync(log, `${code}\n`);
process.stdout.write(`items left: ${20 - n}\n`);
process.stderr.write("check stderr line\n");
process.exit(code);
