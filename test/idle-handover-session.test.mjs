import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../plugin/scripts/lib/hook.mjs";
import { listWaiting, saveHandover } from "../plugin/scripts/lib/store.mjs";
import { tildePath } from "../plugin/scripts/lib/display.mjs";
import { normalisePath } from "../plugin/packages/store/schema.mjs";

const scripts = join(import.meta.dirname, "../plugin/scripts");
let root, repo, other;
const record = (path) => JSON.parse(readFileSync(path, "utf8"));
const cli = (script, args = [], input = "", env = {}) => spawnSync(process.execPath, [join(scripts, script), ...args], {
  cwd: repo, input, encoding: "utf8",
  env: { ...process.env, CORNERMAN_HOME: root, CLAUDE_PID: "111", CORNERMAN_SYNC: "off", ...env },
});
const hook = (session_id = "new", now = new Date()) => run({ cwd: repo, source: "clear", session_id }, {
  env: { CORNERMAN_HOME: root, CLAUDE_PID: "111", CORNERMAN_SYNC: "off" },
  now,
});
const save = (extra = {}) => saveHandover({
  cwd: repo, root, owner: "111", sessionId: "old", openQuestion: true,
  title: "Open question: proceed?", body: "Wait for the answer.", ...extra,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-idle-store-"));
  repo = mkdtempSync(join(tmpdir(), "cr-idle-repo-"));
  other = mkdtempSync(join(tmpdir(), "cr-idle-other-"));
});
afterEach(() => {
  for (const dir of [root, repo, other]) rmSync(dir, { recursive: true, force: true });
});

describe("idle question handover session safety", () => {
  it("stamps the session and type on an idle save", () => {
    const result = cli("save-open-question.mjs", ["--session", "old", "--cwd", repo, "--question", "Proceed?"]);
    expect(result.status).toBe(0);
    const [saved] = listWaiting(root, repo);
    expect(saved.meta).toMatchObject({ sessionId: "old", openQuestion: true });
    expect(saved.body).toContain("Wait for the user's answer");
  });

  it("retires only the closing session's idle snapshot, even with artifacts disabled", () => {
    const idle = save();
    const ordinary = save({ owner: "222", sessionId: "old", openQuestion: false, title: "manual" });
    const otherSession = save({ owner: "333", sessionId: "other", title: "other question" });
    expect(cli("session-end.mjs", [], JSON.stringify({ session_id: "old", reason: "exit" }), { CORNERMAN_ARTIFACTS: "0" }).status).toBe(0);
    expect(record(idle.path)).toMatchObject({ status: "archived", archivedBy: { via: "session-end" } });
    expect(record(ordinary.path).status).toBe("waiting");
    expect(record(otherSession.path).status).toBe("waiting");
  });

  it("keeps a snapshot on clear, but lists it after 61 minutes", () => {
    const idle = save({ now: new Date(Date.now() - 61 * 60_000) });
    cli("session-end.mjs", [], JSON.stringify({ session_id: "old", reason: "clear" }));
    const out = hook();
    expect(out.systemMessage).toContain("Say which to resume");
    expect(out.hookSpecificOutput.additionalContext).toContain("session old");
    expect(out.hookSpecificOutput.additionalContext).not.toContain("Wait for the answer.");
    expect(record(idle.path).status).toBe("waiting");
    expect(cli("load.mjs", [idle.short]).status).toBe(1);
    expect(cli("load.mjs", ["--peek", idle.short]).stdout).toContain("Wait for the answer.");
    expect(cli("load.mjs", ["--take", idle.short]).status).toBe(0);
    expect(record(idle.path).status).toBe("archived");
  });

  it("loads a 59-minute snapshot after clear even with a new session id", () => {
    const now = new Date();
    const idle = save({ now: new Date(now - 59 * 60_000) });
    cli("session-end.mjs", [], JSON.stringify({ session_id: "old", reason: "clear" }));
    const out = hook("new", now);
    expect(out.hookSpecificOutput.additionalContext).toContain("Wait for the answer.");
    out.afterOutput();
    expect(record(idle.path).status).toBe("archived");
  });

  it("recognizes stale unmarked idle snapshots when their session is unknown", () => {
    const idle = save({ openQuestion: false, sessionId: "", now: new Date(Date.now() - 61 * 60_000), body: "- Saved by the idle check, not the model: Nothing was cleared." });
    const out = hook();
    expect(out.hookSpecificOutput.additionalContext).toContain("session unknown");
    expect(record(idle.path).status).toBe("waiting");
  });

  it("allows explicit loading of a recent idle snapshot", () => {
    const idle = save({ now: new Date(Date.now() - 59 * 60_000) });
    expect(cli("load.mjs", [idle.short]).status).toBe(0);
    expect(record(idle.path).status).toBe("archived");
  });

  it("retires a legacy idle snapshot with a matching session", () => {
    const idle = save({ openQuestion: false, body: "- Saved by the idle check, not the model: Nothing was cleared." });
    cli("session-end.mjs", [], JSON.stringify({ session_id: "old", reason: "exit" }));
    expect(record(idle.path)).toMatchObject({ status: "archived", archivedBy: { via: "session-end" } });
  });

  it("continues to load an ordinary handover from a closed window", () => {
    const handover = save({ openQuestion: false, title: "manual", body: "Ordinary work." });
    const out = hook();
    expect(out.hookSpecificOutput.additionalContext).toContain("Ordinary work.");
    out.afterOutput();
    expect(record(handover.path).status).toBe("archived");
  });

  it("does not report another folder when a handover is waiting here", () => {
    const idle = save({ now: new Date(Date.now() - 10_000) });
    const elsewhere = save({ cwd: other, owner: "222", openQuestion: false, title: "practice", body: "other folder secret" });
    const out = hook();
    expect(out.systemMessage).not.toContain("another folder");
    expect(out.systemMessage).not.toContain("practice");
    expect(out.hookSpecificOutput.additionalContext).not.toContain("other folder secret");
    expect(record(idle.path).status).toBe("waiting");
    expect(record(elsewhere.path).status).toBe("waiting");
  });

  it("does not report another folder when a stale local snapshot is listed", () => {
    save({ now: new Date(Date.now() - 61 * 60_000) });
    save({ cwd: other, owner: "222", openQuestion: false, title: "practice" });
    const out = hook();
    expect(out.systemMessage).not.toContain("another folder");
    expect(out.systemMessage).not.toContain("practice");
    expect(out.hookSpecificOutput.additionalContext).toContain("session old");
  });

  it("reports another folder even when nothing is waiting here", () => {
    save({ cwd: other, openQuestion: false, title: "practice" });
    const out = hook();
    expect(out.systemMessage).toContain("another folder");
    expect(out.systemMessage).toContain(tildePath(normalisePath(other)));
    expect(JSON.stringify(out)).not.toContain("practice");
  });

  it("does not report another folder's handover when it is an hour old", () => {
    const now = new Date();
    save({ cwd: other, openQuestion: false, title: "practice", now: new Date(now - 60 * 60_000) });
    expect(hook("new", now)).toBeNull();
  });

  it("does not automatically load a snapshot at 60 minutes even for the same session", () => {
    const now = new Date();
    const idle = save({ now: new Date(now - 60 * 60_000) });
    const out = hook("old", now);
    expect(out.hookSpecificOutput.additionalContext).toContain("session old");
    expect(out.hookSpecificOutput.additionalContext).not.toContain("Wait for the answer.");
    expect(record(idle.path).status).toBe("waiting");
  });
});
