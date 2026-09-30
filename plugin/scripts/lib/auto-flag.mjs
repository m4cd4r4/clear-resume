// Whether opt-in auto mode is on. Kept free of imports: the PostToolUse and Stop
// hooks run after every tool call and every turn whether auto mode is on or not,
// and check this before importing anything else, so with it off they cost no
// more than starting node.
//
// Two places can turn it on. CLEAR_RESUME_AUTO, when set, wins. Otherwise the
// plugin option auto_nudge (set in /config or /plugin configure), which Claude
// Code passes to hooks as this variable only once the user has set it.
export const AUTO_OPTION = "CLAUDE_PLUGIN_OPTION_AUTO_NUDGE";
const ON = /^(1|true|on|yes)$/i;

export function autoEnabled(env = process.env) {
  const own = String(env.CLEAR_RESUME_AUTO ?? "").trim();
  if (own) return ON.test(own);
  return ON.test(String(env[AUTO_OPTION] ?? "").trim());
}

// Set by the headless runner (run.mjs) for every segment it starts.
export function headless(env = process.env) {
  return ON.test(String(env.CLEAR_RESUME_HEADLESS ?? "").trim());
}
