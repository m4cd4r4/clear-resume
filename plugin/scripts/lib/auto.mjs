// /clear-resume:auto <off|on|unlimited|n>: how many times this VS Code window may
// hand over and have the clear-resume extension open the next conversation by
// itself. The budget belongs to the window, not the session, so it survives each
// continue and runs down across them.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { budgetLabel, parseBudget, readBudget, setBudget } from "../../packages/store/autobudget.mjs";
import { headless } from "./auto-flag.mjs";
import { givenWindow, hostWindow, PATIENT_TIMEOUT_MS } from "./owner.mjs";
import { slugify, storeRoot } from "./store.mjs";

// A terminal the extension opened carries its window in CLEAR_RESUME_WINDOW, so
// it counts as inside VS Code: the extension can continue it.
export const inVsCode = (env) => env.CLAUDE_CODE_ENTRYPOINT === "claude-vscode" || givenWindow(env) != null;

/**
 * The auto stamp for a save in an interactive session, or undefined for an
 * ordinary save. A save is an auto one only when the plugin asked for it (this
 * session was nudged), in VS Code, in a window with budget left: a /handover the
 * user runs mid-work must never open a conversation by itself. The cheap checks
 * come first; the window lookup reads the process table.
 */
export function interactiveAuto({ env = process.env, win, root = storeRoot(env) } = {}) {
  if (headless(env) || !inVsCode(env)) return undefined;
  const session = slugify(env.CLAUDE_CODE_SESSION_ID ?? "");
  if (!session || !existsSync(join(root, ".nudged", session))) return undefined;
  const auto = windowAuto({ env, win: win ?? hostWindow(env, { timeout: PATIENT_TIMEOUT_MS }), root });
  // Where the session ran, so the extension's "same" mode continues it there,
  // and the id of the terminal the extension opened for it, so that terminal
  // (and only that one) is closed after the continue.
  const surface = env.CLAUDE_CODE_ENTRYPOINT === "cli" ? "terminal" : "panel";
  const terminal = env.CLEAR_RESUME_TERMINAL;
  return auto && { ...auto, surface, ...(terminal ? { terminal } : {}) };
}

/**
 * This VS Code window's auto-continue stamp, `{ window, budget }`, when it has
 * budget left, else undefined. The nudge asks this to choose its text; a save
 * asks it (behind the nudged check) to choose its stamp. `win` may be a lookup
 * result of null, which reads as no budget.
 */
export function windowAuto({ env = process.env, win, root = storeRoot(env) } = {}) {
  if (headless(env) || !inVsCode(env) || !win) return undefined;
  const state = readBudget(root, win);
  if (!state || state.left <= 0) return undefined;
  const id = win.start != null ? `${win.pid}@${win.start}` : String(win.pid);
  // -1 is unlimited, as the headless runner writes it.
  return { window: id, budget: Number.isFinite(state.left) ? state.left : -1 };
}

export function runAuto(args, { env = process.env, win } = {}) {
  // Only the extension opens the next conversation. Anywhere else a budget would
  // promise a continue that never comes.
  if (!inVsCode(env)) {
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
