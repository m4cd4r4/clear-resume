// The headless runner (docs/AUTO-CONTINUE.md, phase 1), driven against a fake claude.
// tdd-guard:allow - the first test led the runner; the rest were backfilled, each mutation-checked.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runChain } from "../plugin/scripts/lib/run.mjs";
import { listAll } from "../plugin/packages/store/store.mjs";
import { run as sessionStart } from "../plugin/scripts/lib/hook.mjs";

const FAKE = fileURLToPath(new URL("./fixtures/fake-claude.mjs", import.meta.url));
const ALERT = fileURLToPath(new URL("./fixtures/fake-alert.mjs", import.meta.url));

let dir, repo, store, planFile, logFile, env, out, err;
const sink = () => {
  const s = { text: "", write: (c) => ((s.text += String(c)), true) };
  return s;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cr-run-"));
  repo = join(dir, "repo");
  store = join(dir, "store");
  planFile = join(dir, "plan.json");
  logFile = join(dir, "calls.jsonl");
  const who = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  env = { ...process.env, ...who, FAKE_PLAN: planFile, FAKE_LOG: logFile };
  // This session's own ids would file the fake's saves against this session's root.
  for (const k of ["CLAUDE_CODE_SESSION_ID", "CLAUDE_PID", "CLEAR_RESUME_HOME", "CLEAR_RESUME_AUTO"]) delete env[k];
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "init"], { cwd: repo, env });
  writeFileSync(join(dir, "prompt.txt"), "ORIGINAL PROMPT", "utf8");
  out = sink();
  err = sink();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const plan = (...steps) => writeFileSync(planFile, JSON.stringify(steps), "utf8");
const calls = () => (existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const claude = (extra = []) => ["--", process.execPath, FAKE, "-p", "--max-turns", "5", "--max-budget-usd", "10", ...extra];
const opts = (over = {}) => {
  const o = { "--max-segments": "4", "--total-budget-usd": "100", "--prompt-file": join(dir, "prompt.txt"), "--store": store, ...over };
  return Object.entries(o).flatMap(([k, v]) => (v == null ? [] : [k, v]));
};
const go = (argv) => runChain(argv, { cwd: repo, env, stdout: out, stderr: err });

describe("the chain", () => {
  it("resumes from each auto handover, taking each exactly once, and stops when none is written", async () => {
    plan({ commit: true, save: true, cost: 2 }, { commit: true, save: true, cost: 2 }, { commit: true, cost: 1 });
    expect(await go([...opts(), ...claude()])).toBe(0);
    const c = calls();
    expect(c).toHaveLength(3);

    expect(c[0].stdin).toBe("ORIGINAL PROMPT");
    expect(c[1].stdin).toMatch(/^ORIGINAL PROMPT/);
    expect(c[1].stdin).toMatch(/segment 2/);
    expect(c[1].stdin).toMatch(/next: step 2/);
    expect(c[2].stdin).toMatch(/next: step 3/);
    expect(c[2].stdin).not.toMatch(/next: step 2/);

    for (const [i, call] of c.entries()) {
      expect(call.env).toMatchObject({ CLEAR_RESUME_AUTO: "1", CLEAR_RESUME_HEADLESS: "1", CLEAR_RESUME_SYNC: "off", CLEAR_RESUME_CHAIN: String(i + 1), CLEAR_RESUME_BUDGET: String(3 - i) });
      expect(call.env.CLEAR_RESUME_HOME.replace(/\\/g, "/")).toBe(store.replace(/\\/g, "/"));
    }

    const saved = listAll(store);
    expect(saved).toHaveLength(2);
    for (const r of saved) {
      expect(r.status).toBe("archived");
      expect(r.archivedBy.via).toBe("load");
      expect(r.auto).toBe(true);
    }
    expect(saved.map((r) => r.chain).sort()).toEqual([1, 2]);
  });
});

// tdd-guard:allow - backfilled onto run.mjs; each mutation-checked.
describe("between segments", () => {
  it("leaves nothing for the next segment's SessionStart hook to load a second time", async () => {
    plan({ commit: true, save: true, cost: 1 }, { commit: true, cost: 1 });
    await go([...opts(), ...claude()]);
    expect(sessionStart({ cwd: repo, source: "startup" }, { env: { ...env, CLEAR_RESUME_HOME: store, CLEAR_RESUME_SYNC: "off" } })).toBeNull();
  });

  it("gives segment 1 the command's --session-id and later segments fresh ones, and logs each", async () => {
    plan({ commit: true, save: true, cost: 1 }, { commit: true, cost: 1 });
    const events = join(dir, "queue.log");
    const first = "11111111-1111-4111-8111-111111111111";
    await go([...opts({ "--event-log": events, "--label": "rd-x" }), ...claude(["--session-id", first])]);
    const ids = calls().map((c) => c.argv[c.argv.indexOf("--session-id") + 1]);
    expect(ids[0]).toBe(first);
    expect(ids[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).not.toBe(first);
    const lines = readFileSync(events, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(new RegExp(`^\\S+ segment rd-x 1 ${first}$`));
    expect(lines[1]).toMatch(new RegExp(`^\\S+ segment rd-x 2 ${ids[1]}$`));
  });

  it("returns the segment's own exit code when it stops without a handover", async () => {
    plan({ exit: 7 });
    expect(await go([...opts(), ...claude()])).toBe(7);
  });

  it("charges a segment its full --max-budget-usd when it reports no cost", async () => {
    plan(...Array(5).fill({ commit: true, save: true }));
    expect(await go([...opts({ "--total-budget-usd": "25" }), ...claude()])).toBe(4);
    expect(calls().map((c) => Number(c.argv[c.argv.indexOf("--max-budget-usd") + 1]))).toEqual([10, 10, 5]);
  });

  it("resets the stall count when a continued segment commits", async () => {
    plan({ commit: true, save: true, cost: 1 }, { save: true, cost: 1 }, { commit: true, save: true, cost: 1 }, { save: true, cost: 1 }, { cost: 1 });
    expect(await go([...opts({ "--max-segments": "10" }), ...claude()])).toBe(0);
    expect(calls()).toHaveLength(5);
  });
});

describe("caps", () => {
  it.each([
    ["--max-segments", () => [...opts({ "--max-segments": null }), ...claude()]],
    ["--total-budget-usd", () => [...opts({ "--total-budget-usd": null }), ...claude()]],
    ["the command's --max-turns", () => [...opts(), "--", process.execPath, FAKE, "-p", "--max-budget-usd", "10"]],
    ["the command's --max-budget-usd", () => [...opts(), "--", process.execPath, FAKE, "-p", "--max-turns", "5"]],
    ["-p", () => [...opts(), "--", process.execPath, FAKE, "--max-turns", "5", "--max-budget-usd", "10"]],
    ["a prompt", () => [...opts({ "--prompt-file": null }), ...claude()]],
    ["a --settings free of CLEAR_RESUME_", () => [...opts(), ...claude(["--settings", '{"env":{"CLEAR_RESUME_AUTO":"0"}}'])]],
  ])("refuses to start without %s", async (_, argv) => {
    plan({ save: true });
    expect(await go(argv())).toBe(2);
    expect(calls()).toHaveLength(0);
  });
});

describe("stops", () => {
  it("stops at --max-segments with the last handover left waiting (exit 4)", async () => {
    plan(...Array(5).fill({ commit: true, save: true, cost: 1 }));
    expect(await go([...opts({ "--max-segments": "2" }), ...claude()])).toBe(4);
    expect(calls()).toHaveLength(2);
    expect(listAll(store).filter((r) => r.status === "waiting")).toHaveLength(1);
  });

  it("lowers each segment's --max-budget-usd to what the total has left, and stops when it is spent", async () => {
    plan(...Array(5).fill({ commit: true, save: true, cost: 3 }));
    expect(await go([...opts({ "--total-budget-usd": "5" }), ...claude()])).toBe(4);
    expect(calls().map((c) => Number(c.argv[c.argv.indexOf("--max-budget-usd") + 1]))).toEqual([5, 2]);
  });

  it("trips the stall guard after two continued segments with no new commit, and alerts (exit 3)", async () => {
    plan({ commit: true, save: true, cost: 1 }, { save: true, cost: 1 }, { save: true, cost: 1 }, { save: true, cost: 1 });
    env.FAKE_ALERT_OUT = join(dir, "alert.txt");
    expect(await go([...opts({ "--max-segments": "10", "--alert-cmd": `"${process.execPath}" "${ALERT}"` }), ...claude()])).toBe(3);
    expect(calls()).toHaveLength(3);
    expect(readFileSync(env.FAKE_ALERT_OUT, "utf8")).toMatch(/no new commits/);
  });
});
