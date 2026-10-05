# Facts ledger

One line per claim: `F12 | page: "<sentence as the page shows it>" | source: "<verbatim source text>" | file:line`.
A line may carry several `source: "..." | file:line` pairs. Source quotes are verbatim substrings of the cited file
(whitespace-normalised). In a page quote, `{name}` stands for a `data-stat` or `data-run` slot whose value a script
writes. F90 to F97 are written by buildstats.mjs.

## Measured by hand (copied from TASK.md as-is)

- Stock Claude Code starts at 21,200 tokens before your first message: Claude Code 2.1.289, Opus 5.5, empty CLAUDE_CONFIG_DIR, cwd with no CLAUDE.md, .claude or .mcp.json above it, 0 MCP servers, 27 tools. One headless "say hi" run; cache_creation_input_tokens 21,200 + input_tokens 2, read from the first assistant message. (measured 2026-10-04)
- Caveat for anyone repeating it: a cwd under your home folder picks up ~/.claude and ~/.mcp.json as project config (the same probe from such a cwd read 58,978).
- The author's sessions start at 77k to 99k (rules, skills, MCP).
- On the API, cache reads are billed at a tenth of the input price (Anthropic prompt caching pricing).

## index.html: hero and install commands

F1 | page: "claude plugin marketplace add https://github.com/m4cd4r4/clear-resume" | source: "claude plugin marketplace add https://github.com/m4cd4r4/clear-resume" | README.md:117
F2 | page: "claude plugin install clear-resume@clear-resume --config auto_nudge=true --config relay=10" | source: "claude plugin install clear-resume@clear-resume --config auto_nudge=true --config relay=10" | README.md:82
F3 | page: "claude plugin install clear-resume@clear-resume" | source: "claude plugin install clear-resume@clear-resume" | README.md:82
F4 | page: "A free, open-source Claude Code plugin." | source: "A free, open-source plugin for Claude Code." | README.md:2
F5 | page: "Relay on, in your terminal:" | source: "## Install: two commands in your terminal" | README.md:109 | source: "claude plugin install clear-resume@clear-resume --config auto_nudge=true --config relay=10" | README.md:82

## Build stats (written by site/buildstats.mjs; `value:` is the figure it wrote)

<!-- buildstats:begin -->
F90 | page: "{sessions} sessions" | source: "const sessions = out.length;" | site/buildstats.mjs:127 | value: 15 (sessions in the run chain, buildstats.mjs)
F91 | page: "{clears} automatic clears" | source: "const clears = sessions - 1;" | site/buildstats.mjs:128 | value: 14 (sessions after the first, each begun by a /clear, buildstats.mjs)
F92 | page: "{commits} site: commits" | source: "const commits = lines.length;" | site/buildstats.mjs:147 | value: 42 (site: commits since site-v5-base, buildstats.mjs)
F93 | page: "{minutes} minutes" | source: "const minutes = (Math.round((last - t0) / 6000) / 10).toFixed(1);" | site/buildstats.mjs:129 | value: 94.1 (run start to the RELAY-SITE-DONE reply, buildstats.mjs)
F94 | page: "{tokens} tokens sent" | source: "const tokensSent = (Math.round(tokens / 1e5) / 10).toFixed(1) + "M";" | site/buildstats.mjs:130 | value: 91.0M (context summed over every reply, buildstats.mjs)
F95 | page: "{first}" | source: "first: commits ? awst(lines[commits - 1]) : "n/a"" | site/buildstats.mjs:148 | value: 07:36 (oldest site: commit, AWST, buildstats.mjs)
F96 | page: "{last}" | source: "last: commits ? awst(lines[0]) : "n/a"" | site/buildstats.mjs:148 | value: 09:05 (newest site: commit, AWST, buildstats.mjs)
F97 | page: "{date}" | source: "date: commits ? awstDate(lines[0]) : "n/a"" | site/buildstats.mjs:149 | value: 5 Oct 2026 (AWST date of the newest site: commit, buildstats.mjs)
<!-- buildstats:end -->

## index.html: what it does (the README's example output)

F10 | page: "Claude writes a short note, called a handover: the goal, the next action, where things stand, the decisions made and what already failed." | source: "Then it writes a short note about the work, called a handover: the goal, the next action, where things stand, the decisions made and what already failed." | README.md:48
F11 | page: "Saved handover "Cart totals rounding" (id 31c9af7)." | source: "Saved handover "Cart totals rounding" (id 31c9af7)." | README.md:51
F12 | page: "After /clear, the next session in ~/code/widget-shop loads it automatically." | source: "After /clear, the next session in ~/code/widget-shop loads it automatically." | README.md:46
F14 | page: "clear-resume: loaded handover "Cart totals rounding" (saved just now)." | source: "clear-resume: loaded handover "Cart totals rounding" (saved just now)." | README.md:58
F15 | page: "A copy to read or share: ~/.clear-resume/loaded/widget-shop-cart-totals-rounding-31c9af7.md" | source: "A copy to read or share: ~/.clear-resume/loaded/widget-shop-cart-totals-rounding-31c9af7.md" | README.md:59
F16 | page: "# the README's example, in a widget-shop repo" | source: "A long chat in the widget-shop project" | README.md:43
F17 | page: "# Claude carries on from the handover." | source: "Claude carries on from the handover." | README.md:64
F19 | page: "/clear-resume:handover" | source: "Type `/clear-resume:handover`." | README.md:48
F6 | page: "/clear" | source: "Type `/clear`." | README.md:55
F7 | page: "go" | source: "Type `go`, or say what to do next." | README.md:64
F18 | page: "Three steps: save a handover, /clear, carry on." | source: "**Save a handover.**" | README.md:48 | source: "**Clear.** Type `/clear`." | README.md:55 | source: "**Carry on.**" | README.md:64

## index.html: fallback feed in the media box (with the relay on)

F62 | page: "# with the relay on, context passes the nudge size" | source: "Claude saves a handover when the chat passes a size you choose" | README.md:73
F63 | page: "clear-resume: context is about 182k tokens (nudge at 180k)." | source: "clear-resume: context is about 182k tokens (nudge at 180k)." | README.md:207
F64 | page: "# Claude is asked to save a handover" | source: "Claude is asked to save a handover" | README.md:207
F65 | page: "# the plugin runs /clear when the turn ends" | source: "the plugin runs `/clear` when the turn ends" | README.md:73
F60 | page: "Replay of the run that built this page." | source: "Caption under the box: "Replay of the run that built this page."" | TASK.md: Media box

## index.html: the relay

F20 | page: "Past a size you choose, Claude saves a handover and the plugin runs /clear when the turn ends." | source: "Claude saves a handover when the chat passes a size you choose, the plugin runs `/clear` when the turn ends, and the fresh session carries on." | README.md:73
F21 | page: "Off by default. Needs Claude Code 2.1.275 or later; works in a terminal and in the VS Code chat panel." | source: "They belong to the nudge and the relay, which are both off by default." | README.md:121 | source: "It needs Claude Code 2.1.275 or later, and works in a terminal and in the VS Code chat panel." | README.md:85
F23 | page: "plugin default, 180k (this run's setting is not recorded)" | source: "The default, 180k tokens, is what the author uses on a 1M-token context window." | README.md:91
F25 | page: "{sessions} sessions. Peaks: {peakLo} to {peakHi} tokens." | source: "var vals = { sessions: String(run.sessions.length), peakLo: kTok(Math.min.apply(null, peaks)), peakHi: kTok(Math.max.apply(null, peaks)) };" | site/app.js:155
F26 | page: "nudge at {nudge} (this run's setting)" | source: "const m = nudgeText.match(/threshold (\d+)k/);" | site/buildstats.mjs:113
F27 | page: "Source: this site's build transcripts (buildstats.mjs)" | source: "buildstats.mjs: reads a relay run's transcripts and writes its figures into the site." | site/buildstats.mjs:1
F28 | page: "Source: transcripts of an earlier relay run (site/source/fixture), buildstats.mjs" | source: "site/source/fixture holds the transcripts of an earlier relay run." | site/buildstats.mjs:5
F29 | page: "Sample data from an earlier run. Replaced after this build." | source: "Sample data from an earlier run:" | site/buildstats.mjs:5 | source: "Replaced after this build:" | site/buildstats.mjs:6
F30 | page: "Source: this site's build transcripts and git log (buildstats.mjs)" | source: "buildstats.mjs: reads a relay run's transcripts and writes its figures into the site." | site/buildstats.mjs:1 | source: "const commits = lines.length; // git log site-v5-base..site-v5 --grep" | site/buildstats.mjs:147

## index.html: proof, the 2026-10-03 measurement

F35 | page: "Context per /clear, a separate 2026-10-03 run" | source: "2026-10-03 run: 191" | STATUS.md:53
F36 | page: "191 /clear loads" | source: "2026-10-03 run: 191 real `/clear` loads" | STATUS.md:53
F37 | page: "195k median before" | source: "median context 195k before and 97k after, a median drop of 101k." | STATUS.md:54
F38 | page: "97k median after" | source: "median context 195k before and 97k after, a median drop of 101k." | STATUS.md:54
F39 | page: "101k median drop" | source: "median context 195k before and 97k after, a median drop of 101k." | STATUS.md:54
F40 | page: "Source: STATUS.md. As of 2026-10-05, scripts/measure.mjs is on the open PR #57, not in the released plugin." | source: "**Context-savings measurement** (#57). `scripts/measure.mjs`. 2026-10-03 run" | STATUS.md:53 | source: "Checked against `origin/main` at d2e5342 on 2026-10-05." | STATUS.md:3 | source: "## In flight" | STATUS.md:27 | source: "| `feat/measure-context` | #57 open | keep |" | STATUS.md:82

## index.html: install and FAQ

F42 | page: "Manual (the default): install, then /clear-resume:handover, /clear, go." | source: "Then, when a chat has grown long, type `/clear-resume:handover`, then `/clear`." | README.md:123 | source: "| Manual | `/clear-resume:handover`, `/clear`, `go` | None. This is the default |" | README.md:79
F43 | page: "Optional: VS Code extension; needs the plugin." | source: "**The VS Code sidebar** is a separate extension that needs the plugin." | README.md:194
F44 | page: "code --install-extension macdara.clear-resume" | source: "code --install-extension macdara.clear-resume" | README.md:201
F256 | page: "Marketplace, Open VSX, releases." | source: "It is on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=macdara.clear-resume), and on [Open VSX](https://open-vsx.org/extension/macdara/clear-resume)" | README.md:204 | source: "# Changelog" | CHANGELOG.md:1
F46 | page: "Handovers are plain text files on your disk, in ~/.clear-resume. Nothing is sent anywhere unless you turn on sync (to your own private git remote) or web mode (for Claude Code on the web). Keep secrets out of them." | source: "Handovers are plain text files on your disk, in `~/.clear-resume`. Nothing is sent anywhere unless you turn on" | README.md:69 | source: "(to your own private git remote) or" | README.md:69 | source: "(for Claude Code on the web). Keep secrets out of them." | README.md:69
F47 | page: "Node 18 or later and git. On Windows, Claude Code runs plugin hooks through Git Bash, which comes with Git for Windows." | source: "You need **Node 18 or later** and **git**." | README.md:112 | source: "On Windows, Claude Code runs plugin hooks through **Git Bash**, which comes with Git for Windows." | README.md:114
F48 | page: "The relay needs Claude Code 2.1.275 or later and works in a terminal and in the VS Code chat panel." | source: "It needs Claude Code 2.1.275 or later, and works in a terminal and in the VS Code chat panel." | README.md:85
F49 | page: "When it uses up its clears for that Claude Code window, or when two continued sessions in a row make no new commit (outside a git repo, only the count applies). It says why. When the task is finished, Claude ends without a handover, so there is nothing to continue." | source: "The relay stops, and says why, when it uses up its clears for that Claude Code window, or when two continued sessions in a row make no new commit (outside a git repo, only the count applies). When the task is finished, Claude ends without a handover, so there is nothing to continue." | README.md:85
F45 | page: "It stays out of the way for a subagent's save, a failed save, an interrupted turn and headless runs." | source: "It stays out of the way for a subagent's save, a failed save, an interrupted turn and headless runs" | CHANGELOG.md:53

## Nudge default and settings

F24 | page: "The nudge is off by default. Past 180k tokens of context (the default; Nudge at changes it), the plugin asks Claude once per session to save a handover." | source: "**The nudge** (auto mode) is off by default." | README.md:210 | source: "Past 180k tokens of context (the default; **Nudge at** changes it), the plugin asks Claude once per session to save a handover" | README.md:222

## Comparison (README.md:24 to 28)

F101 | page: "Its own summary of the chat" | source: "| `/compact` | Its own summary of the chat | What the summary leaves out | Smaller |" | README.md:33
F102 | page: "What the summary leaves out" | source: "| `/compact` | Its own summary of the chat | What the summary leaves out | Smaller |" | README.md:33
F103 | page: "The whole chat" | source: "| `--resume` | The whole chat | Nothing | Same as before |" | README.md:34
F104 | page: "Nothing" | source: "| `--resume` | The whole chat | Nothing | Same as before |" | README.md:34
F105 | page: "Everything, including where you were" | source: "| `/clear` | Nothing | Everything, including where you were | Empty |" | README.md:35
F106 | page: "A short handover it wrote on purpose" | source: "| **clear-resume** | **A short handover it wrote on purpose** | **The rest of the chat** | **Just the handover** |" | README.md:36

## how-it-works.html: the handover

F110 | page: "Claude reads your branch, your changes and your last few commits." | source: "Claude reads your branch, your changes and your last few commits." | README.md:48
F111 | page: "Each loaded handover is also saved as markdown in ~/.clear-resume/loaded/ for 30 days." | source: "Each loaded handover is also saved as markdown in `~/.clear-resume/loaded/` for 30 days." | README.md:186
F112 | page: "The plugin checks for a waiting handover when a session starts, after /clear and after compaction (when /compact, or Claude Code on its own, shrinks the chat). When nothing is waiting, it prints nothing." | source: "The plugin checks for a waiting handover when a session starts, after `/clear` and after compaction (when `/compact`, or Claude Code on its own, shrinks the chat). When nothing is waiting, it prints nothing." | README.md:66
F113 | page: "Known limitation: the loop runs on /clear. A session started with --resume or /resume loads nothing." | source: "### Known limitations" | CHANGELOG.md:141 | source: "The loop runs on `/clear`. A session started with `--resume` or `/resume` loads nothing." | CHANGELOG.md:146
F114 | page: "Each handover belongs to the Claude Code window that wrote it. While that window is open, it is the only one that loads the handover after /clear." | source: "**Each handover belongs to the Claude Code window that wrote it.** While that window is open, it is the only one that loads the handover after `/clear`." | README.md:159
F115 | page: "Other windows on the same project list it when they start, and load it only if you ask." | source: "Other windows on the same project list it when they start, and load it only if you ask." | README.md:159
F116 | page: "Once that window closes, a session on the same branch loads it, if it is 7 days old or less." | source: "Once that window closes, a session on the same branch loads it." | README.md:159 | source: "from a closed window,<br>on your branch,<br>7 days old or less" | README.md:170
F117 | page: "If it is the only one waiting from a closed window, it loads on any branch, if it is 7 days old or less." | source: "the only one waiting,<br>from a closed window,<br>any branch, 7 days old or less" | README.md:171
F118 | page: "A handover older than 7 days is listed, not loaded." | source: "A handover older than 7 days is listed, not loaded." | README.md:159
F119 | page: "After compaction, only this window's own handover loads." | source: "After compaction, only this window's own handover loads." | README.md:178
F120 | page: "A handover loads in the checkout it was saved in." | source: "A handover loads in the checkout it was saved in;" | CHANGELOG.md:117
F121 | page: "These are the common cases." | source: "These are the common cases." | README.md:178
F122 | page: "Where it is kept" | source: "Handovers are plain text files on your disk, in `~/.clear-resume`." | README.md:69
F123 | page: "When it loads" | source: "The plugin checks for a waiting handover when a session starts" | README.md:66
F124 | page: "What does not load it" | source: "A session started with `--resume` or `/resume` loads nothing." | CHANGELOG.md:146
F125 | page: "Which handover loads" | source: "Which handover loads when a session starts" | README.md:162
F126 | page: "What it holds" | source: "Then it writes a short note about the work, called a handover" | README.md:48

## how-it-works.html: loop diagram

F130 | page: "work" | source: "Claude carries on from the handover." | README.md:64
F131 | page: "the chat grows" | source: "when a chat has grown long" | README.md:66
F132 | page: "nudge" | source: "**The nudge** (auto mode) is off by default." | README.md:210
F133 | page: "with the nudge on" | source: "To turn it on" | README.md:210
F134 | page: "asks Claude to save" | source: "the plugin asks Claude once per session to save a handover" | README.md:222
F135 | page: "save" | source: "**Save a handover.**" | README.md:48
F136 | page: "Claude writes a handover" | source: "Then it writes a short note about the work, called a handover" | README.md:48
F137 | page: "you ask, or the nudge does" | source: "Type `/clear-resume:handover`." | README.md:48 | source: "the plugin asks Claude once per session to save a handover" | README.md:222
F138 | page: "you type it" | source: "Type `/clear`." | README.md:55
F139 | page: "or the plugin, with the relay on" | source: "the plugin runs `/clear` when the turn ends" | README.md:73
F140 | page: "load" | source: "The fresh session starts with the handover already loaded." | README.md:55
F141 | page: "the fresh session loads it" | source: "The fresh session starts with the handover already loaded." | README.md:55
F142 | page: "carry on" | source: "**Carry on.**" | README.md:64
F143 | page: "Claude works and the chat grows." | source: "when a chat has grown long" | README.md:66
F144 | page: "With the nudge on, past the size you set, the plugin asks Claude to save a handover." | source: "Claude saves a handover at the size you set." | README.md:78 | source: "the plugin asks Claude once per session to save a handover" | README.md:222
F145 | page: "Claude saves a handover: you type /clear-resume:handover, or the nudge asks." | source: "Type `/clear-resume:handover`." | README.md:48 | source: "Claude is asked to save a handover" | README.md:207
F146 | page: "/clear: you type it, or the plugin runs it when the turn ends, with the relay on." | source: "Type `/clear`." | README.md:55 | source: "the plugin runs `/clear` when the turn ends" | README.md:73
F147 | page: "The fresh session loads the handover, and Claude carries on." | source: "The fresh session starts with the handover already loaded." | README.md:55 | source: "Claude carries on from the handover." | README.md:64
F148 | page: "The loop" | source: "The loop runs on `/clear`." | CHANGELOG.md:146

## how-it-works.html: worked example (README's example, never called real)

F150 | page: "The README's example: a handover in a widget-shop repo, saved, loaded after /clear, and the copy it leaves." | source: "A long chat in the widget-shop project" | README.md:43 | source: "Claude writes a handover titled Cart totals rounding" | README.md:43 | source: "After /clear, the next session in ~/code/widget-shop loads it automatically." | README.md:43 | source: "the path of a copy to read or share" | README.md:43
F151 | page: "The copy in ~/.clear-resume/loaded/ stays for 30 days: reread what a session started from, or @-mention it in another session." | source: "Each loaded handover is also saved as markdown in `~/.clear-resume/loaded/` for 30 days." | README.md:186 | source: "Reread what a session started from, or @-mention it in another session." | README.md:186
F152 | page: "~/.clear-resume/loaded/widget-shop-cart-totals-rounding-31c9af7.md" | source: "A copy to read or share: ~/.clear-resume/loaded/widget-shop-cart-totals-rounding-31c9af7.md" | README.md:59
F153 | page: "# the copy, as the README's screenshot of it reads" | source: "An editor tab titled widget-shop-cart-totals-rounding-31c9af7.md, in ~/.clear-resume/loaded. The file reads:" | README.md:183
F154 | page: "# Cart totals rounding" | source: "The file reads: # Cart totals rounding." | README.md:183
F155 | page: "Repo: widget-shop. Branch: fix/cart-rounding." | source: "Repo: widget-shop. Branch: fix/cart-rounding." | README.md:183
F156 | page: "Goal: Cart totals must round to the cent the way the payment provider does, so the checkout total and the receipt always match." | source: "Goal: Cart totals must round to the cent the way the payment provider does, so the checkout total and the receipt always match." | README.md:183
F157 | page: "Next action: Run npm test -- cart and fix src/cart.js:2 so cartTotal rounds once at the end, half-up, to 2 decimal places." | source: "Next action: Run npm test -- cart and fix src/cart.js:2 so cartTotal rounds once at the end, half-up, to 2 decimal places." | README.md:183
F159 | page: "Claude keeps" | source: "| | Claude keeps | You lose | Chat size after |" | README.md:31
F160 | page: "You lose" | source: "| | Claude keeps | You lose | Chat size after |" | README.md:31
F161 | page: "Chat size after" | source: "| | Claude keeps | You lose | Chat size after |" | README.md:31
F162 | page: "Smaller" | source: "| `/compact` | Its own summary of the chat | What the summary leaves out | Smaller |" | README.md:33
F163 | page: "Same as before" | source: "| `--resume` | The whole chat | Nothing | Same as before |" | README.md:34
F164 | page: "Nothing" | source: "| `/clear` | Nothing | Everything, including where you were | Empty |" | README.md:35
F165 | page: "Empty" | source: "| `/clear` | Nothing | Everything, including where you were | Empty |" | README.md:35
F166 | page: "The rest of the chat" | source: "| **clear-resume** | **A short handover it wrote on purpose** | **The rest of the chat** | **Just the handover** |" | README.md:36
F167 | page: "Just the handover" | source: "| **clear-resume** | **A short handover it wrote on purpose** | **The rest of the chat** | **Just the handover** |" | README.md:36
F168 | page: "/compact" | source: "| `/compact` | Its own summary of the chat | What the summary leaves out | Smaller |" | README.md:33
F169 | page: "--resume" | source: "| `--resume` | The whole chat | Nothing | Same as before |" | README.md:34
F170 | page: "clear-resume" | source: "| **clear-resume** | **A short handover it wrote on purpose** | **The rest of the chat** | **Just the handover** |" | README.md:36
F171 | page: "Compared with /compact, --resume and /clear" | source: "How this compares with <code>/compact</code>, <code>--resume</code> and <code>/clear</code>" | README.md:28
F172 | page: "Source: the comparison table in the README." | source: "| | Claude keeps | You lose | Chat size after |" | README.md:31
F158 | page: "Decisions already made: Round once, at the total, never per line: the payment provider does the same." | source: "Decisions already made: Round once, at the total, never per line: the payment provider does the same." | README.md:183

## how-it-works.html: the model (slot values written by app.js)

F173 | page: "The model" | source: "clear-resume cost model." | site/model.js:1
F174 | page: "A model, not a measurement. Claude rereads the whole context for every reply: set a task and see how much it rereads with clear-resume and without it." | source: "A model, not a measurement." | site/model.js:1 | source: "Claude rereads the whole context for every reply." | README.md:25
F175 | page: "Context window" | source: "1M-token context window" | README.md:91
F176 | page: "1M" | source: "is what the author uses on a 1M-token context window" | README.md:91
F177 | page: "200k" | source: "On a 200k window" | README.md:91
F178 | page: "Start size {mStart}" | source: "the size your sessions start at" | README.md:91 | source: "mStart: tok(start)" | site/app.js:213
F179 | page: "Typical values: see Start size below" | source: "keep it well above the size your sessions start at" | README.md:91
F180 | page: "Clear at {mClearAt}" | source: "Claude saves a handover at the size you set." | README.md:78 | source: "mClearAt: tok(clearAt)" | site/app.js:213
F181 | page: "Task size {mWork}" | source: "mWork: tok(work)" | site/app.js:213 | source: "var add = Math.min(STEP, work - done);" | site/model.js:19
F182 | page: "On a 200k window, the run without clear-resume compacts on its own at {mCompact} (assumed)." | source: "If your model's context window is 200k tokens, set **Nudge at** below the size where Claude Code compacts on its own" | README.md:222 | source: "mCompact: tok(M.compactAt(win))" | site/app.js:213
F183 | page: "Reread over the task: {mClearReread} with clear-resume, {mBaseReread} without it." | source: "Claude rereads the whole context for every reply." | README.md:25 | source: "vals.mClearReread = tok(r.clear.reread);" | site/app.js:214 | source: "vals.mBaseReread = tok(r.base.reread);" | site/app.js:215
F184 | page: "without it: Claude Code compacts on its own" | source: "the size where Claude Code compacts on its own" | README.md:91
F185 | page: "Resets" | source: "return { resets: resets, peak: peak, reread: reread" | site/model.js:32
F186 | page: "Peak context" | source: "return { resets: resets, peak: peak, reread: reread" | site/model.js:32
F187 | page: "Context reread" | source: "return { resets: resets, peak: peak, reread: reread" | site/model.js:32 | source: "Claude rereads the whole context for every reply." | README.md:25
F188 | page: "{mClearResets}" | source: "vals.mClearResets = String(r.clear.resets);" | site/app.js:214
F189 | page: "{mClearPeak}" | source: "vals.mClearPeak = tok(r.clear.peak);" | site/app.js:214
F190 | page: "{mClearReread}" | source: "vals.mClearReread = tok(r.clear.reread);" | site/app.js:214
F191 | page: "without it" | source: "the size where Claude Code compacts on its own" | README.md:91
F192 | page: "{mBaseResets}" | source: "vals.mBaseResets = String(r.base.resets);" | site/app.js:215
F193 | page: "{mBasePeak}" | source: "vals.mBasePeak = tok(r.base.peak);" | site/app.js:215
F194 | page: "{mBaseReread}" | source: "vals.mBaseReread = tok(r.base.reread);" | site/app.js:215
F195 | page: "Source: site/model.js, a model, not a measurement." | source: "A model, not a measurement." | site/model.js:1
F196 | page: "Each reply adds 5000 new tokens to the context: assumed." | source: "var STEP = 5000;" | site/model.js:3
F197 | page: "Claude rereads the whole context for every reply, so the reread figure is the context summed over every reply." | source: "Claude rereads the whole context for every reply." | README.md:25 | source: "reread += ctx;" | site/model.js:27
F198 | page: "After a clear, the run restarts at the start size plus the handover: about 780 tokens in the handover, an estimate. Measured on the author's own 104 /clears, 20 to 28 Sep 2026, medians." | source: "clear: walk(opts.start, opts.work, opts.clearAt, opts.start + HANDOVER)," | site/model.js:37 | source: "About 780 tokens in the handover, an estimate" | README.md:104 | source: "Measured on the author's own 104 /clears, 20 to 28 Sep 2026, medians." | README.md:104
F199 | page: "Without clear-resume, the run compacts at nine tenths of the window and keeps an 8000-token summary: both assumed." | source: "var SUMMARY = 8000;" | site/model.js:5 | source: "var COMPACT_AT = 0.9;" | site/model.js:6
F200 | page: "The model clears at or below the clear-at size. The plugin asks Claude to save once context is past the size you set, and Claude then saves, so in use, peaks pass it." | source: "if (ctx + add > limit) {" | site/model.js:20 | source: "Past 180k tokens of context (the default; **Nudge at** changes it), the plugin asks Claude once per session to save a handover" | README.md:222

## Measured by hand (lines that cite the block above)

F70 | page: "Stock Claude Code starts at 21,200 tokens before your first message." | source: "Stock Claude Code starts at 21,200 tokens before your first message" | FACTS.md: Measured by hand
F71 | page: "Claude Code 2.1.289, Opus 5.5, empty CLAUDE_CONFIG_DIR, cwd with no CLAUDE.md, .claude or .mcp.json above it, 0 MCP servers, 27 tools. One headless "say hi" run; cache_creation_input_tokens 21,200 + input_tokens 2, read from the first assistant message, 2026-10-04." | source: "Claude Code 2.1.289, Opus 5.5, empty CLAUDE_CONFIG_DIR, cwd with no CLAUDE.md, .claude or .mcp.json above it, 0 MCP servers, 27 tools. One headless "say hi" run; cache_creation_input_tokens 21,200 + input_tokens 2, read from the first assistant message. (measured 2026-10-04)" | FACTS.md: Measured by hand
F72 | page: "The author's sessions start at 77k to 99k (rules, skills, MCP)." | source: "The author's sessions start at 77k to 99k (rules, skills, MCP)." | FACTS.md: Measured by hand
F73 | page: "On the API, cache reads are billed at a tenth of the input price." | source: "On the API, cache reads are billed at a tenth of the input price (Anthropic prompt caching pricing)." | FACTS.md: Measured by hand

## how-it-works.html: start size (each row has its own source line)

F201 | page: "Start size" | source: "Stock Claude Code starts at 21,200 tokens before your first message" | FACTS.md: Measured by hand (copied from TASK.md as-is)
F202 | page: "21,200" | source: "Stock Claude Code starts at 21,200 tokens before your first message" | FACTS.md: Measured by hand (copied from TASK.md as-is)
F203 | page: "Source: one headless run, measured 2026-10-04." | source: "One headless "say hi" run" | FACTS.md: Measured by hand (copied from TASK.md as-is) | source: "(measured 2026-10-04)" | FACTS.md: Measured by hand (copied from TASK.md as-is)
F204 | page: "77k to 99k" | source: "The author's sessions start at 77k to 99k (rules, skills, MCP)." | FACTS.md: Measured by hand (copied from TASK.md as-is)
F205 | page: "Source: the author's own sessions." | source: "The author's sessions start at 77k to 99k (rules, skills, MCP)." | FACTS.md: Measured by hand (copied from TASK.md as-is)

## how-it-works.html: settings (option names only as the sources write them)

F206 | page: "Settings" | source: "three options that are not set yet" | README.md:121
F207 | page: "After install, Claude Code says, or asks about, three options that are not set yet. They belong to the nudge and the relay, which are both off by default." | source: "Claude Code then says, or asks about, three options that are not set yet. They belong to the nudge and the relay, which are both off by default." | README.md:121
F208 | page: "Nudge to save a handover" | source: "switch on **Nudge to save a handover**" | README.md:210
F209 | page: "Default: off" | source: "**The nudge** (auto mode) is off by default." | README.md:210
F210 | page: "Turns the nudge on. Past the Nudge at size, the plugin asks Claude once per session to save a handover, and prints a status line saying so." | source: "To turn it on, run this in Claude Code in a terminal and switch on **Nudge to save a handover**" | README.md:210 | source: "Past 180k tokens of context (the default; **Nudge at** changes it), the plugin asks Claude once per session to save a handover, and prints a status line saying so." | README.md:222
F211 | page: "Source: the README." | source: "**The nudge** (auto mode) is off by default." | README.md:210
F212 | page: "Nudge at" | source: "(the default; **Nudge at** changes it)" | README.md:222
F213 | page: "Default: 180k tokens" | source: "Past 180k tokens of context (the default;" | README.md:222
F214 | page: "The context size the nudge waits for. Claude Code keeps it between 50000 and 1000000 tokens." | source: "Past 180k tokens of context (the default; **Nudge at** changes it)" | README.md:222 | source: "Claude Code keeps the Nudge at setting between 50000 and 1000000 tokens." | CHANGELOG.md:76
F215 | page: "Source: the README (default), the CHANGELOG (range)." | source: "Past 180k tokens of context (the default;" | README.md:222 | source: "Claude Code keeps the Nudge at setting between 50000 and 1000000 tokens." | CHANGELOG.md:76
F216 | page: "relay" | source: "Set the `relay` option" | CHANGELOG.md:50
F217 | page: "Default: off" | source: "Off by default." | CHANGELOG.md:54
F218 | page: "A number of clears per Claude Code window, or unlimited. After Claude saves a handover, clear-resume runs /clear when the turn ends and submits the prompt that continues from it. Needs Claude Code 2.1.275 or later; an older build ignores it." | source: "to a number of clears per Claude Code window, or `unlimited`. After Claude saves a handover, clear-resume runs `/clear` when the turn ends and submits the prompt that continues from it." | CHANGELOG.md:51 | source: "Needs Claude Code 2.1.275 or later; an older build ignores it" | CHANGELOG.md:54
F219 | page: "Source: the CHANGELOG." | source: "Set the `relay` option (in `/config` or `/plugin configure`)" | CHANGELOG.md:50
F220 | page: "Set them with /plugin configure clear-resume@clear-resume, or in /config: the nudge settings need Claude Code 2.1.269 or later there. In the Claude Code panel in VS Code, set them from a terminal with claude plugin install clear-resume@clear-resume --config." | source: "Turn it on and set its size with `/plugin configure clear-resume@clear-resume`, or in `/config` in Claude Code 2.1.269 or later." | CHANGELOG.md:74 | source: "In the Claude Code panel in VS Code, set them from a terminal with `claude plugin install clear-resume@clear-resume --config`." | CHANGELOG.md:76 | source: "Set the `relay` option (in `/config` or `/plugin configure`)" | CHANGELOG.md:50
F221 | page: "The environment variables still work: CLEAR_RESUME_AUTO wins whenever it is set, and CLEAR_RESUME_NUDGE_AT wins when it is a positive number." | source: "The environment variables still work: `CLEAR_RESUME_AUTO` wins whenever it is set, and `CLEAR_RESUME_NUDGE_AT` wins when it is a positive number." | CHANGELOG.md:78
F222 | page: "Also opt-in: sync (to your own private git remote) and web mode (for Claude Code on the web)." | source: "Nothing is sent anywhere unless you turn on [sync](docs/HOW-IT-WORKS.md#syncing-two-machines-optional) (to your own private git remote) or [web mode](docs/HOW-IT-WORKS.md#claude-code-on-the-web-opt-in) (for Claude Code on the web)." | README.md:69
F223 | page: "Source: the README." | source: "Nothing is sent anywhere unless you turn on" | README.md:69

## changelog.html: releases

F224 | page: "Releases" | source: "# Changelog" | CHANGELOG.md:1
F225 | page: "Each release in CHANGELOG.md, newest first." | source: "# Changelog" | CHANGELOG.md:1 | source: "## 0.4.0" | CHANGELOG.md:3
F226 | page: "0.3.2" | source: "## 0.3.2" | CHANGELOG.md:36
F227 | page: "The relay stops when work stalls: it stops after two continued sessions in a row make no new commit, and says so." | source: "The relay stops when work stalls." | CHANGELOG.md:40 | source: "it stops after two continued sessions in a row make no new commit, and says so" | CHANGELOG.md:40
F228 | page: "Outside a git repo only the budget applies." | source: "Outside a git repo only the budget applies." | CHANGELOG.md:42
F229 | page: "With the relay on, the context nudge tells Claude to end without a handover when the task is finished." | source: "With the relay on, the context nudge tells Claude to end without a handover when the task is finished" | CHANGELOG.md:43
F230 | page: "0.3.1" | source: "## 0.3.1" | CHANGELOG.md:46
F231 | page: "The relay: clear and continue with no keypress." | source: "The relay: clear and continue with no keypress." | CHANGELOG.md:50
F232 | page: "After Claude saves a handover, clear-resume runs /clear when the turn ends and submits the prompt that continues from it." | source: "After Claude saves a handover, clear-resume runs `/clear` when the turn ends and submits the prompt that continues from it." | CHANGELOG.md:51
F233 | page: "Off by default. Needs Claude Code 2.1.275 or later; an older build ignores it." | source: "Off by default. Needs Claude Code 2.1.275 or later; an older build ignores it" | CHANGELOG.md:54
F234 | page: "0.3.0" | source: "## 0.3.0" | CHANGELOG.md:57
F235 | page: "Headless runs continue themselves: node plugin/scripts/run.mjs runs claude -p in segments." | source: "Headless runs continue themselves." | CHANGELOG.md:61 | source: "`node plugin/scripts/run.mjs` runs `claude -p` in segments." | CHANGELOG.md:61
F236 | page: "It needs caps (--max-segments, --total-budget-usd, and the command's own --max-turns and --max-budget-usd)." | source: "It needs caps (`--max-segments`, `--total-budget-usd`, and the command's own `--max-turns` and `--max-budget-usd`)" | CHANGELOG.md:64
F237 | page: "It stops the chain when two continued segments in a row make no new commit." | source: "stops the chain when two continued segments in a row make no new commit" | CHANGELOG.md:65
F238 | page: "0.2.1" | source: "## 0.2.1" | CHANGELOG.md:70
F239 | page: "The nudge has settings in Claude Code." | source: "The nudge has settings in Claude Code." | CHANGELOG.md:74
F240 | page: "Turn it on and set its size with /plugin configure clear-resume@clear-resume, or in /config in Claude Code 2.1.269 or later." | source: "Turn it on and set its size with `/plugin configure clear-resume@clear-resume`, or in `/config` in Claude Code 2.1.269 or later." | CHANGELOG.md:74
F241 | page: "0.2.0" | source: "## 0.2.0" | CHANGELOG.md:81
F242 | page: "Write one short handover on purpose, /clear, and that window's fresh session picks it up." | source: "Write one short handover on purpose, `/clear`, and that window's fresh session picks it up." | CHANGELOG.md:83
F243 | page: "Other open windows on the same project only list it." | source: "Other open windows on the same project only list it" | CHANGELOG.md:83
F244 | page: "Known limitation: the loop runs on /clear. A session started with --resume or /resume loads nothing." | source: "### Known limitations" | CHANGELOG.md:141 | source: "The loop runs on `/clear`. A session started with `--resume` or `/resume` loads nothing." | CHANGELOG.md:146

## changelog.html: build log (rows written by site/buildlog.mjs from git log)

F245 | page: "{sha} {when} {subject}" | source: "const out = execFileSync(\"git\", [\"log\", \"site-v5-base..site-v5\", \"--grep\", \"^site:\", \"--reverse\", \"--format=%h%x09%cI%x09%s\"]," | site/buildlog.mjs:23
F246 | page: "Build log" | source: "buildlog.mjs: writes the build log on changelog.html from git" | site/buildlog.mjs:1
F247 | page: "Each site: commit since site-v5-base, oldest first: short sha, AWST time and subject." | source: "Rows: every site: commit since site-v5-base, oldest first, as short sha, AWST time and subject." | site/buildlog.mjs:3
F248 | page: "Source: git log, written by buildlog.mjs." | source: "buildlog.mjs: writes the build log on changelog.html from git" | site/buildlog.mjs:1
F249 | page: "The totals will come from buildstats.mjs, run on this build's transcripts after the run, and be committed as stats:." | source: "run on this build's transcripts" | site/buildstats.mjs:6 | source: "After the run, its output is committed as stats:" | site/buildstats.mjs:6
F250 | page: "The totals came from buildstats.mjs, run on this build's transcripts after the run, and were committed as stats:." | source: "run on this build's transcripts" | site/buildstats.mjs:6 | source: "After the run, its output is committed as stats:" | site/buildstats.mjs:6
F251 | page: "0.4.0" | source: "## 0.4.0" | CHANGELOG.md:3
F252 | page: "/relay for one window: it overrides the relay option for the window you type it in and starts its count over." | source: "`/relay` for one window." | CHANGELOG.md:7 | source: "overrides the `relay` option for the window you type it in and starts its count over" | CHANGELOG.md:7
F253 | page: "A countdown of the clears left. The status line shows it while the relay is on." | source: "A countdown of the clears left." | CHANGELOG.md:10 | source: "The status line shows it while the relay is on." | CHANGELOG.md:10
F254 | page: "The relay works from the VS Code chat panel." | source: "The relay works from the VS Code chat panel." | CHANGELOG.md:12
F255 | page: "VS Code extension 0.4.0: a context pie in the status bar, a relay item showing this window's clears used against its budget, and a Worktrees view." | source: "VS Code extension 0.4.0" | CHANGELOG.md:19 | source: "Context pie** in the status bar" | CHANGELOG.md:21 | source: "Relay item** showing this window's clears used against its budget" | CHANGELOG.md:24 | source: "Worktrees view" | CHANGELOG.md:25

## Footer

F31 | page: "Built in {sessions} sessions and {clears} automatic clears, {commits} commits, {first} to {last} AWST, {date}. Build log" | source: "run on this build's transcripts" | site/buildstats.mjs:6 | source: "const sessions = out.length;" | site/buildstats.mjs:127 | source: "const clears = sessions - 1;" | site/buildstats.mjs:128 | source: "const commits = lines.length;" | site/buildstats.mjs:147 | source: "const awst = (iso) => {" | site/buildstats.mjs:134 | source: "date: commits ? awstDate(lines[0]) : \"n/a\"" | site/buildstats.mjs:149
F50 | page: "MIT licence. Independent, not made or endorsed by Anthropic." | source: "MIT licence</a>. clear-resume is an independent project. It is not made or endorsed by Anthropic." | README.md:241
