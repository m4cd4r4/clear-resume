#!/usr/bin/env node
// Recording rig: a clean, isolated Claude Code + VS Code setup on Windows, for
// screen-recording clear-resume in real use.
//
// Nothing from your own setup reaches the rig. It gets its own home folder
// (USERPROFILE/HOME), so anything that reads the home directory, such as the
// clear-resume store and the extension's context pie, reads the rig's. Claude Code
// gets an empty config (CLAUDE_CONFIG_DIR = <home>/.claude), with no CLAUDE.md,
// rules, memory, skills or MCP servers, and VS Code gets a throwaway profile and
// extensions folder. Claude signs in with CLAUDE_CODE_OAUTH_TOKEN (made by
// `claude setup-token`), read from a file and passed in the environment only. The
// token is never printed, and nothing ever signs in inside the rig.
//
//   node scripts/rig.mjs setup [--plugin owner/repo]... [--clone owner/repo]... [--plugin-config k=v]... [--model M] [--effort E]
//                                         --plugin clones a GitHub repo and installs it
//                                         as <repo>@<repo>; --plugin-config applies to those;
//                                         --clone only clones, so the repo can be worked on
//                                         without its plugin loaded
//   node scripts/rig.mjs open <folder>    VS Code on <folder>, window placed for capture
//   node scripts/rig.mjs place            put the window back
//   node scripts/rig.mjs close            close the rig's VS Code
//   node scripts/rig.mjs model <m> <e>    model and effort for the next session
//   node scripts/rig.mjs claude <args>    the claude CLI, inside the rig
//   node scripts/rig.mjs take <name>      record until `stop`; logs every relay hop
//   node scripts/rig.mjs stop
//   node scripts/rig.mjs status
//
// Root: --root, else CR_RIG_ROOT, else I:/Scratch/_rig. Token: CR_RIG_TOKEN_FILE,
// else ~/.claude/secrets/claude-oauth-token. Windows only.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const flags = (name) => {
  const out = [];
  for (let v = flag(name); v !== undefined; v = flag(name)) out.push(v);
  return out;
};
const has = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1) argv.splice(i, 1);
  return i !== -1;
};

const ROOT = resolve(flag("root", process.env.CR_RIG_ROOT || "I:/Scratch/_rig"));
const HOME = join(ROOT, "home");
const P = {
  home: HOME,
  config: join(HOME, ".claude"),
  store: join(HOME, ".clear-resume"),
  src: join(HOME, "src"),
  userData: join(ROOT, "vscode", "user-data"),
  extensions: join(ROOT, "vscode", "extensions"),
  takes: join(ROOT, "takes"),
  stop: join(ROOT, "takes", ".stop"),
};
const TOKEN_FILE = process.env.CR_RIG_TOKEN_FILE || join(homedir(), ".claude", "secrets", "claude-oauth-token");

// The client area to record, in physical pixels. --logical sizes it by Windows'
// scaling instead (sharper text on screen, but the video is then resampled).
// The top-left is the first non-primary monitor's (the rig's dedicated screen),
// or the primary's when only one is connected.
const CAPTURE = { x: 0, y: 0, w: 1920, h: 1080 };

function rigScreenOrigin() {
  const ps = "Add-Type -AssemblyName System.Windows.Forms; " +
    "Add-Type 'using System;using System.Runtime.InteropServices;public static class D{[DllImport(\"user32.dll\")]public static extern bool SetProcessDpiAwarenessContext(IntPtr v);}'; " +
    "[D]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null; " +
    "$s = [System.Windows.Forms.Screen]::AllScreens | Sort-Object Primary | Select-Object -First 1; \"$($s.Bounds.X) $($s.Bounds.Y)\"";
  const [x, y] = execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim().split(" ").map(Number);
  return { x, y };
}

const die = (msg) => {
  console.error(`rig: ${msg}`);
  process.exit(1);
};
if (process.platform !== "win32") die("Windows only");

// --- environment -----------------------------------------------------------

function token() {
  let t = "";
  try {
    t = readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {}
  if (!t) die(`no token in ${TOKEN_FILE} (make one with \`claude setup-token\`)`);
  return t;
}

// Everything the rig runs gets this environment: the parent's, minus anything that
// would tie it to the session that started it, with the home folder swapped.
function rigEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(ELECTRON_|VSCODE_|CLAUDE|ANTHROPIC_|TERM_PROGRAM|GIT_ASKPASS|MCP_)/i.test(k)) continue;
    env[k] = v;
  }
  Object.assign(env, {
    USERPROFILE: P.home,
    HOME: P.home,
    HOMEDRIVE: P.home.slice(0, 2),
    HOMEPATH: P.home.slice(2),
    CLAUDE_CONFIG_DIR: P.config,
    CLEAR_RESUME_HOME: P.store,
    CLAUDE_CODE_OAUTH_TOKEN: token(),
  });
  return env;
}

// --- tools -----------------------------------------------------------------

const LOCAL = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
const ROAMING = process.env.APPDATA || join(homedir(), "AppData", "Roaming");

function vscode() {
  const dir = join(LOCAL, "Programs", "Microsoft VS Code");
  const exe = join(dir, "Code.exe");
  if (!existsSync(exe)) die(`VS Code not found at ${exe}`);
  // Newer builds keep resources under a commit-hash folder.
  const cli = [join(dir, "resources", "app", "out", "cli.js")]
    .concat(readdirSync(dir).map((d) => join(dir, d, "resources", "app", "out", "cli.js")))
    .find(existsSync);
  if (!cli) die("VS Code's cli.js not found");
  return { exe, cli };
}

function claudeExe() {
  const exe = join(ROAMING, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  return existsSync(exe) ? exe : "claude.exe";
}

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { env: rigEnv(), stdio: "inherit", ...opts });
  if (r.error) die(`${cmd}: ${r.error.message}`);
  return r.status ?? 1;
};
const must = (label, status) => status === 0 || die(`${label} failed (exit ${status})`);

const claude = (...args) => run(claudeExe(), args, { cwd: P.home });
const code = (...args) => {
  const { exe, cli } = vscode();
  return run(exe, [cli, "--user-data-dir", P.userData, "--extensions-dir", P.extensions, ...args], {
    env: { ...rigEnv(), ELECTRON_RUN_AS_NODE: "1" },
  });
};

const readJson = (f, fallback = {}) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return fallback;
  }
};
const mergeJson = (f, patch) => {
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ ...readJson(f), ...patch }, null, 2) + "\n");
};

// --- commands ----------------------------------------------------------------

function setModel(model, effort) {
  mergeJson(join(P.config, "settings.json"), { model, effortLevel: effort });
  console.log(`model ${model}, effort ${effort}`);
}

function setup() {
  const model = flag("model", "sonnet");
  const effort = flag("effort", "medium");
  const plugins = flags("plugin");
  const clones = flags("clone");
  const pluginConfig = flags("plugin-config").flatMap((kv) => ["--config", kv]);
  for (const d of [P.config, P.store, P.src, P.userData, P.extensions, P.takes]) mkdirSync(d, { recursive: true });

  // git needs a name to commit, and reads it from the (rig) home folder.
  const name = execFileSync("git", ["config", "--global", "user.name"], { encoding: "utf8" }).trim();
  const email = execFileSync("git", ["config", "--global", "user.email"], { encoding: "utf8" }).trim();
  writeFileSync(join(P.home, ".gitconfig"), `[user]\n\tname = ${name}\n\temail = ${email}\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n`);

  // Skip the first-run screens; the session should open straight to work.
  const global = join(P.config, ".claude.json");
  if (!existsSync(global)) writeFileSync(global, JSON.stringify({ hasCompletedOnboarding: true, theme: "dark" }, null, 2) + "\n");
  setModel(model, effort);

  // VS Code: readable at 1080p, and nothing that pops up mid-take.
  mergeJson(join(P.userData, "User", "settings.json"), {
    "editor.fontSize": 16,
    "terminal.integrated.fontSize": 16,
    "window.restoreWindows": "none",
    "workbench.startupEditor": "none",
    "workbench.tips.enabled": false,
    "security.workspace.trust.enabled": false,
    "update.mode": "none",
    "extensions.autoUpdate": false,
    "extensions.ignoreRecommendations": true,
    "telemetry.telemetryLevel": "off",
    "git.openRepositoryInParentFolders": "never",
    // VS Code's own AI setup opens a sign-in dialog on a fresh profile.
    "chat.disableAIFeatures": true,
    "workbench.welcomePage.walkthroughs.openOnInstall": false,
    // Claude as an editor tab fills the frame; the side panel left an empty editor.
    "claudeCode.preferredLocation": "panel",
    // ~144%: a 13" laptop's layout (about 1333x750) in a 1080p frame, so text
    // stays readable when the video is watched small.
    "window.zoomLevel": 2,
  });

  for (const slug of new Set(["m4cd4r4/clear-resume", ...plugins, ...clones])) {
    const repo = slug.split("/").pop();
    const dest = join(P.src, repo);
    if (existsSync(dest)) console.log(`${repo}: already cloned, left as is`);
    else must(`clone ${repo}`, run("git", ["clone", "--branch", "main", `https://github.com/${slug}.git`, dest]));
  }

  // The plugin comes from GitHub, as a reader would install it. The relay budget
  // (a number of clears) is left off here: it is set from the command palette.
  must("marketplace add", claude("plugin", "marketplace", "add", "m4cd4r4/clear-resume"));
  must("plugin install", claude("plugin", "install", "clear-resume@clear-resume", "--config", "auto_nudge=true", "--config", "nudge_at=60000"));
  for (const slug of plugins) {
    const repo = slug.split("/").pop();
    must(`marketplace add ${slug}`, claude("plugin", "marketplace", "add", slug));
    must(`plugin install ${repo}`, claude("plugin", "install", `${repo}@${repo}`, ...pluginConfig));
  }

  for (const ext of ["anthropic.claude-code", "macdara.clear-resume"]) must(`install ${ext}`, code("--install-extension", ext, "--force"));
  console.log(`\nrig ready at ${ROOT}`);
}

function rigWindowPids() {
  const out = execFileSync("powershell.exe", ["-NoProfile", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name = 'Code.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"],
  { encoding: "utf8" });
  const needle = P.userData.replace(/\\/g, "/").toLowerCase();
  return out.split(/\r?\n/).filter((l) => l.replace(/\\/g, "/").toLowerCase().includes(needle)).map((l) => Number(l.split("\t")[0]));
}

function place({ measure = false, topmost = false, unpin = false } = {}) {
  const size = has("logical") ? { w: Math.round(CAPTURE.w * 1.25), h: Math.round(CAPTURE.h * 1.25) } : CAPTURE;
  const o = rigScreenOrigin();
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(HERE, "lib", "rig-window.ps1"),
    "-UserDataDir", P.userData, "-X", String(CAPTURE.x + o.x), "-Y", String(CAPTURE.y + o.y), "-Width", String(size.w), "-Height", String(size.h)];
  if (measure) args.push("-Measure");
  if (topmost) args.push("-Topmost");
  if (unpin) args.push("-Unpin");
  const r = spawnSync("powershell.exe", args, { encoding: "utf8" });
  if (r.status !== 0) die(`window: ${(r.stderr || r.stdout).trim()}`);
  return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
}

async function open(folder) {
  if (!folder) die("open <folder>");
  const dir = resolve(P.src, folder);
  if (!existsSync(dir)) die(`no folder ${dir}`);
  if (rigWindowPids().length) die("the rig's VS Code is already open; close it first, or use `place`");
  const { exe } = vscode();
  // Code.exe itself, not code.cmd: the shim attaches to a running VS Code, and a
  // separate --user-data-dir is what keeps this a second, separate instance.
  const child = spawn(exe, ["--user-data-dir", P.userData, "--extensions-dir", P.extensions, "--new-window", dir], {
    env: rigEnv(), detached: true, stdio: "ignore",
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const r = place();
      console.log(`window at ${r.x},${r.y} ${r.w}x${r.h} (pid ${r.pid})`);
      return;
    } catch {}
  }
  die("VS Code started but no window appeared within 20 s");
}

// send [--click x,y] [--keys K] [--text T] [--enter]: input to the rig window.
function send() {
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(HERE, "lib", "rig-input.ps1"), "-UserDataDir", P.userData];
  const click = flag("click");
  const keys = flag("keys");
  const text = flag("text");
  if (click) { const [x, y] = click.split(","); args.push("-ClickX", x, "-ClickY", y); }
  if (keys) args.push("-Keys", keys);
  if (text !== undefined) args.push("-Text", text);
  if (has("enter")) args.push("-Enter");
  const r = spawnSync("powershell.exe", args, { encoding: "utf8" });
  if (r.status !== 0) die(`send: ${(r.stderr || r.stdout).trim()}`);
}

// shot <file.png>: one frame of the window's client area.
function shot(file) {
  if (!file) die("shot <file.png>");
  const r = place({ measure: true });
  const s = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "gdigrab", "-offset_x", String(r.x), "-offset_y", String(r.y),
    "-video_size", `${r.w}x${r.h}`, "-i", "desktop", "-frames:v", "1", "-y", resolve(file)], { stdio: "inherit" });
  if (s.status !== 0) die("shot failed");
  console.log(resolve(file));
}

// Every relay hop, with its time into the take, so the edit can find the hops.
// The relay writes <store>/relay/<key>.json with `used` (clears so far).
function watchHops(log, start) {
  const dir = join(P.store, "relay");
  const seen = new Map();
  const tick = () => {
    let files = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json") && f.split(".").length === 2);
    } catch {}
    for (const f of files) {
      const s = readJson(join(dir, f), null);
      if (!s || typeof s.used !== "number") continue;
      const prev = seen.get(s.key);
      if (prev !== undefined && s.used > prev) {
        const t = ((Date.now() - start) / 1000).toFixed(1);
        const line = `${new Date().toISOString()}\t+${t}s\thop ${s.used}\t${s.key}\tcleared ${s.sessions.at(-1) ?? "?"}\tlimit ${s.limit}`;
        writeFileSync(log, line + "\n", { flag: "a" });
        console.log(line);
      }
      seen.set(s.key, s.used);
    }
  };
  tick();
  return setInterval(tick, 500);
}

async function take(name) {
  if (!name || !/^[\w.-]+$/.test(name)) die("take <name> (letters, digits, . _ -)");
  const dir = join(P.takes, name);
  if (existsSync(dir)) die(`take ${name} exists; pick another name`);
  mkdirSync(dir, { recursive: true });
  rmSync(P.stop, { force: true });

  // Put the window back and on top first: anything over the region is recorded.
  const r = place({ topmost: true });
  const even = (n) => n - (n % 2);
  const rect = { x: r.x, y: r.y, w: even(r.w), h: even(r.h) };
  const mkv = join(dir, "capture.mkv");
  const start = Date.now();
  writeFileSync(join(dir, "take.json"), JSON.stringify({ name, startedAt: new Date(start).toISOString(), rect }, null, 2) + "\n");

  // mkv survives a crash; it is copied to mp4 when the take stops.
  const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "warning", "-f", "gdigrab", "-framerate", "30", "-draw_mouse", "1",
    "-offset_x", String(rect.x), "-offset_y", String(rect.y), "-video_size", `${rect.w}x${rect.h}`, "-i", "desktop",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", mkv], { stdio: ["pipe", "inherit", "inherit"] });
  console.log(`recording ${rect.w}x${rect.h} at ${rect.x},${rect.y} -> ${dir}\nstop with: node scripts/rig.mjs stop`);

  const hops = watchHops(join(dir, "hops.log"), start);
  const done = new Promise((res) => ff.on("exit", res));
  const poll = setInterval(() => {
    if (existsSync(P.stop)) {
      clearInterval(poll);
      ff.stdin.write("q");
    }
  }, 500);
  process.on("SIGINT", () => ff.stdin.write("q"));
  const code = await done;
  clearInterval(poll);
  clearInterval(hops);
  rmSync(P.stop, { force: true });
  try { place({ unpin: true }); } catch {}
  const mp4 = join(dir, "capture.mp4");
  spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", mkv, "-c", "copy", "-movflags", "+faststart", mkv.replace(/mkv$/, "mp4")], { stdio: "inherit" });
  const secs = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`stopped after ${secs}s (ffmpeg exit ${code}); ${existsSync(mp4) ? mp4 : mkv}`);
}

function status() {
  console.log(`root      ${ROOT}`);
  console.log(`home      ${P.home}${existsSync(P.home) ? "" : "  (missing: run setup)"}`);
  console.log(`token     ${existsSync(TOKEN_FILE) && statSync(TOKEN_FILE).size > 0 ? "present" : "MISSING"}`);
  const s = readJson(join(P.config, "settings.json"));
  console.log(`model     ${s.model ?? "-"}, effort ${s.effortLevel ?? "-"}`);
  console.log(`plugins   ${Object.keys(s.enabledPlugins ?? {}).join(", ") || "-"}`);
  console.log(`clones    ${existsSync(P.src) ? readdirSync(P.src).join(", ") || "-" : "-"}`);
  console.log(`vscode    ${rigWindowPids().length ? "open" : "closed"}`);
}

const [cmd, ...rest] = argv;
switch (cmd) {
  case "setup": setup(); break;
  case "open": await open(rest[0]); break;
  case "place": { const r = place(); console.log(`window at ${r.x},${r.y} ${r.w}x${r.h}`); break; }
  case "unpin": place({ unpin: true }); console.log("unpinned"); break;
  case "send": send(); break;
  case "shot": shot(rest[0]); break;
  case "close":for (const pid of rigWindowPids()) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); console.log("closed"); break;
  case "model": rest.length === 2 ? setModel(rest[0], rest[1]) : die("model <model> <effort>"); break;
  case "claude": process.exit(claude(...rest));
  case "take": await take(rest[0]); break;
  case "stop": writeFileSync(P.stop, ""); console.log("stopping"); break;
  case "status": status(); break;
  default: die("setup | open <folder> | place | model <m> <e> | claude <args> | take <name> | stop | status");
}
