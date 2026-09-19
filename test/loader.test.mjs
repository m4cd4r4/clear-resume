// tdd-guard:allow - tests backfilled onto the loader, each rule mutation-checked.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { age, chooseHandover } from "../scripts/lib/select.mjs";
import { run } from "../scripts/lib/hook.mjs";
import { listWaiting, saveHandover } from "../scripts/lib/store.mjs";

const NOW = new Date("2026-09-19T12:00:00Z");
const h = (title, branch, created = "2026-09-19T11:00:00Z") => ({ file: `${title}.md`, meta: { title, branch, created } });

describe("chooseHandover", () => {
  it("loads the newest on the current branch", () => {
    const list = [h("old", "main", "2026-09-19T09:00:00Z"), h("new", "main"), h("other", "feat")];
    const { load, list: rest } = chooseHandover(list, "main", { now: NOW });
    expect(load.meta.title).toBe("new");
    expect(rest.map((x) => x.meta.title)).toEqual(["old", "other"]);
  });

  it("loads a lone handover from another branch (cloud sessions start on a new branch)", () => {
    expect(chooseHandover([h("only", "main")], "claude/xyz", { now: NOW }).load.meta.title).toBe("only");
  });

  it("lists, never guesses, when several wait on other branches", () => {
    const { load, list } = chooseHandover([h("a", "x"), h("b", "y")], "main", { now: NOW });
    expect(load).toBeNull();
    expect(list).toHaveLength(2);
  });

  it("does not auto-load a stale handover", () => {
    const stale = h("stale", "main", "2026-09-01T00:00:00Z");
    expect(chooseHandover([stale], "main", { now: NOW })).toEqual({ load: null, list: [stale] });
  });

  it("returns nothing for an empty store", () => {
    expect(chooseHandover([], "main", { now: NOW })).toEqual({ load: null, list: [] });
  });
});

describe("age", () => {
  it("formats minutes, hours and days", () => {
    expect(age("2026-09-19T11:55:00Z", NOW)).toBe("5m ago");
    expect(age("2026-09-19T09:00:00Z", NOW)).toBe("3h ago");
    expect(age("2026-09-15T12:00:00Z", NOW)).toBe("4d ago");
  });
});

describe("SessionStart hook", () => {
  let root, repo, env;
  const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cr-store-"));
    repo = mkdtempSync(join(tmpdir(), "cr-repo-"));
    env = { CLEAR_RESUME_HOME: root };
    git("init", "-q", "-b", "main");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  it("returns null when nothing is waiting", () => {
    expect(run({ cwd: repo }, { env })).toBeNull();
  });

  it("injects the handover once, then archives it", () => {
    const { key } = saveHandover({ cwd: repo, title: "Ship it", body: "## Next action\nRun the tests.", root });
    const out = run({ cwd: repo }, { env });
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toContain("Run the tests.");
    expect(out.systemMessage).toMatch(/loaded handover "Ship it"/);
    expect(listWaiting(root, key)).toHaveLength(0);
    expect(run({ cwd: repo }, { env })).toBeNull();
  });

  it("lists other branches' handovers without loading them", () => {
    git("checkout", "-q", "-b", "a");
    saveHandover({ cwd: repo, title: "A work", body: "x", root });
    git("checkout", "-q", "-b", "b");
    const { key } = saveHandover({ cwd: repo, title: "B work", body: "y", root });
    git("checkout", "-q", "main");
    const out = run({ cwd: repo }, { env });
    expect(out.hookSpecificOutput.additionalContext).toMatch(/2 other handover\(s\)/);
    expect(out.hookSpecificOutput.additionalContext).toContain("load.mjs");
    expect(listWaiting(root, key)).toHaveLength(2);
  });

  it("the script emits valid JSON on stdout and exits 0", () => {
    saveHandover({ cwd: repo, title: "cli", body: "body text", root });
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/session-start.mjs")], {
      input: JSON.stringify({ cwd: repo, source: "clear" }),
      env: { ...process.env, CLEAR_RESUME_HOME: root },
      encoding: "utf8",
    });
    expect(JSON.parse(stdout).hookSpecificOutput.additionalContext).toContain("body text");
  });

  it("the script exits 0 silently on garbage input", () => {
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/session-start.mjs")], {
      input: "not json",
      env: { ...process.env, CLEAR_RESUME_HOME: root },
      encoding: "utf8",
    });
    expect(stdout).toBe("");
  });

  it("load.mjs prints and archives a listed handover", () => {
    git("checkout", "-q", "-b", "a");
    const { path, key } = saveHandover({ cwd: repo, title: "pick me", body: "chosen body", root });
    git("checkout", "-q", "-b", "b");
    saveHandover({ cwd: repo, title: "not me", body: "z", root });
    const file = path.split(/[\\/]/).at(-1);
    const out = execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/load.mjs"), file], {
      cwd: repo,
      env: { ...process.env, CLEAR_RESUME_HOME: root },
      encoding: "utf8",
    });
    expect(out).toContain("chosen body");
    expect(existsSync(path)).toBe(false);
    expect(listWaiting(root, key).map((x) => x.meta.title)).toEqual(["not me"]);
  });
});
