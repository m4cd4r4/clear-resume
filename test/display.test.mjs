// What the plugin prints names paths relative to "~": a full path carries the
// user name (XP-5).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shellPath, shortId, tildePath } from "../scripts/lib/display.mjs";

describe("tildePath and shellPath", () => {
  it("write a path under home as ~/..., quote what a shell would split, and leave other paths alone", () => {
    const home = mkdtempSync(join(tmpdir(), "cr-home-"));
    try {
      expect(tildePath(join(home, ".clear-resume", "handovers", "x.json"), home)).toBe("~/.clear-resume/handovers/x.json");
      expect(tildePath(home, home)).toBe("~");
      expect(tildePath("/elsewhere/repo", home)).toBe("/elsewhere/repo");
      expect(tildePath(`${home}-other/repo`, home)).toBe(`${home}-other/repo`);
      expect(shellPath(join(home, "plugins", "load.mjs"), home)).toBe("~/plugins/load.mjs");
      expect(shellPath(join(home, "My Plugins", "load.mjs"), home)).toBe('~/"My Plugins/load.mjs"');
      expect(shellPath("/opt/x/load.mjs", home)).toBe('"/opt/x/load.mjs"');
      expect(shortId("work-harder-4242-2026-09-27T00-00-00-000Z")).toMatch(/^[0-9a-f]{7}$/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
