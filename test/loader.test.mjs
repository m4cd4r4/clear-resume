// tdd-guard:allow - tests backfilled onto the loader, each rule mutation-checked.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { age, chooseHandover } from "../scripts/lib/select.mjs";
import { run } from "../scripts/lib/hook.mjs";
import { listWaiting, saveHandover } from "../scripts/lib/store.mjs";
import { listAll, read, save } from "../packages/store/store.mjs";

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
    expect(age("2026-09-19T12:00:00Z", NOW)).toBe("just now");
    expect(age("2026-09-19T11:59:45Z", NOW)).toBe("just now");
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
    // Silent again for a real later session. An immediate re-run is the twin of
    // the same /clear and re-emits instead; that pair is covered below.
    expect(run({ cwd: repo }, { env, now: new Date(Date.now() + 60_000) })).toBeNull();
  });

  it("lists other branches' handovers without loading them", () => {
    git("checkout", "-q", "-b", "a");
    saveHandover({ cwd: repo, title: "A work", body: "x", root });
    git("checkout", "-q", "-b", "b");
    const { key } = saveHandover({ cwd: repo, title: "B work", body: "y", root });
    git("checkout", "-q", "main");
    const out = run({ cwd: repo }, { env });
    expect(out.hookSpecificOutput.additionalContext).toContain("2 handovers waiting for this repo, none loaded");
    expect(out.hookSpecificOutput.additionalContext).toContain("load.mjs");
    // The user only ever sees systemMessage, so a list they are asked to choose
    // from is useless there without the titles.
    expect(out.systemMessage).toContain('"A work"');
    expect(out.systemMessage).toContain('"B work"');
    // "other" needs something else to be other than, and nothing was loaded here.
    expect(out.hookSpecificOutput.additionalContext).not.toContain("other handover");
    expect(listWaiting(root, key)).toHaveLength(2);
  });

  it("calls a listed handover \"other\" only when one was loaded, and counts it singular", () => {
    git("checkout", "-q", "-b", "side");
    saveHandover({ cwd: repo, title: "Side work", body: "x", root });
    git("checkout", "-q", "main");
    saveHandover({ cwd: repo, title: "Main work", body: "y", root });
    const ctx = run({ cwd: repo }, { env }).hookSpecificOutput.additionalContext;
    expect(ctx).toContain('Handover "Main work"');
    expect(ctx).toContain("1 other handover also waiting");
    expect(ctx).not.toContain("handover(s)");
  });

  // The extension prunes when its tree opens. A machine used only from the CLI
  // never opens it, so without this the store grows forever there and tombstones
  // from the other machine are never purged.
  it("prunes the store on the way in, without blocking the session", () => {
    const long = "2026-01-01T00:00:00.000Z";
    const { id } = save(
      { title: "long archived", body: "x", repoPath: repo, machine: "old", pid: 1, createdAt: long, status: "archived", archivedAt: long },
      { root },
    );
    expect(listAll(root).map((r) => r.id)).toEqual([id]);

    run({ cwd: repo }, { env });

    expect(listAll(root)).toEqual([]);
    expect(read(id, root).status).toBe("deleted");
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

  // One /clear fires SessionStart twice in the VS Code extension - once as
  // `startup`, once as `clear`. Before this, the twin reported "none loaded"
  // and Claude started with no handover: the plugin's whole job, silently not
  // done. Seen live 2026-09-24 on solaisoft.
  describe("a twin SessionStart from the same /clear", () => {
    it("re-emits the body the first invocation loaded, instead of returning null", () => {
      saveHandover({ cwd: repo, title: "Only one", body: "## Next action\nFinish the grid.", root });

      const first = run({ cwd: repo }, { env });
      expect(first.hookSpecificOutput.additionalContext).toContain("Finish the grid.");

      const twin = run({ cwd: repo }, { env });
      expect(twin).not.toBeNull();
      expect(twin.hookSpecificOutput.additionalContext).toContain("Finish the grid.");
      expect(twin.systemMessage).toMatch(/loaded handover "Only one"/);
    });

    it('does not say "none loaded" while other handovers are still waiting', () => {
      git("checkout", "-q", "-b", "side");
      saveHandover({ cwd: repo, title: "Side work", body: "side body", root });
      git("checkout", "-q", "main");
      saveHandover({ cwd: repo, title: "Main work", body: "main body", root });

      run({ cwd: repo }, { env });
      const ctx = run({ cwd: repo }, { env }).hookSpecificOutput.additionalContext;

      expect(ctx).toContain("main body");
      expect(ctx).not.toContain("none loaded");
      expect(ctx).toContain("1 other handover also waiting");
    });

    it("consumes once: the twin neither re-archives nor writes a second consume mark", () => {
      const { key } = saveHandover({ cwd: repo, title: "Once", body: "body", root });
      run({ cwd: repo }, { env });
      const after = readFileSync(join(root, key, "consumed.txt"), "utf8");

      run({ cwd: repo }, { env });

      expect(readFileSync(join(root, key, "consumed.txt"), "utf8")).toBe(after);
      expect(listWaiting(root, key)).toHaveLength(0);
    });

    // A short window is what separates a twin from a user who cleared twice
    // because they wanted a fresh start.
    it("goes quiet again once the window has passed", () => {
      saveHandover({ cwd: repo, title: "Stale echo", body: "body", root });
      run({ cwd: repo }, { env });

      expect(run({ cwd: repo }, { env, now: new Date(Date.now() + 60_000) })).toBeNull();
    });
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
    // The record stays put and flips to archived, so the extension keeps the history.
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).status).toBe("archived");
    expect(listWaiting(root, key).map((x) => x.meta.title)).toEqual(["not me"]);
  });
});
