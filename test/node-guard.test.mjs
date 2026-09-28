// The hooks run through a shell before node starts: /bin/sh on Linux and macOS,
// Git Bash on Windows (measured on Claude Code 2.1.283). With no node on PATH the
// old commands printed "node: not found" under "hook error" on every start, every
// tool call and every turn. These tests run the commands from hooks/hooks.json
// exactly as written, with and without node, and the entry file as an old Node
// would see it.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveHandover } from "../scripts/lib/store.mjs";

const PLUGIN = resolve(import.meta.dirname, "..");
const ENTRY = join(PLUGIN, "scripts", "hook-entry.cjs");
const HOOKS = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8")).hooks;
const commandOf = (event) => HOOKS[event][0].hooks[0].command;
const MESSAGE = "clear-resume needs Node.js 18 or later on your PATH. Install it and restart Claude Code.";

// The shell Claude Code would use. On Windows that is Git Bash, found from git
// itself so that WSL's bash.exe (which is earlier on some PATHs) is never picked.
function findShell() {
  if (process.platform !== "win32") return "/bin/sh";
  try {
    const exec = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
    const bash = resolve(exec, "..", "..", "..", "bin", "bash.exe");
    return existsSync(bash) ? bash : null;
  } catch {
    return null;
  }
}
const SHELL = findShell();

const hasNode = (dir) => existsSync(join(dir, "node")) || existsSync(join(dir, "node.exe"));
const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const fullPath = [dirname(process.execPath), ...(process.env[pathKey] ?? "").split(delimiter)].filter(Boolean);

// A clean env for one shell run: no CLEAR_RESUME_* from the machine running the
// suite, PATH with or without every folder that holds node.
function envFor({ node, extra = {} }) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.toUpperCase() === "PATH" || k.startsWith("CLEAR_RESUME_")) continue;
    env[k] = v;
  }
  env.PATH = (node ? fullPath : fullPath.filter((d) => !hasNode(d))).join(delimiter);
  env.CLAUDE_PLUGIN_ROOT = PLUGIN;
  return { ...env, ...extra };
}

const runHook = (event, { node, input = "{}", extra } = {}) =>
  spawnSync(SHELL, ["-c", commandOf(event)], { env: envFor({ node, extra }), input, encoding: "utf8", timeout: 20_000 });

let root, repo;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-store-"));
  repo = mkdtempSync(join(tmpdir(), "cr-repo-"));
  const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

describe("hook commands with no node on PATH", { skip: !SHELL, timeout: 30_000 }, () => {
  it("SessionStart prints the one line as a systemMessage and exits 0", () => {
    const hidden = spawnSync(SHELL, ["-c", "command -v node || echo none"], { env: envFor({ node: false }), encoding: "utf8" });
    expect(hidden.stdout.trim()).toBe("none");
    const r = runHook("SessionStart", { node: false, extra: { CLEAR_RESUME_HOME: root } });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout)).toEqual({ systemMessage: MESSAGE });
  });

  it.each(["PostToolUse", "Stop"])("%s prints nothing and exits 0", (event) => {
    const r = runHook(event, { node: false, extra: { CLEAR_RESUME_HOME: root, CLEAR_RESUME_AUTO: "1" } });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });
});

describe("hook commands with node on PATH", { skip: !SHELL, timeout: 30_000 }, () => {
  it("SessionStart still loads the waiting handover", () => {
    saveHandover({ cwd: repo, title: "Through the guard", body: "guarded body", root, owner: "" });
    const r = runHook("SessionStart", {
      node: true,
      input: JSON.stringify({ cwd: repo, source: "startup" }),
      extra: { CLEAR_RESUME_HOME: root, CLEAR_RESUME_SYNC: "off" },
    });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.systemMessage).toMatch(/loaded handover "Through the guard"/);
    expect(out.hookSpecificOutput.additionalContext).toContain("guarded body");
  });
});

// Same promise as the direct scripts (auto.test.mjs): with auto mode off, the entry
// adds nothing that reads stdin, so a hook left with its input open still exits.
describe("hook-entry.cjs with auto mode off", () => {
  it.each(["post-tool", "stop"])("%s exits at once, before reading its input", async (name) => {
    const child = spawn(process.execPath, [ENTRY, name], {
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

// An old Node is simulated by running the entry with a fake process object. The
// entry was also run for real on Node 10, 14 and 16 (PR evidence).
function runEntryAs(version, name) {
  const written = [];
  const required = [];
  const fakeProcess = {
    argv: ["node", ENTRY, name],
    versions: { node: version },
    stdout: { write: (s) => written.push(s) },
    exit: () => {
      throw new Error("the old-Node branch must let node exit by itself");
    },
  };
  const realRequire = createRequire(ENTRY);
  const fakeRequire = (id) => {
    required.push(id);
    return id === "./lib/hook-import.cjs" ? () => {} : realRequire(id);
  };
  const module = { exports: {} };
  const wrapper = vm.runInThisContext(`(function (exports, require, module, process) {${readFileSync(ENTRY, "utf8")}\n})`);
  wrapper(module.exports, fakeRequire, module, fakeProcess);
  return { written: written.join(""), required };
}

describe("hook-entry.cjs on an old Node", () => {
  it.each(["10.19.0", "12.22.9", "16.20.2", "17.9.1"])("Node %s: SessionStart prints the one line and loads nothing", (v) => {
    const r = runEntryAs(v, "session-start");
    expect(JSON.parse(r.written)).toEqual({ systemMessage: MESSAGE });
    expect(r.required).toEqual([]);
  });

  it.each(["post-tool", "stop"])("Node 16: %s prints nothing and loads nothing", (name) => {
    const r = runEntryAs("16.20.2", name);
    expect(r.written).toBe("");
    expect(r.required).toEqual([]);
  });

  it.each(["18.0.0", "22.23.3"])("Node %s: loads the hook", (v) => {
    const r = runEntryAs(v, "session-start");
    expect(r.written).toBe("");
    expect(r.required).toEqual(["./lib/hook-import.cjs"]);
  });

  it("an unknown hook name does nothing", () => {
    const r = runEntryAs("22.23.3", "../../elsewhere");
    expect(r.written).toBe("");
    expect(r.required).toEqual([]);
  });
});

describe("the no-node line", () => {
  it("is the same in hooks.json and hook-entry.cjs, with no dash or ellipsis", () => {
    expect(commandOf("SessionStart")).toContain(MESSAGE);
    expect(readFileSync(ENTRY, "utf8")).toContain(`"${MESSAGE}"`);
    expect(MESSAGE).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014, 0x2026)}]`));
  });
});
