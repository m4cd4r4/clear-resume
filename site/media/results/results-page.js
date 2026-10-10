/* Results page controller: fills data-res slots from crResults, draws every chart with crCharts, plays the
   race, counts numbers up once. No network. prefers-reduced-motion gets the complete final frame of every chart. */
(function () {
  "use strict";
  var D = window.crResults, C = window.crCharts, P = window.crPage || {};
  if (!D || !C) return;
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var show = P.show || ["race", "finish", "tokens", "cost", "floor", "idle"];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var runs = D.runs;
  var SHORT = C.short;
  var S = C.specs(D);

  function runKeys(group) {
    return Object.keys(runs).filter(function (k) { return runs[k].group === group && runs[k].series; })
      .sort(function (a, b) { return runs[a].run - runs[b].run; });
  }

  /* data-res slots: the static text is already right; this keeps it tied to the data file */
  $$("[data-res]").forEach(function (el) {
    var v = C.get(D, el.getAttribute("data-res"));
    if (v !== undefined) el.textContent = C.fmt(v, el.getAttribute("data-fixed"), el.getAttribute("data-k"));
  });

  /* findings not in the show list leave the page */
  $$("[data-finding]").forEach(function (el) {
    if (show.indexOf(el.getAttribute("data-finding")) < 0) el.parentNode.removeChild(el);
  });
  var anchor = $("#install");
  show.forEach(function (id) {
    var el = id === "race" ? null : $("[data-finding=\"" + id + "\"]");
    if (el && anchor) anchor.parentNode.insertBefore(el, anchor);
  });

  /* ---- generic animated chart ---- */
  var mounts = [];
  function mount(id, build, ms) {
    var host = $("[data-chart=\"" + id + "\"]");
    if (!host) return;
    var m = { host: host, build: build, p: reduced ? 1 : 0, ms: ms || 1800, started: false, w: 0 };
    m.draw = function () {
      var w = Math.floor(host.clientWidth);
      if (w < 200) return;
      m.w = w;
      host.innerHTML = build(w, m.p);
    };
    m.play = function () {
      if (m.started) return;
      m.started = true;
      if (reduced) { m.p = 1; m.draw(); return; }
      var t0 = null;
      var step = function (t) {
        if (t0 === null) t0 = t;
        m.p = Math.min(1, (t - t0) / m.ms);
        m.draw();
        if (m.p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    m.draw();
    mounts.push(m);
    return m;
  }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      var m = e.target._mount;
      if (m) m.play();
      if (e.target._count) e.target._count();
    });
  }, { threshold: 0.3 }) : null;
  function watch(el, m) {
    el._mount = m;
    if (io) io.observe(el); else if (m) m.play();
  }

  /* ---- the race ---- */
  var raceHost = $("#race-chart");
  if (raceHost) {
    var st = {
      a: runs[(P.race && P.race.a) || "relay"],
      b: runs[(P.race && P.race.b) || "compact200"]
    };
    var play = $("#race-play"), scrub = $("#race-scrub"), pickHost = $("#race-pick");
    var rp = reduced ? 1 : 0, raf = 0, playing = false, last = 0, RACE_MS = 14000;
    var drawRace = function () {
      var w = Math.floor(raceHost.clientWidth);
      if (w < 200) return;
      raceHost.innerHTML = C.race(D, st, w, rp);
      scrub.value = String(Math.round(rp * 1000));
      play.textContent = playing ? "Pause" : rp >= 1 ? "Replay" : "Play";
    };
    var frame = function (t) {
      if (!playing) return;
      rp = Math.min(1, rp + (t - last) / RACE_MS);
      last = t;
      if (rp >= 1) playing = false;
      drawRace();
      if (playing) raf = requestAnimationFrame(frame);
    };
    var go = function () {
      if (rp >= 1) rp = 0;
      playing = true;
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      drawRace();
    };
    var halt = function () { playing = false; cancelAnimationFrame(raf); drawRace(); };
    play.addEventListener("click", function () { if (playing) halt(); else go(); });
    scrub.addEventListener("input", function () { playing = false; cancelAnimationFrame(raf); rp = +scrub.value / 1000; drawRace(); });
    if (reduced) play.hidden = true;

    [["relay", "a"], ["autocompact", "b"]].forEach(function (g) {
      var box = document.createElement("div");
      box.className = "pick";
      var name = document.createElement("span");
      name.className = "pick-name " + C.armClass(g[0]);
      name.textContent = C.armName(g[0]);
      box.appendChild(name);
      runKeys(g[0]).forEach(function (k) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = String(runs[k].run);
        b.setAttribute("aria-label", C.armName(g[0]) + " run " + runs[k].run);
        b.setAttribute("aria-pressed", st[g[1]] === runs[k] ? "true" : "false");
        b.addEventListener("click", function () {
          st[g[1]] = runs[k];
          $$("button", box).forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
          if (reduced) { rp = 1; drawRace(); } else go();
        });
        box.appendChild(b);
      });
      pickHost.appendChild(box);
    });

    drawRace();
    var raceView = { _count: function () { if (!reduced && rp === 0) go(); } };
    var fig = $("#race-fig");
    fig._count = raceView._count;
    if (io) io.observe(fig); else if (!reduced) go();
    var rw = 0;
    window.addEventListener("resize", function () { if (raceHost.clientWidth !== rw) { rw = raceHost.clientWidth; drawRace(); } });
  }

  /* ---- finding charts (specs live in chart-specs.js, shared with the video) ---- */
  var charts = S.draw;
  Object.keys(charts).forEach(function (id) {
    var m = mount(id, charts[id], 1800);
    if (m) watch(m.host, m);
  });
  var rw2 = 0;
  window.addEventListener("resize", function () {
    var w = document.documentElement.clientWidth;
    if (w === rw2) return;
    rw2 = w;
    mounts.forEach(function (m) { m.draw(); });
  });

  /* ---- numbers count up once, when their finding scrolls into view ---- */
  $$(".finding").forEach(function (sec) {
    var slots = $$(".claim [data-res]", sec);
    if (!slots.length) return;
    var finals = slots.map(function (s) { return s.textContent; });
    var dec = finals.map(function (t) { return (t.split(".")[1] || "").length; });
    sec._count = function () {
      if (reduced) return;
      slots.forEach(function (s, i) { s.textContent = (0).toFixed(dec[i]); });
      var t0 = null;
      var step = function (t) {
        if (t0 === null) t0 = t;
        var e = C.ease(Math.min(1, (t - t0) / 1100));
        slots.forEach(function (s, i) {
          var target = parseFloat(finals[i]);
          s.textContent = e >= 1 ? finals[i] : (target * e).toFixed(dec[i]);
        });
        if (e < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (io) io.observe(sec);
  });

  /* ---- every run, as a table ---- */
  var tbl = $("#runs-table");
  if (tbl) {
    var order = [];
    ["relay", "autocompact", "long", "trim", "old"].forEach(function (g) { D.groups[g].runs.forEach(function (k) { order.push(k); }); });
    var head = ["run", "sessions", "clears", "compactions", "tokens M", "cost US$", "minutes", "items"];
    var rowsHtml = order.map(function (k) {
      var r = runs[k];
      var cells = [(SHORT[r.group] || r.group) + " " + r.run, r.sessions, r.clears, r.compactions, r.tokensM, r.costUsd.toFixed(2), r.wallMin,
        r.planTicked + "/" + r.planTotal + (r.finished ? "" : " stopped")];
      return "<tr>" + cells.map(function (c, i) { return i ? "<td class=\"num\">" + C.esc(c) + "</td>" : "<th scope=\"row\">" + C.esc(c) + "</th>"; }).join("") + "</tr>";
    }).join("");
    tbl.innerHTML = "<table><thead><tr>" + head.map(function (h) { return "<th scope=\"col\">" + h + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rowsHtml + "</tbody></table>";
  }
})();
