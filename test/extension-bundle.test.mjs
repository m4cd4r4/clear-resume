import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { options } from "../extension/esbuild.mjs";

vi.setConfig({ testTimeout: 30000, hookTimeout: 60000 });

// The extension ships as one CommonJS bundle, and esbuild turns every `import.meta`
// in the ESM store package into `{}`. Code that runs at module load in that bundle
// is never exercised by the store's own tests, which load it as ESM. So this builds
// the real bundle and loads it the way VS Code does: require(), with `vscode`
// supplied by the host.
let out;

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "cr-bundle-"));
  await build({ ...options(out), logLevel: "silent" });
});

afterAll(() => rmSync(out, { recursive: true, force: true }));

function loadBundle() {
  const load = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "vscode") return {};
    return load.call(this, request, ...rest);
  };
  try {
    return createRequire(import.meta.url)(join(out, "extension.js"));
  } finally {
    Module._load = load;
  }
}

describe("the built extension bundle", () => {
  it("loads and exports activate", () => {
    expect(typeof loadBundle().activate).toBe("function");
  });

  // The sidebar's pin, delete and archive push through a child process, and the
  // plugin's scripts/ folder is not in the VSIX. The bundle carries its own CLI.
  it("ships a sync CLI the extension can spawn", () => {
    const home = mkdtempSync(join(tmpdir(), "cr-home-"));
    try {
      const stdout = execFileSync(process.execPath, [join(out, "sync.js")], {
        env: { ...process.env, CLEAR_RESUME_HOME: home },
        encoding: "utf8",
      });
      expect(stdout).toContain("is not synced");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
