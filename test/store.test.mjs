import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAll } from "../packages/store/store.mjs";
import { handoverMarkdown, listWaiting, parseHandover, repoInfo, repoKey, saveHandover, slugify } from "../scripts/lib/store.mjs";

let root, repo;

function gitIn(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-store-"));
  repo = mkdtempSync(join(tmpdir(), "cr-repo-"));
  gitIn(repo, "init", "-q", "-b", "main");
  gitIn(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

const at = (s) => new Date(`2026-09-19T${s}Z`);

describe("repoKey", () => {
  it("is stable across drive-letter case and separators", () => {
    expect(repoKey("i:\\Scratch\\app")).toBe(repoKey("I:/Scratch/app"));
  });
  it("differs for same-named folders in different places", () => {
    expect(repoKey("/a/app")).not.toBe(repoKey("/b/app"));
  });
  it("starts with a readable slug", () => {
    expect(repoKey("/x/My App")).toMatch(/^my-app-[0-9a-f]{8}$/);
  });
});

describe("slugify", () => {
  it("strips punctuation and caps length", () => {
    expect(slugify("Fix: the $HOME bug!")).toBe("fix-the-home-bug");
    expect(slugify("a".repeat(80))).toHaveLength(50);
  });
});

describe("saveHandover", () => {
  it("writes a waiting handover whose title and branch round-trip", () => {
    const { path, key } = saveHandover({ cwd: repo, title: 'Title: with "quotes"', body: "# Body\n\nNext: x", now: at("10:00:00"), root });
    const record = JSON.parse(readFileSync(path, "utf8"));
    expect(record.title).toBe('Title: with "quotes"');
    expect(record.branch).toBe("main");
    expect(record.createdAt).toBe("2026-09-19T10:00:00.000Z");
    expect(record.body).toBe("# Body\n\nNext: x");
    expect(listWaiting(root, key)).toHaveLength(1);
  });

  it("renders the git-carried markdown with frontmatter that round-trips", () => {
    const { path } = saveHandover({ cwd: repo, title: 'Title: with "quotes"', body: "# Body\n\nNext: x", now: at("10:00:00"), root });
    const { meta, body } = parseHandover(handoverMarkdown(path));
    expect(meta.title).toBe('Title: with "quotes"');
    expect(meta.branch).toBe("main");
    expect(meta.created).toBe("2026-09-19T10:00:00.000Z");
    expect(body).toBe("# Body\n\nNext: x\n");
  });

  it("writes a record the shared store can read, so the extension sees it too", () => {
    const body = ["# Body", "", "Next: x"].join("\n");
    const { path } = saveHandover({ cwd: repo, title: "shared", body, now: at("10:00:00"), root });
    const record = listAll(root).find((r) => r.path === path);
    expect(record.title).toBe("shared");
    expect(record.status).toBe("waiting");
    expect(record.body).toBe(body);
    expect(record.branch).toBe("main");
    expect(record.createdAt).toBe("2026-09-19T10:00:00.000Z");
  });

  it("uses the repo top level from a subfolder", () => {
    const a = saveHandover({ cwd: repo, title: "a", body: "x", now: at("10:00:00"), root });
    execFileSync("git", ["checkout", "-q", "-b", "other"], { cwd: repo });
    const sub = join(repo, "sub");
    execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(sub)})`]);
    const b = saveHandover({ cwd: sub, title: "b", body: "x", now: at("10:01:00"), root });
    expect(b.key).toBe(a.key);
  });

  it("supersedes the waiting handover on the same branch", () => {
    const first = saveHandover({ cwd: repo, title: "one", body: "x", now: at("10:00:00"), root });
    const second = saveHandover({ cwd: repo, title: "two", body: "y", now: at("11:00:00"), root });
    expect(second.superseded).toHaveLength(1);
    // Superseding flips the record's status; the file itself is not moved.
    expect(JSON.parse(readFileSync(first.path, "utf8")).status).toBe("archived");
    expect(second.superseded[0]).toBe(first.path);
    expect(listWaiting(root, second.key).map((h) => h.meta.title)).toEqual(["two"]);
  });

  it("keeps another branch's handover waiting", () => {
    saveHandover({ cwd: repo, title: "main work", body: "x", now: at("10:00:00"), root });
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    const { key, superseded } = saveHandover({ cwd: repo, title: "feat work", body: "y", now: at("11:00:00"), root });
    expect(superseded).toHaveLength(0);
    expect(listWaiting(root, key).map((h) => h.meta.title)).toEqual(["main work", "feat work"]);
  });

  it("does not overwrite on a same-second, same-title save from another branch", () => {
    saveHandover({ cwd: repo, title: "same", body: "x", now: at("10:00:00"), root });
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    const { key } = saveHandover({ cwd: repo, title: "same", body: "y", now: at("10:00:00"), root });
    expect(listWaiting(root, key)).toHaveLength(2);
  });

  it("works outside a git repo", () => {
    const plain = mkdtempSync(join(tmpdir(), "cr-plain-"));
    try {
      expect(repoInfo(plain).branch).toBe("");
      const { key } = saveHandover({ cwd: plain, title: "t", body: "x", root });
      expect(listWaiting(root, key)).toHaveLength(1);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("rejects an empty title or body", () => {
    expect(() => saveHandover({ cwd: repo, title: " ", body: "x", root })).toThrow(/title/);
    expect(() => saveHandover({ cwd: repo, title: "t", body: "\n", root })).toThrow(/empty/);
  });
});

describe("save.mjs CLI", () => {
  it("reads the body from stdin and reports the path", () => {
    const out = execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/save.mjs"), "--title", "cli test"], {
      cwd: repo,
      input: "# Handover\n\nCost is $600 and `code` stays.\n",
      env: { ...process.env, CLEAR_RESUME_HOME: root },
      encoding: "utf8",
    });
    const path = /Saved handover: (.+)/.exec(out)[1].trim();
    expect(readFileSync(path, "utf8")).toContain("Cost is $600 and `code` stays.");
  });

  it("exits 1 on empty stdin", () => {
    expect(() =>
      execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/save.mjs"), "--title", "t"], {
        cwd: repo,
        input: "",
        env: { ...process.env, CLEAR_RESUME_HOME: root },
        stdio: "pipe",
      }),
    ).toThrow();
  });
});
