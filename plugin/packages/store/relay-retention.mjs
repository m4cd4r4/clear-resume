// Relay retention (docs/no-bloat/PROJECT-PLAN.md, wave 2): the relay mod writes one
// <store>/relay/<key>.json per window it ever ran in, and nothing removed them (1,447
// on 2026-11-07). The decisions are plain functions; pruneRelay runs them over the
// folder, and scripts/retention.mjs is the detached job that calls it once a day.
// Rule 1: only files the mod wrote are touched. Claude Code's sessions folder is read,
// never written. Rule 2: a window's ledger line is on disk before its file goes.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// The mod's key: Date.now() in base 36, a dash, up to six random base-36 characters
// (plugin/hooks/relay.ts). Anything else in the folder is not a window file.
const KEY = /^[0-9a-z]{6,11}-[0-9a-z]{1,6}$/;

export const DAY_MS = 86_400_000;
/** The plan's 14 days (TODO 17.2 said 30; the plan wins). */
export const IDLE_MS = 14 * DAY_MS;

/**
 * "live" when one of Claude Code's live sessions is in the window's chain, "recent"
 * when the window or one of its asks (the `at` of <key>.set/.nudge/.idle/.handover.json)
 * changed in the last 14 days, else "due".
 */
export function verdict(w, { asks, live, now }) {
  if (w.sessions.some((id) => live.has(id))) return "live";
  const last = Math.max(w.updatedAt, ...asks.filter((a) => typeof a === "number"));
  return now - last >= IDLE_MS ? "due" : "recent";
}

/** The folder's last name, whichever separator the cwd was written with. */
export const repoOf = (cwd) => String(cwd ?? "").split(/[/\\]+/).filter(Boolean).pop() ?? "";

/** Rule 2: the one line a window leaves in the ledger before its file goes. */
export function ledgerLine(w, now) {
  const born = parseInt(w.key.split("-")[0], 36);
  return JSON.stringify({
    v: 1, kind: "relay", key: w.key, repo: repoOf(w.cwd), cwd: w.cwd, sessions: w.sessions.length,
    used: w.used ?? 0, limit: w.limit ?? 0, applied: w.applied ?? 0,
    firstAt: Number.isFinite(born) ? born : null, lastAt: w.updatedAt, deletedAt: now,
  });
}

/** The ledger file a window goes to: the month it last changed, local time, so a rerun finds its line. */
export function ledgerMonth(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The window in `<key>.json`, or undefined for a file that is not the mod's or does not parse. */
export function windowFrom(name, text) {
  if (!name.endsWith(".json")) return undefined;
  const key = name.slice(0, -".json".length);
  if (!KEY.test(key)) return undefined;
  try {
    return windowValue(key, JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** The window when an already-parsed `<key>.json` is the mod's: its key shape, v 1, and the key it is named for. */
export function windowValue(key, w) {
  return KEY.test(key) && w && w.v === 1 && w.key === key && typeof w.updatedAt === "number" && Array.isArray(w.sessions) ? w : undefined;
}

/** Rule 3: the job runs at most once a day; <store>/relay/.retention-ran holds when it last started, then who. */
export const MARKER = ".retention-ran";
export const LOCK = ".retention-lock";
export const RUN_EVERY_MS = DAY_MS;

/** No marker, a bad one, one a day old, or one from the future (the clock moved back): due. */
export function isDue(markerText, now) {
  const last = Number(String(markerText ?? "").trim().split(/\s+/)[0]);
  return !String(markerText ?? "").trim() || !Number.isFinite(last) || last > now || now - last >= RUN_EVERY_MS;
}

// What the status bar writes beside a window: its asks, each holding { at }.
const ASKS = [".set.json", ".nudge.json", ".idle.json", ".handover.json"];

const readText = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    return e?.code === "ENOENT" ? "" : undefined;
  }
};

/**
 * The session ids Claude Code holds live: one <pid>.json per running process in its
 * sessions folder. No folder is no live session; a folder that cannot be read throws,
 * so the run deletes nothing. A record left by a crashed process only keeps a window
 * longer, which is the safe way to be wrong.
 */
export function liveSessionIds(sessionsDir) {
  let names;
  try {
    names = readdirSync(sessionsDir);
  } catch (e) {
    if (e?.code === "ENOENT") return new Set();
    throw e;
  }
  const ids = new Set();
  for (const n of names) {
    if (!/^\d+\.json$/.test(n)) continue;
    try {
      const id = JSON.parse(readFileSync(join(sessionsDir, n), "utf8"))?.sessionId;
      if (typeof id === "string") ids.add(id);
    } catch {
      // half-written or gone since the listing
    }
  }
  return ids;
}

/** The keys (`key@lastAt`) of the ledger lines that parse; a torn line is skipped. */
export function ledgerKeys(text) {
  const keys = new Set();
  for (const line of String(text ?? "").split("\n")) {
    try {
      const v = JSON.parse(line);
      if (v?.kind === "relay" && typeof v.key === "string" && typeof v.lastAt === "number") keys.add(`${v.key}@${v.lastAt}`);
    } catch {
      // torn or blank
    }
  }
  return keys;
}

/**
 * One pass over the relay folder. `dryRun` reads only and lists what would go.
 * `remove` is unlinkSync, swappable so a test can make a file refuse to go.
 */
export function pruneRelay({ relayDir, sessionsDir, ledgerDir, now, dryRun = false, remove = unlinkSync }) {
  const report = { windows: 0, live: 0, recent: 0, due: [], ledgered: 0, deleted: 0, failed: 0 };
  const live = liveSessionIds(sessionsDir);
  const names = new Set(readdirSync(relayDir));
  const byMonth = new Map();
  for (const name of names) {
    const text = readText(join(relayDir, name));
    const w = text && windowFrom(name, text);
    if (!w) continue;
    report.windows++;
    const asks = ASKS.filter((s) => names.has(w.key + s)).map((s) => {
      try {
        return JSON.parse(readText(join(relayDir, w.key + s)) ?? "")?.at;
      } catch {
        return undefined;
      }
    });
    const v = verdict(w, { asks, live, now });
    if (v !== "due") {
      report[v]++;
      continue;
    }
    report.due.push({ key: w.key, cwd: w.cwd, lastAt: w.updatedAt });
    const month = ledgerMonth(w.updatedAt);
    byMonth.set(month, [...(byMonth.get(month) ?? []), { w, text }]);
  }
  if (dryRun) return report;
  for (const [month, due] of byMonth) {
    const path = join(ledgerDir, `${month}.jsonl`);
    const before = readText(path);
    // There but unreadable: its lines cannot be checked, so nothing of this month goes.
    if (before === undefined) continue;
    const have = ledgerKeys(before);
    const fresh = due.filter(({ w }) => !have.has(`${w.key}@${w.updatedAt}`));
    if (fresh.length) {
      try {
        mkdirSync(ledgerDir, { recursive: true });
        // A crash may have torn the last line: end it, so the next line stands alone.
        const lead = before && !before.endsWith("\n") ? "\n" : "";
        appendFileSync(path, lead + fresh.map(({ w }) => ledgerLine(w, now) + "\n").join(""));
      } catch {
        continue;
      }
    }
    // Read back: only a window whose line is on disk now is deleted.
    const onDisk = ledgerKeys(readText(path));
    for (const { w, text } of due) {
      if (!onDisk.has(`${w.key}@${w.updatedAt}`)) continue;
      if (!have.has(`${w.key}@${w.updatedAt}`)) report.ledgered++;
      // A window written to since it was judged is in use again: it stays.
      if (readText(join(relayDir, `${w.key}.json`)) !== text) continue;
      try {
        for (const s of ASKS) if (names.has(w.key + s)) remove(join(relayDir, w.key + s));
        remove(join(relayDir, `${w.key}.json`));
      } catch {
        // Locked or read-only: its line stays, and the next run tries again without a second one.
      }
      if (existsSync(join(relayDir, `${w.key}.json`))) report.failed++;
      else report.deleted++;
    }
  }
  return report;
}
