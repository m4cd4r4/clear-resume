// What the plugin prints names paths relative to "~": a full path carries the
// user name (XP-5).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shellPath, shortId, tildePath } from "../plugin/scripts/lib/display.mjs";

describe("tildePath and shellPath", () => {
  it("write a path under home as ~/... for reading and \"$HOME/...\" for a command, and leave other paths alone", () => {
    const home = mkdtempSync(join(tmpdir(), "cr-home-"));
    try {
      expect(tildePath(join(home, ".clear-resume", "handovers", "x.json"), home)).toBe("~/.clear-resume/handovers/x.json");
      expect(tildePath(home, home)).toBe("~");
      expect(tildePath("/elsewhere/repo", home)).toBe("/elsewhere/repo");
      expect(tildePath(`${home}-other/repo`, home)).toBe(`${home}-other/repo`);
      const E = { env: { HOME: home } };
      expect(shellPath(join(home, "plugins", "load.mjs"), home, E)).toBe('"$HOME/plugins/load.mjs"');
      expect(shellPath(join(home, "My Plugins", "load.mjs"), home, E)).toBe('"$HOME/My Plugins/load.mjs"');
      expect(shellPath(join(home, "Configuración", "load.mjs"), home, E)).toBe('"$HOME/Configuración/load.mjs"');
      expect(shellPath("/opt/x/load.mjs", home, E)).toBe('"/opt/x/load.mjs"');
      // "$" or "`" would be read inside double quotes: the full path, single-quoted.
      expect(shellPath(join(home, "a$b", "load.mjs"), home, E)).toBe(`'${join(home, "a$b", "load.mjs")}'`);
      expect(shortId("work-harder-4242-2026-09-27T00-00-00-000Z")).toMatch(/^[0-9a-f]{7}$/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("prints the full path wherever \"$HOME\" would not reach the file (review 4, 2026-09-27)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cr-home-"));
    try {
      const file = (home) => join(home, "x", "load.mjs");
      // Git Bash leaves /c/Users/Pat O'Brien/... unconverted, and node cannot find it.
      const obrien = join(tmp, "Pat O'Brien");
      expect(shellPath(file(obrien), obrien, { env: { HOME: obrien }, platform: "win32" })).toBe(`"${file(obrien)}"`);
      expect(shellPath(file(obrien), obrien, { env: { HOME: obrien }, platform: "linux" })).toBe('"$HOME/x/load.mjs"');
      // Git Bash's $HOME is the HOME variable; PowerShell's is the profile folder.
      expect(shellPath(file(tmp), tmp, { env: { HOME: join(tmp, "elsewhere") }, platform: "win32" })).toBe(`"${file(tmp)}"`);
      expect(shellPath(file(tmp), tmp, { env: {}, platform: "win32" })).toBe('"$HOME/x/load.mjs"');
      // sh with HOME unset expands "$HOME/..." to "/...".
      expect(shellPath(file(tmp), tmp, { env: {}, platform: "linux" })).toBe(`"${file(tmp)}"`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // "~" is not expanded in a PowerShell 5.1 native-command argument, so a printed
  // `node ~/...` failed there (review 3, 2026-09-27). Claude's Bash tool sets HOME.
  it("prints a command path that reaches node intact in Git Bash, PowerShell and bash", () => {
    const env = { ...process.env, HOME: homedir() };
    const shells = [];
    if (process.platform === "win32") {
      const bash = join(execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(), "..", "..", "..", "bin", "bash.exe");
      if (existsSync(bash)) shells.push(["git bash", (cmd) => execFileSync(bash, ["-c", cmd], { env, encoding: "utf8" })]);
      const encoded = (cmd) => Buffer.from(cmd, "utf16le").toString("base64");
      shells.push(["powershell", (cmd) => execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded(cmd)], { env, encoding: "utf8" })]);
    } else {
      shells.push(["bash", (cmd) => execFileSync("bash", ["-c", cmd], { env, encoding: "utf8" })]);
      shells.push(["sh", (cmd) => execFileSync("sh", ["-c", cmd], { env, encoding: "utf8" })]);
    }
    const norm = (s) => {
      const t = s.trim().replace(/\\/g, "/");
      return process.platform === "win32" ? t.toLowerCase() : t;
    };
    const probe = join(homedir(), ".cr-shellpath-probe");
    const targets = [
      [join(probe, "My Plugins", "load.mjs"), /^"\$HOME\//],
      [join(probe, "Configuración", "load.mjs"), /^"\$HOME\//],
      [join(probe, "a$b", "load.mjs"), /^'/],
    ];
    for (const [target, form] of targets) {
      const printed = shellPath(target, homedir(), { env });
      expect(printed).toMatch(form);
      for (const [name, runIt] of shells) expect([name, target, norm(runIt(`node -p "process.argv[1]" ${printed}`))]).toEqual([name, target, norm(target)]);
    }
  }, 30_000);
});
