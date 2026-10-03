#!/usr/bin/env node
// Measure how much context the clear-resume plugin saves, from real Claude Code
// session transcripts on this machine. Node 18+, ESM, no dependencies.
//
// WHAT WE COUNT AS A "REAL LOAD"
// -------------------------------
// The string "clear-resume: loaded handover ..." shows up in a transcript in two
// ways: (1) as genuine SessionStart-hook output, or (2) inside ordinary
// conversation (someone discussing the plugin, a pasted transcript, tool output
// that happens to quote it). Only (1) is a real load.
//
// Genuine hook output lands in its own transcript record type, never inside a
// "user"/"assistant" message:
//   {"type":"attachment","attachment":{"type":"hook_system_message",
//    "content":"clear-resume: loaded handover \"...\" (saved Nm ago). ...",
//    "hookName":"SessionStart:clear","hookEvent":"SessionStart", ...}, ...}
// (There is also a companion "hook_success" record carrying the same text one
// level deeper inside a JSON-encoded stdout field, emitted by the SAME hook
// invocation. We do not need it: the hook_system_message record above is the
// rendered form and is the one that actually reaches the model / transcript
// reader, so matching it alone is sufficient and avoids double counting.)
//
// hookName tells us WHY SessionStart fired. The plugin's hooks.json registers
// itself for matcher "startup|clear|compact", so all three appear on disk:
//   SessionStart:startup  - a fresh terminal/window opened
//   SessionStart:clear    - the user ran /clear
//   SessionStart:compact  - auto-compaction fired mid-session (same file, not a
//                           new one)
// This script's brief is specifically "context just before /clear" vs "context
// in the fresh session right after resume", so a REAL LOAD here means
// hookName === "SessionStart:clear" only. startup/compact loads are real plugin
// activity too, but they are a different comparison (startup has no reliable
// preceding session to pair with; compact isn't a new session at all) and mixing
// them in would blur one clean number into three unlike ones. The count of
// excluded startup/compact loads is printed as a side note, never folded into
// the headline figures.
//
// HOW /clear APPEARS ON DISK
// ---------------------------
// /clear does not append a marker to the old file and keep going - it starts a
// brand-new session, i.e. a brand-new `<uuid>.jsonl` in the same project
// directory. Confirmed by inspecting real pairs (see below): the old file's last
// record and the new file's first record are typically 3-10 seconds apart, and
// the new file's very first SessionStart hook fires with hookName
// "SessionStart:clear". There is no shared id between the two files (their
// internal "bridgeSessionId" values differ), so pairing has to be done by
// chronological adjacency, not by a foreign key.
//
// PAIRING RULE (the load's session <-> the session that got /cleared)
// ---------------------------------------------------------------------
// For each SessionStart:clear load, found in file F with first-record timestamp
// T_F, in project directory D:
//   1. Look at every OTHER top-level *.jsonl file in D.
//   2. Keep candidates whose own last-record timestamp is <= T_F.
//   3. Among those, take the one with the latest last-record timestamp (the
//      closest-preceding file) that also has at least one main-chain assistant
//      turn with usage (a file that was opened and immediately /cleared with no
//      exchange has nothing to measure "before" from, so it is skipped in favour
//      of the next-closest file that does).
//   4. If (T_F - that candidate's last-record timestamp) <= GAP_MAX_MS, the pair
//      is confident. GAP_MAX_MS is set to 120s: every real pair inspected by
//      hand during development had a gap of 3-10s (hook-fire + file-create
//      overhead), so 120s is a >10x margin while still being tight enough that a
//      coincidentally-adjacent, unrelated concurrent session in the same
//      directory would not pass it by chance.
//   5. Otherwise the load is UNPAIRED and excluded from the before/after/drop
//      figures (but still counted in "number of real loads").
// "before" = total context of the LAST main-chain assistant turn (isSidechain
// === false) in the paired predecessor file. "after" = total context of the
// FIRST main-chain assistant turn in the new (post-/clear) file - this already
// reflects the injected handover, because SessionStart hooks run before any
// assistant turn.
//
// CAVEAT: this pairing is chronological-adjacency, not a hard link. If two
// unrelated sessions in the very same project directory happened to end within
// GAP_MAX_MS of each other, and the wrong one is closer to T_F, this would
// mis-pair. Given the observed real gaps (3-10s) and that GAP_MAX_MS is only
// 120s, this is unlikely to matter in aggregate, but it is chronological
// evidence, not proof.
//
// CONTEXT SIZE
// ------------
// Per turn: input_tokens + cache_creation_input_tokens + cache_read_input_tokens
// from that assistant record's message.usage. This is the size of the input
// context delivered to the model for that turn (system prompt + everything
// prior + the new user turn), which is exactly what "context size" means here.
//
// BASELINE (the plugin's own overhead) - MEASURED, BUT NOT RELIABLE, READ THIS
// -------------------------------------------------------------------------
// To say how much of "after" is the handover text itself (as opposed to just the
// ordinary cost of a fresh session - system prompt, project CLAUDE.md, etc.), we
// need a control: the first-turn context of sessions in the SAME projects, on the
// SAME trigger (sessionStartReason === "clear"), that had no handover to load
// (anyLoad === false). "Same projects" = any project directory that had at least
// one genuine SessionStart:clear load (paired or not).
//
// This control comes out HIGHER than "after" (a negative overhead), which reads
// as "loading a handover makes the session cheaper" - not a real effect.
//
// An earlier version of this comment blamed prompt-cache prefix invalidation
// (the idea being that a changed early-prompt hook line forces a fresh, larger
// cache_creation downstream). That explanation was wrong and has been retracted:
// CONTEXT SIZE (input + cache_creation + cache_read, see above) counts every
// token delivered to the model for the turn regardless of whether it came from
// a cache hit or a cache miss - caching changes which bucket the tokens land in
// and what the turn costs in dollars, never the total. A cache-hit/miss theory
// cannot explain a difference in the SIZE number this script reports.
//
// The real, measured cause (compared first-real-user-message length and
// SessionStart-hook-output length between the two groups, same projects, same
// "clear" trigger): baseline (no-handover) sessions' first real user message has
// a median of ~1,912 characters, versus ~2 characters for handover-loaded
// sessions - while the loaded sessions' injected hook content (the handover
// itself, see HANDOVER SIZE below) has a median of ~3,764 characters against
// ~0 for the no-handover group. In other words: without a handover to load, the
// human is still doing the SAME job of restating "what was I doing" by hand, in
// their own first message, exactly the manual pasted-resume workflow that
// predates this plugin. That confirms the baseline is not "a plain fresh
// session" at all - it is "a fresh session where the user just typed the recap
// instead of the plugin injecting one". This alone (a few hundred to ~1-2k
// characters either way) is real but too small to explain the full ~30k-token
// gap between the two groups' medians; the rest of the gap most likely reflects
// the wider, older time span the baseline pool is drawn from (it spans back to
// before this plugin existed, months of CLAUDE.md/rules/skill-catalog growth
// earlier or later than the tightly-clustered, recent load population - see
// "N=104 is real but concentrated" in the final report), not anything to do
// with the handover's own cost. Either way: do not publish this number. The
// before/after/drop figures above are unaffected by any of this - both sides of
// that comparison are the same /clear event.
//
// HANDOVER SIZE
// -------------
// Separately from the overhead question above: the size of the handover text
// itself, per load, taken from the SAME record that carries it into context (see
// HANDOVER_BODY_PREFIX below) - not modelled, read directly off disk. Reported
// in characters (exact) and tokens (chars/4, a crude estimate, always labelled
// as one), plus its median ratio against that load's own "before" context - how
// big the note is relative to the conversation it stands in for.
//
// SUBAGENTS
// ---------
// Only top-level `<project-dir>/<uuid>.jsonl` files are read. Subagent
// transcripts live under `<project-dir>/<uuid>/subagents/*.jsonl` - a
// subdirectory - and are never visited because we only list files directly in
// each project directory (fs.readdirSync, no recursion).
//
// USAGE
// -----
//   node scripts/measure.mjs                 # aggregates to stdout only
//   node scripts/measure.mjs --rows out.csv  # also writes per-load rows for
//                                             # checking (date, project slug,
//                                             # before, after, drop, gap_ms,
//                                             # handover_chars,
//                                             # handover_tokens_est) - never
//                                             # commit this file, and it is
//                                             # never printed to stdout.
//   node scripts/measure.mjs --root <dir>    # override the projects root
//                                             # (testing only)
//
// NEVER reads or writes ~/.clear-resume (the live handover store) -
// transcripts only.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const DEFAULT_ROOT = path.join(os.homedir(), ".claude", "projects");
const LOAD_PREFIX = "clear-resume: loaded handover";
const GAP_MAX_MS = 120_000; // see PAIRING RULE step 4 above
// Exact template opener from plugin/scripts/lib/hook.mjs (the `parts.push(...)` line
// that fires when `load` is truthy and `compact` is false - i.e. every
// SessionStart:clear load): "clear-resume: this session continues earlier
// work. Handover "<title>", saved <age>[, written on branch <b>]. Its branch,
// file and status claims are a snapshot: check them before acting.\n\n<body>".
// This is the literal text the hook injects as additionalContext - the thing
// task 1 below measures the size of.
const HANDOVER_BODY_PREFIX = "clear-resume: this session continues earlier work.";
const CHARS_PER_TOKEN_ESTIMATE = 4; // crude, clearly labelled as an estimate wherever printed

// A hook_additional_context array element over ~8-10KB is not inlined - Claude
// Code replaces it in the transcript with a "<persisted-output>" wrapper plus a
// 2KB preview and writes the FULL original text to a file next to the session
// (<project-dir>/<uuid>/tool-results/hook-*-additionalContext.txt). One real
// load in the dataset this script was built against hit exactly this (a
// 10,997-char handover). The wrapper's own path line is read back and the full
// file used instead of the truncated preview, so a big handover is not silently
// undercounted - this is a real path under the SAME project directory this
// script already reads, never ~/.clear-resume.
const PERSISTED_OUTPUT_PREFIX = "<persisted-output>";
const PERSISTED_PATH_RE = /Full output saved to: (.+)/;

// Given one element of a hook_additional_context content array, return the
// handover body's character length if this element (or, if offloaded, the file
// it points at) is clear-resume's own loaded-handover text, else null.
async function resolveHandoverBodyChars(candidate) {
  if (candidate.startsWith(HANDOVER_BODY_PREFIX)) {
    return candidate.split("\n\n---\n\n")[0].length;
  }
  if (candidate.startsWith(PERSISTED_OUTPUT_PREFIX)) {
    const m = candidate.match(PERSISTED_PATH_RE);
    if (m) {
      try {
        const full = await fs.promises.readFile(m[1].trim(), "utf8");
        if (full.startsWith(HANDOVER_BODY_PREFIX)) return full.split("\n\n---\n\n")[0].length;
      } catch {
        // referenced file missing/moved - fall through to null (counted as
        // "no matching handover body found" by the caller)
      }
    }
  }
  return null;
}

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, rows: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--rows") args.rows = argv[++i];
    else if (argv[i] === "--root") args.root = argv[++i];
  }
  return args;
}

function usageTotal(usage) {
  return (
    (usage.input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0)
  );
}

// Stream one transcript file. Returns only the small set of facts the rest of
// the script needs - never holds the raw lines in memory.
async function scanFile(fp) {
  const rl = readline.createInterface({
    input: fs.createReadStream(fp, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let firstTs = null;
  let lastTs = null;
  let clearLoadTs = null; // first genuine SessionStart:clear load, if any
  let anyLoad = false; // any genuine clear-resume load, any hookName
  let startupOrCompactLoad = false; // for the side-note count only
  let sessionStartReason = null; // 'clear' | 'startup' | 'compact' | 'resume' | '' (bare) | null (no SessionStart hook record seen)
  let handoverBodyChars = null; // chars in the injected handover body, for a real SessionStart:clear load only
  let firstAssistant = null; // {ts, total} of first main-chain assistant turn w/ usage
  let lastAssistant = null; // {ts, total} of last main-chain assistant turn w/ usage

  for await (const line of rl) {
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // tolerate a truncated/corrupt trailing line
    }

    if (rec.timestamp) {
      if (!firstTs) firstTs = rec.timestamp;
      lastTs = rec.timestamp;
    }

    if (rec.type === "attachment" && rec.attachment && rec.attachment.hookEvent === "SessionStart") {
      // hookName is EVENT:REASON, shared by every hook registered for SessionStart
      // (a session firing "SessionStart:clear" produces one such record per
      // installed hook, not just clear-resume's own) - so the first one we see
      // tells us WHY this session started, independent of which hook it came from.
      // Excludes "hook_additional_context": that record type is the aggregate of
      // ALL hooks' additionalContext for the event and carries a bare "SessionStart"
      // hookName with no reason suffix, which would wrongly overwrite a real reason
      // with "" if it were ever read first (it never is in practice - it's written
      // once every individual hook has run - but this keeps the guard exact rather
      // than order-dependent).
      if (sessionStartReason === null && rec.attachment.type !== "hook_additional_context") {
        const hookName = rec.attachment.hookName || "";
        const idx = hookName.indexOf(":");
        sessionStartReason = idx >= 0 ? hookName.slice(idx + 1) : "";
      }

      if (
        rec.attachment.type === "hook_system_message" &&
        typeof rec.attachment.content === "string" &&
        rec.attachment.content.startsWith(LOAD_PREFIX)
      ) {
        anyLoad = true;
        const hookName = rec.attachment.hookName || "";
        if (hookName === "SessionStart:clear") {
          if (clearLoadTs === null) clearLoadTs = rec.timestamp;
        } else if (hookName === "SessionStart:startup" || hookName === "SessionStart:compact") {
          startupOrCompactLoad = true;
        }
      }

      // The rendered form of hookSpecificOutput.additionalContext: one array
      // entry per hook that returned one. clear-resume's own entry (when it
      // loaded a handover, not-compact) always starts with HANDOVER_BODY_PREFIX
      // and is exactly `${frame sentence}\n\n${handover body}`, optionally
      // followed by a `\n\n---\n\n`-joined "N other handovers waiting" notice
      // that is NOT part of the handover - split it off before measuring. A
      // large body may have been offloaded to a file (see resolveHandoverBodyChars).
      if (
        handoverBodyChars === null &&
        rec.attachment.type === "hook_additional_context" &&
        Array.isArray(rec.attachment.content)
      ) {
        for (const c of rec.attachment.content) {
          if (typeof c !== "string") continue;
          const resolved = await resolveHandoverBodyChars(c);
          if (resolved !== null) {
            handoverBodyChars = resolved;
            break;
          }
        }
      }
      continue;
    }

    if (
      rec.type === "assistant" &&
      rec.isSidechain === false &&
      rec.message &&
      rec.message.usage
    ) {
      const total = usageTotal(rec.message.usage);
      if (!firstAssistant) firstAssistant = { ts: rec.timestamp, total };
      lastAssistant = { ts: rec.timestamp, total };
    }
  }

  return {
    fp,
    firstTs,
    lastTs,
    clearLoadTs,
    anyLoad,
    startupOrCompactLoad,
    sessionStartReason,
    handoverBodyChars,
    firstAssistant,
    lastAssistant,
  };
}

function quantile(sortedArr, q) {
  if (sortedArr.length === 0) return null;
  if (sortedArr.length === 1) return sortedArr[0];
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  }
  return sortedArr[base];
}

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}

function fmt(n) {
  return n === null || n === undefined ? "n/a" : Math.round(n).toLocaleString("en-US");
}

function fmtPct(ratio) {
  return ratio === null || ratio === undefined ? "n/a" : `${(ratio * 100).toFixed(1)}%`;
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = Date.now();

  let projectDirEntries;
  try {
    projectDirEntries = fs.readdirSync(args.root, { withFileTypes: true });
  } catch (err) {
    console.error(`Could not read projects root ${args.root}: ${err.message}`);
    process.exit(1);
  }
  const projectDirs = projectDirEntries
    .filter((e) => e.isDirectory())
    .map((e) => ({ slug: e.name, dir: path.join(args.root, e.name) }));

  // Pass 1: scan every top-level *.jsonl in every project directory. Cheap to
  // hold in memory - only a handful of numbers per file - so pairing and
  // baseline both run off this in-memory index with a single read of the disk.
  /** @type {Map<string, Array<any>>} */
  const scansByProject = new Map();
  let filesScanned = 0;

  for (const { slug, dir } of projectDirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
      .map((e) => path.join(dir, e.name));
    if (files.length === 0) continue;

    const scans = [];
    for (const fp of files) {
      try {
        const s = await scanFile(fp);
        scans.push(s);
        filesScanned++;
      } catch (err) {
        process.stderr.write(`skip ${fp}: ${err.message}\n`);
      }
    }
    scans.sort((a, b) => (a.firstTs || "") < (b.firstTs || "") ? -1 : 1);
    scansByProject.set(slug, scans);

    if (filesScanned % 2000 < scans.length) {
      process.stderr.write(`... scanned ${filesScanned} files\n`);
    }
  }

  // Pass 2 (in memory): pairing.
  let totalRealLoads = 0;
  let sideNoteStartupOrCompact = 0;
  let paired = 0;
  let unpaired = 0;
  let handoverSizeMissing = 0; // real load where the injected body couldn't be found (unexpected)
  const beforeVals = [];
  const afterVals = [];
  const dropVals = [];
  const handoverCharVals = []; // every real load with a found body, paired or not
  const handoverRatioVals = []; // paired loads only (needs "before" to compute a ratio)
  const rows = [];
  const loadDates = [];
  const projectsWithAnyClearLoad = new Set();

  for (const [slug, scans] of scansByProject) {
    for (const s of scans) {
      if (s.startupOrCompactLoad) sideNoteStartupOrCompact++;
      if (!s.clearLoadTs) continue;

      totalRealLoads++;
      loadDates.push(s.clearLoadTs);
      projectsWithAnyClearLoad.add(slug);

      if (s.handoverBodyChars === null) {
        handoverSizeMissing++;
      } else {
        handoverCharVals.push(s.handoverBodyChars);
      }

      const T_F = new Date(s.firstTs).getTime();
      let best = null;
      let bestLastMs = -Infinity;
      for (const cand of scans) {
        if (cand === s) continue;
        if (!cand.lastAssistant || !cand.lastTs) continue;
        const candLastMs = new Date(cand.lastTs).getTime();
        if (candLastMs <= T_F && candLastMs > bestLastMs) {
          best = cand;
          bestLastMs = candLastMs;
        }
      }

      if (best && s.firstAssistant && T_F - bestLastMs <= GAP_MAX_MS) {
        const before = best.lastAssistant.total;
        const after = s.firstAssistant.total;
        paired++;
        beforeVals.push(before);
        afterVals.push(after);
        dropVals.push(before - after);

        let handoverTokensEst = null;
        if (s.handoverBodyChars !== null) {
          handoverTokensEst = s.handoverBodyChars / CHARS_PER_TOKEN_ESTIMATE;
          if (before > 0) handoverRatioVals.push(handoverTokensEst / before);
        }

        rows.push({
          date: s.clearLoadTs,
          project: slug,
          before,
          after,
          drop: before - after,
          gapMs: T_F - bestLastMs,
          handoverChars: s.handoverBodyChars,
          handoverTokensEst,
        });
      } else {
        unpaired++;
      }
    }
  }

  // Baseline: first-turn context of sessions in the SAME projects (any project
  // that had >=1 genuine SessionStart:clear load) that never loaded a handover.
  //
  // Restricted to sessionStartReason === "clear" (a /clear happened, the plugin
  // just found nothing pending to hand over) rather than every reason a session
  // can start (startup/resume/compact too), so a resumed session - whose first
  // recorded turn already carries a whole prior conversation's context, not a
  // fresh one - can't get counted as "baseline". This narrows the confound but
  // does not remove it: see the BASELINE header comment above for the measured
  // cause and why this number still is not safe to publish. The broader,
  // more-confounded cut (every no-handover reason) is kept below as
  // `baselineAnyReasonStats` purely for comparison, never as the headline number.
  const baselineVals = [];
  const baselineAnyReasonVals = [];
  for (const slug of projectsWithAnyClearLoad) {
    const scans = scansByProject.get(slug) || [];
    for (const s of scans) {
      if (!s.anyLoad && s.firstAssistant) {
        baselineAnyReasonVals.push(s.firstAssistant.total);
        if (s.sessionStartReason === "clear") baselineVals.push(s.firstAssistant.total);
      }
    }
  }

  const beforeStats = stats(beforeVals);
  const afterStats = stats(afterVals);
  const dropStats = stats(dropVals);
  const handoverCharStats = stats(handoverCharVals);
  const handoverTokenStats = stats(handoverCharVals.map((c) => c / CHARS_PER_TOKEN_ESTIMATE));
  const handoverRatioStats = stats(handoverRatioVals);
  const baselineStats = stats(baselineVals);
  const baselineAnyReasonStats = stats(baselineAnyReasonVals);
  const overheadMedian =
    afterStats.median !== null && baselineStats.median !== null
      ? afterStats.median - baselineStats.median
      : null;

  const sortedDates = [...loadDates].sort();
  const dateRange =
    sortedDates.length > 0
      ? `${sortedDates[0].slice(0, 10)} to ${sortedDates[sortedDates.length - 1].slice(0, 10)}`
      : "n/a";

  const runtimeS = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("=== clear-resume context savings (SessionStart:clear loads only) ===");
  console.log(`Projects scanned:        ${projectDirs.length}`);
  console.log(`Session files scanned:   ${filesScanned}`);
  console.log(`Real loads (clear):      ${totalRealLoads}`);
  console.log(`  Paired:                ${paired}`);
  console.log(`  Unpaired (excluded):   ${unpaired}`);
  console.log(`Date range of loads:     ${dateRange}`);
  console.log("");
  console.log(`Context BEFORE /clear   (n=${beforeStats.n}): median ${fmt(beforeStats.median)}  p25 ${fmt(beforeStats.p25)}  p75 ${fmt(beforeStats.p75)}`);
  console.log(`Context AFTER resume    (n=${afterStats.n}): median ${fmt(afterStats.median)}  p25 ${fmt(afterStats.p25)}  p75 ${fmt(afterStats.p75)}`);
  console.log(`Drop (before - after)   (n=${dropStats.n}): median ${fmt(dropStats.median)}  p25 ${fmt(dropStats.p25)}  p75 ${fmt(dropStats.p75)}`);
  console.log("");
  console.log(`Handover body size, chars   (n=${handoverCharStats.n}): median ${fmt(handoverCharStats.median)}  p25 ${fmt(handoverCharStats.p25)}  p75 ${fmt(handoverCharStats.p75)}`);
  console.log(`Handover body size, EST tokens (chars/4) (n=${handoverTokenStats.n}): median ${fmt(handoverTokenStats.median)}  p25 ${fmt(handoverTokenStats.p25)}  p75 ${fmt(handoverTokenStats.p75)}`);
  console.log(`Handover EST tokens / context-before, paired loads (n=${handoverRatioStats.n}): median ${fmtPct(handoverRatioStats.median)}  p25 ${fmtPct(handoverRatioStats.p25)}  p75 ${fmtPct(handoverRatioStats.p75)}`);
  if (handoverSizeMissing > 0) {
    console.log(`  (${handoverSizeMissing} real load(s) had no matching handover body found - excluded from the size stats above)`);
  }
  console.log("");
  console.log(`Baseline first-turn context, same projects, /clear with NO handover to load (n=${baselineStats.n}): median ${fmt(baselineStats.median)}  p25 ${fmt(baselineStats.p25)}  p75 ${fmt(baselineStats.p75)}`);
  console.log(`Handover overhead vs baseline (median after - median baseline): ${fmt(overheadMedian)}`);
  console.log(`  (unrestricted baseline incl. resume/startup sessions, n=${baselineAnyReasonStats.n}, for comparison only: median ${fmt(baselineAnyReasonStats.median)} - do not use, see script header comment)`);
  console.log("");
  console.log(`Side note - plugin loads NOT counted above (SessionStart:startup / SessionStart:compact): ${sideNoteStartupOrCompact}`);
  console.log(`Runtime: ${runtimeS}s`);

  if (args.rows) {
    const header = "date,project_slug,before,after,drop,gap_ms,handover_chars,handover_tokens_est\n";
    const body = rows
      .map(
        (r) =>
          `${r.date},${r.project},${r.before},${r.after},${r.drop},${r.gapMs},${r.handoverChars ?? ""},${r.handoverTokensEst ?? ""}`,
      )
      .join("\n");
    fs.writeFileSync(args.rows, header + body + "\n", "utf8");
    console.error(`Wrote ${rows.length} per-load rows to ${args.rows}`);
  }
}

main();
