#!/usr/bin/env node
// Print the context size, in tokens, of the last main-thread call in a session
// transcript: the same reading the Stop-hook nudge makes (lib/nudge.mjs). The relay
// mod runs it for the idle handover when the host gives no usage figure itself
// (a mod may not import node:fs).
//   node context-tokens.mjs <transcript.jsonl>
// Prints one integer, or nothing (exit 1) when the file has no assistant call.
import { lastContextTokens } from "./lib/nudge.mjs";

const tokens = lastContextTokens(process.argv[2]);
if (tokens == null) process.exit(1);
console.log(String(tokens));
