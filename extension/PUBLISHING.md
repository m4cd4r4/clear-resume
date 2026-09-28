# Publishing clear-resume

Everything the packaging needs is already in place: `icon`, `galleryBanner`,
`categories`, `keywords`, `repository.directory`, `homepage`, `bugs`, and a
`CHANGELOG.md`. What is left is account setup, once per store, then two
publish commands per release.

## One-time setup

### Visual Studio Code Marketplace

1. **Create the publisher.** Go to
   [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)
   and sign in with a Microsoft account. Create a publisher with the id
   `m4cd4r4` (this must match the `publisher` field in
   `extension/package.json`). Pick a display name; a publisher icon is
   optional.
2. **Get a Marketplace access token.** As of today (2026-09-28) a classic
   Azure DevOps Personal Access Token still works, but Microsoft has
   announced that classic PATs in Azure DevOps retire on 1 December 2026, and
   its docs already point automated publishing toward Microsoft Entra ID
   with workload identity federation instead. That path is written for CI
   pipelines, not a single local publish, so it is not a clean drop-in yet.
   **Re-read
   [the official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
   before your first publish if that publish happens on or after 1 December
   2026** - the steps below may need replacing by then.

   Today's steps:
   - Go to [dev.azure.com](https://dev.azure.com) and sign in (create a free
     organization if you do not have one).
   - User settings (top right) -> Personal access tokens -> New Token.
   - Name: anything, for example "clear-resume marketplace".
   - Organization: **All accessible organizations**.
   - Expiration: your choice, up to one year. Note the date so you remember
     to rotate it.
   - Scopes: Custom defined -> **Marketplace: Manage**.
   - Create, then copy the token immediately. It is shown once.
3. **Save the token locally**, not in the repo:
   `C:/Users/Hard-Worker/.claude/secrets/vsce-pat`, the bare token value,
   nothing else in the file.
4. **Log in once** from `extension/`:
   ```
   npx @vscode/vsce login m4cd4r4
   ```
   and paste the token when prompted. This stores it for future `vsce
   publish` calls without a `-p` flag; you can also pass `-p` explicitly
   each time instead of logging in (see the publish commands below).

Rough time: 10 minutes if you already have an Azure DevOps organization,
15 to 20 if you need to create one.

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
   npx ovsx create-namespace m4cd4r4 -p "$(cat /c/Users/Hard-Worker/.claude/secrets/ovsx-token)"
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

- Marketplace listing: `https://marketplace.visualstudio.com/items?itemName=m4cd4r4.clear-resume`
- Open VSX listing: `https://open-vsx.org/extension/m4cd4r4/clear-resume`
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
