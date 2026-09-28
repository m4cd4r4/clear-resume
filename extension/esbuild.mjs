import { build, context } from "esbuild";

/** The store package is plain ESM shared with the plugin; esbuild folds it into the
 * CommonJS bundle VS Code loads, so there is no second copy of the schema. */
const options = {
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

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
