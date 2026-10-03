// The plugin options in plugin.json (userConfig) and the code that reads them must
// agree: Claude Code exports option <key> to hooks as CLAUDE_PLUGIN_OPTION_<KEY>.
// tdd-guard:allow - backfilled onto behaviour measured against Claude Code 2.1.283
// (a set number arrives as "150000", a set boolean as "true", an unset option is
// not exported). The option-reading cases were run against the pre-change code and
// seen to fail; the manifest cases guard plugin.json itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTO_OPTION, RELAY_OPTION, autoEnabled, relayOn } from "../plugin/scripts/lib/auto-flag.mjs";
import { DEFAULT_THRESHOLD, NUDGE_AT_OPTION, threshold } from "../plugin/scripts/lib/nudge.mjs";

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../plugin/.claude-plugin/plugin.json"), "utf8"));
const envName = (key) => `CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`;

describe("plugin options (userConfig)", () => {
  it("declares the options the hooks read, under the names Claude Code exports", () => {
    expect(Object.keys(manifest.userConfig).sort()).toEqual(["auto_nudge", "nudge_at", "relay"]);
    expect(envName("relay")).toBe(RELAY_OPTION);
    expect(envName("auto_nudge")).toBe(AUTO_OPTION);
    expect(envName("nudge_at")).toBe(NUDGE_AT_OPTION);
  });

  it("gives the same defaults as the code, which applies them itself", () => {
    expect(manifest.userConfig.auto_nudge.default).toBe(false);
    expect(manifest.userConfig.nudge_at.default).toBe(DEFAULT_THRESHOLD);
    expect(threshold({})).toBe(DEFAULT_THRESHOLD);
    expect(autoEnabled({})).toBe(false);
    expect(manifest.userConfig.relay.default).toBe("off");
    expect(relayOn({})).toBe(false);
  });

  it("relay: on for a positive whole number or unlimited, off for anything else", () => {
    for (const v of ["1", "3", "10", "unlimited", " Unlimited "]) expect(relayOn({ [RELAY_OPTION]: v }), v).toBe(true);
    for (const v of ["", "off", "0", "-1", "2.5", "on", "yes"]) expect(relayOn({ [RELAY_OPTION]: v }), v).toBe(false);
  });

  // Each option is validated strictly: an unknown field stops the plugin loading,
  // and `options` stops it loading on Claude Code before 2.1.271.
  it("uses only fields that cannot stop the plugin loading", () => {
    const allowed = new Set(["type", "title", "description", "default", "required", "sensitive", "multiple", "min", "max"]);
    for (const [key, opt] of Object.entries(manifest.userConfig)) {
      for (const field of Object.keys(opt)) expect(allowed.has(field), `${key}.${field}`).toBe(true);
      for (const field of ["type", "title", "description"]) expect(opt[field], `${key}.${field}`).toBeTruthy();
    }
  });

  it("the auto_nudge option counts only when CLEAR_RESUME_AUTO is unset", () => {
    expect(autoEnabled({ [AUTO_OPTION]: "true" })).toBe(true);
    expect(autoEnabled({ [AUTO_OPTION]: "false" })).toBe(false);
    expect(autoEnabled({ CLEAR_RESUME_AUTO: "0", [AUTO_OPTION]: "true" })).toBe(false);
    expect(autoEnabled({ CLEAR_RESUME_AUTO: "1", [AUTO_OPTION]: "false" })).toBe(true);
    expect(autoEnabled({ CLEAR_RESUME_AUTO: "  ", [AUTO_OPTION]: "true" })).toBe(true);
  });

  it("threshold: a usable CLEAR_RESUME_NUDGE_AT, then the nudge_at option, then the default", () => {
    expect(threshold({ [NUDGE_AT_OPTION]: "150000" })).toBe(150_000);
    expect(threshold({ CLEAR_RESUME_NUDGE_AT: "200000", [NUDGE_AT_OPTION]: "150000" })).toBe(200_000);
    expect(threshold({ CLEAR_RESUME_NUDGE_AT: "180k", [NUDGE_AT_OPTION]: "150000" })).toBe(150_000);
    expect(threshold({ [NUDGE_AT_OPTION]: "" })).toBe(DEFAULT_THRESHOLD);
  });
});
