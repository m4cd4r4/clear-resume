import { build, context } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The store package is plain ESM shared with the plugin; esbuild folds it into the
 * CommonJS bundle VS Code loads, so there is no second copy of the schema.
 *
 * Exported so the bundle test builds exactly what ships, into a folder of its own. */
export function options(outdir = join(here, "dist")) {
  return {
    // sync.js is the plugin's sync CLI. The sidebar's mutations push through it as a
    // child process, and the plugin's scripts/ folder is not in the VSIX.
    entryPoints: {
      extension: join(here, "src", "extension.ts"),
      sync: join(here, "..", "scripts", "sync.mjs"),
    },
    bundle: true,
    outdir,
    platform: "node",
    target: "node18",
    format: "cjs",
    external: ["vscode"],
    sourcemap: true,
    logLevel: "info",
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--watch")) {
    const ctx = await context(options());
    await ctx.watch();
  } else {
    await build(options());
  }
}
