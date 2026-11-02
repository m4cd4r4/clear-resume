// Settings saved under the old extension name, copied once to the new one. The old ones stay.
const OLD_SECTION = "clearResume";
const NEW_SECTION = "cornerman";
const KEYS = ["storePath", "showArchived", "registryPath", "spareCycles"];

// The numbers vscode.ConfigurationTarget uses. Written out so this file loads without vscode.
const LEVELS = [
  ["globalValue", 1],
  ["workspaceValue", 2],
] as const;

type Inspected = { globalValue?: unknown; workspaceValue?: unknown } | undefined;
type Config = {
  inspect(key: string): Inspected;
  update(key: string, value: unknown, target: number): Thenable<void> | Promise<unknown>;
};

export async function copyLegacySettings(getConfiguration: (section: string) => Config): Promise<void> {
  const before = getConfiguration(OLD_SECTION);
  const after = getConfiguration(NEW_SECTION);
  for (const key of KEYS) {
    const old = before.inspect(key);
    const already = after.inspect(key);
    for (const [level, target] of LEVELS) {
      if (old?.[level] !== undefined && already?.[level] === undefined) await after.update(key, old[level], target);
    }
  }
}
