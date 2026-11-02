import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adoptLegacyEnv, migrateHeadlessStore, migrateStore, resolveHeadlessStore, resolveStore } from "../../plugin/packages/store/rename.mjs";
import { listAll, read } from "../../plugin/packages/store/store.mjs";
import { listWaiting, repoInfo, repoKey, saveHandover } from "../../plugin/scripts/lib/store.mjs";
import { chooseHandover } from "../../plugin/scripts/lib/select.mjs";

const RENAME = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "../../plugin/packages/store/rename.mjs")).href;

// Real processes and real git, on Windows.
vi.setConfig({ testTimeout: 60000, hookTimeout: 30000 });

let home;
let oldRoot;
let newRoot;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "rename-"));
  oldRoot = join(home, ".clear-resume");
  newRoot = join(home, ".cornerman");
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const record = (id, extra = {}) => ({
  schema: 1,
  id,
  title: `title ${id}`,
  body: `body ${id}`,
  resumePrompt: `body ${id}`,
  repo: "app",
  repoPath: "I:/Scratch/app",
  mainPath: "I:/Scratch/app",
  branch: "main",
  machine: "m",
  pid: "1",
  owner: "",
  source: "plugin",
  pinned: false,
  status: "waiting",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...extra,
});

function put(root, rel, text) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
const putRecord = (root, r) => put(root, `handovers/${r.id}.json`, `${JSON.stringify(r, null, 2)}\n`);

// Every kind of thing a real store holds, with a CRLF and a non-ASCII byte in it so a
// copy that decodes or normalises anything fails the comparison.
function fixture(root) {
  putRecord(root, record("m-1-waiting"));
  putRecord(root, record("m-2-pinned", { pinned: true, status: "archived", archivedAt: "2026-10-02T00:00:00.000Z" }));
  putRecord(root, record("m-3-tombstone", { status: "deleted", body: "", resumePrompt: "", deletedAt: "2026-10-03T00:00:00.000Z" }));
  putRecord(root, record("m-4-archived", { status: "archived", sessionId: "s4", archivedAt: "2026-10-02T00:00:00.000Z" }));
  put(root, "handovers/m-5-crlf.json", '{"title":"t\\u00e9",\r\n"body":"Ó"}\r\n');
  put(root, "handovers/broken-half-written.json", '{"title":');
  put(root, "artifacts/s4.json", '{"sessionId":"s4","items":[]}\n');
  put(root, "loaded/app-title-abc.md", "# a loaded copy\n");
  put(root, "relay/key.json", '{"limit":3}\n');
  put(root, ".nudged/session-1", "");
  put(root, "app-deadbeef/consumed.txt", "a|one\nb|two\n");
  put(root, "stray-file.log", "kept\n");
  put(root, ".gitignore", ".nudged/\n");
}

/** Every file under a root by relative path -> sha256, `.git` included. */
function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (lstatSync(path).isDirectory()) walk(path);
      else out[relative(root, path).replace(/\\/g, "/")] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  walk(root);
  return out;
}

const gitIn = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function commitAll(root) {
  gitIn(root, "init", "-q", "-b", "main");
  gitIn(root, "add", "-A");
  gitIn(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "first");
}

function runMigrateProcess() {
  const code = `import(${JSON.stringify(RENAME)}).then((m) => { process.stdout.write(JSON.stringify(m.migrateStore({ home: ${JSON.stringify(home)} }))); });`;
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", fail);
    child.on("exit", (status) => (status === 0 ? done(JSON.parse(out)) : fail(new Error(`exit ${status}`))));
  });
}

describe("migrateStore", () => {
  it("existing store: every file arrives byte for byte, git history included", () => {
    fixture(oldRoot);
    commitAll(oldRoot);
    const head = gitIn(oldRoot, "rev-parse", "HEAD");
    const before = snapshot(oldRoot);

    expect(migrateStore({ home }).state).toBe("moved");

    expect(snapshot(newRoot)).toEqual(before);
    expect(gitIn(newRoot, "rev-parse", "HEAD")).toBe(head);
    expect(gitIn(newRoot, "status", "--porcelain")).toBe("");
    expect(resolveStore({}, home)).toBe(newRoot);
  });

  it("leaves a link, so a window still on the old version writes into the same store", () => {
    fixture(oldRoot);
    commitAll(oldRoot);
    migrateStore({ home });
    expect(lstatSync(oldRoot).isSymbolicLink()).toBe(true);
    put(oldRoot, "handovers/m-9.json", "{}\n");
    expect(existsSync(join(newRoot, "handovers", "m-9.json"))).toBe(true);
    gitIn(oldRoot, "add", "-A");
    gitIn(oldRoot, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "through the link");
    expect(gitIn(newRoot, "log", "-1", "--format=%s")).toBe("through the link");
  });

  it("fresh machine, then a re-run: creates nothing, changes nothing", () => {
    expect(migrateStore({ home }).state).toBe("fresh");
    expect(readdirSync(home)).toEqual([]);

    fixture(oldRoot);
    migrateStore({ home });
    const after = snapshot(newRoot);
    const names = readdirSync(home).sort();
    expect(migrateStore({ home }).state).toBe("done");
    expect(snapshot(newRoot)).toEqual(after);
    expect(readdirSync(home).sort()).toEqual(names);
  });

  it("blocked by an open file: stays pending on the old folder, loses nothing, moves on the retry", () => {
    fixture(oldRoot);
    const before = snapshot(oldRoot);
    const fd = openSync(join(oldRoot, "handovers", "m-1-waiting.json"), "r");
    let held;
    try {
      held = migrateStore({ home, retries: 0 });
    } finally {
      closeSync(fd);
    }
    if (process.platform === "win32") {
      expect(held.state).toBe("pending");
      expect(held.reason).toMatch(/EPERM|EBUSY|EACCES/);
      expect(resolveStore({}, home)).toBe(oldRoot);
      expect(existsSync(newRoot)).toBe(false);
      expect(snapshot(oldRoot)).toEqual(before);
      expect(migrateStore({ home }).state).toBe("moved");
    } else {
      expect(held.state).toBe("moved"); // nothing blocks a rename on POSIX
    }
    expect(snapshot(newRoot)).toEqual(before);
  });

  it("parallel start: six real processes, one store, nothing lost", async () => {
    fixture(oldRoot);
    commitAll(oldRoot);
    const before = snapshot(oldRoot);

    const results = await Promise.all(Array.from({ length: 6 }, runMigrateProcess));

    // More than one can say "moved": a process holding the folder open when another moves
    // it renames that same folder to the name it already has. Only the outcome counts.
    expect(results.filter((r) => r.state === "moved").length).toBeGreaterThanOrEqual(1);
    expect(snapshot(newRoot)).toEqual(before);
    expect(lstatSync(oldRoot).isSymbolicLink()).toBe(true);
    expect(readdirSync(home).sort()).toEqual([".clear-resume", ".cornerman"]);
  });

  it("parallel start with both folders: six real processes, everything merged, no history mixed", async () => {
    fixture(oldRoot);
    commitAll(oldRoot);
    const head = gitIn(oldRoot, "rev-parse", "HEAD");
    const before = snapshot(oldRoot);
    putRecord(newRoot, record("m-8-new"));

    const results = await Promise.all(Array.from({ length: 6 }, runMigrateProcess));

    // Whichever process lost a race may stop early, so one more run settles it, as the next session would.
    migrateStore({ home });

    expect(results.length).toBe(6);
    expect(snapshot(newRoot)).toMatchObject(before);
    expect(read("m-8-new", newRoot).title).toBe("title m-8-new");
    expect(gitIn(newRoot, "rev-parse", "HEAD")).toBe(head);
    expect(lstatSync(oldRoot).isSymbolicLink()).toBe(true);
    expect(readdirSync(newRoot).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("both folders: the later updatedAt wins, nothing is lost either way, the old folder is kept aside", () => {
    putRecord(oldRoot, record("m-1", { updatedAt: "2026-10-05T00:00:00.000Z", title: "old is later" }));
    putRecord(newRoot, record("m-1", { updatedAt: "2026-10-01T00:00:00.000Z", title: "new is earlier" }));
    putRecord(oldRoot, record("m-2", { updatedAt: "2026-10-01T00:00:00.000Z", title: "old is earlier" }));
    putRecord(newRoot, record("m-2", { updatedAt: "2026-10-05T00:00:00.000Z", title: "new is later" }));
    putRecord(oldRoot, record("m-3", { title: "only in old" }));
    putRecord(newRoot, record("m-4", { title: "only in new" }));
    put(oldRoot, "stray-file.log", "from old\n");

    expect(migrateStore({ home }).state).toBe("merged");

    const titles = Object.fromEntries(listAll(newRoot).map((r) => [r.id, r.title]));
    expect(titles).toEqual({ "m-1": "old is later", "m-2": "new is later", "m-3": "only in old", "m-4": "only in new" });
    expect(readFileSync(join(newRoot, "stray-file.log"), "utf8")).toBe("from old\n");
    expect(lstatSync(oldRoot).isSymbolicLink()).toBe(true);
    const asides = readdirSync(home).filter((n) => n.startsWith(".clear-resume.aside-"));
    expect(asides).toHaveLength(1);
    expect(existsSync(join(home, asides[0], "handovers", "m-3.json"))).toBe(true);
    expect(existsSync(join(newRoot, ".merged"))).toBe(false);
  });

  it("both folders: a readable copy of a record beats a damaged one, whichever side it is on", () => {
    put(newRoot, "handovers/m-1.json", '{"title":');
    putRecord(oldRoot, record("m-1"));
    put(oldRoot, "handovers/m-2.json", '{"title":');
    putRecord(newRoot, record("m-2"));
    expect(migrateStore({ home }).state).toBe("merged");
    expect(read("m-1", newRoot).title).toBe("title m-1");
    expect(read("m-2", newRoot).title).toBe("title m-2");
  });

  it("interrupted part way through a merge: the next run finishes it, the old folder untouched meanwhile", () => {
    fixture(oldRoot);
    const before = snapshot(oldRoot);
    putRecord(newRoot, record("m-8-new"));

    // A deadline already spent stops the copy as soon as it starts.
    expect(migrateStore({ home, mergeMs: 0 }).state).toBe("merging");
    expect(lstatSync(oldRoot).isSymbolicLink()).toBe(false);
    expect(snapshot(oldRoot)).toEqual(before);

    expect(migrateStore({ home }).state).toBe("merged");
    expect(snapshot(newRoot)).toMatchObject(before);
    expect(read("m-8-new", newRoot).title).toBe("title m-8-new");
  });

  it("interrupted after moving the old folder aside: the next run finishes from the aside, once", () => {
    fixture(oldRoot);
    const before = snapshot(oldRoot);
    putRecord(newRoot, record("m-8-new"));
    // What a crash leaves: the aside exists, unmerged, no marker.
    const aside = join(home, ".clear-resume.aside-1-1");
    renameSync(oldRoot, aside);

    expect(migrateStore({ home }).state).toBe("done");

    expect(snapshot(newRoot)).toMatchObject(before);
    expect(existsSync(join(aside, ".merged"))).toBe(true);
    // A marked aside is finished with: a change to it now is not copied in.
    put(aside, "handovers/m-9-after.json", "{}\n");
    migrateStore({ home });
    expect(existsSync(join(newRoot, "handovers", "m-9-after.json"))).toBe(false);
  });

  it("both folders, the old one held open: everything still reaches the store, and a later write comes over next time", () => {
    if (process.platform !== "win32") return; // nothing blocks a rename on POSIX
    fixture(oldRoot);
    const before = snapshot(oldRoot);
    putRecord(newRoot, record("m-8-new"));
    const fd = openSync(join(oldRoot, "stray-file.log"), "r");
    try {
      const held = migrateStore({ home });
      expect(held.state).toBe("held");
      expect(held.reason).toMatch(/EPERM|EBUSY|EACCES/);
      expect(snapshot(newRoot)).toMatchObject(before);
      putRecord(oldRoot, record("m-9-late"));
    } finally {
      closeSync(fd);
    }
    expect(migrateStore({ home }).state).toBe("merged");
    expect(read("m-9-late", newRoot).title).toBe("title m-9-late");
    expect(lstatSync(oldRoot).isSymbolicLink()).toBe(true);
  });

  it("a file at the new path: reports failure, throws nothing, and the store stays usable", () => {
    fixture(oldRoot);
    const before = snapshot(oldRoot);
    writeFileSync(newRoot, "not a folder");
    expect(migrateStore({ home }).state).toBe("failed");
    expect(snapshot(oldRoot)).toEqual(before);
    expect(resolveStore({}, home)).toBe(oldRoot);
  });

  it("both folders: consumed marks are joined, so a handover loaded on either side is not offered again", () => {
    put(oldRoot, "app-deadbeef/consumed.txt", "a|one\nb|two\n");
    put(newRoot, "app-deadbeef/consumed.txt", "b|two\nc|three\n");
    migrateStore({ home });
    expect(readFileSync(join(newRoot, "app-deadbeef", "consumed.txt"), "utf8").split("\n").filter(Boolean).sort()).toEqual(["a|one", "b|two", "c|three"]);
  });

  it("both folders: a git history is carried whole if the store has none, and never mixed into one it has", () => {
    fixture(oldRoot);
    commitAll(oldRoot);
    const head = gitIn(oldRoot, "rev-parse", "HEAD");
    putRecord(newRoot, record("m-8-new"));
    migrateStore({ home });
    expect(gitIn(newRoot, "rev-parse", "HEAD")).toBe(head);
    expect(gitIn(newRoot, "status", "--porcelain")).toContain("m-8-new");

    rmSync(oldRoot, { force: true, recursive: true });
    fixture(oldRoot);
    commitAll(oldRoot);
    gitIn(oldRoot, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "other history");
    const other = gitIn(oldRoot, "rev-parse", "HEAD");
    migrateStore({ home });
    expect(gitIn(newRoot, "rev-parse", "HEAD")).toBe(head);
    expect(() => gitIn(newRoot, "cat-file", "-e", other)).toThrow();
  });
});

describe("migrateStore: a link someone made at the old path", () => {
  it("pointing elsewhere with the new folder present: its records reach the store and the target is untouched", () => {
    const elsewhere = join(home, "synced-drive");
    fixture(elsewhere);
    const before = snapshot(elsewhere);
    symlinkSync(elsewhere, oldRoot, "junction");
    putRecord(newRoot, record("m-8-new"));

    expect(migrateStore({ home }).state).toBe("merged");

    expect(read("m-1-waiting", newRoot).title).toBe("title m-1-waiting");
    expect(read("m-8-new", newRoot).title).toBe("title m-8-new");
    expect(snapshot(elsewhere)).toEqual(before);
    expect(realpathSync(oldRoot)).toBe(realpathSync(newRoot));
    expect(migrateStore({ home }).state).toBe("done");
  });
});

describe("migrateStore: what a merge leaves out", () => {
  it("leftover temp files and a marker never reach the store, and a git copy cut short is finished later", () => {
    fixture(oldRoot);
    commitAll(oldRoot);
    const head = gitIn(oldRoot, "rev-parse", "HEAD");
    put(oldRoot, "handovers/m-1-waiting.json.77.tmp", "half a write");
    put(oldRoot, ".merged", "stale\n");
    put(oldRoot, ".git/index.lock", "");
    putRecord(newRoot, record("m-8-new"));

    // Stopped part way through a .git copy: nothing git can see yet.
    put(newRoot, ".git.carry.tmp/HEAD", "ref: refs/heads/main\n");
    expect(existsSync(join(newRoot, ".git"))).toBe(false);

    expect(migrateStore({ home }).state).toBe("merged");

    expect(gitIn(newRoot, "rev-parse", "HEAD")).toBe(head);
    expect(existsSync(join(newRoot, ".git", "index.lock"))).toBe(false);
    expect(existsSync(join(newRoot, ".git.carry.tmp"))).toBe(false);
    expect(existsSync(join(newRoot, ".merged"))).toBe(false);
    expect(existsSync(join(newRoot, "handovers", "m-1-waiting.json.77.tmp"))).toBe(false);
  });
});

describe("migrateStore: 3 sessions in one folder", () => {
  it("each window still gets its own handover after the move, and the paths in the store change nothing", () => {
    const repo = join(home, "work", "app");
    mkdirSync(repo, { recursive: true });
    gitIn(repo, "init", "-q", "-b", "main");
    const owners = ["101@1000", "102@1000", "103@1000"];
    owners.forEach((owner, i) => saveHandover({ cwd: repo, title: `from ${owner}`, body: `body ${owner}`, root: oldRoot, owner, now: new Date(Date.now() - (i + 1) * 1000) }));
    const pick = (root, owner) => {
      const waiting = listWaiting(root, repoKey(repoInfo(repo).top));
      return chooseHandover(waiting, "main", { now: new Date(), maxAgeDays: 7, owner, alive: () => true, toEpoch: () => 0 }).load?.meta.title;
    };
    const before = owners.map((owner) => pick(oldRoot, owner));
    expect(before).toEqual(owners.map((owner) => `from ${owner}`));

    expect(migrateStore({ home }).state).toBe("moved");

    expect(owners.map((owner) => pick(newRoot, owner))).toEqual(before);
    expect(listWaiting(newRoot, repoKey(repoInfo(repo).top))).toHaveLength(3);
  });
});

describe("the headless store", () => {
  it("moves on its own, under its own names, without touching the main store", () => {
    const oldHeadless = join(home, ".clear-resume-headless");
    const newHeadless = join(home, ".cornerman-headless");
    fixture(oldHeadless);
    fixture(oldRoot);
    const before = snapshot(oldHeadless);
    const main = snapshot(oldRoot);

    expect(resolveHeadlessStore(home)).toBe(oldHeadless);
    expect(migrateHeadlessStore({ home }).state).toBe("moved");

    expect(snapshot(newHeadless)).toEqual(before);
    expect(resolveHeadlessStore(home)).toBe(newHeadless);
    expect(snapshot(oldRoot)).toEqual(main);
    expect(existsSync(newRoot)).toBe(false);
  });
});

describe("a merge something else is holding open", () => {
  it("a newer record whose copy was refused is tried again, not marked as merged", () => {
    if (process.platform !== "win32") return; // an open file never blocks a rename on POSIX
    putRecord(oldRoot, record("m-1", { title: "newer", updatedAt: "2026-10-09T00:00:00.000Z" }));
    putRecord(newRoot, record("m-1", { title: "older" }));
    const reader = openSync(join(newRoot, "handovers", "m-1.json"), "r");
    try {
      migrateStore({ home });
    } finally {
      closeSync(reader);
    }

    migrateStore({ home });

    expect(read("m-1", newRoot).title).toBe("newer");
  });

  it("one file that will not copy does not hold back the records after it, and is tried again", () => {
    putRecord(oldRoot, record("m-1"));
    putRecord(oldRoot, record("m-2"));
    putRecord(newRoot, record("m-0"));
    mkdirSync(join(newRoot, "handovers", `m-1.json.${process.pid}.tmp`));

    migrateStore({ home });

    expect(read("m-2", newRoot).id).toBe("m-2");
    expect(existsSync(join(newRoot, "handovers", "m-1.json"))).toBe(false);
    migrateStore({ home });
    expect(read("m-1", newRoot).id).toBe("m-1");
  });

  it("a history that could not be put in place is tried again, so the store does not lose sync", () => {
    if (process.platform !== "win32") return;
    mkdirSync(oldRoot);
    gitIn(oldRoot, "init", "-q");
    putRecord(newRoot, record("m-1"));
    mkdirSync(join(newRoot, ".git.carry.tmp"));
    const holder = openSync(join(newRoot, ".git.carry.tmp", "held"), "w");
    try {
      migrateStore({ home });
    } finally {
      closeSync(holder);
    }

    migrateStore({ home });

    expect(existsSync(join(newRoot, ".git", "HEAD"))).toBe(true);
  });

  it("a lock deep inside the old history does not come across and stop every commit", () => {
    mkdirSync(oldRoot);
    gitIn(oldRoot, "init", "-q");
    put(oldRoot, ".git/refs/heads/main.lock", "");
    putRecord(newRoot, record("m-1"));

    migrateStore({ home });

    expect(existsSync(join(newRoot, ".git", "HEAD"))).toBe(true);
    expect(existsSync(join(newRoot, ".git", "refs", "heads", "main.lock"))).toBe(false);
  });

  it("joins consumed marks onto a file cut off before its last newline", () => {
    put(oldRoot, "app/consumed.txt", "a|one\n");
    put(newRoot, "app/consumed.txt", "b|two");

    migrateStore({ home });

    expect(readFileSync(join(newRoot, "app", "consumed.txt"), "utf8").split("\n").filter(Boolean).sort()).toEqual(["a|one", "b|two"]);
  });
});

describe("adoptLegacyEnv", () => {
  it("copies each old variable to its new name, the new name wins, unrelated variables stay out", () => {
    const env = { CLEAR_RESUME_AUTO: "1", CLEAR_RESUME_NUDGE_AT: "50", CORNERMAN_NUDGE_AT: "90", OTHER: "x", CLEAR_RESUME_EMPTY: "" };
    adoptLegacyEnv(env);
    expect(env).toEqual({ CLEAR_RESUME_AUTO: "1", CLEAR_RESUME_NUDGE_AT: "50", CORNERMAN_AUTO: "1", CORNERMAN_NUDGE_AT: "90", OTHER: "x", CLEAR_RESUME_EMPTY: "", CORNERMAN_EMPTY: "" });
  });
});

describe("resolveStore: which folder is the store", () => {
  it("stays on the old folder until the new one exists, so a blocked move never splits the store", () => {
    expect(resolveStore({}, home)).toBe(newRoot);
    mkdirSync(oldRoot);
    expect(resolveStore({}, home)).toBe(oldRoot);
    mkdirSync(newRoot);
    expect(resolveStore({}, home)).toBe(newRoot);
    const own = join(home, "own");
    const legacy = join(home, "legacy");
    expect(resolveStore({ CLEAR_RESUME_HOME: legacy }, home)).toBe(legacy);
    expect(resolveStore({ CORNERMAN_HOME: own, CLEAR_RESUME_HOME: legacy }, home)).toBe(own);
  });
});
