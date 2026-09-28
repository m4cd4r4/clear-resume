// One-time, idempotent, additive import of the two legacy handover locations into
// the unified store. It NEVER deletes or rewrites an original file.
//
//   ~/Notes/resume/*.txt          the resume prompt, status in the filename
//   ~/.claude/handoffs/*.md       the handover body, named by the prompt's first line
//   ~/Notes/resume/index.jsonl    repo path, pid and session for the runs it covers
//
// The .txt files are the spine: each one names its own body file, so a prompt with
// no index row still imports. Bodies with no prompt are NOT swept in - most of the
// ~/.claude/handoffs archive predates this flow and would bury the tree.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { normalisePath } from "./schema.mjs";
import { exists, recordIdFor, save, storeRoot } from "./store.mjs";

// "Acme 09-19 2308 Portal gen [ACTIONED].txt"
const NAME = /^(.+?)\s+(\d{2})-(\d{2})\s+(\d{4})\s+(.*?)(\s*\[ACTIONED\])?\.txt$/;
const BODY_REF = /Resume from handover:\s*(\S+\.md)/i;

/**
 * A stable numeric stand-in for the pid, derived from the source filename.
 *
 * The real pid is missing for the ~250 prompts written before index.jsonl existed,
 * and the filename timestamp is only minute-resolution - so two handovers written
 * in the same minute produced the same id and the second silently overwrote the
 * first. Hashing the filename makes the id 1:1 with the source file, which keeps
 * the import both lossless and idempotent.
 */
function legacyPid(relPath) {
  return String(parseInt(createHash("sha1").update(relPath).digest("hex").slice(0, 8), 16));
}

export function parseName(file) {
  const m = NAME.exec(file);
  if (!m) return null;
  return {
    project: m[1].toLowerCase(),
    month: m[2],
    day: m[3],
    hhmm: m[4],
    title: m[5].trim() || m[1],
    actioned: Boolean(m[6]),
  };
}

/** Local wall-clock in the filename -> an instant. The year is not in the name, so
 * it comes from the file's own mtime, which is written at the same moment. */
function createdAt(parsed, mtime) {
  const year = mtime.getFullYear();
  const d = new Date(year, Number(parsed.month) - 1, Number(parsed.day), Number(parsed.hhmm.slice(0, 2)), Number(parsed.hhmm.slice(2)));
  return Number.isNaN(d.getTime()) ? mtime : d;
}

function readIndex(notesDir) {
  const byFile = new Map();
  const projectPaths = new Map();
  const path = join(notesDir, "index.jsonl");
  if (!existsSync(path)) return { byFile, projectPaths };
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.file) byFile.set(row.file, row);
    // Later rows win: the newest known checkout for a project is the best guess
    // for the prompts that have no index row of their own.
    if (row.project && row.cwd) projectPaths.set(String(row.project).toLowerCase(), normalisePath(row.cwd));
  }
  return { byFile, projectPaths };
}

/**
 * Every prompt file, top level plus the `archive/` subfolder the old flow moved
 * loaded handovers into. Missing that subfolder loses 250 of the 519 records here,
 * so the walk is explicit rather than a top-level readdir.
 */
function promptFiles(notesDir) {
  const out = [];
  const scan = (sub, archived) => {
    const dir = sub ? join(notesDir, sub) : notesDir;
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".txt")) continue;
      out.push({ file, relPath: sub ? `${sub}/${file}` : file, archived });
    }
  };
  scan("", false);
  scan("archive", true);
  return out;
}

export function migrate({ notesDir, root = storeRoot(), machine = "legacy" } = {}) {
  const report = { imported: 0, alreadyPresent: 0, skipped: 0, missingBody: 0, unparsed: [] };
  if (!existsSync(notesDir)) return report;
  const { byFile, projectPaths } = readIndex(notesDir);

  for (const { file, relPath, archived } of promptFiles(notesDir)) {
    const parsed = parseName(file);
    if (!parsed) {
      report.unparsed.push(relPath);
      continue;
    }
    const txtPath = join(notesDir, relPath);
    const prompt = readFileSync(txtPath, "utf8").trim();
    if (!prompt) {
      report.skipped += 1;
      continue;
    }

    // An [ACTIONED] suffix is dropped from the indexed filename, so look both up.
    const row = byFile.get(file) || byFile.get(file.replace(" [ACTIONED]", ""));
    const bodyPath = row?.path || BODY_REF.exec(prompt)?.[1];
    let body = "";
    if (bodyPath && existsSync(bodyPath)) body = readFileSync(bodyPath, "utf8").trim();
    if (!body) {
      // The body is gone or was never written. The prompt is still a usable
      // handover on its own, so import it rather than losing the record.
      body = prompt;
      report.missingBody += 1;
    }

    const repoPath = row?.cwd ? normalisePath(row.cwd) : projectPaths.get(parsed.project) || `unknown:/${parsed.project}`;

    const createdIso = row?.ts ? new Date(row.ts) : createdAt(parsed, statSync(txtPath).mtime);

    // Import once and only once. A second run must not reset a status or a pin the
    // user has changed since, so an existing id is left completely alone.
    const pid = legacyPid(relPath);
    if (exists(recordIdFor({ machine, pid, createdAt: createdIso }), root)) {
      report.alreadyPresent += 1;
      continue;
    }

    save(
      {
        title: parsed.title,
        body,
        resumePrompt: prompt,
        repo: parsed.project,
        repoPath,
        branch: "",
        machine,
        pid,
        legacyPid: row?.pid ? String(row.pid) : "",
        createdAt: createdIso,
        status: parsed.actioned || archived ? "archived" : "waiting",
        archivedAt: parsed.actioned || archived ? createdIso : undefined,
        source: "notes-resume",
        legacyPromptPath: normalisePath(txtPath),
        legacyBodyPath: bodyPath ? normalisePath(bodyPath) : "",
      },
      { root },
    );
    report.imported += 1;
  }
  return report;
}
