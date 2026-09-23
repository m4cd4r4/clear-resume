# demo

The 36-second demo linked from the repo README: a session fills up, a handover is written,
`/clear` empties it, and the fresh session already has the work.

| File | What it is |
|---|---|
| `renders/clear-resume-loop.mp4` | the rendered demo, 1920x1080 at 30fps |
| `index.html` | the whole composition: one terminal window, four phases, one timeline |
| `frame.md` | the design spec - palette, type, structure, what it bans |
| `STORYBOARD.md` | the five beats, with the motion rules each one composes |
| `BRIEF.md` | what the demo is for and the constraints it was built under |

Nothing here was screen-captured. Every frame is authored, and every name in it is invented
(`widget-shop`, `feat/cart-totals`, `a1b2c3d`), because the repo is public and a screen
recording takes whatever is on screen with it.

## Rebuilding it

Built with [HyperFrames](https://hyperframes.heygen.com), which renders video from HTML.

```bash
cd demo
npm run check                                   # lint, layout, motion, contrast
npx hyperframes render --output renders/clear-resume-loop.mp4 --crf 23
```

`--crf 23` is deliberate. The default quality setting produces a 9.5 MB file for the same
36 seconds, which is too heavy to keep in a git repo for what it adds.
