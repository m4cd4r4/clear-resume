// Pull what a session left on screen out of its transcript: tables, lists, links,
// paths, and the last replies verbatim. Deterministic, no model in the loop, so it
// cannot forget the way a handover written from memory does.
//
// Like the trail, the transcript is read backwards and the read stops at a byte or
// message cap, so a transcript of hundreds of MB costs the same as a small one. Every
// text is redacted before it is returned: these files are plain text on disk.
import { linesBackwards, redact } from "./trail.mjs";

const MAX_MESSAGES = 300;
const MAX_ITEM_CHARS = 8000;
const MIN_LIST_ITEMS = 4;
const CAPS = { table: 10, list: 10, link: 40, path: 40 };
const LAST_REPLIES = 2;
const LAST_SCREEN_CHARS = 40000;

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+\S/;
const URL_RE = /(?:\[([^\]\n]{1,120})\]\()?(https?:\/\/[^\s<>"'`)\]]+)/g;
const WIN_PATH = /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s"'`<>|*?()[\]]+/g;
// "~/x" is a path; "/x" alone is a slash command, so a rooted path needs two segments.
const POSIX_PATH = /(?<![\w:/.~-])(?:~\/(?:[\w.@+~-]+\/)*[\w.@+~-]+|\/(?:[\w.@+~-]+\/)+[\w.@+~-]+)/g;

const clip = (s, max = MAX_ITEM_CHARS) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
const trimTail = (s) => s.replace(/[.,;:!?]+$/, "");
const plain = (s) => s.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").replace(/[:：]\s*$/, "").trim();
const withoutFences = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (m) => m.replace(/[^\n]/g, ""));

/** The nearest line above `i` that says what the block is, or "". */
function titleAbove(lines, i) {
  for (let j = i - 1; j >= 0 && i - j <= 3; j--) {
    if (!lines[j].trim()) continue;
    if (TABLE_ROW.test(lines[j]) || LIST_ITEM.test(lines[j])) return "";
    return clip(plain(lines[j]), 100);
  }
  return "";
}

/** Tables and lists in one message's text: [{ kind, title, text }]. */
export function blocksOf(text) {
  const lines = withoutFences(String(text)).split("\n");
  const out = [];
  for (let i = 0; i < lines.length; ) {
    if (TABLE_ROW.test(lines[i]) && TABLE_RULE.test(lines[i + 1] ?? "")) {
      let j = i + 2;
      while (j < lines.length && TABLE_ROW.test(lines[j])) j++;
      const cells = lines[i].split("|").map(plain).filter(Boolean);
      out.push({ kind: "table", title: titleAbove(lines, i) || cells.slice(0, 4).join(" / ") || "Table", text: lines.slice(i, j).join("\n") });
      i = j;
    } else if (LIST_ITEM.test(lines[i])) {
      let j = i, items = 0;
      // A list runs over its own indented continuation lines, and over one blank line between items.
      while (j < lines.length) {
        if (LIST_ITEM.test(lines[j])) items++;
        else if (!(/^\s+\S/.test(lines[j]) || (!lines[j].trim() && LIST_ITEM.test(lines[j + 1] ?? "")))) break;
        j++;
      }
      if (items >= MIN_LIST_ITEMS) {
        const first = plain(lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
        out.push({ kind: "list", title: titleAbove(lines, i) || clip(first, 100), text: lines.slice(i, j).join("\n").trimEnd() });
      }
      i = Math.max(j, i + 1);
    } else i++;
  }
  return out;
}

/** Links and absolute paths in one message's text: [{ kind, title, text }]. */
export function referencesOf(text) {
  const out = [];
  const body = String(text);
  for (const m of body.matchAll(URL_RE)) {
    const url = trimTail(m[2]);
    let host = url;
    try { host = new URL(url).host; } catch { /* keep the whole text */ }
    out.push({ kind: "link", title: m[1] ? plain(m[1]) : host, text: url });
  }
  const bare = body.replace(URL_RE, " ");
  for (const re of [WIN_PATH, POSIX_PATH])
    for (const m of bare.matchAll(re)) out.push({ kind: "path", title: m[0].split(/[\\/]/).pop() || m[0], text: trimTail(m[0]) });
  return out;
}

const textOf = (content) => (Array.isArray(content) ? content.filter((b) => b?.type === "text").map((b) => b.text || "").join("\n") : "");

/**
 * What the transcript's last MAX_MESSAGES assistant messages left behind.
 * Returns { items: [{ kind, title, text, back }], lastScreen }. `back` is 1 for the last
 * message said before the clear. Never throws for a bad row; a missing file throws, and
 * the caller wraps it.
 */
export function extractArtifacts(file, { maxBytes } = {}) {
  const items = [], seen = new Set(), counts = { table: 0, list: 0, link: 0, path: 0 };
  const replies = [];
  const results = new Map();
  let back = 0, lastId = null;
  const add = (it, at) => {
    const key = `${it.kind}|${it.text.toLowerCase()}`;
    if (seen.has(key) || counts[it.kind] >= CAPS[it.kind]) return;
    seen.add(key);
    counts[it.kind]++;
    items.push({ kind: it.kind, title: clip(redact(it.title), 100), text: clip(redact(it.text)), back: at });
  };
  for (const line of linesBackwards(file, maxBytes)) {
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const content = row?.message?.content;
    if (!Array.isArray(content)) continue;
    if (row.type === "user") {
      for (const b of content) if (b?.type === "tool_result" && b.tool_use_id) results.set(b.tool_use_id, !b.is_error);
      continue;
    }
    if (row.type !== "assistant") continue;
    // A message may arrive as several rows, one per content block, all with one id.
    const id = row.message.id ?? row.uuid ?? null;
    const text = textOf(content);
    for (const b of content) {
      if (b?.type === "tool_use" && b.name === "Write" && results.get(b.id) === true && b.input?.file_path)
        add({ kind: "path", title: `written: ${String(b.input.file_path).split(/[\\/]/).pop()}`, text: String(b.input.file_path).replace(/\\/g, "/") }, back || 1);
    }
    if (!text.trim()) continue;
    if (id === null || id !== lastId) back++;
    lastId = id;
    if (back > MAX_MESSAGES) break;
    if (replies.length < LAST_REPLIES || replies.at(-1)?.back === back) {
      const prior = replies.at(-1);
      if (prior?.back === back) prior.text = text + "\n\n" + prior.text;
      else replies.push({ back, text });
    }
    for (const b of [...blocksOf(text), ...referencesOf(text)]) add(b, back);
  }
  const lastScreen = replies
    .reverse()
    .map((r) => `## ${r.back === 1 ? "Last reply" : `Reply ${r.back} back`}\n\n${r.text.trim()}`)
    .join("\n\n---\n\n");
  return { items, lastScreen: lastScreen ? clip(redact(lastScreen), LAST_SCREEN_CHARS) + "\n" : "" };
}
