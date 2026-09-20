// tdd-guard:allow - auto-mode rules, each mutation-checked.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../scripts/lib/hook.mjs";
import { lastContextTokens, runMidTurn, runStop, threshold } from "../scripts/lib/nudge.mjs";
import { saveHandover } from "../scripts/lib/store.mjs";

const call = (ctx, extra = {}) =>
  JSON.stringify({
    type: "assistant",
    message: { model: "claude-x", usage: { input_tokens: 10, cache_creation_input_tokens: 90, cache_read_input_tokens: ctx - 100, output_tokens: 5 } },
    ...extra,
  });

let dir, root, transcript;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cr-auto-"));
  root = join(dir, "store");
  transcript = join(dir, "t.jsonl");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const write = (...rows) => writeFileSync(transcript, rows.join("\n") + "\n", "utf8");

describe("lastContextTokens", () => {
  it("sums input and both cache fields of the last main-thread call", () => {
    write(call(50_000), JSON.stringify({ type: "user", message: {} }), call(200_000));
    expect(lastContextTokens(transcript)).toBe(200_000);
  });

  it("skips subagent (sidechain) and synthetic calls", () => {
    write(call(190_000), call(20_000, { isSidechain: true }), JSON.stringify({ type: "assistant", message: { model: "<synthetic>", usage: { input_tokens: 0 } } }));
    expect(lastContextTokens(transcript)).toBe(190_000);
  });

  it("returns null for a missing file or no assistant calls", () => {
    expect(lastContextTokens(join(dir, "nope.jsonl"))).toBeNull();
    write(JSON.stringify({ type: "user" }));
    expect(lastContextTokens(transcript)).toBeNull();
  });
});

describe("Stop nudge", () => {
  const env = () => ({ CLEAR_RESUME_AUTO: "1", CLEAR_RESUME_HOME: root });
  const input = (over = {}) => ({ session_id: "s1", transcript_path: transcript, ...over });

  it("does nothing unless auto mode is on", () => {
    write(call(300_000));
    expect(runStop(input(), { env: { CLEAR_RESUME_HOME: root } })).toBeNull();
  });

  it("stays quiet below the threshold", () => {
    write(call(179_000));
    expect(runStop(input(), { env: env() })).toBeNull();
  });

  it("blocks once past the threshold, then never again that session", () => {
    write(call(185_000));
    const out = runStop(input(), { env: env() });
    expect(out.decision).toBe("block");
    expect(out.reason).toMatch(/185k.*threshold 180k/);
    expect(out.reason).toContain("/handover");
    expect(runStop(input(), { env: env() })).toBeNull();
    expect(runStop(input({ session_id: "s2" }), { env: env() }).decision).toBe("block");
  });

  it("never blocks while already continuing from a Stop block", () => {
    write(call(300_000));
    expect(runStop(input({ stop_hook_active: true }), { env: env() })).toBeNull();
  });

  it("honours a custom threshold and ignores a bad one", () => {
    write(call(160_000));
    expect(runStop(input(), { env: { ...env(), CLEAR_RESUME_NUDGE_AT: "150000" } }).decision).toBe("block");
    expect(threshold({ CLEAR_RESUME_NUDGE_AT: "abc" })).toBe(180_000);
  });

  it("the script exits 0 silently on garbage input", () => {
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/stop.mjs")], {
      input: "not json",
      env: { ...process.env, ...env() },
      encoding: "utf8",
    });
    expect(stdout).toBe("");
  });

  it("the script emits a block decision as JSON", () => {
    write(call(250_000));
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/stop.mjs")], {
      input: JSON.stringify(input()),
      env: { ...process.env, ...env() },
      encoding: "utf8",
    });
    expect(JSON.parse(stdout).decision).toBe("block");
  });
});

// A screenshot read is one JSONL line of base64 megabytes. The tail read must
// not give up when it lands inside one: that is silent, and it is worst in the
// image-heavy sessions that burn context fastest.
describe("lastContextTokens past a huge line", () => {
  it("finds the call behind a line larger than the tail read", () => {
    const huge = JSON.stringify({ type: "user", message: { content: "x".repeat(3_000_000) } });
    write(call(210_000), huge);
    expect(lastContextTokens(transcript)).toBe(210_000);
  });

  it("still returns null when the file genuinely holds no main-thread call", () => {
    write(JSON.stringify({ type: "user", message: { content: "y".repeat(2_000_000) } }));
    expect(lastContextTokens(transcript)).toBeNull();
  });
});

// The Stop hook only runs when a turn ends. Context can cross the threshold in
// the middle of one long tool-heavy turn, and compaction does not wait for a
// turn to end - which is exactly how session 83cc6aa6 was compacted on
// 2026-09-20 after climbing 136k to 216k with no turn-end in between.
describe("mid-turn nudge", () => {
  const env = () => ({ CLEAR_RESUME_AUTO: "1", CLEAR_RESUME_HOME: root });
  const input = (over = {}) => ({ session_id: "s1", transcript_path: transcript, ...over });

  it("does nothing unless auto mode is on", () => {
    write(call(300_000));
    expect(runMidTurn(input(), { env: { CLEAR_RESUME_HOME: root } })).toBeNull();
  });

  it("stays quiet below the threshold", () => {
    write(call(179_000));
    expect(runMidTurn(input(), { env: env() })).toBeNull();
  });

  it("warns without blocking, and says the turn is still running", () => {
    write(call(185_000));
    const out = runMidTurn(input(), { env: env() });
    expect(out.decision).toBeUndefined();
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.additionalContext).toMatch(/185k.*threshold 180k/);
    expect(out.hookSpecificOutput.additionalContext).toContain("/handover");
  });

  it("fires once per session, and shares the mark with the Stop nudge", () => {
    write(call(185_000));
    expect(runMidTurn(input(), { env: env() })).not.toBeNull();
    expect(runMidTurn(input(), { env: env() })).toBeNull();
    expect(runStop(input(), { env: env() })).toBeNull();
  });

  it("a Stop nudge first also silences the mid-turn one", () => {
    write(call(185_000));
    expect(runStop(input(), { env: env() }).decision).toBe("block");
    expect(runMidTurn(input(), { env: env() })).toBeNull();
  });

  it("the script exits 0 silently on garbage input", () => {
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/post-tool.mjs")], {
      input: "not json",
      env: { ...process.env, ...env() },
      encoding: "utf8",
    });
    expect(stdout).toBe("");
  });

  it("the script emits the warning as JSON", () => {
    write(call(250_000));
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/post-tool.mjs")], {
      input: JSON.stringify(input()),
      env: { ...process.env, ...env() },
      encoding: "utf8",
    });
    expect(JSON.parse(stdout).hookSpecificOutput.additionalContext).toMatch(/250k/);
  });
});

describe("SessionStart after compaction", () => {
  let repo;
  const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "cr-repo-"));
    git("init", "-q", "-b", "main");
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("tells the new context to re-check state even with nothing waiting", () => {
    const out = run({ cwd: repo, source: "compact" }, { env: { CLEAR_RESUME_HOME: root } });
    expect(out.hookSpecificOutput.additionalContext).toMatch(/just compacted.*re-check git status/);
  });

  it("injects a waiting handover after the note", () => {
    saveHandover({ cwd: repo, title: "t", body: "handover body", root });
    const ctx = run({ cwd: repo, source: "compact" }, { env: { CLEAR_RESUME_HOME: root } }).hookSpecificOutput.additionalContext;
    expect(ctx.indexOf("just compacted")).toBeLessThan(ctx.indexOf("handover body"));
  });

  it("adds no note on a normal startup", () => {
    expect(run({ cwd: repo, source: "startup" }, { env: { CLEAR_RESUME_HOME: root } })).toBeNull();
  });
});
