// Runs the CLAUDE.md trim test (docs/research/claude-md-trim-test.md): 4 tasks x 2 arms x 5 reps, headless.
// Default is a DRY RUN that prints the plan and the exact commands. Real runs need BOTH `--go` and TRIMTEST_SPEND_ACK=yes.
// Usage: node run.mjs [--go] [--only T3] [--reps 5] [--out <dir>]
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = "I:/Scratch/solaisoft"; // read only: worktrees are made from a pinned commit, the working tree is never touched
const SHA = "e0916392"; // solaisoft HEAD when the design was written
const ARM_B = path.join(HERE, "arm-b.CLAUDE.md");
const MODEL = "claude-sonnet-5-5";
const EFFORT = "medium";
const BUDGET_USD = 2; // per run; 40 runs cap the whole test at US$80

const TASKS = {
  T1: "In app/pricing/page.tsx add a 3-question FAQ section for the Complete plan. Commit nothing. Stop when the section is written.",
  T2: "Plan only, do not use any browser. Give me the numbered steps to change the hero text of one page on Engine Room Fitness's Squarespace site, including how you would verify each step.",
  T3: "Draft the 5-sentence walk-in offer for a gym that runs on Squarespace and wants a nicer-looking site. Plan only, write no files.",
  T4: "Add an auth gate that protects /partners with the same password check the /client gate uses. Commit nothing.",
};

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const KEY_FILE = arg("--key-file", path.join(process.env.USERPROFILE ?? process.env.HOME, ".claude", "secrets", "anthropic-research-key"));
const go = process.argv.includes("--go");
const only = arg("--only", null);
const reps = Number(arg("--reps", 5));
const out = arg("--out", path.join(HERE, "results"));
if (go && process.env.TRIMTEST_SPEND_ACK !== "yes") { console.error("refusing to spend: set TRIMTEST_SPEND_ACK=yes as well as --go"); process.exit(2); }

// seeded shuffle so arm order is random but reproducible
let s = 20261012;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const cells = [];
for (const t of Object.keys(TASKS)) if (!only || only === t) for (let r = 1; r <= reps; r++) for (const arm of ["A", "B"]) cells.push({ t, arm, r });
for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }

const KEY = go ? fs.readFileSync(KEY_FILE, "utf8").trim() : "";
if (go && !KEY) { console.error("research key file is empty"); process.exit(2); }
const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" });
fs.mkdirSync(out, { recursive: true });
console.log(`${cells.length} runs, model ${MODEL}, effort ${EFFORT}, <= US$${BUDGET_USD} each (cap US$${cells.length * BUDGET_USD}), pinned ${SHA}${go ? "" : "  [DRY RUN]"}`);

for (const c of cells) {
  const id = `${c.t}-${c.arm}-${c.r}`;
  const wt = `I:/Scratch/_trimtest/${id}`; // no node_modules junction is ever created here
  // The prompt goes on stdin: with shell:true on Windows an argv prompt is split at its spaces and the agent sees one word.
  const args = ["-p", "--model", MODEL, "--effort", EFFORT, "--max-budget-usd", String(BUDGET_USD), "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"];
  console.log(`${id}: worktree ${wt} @ ${SHA}${c.arm === "B" ? ", .claude/CLAUDE.md = arm-b" : ""}; claude ${args.slice(1).join(" ")} <<< "${TASKS[c.t].slice(0, 40)}..."`);
  if (!go) continue;
  if (fs.existsSync(path.join(out, id + ".json"))) { console.log("  already done, skipping"); continue; } // rerun only what failed
  git("worktree", "add", "--detach", wt, SHA);
  try {
    if (c.arm === "B") fs.copyFileSync(ARM_B, path.join(wt, ".claude", "CLAUDE.md"));
    const env = { ...process.env, ANTHROPIC_API_KEY: KEY }; // bills the research budget, not the subscription; the key is never logged
    const r = spawnSync("claude", args, { cwd: wt, env, input: TASKS[c.t], encoding: "utf8", timeout: 20 * 60e3, shell: process.platform === "win32", maxBuffer: 256 * 1024 * 1024 });
    // stream-json: one event per line, the last is the result. Keeps tool calls (files read) and the first reply's usage.
    const events = (r.stdout || "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const parsed = events.findLast((e) => e.type === "result") ?? null;
    git("-C", wt, "add", "-A"); // throwaway worktree: stage so untracked files (a new middleware.ts) show in the diff
    const names = git("-C", wt, "diff", "--cached", "--name-status", "HEAD");
    const patch = git("-C", wt, "diff", "--cached", "HEAD");
    fs.writeFileSync(path.join(out, id + ".jsonl"), r.stdout || "");
    fs.writeFileSync(path.join(out, id + ".json"), JSON.stringify({ id, ...c, status: r.status, result: parsed, stderr: r.stderr, names, patch }, null, 1));
    const cost = parsed && (parsed.total_cost_usd ?? parsed.cost_usd);
    console.log(`  exit ${r.status}, cost ${cost ?? "?"}, ${events.length} events`);
  } finally {
    git("worktree", "remove", "--force", wt); // a plain worktree with no junctions
  }
}
