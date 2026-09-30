// The headless runner: runs `claude -p` in segments, each one a fresh process, so
// a worker that hands over is resumed without anyone typing /clear or "go".
// A segment exiting is the clear; the next segment, started with the original
// prompt plus the handover the last one saved, is the resume.
// Design and the reasons behind each cap: docs/AUTO-CONTINUE.md.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { listAll } from "../../packages/store/store.mjs";
import { archive, repoInfo, repoKey, listWaiting } from "./store.mjs";

export const EXIT = { usage: 2, stall: 3, cap: 4 };
export const DEFAULT_STORE = () => join(homedir(), ".clear-resume-headless");
const RUNNER = "clear-resume-run";

class Usage extends Error {}

function parseArgs(argv) {
  const cut = argv.indexOf("--");
  if (cut < 0 || cut === argv.length - 1) throw new Usage("give the claude command after --, e.g. -- claude -p --max-turns 200 --max-budget-usd 20");
  const mine = argv.slice(0, cut);
  const command = argv.slice(cut + 1);
  const known = ["--max-segments", "--total-budget-usd", "--prompt-file", "--prompt", "--nudge-at", "--store", "--event-log", "--label", "--alert-cmd"];
  const o = {};
  for (let i = 0; i < mine.length; i += 2) {
    if (!known.includes(mine[i])) throw new Usage(`unknown option ${mine[i]}`);
    if (mine[i + 1] == null) throw new Usage(`${mine[i]} needs a value`);
    o[mine[i]] = mine[i + 1];
  }
  return { o, command };
}

const flagValue = (args, name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : undefined;
};

function positive(raw, name) {
  const n = Number(raw);
  if (raw == null || !Number.isFinite(n) || n <= 0) throw new Usage(`${name} is required and must be a positive number`);
  return n;
}

// Reads the caps and refuses anything that would let the chain run unbounded or
// quietly switch the nudge off.
function config(argv, env) {
  const { o, command } = parseArgs(argv);
  const maxSegments = o["--max-segments"] === "unlimited" ? Infinity : positive(o["--max-segments"], "--max-segments");
  if (maxSegments !== Infinity && !Number.isInteger(maxSegments)) throw new Usage("--max-segments must be a whole number or unlimited");
  const totalBudget = positive(o["--total-budget-usd"], "--total-budget-usd");
  if (!command.includes("-p") && !command.includes("--print")) throw new Usage("the command must run claude in print mode (-p)");
  positive(flagValue(command, "--max-turns"), "the command's --max-turns");
  const segmentBudget = positive(flagValue(command, "--max-budget-usd"), "the command's --max-budget-usd");

  const settings = flagValue(command, "--settings");
  if (settings != null) {
    const text = existsSync(settings) ? readFileSync(settings, "utf8") : settings;
    const hit = /CLEAR_RESUME_[A-Z_]+/.exec(text);
    if (hit) throw new Usage(`the command's --settings sets ${hit[0]}, which overrides the runner's own and can switch the nudge off. Remove it.`);
  }

  let prompt;
  if (o["--prompt-file"] != null) prompt = readFileSync(o["--prompt-file"], "utf8");
  else if (o["--prompt"] != null) prompt = o["--prompt"];
  if (!prompt || !prompt.trim()) throw new Usage("give the task with --prompt-file <file> or --prompt <text>; the runner sends it on stdin");

  const nudgeAt = o["--nudge-at"] != null ? positive(o["--nudge-at"], "--nudge-at") : undefined;
  return {
    maxSegments,
    totalBudget,
    segmentBudget,
    prompt,
    nudgeAt,
    store: resolve(o["--store"] ?? env.CLEAR_RESUME_RUN_STORE ?? DEFAULT_STORE()),
    eventLog: o["--event-log"],
    label: o["--label"] ?? "run",
    alertCmd: o["--alert-cmd"],
    command,
  };
}

// Windows cannot spawn a .cmd without a shell, and a shell mangles the JSON a
// claude command often carries. An npm install puts claude.cmd on PATH as a shim
// for a real claude.exe, so the shim is read for the exe it runs.
export function resolveCommand(cmd, { env = process.env, platform = process.platform } = {}) {
  if (platform !== "win32" || /[\\/]/.test(cmd) || /\.exe$/i.test(cmd)) return cmd;
  const dirs = String(env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  for (const d of dirs) if (existsSync(join(d, `${cmd}.exe`))) return join(d, `${cmd}.exe`);
  for (const d of dirs) {
    const shim = join(d, `${cmd}.cmd`);
    if (!existsSync(shim)) continue;
    const m = /"%dp0%\\([^"]+\.exe)"/i.exec(readFileSync(shim, "utf8"));
    if (m && existsSync(join(d, m[1]))) return join(d, m[1]);
  }
  return cmd;
}

function head(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function withFlag(args, name, value) {
  const out = [...args];
  const i = out.indexOf(name);
  if (i > -1) out[i + 1] = value;
  else out.push(name, value);
  return out;
}

const money = (n) => String(Math.round(n * 100) / 100);

// One segment: spawn, send the prompt on stdin, pass stdout through while picking
// the cost off the result line.
function runSegment({ file, args, cwd, env, prompt, stdout }) {
  return new Promise((done) => {
    let cost = null;
    let pending = "";
    const scan = (line) => {
      if (!line.includes('"result"')) return;
      try {
        const row = JSON.parse(line);
        if (row.type === "result" && typeof row.total_cost_usd === "number") cost = row.total_cost_usd;
      } catch {
        // not a JSON line
      }
    };
    const child = spawn(file, args, { cwd, env, stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
    child.stdout.on("data", (chunk) => {
      stdout.write(chunk);
      const lines = (pending + chunk.toString("utf8")).split("\n");
      pending = lines.pop();
      lines.forEach(scan);
    });
    child.on("error", (e) => done({ code: 127, cost, error: e.message }));
    child.on("close", (code) => {
      scan(pending);
      done({ code: code ?? 1, cost });
    });
    child.stdin.on("error", () => {}); // a child that never reads stdin
    child.stdin.end(prompt);
  });
}

// The auto handovers this segment saved for this repo, newest last.
function savedSince(root, top, since) {
  const auto = new Set(listAll(root).filter((r) => r.auto === true).map((r) => r.id));
  return listWaiting(root, top).filter((h) => auto.has(h.id) && Date.parse(h.meta.created) >= since - 1000);
}

function resumePrompt(original, n, max, body) {
  const of = max === Infinity ? "" : ` of at most ${max}`;
  return (
    `${original.trimEnd()}\n\n---\n\n` +
    `clear-resume: this is segment ${n}${of}. The previous segment ran out of context and saved the handover below. ` +
    `Resume from it in this fresh context. Its branch, file and status claims are a snapshot: check them against git before acting.\n\n` +
    body.trim()
  );
}

/** Run the chain. Resolves to the exit code the CLI should return. */
export async function runChain(argv, { cwd = process.cwd(), env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  const say = (msg) => stderr.write(`clear-resume run: ${msg}\n`);
  let c;
  try {
    c = config(argv, env);
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    say(e.message);
    return EXIT.usage;
  }

  const { top } = repoInfo(cwd);
  const key = repoKey(top);
  const file = resolveCommand(c.command[0], { env });
  let spent = 0;
  let prompt = c.prompt;
  let stalled = 0;
  const alert = (msg) => {
    if (!c.alertCmd) return;
    spawnSync(c.alertCmd, { shell: true, env: { ...env, CLEAR_RESUME_ALERT: msg }, stdio: "ignore", windowsHide: true });
  };

  for (let n = 1; ; n++) {
    const budget = Math.min(c.segmentBudget, c.totalBudget - spent);
    const sessionId = n === 1 ? (flagValue(c.command, "--session-id") ?? randomUUID()) : randomUUID();
    let args = withFlag(c.command.slice(1), "--max-budget-usd", money(budget));
    args = withFlag(args, "--session-id", sessionId);
    const segEnv = {
      ...env,
      CLEAR_RESUME_AUTO: "1",
      CLEAR_RESUME_HEADLESS: "1",
      CLEAR_RESUME_HOME: c.store,
      CLEAR_RESUME_SYNC: "off",
      CLEAR_RESUME_CHAIN: String(n),
      CLEAR_RESUME_BUDGET: c.maxSegments === Infinity ? "-1" : String(c.maxSegments - n),
      ...(c.nudgeAt ? { CLEAR_RESUME_NUDGE_AT: String(c.nudgeAt) } : {}),
    };
    if (c.eventLog) appendFileSync(c.eventLog, `${new Date().toISOString()} segment ${c.label} ${n} ${sessionId}\n`);
    say(`segment ${n} started (session ${sessionId}, budget ${money(budget)} USD)`);

    const before = head(cwd);
    const started = Date.now();
    const r = await runSegment({ file, args, cwd, env: segEnv, prompt, stdout });
    spent += r.cost ?? budget;
    if (r.error) say(`segment ${n} could not start: ${r.error}`);

    const saved = savedSince(c.store, top, started);
    const next = saved.at(-1);
    say(`segment ${n} exited ${r.code}, cost ${r.cost == null ? `unknown (charged ${money(budget)})` : money(r.cost)} USD, ${money(spent)} of ${money(c.totalBudget)} spent`);
    if (!next) {
      say(`segment ${n} saved no handover: the chain is done.`);
      return r.code;
    }
    for (const h of saved.slice(0, -1)) archive(c.store, key, h.path, { via: "supersede", owner: RUNNER });

    if (n > 1) stalled = before && head(cwd) === before ? stalled + 1 : 0;
    const left = `The handover is still waiting in ${c.store} (id ${next.short}).`;
    if (stalled >= 2) {
      const msg = `clear-resume run (${c.label}): stopped after segment ${n}. Two continued segments in a row made no new commits. ${left}`;
      say(msg);
      alert(msg);
      return EXIT.stall;
    }
    if (n >= c.maxSegments) {
      say(`reached --max-segments ${c.maxSegments}. ${left}`);
      return EXIT.cap;
    }
    if (c.totalBudget - spent < 0.01) {
      say(`the total budget of ${money(c.totalBudget)} USD is spent. ${left}`);
      return EXIT.cap;
    }

    archive(c.store, key, next.path, { via: "load", owner: RUNNER });
    prompt = resumePrompt(c.prompt, n + 1, c.maxSegments, next.body);
  }
}
