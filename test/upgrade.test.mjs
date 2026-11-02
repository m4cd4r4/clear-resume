import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upgradeSettings } from "../plugin/scripts/lib/upgrade.mjs";

let dir;
const settings = () => join(dir, "settings.json");
const written = () => JSON.parse(readFileSync(settings(), "utf8"));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "upgrade-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("upgradeSettings", () => {
  it("copies the old plugin's options to the new key and keeps the old ones", () => {
    writeFileSync(settings(), JSON.stringify({ theme: "dark", pluginConfigs: { "clear-resume@clear-resume": { options: { idle_handover: "smart" } } } }));

    expect(upgradeSettings({ configDir: dir }).copied).toBe(true);

    expect(written()).toEqual({
      theme: "dark",
      pluginConfigs: {
        "clear-resume@clear-resume": { options: { idle_handover: "smart" } },
        "cornerman@cornerman": { options: { idle_handover: "smart" } },
      },
    });
  });

  it("reports what still uses the old name, and whether the old plugin is on", () => {
    writeFileSync(settings(), JSON.stringify({
      enabledPlugins: { "clear-resume@clear-resume": true },
      permissions: { allow: ["Skill(clear-resume:handover)", "Bash(git:*)"] },
      env: { CLEAR_RESUME_AUTO: "1", OTHER: "x" },
    }));

    expect(upgradeSettings({ configDir: dir, env: { CLEAR_RESUME_SYNC: "off" } })).toEqual({
      copied: false,
      oldPluginOn: true,
      allowRules: ["Skill(clear-resume:handover)"],
      envNames: ["CLEAR_RESUME_AUTO", "CLEAR_RESUME_SYNC"],
    });
  });

  it("never writes over a settings file it cannot read", () => {
    writeFileSync(settings(), "{ not json");

    expect(upgradeSettings({ configDir: dir, env: {} })).toMatchObject({ copied: false, unreadable: true });

    expect(readFileSync(settings(), "utf8")).toBe("{ not json");
  });
});
