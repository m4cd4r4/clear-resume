// How the plugin names a handover and a path in what it prints.
//
// A record file is <hostname>-<pid>-<time>.json, and the hostname is often the
// owner's full name ("Johns-MacBook-Pro"); a full path adds the home folder, which
// carries the user name. Printed output reaches screenshares and demos, so it
// names a handover by its title and a short id, and a path relative to "~".
import { homedir } from "node:os";
// The long form of a path: Windows temp folders arrive in 8.3 form
// (C:\Users\JOHNSM~1\...), which would not match the home folder. Shared with the
// readable copies, whose "home" name makes the same comparison.
import { longForm } from "../../packages/store/loaded.mjs";

// Seven hex characters that stand for a record id; load.mjs accepts them. Defined
// with the readable copies, whose names carry it, so the extension computes the
// same one.
export { shortId } from "../../packages/store/loaded.mjs";

const slashes = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "");

/** `p` relative to the home folder as "~/...", or `p` unchanged when it is not under it. */
export function tildePath(p, home = homedir()) {
  if (!p) return p;
  const h = slashes(longForm(home));
  const full = slashes(longForm(p));
  const fold = process.platform === "win32" || process.platform === "darwin" ? (s) => s.toLowerCase() : (s) => s;
  if (fold(full) === fold(h)) return "~";
  if (fold(full).startsWith(`${fold(h)}/`)) return `~/${full.slice(h.length + 1)}`;
  return String(p);
}

// After "$HOME/": letters and digits in any script, and punctuation no shell reads
// inside double quotes. Out: $ ` " ' ; [ ] \ and the curly quotes PowerShell
// treats as quotes.
const PLAIN_REST = /^[\p{L}\p{M}\p{N}._@+ ,=/-]+$/u;
// Git Bash (MSYS) turns a /c/... argument back into a Windows path only when it
// holds none of these; a home folder named "Pat O'Brien" reached node as
// /c/Users/Pat O'Brien/... and failed (review 4, 2026-09-27).
const MSYS_STOPS = /['`;[\]]/;

const sameFolder = (a, b) => {
  const fold = process.platform === "win32" || process.platform === "darwin" ? (s) => s.toLowerCase() : (s) => s;
  return fold(slashes(longForm(a))) === fold(slashes(longForm(b)));
};

// Whether "$HOME" in a printed command names `home` in every shell Claude may run
// it in. PowerShell's $HOME is the profile folder. Git Bash's is the HOME variable,
// or with HOME unset HOMEDRIVE+HOMEPATH, which on a domain account can be a
// network drive (review 5, 2026-09-27). sh's is HOME.
function homeExpands(home, env, platform) {
  if (platform !== "win32") return Boolean(env.HOME) && sameFolder(env.HOME, home);
  if (MSYS_STOPS.test(longForm(home))) return false;
  const gitBashHome = env.HOME || (env.HOMEDRIVE && env.HOMEPATH ? `${env.HOMEDRIVE}${env.HOMEPATH}` : "");
  return !gitBashHome || sameFolder(gitBashHome, home);
}

/**
 * A path for a command line: "$HOME/..." under the home folder, so the command
 * carries no user name, or the full path otherwise. "$HOME" in double quotes
 * expands in Git Bash, PowerShell and sh alike; "~" does not expand in a
 * PowerShell 5.1 native-command argument. A full path holding $, ` or " is
 * single-quoted, which is literal in all three. Known gap: a full path holding an
 * apostrophe as well as $ or `, or a curly quote, has no quoting all three shells
 * read the same way; it needs a home folder named like that.
 */
export function shellPath(p, home = homedir(), { env = process.env, platform = process.platform } = {}) {
  const t = tildePath(p, home);
  if (t.startsWith("~/") && PLAIN_REST.test(t.slice(2)) && homeExpands(home, env, platform)) return `"$HOME/${t.slice(2)}"`;
  const full = String(p);
  return /[$`"]/.test(full) && !full.includes("'") ? `'${full}'` : `"${full}"`;
}
