export type MigrateResult = { state: "moved" | "merged" | "merging" | "done" | "fresh" | "pending" | "held" | "failed"; reason?: string };
export function resolveStore(env?: Record<string, string | undefined>, home?: string): string;
export function resolveHeadlessStore(home?: string): string;
export function adoptLegacyEnv(env?: Record<string, string | undefined>): void;
export function migrateStore(options?: { home?: string; retries?: number; mergeMs?: number; oldDir?: string; newDir?: string }): MigrateResult;
export function migrateHeadlessStore(options?: { home?: string; retries?: number; mergeMs?: number }): MigrateResult;
export function migrateOnStart(options?: { env?: Record<string, string | undefined>; home?: string; now?: Date }): string;
