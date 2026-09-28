# demo

The 75-second explainer for clear-resume: why long sessions hurt, the two old choices
(`/compact`, `/clear`), the handover note, the real flow (`/clear`, then `go`), measured
numbers, many windows, the VS Code sidebar (a separate extension), the opt-in context nudge
(auto mode), and the install. Side cards
explain it with a shift-handover note, for a viewer who has never heard of a context window.
It comes in two cuts that tell the same story on the same timings: 16:9 for the README, 9:16
for LinkedIn and Threads.

| File | What it is |
|---|---|
| `renders/clear-resume-explainer.mp4` | the 16:9 cut, 1920x1080 at 30fps, 75s |
| `renders/clear-resume-explainer-9x16.mp4` | the 9:16 cut, 1080x1920 at 30fps, 75s |
| `renders/clear-resume-loop*.mp4` | the older 36-second v2 loop, kept for the links that point at it |
| `vertical/story.js` | every word and every timing, shared by both cuts |
| `vertical/base.css` | the look both cuts share: palette, type, terminal rows, cards |
| `index.html` | the 16:9 canvas: terminal left, cards right |
| `vertical/index.html` | the 9:16 canvas: terminal on top, cards below |
| `STORYBOARD.md` | the eight beats: timings, terminal text, card text and a plain paraphrase of each card |
| `frame.md` | the design spec |
| `BRIEF.md` | what the demo is for and the constraints it was built under |

Nothing here was screen-captured. Every frame is authored. The repo, branch and handover are
the sandbox ones the plugin's output was captured against (`widget-shop` at
`~/code/widget-shop`, `fix/cart-rounding`, id `31c9af7`).

## The lines the plugin prints

Every line in the plugin's voice, the sidebar labels, the readable copy and the install
commands are what the real code printed, copied verbatim (`CAP` at the top of
`vertical/story.js`). They were captured on 2026-09-28 from plugin 0.1.6
(`feat/loaded-handover` @ `20d987c`) in a sandbox HOME, not on a live machine. The user's
prompts and Claude's replies are authored and always labelled `you` or `Claude`. When the
plugin's output changes, edit `CAP` and re-render both cuts.

## Why the shared file is in `vertical/`

HyperFrames serves each project from its own folder, and its linter refuses any `../` path
(`invalid_parent_traversal_in_asset_path`), so two sibling projects cannot share a file. The
9:16 project sits inside the 16:9 one, which makes `vertical/` the one folder both can
reach.

Because `story.js` builds the DOM when the page loads, `npx hyperframes timeline`, which
reads the files without running them, lists no clips. `check`, `snapshot` and `render` run
the page and see everything.

## Rebuilding it

Built with [HyperFrames](https://hyperframes.heygen.com), which renders video from HTML.

```bash
cd demo
npm run check          # lint, layout, motion, contrast - both cuts
npm run render:16x9    # renders/clear-resume-explainer.mp4
npm run render:9x16    # renders/clear-resume-explainer-9x16.mp4
```

`npm run dev` and `npm run dev:vertical` open either cut in the HyperFrames Studio.

Each cut names its three font families in its own inline `<style>` block. The renderer
embeds only the families it finds there; with the names only in `vertical/base.css`, a
render falls back to system fonts while `snapshot` still looks right.

Both renders use `--crf 23` on purpose: the default quality setting makes files too heavy to
keep in a git repo for what it adds.
