// A pre-commit secret scanner flags the key in relay/*.json, and one such file blocked every commit
// on a real store for 29 days (2026-10-04 to 2026-11-02) with nothing on screen. Relay files are
// per-window state, so they stay out of git, including on a store already stuck with them staged.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { save } from "../../plugin/packages/store/store.mjs";
import { commitLocal, initSync } from "../../plugin/packages/store/sync.mjs";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

let tmp;
let remote;
let root;

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Stands in for gitleaks: refuses a commit with a relay file or the word SECRET staged. */
function blockLikeAScanner() {
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  writeFileSync(
    join(root, ".git", "hooks", "pre-commit"),
    '#!/bin/sh\ngit diff --cached --name-only | grep -q "^relay/" && exit 1\ngit diff --cached | grep -q "SECRET" && exit 1\nexit 0\n',
    { encoding: "utf8", mode: 0o755 },
  );
  git(root, "config", "core.hooksPath", ".git/hooks");
}

function writeRelay(key = "window-one") {
  mkdirSync(join(root, "relay"), { recursive: true });
  writeFileSync(join(root, "relay", `${key}.json`), `${JSON.stringify({ v: 1, key, sessions: [] })}\n`, "utf8");
}

function saveHandover(body = "plain note") {
  return save({ title: "a handover", body, repoPath: "I:/Scratch/app", machine: "desk", pid: 1 }, { root });
}

const tracked = () => git(root, "ls-files").split("\n").filter(Boolean);

/** A store from before this fix: its .gitignore has only the old line, and git has been set up. */
function oldStore() {
  saveHandover("first note");
  initSync(root, remote);
  writeFileSync(join(root, ".gitignore"), ".nudged/\n", "utf8");
  git(root, "add", ".gitignore");
  if (git(root, "status", "--porcelain")) git(root, "commit", "-m", "old gitignore");
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cr-relay-"));
  remote = join(tmp, "remote.git");
  root = join(tmp, "store");
  git(tmp, "init", "--bare", "--initial-branch=main", remote);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe("relay files and the store's git", () => {
  it("a store stuck with relay files staged behind a scanner commits again, and nothing is lost", () => {
    oldStore();
    writeRelay();
    blockLikeAScanner();
    git(root, "add", "-A");
    const { id } = saveHandover("written while stuck");

    const result = commitLocal(root);

    expect(result).toMatchObject({ ok: true, committed: true });
    expect(tracked()).toContain(`handovers/${id}.json`);
    expect(tracked().filter((p) => p.startsWith("relay/"))).toEqual([]);
    expect(existsSync(join(root, "relay", "window-one.json"))).toBe(true);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain("relay/");
  });

  it("a relay file already committed leaves git but stays on disk", () => {
    saveHandover();
    initSync(root, remote);
    writeRelay();
    writeFileSync(join(root, ".gitignore"), ".nudged/\n", "utf8");
    git(root, "add", "-A");
    git(root, "commit", "--no-verify", "-m", "relay tracked by an old version");
    expect(tracked()).toContain("relay/window-one.json");

    expect(commitLocal(root).ok).toBe(true);

    expect(tracked().filter((p) => p.startsWith("relay/"))).toEqual([]);
    expect(existsSync(join(root, "relay", "window-one.json"))).toBe(true);
  });

  it("a new store never commits a relay file, and keeps it on disk", () => {
    writeRelay();
    const { id } = saveHandover();
    expect(initSync(root, remote).ok).toBe(true);
    expect(tracked()).toContain(`handovers/${id}.json`);
    expect(tracked().filter((p) => p.startsWith("relay/"))).toEqual([]);
    expect(existsSync(join(root, "relay", "window-one.json"))).toBe(true);
  });

  it("keeps a person's own ignore lines, and adds nothing on a second run", () => {
    oldStore();
    writeFileSync(join(root, ".gitignore"), ".nudged/\r\nmy-notes/", "utf8");
    commitLocal(root);
    const once = readFileSync(join(root, ".gitignore"), "utf8");
    expect(once).toContain("my-notes/");
    expect(once.match(/relay\//g)).toHaveLength(1);

    expect(commitLocal(root)).toMatchObject({ ok: true, committed: false });
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe(once);
  });

  it("still lets the scanner stop a real secret in a handover", () => {
    oldStore();
    blockLikeAScanner();
    writeRelay();
    saveHandover("SECRET value");
    expect(commitLocal(root)).toMatchObject({ ok: false, committed: false });
  });
});
