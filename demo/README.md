# demo

The 36-second demo linked from the repo README: a session fills up, a handover is written,
`/clear` empties it, and the fresh session already has the work. It comes in two cuts that
tell the same story on the same timings: 16:9 for the README, 9:16 for LinkedIn and Threads.

| File | What it is |
|---|---|
| `renders/clear-resume-loop.mp4` | the 16:9 cut, 1920x1080 at 30fps, 36s, about 1.4 MB |
| `renders/clear-resume-loop-9x16.mp4` | the 9:16 cut, 1080x1920 at 30fps, 36s, about 1.6 MB |
| `vertical/story.js` | every word and every timing, shared by both cuts: the markup, the lines the plugin prints, the timeline |
| `index.html` | the 16:9 cut: its canvas and stylesheet, then it mounts `vertical/story.js` |
| `vertical/index.html` | the 9:16 cut: its canvas and stylesheet, then it mounts `story.js` |
| `frame.md` | the design spec - palette, type, structure, what it bans, and the 9:16 layout |
| `STORYBOARD.md` | the five beats, with the motion rules each one composes |
| `BRIEF.md` | what the demo is for and the constraints it was built under |

Nothing here was screen-captured. Every frame is authored, and every name in it is invented
(`widget-shop` at `~/code/widget-shop`, `feat/cart-totals`, `a1b2c3d`, handover id
`4f9c2e7`), because the repo is public and a screen recording takes whatever is on screen
with it.

## The lines the plugin prints

The three lines in the plugin's voice are what the scripts print, not a paraphrase: the two
lines `scripts/save.mjs` prints after a save, and the line the SessionStart hook
(`scripts/session-start.mjs`) shows after `/clear`. They were captured from plugin 0.1.6 by
running both scripts against a throwaway repo, then given the demo's invented names; the id
is invented. When the scripts' output changes, edit `PLUGIN` at the top of
`vertical/story.js` and re-render both cuts.

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
npm run render:16x9    # renders/clear-resume-loop.mp4
npm run render:9x16    # renders/clear-resume-loop-9x16.mp4
```

`npm run dev` and `npm run dev:vertical` open either cut in the HyperFrames Studio.

Both renders use `--crf 23` on purpose. The default quality setting produces a 9.5 MB file
for the same 36 seconds, which is too heavy to keep in a git repo for what it adds.
