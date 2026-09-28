import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

/** The store package is plain ESM shared with the plugin; esbuild folds it into the
 * CommonJS bundle VS Code loads, so there is no second copy of the schema.
 *
 * Exported so test/extension-bundle.test.mjs builds with exactly these options. */
export const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
  // CommonJS has no import.meta. The one use (sync.mjs, the plugin's background
  // push) resolves it on use and treats a missing value as "no push from here".
  define: { "import.meta.url": "undefined" },
  sourcemap: true,
  logLevel: "info",
};

/** The plugin's sync CLI, bundled beside the extension as dist/sync.js. The sidebar's
 * pin, delete and archive push through it as a child process, and the plugin's own
 * scripts/ folder is not in the VSIX. */
export const syncCliOptions = {
  ...options,
  entryPoints: ["../plugin/scripts/sync.mjs"],
  outfile: "dist/sync.js",
  sourcemap: false,
};

// Build only when run as a script (`node esbuild.mjs`), not when a test imports it.
const invoked = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invoked && process.argv.includes("--watch")) {
  await build(syncCliOptions);
  const ctx = await context(options);
  await ctx.watch();
} else if (invoked) {
  await Promise.all([build(options), build(syncCliOptions)]);
}
