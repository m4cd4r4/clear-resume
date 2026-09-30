// /clear-resume:auto <off|on|unlimited|n>: how many times this VS Code window may
// hand over and have the clear-resume extension open the next conversation by
// itself. The budget belongs to the window, not the session, so it survives each
// continue and runs down across them.
import { budgetLabel, parseBudget, readBudget, setBudget } from "../../packages/store/autobudget.mjs";
import { hostWindow, PATIENT_TIMEOUT_MS } from "./owner.mjs";
import { storeRoot } from "./store.mjs";

export function runAuto(args, { env = process.env, win } = {}) {
  // Only the extension opens the next conversation. Anywhere else a budget would
  // promise a continue that never comes.
  if (env.CLAUDE_CODE_ENTRYPOINT !== "claude-vscode") {
    return { ok: false, text: "Auto-continue works only in the VS Code extension, with the clear-resume extension installed. Nothing was set." };
  }
  let budget;
  try {
    budget = args.length ? parseBudget(args.join(" ")) : null;
  } catch (err) {
    return { ok: false, text: err.message };
  }
  const window = win ?? hostWindow(env, { timeout: PATIENT_TIMEOUT_MS });
  if (!window) return { ok: false, text: "Could not tell which window this is, so nothing was set." };
  const root = storeRoot(env);
  const state = budget == null ? readBudget(root, window) : setBudget(root, window, budget);
  return { ok: true, text: `clear-resume ${budgetLabel(state)} in this window.` };
}
