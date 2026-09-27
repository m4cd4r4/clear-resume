# clear-resume

A Claude Code plugin: write a handover, type `/clear`, and carry on in a fresh context.
Nothing to paste and nothing else to type.

<!-- VIDEO: github user-attachments URL goes here -->

## Why

A long session sends every earlier message with every new one. `/clear` resets that, but it
also loses your place.

With clear-resume, Claude writes one short handover on purpose, you type `/clear`, and that
window's fresh session picks it up. It never goes to another open window, and it can sync
across machines over your own git remote. `/compact` and `--resume` keep the old conversation,
whole or summarised. clear-resume drops it: the fresh session starts with the handover and
nothing else.

## The loop

1. Run `/clear-resume:handover`. Claude checks git, writes a short brief (goal, next action,
   state, decisions, traps) and saves it. The save prints:

   ```text
   Saved handover "Cart totals rounding" (id ec04553).
   After /clear, the next session in ~/code/shop loads it automatically.
   ```

2. Type `/clear`.
3. The fresh session starts with the handover in its context, and you see:

   ```text
   clear-resume: loaded handover "Cart totals rounding" (saved just now).
   ```

The hook runs at every session start, clear and compaction, and stays silent when nothing is
waiting.

## Install

```bash
claude plugin marketplace add https://github.com/m4cd4r4/clear-resume
claude plugin install clear-resume@clear-resume
```

Needs Node 18 or later and git. Built and used daily on Windows 11. The test suite runs on
Windows, macOS and Linux in CI; macOS and Linux have not been tested by hand yet.

**Update.** Plugins from a third-party marketplace do not update on their own by default. Run
both lines, then restart Claude Code:

```bash
claude plugin marketplace update clear-resume
claude plugin update clear-resume@clear-resume
```

**Uninstall.** Your handovers stay in `~/.clear-resume` until you delete that folder.

```bash
claude plugin uninstall clear-resume@clear-resume
claude plugin marketplace remove clear-resume
```

## Good to know

- Each handover belongs to the window that wrote it. Another open window never loads it on its
  own.
- A handover older than 7 days is listed, not loaded.
- Handovers are plain text files on your disk. The plugin sends nothing anywhere unless you
  turn on sync or web mode. Keep secrets out of them.

**[More details](docs/HOW-IT-WORKS.md):** which handover loads, settings, auto mode, Claude Code
on the web, syncing two machines, the VS Code sidebar, cost, privacy, limitations and
troubleshooting.

## Licence

[MIT](LICENSE)
