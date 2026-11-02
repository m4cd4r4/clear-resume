// Carrying a Claude Code install over from the old plugin name. The store moves by itself
// (packages/store/rename.mjs); this is what lives in the person's own settings.json.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { firstToday, resolveStore } from "../../packages/store/rename.mjs";

const OLD_MARKETPLACE = "clear-resume";
const OLD_ID = "clear-resume@clear-resume";
const NEW_ID = "cornerman@cornerman";

export const configDir = (env = process.env) => env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

/** A session-start line while the old plugin is on: both would run at every session start. */
export function oldPluginNotice({ env = process.env, now = new Date() } = {}) {
  if (env.CORNERMAN_NO_MIGRATE || process.env.CORNERMAN_NO_MIGRATE) return "";
  if (!upgradeSettings({ env, write: false }).oldPluginOn || !firstToday(resolveStore(env), now, "old-plugin-notice")) return "";
  const script = fileURLToPath(new URL("../upgrade.mjs", import.meta.url));
  return `cornerman: the old clear-resume plugin is still on, and it deletes the text of handovers archived for over 30 days. Remove it soon. Run this first, because removing it deletes its options: node "${script}"`;
}

/** What the person reads after an upgrade run: what happened, then what is theirs to do. */
export function upgradeReport(result, dir) {
  const settings = join(dir, "settings.json");
  if (result.unreadable) return `cornerman: ${settings} could not be read, so nothing was changed. Fix it and run this again.`;
  const lines = [result.copied ? `Copied the clear-resume plugin options to cornerman in ${settings}.` : "No plugin options to copy."];
  if (result.allowRules.length) lines.push(`Replace these permission rules in ${settings} with the cornerman name:`, ...result.allowRules.map((rule) => `  ${rule}`));
  if (result.envNames.length) lines.push("These variables keep working. Rename them to CORNERMAN_ when you next edit them:", ...result.envNames.map((name) => `  ${name}`));
  if (result.oldPluginOn) lines.push("Remove the old plugin, then restart Claude Code:", `  claude plugin uninstall ${OLD_ID}`, `  claude plugin marketplace remove ${OLD_MARKETPLACE}`);
  return lines.join("\n");
}

/** Copy the old plugin's options across if the new plugin has none. Nothing else in the file is touched. */
export function upgradeSettings({ env = process.env, configDir: dir = configDir(env), write = true } = {}) {
  const path = join(dir, "settings.json");
  let settings = {};
  let unreadable = false;
  try {
    settings = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    unreadable = error.code !== "ENOENT";
  }
  const options = settings.pluginConfigs?.[OLD_ID];
  const copied = write && Boolean(options) && !settings.pluginConfigs[NEW_ID];
  if (copied) {
    settings.pluginConfigs[NEW_ID] = options;
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    renameSync(tmp, path);
  }
  const oldVars = (names) => names.filter((name) => name.startsWith("CLEAR_RESUME_"));
  return {
    copied,
    oldPluginOn: settings.enabledPlugins?.[OLD_ID] === true,
    allowRules: (settings.permissions?.allow ?? []).filter((rule) => String(rule).includes("clear-resume")),
    envNames: [...new Set(oldVars([...Object.keys(settings.env ?? {}), ...Object.keys(env)]))],
    ...(unreadable ? { unreadable } : {}),
  };
}
