// The VS Code extension ships as one CommonJS bundle that esbuild makes from
// extension/src and the shared ESM store package. Every other test imports the
// store as ESM, where import.meta.url is defined, so a module-level use of it (or a
// lost esbuild `define`) passes them all and then throws the moment VS Code loads
// the bundle: the sidebar never opened (2026-09-28). This builds the bundle with
// the extension's own options and loads it, as VS Code does.
//
// It needs the extension's dev dependencies (`npm ci --prefix extension`). CI
// installs them; a local checkout without them skips, and CI never does.
import Module, { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const EXT = join(import.meta.dirname, "..", "extension");
const installed = existsSync(join(EXT, "node_modules", "esbuild", "package.json"));

describe.skipIf(!installed && !process.env.CI)("the extension bundle", { timeout: 60_000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "cr-bundle-"));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("builds without a warning and loads as CommonJS without throwing", async () => {
    const { options } = await import(pathToFileURL(join(EXT, "esbuild.mjs")).href);
    const { build } = createRequire(join(EXT, "package.json"))("esbuild");
    const outfile = join(out, "extension.js");

    const result = await build({ ...options, absWorkingDir: EXT, outfile, sourcemap: false, logLevel: "silent" });
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.text)).toEqual([]);

    // VS Code supplies `vscode`; loading the bundle runs only its top level, which
    // is where the crash was, so an empty module stands in for it.
    const load = Module._load;
    Module._load = function (request, ...rest) {
      return request === "vscode" ? {} : load.call(this, request, ...rest);
    };
    let ext;
    try {
      ext = createRequire(import.meta.url)(outfile);
    } finally {
      Module._load = load;
    }
    expect(typeof ext.activate).toBe("function");
  });
});
