# Auto-continue: design

Status: phase 1 (headless runner) built in 0.3.0; phase 2 panel mode built on
`feat/auto-continue-vscode` (PR #54, end to end passed 2026-10-01); phase 2 terminal mode
designed only.
Decided with Macdara on 2026-09-30.

## The problem

Auto mode gets as far as "Claude saved a handover, now type `/clear`". Two manual steps
remain: the `/clear`, and the "go" that starts the next turn. Neither can be removed from
inside Claude Code:

- Claude cannot run `/clear`, and no hook or plugin can issue a slash command.
- A SessionStart hook can load context but cannot start a turn. Only a user message does.

So the continue has to be a **new conversation or process whose first message is the
resume prompt**. That needs something outside Claude Code to start it:

| Where | What starts the next session | Phase |
|---|---|---|
| Headless `claude -p` | the runner: the process exiting is the clear, a fresh process is the resume | 1 |
| VS Code | the extension opens a new Claude Code conversation seeded with the resume prompt | 2 |
| Terminal CLI | nothing. It stays manual. No keystroke injection. | - |

## One knob: the continue budget

How many automatic continues are allowed: `0` (off, today's behaviour), `N`, or
unlimited. With the budget at 0 or unset, nothing changes: the nudge text is exactly as
in 0.2.1.

- **Headless:** the runner's `--max-segments`.
- **Interactive (phase 2)**, most specific wins: `/auto <n|on|off>` in chat for this
  window, then a status-bar item per window (click cycles Off -> 3 -> Unlimited, shows
  "auto: 2 of 4 left"), then the extension setting `clear-resume.autoContinue` (default
  off).

## The handover record

Three new optional fields, carried forward from segment to segment:

| Field | Meaning |
|---|---|
| `auto` | `true` when saved in response to the nudge (or by any session under the runner) |
| `chain` | which segment wrote it, 1-based |
| `budget` | continues left after this one; `-1` = unlimited |

**Only an auto record with budget left triggers an automatic continue.** A `/handover` you
run yourself still waits for you. Older readers ignore the fields: `normalise` passes
unknown fields through.

How `save.mjs` decides `auto`:

- `CLEAR_RESUME_HEADLESS=1` (the runner sets it, with a private store): always auto.
- Otherwise: auto when this session has been nudged (the `.nudged/<session id>` marker the
  Stop and PostToolUse hooks already write) and auto-continue is on. This does not rely on
  Claude remembering to pass a flag.

`chain` and `budget` come from `CLEAR_RESUME_CHAIN` and `CLEAR_RESUME_BUDGET`, which the
runner sets per segment (phase 2: from the window's state).

## The nudge

| Mode | What Claude is told |
|---|---|
| off (budget 0/unset) | unchanged from 0.2.1: write a handover, tell the user to `/clear` |
| headless | if the task is finished, do NOT save a handover, just end. Otherwise commit all work, save a handover with `save.mjs` (next action, plus any open STOP question verbatim), and end the turn. The runner resumes you. |
| interactive auto-continue | same as headless, and the extension continues in a new tab |

The "if finished, don't save" clause matters: the Stop hook fires on the final turn end
too, and a finished worker that saves a handover would be resumed into a done task.

## Phase 1: `clear-resume run`

```
node plugin/scripts/run.mjs --max-segments 4 --total-budget-usd 60 --prompt-file p.txt \
  [--nudge-at 180000] [--store DIR] [--event-log FILE --label SLUG] [--alert-cmd CMD] \
  -- claude -p --max-turns 500 --max-budget-usd 40 --model sonnet --output-format stream-json --verbose
```

- **Caps, all required.** `--max-segments`, `--total-budget-usd`, and the command's own
  `--max-turns` and `--max-budget-usd`. Missing any is exit 2 (the loop-ceiling-guard hook
  requires caps too). Each segment's `--max-budget-usd` is lowered to what the total has
  left.
- **Prompt on stdin**, not argv. Segment 2+ appends the handover body, and Windows cuts a
  command line at about 8k characters.
- **Environment per segment:** `CLEAR_RESUME_AUTO=1`, `CLEAR_RESUME_HEADLESS=1`,
  `CLEAR_RESUME_HOME=<private store>` (default `~/.clear-resume-headless`),
  `CLEAR_RESUME_SYNC=off`, `CLEAR_RESUME_NUDGE_AT`, `CLEAR_RESUME_CHAIN`,
  `CLEAR_RESUME_BUDGET`. The private store means worker handovers never reach the
  extension or an interactive session. A `--settings` JSON that sets `CLEAR_RESUME_*`
  would override these, so the runner refuses it.
- **Session ids.** A `--session-id` in the command is used for segment 1; later segments
  get fresh UUIDs (one id cannot be reused). Each is written to the event log.
- **After each segment:** find the auto handover it saved for this repo (created after the
  segment started), archive it (`via: "load"`, so it counts as taken), and start the next
  segment with the ORIGINAL prompt + "segment N, resume from:" + the body. Because it is
  archived first, the next segment's SessionStart hook loads nothing a second time.
- **Stops** when a segment saves no handover (done, or failed without one: its exit code
  is the runner's), at `--max-segments` or the total budget (exit 4, the handover is left
  waiting in the private store and its id printed), or at the stall guard (exit 3).
- **Stall guard**, also with a large budget: HEAD is compared before and after each
  continued segment. Two continued segments in a row with no new commit stop the chain
  and run `--alert-cmd` with the message in `CLEAR_RESUME_ALERT`.
- **Cost** is read from the `result` line of `--output-format json|stream-json`
  (`total_cost_usd`). Without one, the segment is charged its full `--max-budget-usd`.
- **Event log** (optional): `<iso> segment <label> <n> <session id>` lines. The examworthy
  orchestrator counts only `start` lines against its concurrency cap, so run-one.sh keeps
  one start/exit pair per run and these lines are ignored by it.

### Harness swap (after this merges)

`~/.claude/headless-examworthy-rd-wave2/run-one.sh` today runs one `claude -p` with
`--max-turns 500 --max-budget-usd 40 --settings CLEAR_RESUME_AUTO=0`. It becomes the
runner with `--max-segments 4 --total-budget-usd 60 --nudge-at 180000 --event-log
queue.log --label $SLUG`, the `--settings` override dropped. Evidence for 180k: workers
start at a median of 92k, and first builds reached 460k at 15-31 USD
(orchestrator/analysis/ctx.mjs, harm.mjs).

Then the controlled test: one fix-round brief, segmented vs one long session, same model,
compare the review's blocker and should-fix counts. The earlier correlation (Spearman
0.67, N=20) is confounded by model and scope.

## Phase 2: interactive auto-continue (in progress: tab closing and the EDH test remain)

- The extension watches the store. When an auto record with budget left appears from one
  of its own windows, it opens a new conversation with `resumePrompt` (the Resume button's
  path, `extension.ts` `resume()`), records the take, and toasts "Continued (2 of 4 left)".
- **Old tabs.** Probed 2026-10-01 (Claude Code 2.1.285): a Claude Code chat tab is a
  `TabInputWebview` whose `viewType` contains `claudeVSCodePanel`, and
  `tabGroups.close(tab)` closes it. Every tab is labelled "Claude Code" with no session
  id, so the old tab is closed only when it was the one Claude tab in the window and the
  continue added exactly one more (`extension/src/oldtab.ts`); otherwise nothing closes.
  It waits up to 10s for the new tab, then 10s more so the old session can finish its turn.
- Stall guard as in phase 1, alerting by toast. HEAD is recorded in the window's budget file at each continue (`lastHead`, `stalled`); a third continue after two commit-less sessions is refused and the handover is left waiting.
- Check the 0.2.1 load crash (`packages/store/sync.mjs:256`, `import.meta.url` in the CJS
  bundle) is fixed in the build before starting.
- An EDH needs a throwaway `--user-data-dir` (edh-guard enforces it).
- **Window key** (measured 2026-09-30, Claude Code 2.1.284, VS Code 1.138). A hook sees
  `CLAUDE_PID`; that process's parent is the window's extension host (`Code.exe
  --utility-sub-type=node.mojom.NodeService`), which is also the clear-resume extension's
  own `process.pid`, since VS Code runs one extension host per window. So the per-window
  budget and the auto record are keyed on parent-of-`CLAUDE_PID`, and the extension
  matches on `process.pid` with no IPC. `VSCODE_PID` is the shared main process, so it
  is the same in every window and cannot be the key.

## Phase 2b: terminal mode (designed 2026-10-01, not built)

Panel mode stops one keypress short. Probed in Claude Code 2.1.285: the panel's open
command (`editor.open(sessionId, prompt, ...)`) and the `/open` URI only pre-fill the
input; neither submits. So a panel continue opens the next conversation and waits for
Enter. Terminal mode removes that keypress: the extension starts the next session in a
VS Code integrated terminal as `claude "<prompt>"`, and the CLI submits a positional
prompt at once. Macdara chose this on 2026-10-01 so long work can run hands-off, with no
one context over ~200k. Panel mode stays as an option.

This is not the "Terminal CLI" row in the table at the top. A terminal the user opened is
still manual. Terminal mode applies only to a terminal the extension created and can name.

### Setting

`clearResume.autoContinue.mode`: `"terminal"` (default) or `"panel"`. Terminal is the
default because auto-continue is opt-in through the budget, and someone who sets a
budget wants the continue to run without them. With no budget, the setting does nothing.

### The window key travels in the environment

A terminal session breaks both checks that panel mode relies on:

- `hostWindow()` reads the parent of `CLAUDE_PID`. In a terminal that parent is a shell,
  not the extension host.
- `CLAUDE_CODE_ENTRYPOINT` is `cli`, so the `inVsCode` gate in `auto.mjs` turns auto
  off.

So the extension passes the window in the environment:
`createTerminal({ env: { CLEAR_RESUME_WINDOW: "<pid>@<start>" } })`, using the same
`thisWindow()` value it matches against. Claude and every hook it runs inherit it. On
the plugin side:

- `hostWindow()` returns `CLEAR_RESUME_WINDOW` when it is set and well formed, before
  any process walk. This is also faster.
- The `inVsCode` gate (in `auto.mjs` and `nudge.mjs`) also passes when `CLEAR_RESUME_WINDOW`
  is set. A terminal the extension started is, for this purpose, inside VS Code.
- The record stamp, budget file and `autoContinueFor` are unchanged. The key is the same
  `<pid>@<start>`.

The variable is set only on terminals the extension creates. A user's own terminal never
carries it, so it stays manual, as before.

### The prompt is one line that points at a file

`resumePrompt` is multi-line markdown. Passing it as an argument means quoting it for
whatever shell the terminal runs (pwsh, cmd, bash), and cmd cannot carry a newline in an
argument at all. So the extension:

1. writes `resumePrompt` to `<store>/loaded/<slug>-<shortid>.md` (load already writes a
   copy there for reading and sharing);
2. sends one line: `claude "Continue from the clear-resume handover in <path>. Read it in full first, then do its Next action."`.

The extension sends it with `terminal.sendText(line)` into the default shell, not
`shellPath: claude`. That keeps one code path across shells, needs no lookup of
`claude.cmd` versus `claude.exe`, and leaves a shell behind if claude exits. The path is
checked before sending. If it holds a character any of the three shells would treat
specially (`` " $ ` % ^ & | < > ! ``), the extension falls back to panel mode for that
continue and says so in the toast.

### Closing the old session

- **The old session ran in a terminal the extension created.** The extension keeps a map
  of record id to `Terminal` for the terminals it opened. After the new terminal opens,
  plus the same 10s grace the panel uses, it disposes the old terminal. Disposing kills
  the idle claude in it. This is exact: no guess, unlike tabs.
- **The old session was a panel tab** (the first link in a chain usually is). The
  existing `oldTabToClose` rule applies unchanged.
- A terminal the extension did not create is never closed.

### Unchanged

Budget, stall guard, `takeOne`, archiving through `resume`'s `via: "extension"`, and the
toast all stay as they are. Only the open step and the old-session close differ.

### Tests first

- plugin: `hostWindow` returns `CLEAR_RESUME_WINDOW` when set; ignores a malformed value;
  `interactiveAuto`/`windowAuto`/nudge accept an entrypoint of `cli` with the variable
  set and stay off without it.
- extension, as plain functions beside `oldtab.ts`: the launch line for a given path; the
  unsafe-path check (falls back to panel); which terminal to dispose (only one the
  extension made for the previous record of this window).
- End to end: `/clear-resume:auto 2` in a panel session. Two continues chain into
  terminals with no keypress. Budget used is 2, both records are archived via
  `extension`, and the first terminal is disposed after the second opens.
