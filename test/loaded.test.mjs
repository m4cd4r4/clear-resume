// tdd-guard:allow - the first four cases are backfilled onto packages/store/loaded.mjs,
// which was written before them; each rule is mutation-checked. Later cases were added
// one at a time, test first.
//
// A readable copy of every loaded handover, the load message that names it, and
// --peek / --take on a handover that has already been loaded.
//
// After /clear the loaded handover lives only in Claude's context. These are the
// pieces that let a person see, copy and reopen it later, from this window or
// from another one after this window has closed.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../scripts/lib/hook.mjs";
import { archive, saveHandover } from "../scripts/lib/store.mjs";
import { startHookClock } from "../scripts/lib/owner.mjs";
import { shortId as displayShortId } from "../scripts/lib/display.mjs";
import { archiveRecord, listAll, prune, remove, update } from "../packages/store/store.mjs";
import { loadedCopyName, loadedCopyPath, loadedCopyText, loadedDir, shortId, writeLoadedCopy } from "../packages/store/loaded.mjs";

const LOAD = join(import.meta.dirname, "../scripts/load.mjs");
const ME = "111";
// Alive for as long as the tests run, and never the caller's CLAUDE_PID.
const OTHER_LIVE = String(process.pid);

let root, repo;
const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });
const record = (path) => JSON.parse(readFileSync(path, "utf8"));
const lower = (s) => String(s).toLowerCase().replace(/\\/g, "/");
const copies = () => (existsSync(loadedDir(root)) ? readdirSync(loadedDir(root)).filter((f) => f.endsWith(".md")) : []);
const hook = (owner = ME) => run({ cwd: repo, source: "clear" }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: owner } });

function load(args, { owner = ME, walk = false } = {}) {
  return spawnSync(process.execPath, [LOAD, ...args], {
    cwd: repo,
    env: { ...process.env, CLEAR_RESUME_HOME: root, CLAUDE_PID: owner, ...(walk ? { CLEAR_RESUME_NO_PROCESS_WALK: "" } : {}) },
    encoding: "utf8",
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-store-"));
  repo = mkdtempSync(join(tmpdir(), "widget-shop-"));
  git("init", "-q", "-b", "main");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

describe("the copy's name and text", () => {
  const rec = {
    id: "Johns-MacBook-Pro-4242-2026-09-28T01-00-00-000Z",
    title: "Cart totals: rounding!",
    repoPath: "I:/code/Widget-Shop",
    branch: "fix/cart-rounding",
    createdAt: "2026-09-28T01:00:00.000Z",
    body: "# Cart totals: rounding!\n\n## Next action\nRun the totals test.",
  };

  it("is <repo>-<title>-<shortid>.md, with no machine name in it", () => {
    const name = loadedCopyName(rec, { home: "C:/Users/john" });
    expect(name).toBe(`widget-shop-cart-totals-rounding-${shortId(rec.id)}.md`);
    expect(lower(name)).not.toContain("macbook");
    expect(lower(name)).not.toContain("john");
    expect(shortId(rec.id)).toBe(displayShortId(rec.id));
  });

  it("calls a session started in the home folder 'home', never the user name", () => {
    const name = loadedCopyName({ ...rec, repoPath: "C:\\Users\\john" }, { home: "c:/Users/john" });
    expect(name).toMatch(/^home-cart-totals-rounding-[0-9a-f]{7}\.md$/);
    expect(loadedCopyText({ ...rec, repoPath: "C:/Users/john" }, { home: "C:/Users/john" })).not.toContain("john");
  });

  // Outside git a session's repo path is its cwd as given, and on POSIX that is the
  // physical path while homedir() is $HOME unresolved. Compared as plain strings,
  // a home folder reached through a link put the user name in the copy's name.
  it("calls the home folder 'home' when it is reached through a link or junction", () => {
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), "cr-home-link-")));
    const link = join(base, "homes");
    try {
      mkdirSync(join(base, "export", "alice"), { recursive: true });
      symlinkSync(join(base, "export"), link, process.platform === "win32" ? "junction" : "dir");
      const physical = { ...rec, repoPath: join(base, "export", "alice") };

      expect(loadedCopyName(physical, { home: join(link, "alice") })).toMatch(/^home-cart-totals-rounding-[0-9a-f]{7}\.md$/);
      expect(loadedCopyText(physical, { home: join(link, "alice") })).toContain("- Repo: home folder");
      expect(loadedCopyName({ ...rec, repoPath: join(link, "alice") }, { home: physical.repoPath })).toMatch(/^home-/);
    } finally {
      // The link first, so nothing recursive ever walks through it.
      try {
        unlinkSync(link);
      } catch {}
      rmSync(base, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === "win32")("calls the home folder 'home' when it is spelled in its 8.3 short form", (ctx) => {
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), "cr-short-")));
    try {
      const long = join(base, "a-long-home-folder-alice");
      mkdirSync(long);
      const short = execFileSync("cmd.exe", ["/d", "/c", `for %I in ("${long}") do @echo %~sI`], { encoding: "utf8", windowsVerbatimArguments: true }).trim();
      // 8.3 names can be turned off per volume; then there is nothing to test.
      if (!short || short.toLowerCase() === long.toLowerCase()) return ctx.skip();

      expect(loadedCopyName({ ...rec, repoPath: short }, { home: long })).toMatch(/^home-/);
      expect(loadedCopyName({ ...rec, repoPath: long }, { home: short })).toMatch(/^home-/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("holds the title, repo, branch, when it was saved and loaded, then the body, with the title once", () => {
    const text = loadedCopyText(rec, { loadedAt: new Date("2026-09-28T04:00:00Z"), home: "C:/Users/john" });
    expect(text.startsWith("# Cart totals: rounding!\n")).toBe(true);
    expect(text).toContain("- Repo: Widget-Shop");
    expect(text).toContain("- Branch: fix/cart-rounding");
    expect(text).toMatch(/- Saved: 2026-09-2\d \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)/);
    expect(text).toMatch(/- Loaded: 2026-09-2\d \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)/);
    expect(text).toContain("## Next action\nRun the totals test.");
    expect(text.match(/Cart totals: rounding!/g)).toHaveLength(1);
    // In that order: the facts, a rule, then the body.
    const order = ["# Cart totals", "- Repo:", "- Branch:", "- Saved:", "- Loaded:", "\n---\n", "## Next action"].map((s) => text.indexOf(s));
    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("keeps itself out of a synced store's commits", () => {
    writeLoadedCopy(root, rec);
    expect(readFileSync(join(loadedDir(root), ".gitignore"), "utf8")).toBe("*\n");
  });
});

describe("the SessionStart hook writes a copy and names it", () => {
  it("writes the copy on load and prints its path on a second line, with no user or machine name", () => {
    const saved = saveHandover({ cwd: repo, title: "Cart totals rounding", body: "## Next action\nShip it.", root, owner: ME });

    const out = hook();

    const [first, second, ...more] = out.systemMessage.split("\n");
    expect(first).toBe('clear-resume: loaded handover "Cart totals rounding" (saved just now).');
    expect(more).toEqual([]);
    expect(second).toMatch(/^A copy to read or share: .*[\\/]loaded[\\/]widget-shop-[a-z0-9]+-cart-totals-rounding-[0-9a-f]{7}\.md$/);
    expect(second).toContain(saved.short);
    expect(lower(second)).not.toContain(lower(homedir()));
    expect(lower(second)).not.toContain(lower(hostname()));
    // Canonical paths: a Windows temp folder is spelled 8.3 (C:\Users\JOHNSM~1\...),
    // which the long homedir() never prefixes, so a plain compare skipped this and
    // the check above let an absolute 8.3 path through.
    if (lower(realpathSync.native(root)).startsWith(`${lower(realpathSync.native(homedir()))}/`)) {
      expect(second).toContain("A copy to read or share: ~/");
      expect(second).not.toMatch(/share: ([A-Za-z]:|\/)/);
    }

    const [file] = copies();
    expect(file).toBe(second.split(/[\\/]/).at(-1));
    const text = readFileSync(join(loadedDir(root), file), "utf8");
    expect(text).toContain("# Cart totals rounding");
    expect(text).toContain("- Branch: main");
    expect(text).toContain("Ship it.");
    // The extension finds the same file from the stored record alone.
    const [stored] = listAll(root);
    expect(existsSync(loadedCopyPath(root, stored))).toBe(true);
  });

  it("prints the copy's path relative to ~, so the user name in the home folder never shows", () => {
    const home = mkdtempSync(join(tmpdir(), "home-pat-obrien-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    try {
      rmSync(root, { recursive: true, force: true });
      root = join(home, ".clear-resume");
      saveHandover({ cwd: repo, title: "Cart totals rounding", body: "b", root, owner: ME });

      const second = hook().systemMessage.split("\n")[1];

      expect(second).toMatch(/^A copy to read or share: ~\/\.clear-resume\/loaded\/widget-shop-[a-z0-9]+-cart-totals-rounding-[0-9a-f]{7}\.md$/);
      expect(second).not.toContain("pat-obrien");
    } finally {
      vi.unstubAllEnvs();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps the copy line last when other handovers are also waiting, and the twin names the same copy", () => {
    git("checkout", "-q", "-b", "side");
    saveHandover({ cwd: repo, title: "Side work", body: "s", root, owner: "" });
    git("checkout", "-q", "main");
    saveHandover({ cwd: repo, title: "Main work", body: "m", root, owner: "" });

    const first = hook().systemMessage.split("\n");
    const [file] = copies();
    const loadedAt = statSync(join(loadedDir(root), file)).mtimeMs;
    // The twin arrives seconds later and rewrites the copy dated by the first load.
    const env = { CLEAR_RESUME_HOME: root, CLAUDE_PID: ME };
    const twin = run({ cwd: repo, source: "clear" }, { env, now: new Date(Date.now() + 10_000) }).systemMessage.split("\n");

    expect(first).toHaveLength(2);
    expect(first[0]).toMatch(/loaded handover "Main work".*1 other handover waiting/);
    expect(first[1]).toMatch(/^A copy to read or share: .*main-work-[0-9a-f]{7}\.md$/);
    expect(twin[0]).toMatch(/loaded handover "Main work"/);
    expect(twin.at(-1)).toBe(first[1]);
    expect(copies()).toEqual([file]);
    expect(Math.abs(statSync(join(loadedDir(root), file)).mtimeMs - loadedAt)).toBeLessThan(2000);
  });

  it("still loads when the copy cannot be written, and prints no copy line", () => {
    const saved = saveHandover({ cwd: repo, title: "Must load", body: "the body", root, owner: ME });
    // A file where the folder should be, so the folder cannot be made.
    writeFileSync(join(root, "loaded"), "in the way");

    const out = hook();

    expect(out.systemMessage).toBe('clear-resume: loaded handover "Must load" (saved just now).');
    expect(out.hookSpecificOutput.additionalContext).toContain("the body");
    expect(record(saved.path).status).toBe("archived");
  });
});

describe("load.mjs writes the copy too", { timeout: 30_000 }, () => {
  it("names the copy when it loads a waiting handover, and writes none on a peek", () => {
    saveHandover({ cwd: repo, title: "Just looking", body: "b", root, owner: ME });
    expect(load(["--peek", "Just looking"]).status).toBe(0);
    expect(copies()).toEqual([]);

    saveHandover({ cwd: repo, title: "By hand", body: "hand body", root, owner: ME });
    const out = load(["By hand"]);

    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/A copy to read or share: .*by-hand-[0-9a-f]{7}\.md/);
    expect(copies()).toEqual([expect.stringMatching(/-by-hand-[0-9a-f]{7}\.md$/)]);
  });
});

describe("--peek and --take on a handover that was already loaded", { timeout: 30_000 }, () => {
  it("--peek reads one the hook loaded, from another window, and leaves it archived", () => {
    const saved = saveHandover({ cwd: repo, title: "Loaded by hook", body: "hook body", root, owner: ME });
    hook();

    const out = load(["--peek", saved.short], { owner: "222" });

    expect(out.status).toBe(0);
    expect(out.stdout).toContain("hook body");
    expect(out.stdout).toMatch(/already loaded/i);
    expect(out.stdout).toMatch(/A copy to read or share: .*loaded-by-hook-[0-9a-f]{7}\.md/);
    expect(record(saved.path).status).toBe("archived");
    expect(record(saved.path).archivedBy.via).toBe("hook");
  });

  // The taking window started after the handover was saved: that is the whole case
  // (the window that loaded it has closed, a new one takes it). So the handover is
  // saved `agoMs` before this test process started, and the taker's owner id is
  // looked up for real (pid@start), as it is in a real window.
  function takenHere({ title = "Closed window's", agoMs = 2 * 3_600_000 } = {}) {
    vi.stubEnv("CLEAR_RESUME_NO_PROCESS_WALK", "");
    const saved = saveHandover({ cwd: repo, title, body: "c body", root, owner: "999", now: new Date(Date.now() - agoMs) });
    archive(root, null, saved.path, { via: "hook", owner: "999" });
    // Written on another machine and synced here: owned here means this machine too.
    update(saved.id, { machine: "other-laptop" }, { root });
    const out = load(["--take", saved.short], { owner: OTHER_LIVE, walk: true });
    startHookClock(); // the hook runs in this long-lived process; give it a fresh budget
    return { saved, out };
  }
  // Each call is a new SessionStart: a fresh budget, and nothing remembered from the last.
  const hookAs = (owner, source = "clear") => {
    startHookClock();
    return run({ cwd: repo, source }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: owner } });
  };

  it("--take makes a closed window's loaded handover waiting again and this window's", () => {
    try {
      const { saved, out } = takenHere();

      expect(out.status).toBe(0);
      expect(out.stdout).toContain("c body");
      expect(out.stdout).toMatch(/waiting again/i);
      const after = record(saved.path);
      expect(after.status).toBe("waiting");
      expect(after.owner).toMatch(new RegExp(`^${OTHER_LIVE}(@|$)`));
      expect(after.machine).toBe(hostname());
      expect(after.archivedBy).toBeUndefined();
      expect(after.archivedAt).toBeUndefined();

      // Another window's /clear now leaves it alone.
      expect(hookAs("222").systemMessage ?? "").not.toMatch(/loaded handover/);
      expect(record(saved.path).status).toBe("waiting");

      // This window's loads it even on another branch with another handover waiting,
      // where neither the branch rule nor the only-one rule applies.
      git("checkout", "-q", "-b", "feature2");
      saveHandover({ cwd: repo, title: "Other thing", body: "o", root, owner: "" });
      git("checkout", "-q", "-b", "feature3");
      expect(hookAs(OTHER_LIVE).systemMessage).toMatch(/loaded handover "Closed window's"/);
      expect(record(saved.path).status).toBe("archived");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a taken handover is this window's after /compact, even one saved more than a week ago", () => {
    try {
      const { saved } = takenHere({ agoMs: 10 * 86_400_000 });

      expect(hookAs(OTHER_LIVE, "compact").systemMessage).toMatch(/loaded handover "Closed window's"/);
      expect(record(saved.path).status).toBe("archived");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a later /handover in the taking window supersedes the taken one", () => {
    try {
      const { saved } = takenHere();
      const me = record(saved.path).owner;
      expect(me).toContain("@");

      const next = saveHandover({ cwd: repo, title: "Newer work", body: "n", root, owner: me });

      expect(next.replaced.map((r) => r.title)).toEqual(["Closed window's"]);
      expect(record(saved.path).archivedBy.via).toBe("supersede");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("still picks a waiting handover over a loaded one of the same title", () => {
    const old = saveHandover({ cwd: repo, title: "Same title", body: "old body", root, owner: ME });
    hook();
    const fresh = saveHandover({ cwd: repo, title: "Same title", body: "new body", root, owner: ME });

    const out = load(["--peek", "Same title"]);

    expect(out.status).toBe(0);
    expect(out.stdout).toContain("new body");
    expect(out.stdout).not.toContain("old body");
    expect(record(old.path).status).toBe("archived");
    expect(record(fresh.path).status).toBe("waiting");
  });

  it("gives each id when two loaded handovers share the title asked for", () => {
    const one = saveHandover({ cwd: repo, title: "Twice", body: "one", root, owner: "" });
    hook();
    const two = saveHandover({ cwd: repo, title: "Twice", body: "two", root, owner: "" });
    hook("222");
    expect(record(two.path).status).toBe("archived");

    const out = load(["--peek", "Twice"]);

    expect(out.status).toBe(1);
    expect(out.stderr).toContain(one.short);
    expect(out.stderr).toContain(two.short);
    expect(out.stdout).toBe("");
  });

  it("a plain load of an already-loaded handover changes nothing and points at --peek and --take", () => {
    const saved = saveHandover({ cwd: repo, title: "Done once", body: "d body", root, owner: ME });
    hook();
    const before = readFileSync(saved.path, "utf8");

    const out = load([saved.short]);

    expect(out.status).toBe(1);
    expect(out.stdout).not.toContain("d body");
    expect(out.stderr).toMatch(/already loaded/i);
    expect(out.stderr).toContain(`--peek ${saved.short}`);
    expect(out.stderr).toContain(`--take ${saved.short}`);
    expect(readFileSync(saved.path, "utf8")).toBe(before);
  });

  it("refuses a superseded, a deleted and an extension-resumed handover: only a hook or load.mjs load counts", () => {
    const began = Date.now() - 4000;
    const owner = `${ME}@${began}`;
    const superseded = saveHandover({ cwd: repo, title: "First draft", body: "f body", root, owner, now: new Date(began + 1000) });
    saveHandover({ cwd: repo, title: "Second draft", body: "s", root, owner, now: new Date(began + 2000) });
    expect(record(superseded.path).archivedBy.via).toBe("supersede");

    git("checkout", "-q", "-b", "gone");
    const deleted = saveHandover({ cwd: repo, title: "Gone", body: "g body", root, owner: "" });
    hook();
    expect(record(deleted.path).archivedBy.via).toBe("hook");
    remove(deleted.id, { root });

    const sidebar = saveHandover({ cwd: repo, title: "From the sidebar", body: "x body", root, owner: "" });
    archiveRecord(sidebar.id, { root, by: { owner: "", pid: "1", via: "extension" } });

    for (const [h, body, status] of [[superseded, "f body", "archived"], [deleted, "g body", "deleted"], [sidebar, "x body", "archived"]]) {
      for (const flag of ["--peek", "--take"]) {
        const out = load([flag, h.short]);
        expect(out.status).toBe(1);
        expect(out.stdout).not.toContain(body);
      }
      expect(record(h.path).status).toBe(status);
    }
  });
});

describe("pruning the copies", () => {
  it("deletes a copy loaded more than 30 days ago, on the archived-record timer, and keeps a newer one", () => {
    const rec = (title) => ({ id: `desk-1-${title}`, title, repoPath: "/code/widget-shop", createdAt: "2026-08-01T00:00:00Z", body: "b" });
    const old = writeLoadedCopy(root, rec("old"), { loadedAt: new Date("2026-08-27T00:00:00Z") });
    const fresh = writeLoadedCopy(root, rec("fresh"), { loadedAt: new Date("2026-08-30T00:00:00Z") });

    prune({ root, now: new Date("2026-09-28T00:00:00Z") });

    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(join(loadedDir(root), ".gitignore"))).toBe(true);
  });

  it("happens on every SessionStart, even one with nothing to load", () => {
    const rec = { id: "desk-1-ancient", title: "Ancient", repoPath: "/code/widget-shop", createdAt: "2026-01-01T00:00:00Z", body: "b" };
    const old = writeLoadedCopy(root, rec, { loadedAt: new Date(Date.now() - 31 * 86_400_000) });

    expect(hook()).toBeNull();
    expect(existsSync(old)).toBe(false);
  });
});
