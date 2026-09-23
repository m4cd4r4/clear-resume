# Findings: printed output and README

Written before any edit, against `chore/polish-and-launch` at 37c05b3. Every claim below was
checked by reading the source, or by running the plugin against a throwaway repo
("widget-shop") and a temp `CLEAR_RESUME_HOME`, never the live store.

## Part 1: what the plugin prints

The SessionStart hook returns two strings. `systemMessage` is the only one a person reads.
`additionalContext` goes into Claude's context and the person never sees it. Several of the
faults below come from treating the two as interchangeable.

### 1.1 Loading a handover

```
systemMessage:  clear-resume: loaded handover "Cart totals rounding" (saved 0m ago).
```

This line is close to right: it names the one thing the reader needs. Two faults.

- **"0m ago" for anything under a minute.** `age()` in `scripts/lib/select.mjs:23` rounds to
  whole minutes, so a handover written thirty seconds ago reports as `0m ago`, which reads
  like a broken clock rather than "just now".
- The prefix `clear-resume:` is on every line the plugin prints, including lines that already
  contain the word "handover". The reader learns nothing from the second half of it.

```
additionalContext: clear-resume: this session continues earlier work. Handover
"Cart totals rounding", saved 0m ago. Treat its branch, file and status claims as a
snapshot: check them before acting.
```

- Three clauses arrive before the handover body starts. The caveat is load-bearing (a
  handover's "next step" goes stale) and must stay, but it spends 21 words.
- The branch-mismatch clause `(written on branch X)` is spliced between the age and the
  caveat (`scripts/lib/hook.mjs:84-87`), which is the least-scanned position in the sentence.
  When it fires, it is the most important fact in the line.

### 1.2 Listing handovers it will not load: the worst of the output

```
systemMessage:  clear-resume: 2 handover(s) waiting for this repo. Say which to resume.

additionalContext:
clear-resume: 2 other handover(s) waiting for this repo, not loaded:
- "Bump the test runner" [chore/deps], saved 0m ago: laptop-43828-2026-09-23T01-38-44-954Z.json
- "Search empty state" [fix/search-empty-state], saved 0m ago: laptop-53064-2026-09-23T01-38-45-276Z.json
If the user asks to resume one, run: node "<plugin>\scripts\load.mjs" <file>
```

- **The person is asked to choose from a list they cannot see.** "Say which to resume" is in
  `systemMessage`; the titles are in `additionalContext`. This is the worst thing the plugin
  does, because the instruction is impossible to follow as printed.
- **"other" is wrong whenever nothing loaded.** One string serves both cases
  (`scripts/lib/hook.mjs:94`), so when no handover was loaded the reader is told these are
  "other" than nothing.
- **"handover(s)"** reads like a log line. The count is known at the point of printing, so
  the plural can simply be correct.
- **", not loaded"** is redundant after "waiting".
- **The row identifier is a 48-character record filename**, and it is also what the reader
  must type to resume. It is built from machine name, pid and timestamp
  (`packages/store/schema.mjs:49`), so it **prints the machine's hostname** into visible
  text. That is a needless disclosure on a shared screen or a recorded demo, and it is
  unreadable either way.
- **The branch is the most useful thing on the row** and is bracketed away as an aside.
- The resume instruction prints an absolute path with Windows backslashes, and its `<file>`
  placeholder is the 48-character token. Nothing says a title would do.

### 1.3 `scripts/save.mjs`: one action, three renderings of one path

```
Saved handover: C:\Users\you\...\handovers\laptop-23768-2026-09-23T01-38-20-020Z.json
Filed against the session root C:/Users/YOU~1/.../widget-shop, not the current directory.
After /clear, the next session in C:/Users/you/.../widget-shop loads it automatically.
```

- **The same directory appears three times in three spellings** in one output: backslashes,
  forward slashes with the Windows 8.3 short name, and forward slashes with the long name. It
  reads as three different locations.
- The record path on line 1 is the least useful line and gets top billing. The last line is
  the one that changes what the reader does next.
- "Filed against the session root ..., not the current directory" explains an internal
  decision. It earns its place only when the reader would be surprised, and it currently
  fires whenever the shell's cwd differs from the session root at all.

### 1.4 The auto-mode nudge

`scripts/lib/nudge.mjs:96-100` is five sentences and 63 words. It explains the mechanism to
Claude (the threshold, that the size was read from the transcript, that it fires once per
session) when what is needed is the instruction. The mid-turn variant at `:123-126` repeats
the same explanation a second time.

## Part 2: the README

### Wrong

1. **Line 17: `~/.clear-resume/<repo>/waiting/`.** The store is flat:
   `~/.clear-resume/handovers/<machine>-<pid>-<iso>.json`, with status held in the record
   (`packages/store/store.mjs:5`, `packages/store/schema.mjs:5`). There is no per-repo
   directory and no `waiting/`. A reader who looks finds nothing.
2. **Lines 19-20: "moves it to `archive/`".** `archive()` flips `status` to `archived` in
   place and the file never moves (`scripts/lib/store.mjs:150`,
   `packages/store/store.mjs:7`). The record staying put is deliberate: a cross-directory
   rename is what two syncing machines could race.
3. **`skills/handover/SKILL.md:65` repeats fault 1 verbatim**, so the error is also in what
   Claude is told.

### Misleading

4. **Line 36: "There is no marketplace listing."** The repo already ships a valid
   `.claude-plugin/marketplace.json`: `claude plugin validate .` passes on this commit. So it
   is installable today with `claude plugin marketplace add m4cd4r4/clear-resume` followed by
   `claude plugin install clear-resume@clear-resume`. The README documents only
   `--plugin-dir`, which loads the plugin for one session, and then denies that the
   persistent path exists.

### Unverifiable

5. **Lines 9-12: "median context per call fell from about 290k tokens to 193k in the week
   this habit was automated (N = 196k calls)".** Nothing in the repo supports this, and
   196,000 assistant calls in one week is not plausible for one person. A headline number
   with no source is the first thing a sceptical reader attacks, and it is the second
   paragraph of a public README. It needs a source or it needs cutting.

### Structure

6. **`## Licence` sits at line 112 with 84 lines after it**, including "Syncing two
   machines", the longest section in the document. A licence heading reads as the end.
7. **The VS Code extension first appears at line 159**, inside "Setting up the second
   machine", as a build-from-source recipe. It is a separate deliverable of this project and
   a stranger cannot tell it exists.
8. **Line 102 files a passing test under `## Limitations`**: "Web mode passed a live test on
   Claude Code on the web on 2026-09-19". That is a result, not a limitation.

### Missing

9. **What it costs the reader.** Nothing states that each handover is a plain-text file that
   stays on disk until pruned, that the store grows, or that writing one costs a Claude turn.
10. **What a handover looks like.** The headings are named in passing at line 16. A reader
    cannot judge whether the output would be useful without seeing one.
11. **The loop, end to end.** There is no worked example and no demo, which is what a stranger
    looks for first in a repo whose pitch is a habit.

### Verified correct, keep as written

12. The settings table: all seven variables, and the set is complete against a grep of the
    source. Defaults match `nudge.mjs:9` (180000), `hook.mjs:27` (8000) and `:74` (7 days),
    and `packages/store/store.mjs:19` (`~/.clear-resume`). The branch-selection rules match
    `select.mjs:11-19`, including the lone-handover case and the 7-day cutoff. Web mode's ref
    naming and its 5-second fetch cap match `web.mjs:36` and `:106`. Node 18 matches
    `package.json`. `--plugin-dir` exists, checked against `claude --help`. The sync section
    is accurate throughout, tombstone window included (`schema.mjs:26`).

### Out of scope for this PR

13. `package.json` says `"version": "0.1.0"` while `plugin.json` and `marketplace.json` say
    `0.1.1`. Recorded in `docs/CLAUDE-TODO.md`; version numbers are fenced off by the brief.
