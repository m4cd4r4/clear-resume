// How big the sidebar's model post is, with Archived shown in the settings, closed and
// open: the same StoreSource, sections and pageJson the extension host uses.
// Reads the store only.
//
//   node scripts/perf/archived-post.mjs [--store <dir>] [--repo <path>]
//
// <dir> defaults to the store resolveStore picks (~/.cornerman); <path> is the repo
// the sidebar is "here" in, default this checkout.
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { resolveStore } from "../../plugin/packages/store/rename.mjs";

// extension/src imports its own modules without an extension, as esbuild resolves them.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { StoreSource } = await import("../../extension/src/store-source.ts");
const { filterSections, handoverSections, pageJson, withArchived } = await import("../../extension/src/sidebar-model.ts");

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const store = resolve(arg("--store", resolveStore()));
const repo = resolve(arg("--repo", "."));

const { records, captures } = await new StoreSource(() => store).snapshot();
const sections = filterSections(handoverSections(records, { repoPath: repo, roots: [repo], now: new Date(), showArchived: true, captures }), "");
const post = (s) => Buffer.byteLength(pageJson({ section: "handovers", query: "", hasLegacy: false, sections: s }));
const archived = sections.find((s) => s.id === "archived")?.rows.length ?? 0;
const before = post(sections);
const closed = post(withArchived(sections, { open: false, query: "" }));
const open = post(withArchived(sections, { open: true, query: "" }));
const stale = sections.find((s) => s.id === "stale")?.rows.length ?? 0;
console.log(JSON.stringify({ store, records: records.length, archived, stale, bytes: { before, archivedClosed: closed, archivedOpen: open } }));
