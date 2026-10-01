/** A VS Code window: its extension host's pid and start (ms since 1970), or null when unknown. */
export interface HostWindow {
  pid: string | number;
  start?: number | null;
}

export type Budget = number | "unlimited";

export interface BudgetState {
  budget: Budget;
  used: number;
  left: number;
}

export const DEFAULT_BUDGET: number;
export function parseBudget(arg: unknown): Budget;
export function setBudget(root: string, win: HostWindow, budget: Budget, opts?: { now?: Date }): BudgetState | null;
export function readBudget(root: string, win: HostWindow): BudgetState | null;
export function budgetLabel(state: BudgetState | null): string;
export function nextBudget(state: BudgetState | null): Budget;
export function takeOne(root: string, win: HostWindow): BudgetState | null;
/** The file holding a window's budget, for a watcher. */
export function budgetFile(root: string, win: HostWindow): string;
