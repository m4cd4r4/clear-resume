// Whether opt-in auto mode is on. Kept free of imports: the PostToolUse and Stop
// hooks run after every tool call and every turn whether auto mode is on or not,
// and check this before importing anything else, so with it off they cost no
// more than starting node.
export function autoEnabled(env = process.env) {
  return /^(1|true|on|yes)$/i.test(String(env.CLEAR_RESUME_AUTO ?? "").trim());
}
