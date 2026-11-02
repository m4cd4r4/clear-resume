// The move as a real install meets it: the real hook script, in its own process, with
// its own home folder. Never run against the real one: each process gets USERPROFILE
// and HOME pointed at a temp folder, and the kill switch in vitest.config.mjs is removed
// only for these processes.
import { spawnSync, execFileSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveHandover } from "../../plugin/scripts/lib/store.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "../../plugin/scripts/session-start.mjs");
const RUN = join(dirname(fileURLToPath(import.meta.url)), "../../plugin/scripts/run.mjs");
const FAKE = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/fake-claude.mjs");

vi.setConfig({ testTimeout: 60000, hookTimeout: 30000 });

let home;
let repo;
let oldRoot;
let newRoot;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "rename-wiring-"));
  oldRoot = join(home, ".clear-resume");
  newRoot = join(home, ".cornerman");
  repo = join(home, "work", "app");
  mkdirSync(repo, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function hook(extraEnv = {}) {
  const env = { ...process.env, USERPROFILE: home, HOME: home, ...extraEnv };
  for (const key of ["CORNERMAN_NO_MIGRATE", "CORNERMAN_HOME", "CLEAR_RESUME_HOME"]) if (!(key in extraEnv)) delete env[key];
  const done = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: repo, source: "startup" }), env, encoding: "utf8", windowsHide: true });
  expect(done.status).toBe(0);
  return done.stdout ? JSON.parse(done.stdout) : null;
}

describe("session start on an upgraded install", () => {
  it("moves the store, says so once, and still loads the handover from its new home", () => {
    saveHandover({ cwd: repo, title: "carry on", body: "the body", root: oldRoot, owner: "", now: new Date(Date.now() - 1000) });

    const first = hook();

    expect(lstatSync(oldRoot).isSymbolicLink()).toBe(true);
    expect(existsSync(join(newRoot, "handovers"))).toBe(true);
    expect(first.systemMessage).toContain("moved from ~/.clear-resume to ~/.cornerman");
    expect(first.systemMessage).toContain('loaded handover "carry on"');
    expect(first.hookSpecificOutput.additionalContext).toContain("the body");

    const second = hook();
    expect(second?.systemMessage ?? "").not.toContain("moved from");
  });

  it("a blocked move is a normal state: the session works from the old folder, and it says so once a day", () => {
    if (process.platform !== "win32") return; // nothing blocks a rename on POSIX
    saveHandover({ cwd: repo, title: "carry on", body: "the body", root: oldRoot, owner: "", now: new Date(Date.now() - 1000) });
    const fd = openSync(join(oldRoot, "handovers", readdirSync(join(oldRoot, "handovers"))[0]), "r");
    try {
      const first = hook();
      expect(first.systemMessage).toContain("stay in ~/.clear-resume for now");
      expect(first.hookSpecificOutput.additionalContext).toContain("the body");
      expect(existsSync(newRoot)).toBe(false);
      expect(hook()?.systemMessage ?? "").not.toContain("stay in");
    } finally {
      closeSync(fd);
    }
    expect(hook()?.systemMessage ?? "").toContain("moved from");
  });

  it("says once a day that the old plugin is still on, and how to finish", () => {
    const config = join(home, "config");
    mkdirSync(config);
    writeFileSync(join(config, "settings.json"), JSON.stringify({ enabledPlugins: { "clear-resume@clear-resume": true } }));

    expect(hook({ CLAUDE_CONFIG_DIR: config }).systemMessage).toMatch(/old clear-resume plugin is still on.*upgrade\.mjs/);
    expect(hook({ CLAUDE_CONFIG_DIR: config })?.systemMessage ?? "").not.toContain("still on");
  });
});

describe("a headless run on an upgraded install", () => {
  it("moves the old headless store and runs its segments against the new one", () => {
    const oldHeadless = join(home, ".clear-resume-headless");
    const newHeadless = join(home, ".cornerman-headless");
    saveHandover({ cwd: repo, title: "earlier run", body: "the body", root: oldHeadless, owner: "", now: new Date(Date.now() - 1000) });
    const plan = join(home, "plan.json");
    const log = join(home, "calls.jsonl");
    writeFileSync(plan, "[{}]", "utf8");
    const env = { ...process.env, USERPROFILE: home, HOME: home, FAKE_PLAN: plan, FAKE_LOG: log };
    for (const key of ["CORNERMAN_NO_MIGRATE", "CORNERMAN_HOME", "CLEAR_RESUME_HOME", "CORNERMAN_RUN_STORE", "CLEAR_RESUME_RUN_STORE"]) delete env[key];

    const done = spawnSync(process.execPath, [RUN, "--max-segments", "1", "--total-budget-usd", "5", "--prompt", "go", "--", process.execPath, FAKE, "-p", "--max-turns", "5", "--max-budget-usd", "1"], { cwd: repo, env, encoding: "utf8", windowsHide: true });

    expect(done.status).toBe(0);
    expect(readdirSync(join(newHeadless, "handovers"))).toHaveLength(1);
    expect(JSON.parse(readFileSync(log, "utf8").trim()).env.CORNERMAN_HOME).toBe(newHeadless);
  });
});
