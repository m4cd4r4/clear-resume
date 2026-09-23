# Design spec - clear-resume demo

## Concept angle

One terminal window, one context meter, four phases: the meter fills while work happens,
a handover is written, the meter empties on `/clear`, and the work reappears in a fresh
session with the meter near zero. The meter is the through-line, so the loop reads as one
continuous mechanism rather than four screenshots.

## Palette

Dark, tinted warm toward the accent. One accent hue (amber) at three lightnesses; no
second hue anywhere.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#100e0b` | page behind the window |
| `--surface` | `#191510` | window body |
| `--surface-2` | `#221d16` | title bar, chips, meter track |
| `--border` | `#332c22` | hairlines |
| `--fg` | `#ece5d8` | primary text |
| `--muted` | `#948b7b` | tool lines, secondary text (5.4:1 on surface) |
| `--accent` | `#e5a743` | prompt glyph, caret, meter fill, plugin voice (8.6:1) |
| `--accent-deep` | `#c07c2a` | meter fill above 70 per cent |
| `--accent-dim` | `#6b4f23` | ghost word, glow |

## Typography

Two voices, crossing the category boundary: mono for everything the machine says,
a heavy display face for the four beat markers. Weight contrast is 400 against a face
that is heavy by construction.

- Terminal content: **JetBrains Mono** 400 / 700, `font-variant-ligatures: none`.
- Beat markers and close card: **Archivo Black** 400 only.
- Body 26px minimum at 1920 wide; the close card headline 96px.
- Tracking `-0.01em` on mono body, `-0.03em` on the close headline.

Both families are pre-bundled by the renderer, so nothing is fetched at build time.

## Structure

- Focal element: the terminal window, 1440x760, centred, sitting 40px above optical centre.
- Edge anchors: the beat marker chip bottom-left, the context meter across the window's
  title bar.
- Supporting detail: tool-call lines in muted, the plugin's own lines in accent.
- Background treatment: four decoratives, each with slow ambient motion - a breathing
  radial amber glow behind the window, a giant ghost word per phase at 5 per cent drifting
  upward, a column of static hairlines with a slow pulse, and a fixed grain overlay.

## Beat markers

`01 WORK`, `02 HANDOVER`, `03 CLEAR`, `04 RESUME`. Bottom left, Archivo Black 28px,
letter-spaced, the numeral in accent and the word in muted.

## What this spec bans

- No green-on-black terminal cliche, no traffic-light window dots, no cyan.
- No gradient text, no neon, no pure `#000`.
- No number anywhere that claims a saving.
