// tdd-guard:allow - auto-mode rules, each mutation-checked.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../plugin/scripts/lib/hook.mjs";
import { lastContextTokens, runMidTurn, runStop, threshold } from "../plugin/scripts/lib/nudge.mjs";
import { saveHandover } from "../plugin/scripts/lib/store.mjs";
import { ownerId, startHookClock } from "../plugin/scripts/lib/owner.mjs";
import { setBudget } from "../plugin/packages/store/autobudget.mjs";

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

  it("under the headless runner, asks for a commit and a save.mjs handover, never a /clear", () => {
    write(call(200_000));
    const out = runStop(input(), { env: { ...env(), CLEAR_RESUME_HEADLESS: "1" } });
    const text = out.hookSpecificOutput.additionalContext;
    expect(text).toMatch(/finished.*do not save/i);
    expect(text).toMatch(/commit/i);
    expect(text).toMatch(/save\.mjs" --title/);
    expect(text).toMatch(/STOP question/);
    expect(text).toMatch(/end your turn/i);
    // The command, not the plugin's own path (".../clear-resume/...").
    expect(text).not.toMatch(/\/clear(?!-)/);
    expect(out.systemMessage).not.toMatch(/\/clear(?!-)/);
  });

  // A VS Code window with an auto-continue budget: the extension opens the next
  // conversation, so the user is never asked to /clear.
  it("in a VS Code window with budget left, asks for a commit and a handover, never a /clear", () => {
    write(call(200_000));
    const win = { pid: "16352", start: 1000 };
    setBudget(root, win, 2);
    const vscode = { ...env(), CLAUDE_CODE_ENTRYPOINT: "claude-vscode" };
    const out = runStop(input(), { env: vscode, win });
    const text = out.hookSpecificOutput.additionalContext;
    expect(text).toMatch(/finished.*do not save/i);
    expect(text).toMatch(/commit/i);
    expect(text).toContain("/clear-resume:handover");
    expect(text).toMatch(/new conversation/i);
    expect(text).not.toMatch(/\/clear(?!-)/);
    expect(out.systemMessage).not.toMatch(/\/clear(?!-)/);
    expect(out.systemMessage).toMatch(/2 left/);
    // No budget in this window: the 0.2.1 text, word for word.
    write(call(200_000));
    const plain = runStop(input({ session_id: "s2" }), { env: vscode, win: { pid: "999", start: 5 } });
    expect(plain.hookSpecificOutput.additionalContext).toContain("tell the user to type /clear");
  });

  it("nudges once past the threshold, then never again that session", () => {
    write(call(185_000));
    const out = runStop(input(), { env: env() });
    expect(out.hookSpecificOutput.hookEventName).toBe("Stop");
    expect(out.hookSpecificOutput.additionalContext).toMatch(/185k.*threshold 180k/);
    expect(out.hookSpecificOutput.additionalContext).toContain("/clear-resume:handover");
    expect(runStop(input(), { env: env() })).toBeNull();
    expect(runStop(input({ session_id: "s2" }), { env: env() }).hookSpecificOutput.hookEventName).toBe("Stop");
  });

  // Claude Code 2.1.283 shows `decision: "block"` as "Stop hook error: ...",
  // which reads as a crash. additionalContext still makes Claude continue, but
  // is labelled "Stop hook feedback", and systemMessage gives the user a line
  // written for them.
  it("does not block, so the user never sees it as a hook error", () => {
    write(call(185_000));
    const out = runStop(input(), { env: env() });
    expect(out.decision).toBeUndefined();
    expect(out.reason).toBeUndefined();
    expect(out.continue).toBeUndefined();
    expect(out.systemMessage).toMatch(/^clear-resume: /);
    expect(out.systemMessage).toMatch(/185k/);
    expect(out.systemMessage).toContain("/clear");
    expect(out.systemMessage).not.toMatch(/error|fail|—|–|…/i);
  });

  it("never nudges while already continuing from a Stop hook", () => {
    write(call(300_000));
    expect(runStop(input({ stop_hook_active: true }), { env: env() })).toBeNull();
  });

  it("honours a custom threshold and ignores a bad one", () => {
    write(call(160_000));
    expect(runStop(input(), { env: { ...env(), CLEAR_RESUME_NUDGE_AT: "150000" } })).not.toBeNull();
    expect(threshold({ CLEAR_RESUME_NUDGE_AT: "abc" })).toBe(180_000);
  });

  it("turns on and takes its threshold from the plugin options set in /config", () => {
    write(call(160_000));
    const opts = { CLEAR_RESUME_HOME: root, CLAUDE_PLUGIN_OPTION_AUTO_NUDGE: "true", CLAUDE_PLUGIN_OPTION_NUDGE_AT: "150000" };
    expect(runStop(input(), { env: opts }).systemMessage).toMatch(/nudge at 150k/);
  });

  it("CLEAR_RESUME_ env vars still win over the plugin options, for the switch and the size", () => {
    write(call(160_000));
    const off = { CLEAR_RESUME_HOME: root, CLEAR_RESUME_AUTO: "0", CLAUDE_PLUGIN_OPTION_AUTO_NUDGE: "true", CLAUDE_PLUGIN_OPTION_NUDGE_AT: "150000" };
    expect(runStop(input(), { env: off })).toBeNull();
    const higher = { CLEAR_RESUME_HOME: root, CLEAR_RESUME_AUTO: "1", CLEAR_RESUME_NUDGE_AT: "170000", CLAUDE_PLUGIN_OPTION_NUDGE_AT: "150000" };
    expect(runStop(input(), { env: higher })).toBeNull();
  });

  // The hook scripts check auto mode before importing anything, from their own
  // process environment, which is where Claude Code puts the plugin options.
  it("the script reads the plugin options from its environment", () => {
    write(call(160_000));
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../plugin/scripts/stop.mjs")], {
      input: JSON.stringify(input()),
      env: { ...process.env, CLEAR_RESUME_AUTO: "", CLEAR_RESUME_NUDGE_AT: "", CLEAR_RESUME_HOME: root, CLAUDE_PLUGIN_OPTION_AUTO_NUDGE: "true", CLAUDE_PLUGIN_OPTION_NUDGE_AT: "150000" },
      encoding: "utf8",
    });
    expect(JSON.parse(stdout).systemMessage).toMatch(/nudge at 150k/);
  });

  it("the script exits 0 silently on garbage input", () => {
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../plugin/scripts/stop.mjs")], {
      input: "not json",
      env: { ...process.env, ...env() },
      encoding: "utf8",
    });
    expect(stdout).toBe("");
  });

  it("the script emits the nudge as JSON", () => {
    write(call(250_000));
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../plugin/scripts/stop.mjs")], {
      input: JSON.stringify(input()),
      env: { ...process.env, ...env() },
      encoding: "utf8",
    });
    const out = JSON.parse(stdout);
    expect(out.hookSpecificOutput.additionalContext).toMatch(/250k/);
    expect(out.systemMessage).toMatch(/250k/);
    expect(out.decision).toBeUndefined();
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

  it("under the headless runner, asks to finish the step, commit and save, never a /clear", () => {
    write(call(200_000));
    const out = runMidTurn(input(), { env: { ...env(), CLEAR_RESUME_HEADLESS: "1" } });
    const text = out.hookSpecificOutput.additionalContext;
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(text).toMatch(/finish the current step/i);
    expect(text).toMatch(/save\.mjs" --title/);
    expect(text).not.toMatch(/\/clear(?!-)/);
    expect(out.systemMessage).not.toMatch(/\/clear(?!-)/);
  });

  it("warns without blocking, and says the turn is still running", () => {
    write(call(185_000));
    const out = runMidTurn(input(), { env: env() });
    expect(out.decision).toBeUndefined();
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.additionalContext).toMatch(/185k.*threshold 180k/);
    expect(out.hookSpecificOutput.additionalContext).toContain("/clear-resume:handover");
    expect(out.continue).toBeUndefined();
    expect(out.systemMessage).toMatch(/^clear-resume: .*185k/);
    expect(out.systemMessage).not.toMatch(/error|fail|—|–|…/i);
  });

  it("fires once per session, and shares the mark with the Stop nudge", () => {
    write(call(185_000));
    expect(runMidTurn(input(), { env: env() })).not.toBeNull();
    expect(runMidTurn(input(), { env: env() })).toBeNull();
    expect(runStop(input(), { env: env() })).toBeNull();
  });

  it("a Stop nudge first also silences the mid-turn one", () => {
    write(call(185_000));
    expect(runStop(input(), { env: env() })).not.toBeNull();
    expect(runMidTurn(input(), { env: env() })).toBeNull();
  });

  it("the script exits 0 silently on garbage input", () => {
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../plugin/scripts/post-tool.mjs")], {
      input: "not json",
      env: { ...process.env, ...env() },
      encoding: "utf8",
    });
    expect(stdout).toBe("");
  });

  it("the script emits the warning as JSON", () => {
    write(call(250_000));
    const stdout = execFileSync(process.execPath, [join(import.meta.dirname, "../plugin/scripts/post-tool.mjs")], {
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

  // Proving a handover is this window's own takes the window's start time, so this
  // one looks up the real process: this test process stands in for the window.
  it("injects this window's own waiting handover after the note", { timeout: 30_000 }, () => {
    vi.stubEnv("CLEAR_RESUME_NO_PROCESS_WALK", "");
    try {
      startHookClock();
      const owner = ownerId({ CLAUDE_PID: String(process.pid) });
      expect(owner).toMatch(/@/);
      saveHandover({ cwd: repo, title: "t", body: "handover body", root, owner });
      startHookClock();
      const ctx = run({ cwd: repo, source: "compact" }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: String(process.pid) } }).hookSpecificOutput.additionalContext;
      expect(ctx.indexOf("just compacted")).toBeLessThan(ctx.indexOf("handover body"));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("lists, never loads, a handover this window did not write", () => {
    saveHandover({ cwd: repo, title: "someone else's", body: "not this window's body", root, owner: "" });
    const ctx = run({ cwd: repo, source: "compact" }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: "4242" } }).hookSpecificOutput.additionalContext;
    expect(ctx).toMatch(/just compacted/);
    expect(ctx).toContain("someone else's");
    expect(ctx).not.toContain("not this window's body");
  });

  it("adds no note on a normal startup", () => {
    expect(run({ cwd: repo, source: "startup" }, { env: { CLEAR_RESUME_HOME: root } })).toBeNull();
  });
});

// PostToolUse runs after every tool call and Stop after every turn, auto mode or
// not. With auto mode off they must cost no more than starting node: nothing is
// imported or read before the switch is checked. Stdin is left open here, so a
// script that reads it (or anything else) before checking hangs until killed.
describe("hook scripts with auto mode off", () => {
  it.each(["post-tool.mjs", "stop.mjs"])("%s exits at once, before reading its input", async (script) => {
    const child = spawn(process.execPath, [join(import.meta.dirname, "../plugin/scripts", script)], {
      env: { ...process.env, CLEAR_RESUME_AUTO: "", CLEAR_RESUME_HOME: root },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const code = await new Promise((done) => {
      const timer = setTimeout(() => {
        child.kill();
        done("hung");
      }, 5000);
      child.on("exit", (c) => {
        clearTimeout(timer);
        done(c);
      });
    });
    child.stdin.destroy();
    expect(code).toBe(0);
    expect(out).toBe("");
  });
});
