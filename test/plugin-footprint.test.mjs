// What a stranger's install gets. Claude Code copies the marketplace entry's source
// folder into its plugin cache, and runs `npm ci` there when that folder holds a
// package.json with a lockfile (measured on 2.1.283). The entry points at plugin/,
// so these checks keep plugin/ self-contained and free of anything npm would act on.
//
// tdd-guard:allow - backfilled onto the plugin/ move, whose behaviour was measured
// first by installing into a sandboxed Claude Code (see the PR description); each
// check was then seen to fail by breaking the layout it guards.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "..");
const PLUGIN = join(REPO, "plugin");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const inside = (p) => {
  const rel = relative(PLUGIN, p);
  return rel !== "" && !rel.startsWith("..") && !rel.includes(":");
};

describe("plugin footprint", () => {
  it("keeps the install id clear-resume@clear-resume and points the entry at plugin/", () => {
    const market = JSON.parse(readFileSync(join(REPO, ".claude-plugin", "marketplace.json"), "utf8"));
    expect(market.name).toBe("clear-resume");
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0].name).toBe("clear-resume");
    expect(market.plugins[0].source).toBe("./plugin");
    const manifest = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8"));
    expect(manifest.name).toBe("clear-resume");
    expect(existsSync(join(REPO, ".claude-plugin", "plugin.json"))).toBe(false);
  });

  it("gives Claude Code nothing to npm install", () => {
    for (const name of ["package.json", "package-lock.json", "npm-shrinkwrap.json", "bun.lock", "bun.lockb", "node_modules"]) {
      expect(existsSync(join(PLUGIN, name)), `plugin/${name}`).toBe(false);
    }
  });

  it("ships no tests", () => {
    const tests = walk(PLUGIN).filter((f) => /\.test\.m?[jt]s$/.test(f) || f.split(sep).includes("test"));
    expect(tests).toEqual([]);
  });

  it("resolves every relative import inside plugin/", () => {
    const missing = [];
    for (const file of walk(PLUGIN).filter((f) => /\.[mc]js$/.test(f))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/(?:from\s+|import\s*\(?\s*|require\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
        const target = resolve(dirname(file), m[1]);
        if (!inside(target) || !existsSync(target)) missing.push(`${relative(REPO, file)} -> ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("finds every script the hooks and the skill run", () => {
    const refs = [
      readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8"),
      readFileSync(join(PLUGIN, "skills", "handover", "SKILL.md"), "utf8"),
    ].flatMap((text) => [...text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+\.[mc]js)/g)].map((m) => m[1]));
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(existsSync(join(PLUGIN, ref)), ref).toBe(true);
  });

  it("finds the script behind every hook name hook-entry.cjs is given", () => {
    // hook-entry.cjs takes the hook name as an argument and lib/hook-import.cjs
    // imports scripts/<name>.mjs, a path no import scan can see.
    const hooks = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8")).hooks;
    const names = Object.values(hooks).flatMap((entries) =>
      entries.flatMap((e) => e.hooks.map((h) => h.command.match(/hook-entry\.cjs"\s+([\w-]+)/)?.[1])),
    );
    expect(names).toHaveLength(3);
    for (const name of names) expect(existsSync(join(PLUGIN, "scripts", `${name}.mjs`)), name).toBe(true);
  });
});
