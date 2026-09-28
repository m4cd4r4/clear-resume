// The handover skill pre-approves its own save so manual permission mode does not
// prompt on every save. The prompt it replaced offered "don't ask again for: node *",
// which would allow every node command. These tests pin the grant to the plugin's
// own scripts, and check the command the skill tells Claude to run still matches it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SKILL = join(dirname(fileURLToPath(import.meta.url)), "..", "plugin", "skills", "handover", "SKILL.md");
const text = readFileSync(process.env.CR_SKILL_FILE || SKILL, "utf8").replace(/\r\n/g, "\n");
const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)[1];
const body = text.slice(text.indexOf("\n---\n", 4) + 5);

function allowedTools() {
  const lines = frontmatter.split("\n");
  const i = lines.findIndex((l) => l.startsWith("allowed-tools:"));
  if (i === -1) return [];
  const out = [];
  for (const l of lines.slice(i + 1)) {
    const m = l.match(/^\s+-\s+(.+)$/);
    if (!m) break;
    out.push(m[1].trim());
  }
  return out;
}

// Claude Code's Bash rule shape: literal text, `*` for any text, and a trailing
// " *" also matching the bare command.
function matches(rule, command) {
  const inner = rule.match(/^Bash\((.*)\)$/)[1];
  const bare = inner.endsWith(" *") ? inner.slice(0, -2) : null;
  const re = new RegExp(`^${inner.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]*")}$`);
  return re.test(command) || command === bare;
}

describe("handover skill allowed-tools", () => {
  const rules = allowedTools();

  it("matches the save command the skill body tells Claude to run", () => {
    const block = body.match(/```bash\n(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/save\.mjs"[\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    const command = block[1].replace("<short title>", "Add cartTotal").replace("<the handover markdown>", "# Add cartTotal\n\n## Goal\nx");
    expect(rules.some((r) => matches(r, command))).toBe(true);
  });

  it("grants nothing outside the plugin's own scripts", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r).toMatch(/^Bash\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/[a-z-]+\.mjs" \*\)$/);
    expect(rules.some((r) => matches(r, "node -e \"require('fs')\""))).toBe(false);
    expect(rules.some((r) => matches(r, 'node "/elsewhere/scripts/save.mjs" --title x'))).toBe(false);
  });
});
