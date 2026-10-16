// tdd-guard:allow - backfill: lib/trail.mjs was written first in this session, so these tests were added
// after it and are checked by breaking the module on purpose (see the PR), not by a red-first loop.
//
// The Recent trail is built from the session transcript when a handover is saved. It must list the last
// files and commands newest first, count a command as "ran" only when it succeeded, keep secrets out, read a
// transcript far bigger than one chunk, and never get in the way of a save.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTrail, emptyTrail, redact, trailSection, withTrail } from "../plugin/scripts/lib/trail.mjs";

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cr-trail-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

let n = 0;
const use = (name, input, cwd = "D:/code/app") => ({ type: "assistant", cwd, message: { id: `m${++n}`, content: [{ type: "tool_use", id: `t${n}`, name, input }] } });
const res = (id, text, isError = false) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: text }] } });
// a call and its result as two rows
function call(rows, name, input, text = "ok", isError = false) {
  const row = use(name, input);
  rows.push(row, res(row.message.content[0].id, text, isError));
}
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const write = (rows) => { const f = join(dir, "t.jsonl"); writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); return f; };

describe("buildTrail", () => {
  it("lists files and commands newest first, and splits ran from failed by the result", () => {
    const rows = [];
    call(rows, "Write", { file_path: "D:/code/app/src/a.js" });
    call(rows, "Write", { file_path: "D:/code/app/src/b.js" });
    call(rows, "Edit", { file_path: "D:/code/app/lib/c.js" });
    call(rows, "Read", { file_path: "E:/elsewhere/notes.md" });
    call(rows, "Bash", { command: "npm test" }, "all passed");
    call(rows, "Bash", { command: "node build.mjs --prod" }, "Exit code 2\nboom", true);
    call(rows, "Bash", { command: "git status --short" }, "M a.js");
    const t = buildTrail(write(rows));
    expect(t.written).toEqual(["b.js", "a.js"]); // names, not paths
    expect(t.edited).toEqual(["c.js"]);
    expect(t.read).toEqual(["notes.md"]);
    expect(t.ran).toEqual(["git status --short", "npm test"]);
    expect(t.failed).toEqual([{ cmd: "node build.mjs --prod", code: "2" }]);
  });

  it("caps each list and leaves out a call that never got a result", () => {
    const rows = [];
    for (let i = 1; i <= 9; i++) call(rows, "Bash", { command: `echo ${i}` });
    rows.push(use("Bash", { command: "echo still-running" })); // the save itself, or a call in flight
    const t = buildTrail(write(rows));
    expect(t.ran).toEqual(["echo 9", "echo 8", "echo 7", "echo 6", "echo 5"]);
  });

  it("does not list this plugin's own save and load commands", () => {
    const rows = [];
    call(rows, "Bash", { command: 'node "C:/Users/me/.claude/plugins/cache/clear-resume/clear-resume/0.4.0/scripts/save.mjs" --title x' });
    call(rows, "Bash", { command: "git log --oneline -5" });
    expect(buildTrail(write(rows)).ran).toEqual(["git log --oneline -5"]);
  });

  it("shows a path only when two different files in the same list share a name", () => {
    const rows = [];
    call(rows, "Edit", { file_path: "D:/code/app/src/index.js" });
    call(rows, "Edit", { file_path: "D:/code/app/docs/index.js" });
    call(rows, "Edit", { file_path: "D:/code/app/src/other.js" });
    const f = write(rows);
    expect(buildTrail(f).edited).toEqual(["other.js", "docs/index.js", "src/index.js"]);
    expect(buildTrail(f, { paths: "relative" }).edited).toEqual(["src/other.js", "docs/index.js", "src/index.js"]);
  });

  it("lists a tool error that has no exit code as neither ran nor failed", () => {
    const rows = [];
    call(rows, "Bash", { command: "rm -rf build" }, "Permission to use Bash has been denied.", true);
    call(rows, "Bash", { command: "ls" });
    const t = buildTrail(write(rows));
    expect(t.ran).toEqual(["ls"]);
    expect(t.failed).toEqual([]);
  });

  it("counts a duplicated assistant row once", () => {
    const rows = [];
    const row = use("Bash", { command: "ls" });
    rows.push(row, row, res(row.message.content[0].id, "a"));
    expect(buildTrail(write(rows)).ran).toEqual(["ls"]);
  });

  it("reads a transcript much bigger than one chunk and still finds the oldest and newest calls", () => {
    const rows = [];
    call(rows, "Bash", { command: "echo oldest" });
    const filler = { type: "user", message: { content: "x".repeat(900_000) } };
    for (let i = 0; i < 6; i++) rows.push(filler); // about 5 MB between the oldest and the newest call
    call(rows, "Bash", { command: "echo newest" });
    const t = buildTrail(write(rows));
    expect(t.ran).toEqual(["echo newest", "echo oldest"]);
  });

  it("copes with a row cut in half and with rows that are not JSON", () => {
    const f = join(dir, "bad.jsonl");
    const rows = [];
    call(rows, "Read", { file_path: "D:/code/app/ok.md" });
    writeFileSync(f, "not json\n" + rows.map((r) => JSON.stringify(r)).join("\n") + '\n{"type":"assis');
    expect(buildTrail(f).read).toEqual(["ok.md"]);
  });
});

describe("redact", () => {
  it.each([
    ["curl -H 'Authorization: Bearer abcdef123456' https://x", "abcdef123456"],
    ["echo Bearer abcdef123456", "abcdef123456"],
    ["OPENAI_API_KEY=sk-live-aaaaaaaaaaaa node run.mjs", "sk-live-aaaaaaaaaaaa"],
    ["deploy --token s3cr3tvalue1", "s3cr3tvalue1"],
    ["git clone https://me:hunter2secret@github.com/a/b", "hunter2secret"],
    ["GITHUB_TOKEN=ghp_abcdefghijklmnop gh api x", "ghp_abcdefghijklmnop"],
  ])("removes the secret from %s", (cmd, secret) => {
    expect(redact(cmd)).not.toContain(secret);
  });

  it("keeps an ordinary command as it was", () => {
    expect(redact("npm run build -- --webpack")).toBe("npm run build -- --webpack");
  });

  it("shortens a long command and keeps only its first line", () => {
    const rows = [];
    call(rows, "Bash", { command: "echo " + "a".repeat(300) + "\nsecond line" });
    const [cmd] = buildTrail(write(rows)).ran;
    expect(cmd.length).toBeLessThanOrEqual(103);
    expect(cmd.endsWith("...")).toBe(true);
    expect(cmd).not.toContain("second");
  });
});

describe("trailSection and withTrail", () => {
  const trail = { written: ["a.js"], edited: [], read: ["r.md"], ran: ["npm test"], failed: [{ cmd: "node x.mjs", code: "1" }] };

  it("numbers every list and names the successful commands", () => {
    const s = trailSection(trail);
    expect(s).toContain("## Recent trail");
    expect(s).toContain("Ran and succeeded (Bash), last 5: 1. `npm test`");
    expect(s).toContain("Failed commands, last 3: 1. `node x.mjs` (exit 1)");
    expect(s).toContain("Edited (Edit tool), last 5: none");
  });

  it("keeps the line under the heading short: a longer sentence made the model swap neighbouring file names", () => {
    expect(trailSection(trail).split("\n").slice(0, 2)).toEqual(["## Recent trail", "Numbered, 1 = the most recent."]);
  });

  it("appends to a handover that has no trail and replaces one that has", () => {
    const body = "# T\n\n## Goal\ng\n";
    const once = withTrail(body, trailSection(trail));
    expect(once.endsWith("\n")).toBe(true);
    expect(once.match(/## Recent trail/g)).toHaveLength(1);
    const model = "# T\n\n## Recent trail\nthe model wrote this\n\n## Key files\n- f\n";
    const twice = withTrail(model, trailSection(trail));
    expect(twice).not.toContain("the model wrote this");
    expect(twice).toContain("## Key files");
    expect(twice.match(/## Recent trail/g)).toHaveLength(1);
  });

  it("knows when there is nothing to say", () => {
    expect(emptyTrail({ written: [], edited: [], read: [], ran: [], failed: [] })).toBe(true);
    expect(emptyTrail(trail)).toBe(false);
  });
});

describe("save.mjs", () => {
  const save = fileURLToPath(new URL("../plugin/scripts/save.mjs", import.meta.url));

  it("still refuses an empty handover when a transcript with a trail exists", () => {
    const home = join(dir, "home"), repo = join(dir, "repo");
    const proj = join(home, ".claude", "projects", "d--code-app");
    mkdirSync(proj, { recursive: true }); mkdirSync(repo, { recursive: true });
    const rows = [{ type: "user", cwd: repo, message: { content: "hi" } }];
    call(rows, "Bash", { command: "npm test" });
    writeFileSync(join(proj, "sess-1.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    execFileSync("git", ["init", "-q"], { cwd: repo });
    const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_SESSION_ID: "sess-1" };
    expect(() => execFileSync("node", [save, "--title", "empty", "--cwd", repo], { input: "", env, stdio: "pipe" })).toThrow();
  });

  it("saves the trail inside the handover record when the session has a transcript", () => {
    const home = join(dir, "home"), repo = join(dir, "repo");
    const proj = join(home, ".claude", "projects", "d--code-app");
    mkdirSync(proj, { recursive: true }); mkdirSync(repo, { recursive: true });
    const rows = [{ type: "user", cwd: repo, message: { content: "hi" } }];
    call(rows, "Bash", { command: "npm run lint" });
    writeFileSync(join(proj, "sess-2.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@x.invalid", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "init"], { cwd: repo });
    const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_SESSION_ID: "sess-2", CLEAR_RESUME_AUTO: "" };
    const out = execFileSync("node", [save, "--title", "with trail", "--cwd", repo], { input: "# T\n\n## Goal\ng\n", env, encoding: "utf8" });
    expect(out).toContain("Saved handover");
    const stored = walk(join(home, ".clear-resume")).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(stored).toContain("Recent trail");
    expect(stored).toContain("npm run lint");
  });

  it("saves with no transcript at all and adds no trail", () => {
    const home = join(dir, "home"), repo = join(dir, "repo");
    mkdirSync(repo, { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@x.invalid", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "init"], { cwd: repo });
    const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_SESSION_ID: "", CLEAR_RESUME_AUTO: "" };
    const out = execFileSync("node", [save, "--title", "no transcript", "--cwd", repo], { input: "# T\n\n## Goal\ng\n", env, encoding: "utf8" });
    expect(out).toContain("Saved handover");
  });
});
