<a href="https://macdaraomurchu.com/products/cornerman/"><img src="docs/img/hero-card.webp" alt="The Cornerman page, with a film playing on a loop: a cartoon cat at its desk gorges on context, slows down and types worse. A handover lifts the load, and the cat works lighter and brighter, with its links and lists in order." width="640"></a>

<a href="https://marketplace.visualstudio.com/items?itemName=macdara.cornerman"><img alt="VS Code extension" src="https://img.shields.io/badge/VS%20Code-extension-262626?style=flat-square&labelColor=0a0a0a"></a> <a href="#install"><img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude%20Code-plugin-262626?style=flat-square&labelColor=0a0a0a"></a> <a href="https://open-vsx.org/extension/macdara/cornerman"><img alt="Open VSX" src="https://img.shields.io/badge/Open%20VSX-Cursor%2C%20VSCodium-262626?style=flat-square&labelColor=0a0a0a"></a> <a href="https://github.com/m4cd4r4/cornerman/actions/workflows/test.yml"><img alt="Tests on Windows, macOS and Linux" src="https://img.shields.io/github/actions/workflow/status/m4cd4r4/cornerman/test.yml?branch=main&style=flat-square&label=tests&labelColor=0a0a0a"></a> <a href="LICENSE"><img alt="Licence: MIT" src="https://img.shields.io/badge/licence-MIT-262626?style=flat-square&labelColor=0a0a0a"></a>

[Product page](https://macdaraomurchu.com/products/cornerman/) · [Install](#install) · [Features](#features) · [Full guide](docs/GUIDE.md) · [Changelog](CHANGELOG.md)

Cornerman shows how full each Claude Code chat is, saves a handover before you clear it, and keeps the tables, lists, links and paths from the cleared chat one click away.

<img src="docs/img/real-view.webp" alt="The whole run playing on a loop in VS Code: the chat fills, the nudge appears, the handover is saved, /clear runs, the fresh session resumes, and the loaded handover opens onto what was left on screen." width="900">

## Install

Plugin (in your terminal):

```
claude plugin marketplace add https://github.com/m4cd4r4/cornerman
claude plugin install cornerman@cornerman
```

You need Node 18 or later and git. On Windows, Claude Code runs plugin hooks through Git Bash, which comes with Git for Windows.

Extension: search "cornerman" in VS Code, or

```
code --install-extension macdara.cornerman
```

It is also on [Open VSX](https://open-vsx.org/extension/macdara/cornerman) for VSCodium and Cursor.

---

## Watch a handover run

The context fills, Claude saves a handover, and the fresh session carries on from it.

**1. Context fills**

<img src="docs/img/step-1.webp" alt="VS Code with a long Claude Code chat. Outlined in the status bar: the context pie at 231k of 250k, on amber." width="900">

**2. Nudge (off by default)**

<img src="docs/img/step-2.webp" alt="Past 250k, the pie is red. Outlined in the chat: cornerman: context is about 252k tokens (nudge at 250k). Claude is asked to save a handover, then you can type /clear." width="900">

**3. Handover**

<img src="docs/img/step-3.webp" alt="Claude has run the cornerman:handover skill. Outlined in the sidebar: a new handover row, Add checkout flow, saved now." width="900">

**4. Clear**

<img src="docs/img/step-4.webp" alt="Outlined: the prompt box, with /clear typed into it." width="900">

**5. Resume**

<img src="docs/img/step-5.webp" alt="The chat is empty and the pie is back to 31k. Outlined: the message go, and the reply Resuming handover Add checkout flow." width="900">

**6. Left on screen**

<img src="docs/img/step-6.webp" alt="The sidebar, outlined: the loaded handover is open, listing a table, a list, two links, a path and the last screen before the clear." width="900">

## Get back what was on screen

Tables, lists, links and paths from the cleared chat sit under each handover, one click away.

## Context counter

How full the chat is, filling towards the nudge size. Hover it to see which handover the tab loaded.

<img src="docs/img/counter.webp" alt="The status bar with the pie outlined at 204k of 250k, on amber. Its hover card shows the nudge size, the relay's clears, the loaded handover, the tokens read, and links to open the handover, the relay log, the nudge size, hand over now, and the idle mode." width="900">

## Idle smart

What happens while you are away. Off, toast, smart or auto.

<img src="docs/img/idle.webp" alt="The picker Idle handover for this tab, opened from the status bar item idle smart, outlined. Off does nothing while you are away. Toast shows a message before the prompt cache expires. Smart writes a handover and clears, unless the work is finished. Auto writes a handover and clears before the prompt cache expires." width="900">

## Relay

The window's clears left. Click to change them.

<img src="docs/img/relay.webp" alt="The picker Relay for this tab, opened from the status bar item relay 1 of 3, outlined. The choices are off, 2, 3, 5, 10, 15 and unlimited." width="900">

## Resume

Opens a Claude Code tab with the handover typed into the prompt box.

<img src="docs/img/resume.webp" alt="The Handovers view. The row Add checkout flow, outlined, shows its buttons on hover, and the play button shows the tooltip Resume." width="700">

## Worktrees

Lists the repo's git worktrees and opens each in its own window.

<img src="docs/img/worktrees.webp" alt="The Worktrees view lists feat/checkout, fix/receipt-email and main. The first row, outlined, shows its buttons on hover, with the tooltip Open worktree window." width="700">

---

## Features

### In the VS Code footer

- **Context pie:** how full the chat is, filling towards the nudge size. Hover it to see which handover the tab loaded.
- **Relay:** the window's clears left. Click to change them.
- **Idle handover:** what happens while you are away. Off, toast, smart or auto.

### In the VS Code sidebar

- **Handovers** by repo: Loaded, Current repo, Other repos and Stale.
- **Resume** opens a Claude Code tab with the handover typed into the prompt box.
- **Pin** keeps a handover out of the Stale group.
- **Left on screen** under each handover: tables, lists, links, paths and the last screen.
- **Worktrees** lists the repo's git worktrees and opens each in its own window.

### In Claude Code

- `/cornerman:handover` saves a short note: the goal, the next action, where things stand, the decisions made and what already failed.
- The fresh session loads the note after `/clear`.
- **Nudge** (off by default): past a size you choose, Claude is asked to save a handover.
- **Relay** (off by default): it saves, clears and carries on, up to the number of clears you allow.
- Each handover belongs to the Claude Code window that wrote it.
- Handovers are plain text in `~/.cornerman`. Open them, change them or paste them into another chat.

---

[Full guide](docs/GUIDE.md) · [How it works](docs/HOW-IT-WORKS.md) · [Research](docs/RESEARCH.md)

<sub>MIT, see [LICENSE](LICENSE)</sub>
