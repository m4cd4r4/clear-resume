import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const IDLE_MODES = ["off", "toast", "smart", "auto"] as const;
export type IdleMode = (typeof IDLE_MODES)[number];

const PLUGIN = "clear-resume@clear-resume";

export const IDLE_DETAIL: Record<IdleMode, string> = {
  off: "does nothing while you are away",
  toast: "shows a message before the prompt cache expires",
  smart: "writes a handover and clears, unless the work is finished",
  auto: "writes a handover and clears before the prompt cache expires",
};

export const settingsPath = () => join(homedir(), ".claude", "settings.json");

const windowPath = (relayDir: string, key: string) => join(relayDir, `${key}.idle.json`);

// The same reading the relay applies: anything but toast, smart or auto is off.
export function parseIdleMode(raw: unknown): IdleMode {
  const s = String(raw ?? "off").trim().toLowerCase();
  return s === "toast" || s === "smart" || s === "auto" ? s : "off";
}

/** idle_handover from the plugin's options in settings.json; off when unset or unreadable. */
export function settingsIdleMode(path = settingsPath()): IdleMode {
  try {
    if (!existsSync(path)) return "off";
    return parseIdleMode(JSON.parse(readFileSync(path, "utf8"))?.pluginConfigs?.[PLUGIN]?.options?.idle_handover);
  } catch {
    return "off";
  }
}

/** The mode picked for this window (<key>.idle.json beside the relay's state file), or null for none. */
export function windowIdleMode(relayDir: string, key: string): IdleMode | null {
  try {
    const m = JSON.parse(readFileSync(windowPath(relayDir, key), "utf8"))?.mode;
    return (IDLE_MODES as readonly string[]).includes(m) ? (m as IdleMode) : null;
  } catch {
    return null;
  }
}

/** Picks a mode for this window. The relay reads the file on its next idle check, within 30 seconds. */
export function setWindowIdleMode(relayDir: string, key: string, mode: IdleMode): void {
  const path = windowPath(relayDir, key);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ mode, at: Date.now() }));
  renameSync(tmp, path);
}

/** Drops this window's pick, so the plugin option stands again. */
export function clearWindowIdleMode(relayDir: string, key: string): void {
  try {
    unlinkSync(windowPath(relayDir, key));
  } catch {
    // Already gone.
  }
}

/** The bar item shows only when the mode acts or warns; off is on the hover card alone. */
export const idleBarVisible = (mode: IdleMode) => mode !== "off";

export const idleText =(mode: IdleMode) => `$(clock) idle ${mode}`;
