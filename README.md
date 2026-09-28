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
   A copy to read or share: ~/.clear-resume/loaded/shop-cart-totals-rounding-ec04553.md
   ```

   The copy is plain markdown, kept for 30 days. Open it to reread what this session started
   from, or @-mention it in another session.

The hook runs at every session start, clear and compaction, and stays silent when nothing is
waiting.

## Install

```bash
claude plugin marketplace add https://github.com/m4cd4r4/clear-resume
claude plugin install clear-resume@clear-resume
```

Needs Node 18 or later and git. Claude Code's native installer does not add Node, so check with
`node -v`. Without Node 18 on your PATH, the plugin shows one line saying so when a session
starts and does nothing else. On Windows, Claude Code runs plugin hooks through Git Bash, which
comes with Git for Windows. Built and used daily on Windows 11. The test suite runs on
Windows, macOS and Linux in CI; macOS and Linux have not been tested by hand yet.

**Update.** Plugins from a third-party marketplace do not update on their own by default. Run
both lines, then restart Claude Code:

```bash
claude plugin marketplace update clear-resume
claude plugin update clear-resume@clear-resume
```

**Uninstall.**

```bash
claude plugin uninstall clear-resume@clear-resume
claude plugin marketplace remove clear-resume
```

Your handovers stay in `~/.clear-resume` until you delete that folder. If you added any
`CLEAR_RESUME_` settings to `~/.claude/settings.json`, remove those lines too.

## Auto mode (opt-in)

By default you decide when to write a handover. To be nudged instead, add one line to the `env`
block of `~/.claude/settings.json`:

```json
{ "env": { "CLEAR_RESUME_AUTO": "1" } }
```

Once the context passes 180k tokens, Claude is asked once per session to save a handover, and
you see a status line saying so. You still type `/clear`: a plugin cannot run it.
[Threshold and details](docs/HOW-IT-WORKS.md#auto-mode-opt-in).

## VS Code sidebar (optional)

A companion extension lists every handover by repo and marks the one this workspace loaded:

- A **Loaded** group at the top: handovers loaded in the last 24 hours.
- A status-bar item such as `Handover: Cart totals rounding (loaded 3h ago)`. Click it to open
  the readable copy.
- **Resume** opens a Claude Code tab with a handover's prompt filled in and not sent.

Search for clear-resume in the Extensions view, or:

```bash
code --install-extension macdara.clear-resume
```

It is on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=macdara.clear-resume)
and on [Open VSX](https://open-vsx.org/extension/macdara/clear-resume) for VSCodium, Cursor and
other editors that use it. It needs the plugin.

## Good to know

- Each handover belongs to the window that wrote it. Another open window never loads it on its
  own.
- A handover older than 7 days is listed, not loaded.
- Handovers are plain text files on your disk. The plugin sends nothing anywhere unless you
  turn on sync or web mode. Keep secrets out of them.

**[More details](docs/HOW-IT-WORKS.md):** which handover loads, settings, auto mode, Claude Code
on the web, syncing two machines, the VS Code sidebar, the readable copy, cost, privacy,
limitations and troubleshooting.

## Licence

[MIT](LICENSE). clear-resume is an independent project. It is not made or endorsed by Anthropic.
