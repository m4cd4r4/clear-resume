// What the VS Code status bar shows about a window's relay and context, worked
// out from the relay mod's state file (plugin/hooks/relay.ts) and the session
// transcripts. Pure: the extension does the reading and passes the data in.
import { normalisePath } from "./schema.mjs";

// The trailing separator is what stops "acme-two" counting as inside "acme".
function isUnder(path, roots) {
  return roots.some((root) => path === root || path.startsWith(root + "/"));
}

// This window's relay: the newest state file whose cwd is in one of the
// workspace folders. A reload writes a new file, so the newest is the live one.
export function pickWindow(files, roots) {
  const mine = roots.map(normalisePath);
  let best = null;
  for (const f of files) {
    if (!f || typeof f.cwd !== "string" || !isUnder(normalisePath(f.cwd), mine)) continue;
    if (!best || f.updatedAt > best.updatedAt) best = f;
  }
  return best;
}

// Claude Code's folder for a cwd's transcripts, under ~/.claude/projects.
export function projectDirName(cwd) {
  return String(cwd).replace(/[^A-Za-z0-9]/g, "-");
}

// One session's context use, read from its transcript a chunk at a time. The
// extension keeps the byte offset and feeds only what was appended since.
export function newUsage() {
  return { partial: "", seen: new Set(), calls: 0, sum: 0, first: null, last: null };
}

// Each main-thread assistant call once: one message spans several lines that
// repeat its usage, so they are deduped by message id. Context is input plus
// cache tokens, as in scripts/lib/nudge.mjs.
export function feedUsage(u, text) {
  const lines = (u.partial + text).split("\n");
  u.partial = lines.pop();
  for (const line of lines) {
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r?.type !== "assistant" || r.isSidechain) continue;
    const m = r.message;
    const t = m?.usage;
    if (!t || m.model === "<synthetic>") continue;
    if (m.id) {
      if (u.seen.has(m.id)) continue;
      u.seen.add(m.id);
    }
    const ctx = (t.input_tokens ?? 0) + (t.cache_creation_input_tokens ?? 0) + (t.cache_read_input_tokens ?? 0);
    u.calls++;
    u.sum += ctx;
    if (u.first === null) u.first = ctx;
    u.last = ctx;
  }
  return u;
}

// The chain's tokens, and an upper bound on what its clears saved: each clear
// drops the context from the last call before it to the first call after it
// (the before/after drop of scripts/measure.mjs), and every later call carries
// that much less. An upper bound, since without the clear the session might
// have compacted or ended sooner.
export function chainTotals(sessions) {
  let tokens = 0;
  let replies = 0;
  let saved = 0;
  let drop = 0;
  let prevLast = null;
  for (const s of sessions) {
    tokens += s.sum;
    replies += s.calls;
    if (!s.calls) continue;
    if (prevLast !== null) drop += Math.max(0, prevLast - s.first);
    saved += s.calls * drop;
    prevLast = s.last;
  }
  return { sessions: sessions.length, replies, tokens, saved };
}

export const k = (n) => `${Math.round(n / 1000)}k`;

const GLYPHS = ["○", "◔", "◑", "◕", "●"];

// The context pie: a glyph by the share of the nudge threshold, the colour
// level (amber from 80%, red at the threshold) and a five-cell bar for the hover.
export function pie(context, threshold) {
  const frac = threshold > 0 ? context / threshold : 0;
  const glyph = GLYPHS[Math.min(4, Math.round(frac * 4))];
  const cells = Math.min(5, Math.round(frac * 5));
  return {
    text: `${glyph} ${k(context)}/${k(threshold)}`,
    level: frac >= 1 ? "over" : frac >= 0.8 ? "warn" : "ok",
    bar: "▰".repeat(cells) + "▱".repeat(5 - cells),
  };
}

export function relayText({ limit, used }) {
  if (limit === 0) return "⟳ relay off";
  return `⟳ relay ${used}/${limit === Infinity ? "∞" : limit}`;
}

const PICKS = ["Off", "2", "3", "5", "10", "15", "Unlimited"];

// The picker's choices: what each writes to <key>.set.json as `limit`, and
// which is the window's budget now.
export function picks(current) {
  return PICKS.map((label) => {
    const limit = label.toLowerCase();
    return { label, limit, current: budget(limit) === current };
  });
}

function relayLine(r) {
  if (!r) return null;
  const when = r.pending ? " (takes effect after the next reply)" : "";
  if (r.limit === 0) return `Relay: off in this window${when}`;
  if (r.limit === Infinity) return `Relay: ${r.used} clears used, no cap${when}`;
  return `Relay: ${r.used} clears used, ${Math.max(0, r.limit - r.used)} left in this window${when}`;
}

// The pie's hover card, as Markdown. `links` holds command URIs; one left out
// is not shown.
export function hoverText({ context, threshold, relay, totals, links }) {
  const out = [`\`${pie(context, threshold).bar}\` ${k(context)} of ${k(threshold)} nudge`];
  const r = relayLine(relay);
  if (r) out.push(r);
  out.push(
    `This chain: ${k(totals.tokens)} tokens read over ${totals.replies} repl${totals.replies === 1 ? "y" : "ies"} in ${totals.sessions} session${totals.sessions === 1 ? "" : "s"}` +
      (totals.saved > 0 ? `, saved up to ~${k(totals.saved)} (an upper bound)` : ""),
  );
  const l = [];
  if (links.handover) l.push(`[Open handover](${links.handover})`);
  if (links.log) l.push(`[Relay log](${links.log})`);
  if (l.length) out.push(l.join(" · "));
  return out.join("\n\n");
}

// As budget() in relay.ts: "off" or unset is 0, "unlimited" has no cap, a
// number is that many clears.
export function budget(raw) {
  const s = String(raw ?? "off").trim().toLowerCase();
  if (s === "unlimited") return Infinity;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// What to show for the window. A choice written to <key>.set.json that the mod
// has not taken yet (it takes it at the end of the next turn) is shown already,
// with the count at 0 as the mod will start it, and marked pending.
export function effective(file, set) {
  if (set && typeof set.at === "number" && set.at > (file.applied ?? 0)) {
    return { limit: budget(set.limit), used: 0, pending: true };
  }
  return { limit: budget(file.limit), used: file.used ?? 0, pending: false };
}
