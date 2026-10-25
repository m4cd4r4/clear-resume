// tdd-guard:allow - backfilled onto artifacts.mjs (store and extractor) written first; each case
// is checked by running it against the code and reading the failure when a rule is bent.
//
// What a session leaves on screen: extracted from the transcript at SessionEnd, kept per
// session, named in the load notice, and pruned with the handover that points at it.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blocksOf, extractArtifacts, referencesOf } from "../plugin/scripts/lib/artifacts.mjs";
import { run } from "../plugin/scripts/lib/hook.mjs";
import { saveHandover } from "../plugin/scripts/lib/store.mjs";
import { captureDir, listCaptures, pruneCaptures, readCapture, summary, validSessionId, writeCapture } from "../plugin/packages/store/artifacts.mjs";

const END = join(import.meta.dirname, "../plugin/scripts/session-end.mjs");
const SID = "8c1b2597-5f5b-4b67-9e2e-a6bad919f7ca";

let root, repo, dir;
const assistant = (text, id) => JSON.stringify({ type: "assistant", message: { id, content: [{ type: "text", text }] } });
const transcript = (...rows) => {
  const file = join(dir, "t.jsonl");
  writeFileSync(file, rows.join("\n") + "\n");
  return file;
};

const TABLE = "Jobs to consider:\n\n| Role | Where |\n|---|---|\n| Driver | Perth |\n| Courier | Fremantle |\n";
const LIST = "Shortlist:\n- one\n- two\n- three\n- four\n";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-art-"));
  repo = mkdtempSync(join(tmpdir(), "art-repo-"));
  dir = mkdtempSync(join(tmpdir(), "cr-art-t-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "i"], { cwd: repo });
});
afterEach(() => {
  for (const d of [root, repo, dir]) rmSync(d, { recursive: true, force: true });
});

describe("blocksOf and referencesOf", () => {
  it("finds a table and titles it by the line above", () => {
    expect(blocksOf(TABLE)).toEqual([{ kind: "table", title: "Jobs to consider", text: "| Role | Where |\n|---|---|\n| Driver | Perth |\n| Courier | Fremantle |" }]);
  });
  it("keeps a list of four, ignores one of three", () => {
    expect(blocksOf(LIST).map((b) => [b.kind, b.title])).toEqual([["list", "Shortlist"]]);
    expect(blocksOf("- a\n- b\n- c\n")).toEqual([]);
  });
  it("ignores tables and lists inside a code fence", () => {
    expect(blocksOf("```\n" + TABLE + "```\n")).toEqual([]);
  });
  it("finds links, markdown links, and Windows and POSIX paths, not the path inside a URL", () => {
    const refs = referencesOf("See https://example.com/a/b. and [docs](https://x.dev/y) plus I:/Scratch/app/lib/a.ts and ~/notes/todo.md and /clear");
    expect(refs.map((r) => [r.kind, r.text])).toEqual([
      ["link", "https://example.com/a/b"],
      ["link", "https://x.dev/y"],
      ["path", "I:/Scratch/app/lib/a.ts"],
      ["path", "~/notes/todo.md"],
    ]);
    expect(refs[1].title).toBe("docs");
  });
});

describe("extractArtifacts", () => {
  it("numbers items by how far back they were said, newest first, and dedupes", () => {
    const file = transcript(assistant(LIST, "m1"), assistant("again https://a.dev and https://a.dev", "m2"), assistant(TABLE, "m3"));
    const { items } = extractArtifacts(file);
    expect(items.map((i) => [i.kind, i.back])).toEqual([["table", 1], ["link", 2], ["list", 3]]);
  });
  it("keeps the last two replies verbatim as the last screen", () => {
    const file = transcript(assistant("first", "m1"), assistant("second", "m2"), assistant("third", "m3"));
    const { lastScreen } = extractArtifacts(file);
    expect(lastScreen).toContain("second");
    expect(lastScreen).toContain("third");
    expect(lastScreen).not.toContain("first");
    expect(lastScreen.indexOf("second")).toBeLessThan(lastScreen.indexOf("third"));
  });
  it("redacts secrets before anything is returned", () => {
    const file = transcript(assistant("key sk-abcdefghijklmnop12345 at https://a.dev and\n" + LIST, "m1"));
    const { items, lastScreen } = extractArtifacts(file);
    expect(lastScreen).not.toContain("abcdefghijklmnop");
    expect(JSON.stringify(items)).not.toContain("abcdefghijklmnop");
  });
  it("records a file written with the Write tool once its result succeeded", () => {
    const use = JSON.stringify({ type: "assistant", message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "I:\\x\\plan.md" } }] } });
    const ok = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } });
    const { items } = extractArtifacts(transcript(use, ok, assistant("done", "m2")));
    expect(items).toContainEqual({ kind: "path", title: "written: plan.md", text: "I:/x/plan.md", back: 1 });
  });
  it("skips rows that are not JSON", () => {
    expect(extractArtifacts(transcript("garbage", assistant(TABLE, "m1"))).items).toHaveLength(1);
  });
});

describe("the store", () => {
  const cap = (sessionId, capturedAt = new Date().toISOString()) => ({
    sessionId,
    repoPath: repo,
    capturedAt,
    items: [
      { kind: "table", title: "Jobs", text: "| a |\n|---|\n| b |", back: 1 },
      { kind: "link", title: "a.dev", text: "https://a.dev", back: 2 },
    ],
    lastScreen: "hello\n",
  });

  it("writes meta, artifacts.md and last-screen.md, and reads them back", () => {
    const folder = writeCapture(root, cap(SID));
    expect(readFileSync(join(folder, "artifacts.md"), "utf8")).toContain("https://a.dev");
    expect(readFileSync(join(folder, "last-screen.md"), "utf8")).toBe("hello\n");
    expect(readCapture(root, SID).counts).toMatchObject({ table: 1, link: 1, list: 0 });
    expect(summary(readCapture(root, SID).counts)).toBe("1 table, 1 link");
  });
  it("refuses a session id that could climb out of the folder", () => {
    expect(validSessionId("../x")).toBe(false);
    expect(writeCapture(root, cap("../x"))).toBeNull();
    expect(readCapture(root, "..")).toBeNull();
  });
  it("prunes old captures but keeps one a waiting handover names", () => {
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    writeCapture(root, cap("old-one", old));
    writeCapture(root, cap("kept-one", old));
    writeCapture(root, cap("new-one"));
    expect(pruneCaptures({ root, keep: new Set(["kept-one"]) })).toEqual(["old-one"]);
    expect(listCaptures(root).map((c) => c.sessionId).sort()).toEqual(["kept-one", "new-one"]);
  });
});

describe("the SessionEnd hook", () => {
  const end = (input, env = {}) =>
    spawnSync(process.execPath, [END], { input: JSON.stringify(input), env: { ...process.env, CLEAR_RESUME_HOME: root, ...env }, encoding: "utf8" });

  it("writes a capture for the session, and nothing when it said nothing worth keeping", () => {
    const r = end({ session_id: SID, transcript_path: transcript(assistant(TABLE, "m1")), cwd: repo, reason: "clear" });
    expect(r.status).toBe(0);
    expect(readCapture(root, SID).counts.table).toBe(1);
    end({ session_id: "quiet", transcript_path: transcript(assistant("just chat", "m1")), cwd: repo });
    expect(existsSync(captureDir(root, "quiet"))).toBe(false);
  });
  it("exits 0 on garbage input and when switched off", () => {
    expect(spawnSync(process.execPath, [END], { input: "not json", env: { ...process.env, CLEAR_RESUME_HOME: root } }).status).toBe(0);
    end({ session_id: SID, transcript_path: transcript(assistant(TABLE, "m1")) }, { CLEAR_RESUME_ARTIFACTS: "0" });
    expect(existsSync(captureDir(root, SID))).toBe(false);
  });
});

describe("the load notice", () => {
  const hook = () => run({ cwd: repo, source: "clear" }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: "111" } });
  const save = (sessionId) => saveHandover({ cwd: repo, title: "Job hunt", body: "## Next action\nApply.", root, owner: "111", sessionId });

  it("names the files the handover's session left, with counts and titles, not their text", () => {
    writeCapture(root, { sessionId: SID, repoPath: repo, capturedAt: new Date().toISOString(), items: extractArtifacts(transcript(assistant(TABLE, "m1"))).items, lastScreen: "x" });
    save(SID);
    const out = hook();
    expect(out.systemMessage).toContain("Earlier session left 1 table");
    expect(out.systemMessage).toContain("artifacts.md");
    const context = out.hookSpecificOutput.additionalContext;
    expect(context).toContain("Jobs to consider");
    expect(context).not.toContain("Fremantle");
  });
  it("says nothing when the session left nothing, or the handover names no session", () => {
    save(SID);
    expect(hook().systemMessage).not.toContain("Earlier session");
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root);
    save(undefined);
    expect(hook().systemMessage).not.toContain("Earlier session");
  });
});
