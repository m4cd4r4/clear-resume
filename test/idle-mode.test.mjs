// tdd-guard:allow  backfill: the module was written first, these tests pin its behaviour.
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearWindowIdleMode,
  idleText,
  parseIdleMode,
  setWindowIdleMode,
  settingsIdleMode,
  windowIdleMode,
} from "../extension/src/idle-mode.ts";

const dir = () => mkdtempSync(join(tmpdir(), "idle-mode-"));

describe("idle mode from the plugin option", () => {
  it("reads off when the file is missing or unreadable", () => {
    const p = join(dir(), "settings.json");
    expect(settingsIdleMode(p)).toBe("off");
    writeFileSync(p, "{ not json");
    expect(settingsIdleMode(p)).toBe("off");
  });

  it("reads the plugin option and treats anything unknown as off", () => {
    const p = join(dir(), "settings.json");
    writeFileSync(p, JSON.stringify({ pluginConfigs: { "clear-resume@clear-resume": { options: { idle_handover: "Smart" } } } }));
    expect(settingsIdleMode(p)).toBe("smart");
    expect(parseIdleMode("sometimes")).toBe("off");
    expect(parseIdleMode(undefined)).toBe("off");
  });
});

describe("idle mode picked for a window", () => {
  it("is null with no file, and null for a file that is not a mode", () => {
    const d = dir();
    expect(windowIdleMode(d, "k1")).toBeNull();
    writeFileSync(join(d, "k1.idle.json"), JSON.stringify({ mode: "sometimes" }));
    expect(windowIdleMode(d, "k1")).toBeNull();
    writeFileSync(join(d, "k1.idle.json"), "{ not json");
    expect(windowIdleMode(d, "k1")).toBeNull();
  });

  it("round-trips each mode in the file the relay reads, and leaves no temp file", () => {
    const d = dir();
    for (const m of ["off", "toast", "smart", "auto"]) {
      setWindowIdleMode(d, "k1", m);
      expect(windowIdleMode(d, "k1")).toBe(m);
      expect(JSON.parse(readFileSync(join(d, "k1.idle.json"), "utf8")).mode).toBe(m);
    }
    expect(readdirSync(d)).toEqual(["k1.idle.json"]);
  });

  it("is per window: another key is untouched", () => {
    const d = dir();
    setWindowIdleMode(d, "k1", "auto");
    expect(windowIdleMode(d, "k2")).toBeNull();
  });

  it("clearing drops the pick, and clearing nothing is fine", () => {
    const d = dir();
    setWindowIdleMode(d, "k1", "auto");
    clearWindowIdleMode(d, "k1");
    expect(existsSync(join(d, "k1.idle.json"))).toBe(false);
    expect(() => clearWindowIdleMode(d, "k1")).not.toThrow();
  });

  it("labels the status item with the mode", () => {
    expect(idleText("smart")).toBe("$(clock) idle smart");
  });
});
