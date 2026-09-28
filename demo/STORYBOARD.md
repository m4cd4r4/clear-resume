---
workflow: general-video
mode: autonomous
message: "Clear often, lose nothing."
aspect: 1920x1080 and 1080x1920
fps: 30
duration: 75
architecture: monolithic
version: v3.1 (explainer, after two critic passes)
---

# Storyboard v3.1 - clear-resume explainer

One story, two cuts, 75 seconds each. `vertical/story.js` holds every word and every timing;
`vertical/base.css` holds the shared look; `index.html` (16:9) and `vertical/index.html` (9:16)
only set the canvas layout. The two cuts cannot drift in wording or timing.

**Layout.** 16:9: the terminal window on the left (1150x830), the side cards in a column on
the right. 9:16: the terminal on top (960x1110), the cards stacked below it, beat label above
the window. Cards never sit over the terminal. Two beats replace the terminal instead of
sitting beside it: the numbers (full canvas) and the sidebar (a VS Code mock in the window's
place). In beat 06 window 1 is shortened (470px / 800px, from `--win1-many-h`) so window 2
sits below it in its own frame, offset right, never inside it.

**No metaphor.** v3.1 explained the note as a nurse's shift note. The owner found it too
obscure (2026-09-28), and it added a thing to decode: the terminal already shows the real
note. Every card now states what happens in plain words.

**Words on screen come in two kinds.**

- CAPTURED: printed by the real plugin, copied verbatim from
  `D:/Scratch/cr-video3-sandbox/captured-text.md` (plugin 0.1.6, `feat/loaded-handover` @
  `20d987c`, short id `31c9af7`). A long body is shortened only by leaving whole lines out.
  The `SessionStart:clear says:` / `Stop says:` prefixes and the `⎿` glyph are Claude Code's
  rendering, as the capture file records.
- AUTHORED: the user's prompts and Claude's replies. Every one is labelled `you` or `Claude`
  in the terminal's speaker column (16:9) or on the line above it (9:16).

Two capture findings shape what is shown:

- Claude's `Resuming handover "..."` line is requested, not guaranteed, so it is not shown,
  and Claude's authored reply after `go` does not mention the handover either. It opens with
  the action.
- The second window's line does not say whose handover it is. The cards say what the plugin
  does (only the writing window loads it; others list it and load it only if asked).

The context meter is a bar with no number on it. It fills and empties to show the idea; it
makes no claim. The only numbers are in beat 05, each with its source line.

---

## 01 THE PROBLEM - 0.0 to 9.2s

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
| 1b (4.3s) | Each reply rereads all of it, so long chats get slow. | Claude reads the whole conversation again for every reply, so a longer conversation takes longer. |
| 1c (6.7s) | Long chats also use up more of your plan or budget. | A longer conversation uses more of the user's paid allowance or money. |

## 02 TWO BUILT-IN WAYS - 9.2 to 16.4s

Terminal: the user types `/compact`, deletes it, types `/clear`, deletes it (authored,
labelled `you`). The meter stays near full.

| Card | Text | Paraphrase |
|---|---|---|
| 2a (9.9s) | Chat full? /compact shrinks it into Claude's own summary. | When the conversation is full, the /compact command replaces it with a summary Claude writes. |
| 2b (13.0s) | /clear empties it. The next session starts knowing nothing. | The /clear command deletes the conversation, so the new session has none of the earlier work. |

## 03 THE NOTE - 16.4 to 28.3s

Terminal (phase `p3`):

| Speaker | Line | Kind |
|---|---|---|
| you | `> /clear-resume:handover` (typed) | authored prompt, real skill name |
| Claude | `Bash node "${CLAUDE_PLUGIN_ROOT}/scripts/save.mjs" --title "Cart totals rounding" <<'EOF'` | captured command |
| | `# Cart totals rounding`, `## Goal` + its line, `## Next action` + its line, `## Decisions already made` + its first line, `EOF` | captured body, State and Key files left out |
| | `⎿ Saved handover "Cart totals rounding" (id 31c9af7).` / `After /clear, the next session in ~/code/widget-shop loads it automatically.` | captured stdout, verbatim |
| you | `> /clear` (typed at 26.6s; the session then leaves upward and the meter empties) | authored |

In 9:16 the `you > /clear-resume:handover` row scrolls off the top once the body prints, so
card 3a names the command itself: a vertical viewer always sees what the user typed.

| Card | Text | Paraphrase |
|---|---|---|
| 3a (16.9s) | A third way: type /clear-resume:handover. Claude writes a short note. | Besides /compact and /clear, the user can type /clear-resume:handover and Claude then writes a short note about the work. |
| 3b (19.5s) | /clear wipes the chat, but the note is kept. | Running /clear deletes the conversation; the saved note is not deleted. |
| 3c (21.6s) | It holds the goal, the next step and the decisions made. | The note has set parts: the goal, the next action and the decisions already taken. |

## 04 CLEAR, THEN GO - 28.3 to 38.6s

Terminal (phase `p4`, a fresh session, starts at the top; meter near empty):

| Speaker | Line | Kind |
|---|---|---|
| | `⎿ SessionStart:clear says: clear-resume: loaded handover "Cart totals rounding" (saved just now).` | captured (prefix is Claude Code's) |
| | `A copy to read or share: ~/.clear-resume/loaded/widget-shop-cart-totals-rounding-31c9af7.md` | captured; lights up at 35.5s |
| you | `> go` | authored |
| Claude | `Running the cart tests, then fixing src/cart.js:2.` | authored (opens with the action, never names the handover) |
| Claude | `Bash npm test -- cart`, `Edit src/cart.js`, `Bash npm test -- cart` | authored |
| Claude | `cartTotal now rounds once, at the total. The cart tests pass.` | authored |

| Card | Text | Paraphrase |
|---|---|---|
| 4a (28.6s) | Type /clear. The fresh session loads the note by itself. | After the user types /clear, the new session reads the note without being asked. |
| 4b (30.8s) | Then type go. Claude reads the note and carries on. | The user types "go" and the new session continues the work from the note. |
| 4c (35.4s) | The plugin also keeps the note as a file to reopen or share. | On loading, the plugin writes the note to a file (the highlighted path) that the user can open later or send to someone. |

## 05 THE NUMBERS - 38.9 to 50.0s

The window steps aside; full-canvas numbers, revealed one at a time. 16:9 in a row, 9:16
stacked. The share line arrives last, at 45.0s, and has 4.7s alone before the beat ends.

Two figures only. The context before a /clear (median 197,536) is left out on purpose: the
gap between it and what a /clear frees is the author's own session-start setup (rules,
CLAUDE.md, tool schemas), which a typical user does not carry, so showing both invites a
subtraction that describes the author's machine, not the product.

| Element (at) | Text | Paraphrase |
|---|---|---|
| definition (39.1s) | Token: a small piece of text, roughly a word. | A token is the unit Claude counts text in, about one word. |
| stat 1 + source (40.2s) | 102,088 / tokens a typical /clear frees | The median drop in context from before /clear to the fresh session's first reply was 102,088 tokens. |
| stat 2 (42.6s) | about 780 / tokens in the handover note (an estimate) | A handover note is roughly 780 tokens; this figure is an estimate. |
| share (45.0s) | The note costs under 1% of what a /clear frees. | 780 is 0.76% of 102,088. |
| source | Measured on the author's own 104 /clears, 20 to 28 Sep 2026, medians. | The figures come from the author's own 104 clears in that week, as medians. |

No quality claim and no "work per token" figure.

## 06 MANY WINDOWS - 50.1 to 57.1s

Window 1 (tag `window 1`, meter full, shortened) shows the save it has just made:
`> /clear-resume:handover` (you), the full captured save line including `<<'EOF'`, then
`# Cart totals rounding` and `EOF` (the body lines between them left out), then the two
captured stdout lines. Window 2 (tag `window 2`) slides in below it, in its own frame with its
own shadow, and shows its captured startup line:

`⎿ SessionStart:startup says: clear-resume: 1 handover waiting for this repo: "Cart totals rounding". Say which to resume.`

| Card | Text | Paraphrase |
|---|---|---|
| 6a (50.5s) | Two Claude Code windows open on the same project? | This beat is about having two Claude Code sessions open in one project at once. |
| 6b (52.2s) | Only the window that wrote the note loads it after /clear. | After /clear, the note is loaded automatically only by the session that saved it. |
| 6c (54.2s) | Others list it when they start. They load it only if asked. | Another session in that project names the note when it starts, and loads it only if the user asks it to. |

## 07 VS CODE SIDEBAR - 57.3 to 63.7s

The window becomes a VS Code mock, titled `VS Code · widget-shop`. All other text captured
from `view.mjs` / the extension: `CLEAR-RESUME: HANDOVERS`, group `Loaded 1`, row
`✓ Cart totals rounding  loaded 3h ago`, status bar
`Handover: Cart totals rounding (loaded 3h ago)`. The status item highlights at 60.6s and the
readable copy opens at 61.2s in a tab named `widget-shop-cart-totals-rounding-31c9af7.md`
(the copy's first lines, verbatim).

| Card | Text | Paraphrase |
|---|---|---|
| 7a (57.9s) | The clear-resume VS Code extension lists each loaded note for a day. | A separate VS Code extension shows, in its sidebar, every note that was loaded in the last 24 hours. |
| 7b (60.2s) | Click the status bar line to reopen the note. | Clicking the status bar item opens the readable copy of the loaded note. |

## 08 OPTIONAL NUDGE - 63.9 to 69.2s

Terminal (phase `p8`): a long session again, meter near full. Earlier turns (authored,
labelled), then the captured nudge:

`Stop says: clear-resume: context is about 182k tokens (nudge at 180k). Claude is asked to save a handover, then you can type /clear.`

The beat label and cards avoid the words "auto mode", which Claude Code already uses for
something else; "nudge" is the word the plugin itself prints.

| Card | Text | Paraphrase |
|---|---|---|
| 8a (64.2s) | Optional: past a size you set, the plugin asks Claude for a note. | If the user turns it on, once the context passes a size they choose, the plugin tells Claude to write a handover. |
| 8b (66.4s) | Here that size is 180k tokens. It is off by default. | In this example the size is 180,000 tokens, and the feature does nothing unless turned on. |

## CLOSE - 69.4 to 75.0s

| Element | Text | Paraphrase |
|---|---|---|
| headline | Clear often, lose nothing. | You can clear sessions often and still keep your place in the work. (Owner's takeaway, kept.) |
| line | clear-resume: a free, open-source plugin for Claude Code. | clear-resume costs nothing, its code is public, and it adds to Claude Code. |
| install | `claude plugin marketplace add https://github.com/m4cd4r4/clear-resume` / `claude plugin install clear-resume@clear-resume` | captured (flow 7, HTTPS form). 9:16 breaks the first with `\`. |
| extension | The VS Code sidebar is a separate clear-resume extension. | The two commands above do not install the sidebar; it comes from its own extension. |
| foot | Made by an independent developer. Not an Anthropic product. | Anthropic did not make or endorse this plugin. |

---

## Critique pass (v3 -> v3.1)

Applied: every "must" (3a names the command and author; stat 2 explained and "each" became
"a typical"; 7a no longer says "this window"; beat 06 prints the whole save line with the
heredoc) and most "should" items (2a/2b rewritten and the shift metaphor held back to 3b;
beat label names the goal; window 2 in its own frame; 6a sets the situation; 6c matches
"Say which to resume"; sidebar named as a VS Code extension on the card, label, window
title and close; 1c drops the quality claim; 4c gives the reason; Claude's reply opens with
the action; numbers revealed in sequence with the beat 2.4s longer; share line says "of the
context before a /clear"; auto mode renamed to the optional nudge, feature first).

Skipped, with reason:

- Close headline "Clear often, lose nothing.": the owner fixed this takeaway; not revisited.
- Install command form: the HTTPS form is the one the owner's brief and the capture (flow 7)
  specify. The README mismatch is fixed outside the video (merge clear-resume PR #37, or put
  the HTTPS form in the release README) before the video is published.
- Extension availability: the close says the sidebar is a separate extension but cannot name
  a Marketplace listing that does not exist yet. Publish once the listing is live.

## Motion rules

Carried over from v2: the typed-prompt law from `code-terminal-run` (string-at-time table
built before the timeline registers, integer-cycle caret), binary reveals with a short lift
rather than fades, one ease:none driver for the meter, finite ambient repeats. Typing can
also erase (beat 02), terminal rows are `display:none` until printed so newer rows push
older ones up like a real terminal, and a phase that scrolls fades its top edge. Window 1's
height changes only while it is off screen.
