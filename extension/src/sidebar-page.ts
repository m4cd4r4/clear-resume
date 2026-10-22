// The sidebar page: one document for both views. The script draws from the model the
// host posts and builds nodes with textContent only, so handover text cannot inject
// HTML. Laid out as a WAI-ARIA tree so the keyboard and screen-reader behaviour the
// native tree gave for free is rebuilt here: roving tabindex, arrow keys, levels.

const CSS = `
:root {
  --ink: var(--vscode-foreground); --mute: var(--vscode-descriptionForeground);
  --line: var(--vscode-widget-border, color-mix(in srgb, var(--vscode-foreground) 16%, transparent));
  --hover: var(--vscode-list-hoverBackground); --sel: var(--vscode-list-inactiveSelectionBackground, var(--vscode-list-hoverBackground));
  --accent: #2fb5a8; --accent-ink: #2fb5a8; --ok: var(--vscode-testing-iconPassed, #4ec27a);
}
body.vscode-light { --accent: #17867c; --accent-ink: #0f6b62; }
body.vscode-high-contrast, body.vscode-high-contrast-light { --accent: var(--vscode-focusBorder); --accent-ink: var(--vscode-foreground); }
* { box-sizing: border-box; }
body { margin: 0; padding: 0 0 12px; color: var(--ink); font: 13px/1.4 var(--vscode-font-family); background: transparent; }
button, input { font: inherit; color: inherit; }
svg { display: block; flex: none; }
.search { display: block; width: calc(100% - 16px); margin: 8px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--vscode-input-border, var(--line)); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
.search::placeholder { color: var(--vscode-input-placeholderForeground); }
.search:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
[role=treeitem]:focus-visible, button:focus-visible, .link:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
[role=treeitem] { position: relative; cursor: pointer; user-select: none; }
.hd { display: flex; align-items: center; gap: 4px; padding: 8px 10px 4px 8px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); }
.hd .n { margin-left: auto; font-weight: 400; letter-spacing: 0; }
.chev { width: 16px; height: 16px; display: grid; place-items: center; transition: transform .15s; color: var(--mute); }
[aria-expanded="false"] > .line > .chev, [aria-expanded="false"] > .hd > .chev { transform: rotate(-90deg); }
@media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
.row { margin: 1px 6px; border-radius: 6px; box-shadow: inset 2px 0 0 color-mix(in srgb, var(--accent) calc(var(--fade, 1) * 100%), transparent); }
.row[data-kind=loaded] { box-shadow: inset 2px 0 0 var(--ok); }
.row[data-kind=archived], .row[data-kind=lane], .row[data-kind=next] { box-shadow: none; }
/* Finished work recedes: muted title, hollow dot, no rail. Hover and focus bring it back. */
.row[data-kind=archived] .t { color: var(--mute); }
.row[data-kind=archived]:hover .t, .row[data-kind=archived]:focus-within .t { color: var(--ink); }
.row:hover, .row:focus-within { background: var(--hover); }
.row:focus-visible { background: var(--sel); }
.line { display: grid; grid-template-columns: 16px 1fr auto; column-gap: 4px; align-items: center; padding: 6px 8px 6px 6px; }
.t { grid-column: 2; display: flex; align-items: center; gap: 6px; min-width: 0; }
.t > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--accent); opacity: var(--fade, 1); }
.row[data-kind=archived] .dot { background: none; border: 1px solid var(--mute); }
.row[data-kind=next] .dot { background: none; border: 1px solid var(--mute); }
.ok { color: var(--ok); }
.pin { color: var(--accent-ink); }
.age { grid-column: 3; grid-row: 1; color: var(--mute); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
/* The buttons sit on the second line, where they cost the meta text its room, never the title. */
.line { position: relative; }
.acts { position: absolute; right: 6px; bottom: 3px; display: none; gap: 2px; padding-left: 8px; border-radius: 5px; background: var(--hover); }
.row:focus-visible .acts { background: var(--sel); }
.row:hover > .line .acts, .row:focus-within > .line .acts { display: flex; }
.meta { grid-column: 2 / 4; grid-row: 2; color: var(--mute); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* In a narrow sidebar the age leaves the title line for the meta line, so the title keeps the width. */
.agei { display: none; }
@media (max-width: 240px) { .age { display: none; } .agei { display: inline; } }
.ib { height: 22px; min-width: 22px; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; border-radius: 5px; color: var(--mute); border: 0; background: none; cursor: pointer; }
.ib:hover { background: var(--vscode-toolbar-hoverBackground, var(--hover)); color: var(--ink); }
.ib.go { color: var(--accent-ink); }
.peek { margin: 0 8px 6px 28px; padding: 2px 0 2px 10px; border-left: 1px solid var(--line); color: var(--mute); font-size: 12px; line-height: 1.45; cursor: default; user-select: text; }
.peek p { margin: 0 0 3px; overflow-wrap: anywhere; }
.empty { padding: 14px 16px; color: var(--mute); }
.empty p { margin: 0 0 8px; }
.link { color: var(--vscode-textLink-foreground); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
body.vscode-high-contrast .row, body.vscode-high-contrast-light .row { outline: 1px solid var(--vscode-contrastBorder, transparent); }
@media (forced-colors: active) { .dot { background: CanvasText; } }
`;

const SCRIPT = `
const vscode = acquireVsCodeApi();
const saved = vscode.getState() || {};
// state: key -> true/false, only for what the person has touched; defaults come from the model.
const st = { model: null, state: saved.state || {}, q: saved.q || "", focus: saved.focus || "" };
const persist = () => vscode.setState({ state: st.state, q: st.q, focus: st.focus });
const post = (m) => vscode.postMessage(m);
const NS = "http://www.w3.org/2000/svg";
const ICONS = {
  chev: ["0 0 10 10", "M2 3.5l3 3 3-3"],
  play: ["0 0 16 16", "M5 3.5v9l7-4.5z"],
  pin: ["0 0 16 16", "M6 2.5h4M7 2.5v4l-2.5 3h7L9 6.5v-4M8 9.5v4"],
  unpin: ["0 0 16 16", "M6 2.5h4M7 2.5v4l-2.5 3h7L9 6.5v-4M8 9.5v4M2.5 2.5l11 11"],
  trash: ["0 0 16 16", "M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.6 9h5.8l.6-9"],
  check: ["0 0 16 16", "M3.5 8.5l3 3 6-7"],
  home: ["0 0 16 16", "M2.5 8L8 3l5.5 5M4 7v6h8V7"],
  open: ["0 0 16 16", "M9 3h4v4M13 3L7 9M12 10v3H3V4h3"],
};
function icon(name, size) {
  const [vb, d] = ICONS[name];
  const svg = document.createElementNS(NS, "svg");
  const s = size || (name === "chev" ? 10 : 14);
  svg.setAttribute("width", s); svg.setAttribute("height", s); svg.setAttribute("viewBox", vb);
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", 1.4);
  svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); svg.append(p);
  return svg;
}
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
const ctx = (o) => JSON.stringify(Object.assign({ preventDefaultContextMenuItems: true }, o));
const isOpen = (key, dflt) => (key in st.state ? st.state[key] : dflt);
function setOpen(key, open) { st.state[key] = open; persist(); draw(); }
function btn(label, ic, msg, cls) {
  return h("button", { class: "ib " + (cls || ""), "aria-label": label, title: label, tabindex: "-1", on: { click: (e) => { e.stopPropagation(); post(msg); } } }, icon(ic));
}
function chev(key, open) {
  return h("span", { class: "chev", "aria-hidden": "true", on: { click: (e) => { e.stopPropagation(); setOpen(key, !open); } } }, icon("chev"));
}
const spacer = () => h("span", { class: "chev" });

function rowEl(r, level) {
  const expandable = r.peek.length > 0;
  const open = expandable && isOpen(r.key, false);
  const mark = r.kind === "loaded" ? h("span", { class: "ok" }, icon("check")) : h("span", { class: "dot" });
  // A Loaded row's age is its news ("loaded 9m ago"); on the right it would squeeze the title, so it leads the second line.
  const sub = r.kind === "loaded" ? [r.age, r.meta].filter(Boolean).join(" · ") : r.meta;
  const acts = [
    r.kind !== "archived" ? btn("Resume", "play", { type: "resume", id: r.id }, "go") : null,
    r.pinned ? btn("Unpin", "unpin", { type: "unpin", id: r.id }) : btn("Pin", "pin", { type: "pin", id: r.id }),
    btn("Delete", "trash", { type: "delete", id: r.id }),
  ];
  return h("div", {
    class: "row", role: "treeitem", "data-key": r.key, "data-kind": r.kind, "aria-level": level, tabindex: "-1", style: "--fade:" + r.fade,
    "aria-label": [r.title, r.meta, r.age, r.pinned ? "pinned" : ""].filter(Boolean).join(", "),
    "aria-expanded": expandable ? String(open) : null,
    "data-vscode-context": ctx({ webviewSection: "handover", id: r.id, pinned: r.pinned, archived: r.kind === "archived" }),
    on: { click: () => post({ type: r.kind === "loaded" ? "openLoaded" : "open", id: r.id }) },
  },
    h("div", { class: "line" },
      expandable ? chev(r.key, open) : spacer(),
      h("span", { class: "t", title: r.title }, mark, r.pinned ? h("span", { class: "pin" }, icon("pin", 12)) : null, h("span", {}, r.title)),
      h("span", { class: "age" }, r.kind === "loaded" ? "" : r.age),
      h("span", { class: "acts" }, acts),
      h("span", { class: "meta", title: sub }, r.kind === "loaded" ? null : h("span", { class: "agei" }, r.age + " · "), sub)),
    open ? h("div", { class: "peek" }, r.peek.map((l) => h("p", {}, l))) : null);
}
function headEl(key, label, count, open) {
  return h("div", { role: "treeitem", "data-key": key, "data-kind": "group", "aria-level": 1, "aria-expanded": String(open), "aria-label": label + ", " + count, tabindex: "-1", on: { click: () => setOpen(key, !open) } },
    h("div", { class: "hd" }, chev(key, open), label, h("span", { class: "n" }, count)));
}
function laneEl(l) {
  const expandable = l.handovers.length > 0;
  const open = expandable && isOpen(l.key, false);
  const acts = [
    l.resumable ? btn("Resume", "play", { type: "resume", id: l.resumable.id }, "go") : null,
    btn("Open worktree window", "open", { type: "openLane", target: l.target }),
  ];
  return h("div", {
    class: "row", role: "treeitem", "data-key": l.key, "data-kind": "lane", "aria-level": 1, tabindex: "-1",
    "aria-label": [l.title, l.meta].filter(Boolean).join(", "), "aria-expanded": expandable ? String(open) : null,
    "data-vscode-context": ctx({ webviewSection: "lane", target: l.target }),
    on: { click: () => post({ type: "openLane", target: l.target }) },
  },
    h("div", { class: "line" },
      expandable ? chev(l.key, open) : spacer(),
      h("span", { class: "t", title: l.why || l.title }, l.main ? icon("home") : null, h("span", {}, l.title)),
      h("span", { class: "acts" }, acts),
      l.meta ? h("span", { class: "meta", title: l.meta }, l.meta) : null));
}
function nextEl(n) {
  return h("div", { class: "row", role: "treeitem", "data-key": n.key, "data-kind": "next", "aria-level": 2, tabindex: "-1", "aria-label": [n.title, n.meta].filter(Boolean).join(", ") },
    h("div", { class: "line" }, spacer(), h("span", { class: "t", title: n.why || n.title }, h("span", { class: "dot" }), h("span", {}, n.title)), n.meta ? h("span", { class: "meta", title: n.meta }, n.meta) : null));
}

function empty(m) {
  const box = h("div", { class: "empty" });
  if (m.section === "handovers" && !m.query) {
    box.append(h("p", {}, "No handovers yet."), h("p", {}, "Write one with the /clear-resume:handover skill."));
    if (m.hasLegacy) box.append(h("button", { class: "link", on: { click: () => post({ type: "migrate" }) } }, "Import existing handovers"));
  }
  return box;
}
function items(m) {
  const out = [];
  if (m.section === "handovers") {
    for (const s of m.sections) {
      // A search opens every group that has a match, so a hit is never hidden under a closed header.
      const key = "g:" + s.id, open = isOpen(key, !s.collapsed || !!m.query) || !s.label;
      if (s.label) out.push(headEl(key, s.label, s.rows.length, open));
      if (open) for (const r of s.rows) out.push(rowEl(r, s.label ? 2 : 1));
    }
    return out;
  }
  for (const l of m.lanes.lanes) {
    out.push(laneEl(l));
    if (l.handovers.length && isOpen(l.key, false)) for (const r of l.handovers) out.push(rowEl(r, 2));
  }
  if (m.lanes.next.length) {
    const open = isOpen("g:next", m.lanes.next.length <= 8);
    out.push(headEl("g:next", "Next up", m.lanes.next.length, open));
    if (open) for (const n of m.lanes.next) out.push(nextEl(n));
  }
  return out;
}

const tree = h("div", { role: "tree", id: "tree" });
const search = h("input", { class: "search", type: "search", "aria-label": "Search", placeholder: "Search", value: st.q, on: { input: (e) => { st.q = e.target.value; persist(); post({ type: "search", q: st.q }); } } });
document.body.append(tree);

function draw() {
  const m = st.model; if (!m) return;
  tree.setAttribute("aria-label", m.section === "handovers" ? "Handovers" : "Worktrees");
  // Search narrows handovers only; a repo has a handful of worktrees.
  if (m.section === "handovers" && !search.isConnected) document.body.prepend(search);
  const had = tree.contains(document.activeElement);
  const list = items(m);
  // A flat list has no nesting for a screen reader to count, so say "n of m" per parent.
  const number = (els) => els.forEach((el, i) => { el.setAttribute("aria-posinset", i + 1); el.setAttribute("aria-setsize", els.length); });
  const tops = [];
  let kids = [];
  for (const el of list) {
    if (el.getAttribute("aria-level") === "1") { number(kids); kids = []; tops.push(el); }
    else kids.push(el);
  }
  number(kids);
  number(tops);
  tree.replaceChildren(...list);
  if (list.length === 0) { tree.append(empty(m)); return; }
  const keep = list.find((el) => el.dataset.key === st.focus) || list[0];
  keep.tabIndex = 0;
  if (had) keep.focus();
}
const visible = () => [...tree.querySelectorAll("[role=treeitem]")];
function focusItem(el) { if (!el) return; visible().forEach((x) => (x.tabIndex = -1)); el.tabIndex = 0; el.focus(); st.focus = el.dataset.key; persist(); }

tree.addEventListener("keydown", (e) => {
  const el = e.target.closest("[role=treeitem]");
  if (!el || e.target !== el) return;
  const all = visible(), i = all.indexOf(el), key = el.dataset.key;
  const expandable = el.hasAttribute("aria-expanded"), open = el.getAttribute("aria-expanded") === "true";
  const level = Number(el.getAttribute("aria-level"));
  let handled = true;
  if (e.key === "ArrowDown") focusItem(all[i + 1]);
  else if (e.key === "ArrowUp") focusItem(all[i - 1]);
  else if (e.key === "Home") focusItem(all[0]);
  else if (e.key === "End") focusItem(all[all.length - 1]);
  else if (e.key === "ArrowRight") { if (expandable && !open) { st.focus = key; setOpen(key, true); } else if (expandable && all[i + 1] && Number(all[i + 1].getAttribute("aria-level")) > level) focusItem(all[i + 1]); }
  else if (e.key === "ArrowLeft") {
    if (expandable && open) { st.focus = key; setOpen(key, false); }
    else { const up = all.slice(0, i).reverse().find((x) => Number(x.getAttribute("aria-level")) < level); focusItem(up); }
  }
  else if (e.key === " ") { if (expandable) { st.focus = key; setOpen(key, !open); } }
  else if (e.key === "Enter") el.click();
  else handled = false;
  if (handled) e.preventDefault();
});
tree.addEventListener("focusin", (e) => { const el = e.target.closest("[role=treeitem]"); if (el) st.focus = el.dataset.key; });
window.addEventListener("message", (e) => { if (e.data && e.data.type === "model") { st.model = e.data.model; draw(); } });
post({ type: "ready", q: st.q });
`;

export const pageHtml = (nonce: string, cspSource: string) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">${CSS}</style></head><body><script nonce="${nonce}">${SCRIPT}</script></body></html>`;
