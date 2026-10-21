// tdd-guard:allow  backfill: the module was written first, these tests pin its behaviour.
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { idleText, parseIdleMode, readIdleMode, writeIdleMode } from "../extension/src/idle-mode.ts";

const tmp = () => join(mkdtempSync(join(tmpdir(), "idle-mode-")), "settings.json");

describe("idle mode setting", () => {
  it("reads off when the file is missing or unreadable", () => {
    const p = tmp();
    expect(readIdleMode(p)).toBe("off");
    writeFileSync(p, "{ not json");
    expect(readIdleMode(p)).toBe("off");
  });

  it("reads the plugin option and treats anything unknown as off", () => {
    const p = tmp();
    writeFileSync(p, JSON.stringify({ pluginConfigs: { "clear-resume@clear-resume": { options: { idle_handover: "Smart" } } } }));
    expect(readIdleMode(p)).toBe("smart");
    expect(parseIdleMode("sometimes")).toBe("off");
    expect(parseIdleMode(undefined)).toBe("off");
  });

  it("writes into a missing file", () => {
    const p = tmp();
    expect(writeIdleMode("auto", p)).toBe(true);
    expect(readIdleMode(p)).toBe("auto");
  });

  it("keeps every other setting and every other option", () => {
    const p = tmp();
    const before = {
      model: "sonnet",
      permissions: { allow: ["Read"] },
      pluginConfigs: {
        "other@plugin": { options: { a: 1 } },
        "clear-resume@clear-resume": { options: { cache_ttl_minutes: 60, nudge_at: 130000 }, extra: true },
      },
    };
    writeFileSync(p, JSON.stringify(before));
    expect(writeIdleMode("toast", p)).toBe(true);
    const after = JSON.parse(readFileSync(p, "utf8"));
    expect(after.model).toBe("sonnet");
    expect(after.permissions).toEqual(before.permissions);
    expect(after.pluginConfigs["other@plugin"]).toEqual(before.pluginConfigs["other@plugin"]);
    expect(after.pluginConfigs["clear-resume@clear-resume"]).toEqual({
      options: { cache_ttl_minutes: 60, nudge_at: 130000, idle_handover: "toast" },
      extra: true,
    });
  });

  it("refuses to overwrite a settings file it cannot read, and leaves no temp file", () => {
    const p = tmp();
    writeFileSync(p, "{ not json");
    expect(writeIdleMode("auto", p)).toBe(false);
    expect(readFileSync(p, "utf8")).toBe("{ not json");
    expect(readdirSync(join(p, "..")).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("labels the status item with the mode", () => {
    expect(idleText("smart")).toBe("$(clock) idle smart");
  });
});
