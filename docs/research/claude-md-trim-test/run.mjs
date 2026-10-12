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

const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" });
fs.mkdirSync(out, { recursive: true });
console.log(`${cells.length} runs, model ${MODEL}, effort ${EFFORT}, <= US$${BUDGET_USD} each (cap US$${cells.length * BUDGET_USD}), pinned ${SHA}${go ? "" : "  [DRY RUN]"}`);

for (const c of cells) {
  const id = `${c.t}-${c.arm}-${c.r}`;
  const wt = `I:/Scratch/_trimtest/${id}`; // no node_modules junction is ever created here
  const args = ["-p", TASKS[c.t], "--model", MODEL, "--effort", EFFORT, "--max-budget-usd", String(BUDGET_USD), "--output-format", "json", "--permission-mode", "acceptEdits"];
  console.log(`${id}: worktree ${wt} @ ${SHA}${c.arm === "B" ? ", .claude/CLAUDE.md = arm-b" : ""}; claude ${args.slice(2).join(" ")}`);
  if (!go) continue;
  if (fs.existsSync(path.join(out, id + ".json"))) { console.log("  already done, skipping"); continue; } // rerun only what failed
  git("worktree", "add", "--detach", wt, SHA);
  try {
    if (c.arm === "B") fs.copyFileSync(ARM_B, path.join(wt, ".claude", "CLAUDE.md"));
    const r = spawnSync("claude", args, { cwd: wt, encoding: "utf8", timeout: 20 * 60e3, shell: process.platform === "win32" });
    let parsed = null; try { parsed = JSON.parse(r.stdout); } catch { /* keep raw */ }
    const diff = git("-C", wt, "diff", "--stat", "HEAD");
    fs.writeFileSync(path.join(out, id + ".json"), JSON.stringify({ id, ...c, status: r.status, result: parsed, raw: parsed ? undefined : r.stdout, stderr: r.stderr, diff }, null, 1));
    const cost = parsed && (parsed.total_cost_usd ?? parsed.cost_usd);
    console.log(`  exit ${r.status}, cost ${cost ?? "?"}`);
  } finally {
    git("worktree", "remove", "--force", wt); // a plain worktree with no junctions
  }
}
