import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

// The same reading the relay applies: anything but toast, smart or auto is off.
export function parseIdleMode(raw: unknown): IdleMode {
  const s = String(raw ?? "off").trim().toLowerCase();
  return s === "toast" || s === "smart" || s === "auto" ? s : "off";
}

function readSettings(path: string): Record<string, any> | null {
  if (!existsSync(path)) return {};
  try {
    const j = JSON.parse(readFileSync(path, "utf8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/** idle_handover from the plugin's options in settings.json; off when unset or unreadable. */
export function readIdleMode(path = settingsPath()): IdleMode {
  return parseIdleMode(readSettings(path)?.pluginConfigs?.[PLUGIN]?.options?.idle_handover);
}

/**
 * Sets idle_handover and leaves every other key as it was. Returns false, and writes
 * nothing, when settings.json exists but cannot be read as an object: overwriting it
 * would lose the user's settings. The relay reads its options when a session starts,
 * so a running session keeps the mode it began with.
 */
export function writeIdleMode(mode: IdleMode, path = settingsPath()): boolean {
  const s = readSettings(path);
  if (!s) return false;
  const configs = s.pluginConfigs && typeof s.pluginConfigs === "object" ? s.pluginConfigs : {};
  const entry = configs[PLUGIN] && typeof configs[PLUGIN] === "object" ? configs[PLUGIN] : {};
  const options = entry.options && typeof entry.options === "object" ? entry.options : {};
  s.pluginConfigs = { ...configs, [PLUGIN]: { ...entry, options: { ...options, idle_handover: mode } } };
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n");
  renameSync(tmp, path);
  return true;
}

export const idleText = (mode: IdleMode) => `$(clock) idle ${mode}`;
