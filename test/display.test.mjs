// What the plugin prints names paths relative to "~": a full path carries the
// user name (XP-5).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shellPath, shortId, tildePath } from "../scripts/lib/display.mjs";

describe("tildePath and shellPath", () => {
  it("write a path under home as ~/... for reading and \"$HOME/...\" for a command, and leave other paths alone", () => {
    const home = mkdtempSync(join(tmpdir(), "cr-home-"));
    try {
      expect(tildePath(join(home, ".clear-resume", "handovers", "x.json"), home)).toBe("~/.clear-resume/handovers/x.json");
      expect(tildePath(home, home)).toBe("~");
      expect(tildePath("/elsewhere/repo", home)).toBe("/elsewhere/repo");
      expect(tildePath(`${home}-other/repo`, home)).toBe(`${home}-other/repo`);
      expect(shellPath(join(home, "plugins", "load.mjs"), home)).toBe('"$HOME/plugins/load.mjs"');
      expect(shellPath(join(home, "My Plugins", "load.mjs"), home)).toBe('"$HOME/My Plugins/load.mjs"');
      expect(shellPath("/opt/x/load.mjs", home)).toBe('"/opt/x/load.mjs"');
      // A "$" or a backtick would be read inside the double quotes: keep the full path.
      expect(shellPath(join(home, "a$b", "load.mjs"), home)).toBe(`"${join(home, "a$b", "load.mjs")}"`);
      expect(shortId("work-harder-4242-2026-09-27T00-00-00-000Z")).toMatch(/^[0-9a-f]{7}$/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  // "~" is not expanded in a PowerShell 5.1 native-command argument, so a printed
  // `node ~/...` failed there (review 3, 2026-09-27). Claude's Bash tool sets HOME.
  it("prints a command path that reaches node intact in Git Bash, PowerShell and bash", () => {
    const target = join(homedir(), ".cr-shellpath-probe", "My Plugins", "load.mjs");
    const cmd = `node -p "process.argv[1]" ${shellPath(target)}`;
    const env = { ...process.env, HOME: homedir() };
    const shells = [];
    if (process.platform === "win32") {
      const bash = join(execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(), "..", "..", "..", "bin", "bash.exe");
      if (existsSync(bash)) shells.push(["git bash", () => execFileSync(bash, ["-c", cmd], { env, encoding: "utf8" })]);
      const encoded = Buffer.from(cmd, "utf16le").toString("base64");
      shells.push(["powershell", () => execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { env, encoding: "utf8" })]);
    } else {
      shells.push(["bash", () => execFileSync("bash", ["-c", cmd], { env, encoding: "utf8" })]);
      shells.push(["sh", () => execFileSync("sh", ["-c", cmd], { env, encoding: "utf8" })]);
    }
    const norm = (s) => {
      const t = s.trim().replace(/\\/g, "/");
      return process.platform === "win32" ? t.toLowerCase() : t;
    };
    expect(shellPath(target)).toMatch(/^"\$HOME\//);
    for (const [name, runIt] of shells) expect([name, norm(runIt())]).toEqual([name, norm(target)]);
  }, 30_000);
});
