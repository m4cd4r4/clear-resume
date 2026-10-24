#!/usr/bin/env node
// Save a handover for a session that is waiting on an open question, without the model.
// The mod runs this when the cache is about to expire while an AskUserQuestion is unanswered:
// a prompt would queue behind the dialog and run the moment the user answers, so nothing is submitted.
//   node save-open-question.mjs --session <id> --cwd <dir> --asked-at <time> --question <text>
// The body is built from the transcript (the user's last prompt, verbatim) and the question; save.mjs
// adds the Recent trail and files it. Prints save.mjs's output, "Saved handover ... (id x)."
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sessionTranscript } from "./lib/session.mjs";
import { lastUserPrompt, redact } from "./lib/trail.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const session = arg("--session");
const cwd = arg("--cwd");
if (session) process.env.CLAUDE_CODE_SESSION_ID = session;

const question = redact(arg("--question") || "(question text unavailable)");
const askedAt = arg("--asked-at") || "unknown time";
let prompt = "";
try {
  const transcript = sessionTranscript();
  if (transcript) prompt = lastUserPrompt(transcript);
} catch {
  // no transcript: the goal stays unknown
}

const title = "Open question: " + (question.split(" [")[0].slice(0, 60) || "waiting for an answer");
const body = [
  "# " + title,
  "",
  "## Goal",
  prompt
    ? `The user's last prompt, verbatim (this handover was written without the model, so the goal is not summarised):\n\n> ${prompt.replace(/\n/g, "\n> ")}`
    : "Unknown: no transcript was readable. Ask the user what they were working on.",
  "",
  "## Next action",
  "Wait for the user's answer to the open question below. Do not guess it.",
  "",
  "## State",
  `- Saved by the idle check, not the model: the prompt cache was about to expire while this question was unanswered. Nothing was cleared.`,
  `- Question asked at ${askedAt}: ${question}`,
  "",
  "## Not checked",
  "- Anything the session decided after the last prompt: only the user's words and the trail below were captured.",
  "",
].join("\n");

const saveArgs = [fileURLToPath(new URL("save.mjs", import.meta.url)), "--title", title];
if (cwd) saveArgs.push("--cwd", cwd);
const r = spawnSync(process.execPath, saveArgs, { input: body, encoding: "utf8", env: process.env, timeout: 50000 });
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
