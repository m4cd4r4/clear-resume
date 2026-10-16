// The "Recent trail": what this session just did, read from its own transcript when a handover is saved.
//
// A handover written from memory says what the model remembers deciding. It does not reliably say which
// files were last touched or which commands were last run, and those are the first things a fresh session
// asks. So the trail is built mechanically from the transcript's tool calls and appended by save.mjs; the
// model never writes it and cannot get it wrong. Measured 2026-10-16 on 59 recall questions about 6 real
// sessions: a note without the last successful commands answered 0 of 17 questions about them, the full
// session 14 of 17.
//
// The transcript can be hundreds of MB, so it is read backwards in chunks and the read stops as soon as
// every list is full or MAX_BYTES have been read. Nothing here ever throws into a save: the caller wraps it.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

const CHUNK = 1024 * 1024;
const MAX_BYTES = 32 * 1024 * 1024;
const CAPS = { written: 5, edited: 5, read: 5, ran: 5, failed: 3 };
const CMD_CHARS = 100;

// Secrets must not reach a plain-text handover. This is a net for the common shapes, not a guarantee, and the
// handover skill still tells the model to keep secrets out.
const REDACTIONS = [
  [/\b(?:ghp_|gho_|ghs_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_-]{8,}/g, "***"],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-***"],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1***"],
  [/(Authorization:\s*)[^"'\n]+/gi, "$1***"],
  [/(--(?:token|password|passwd|secret|api-key|apikey)[= ]\s*)\S+/gi, "$1***"],
  [/(\b[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)[A-Za-z0-9_]*\s*=\s*)("[^"]*"|'[^']*'|\S+)/gi, "$1***"],
  [/(:\/\/[^:/\s]+:)[^@\s]+@/g, "$1***@"],
];

export function redact(text) {
  let out = String(text);
  for (const [re, to] of REDACTIONS) out = out.replace(re, to);
  return out;
}

const normalise = (p) => String(p || "").replace(/\\/g, "/");
const baseName = (p) => normalise(p).split("/").filter(Boolean).pop() || "";
// A path under the folder the session ran in is shown relative to it, anything else by its file name.
function relativePath(file, cwd) {
  const f = normalise(file), c = normalise(cwd).replace(/\/+$/, "");
  if (c && f.toLowerCase().startsWith(c.toLowerCase() + "/")) return f.slice(c.length + 1);
  return baseName(f);
}
function shortCommand(cmd) {
  const first = String(cmd || "").split("\n").find((l) => l.trim()) || "";
  const flat = redact(first.replace(/\s+/g, " ").trim());
  return flat.length > CMD_CHARS ? flat.slice(0, CMD_CHARS) + "..." : flat;
}
const textOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x?.text || "").join("") : "");
// The handover and load scripts are this plugin's own plumbing, not work the next session needs to know about.
const plumbing = (cmd) => /clear-resume[^\n]*[\\/](?:save|load)\.mjs/.test(String(cmd));

// Newest-first lines of a file, read from the end in CHUNK-sized pieces.
function* linesBackwards(file) {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    let pos = size, read = 0, carry = Buffer.alloc(0);
    while (pos > 0 && read < MAX_BYTES) {
      const n = Math.min(CHUNK, pos);
      pos -= n;
      const chunk = Buffer.alloc(n);
      readSync(fd, chunk, 0, n, pos);
      read += n;
      const buf = Buffer.concat([chunk, carry]);
      const nl = pos > 0 ? buf.indexOf(0x0a) : -1;
      let body = buf;
      if (nl >= 0) { carry = buf.subarray(0, nl); body = buf.subarray(nl + 1); } else if (pos > 0) { carry = buf; continue; } else carry = Buffer.alloc(0);
      const lines = body.toString("utf8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim()) yield lines[i];
    }
  } finally {
    closeSync(fd);
  }
}

/**
 * The last tool calls of a transcript, newest first: { written, edited, read, ran, failed }.
 * Files are shown by name. Measured 2026-10-16 on 59 recall questions about 6 real sessions: with names the
 * model answered all 42 file questions right, with paths relative to the session folder it swapped two
 * neighbouring names (title-chords.test.ts and title-chords.ts) in 3 of 4 draws. A path is shown only when
 * two different files in the same list share a name; paths: "relative" forces paths for every file.
 */
export function buildTrail(file, { paths = "name" } = {}) {
  const shortPath = (f, cwd) => ({ name: baseName(f), rel: relativePath(f, cwd) });
  const trail = { written: [], edited: [], read: [], ran: [], failed: [] };
  const results = new Map(), seen = new Set();
  const full = () => Object.keys(CAPS).every((k) => trail[k].length >= CAPS[k]);
  for (const line of linesBackwards(file)) {
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const content = row?.message?.content;
    if (!Array.isArray(content)) continue;
    if (row.type === "user") {
      for (const b of content) if (b?.type === "tool_result" && b.tool_use_id && !results.has(b.tool_use_id)) results.set(b.tool_use_id, { error: !!b.is_error, text: textOf(b.content).slice(0, 80) });
    } else if (row.type === "assistant") {
      for (let i = content.length - 1; i >= 0; i--) {
        const b = content[i];
        if (b?.type !== "tool_use" || !b.id || seen.has(b.id)) continue;
        seen.add(b.id);
        const res = results.get(b.id);
        if (!res) continue; // no result: still running when saved, or never answered
        const input = b.input || {};
        if (b.name === "Write" && !res.error) trail.written.push(shortPath(input.file_path, row.cwd));
        else if ((b.name === "Edit" || b.name === "MultiEdit") && !res.error) trail.edited.push(shortPath(input.file_path, row.cwd));
        else if (b.name === "Read" && !res.error) trail.read.push(shortPath(input.file_path, row.cwd));
        else if (b.name === "Bash" && !plumbing(input.command)) {
          const code = /^Exit code (\d+)/.exec(res.text);
          if (res.error && code) trail.failed.push({ cmd: shortCommand(input.command), code: code[1] });
          else if (!res.error) trail.ran.push(shortCommand(input.command));
        }
      }
    }
    if (full()) break;
  }
  for (const k of Object.keys(CAPS)) trail[k] = trail[k].slice(0, CAPS[k]);
  for (const k of ["written", "edited", "read"]) {
    const rels = new Map();
    for (const f of trail[k]) rels.set(f.name, new Set([...(rels.get(f.name) || []), f.rel]));
    trail[k] = trail[k].map((f) => (paths === "relative" || rels.get(f.name).size > 1 ? f.rel : f.name));
  }
  return trail;
}

const nums = (arr, f = (x) => x) => (arr.length ? arr.map((x, i) => `${i + 1}. ${f(x)}`).join("; ") : "none");
const code = (s) => "`" + s.replace(/`/g, "'") + "`";

/** The markdown section. Every list is numbered, 1 = the most recent, so "the 2nd latest" is a lookup. */
export function trailSection(trail) {
  return [
    "## Recent trail",
    // Keep this line short. A longer sentence here ("built from this session's tool calls, not written by hand")
    // made the model swap neighbouring file names in 4 of 6 draws; this exact line gave 6 of 6 right (2026-10-16).
    "Numbered, 1 = the most recent.",
    `- Written (Write tool), last ${CAPS.written}: ${nums(trail.written)}`,
    `- Edited (Edit tool), last ${CAPS.edited}: ${nums(trail.edited)}`,
    `- Read, last ${CAPS.read}: ${nums(trail.read)}`,
    `- Ran and succeeded (Bash), last ${CAPS.ran}: ${nums(trail.ran, code)}`,
    `- Failed commands, last ${CAPS.failed}: ${nums(trail.failed, (f) => `${code(f.cmd)} (exit ${f.code})`)}`,
    "",
  ].join("\n");
}

/** body with its "## Recent trail" section replaced by `section`, or the section appended when there is none. */
export function withTrail(body, section) {
  const text = String(body).replace(/\s+$/, "");
  const i = text.search(/^## Recent trail\s*$/m);
  if (i < 0) return text + "\n\n" + section;
  const rest = text.slice(i + 3), j = rest.search(/\n## /);
  return text.slice(0, i) + section + (j < 0 ? "" : "\n" + rest.slice(j + 1) + "\n");
}

/** true when every list is empty: there is nothing worth a section. */
export const emptyTrail = (t) => Object.keys(CAPS).every((k) => t[k].length === 0);
