import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The Spare Cycles mod's files. The mod owns the timer and writes state.json;
 * the extension only reads it, and writes the person's choice to action.json.
 * No `vscode` import here, so the tests load this module directly.
 */
export type SpareState = {
  version: 1;
  task: string;
  dueAt: number;
  isDue: boolean;
  lastAction: string | null;
  updatedAt: number;
};

export type SpareAction = "done" | "skip" | "snooze";

/** The folder the mod writes: ~/.spare-cycles. */
export const spareDir = (home = homedir()) => join(home, ".spare-cycles");

/** state.json's contents, or null for anything but a version 1 file with a task and a due time. */
export function parseState(text: string): SpareState | null {
  let s: unknown;
  try {
    s = JSON.parse(text);
  } catch {
    return null;
  }
  if (!s || typeof s !== "object") return null;
  const r = s as Record<string, unknown>;
  if (r.version !== 1 || typeof r.task !== "string" || !r.task || typeof r.dueAt !== "number" || !Number.isFinite(r.dueAt)) {
    return null;
  }
  return {
    version: 1,
    task: r.task,
    dueAt: r.dueAt,
    isDue: r.isDue === true,
    lastAction: typeof r.lastAction === "string" && r.lastAction ? r.lastAction : null,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
  };
}

/** The mod's current state, or null when state.json is missing, unreadable or not version 1. */
export function readState(dir = spareDir()): SpareState | null {
  try {
    return parseState(readFileSync(join(dir, "state.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Time left as m:ss, rounded up so it reads 0:00 only once the task is due. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Due once the mod says so or the clock has reached dueAt, whichever comes first. */
export const isDue = (state: SpareState, now: number) => state.isDue || state.dueAt <= now;

/** The status bar text: `$(watch) 1:42 Wash the dishes`, or `$(bell) Wash the dishes: now` once due. */
export function statusText(state: SpareState, now: number): string {
  return isDue(state, now) ? `$(bell) ${state.task}: now` : `$(watch) ${countdown(state.dueAt - now)} ${state.task}`;
}

/** action.json's contents for a choice made at `at`. */
export const actionJson = (action: SpareAction, at: number) => JSON.stringify({ action, at }) + "\n";
