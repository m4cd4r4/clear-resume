// Entry point for the three hooks: node hook-entry.cjs <session-start|post-tool|stop>.
//
// The scripts it runs are ES modules that use syntax an old Node cannot parse, and a
// parse error is a stack trace under "hook error" on every tool call and every turn.
// This file is plain CommonJS in ES5 so that any Node can read it: on a Node older
// than 18 it prints one line at session start and exits 0 everywhere else.
//
// The import() that loads the real script lives in lib/hook-import.cjs, because
// Node 10 and 11 reject import() when they parse a file, even one they never run.
//
// A machine with no node at all never gets here: hooks/hooks.json checks for node
// first and prints the same line. Keep NEEDS_NODE identical to the text there
// (test/node-guard.test.mjs checks it).
"use strict";

var NEEDS_NODE = "clear-resume needs Node.js 18 or later on your PATH. Install it and restart Claude Code.";
var MIN_MAJOR = 18;
var HOOKS = { "session-start": true, "post-tool": true, stop: true };

var name = process.argv[2];
var major = parseInt(String(process.versions && process.versions.node), 10);

// The old-Node branch lets node exit by itself, so the line is flushed even where
// a pipe is written asynchronously (macOS).
if (!HOOKS.hasOwnProperty(name)) {
  process.exitCode = 0;
} else if (!(major >= MIN_MAJOR)) {
  if (name === "session-start") process.stdout.write(JSON.stringify({ systemMessage: NEEDS_NODE }) + "\n");
} else {
  require("./lib/hook-import.cjs")(name);
}
