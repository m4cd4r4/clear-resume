// The detached retention job (plugin/scripts/retention.mjs) as SessionStart starts it:
// a process of its own per session, all against one store.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startRetention } from "../plugin/scripts/lib/retention-start.mjs";

const JOB = resolve(import.meta.dirname, "..", "plugin", "scripts", "retention.mjs");
const DAY = 86_400_000;

let root, store, relay;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-retention-job-"));
  store = join(root, "store");
  relay = join(store, "relay");
  mkdirSync(relay, { recursive: true });
  mkdirSync(join(root, "claude", "sessions"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const runJob = (...args) =>
  new Promise((done) => {
    const p = spawn(process.execPath, [JOB, ...args], { env: { ...process.env, CORNERMAN_HOME: store, CLEAR_RESUME_HOME: "", CLAUDE_CONFIG_DIR: join(root, "claude") } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", (code) => done({ code, out }));
  });

describe("startRetention", () => {
  it("starts the job detached and unwaited when the marker is a day old, and starts nothing when it is fresh", () => {
    const calls = [];
    const fake = (...a) => (calls.push(a), { unref: () => calls.push("unref") });
    writeFileSync(join(relay, ".retention-ran"), `${Date.now() - 60_000} 1\n`);
    expect(startRetention({ store, spawnFn: fake })).toBeNull();
    expect(calls).toEqual([]);
    writeFileSync(join(relay, ".retention-ran"), `${Date.now() - DAY - 1} 1\n`);
    expect(startRetention({ store, spawnFn: fake })).not.toBeNull();
    expect(calls[0][1]).toEqual([JOB]);
    expect(calls[0][2]).toMatchObject({ detached: true, stdio: "ignore", windowsHide: true });
    expect(calls[1]).toBe("unref");
  });

  it("starts nothing for a store with no relay folder", () => {
    rmSync(relay, { recursive: true });
    let started = 0;
    expect(startRetention({ store, spawnFn: () => (started++, { unref() {} }) })).toBeNull();
    expect(started).toBe(0);
  });
});

describe("SessionStart", () => {
  it("returns without waiting for the job, which finishes after the hook has exited", async () => {
    const now = Date.now();
    const key = `${(now - 40 * DAY).toString(36)}-ffffff`;
    writeFileSync(join(relay, `${key}.json`), JSON.stringify({ v: 1, key, cwd: join(root, "app"), sessions: [], used: 0, applied: 0, updatedAt: now - 20 * DAY }));
    const hook = spawnSync(process.execPath, [join(JOB, "..", "session-start.mjs")], {
      input: JSON.stringify({ cwd: root, source: "startup" }),
      env: { ...process.env, CORNERMAN_HOME: store, CLEAR_RESUME_HOME: "", CLAUDE_CONFIG_DIR: join(root, "claude"), CORNERMAN_SYNC: "off" },
      timeout: 20_000,
    });
    expect(hook.status).toBe(0);
    const until = Date.now() + 10_000;
    while (existsSync(join(relay, `${key}.json`)) && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
    expect(readdirSync(relay)).toEqual([".retention-ran"]);
  });
});

describe("retention job", () => {
  it("runs once when three sessions in one folder start it together", async () => {
    const now = Date.now();
    const keys = ["aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee"].map((t) => `${(now - 40 * DAY).toString(36)}-${t}`);
    for (const key of keys) writeFileSync(join(relay, `${key}.json`), JSON.stringify({ v: 1, key, cwd: join(root, "app"), sessions: [], used: 0, applied: 0, updatedAt: now - 20 * DAY }));
    const runs = await Promise.all([runJob(), runJob(), runJob()]);
    expect(runs.map((r) => r.code)).toEqual([0, 0, 0]);
    expect(runs.filter((r) => JSON.parse(r.out).ran)).toHaveLength(1);
    const lines = readdirSync(join(store, "ledger")).flatMap((f) => readFileSync(join(store, "ledger", f), "utf8").split("\n").filter(Boolean));
    expect(lines.map((l) => JSON.parse(l).key).sort()).toEqual(keys);
    expect(readdirSync(relay)).toEqual([".retention-ran"]);
  });
});
