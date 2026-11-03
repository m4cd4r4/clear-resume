// Whether auto mode is on, which it is unless turned off. Kept free of imports: the PostToolUse and Stop
// hooks run after every tool call and every turn whether auto mode is on or not,
// and check this before importing anything else, so with it off they cost no
// more than starting node. An unset option is not exported to hooks, so the
// defaults in plugin.json have to be applied here too.
//
// Two places can turn it on. CORNERMAN_AUTO, when set, wins. Otherwise the
// plugin option auto_nudge (set in /config or /plugin configure), which Claude
// Code passes to hooks as this variable only once the user has set it.
export const AUTO_OPTION = "CLAUDE_PLUGIN_OPTION_AUTO_NUDGE";
const ON = /^(1|true|on|yes)$/i;

export function autoEnabled(env = process.env) {
  const own = String(env.CORNERMAN_AUTO ?? "").trim();
  if (own) return ON.test(own);
  const set = String(env[AUTO_OPTION] ?? "").trim();
  return set ? ON.test(set) : true;
}

// The plugin option relay: the hooks/relay.ts mod clears and continues after a
// save. Unset is on (the default, 3 clears), "off" is off, a positive whole number
// or "unlimited" is on; anything else is off, as it is in the mod. Only whether it is on matters here: the mod keeps the count.
export const RELAY_OPTION = "CLAUDE_PLUGIN_OPTION_RELAY";

export function relayOn(env = process.env) {
  const s = String(env[RELAY_OPTION] ?? "").trim().toLowerCase();
  if (s === "" || s === "unlimited") return true;
  const n = Number(s);
  return Number.isInteger(n) && n > 0;
}

// Set by the headless runner (run.mjs) for every segment it starts.
export function headless(env = process.env) {
  return ON.test(String(env.CORNERMAN_HEADLESS ?? "").trim());
}
