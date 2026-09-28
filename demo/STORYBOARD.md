---
workflow: general-video
mode: autonomous
message: "Clear often, lose nothing."
aspect: 1920x1080 and 1080x1920
fps: 30
duration: 75
architecture: monolithic
version: v3 (explainer)
---

# Storyboard v3 - clear-resume explainer

One story, two cuts, 75 seconds each. `vertical/story.js` holds every word and every timing;
`vertical/base.css` holds the shared look; `index.html` (16:9) and `vertical/index.html` (9:16)
only set the canvas layout. The two cuts cannot drift in wording or timing.

**Layout.** 16:9: the terminal window on the left (1150x830), the side cards in a column on
the right. 9:16: the terminal on top (960x1110), the cards stacked below it, beat label above
the window. Cards never sit over the terminal. Two beats replace the terminal instead of
sitting beside it: the numbers (full canvas) and the sidebar (a VS Code mock in the window's
place).

**Metaphor.** The side cards explain with the shift-handover note: a nurse at shift change
writes a note, the next shift reads it and carries on. The metaphor cards (marked *shift*)
are set on a warmer, paper-like card.

**Words on screen come in two kinds.**

- CAPTURED: printed by the real plugin, copied verbatim from
  `D:/Scratch/cr-video3-sandbox/captured-text.md` (plugin 0.1.6, `feat/loaded-handover` @
  `20d987c`, short id `31c9af7`). A long body is shortened only by leaving whole lines out.
  The `SessionStart:clear says:` / `Stop says:` prefixes and the `⎿` glyph are Claude Code's
  rendering, as the capture file records.
- AUTHORED: the user's prompts and Claude's replies. Every one is labelled `you` or `Claude`
  in the terminal's speaker column (16:9) or on the line above it (9:16).

Two capture findings shape what is shown:

- Claude's `Resuming handover "..."` line is requested, not guaranteed, so it is not shown.
  After `go`, Claude's reply is an authored, labelled line.
- The second window's line does not say whose handover it is. The card says only what the
  plugin does (it does not load it), not that window 2 explains ownership.

The context meter is a bar with no number on it. It fills and empties to show the idea; it
makes no claim. The only numbers are in beat 05, each with its source line.

---

## 01 THE PROBLEM - 0.0 to 9.5s

Terminal (phase `p1`, scrolls from the foot). Earlier turns already on screen, fading into
the top edge. Then, printed one by one while the meter climbs past 90%:

| Speaker | Line | Kind |
|---|---|---|
| you | `> the receipt total is a cent less than the cart total` | authored |
| Claude | `Read src/cart.js`, `Read src/receipt.js`, `Read test/cart.test.js`, `Bash npm test -- cart` | authored |
| Claude | `Reproduced: 3 items at $19.99 total 59.97 in the cart but 59.96 on the receipt.` | authored |

| Card | Text | Paraphrase (what it concretely claims) |
|---|---|---|
| 1a (1.2s) | Context: everything Claude is holding in mind for this chat. | "Context" is the name for all the conversation text Claude keeps in view for this chat. |
| 1b (4.4s) | Each reply rereads all of it, so long chats get slow. | Claude reads the whole conversation again for every reply, so a longer conversation takes longer. |
| 1c (6.9s) | Long chats also cost more, and Claude starts losing track. | A longer conversation uses more paid capacity and Claude keeps track of it less well. |

## 02 TWO OLD WAYS - 9.5 to 17.0s

Terminal: the user types `/compact`, deletes it, types `/clear`, deletes it (authored,
labelled `you`). The meter stays near full.

| Card | Text | Paraphrase |
|---|---|---|
| 2a (10.2s) | /compact: Claude summarises itself. You do not choose what stays. | The /compact command makes Claude write its own summary, and the user has no say in what it keeps. |
| 2b *shift* (13.6s) | /clear: a fresh start. Like a new shift with no note. | The /clear command empties the conversation, so the new session knows nothing of the old one. |

## 03 THE NOTE - 17.0 to 30.3s

Terminal (phase `p3`):

| Speaker | Line | Kind |
|---|---|---|
| you | `> /clear-resume:handover` (typed) | authored prompt, real skill name |
| Claude | `Bash node "${CLAUDE_PLUGIN_ROOT}/scripts/save.mjs" --title "Cart totals rounding" <<'EOF'` | captured command |
| | `# Cart totals rounding`, `## Goal` + its line, `## Next action` + its line, `## Decisions already made` + its first line, `EOF` | captured body, State and Key files left out |
| | `⎿ Saved handover "Cart totals rounding" (id 31c9af7).` / `After /clear, the next session in ~/code/widget-shop loads it automatically.` | captured stdout, verbatim |
| you | `> /clear` (typed at 28.6s; the session then leaves upward and the meter empties) | authored |

| Card | Text | Paraphrase |
|---|---|---|
| 3a (17.6s) | A third way: a short handover note, written on purpose. | Besides /compact and /clear, the user can ask for a short note about the work, at a moment they pick. |
| 3b *shift* (20.4s) | Like a nurse's shift note, so the next shift can carry on. | The note does the job a nurse's handover note does: the next session reads it and continues the work. |
| 3c (22.4s) | It holds the goal, the next step and the decisions made. | The note contains the goal, the next action and the decisions already taken. |

## 04 CLEAR, THEN GO - 30.3 to 41.2s

Terminal (phase `p4`, a fresh session, starts at the top; meter near empty):

| Speaker | Line | Kind |
|---|---|---|
| | `⎿ SessionStart:clear says: clear-resume: loaded handover "Cart totals rounding" (saved just now).` | captured (prefix is Claude Code's) |
| | `A copy to read or share: ~/.clear-resume/loaded/widget-shop-cart-totals-rounding-31c9af7.md` | captured; lights up at 38.0s |
| you | `> go` | authored |
| Claude | `The handover's next action: run the cart tests, then fix src/cart.js:2.` | authored |
| Claude | `Bash npm test -- cart`, `Edit src/cart.js`, `Bash npm test -- cart` | authored |
| Claude | `cartTotal now rounds once, at the total. The cart tests pass.` | authored |

| Card | Text | Paraphrase |
|---|---|---|
| 4a (30.6s) | Type /clear. The fresh session loads the note by itself. | After the user types /clear, the new session reads the note without being asked. |
| 4b *shift* (32.8s) | Then type go. The next shift reads the note and carries on. | The user types "go" and the new session continues the work from the note. |
| 4c (37.9s) | It also saves a readable copy and prints where it is. | On loading, the plugin writes a copy of the note to a file and prints that file's path. |

## 05 THE NUMBERS - 41.5 to 50.2s

The window steps aside; full-canvas numbers. 16:9 in a row, 9:16 stacked.

| Element | Text | Paraphrase |
|---|---|---|
| definition | Token: a small piece of text, roughly a word. | A token is the unit Claude counts text in, about one word. |
| stat 1 | 197,536 / tokens in the chat before each /clear | The median conversation was 197,536 tokens long when the author cleared it. |
| stat 2 | 102,088 / tokens freed by each /clear | The median /clear removed 102,088 tokens from the context. |
| stat 3 | about 780 / tokens in the handover note (an estimate) | A handover note is roughly 780 tokens; this figure is an estimate. |
| share | The note is about 0.4% of the chat it replaces. | 780 tokens is about 0.4% of 197,536 tokens. |
| source | Measured on the author's own 104 /clears, 20 to 28 Sep 2026, medians. | The figures come from the author's own 104 clears in that week, as medians. |

No quality claim and no "work per token" figure.

## 06 MANY WINDOWS - 50.3 to 56.4s

Window 1 (tag `window 1`, meter full) shows the save it has just made: `> /clear-resume:handover`
(you), the captured save command without the body, and the two captured stdout lines. Window 2
(tag `window 2`) slides in over the empty lower half and shows its captured startup line:

`⎿ SessionStart:startup says: clear-resume: 1 handover waiting for this repo: "Cart totals rounding". Say which to resume.`

| Card | Text | Paraphrase |
|---|---|---|
| 6a (50.9s) | Each note belongs to the window that wrote it. | A note is tied to the Claude Code window that saved it. |
| 6b (53.3s) | Other open windows see it waiting. They do not load it. | Another window open in the same repo lists the note as waiting but does not load it on its own. |

## 07 THE SIDEBAR - 56.6 to 62.8s

The window becomes a VS Code mock. All text captured from `view.mjs` / the extension:
`CLEAR-RESUME: HANDOVERS`, group `Loaded 1`, row `✓ Cart totals rounding  loaded 3h ago`,
status bar `Handover: Cart totals rounding (loaded 3h ago)`. The status item highlights at
59.7s and the readable copy opens at 60.3s in a tab named
`widget-shop-cart-totals-rounding-31c9af7.md` (the copy's first lines, verbatim).

| Card | Text | Paraphrase |
|---|---|---|
| 7a (57.2s) | Hours later, the sidebar shows what this window loaded. | Some hours after the load, the VS Code sidebar lists the note this window loaded. |
| 7b (59.3s) | Click the status bar line to reopen the note. | Clicking the status bar item opens the readable copy of the loaded note. |

## 08 AUTO MODE - 63.0 to 68.2s

Terminal (phase `p8`): a long session again, meter near full. Earlier turns (authored,
labelled), then the captured nudge:

`Stop says: clear-resume: context is about 182k tokens (nudge at 180k). Claude is asked to save a handover, then you can type /clear.`

| Card | Text | Paraphrase |
|---|---|---|
| 8a (63.4s) | Auto mode is off unless you turn it on. | The automatic prompt only runs if the user enables it. |
| 8b (65.3s) | When on, it offers a handover past a size you choose. | With auto mode on, once the context passes a size the user sets, the plugin suggests saving a handover. |

## CLOSE - 68.5 to 75.0s

| Element | Text | Paraphrase |
|---|---|---|
| headline | Clear often, lose nothing. | You can clear sessions often and still keep your place in the work. |
| line | clear-resume: a free, open-source plugin for Claude Code. | clear-resume costs nothing, its code is public, and it adds to Claude Code. |
| install | `claude plugin marketplace add https://github.com/m4cd4r4/clear-resume` / `claude plugin install clear-resume@clear-resume` | captured (flow 7, HTTPS form). 9:16 breaks the first with `\`. |
| foot | Made by an independent developer. Not an Anthropic product. | Anthropic did not make or endorse this plugin. |

---

## Motion rules

Carried over from v2: the typed-prompt law from `code-terminal-run` (string-at-time table
built before the timeline registers, integer-cycle caret), binary reveals with a short lift
rather than fades, one ease:none driver for the meter, finite ambient repeats. New: typing
can also erase (beat 02), terminal rows are `display:none` until printed so newer rows push
older ones up like a real terminal, and a phase that scrolls fades its top edge.
