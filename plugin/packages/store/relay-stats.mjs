// Relay stats (docs/no-bloat/PROJECT-PLAN.md, wave 3): what /cornerman:stats and the
// sidebar's "This month" show. The ledger only holds a window once it has been idle 14
// days and its file deleted, so this month's numbers come mostly from the live relay
// files: both are read, and a window in both counts once, as its live file says.
// Read only: nothing here writes under the store.
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ledgerMonth, repoOf, windowFrom, windowValue } from "./relay-retention.mjs";

/** The month a window is counted under: the one its last change fell in, local time. */
export { ledgerMonth };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A ledger file's name: the month its windows last changed, local time. */
const LEDGER_FILE = /^\d{4}-\d{2}\.jsonl$/;

const count = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * The windows in ledger text, one per line written by ledgerLine. A line that does not
 * parse, is not `kind: "relay"` or is not `v: 1` is skipped. `used` is the relays;
 * `applied` is a timestamp and is not read.
 */
export function ledgerWindows(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    let v;
    try {
      v = JSON.parse(line);
    } catch {
      continue;
    }
    if (!v || v.v !== 1 || v.kind !== "relay" || typeof v.key !== "string" || typeof v.lastAt !== "number") continue;
    out.push({ key: v.key, repo: typeof v.repo === "string" ? v.repo : repoOf(v.cwd), sessions: count(v.sessions), relays: count(v.used), at: v.lastAt });
  }
  return out;
}

/** A live relay file (<store>/relay/<key>.json, as windowFrom takes it) in the same shape. */
export function liveWindow(w) {
  return { key: w.key, repo: repoOf(w.cwd), sessions: w.sessions.length, relays: count(w.used), at: w.updatedAt };
}

/**
 * Per month (`YYYY-MM`, local time), per repo: `{ windows, sessions, relays }`.
 * `ledgers` is ledger text, one string per file; `live` the relay files that passed
 * windowFrom. A key in both counts once, from its live file; a key twice in the
 * ledger counts once, from its latest line. `parsed` is ledger text already run
 * through ledgerWindows, for a caller that keeps it between reads.
 */
export function relayStats({ ledgers = [], parsed = [], live = [] }) {
  const byKey = new Map();
  for (const rows of [...ledgers.map(ledgerWindows), ...parsed]) {
    for (const w of rows) {
      const had = byKey.get(w.key);
      if (!had || w.at > had.at) byKey.set(w.key, w);
    }
  }
  for (const w of live) byKey.set(w.key, liveWindow(w));
  const months = new Map();
  for (const w of byKey.values()) {
    const month = ledgerMonth(w.at);
    let repos = months.get(month);
    if (!repos) months.set(month, (repos = new Map()));
    const repo = w.repo || "unknown";
    const r = repos.get(repo) ?? { windows: 0, sessions: 0, relays: 0 };
    r.windows++;
    r.sessions += w.sessions;
    r.relays += w.relays;
    repos.set(repo, r);
  }
  return months;
}

/** One month's repos, most relays first, then by name; and their total. */
export function monthRows(stats, month) {
  const repos = [...(stats.get(month) ?? new Map())].map(([repo, r]) => ({ repo, ...r }));
  repos.sort((a, b) => b.relays - a.relays || (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0));
  const total = repos.reduce((t, r) => ({ windows: t.windows + r.windows, sessions: t.sessions + r.sessions, relays: t.relays + r.relays }), { windows: 0, sessions: 0, relays: 0 });
  return { repos, total };
}

/** The month before `month` (`YYYY-MM`). */
export function previousMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** "November 2026". */
export function monthName(month) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "1 relay", "52 relays". */
export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Most repos the sidebar names under its counts. */
export const TOP_REPOS = 3;

/**
 * The sidebar's "This month": one line of counts, then the repos with the most relays
 * (at most three, none with no relays). Undefined when this month has no window, so
 * the section is left out.
 */
export function thisMonth(stats, now) {
  const { repos, total } = monthRows(stats, ledgerMonth(now));
  if (!total.windows) return undefined;
  return {
    counts: `${plural(total.windows, "window")} · ${plural(total.relays, "relay")} · ${plural(repos.length, "repo")}`,
    top: repos.filter((r) => r.relays > 0).slice(0, TOP_REPOS).map((r) => ({ repo: r.repo, relays: plural(r.relays, "relay") })),
  };
}

/** What /cornerman:stats prints: this month's table by repo with a total row, then the month before on one line. */
export function statsText(stats, now) {
  const month = ledgerMonth(now);
  const prev = previousMonth(month);
  const { repos, total } = monthRows(stats, month);
  const before = monthRows(stats, prev).total;
  const any = [...stats.values()].some((repos) => repos.size > 0);
  if (!any) return "cornerman stats: no relay windows yet.\n";
  const rows = [...repos, { repo: "total", ...total }];
  const cols = [["windows", "windows"], ["sessions", "sessions"], ["relays", "relays"]].map(([head, k]) => ({ head, k, width: Math.max(head.length, ...rows.map((r) => String(r[k]).length)) }));
  const nameWidth = Math.max("repo".length, ...rows.map((r) => r.repo.length)) + 3;
  const line = (name, cells) => (name.padEnd(nameWidth) + cells.map((c, i) => c.padStart(cols[i].width)).join("  ")).trimEnd();
  const out = [`cornerman stats, ${monthName(month)}`, "", line("repo", cols.map((c) => c.head))];
  for (const r of rows) out.push(line(r.repo, cols.map((c) => String(r[c.k]))));
  if (before.windows) out.push("", `${monthName(prev)}: ${plural(before.windows, "window")}, ${plural(before.relays, "relay")}`);
  return out.join("\n") + "\n";
}

/** The ledger file names under `ledgerDir`, oldest first; none when there is no folder. */
export function ledgerFiles(ledgerDir) {
  try {
    return readdirSync(ledgerDir).filter((n) => LEDGER_FILE.test(n)).sort();
  } catch {
    return [];
  }
}

const readOr = (path) => readFile(path, "utf8").catch(() => "");

// Files read at once. Read one at a time, 2,000 relay files took about 1.4 s on Windows;
// 64 at a time, about 0.45 s (2026-11-07). The cap keeps the open handles bounded.
const BATCH = 64;

async function readAll(paths) {
  const out = [];
  for (let i = 0; i < paths.length; i += BATCH) out.push(...(await Promise.all(paths.slice(i, i + BATCH).map(readOr))));
  return out;
}

/**
 * Read the store's ledger and live relay files. `months` (`YYYY-MM`) limits the
 * ledger files read; the live files are all read, since any of them may move a
 * window out of a ledger month.
 */
export async function readRelayStats({ store, months }) {
  const ledgerDir = join(store, "ledger");
  const relayDir = join(store, "relay");
  const want = months && new Set(months.map((m) => `${m}.jsonl`));
  const ledgers = await readAll(ledgerFiles(ledgerDir).filter((n) => !want || want.has(n)).map((n) => join(ledgerDir, n)));
  let names = [];
  try {
    names = readdirSync(relayDir);
  } catch {
    // no relay folder: no live windows
  }
  // <key>.json only; <key>.set.json and the other asks are not windows.
  names = names.filter((n) => n.endsWith(".json") && n.indexOf(".") === n.length - ".json".length);
  const texts = await readAll(names.map((n) => join(relayDir, n)));
  const live = names.map((n, i) => windowFrom(n, texts[i])).filter(Boolean);
  return relayStats({ ledgers, live });
}

/** The relay files the extension already holds, parsed, kept only where windowFrom would keep them. */
export function liveWindows(files) {
  return files.filter((f) => f && typeof f === "object" && typeof f.key === "string" && windowValue(f.key, f));
}
