# Publishing clear-resume

Everything the packaging needs is already in place: `icon`, `galleryBanner`,
`categories`, `keywords`, `repository.directory`, `homepage`, `bugs`, and a
`CHANGELOG.md`. What is left is account setup, once per store, then two
publish commands per release.

## One-time setup

### Visual Studio Code Marketplace

Already done. The publisher is `macdara`, the same one that publishes
[Portpilot](https://marketplace.visualstudio.com/items?itemName=macdara.portpilot),
and it matches the `publisher` field in `extension/package.json`. The access
token is saved at `C:/Users/Hard-Worker/.claude/secrets/vsce-pat` (bare value,
never committed). It passed `npx @vscode/vsce verify-pat macdara` on 2026-09-28.

Microsoft retires classic Azure DevOps personal access tokens on 1 December
2026. Before any publish on or after that date, re-read
[the official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
for the replacement sign-in.

### Open VSX

1. **Create an Eclipse Foundation account** at
   [accounts.eclipse.org/user/register](https://accounts.eclipse.org/user/register).
   Use the same username as your GitHub account, or make sure it matches
   exactly - Open VSX links the two.
2. **Sign in to [open-vsx.org](https://open-vsx.org)** with "Log in with
   GitHub".
3. **Link the Eclipse account.** Avatar -> Settings -> "Log in with Eclipse"
   and authorize.
4. **Sign the publisher agreement.** Still under Settings, click "Show
   Publisher Agreement", read it, then "Agree".
5. **Create an access token.** Settings -> Access Tokens -> Generate New
   Token. Give it a description and copy the token immediately.
6. **Save the token locally**, not in the repo:
   `C:/Users/Hard-Worker/.claude/secrets/ovsx-token`, the bare token value.
7. **Create the namespace**, once, from `extension/`:
   ```
   npx ovsx create-namespace macdara -p "$(cat /c/Users/Hard-Worker/.claude/secrets/ovsx-token)"
   ```

Rough time: 10 minutes.

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
npx @vscode/vsce publish -p "$(cat /c/Users/Hard-Worker/.claude/secrets/vsce-pat)"

# Open VSX
npx ovsx publish -p "$(cat /c/Users/Hard-Worker/.claude/secrets/ovsx-token)"
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
- Update the root README's "The VS Code sidebar" section with the install
  lines drafted below, replacing the current build-it-yourself instructions.

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
