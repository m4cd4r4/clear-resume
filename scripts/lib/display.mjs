// How the plugin names a handover and a path in what it prints.
//
// A record file is <hostname>-<pid>-<time>.json, and the hostname is often the
// owner's full name ("Johns-MacBook-Pro"); a full path adds the home folder, which
// carries the user name. Printed output reaches screenshares and demos, so it
// names a handover by its title and a short id, and a path relative to "~".
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname } from "node:path";

/** Seven hex characters that stand for a record id; load.mjs accepts them. */
export function shortId(id) {
  return createHash("sha1").update(String(id)).digest("hex").slice(0, 7);
}

// The long form of a path: Windows temp folders arrive in 8.3 form
// (C:\Users\JOHNSM~1\...), which would not match the home folder. The nearest
// part that exists is resolved, so a path not yet written resolves too.
function longForm(p) {
  const tail = [];
  let head = String(p);
  for (let i = 0; i < 64; i++) {
    try {
      return [realpathSync.native(head), ...tail.reverse()].join("/");
    } catch {
      const up = dirname(head);
      if (up === head) return String(p);
      tail.push(basename(head));
      head = up;
    }
  }
  return String(p);
}

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

/**
 * A path for a command line: "$HOME/..." under the home folder, the full path
 * quoted otherwise. "$HOME" inside double quotes expands in Git Bash, PowerShell
 * and sh alike; "~" does not expand in a PowerShell 5.1 native-command argument.
 * A path holding anything a shell would read inside double quotes stays full.
 */
export function shellPath(p, home = homedir()) {
  const t = tildePath(p, home);
  if (!t.startsWith("~/")) return `"${p}"`;
  const rest = t.slice(2);
  return /^[\w./@+ -]+$/.test(rest) ? `"$HOME/${rest}"` : `"${p}"`;
}
