# Publishing clear-resume

Everything the packaging needs is already in place: `icon`, `galleryBanner`,
`categories`, `keywords`, `repository.directory`, `homepage`, `bugs`, and a
`CHANGELOG.md`. Both store accounts are set up. Each release is two publish commands.

## One-time setup

### Visual Studio Code Marketplace

Already done. The publisher is `macdara`, the same one that publishes
[Portpilot](https://marketplace.visualstudio.com/items?itemName=macdara.portpilot),
and it matches the `publisher` field in `extension/package.json`. The access
token is saved at `~/.claude/secrets/vsce-pat` (bare value,
never committed). It passed `npx @vscode/vsce verify-pat macdara` on 2026-09-28.

Microsoft retires classic Azure DevOps personal access tokens on 1 December
2026. Before any publish on or after that date, re-read
[the official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
for the replacement sign-in.

### Open VSX

Already done. The Eclipse Foundation account is linked to the GitHub account
that signs in to [open-vsx.org](https://open-vsx.org), the publisher
agreement is signed, and the `macdara` namespace exists. The access token is
saved at `~/.claude/secrets/ovsx-token` (bare value, never committed). It
passed `npx ovsx verify-pat macdara` on 2026-09-28.

To replace a lost token: open-vsx.org, avatar, Settings, Access Tokens,
Generate New Token. Save the new value to the same file.

## Publish commands (every release)

Run from `extension/`. Bump `version` in `extension/package.json` first -
both stores refuse to publish a version that is already live.

```bash
cd extension
npm install
node esbuild.mjs

# check the package before shipping it anywhere
npx @vscode/vsce package --no-dependencies
npx @vscode/vsce ls

# VS Code Marketplace
npx @vscode/vsce publish -p "$(cat ~/.claude/secrets/vsce-pat)"

# Open VSX
npx ovsx publish -p "$(cat ~/.claude/secrets/ovsx-token)"
```

Both `publish` commands package the extension themselves, so the earlier
`vsce package` step is only there so you can read the file list and size
before anything goes out. If you logged in with `vsce login` above, the
Marketplace command can drop `-p "..."` and just be `npx @vscode/vsce
publish`.

`vsce publish patch` (or `minor` / `major`) bumps the version in
`package.json`, commits it, tags it and publishes, all in one step, if you
would rather not hand-edit the version number first.

## After publishing

- Marketplace listing: `https://marketplace.visualstudio.com/items?itemName=macdara.clear-resume`
- Open VSX listing: `https://open-vsx.org/extension/macdara/clear-resume`
- The root README's "The VS Code sidebar" section installs from these
  listings. Check both links resolve after the first publish.

## Regenerating the Marketplace icon

`media/icon.png` is rendered from `media/icon-marketplace.svg`, a version of
the activity-bar glyph (`media/icon.svg`) with its own background colour and a
solid stroke colour, because the Marketplace listing image does not support
SVG or `currentColor` theming. Regenerate after any visual change to the
glyph:

```bash
cd extension
npx --yes sharp-cli -i media/icon-marketplace.svg -o media/icon.png resize 256 256
```

`icon-marketplace.svg` is excluded from the packaged `.vsix` by
`.vscodeignore`; it is a source asset, not something the running extension
needs.
