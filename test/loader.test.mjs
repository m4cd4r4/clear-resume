// tdd-guard:allow - tests backfilled onto the loader, each rule mutation-checked.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { age, chooseHandover } from "../scripts/lib/select.mjs";
import { run } from "../scripts/lib/hook.mjs";
import { ownerId, startHookClock } from "../scripts/lib/owner.mjs";
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

  describe("window ownership (2026-09-25: one window's /clear took another's handover)", () => {
    const owned = (title, branch, owner, created) => ({ ...h(title, branch, created), meta: { ...h(title, branch, created).meta, owner } });
    const alive = (pid) => pid === "111" || pid === "222";

    it("loads this window's own handover even when another window's is newer on the branch", () => {
      const mine = owned("mine", "main", "111", "2026-09-19T10:00:00Z");
      const theirs = owned("theirs", "main", "222", "2026-09-19T11:00:00Z");
      const { load, list } = chooseHandover([mine, theirs], "main", { now: NOW, owner: "111", alive });
      expect(load.meta.title).toBe("mine");
      expect(list.map((x) => x.meta.title)).toEqual(["theirs"]);
    });

    it("loads this window's own handover on another branch", () => {
      const { load } = chooseHandover([owned("mine", "feat", "111")], "main", { now: NOW, owner: "111", alive });
      expect(load.meta.title).toBe("mine");
    });

    it("never auto-loads a handover owned by another running window, even alone on the branch", () => {
      const theirs = owned("theirs", "main", "222");
      expect(chooseHandover([theirs], "main", { now: NOW, owner: "111", alive })).toEqual({ load: null, list: [theirs] });
    });

    it("lets a new window pick up a handover whose window has closed", () => {
      const { load } = chooseHandover([owned("orphan", "main", "999")], "main", { now: NOW, owner: "111", alive });
      expect(load.meta.title).toBe("orphan");
    });

    describe("one window, both owner forms (review 3, 2026-09-27)", () => {
      it("loads this window's own handover written before the upgrade (a bare pid) on another branch", () => {
        const { load } = chooseHandover([owned("pre-upgrade", "feat", "111")], "main", { now: NOW, owner: "111@1790000000000", alive, ownOnly: true });
        expect(load.meta.title).toBe("pre-upgrade");
      });

      it("still finds this window's handover when its own start time could not be read", () => {
        const { load } = chooseHandover([owned("mine", "feat", "111@1790000000000")], "main", { now: NOW, owner: "111", alive, ownOnly: true });
        expect(load.meta.title).toBe("mine");
      });

      it("does not take a handover whose pid matches but whose window started at another time", () => {
        const dead = owned("closed window's", "feat", "111@1790000000000");
        expect(chooseHandover([dead], "main", { now: NOW, owner: "111@1790000500000", alive, ownOnly: true })).toEqual({ load: null, list: [dead] });
      });
    });

    describe("after a compaction (ownOnly)", () => {
      it("still loads this window's own handover, on any branch", () => {
        const { load } = chooseHandover([owned("mine", "feat", "111")], "main", { now: NOW, owner: "111", alive, ownOnly: true });
        expect(load.meta.title).toBe("mine");
      });

      it("lists a closed window's handover on the same branch instead of loading it", () => {
        const orphan = owned("orphan", "main", "999");
        expect(chooseHandover([orphan], "main", { now: NOW, owner: "111", alive, ownOnly: true })).toEqual({ load: null, list: [orphan] });
      });

      it("lists the only waiting handover on another branch instead of loading it", () => {
        const other = h("other", "feat");
        expect(chooseHandover([other], "main", { now: NOW, owner: "111", alive, ownOnly: true })).toEqual({ load: null, list: [other] });
      });
    });
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

  it("names a listed handover by short id, never by the record file (machine name) or a full home path", () => {
    git("checkout", "-q", "-b", "a");
    saveHandover({ cwd: repo, title: "A work", body: "body of A", root });
    git("checkout", "-q", "-b", "b");
    const { key } = saveHandover({ cwd: repo, title: "B work", body: "body of B", root });
    git("checkout", "-q", "main");
    const ctx = run({ cwd: repo }, { env }).hookSpecificOutput.additionalContext;
    const waiting = listWaiting(root, key);
    for (const w of waiting) {
      expect(ctx).toContain(w.short);
      expect(ctx).not.toContain(w.file);
    }
    expect(ctx).not.toContain(hostname());
    // The printed command, run as printed, loads that handover.
    const line = ctx.split("\n").find((l) => l.includes(waiting[0].short) && l.includes("load.mjs")).trim();
    const shellEnv = { ...process.env, ...env, HOME: homedir() };
    const out = process.platform === "win32"
      ? execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(line, "utf16le").toString("base64")], { cwd: repo, env: shellEnv, encoding: "utf8" })
      : execFileSync("/bin/sh", ["-c", line], { cwd: repo, env: shellEnv, encoding: "utf8" });
    expect(out).toContain(`body of ${waiting[0].meta.title[0]}`);
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

    // With the process walk on, as in a real window, the first run's owner is
    // `pid@start` while the twin knows only the bare CLAUDE_PID. Comparing those
    // strings refused the echo, so the twin said nothing, or took a different
    // handover by the lone-handover rule (review of fix/owner-and-hook-cost,
    // 2026-09-27). The config turns the walk off for every other test, which is
    // how this went unseen.
    describe("with the process walk on and CLAUDE_PID set", () => {
      let windowEnv, me;
      beforeEach(() => {
        vi.stubEnv("CLEAR_RESUME_NO_PROCESS_WALK", "");
        // run() here is the hook inside the long-lived test process; give it a fresh budget.
        startHookClock();
        windowEnv = { ...env, CLAUDE_PID: String(process.pid), CLEAR_RESUME_PROCESS_TIMEOUT_MS: "15000" };
        me = ownerId(windowEnv);
        // Without a start time this would not be the case under test.
        expect(me).toMatch(new RegExp(`^${process.pid}@\\d+$`));
      });
      afterEach(() => vi.unstubAllEnvs());

      it("re-emits this window's handover", () => {
        saveHandover({ cwd: repo, title: "Mine", body: "## Next action\nMine body.", root, owner: me });

        expect(run({ cwd: repo, source: "startup" }, { env: windowEnv }).systemMessage).toMatch(/loaded handover "Mine"/);
        const twin = run({ cwd: repo, source: "clear" }, { env: windowEnv });

        expect(twin).not.toBeNull();
        expect(twin.systemMessage).toMatch(/loaded handover "Mine"/);
        expect(twin.hookSpecificOutput.additionalContext).toContain("Mine body.");
      });

      it("does not take a second handover by the lone-handover rule", () => {
        git("checkout", "-q", "-b", "side");
        const { key } = saveHandover({ cwd: repo, title: "Other", body: "other body", root, owner: "" });
        git("checkout", "-q", "main");
        saveHandover({ cwd: repo, title: "Mine", body: "mine body", root, owner: me });

        run({ cwd: repo, source: "startup" }, { env: windowEnv });
        const twin = run({ cwd: repo, source: "clear" }, { env: windowEnv });

        expect(twin.systemMessage).toMatch(/loaded handover "Mine"/);
        expect(listWaiting(root, key).map((x) => x.meta.title)).toEqual(["Other"]);
      });
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
