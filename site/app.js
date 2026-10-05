/* clear-resume site: page behaviour. No dependencies, works from disk. */
(function () {
  "use strict";
  var run = window.crRun || null;
  if (run && run.source) document.documentElement.setAttribute("data-source", run.source);

  /* Fallback feed: reveals the loop line by line, bars climb, then holds and starts over.
     Reduced motion shows the final frame and never animates. */
  var TOTAL = 24;
  function bar(n) {
    var s = "[";
    for (var i = 0; i < TOTAL; i++) s += i < n ? "█" : "░";
    return s + "]";
  }
  window.crFeed = {
    start: function (feedEl, still) {
      if (!feedEl || feedEl._started) return;
      feedEl._started = true;
      var lines = Array.prototype.slice.call(feedEl.querySelectorAll(".ln"));
      var finalFrame = function () {
        lines.forEach(function (ln) {
          if (ln.hasAttribute("data-bar")) ln.textContent = bar(+ln.getAttribute("data-bar"));
          ln.classList.add("on");
        });
      };
      if (still) { finalFrame(); return; }
      var i = 0;
      var step = function () {
        if (i === lines.length) { setTimeout(restart, 4000); return; }
        var ln = lines[i++];
        ln.classList.add("on");
        if (!ln.hasAttribute("data-bar")) { setTimeout(step, 1100); return; }
        var target = +ln.getAttribute("data-bar");
        var n = target > 3 ? 4 : 0;
        var climb = function () {
          ln.textContent = bar(n);
          if (n >= target) { setTimeout(step, 700); return; }
          n++;
          setTimeout(climb, 110);
        };
        climb();
      };
      var restart = function () {
        lines.forEach(function (ln) { ln.classList.remove("on"); });
        i = 0;
        step();
      };
      step();
    }
  };

  /* Media box: the replay video, or the fallback feed when the video or poster is missing. */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var box = document.getElementById("media-box");
  var video = document.getElementById("replay");
  if (box && video) {
    var btn = document.getElementById("mbtn");
    var cap = document.getElementById("media-cap");
    var fellBack = false;
    var fallback = function () {
      if (fellBack) return;
      fellBack = true;
      try { video.pause(); } catch (e) { /* nothing to pause */ }
      video.removeAttribute("src");
      box.classList.add("is-fallback");
      if (cap) cap.hidden = true;
      var feed = document.getElementById("feed");
      if (feed) feed.hidden = false;
      if (window.crFeed) window.crFeed.start(feed, reduce);
    };
    var setBtn = function () {
      var paused = video.paused;
      /* the label names the action; data-paused only switches the icon */
      btn.setAttribute("data-paused", paused ? "true" : "false");
      btn.setAttribute("aria-label", paused ? "Play replay" : "Pause replay");
    };
    if (reduce) {
      video.autoplay = false;
      video.removeAttribute("autoplay");
      try { video.pause(); } catch (e) { /* not started */ }
    }
    video.addEventListener("error", fallback);
    video.addEventListener("loadeddata", function () { if (!fellBack && cap) cap.hidden = false; });
    video.addEventListener("play", setBtn);
    video.addEventListener("pause", setBtn);
    btn.addEventListener("click", function () {
      if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      else video.pause();
    });
    setBtn();

    /* Expand: the same replay near full width in a dialog, with sound and controls.
       The inline copy stays muted, since browsers only autoplay a muted video. */
    var dlg = document.getElementById("media-full");
    var full = document.getElementById("replay-full");
    if (dlg && full && dlg.showModal) {
      var wasPlaying = false;
      var expand = function () {
        if (fellBack) return;
        wasPlaying = !video.paused;
        video.pause();
        if (!full.getAttribute("src")) full.src = video.getAttribute("src");
        full.currentTime = video.currentTime;
        full.muted = false;
        dlg.showModal();
        var p = full.play(); if (p && p.catch) p.catch(function () {});
      };
      video.addEventListener("click", expand);
      document.getElementById("mbig").addEventListener("click", expand);
      document.getElementById("mclose").addEventListener("click", function () { dlg.close(); });
      /* a click on the backdrop lands on the dialog itself */
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener("close", function () {
        full.pause();
        video.currentTime = full.currentTime;
        if (wasPlaying) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      });
    } else {
      document.getElementById("mbig").hidden = true;
    }
    if (video.error || video.networkState === 3) fallback();
    var poster = new Image();
    poster.onerror = fallback;
    poster.src = video.getAttribute("poster");
  }

  /* Sawtooth chart: x = minutes since the run started, y = context tokens, one line per session. */
  var NS = "http://www.w3.org/2000/svg";
  var kTok = function (n) { return Math.round(n / 1000) + "k"; };
  function el(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function drawSaw() {
    var host = document.getElementById("saw-svg");
    if (!host || !run || !run.sessions || !run.sessions.length) return;
    var W = Math.max(280, Math.round(host.clientWidth));
    var narrow = W < 600;
    var H = narrow ? 340 : 360;
    var m = { l: 46, r: 12, t: 30, b: 40 };
    var YMAX = 220000;
    var last = run.sessions[run.sessions.length - 1].points;
    var xMax = Math.max(1, Math.ceil(last[last.length - 1][0] / 5) * 5);
    var x = function (v) { return m.l + (v / xMax) * (W - m.l - m.r); };
    var y = function (v) { return m.t + (1 - v / YMAX) * (H - m.t - m.b); };
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", focusable: "false" });

    [0, 50000, 100000, 150000, 200000].forEach(function (v) {
      svg.appendChild(el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "grid" }));
      svg.appendChild(el("text", { x: m.l - 8, y: y(v) + 4, class: "ax", "text-anchor": "end" }, v ? kTok(v) : "0"));
    });
    var xStep = narrow ? 20 : 10;
    for (var t = 0; t <= xMax; t += xStep) {
      svg.appendChild(el("text", { x: x(t), y: H - m.b + 18, class: "ax", "text-anchor": "middle" }, String(t)));
    }
    svg.appendChild(el("text", { x: W - m.r, y: H - 4, class: "ax", "text-anchor": "end" }, "minutes"));
    svg.appendChild(el("text", { x: 0, y: 12, class: "ax" }, "context tokens"));

    run.sessions.forEach(function (s, i) {
      if (!s.points.length) return;
      if (i > 0) {
        var cx = x(s.points[0][0]);
        svg.appendChild(el("line", { x1: cx, x2: cx, y1: m.t, y2: H - m.b, class: "clear" }));
      }
      var d = s.points.map(function (p) { return x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1); }).join(" ");
      svg.appendChild(el("polyline", { points: d, class: "sess" }));
    });

    var nudge = run.nudgeAt || 180000;
    svg.appendChild(el("line", { x1: m.l, x2: W - m.r, y1: y(nudge), y2: y(nudge), class: "nudge" }));
    /* The nudge label sits in an HTML key under the chart, so it wraps at 390 and never crosses a line. */
    var key = document.getElementById("saw-nudge");
    if (key && run.nudgeAt) {
      key.setAttribute("data-fact", "F26");
      key.textContent = "nudge at " + kTok(run.nudgeAt) + " (this run's setting)";
    }

    host.textContent = "";
    host.appendChild(svg);
  }
  function fillRun() {
    if (!run || !run.sessions) return;
    var peaks = run.sessions.map(function (s) { return Math.max.apply(null, s.points.map(function (p) { return p[1]; })); });
    var vals = { sessions: String(run.sessions.length), peakLo: kTok(Math.min.apply(null, peaks)), peakHi: kTok(Math.max.apply(null, peaks)) };
    document.querySelectorAll("[data-run]").forEach(function (e) {
      var k = e.getAttribute("data-run");
      if (k in vals) e.textContent = vals[k];
    });
  }
  fillRun();
  drawSaw();
  var sawW = 0;
  window.addEventListener("resize", function () {
    var host = document.getElementById("saw-svg");
    if (host && host.clientWidth !== sawW) { sawW = host.clientWidth; drawSaw(); }
  });

  /* The model (how-it-works.html): crModel from model.js, run again on every input. */
  var tok = function (n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n / 1000) + "k"; };
  var mForm = document.getElementById("model-form");
  if (mForm && window.crModel) {
    var M = window.crModel;
    var mIn = { start: document.getElementById("m-start"), clear: document.getElementById("m-clear"), work: document.getElementById("m-work") };
    var mLast = null;
    var mDraw = function (r, win, work) {
      var host = document.getElementById("model-svg");
      var W = Math.max(280, Math.round(host.clientWidth));
      var narrow = W < 600;
      var H = narrow ? 320 : 340;
      var m = { l: 50, r: 14, t: 30, b: 40 };
      var x = function (v) { return m.l + (v / work) * (W - m.l - m.r); };
      var y = function (v) { return m.t + (1 - v / win) * (H - m.t - m.b); };
      var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", focusable: "false" });
      [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
        svg.appendChild(el("line", { x1: m.l, x2: W - m.r, y1: y(win * f), y2: y(win * f), class: "grid" }));
        svg.appendChild(el("text", { x: m.l - 8, y: y(win * f) + 4, class: "ax", "text-anchor": "end" }, f ? tok(win * f) : "0"));
      });
      var ticks = narrow ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
      ticks.forEach(function (f) {
        svg.appendChild(el("text", { x: x(work * f), y: H - m.b + 18, class: "ax", "text-anchor": f === 1 ? "end" : f ? "middle" : "start" }, f ? tok(work * f) : "0"));
      });
      svg.appendChild(el("text", { x: W - m.r, y: H - 4, class: "ax", "text-anchor": "end" }, "work done, tokens"));
      svg.appendChild(el("text", { x: 0, y: 12, class: "ax" }, "context tokens"));
      [["base", r.base], ["sess", r.clear]].forEach(function (p) {
        var d = p[1].pts.map(function (q) { return x(q[0]).toFixed(1) + "," + y(q[1]).toFixed(1); }).join(" ");
        svg.appendChild(el("polyline", { points: d, class: p[0] }));
      });
      host.textContent = "";
      host.appendChild(svg);
    };
    var mUpdate = function () {
      var win = +mForm.querySelector('input[name="mwin"]:checked').value;
      var start = +mIn.start.value;
      /* clear-at stays at least one step above the start plus the handover, so crModel never throws */
      mIn.clear.min = Math.max(50000, Math.ceil((start + M.HANDOVER + M.STEP) / 1000) * 1000);
      mIn.clear.max = M.compactAt(win) - M.STEP;
      var clearAt = Math.min(Math.max(+mIn.clear.value, +mIn.clear.min), +mIn.clear.max);
      mIn.clear.value = clearAt;
      var work = +mIn.work.value;
      var r = M.run({ window: win, start: start, clearAt: clearAt, work: work });
      var vals = { mStart: tok(start), mClearAt: tok(clearAt), mWork: tok(work), mCompact: tok(M.compactAt(win)) };
      vals.mClearResets = String(r.clear.resets); vals.mClearPeak = tok(r.clear.peak); vals.mClearReread = tok(r.clear.reread);
      vals.mBaseResets = String(r.base.resets); vals.mBasePeak = tok(r.base.peak); vals.mBaseReread = tok(r.base.reread);
      document.querySelectorAll("[data-run]").forEach(function (e) {
        var k = e.getAttribute("data-run");
        if (k in vals) e.textContent = vals[k];
      });
      ["start", "clear", "work"].forEach(function (k) { mIn[k].setAttribute("aria-valuetext", tok(+mIn[k].value)); });
      document.getElementById("m-note200").hidden = win !== 200000;
      mLast = [r, win, work];
      mDraw(r, win, work);
    };
    mForm.addEventListener("input", mUpdate);
    mForm.addEventListener("submit", function (e) { e.preventDefault(); });
    mUpdate();
    var mW = 0;
    window.addEventListener("resize", function () {
      var host = document.getElementById("model-svg");
      if (mLast && host.clientWidth !== mW) { mW = host.clientWidth; mDraw(mLast[0], mLast[1], mLast[2]); }
    });
  }

  /* Copy buttons: clipboard API when present, else a hidden textarea and execCommand. */
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  /* one polite status region, so "Copied" is announced as well as shown */
  var status = document.createElement("p");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  document.body.appendChild(status);
  function flash(btn, msg) {
    btn.textContent = msg;
    status.textContent = msg === "Copy" ? "" : msg;
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { btn.textContent = "Copy"; }, 1600);
  }
  document.querySelectorAll(".cmd").forEach(function (row) {
    var btn = row.querySelector(".copy");
    var code = row.querySelector("code");
    if (!btn || !code) return;
    /* the command itself describes the button, so the label carries no copy of its own */
    if (!code.id) code.id = "cmd-" + Math.random().toString(36).slice(2, 8);
    btn.setAttribute("aria-describedby", code.id);
    btn.addEventListener("click", function () {
      var text = code.textContent;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
          function () { flash(btn, "Copied"); },
          function () { flash(btn, fallbackCopy(text) ? "Copied" : "Select"); }
        );
      } else {
        flash(btn, fallbackCopy(text) ? "Copied" : "Select");
      }
    });
  });

  /* A strip slot holding "n/a" is not a figure: mark it so it reads as absent. */
  Array.prototype.forEach.call(document.querySelectorAll(".strip .n"), function (n) {
    if (n.textContent.trim() === "n/a") n.classList.add("na");
  });
})();
