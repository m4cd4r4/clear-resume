/* The race: two runs on one clock. x = minutes since each run started, y = context tokens of every reply.
   Top panel: a relay run (a sawtooth: the context resets at each clear). Bottom panel: an auto-compaction run
   (it drops at each compaction). Under each, one cell per PLAN item, filled at the real commit time.
   C.race(data, state, width, p) returns an SVG string; p = 0 to 1 sweeps the clock. */
(function (g) {
  "use strict";
  var C = g.crCharts;
  var YMAX = 220000;
  var NUDGE = 180000;

  C.raceAxisMax = function (a, b) { return Math.max(5, Math.ceil(Math.max(a.endT, b.endT) / 5) * 5); };

  function panel(run, k, tcur, o) {
    var cls = C.armClass(run.group);
    var y0 = o.top + k * o.panelH;
    var py0 = y0 + o.head;
    var X = function (t) { return o.l + (t / o.xMax) * o.pw; };
    var Y = function (v) { return py0 + o.plotH * (1 - v / YMAX); };
    var s = run.series;
    var idx = C.upTo(s.t, tcur);
    var out = "";

    [0, 100000, 200000].forEach(function (v) {
      out += C.line(o.l, Y(v), o.l + o.pw, Y(v), "grid");
      out += C.text(o.l - 6, Y(v) + 3.5, v ? C.kTok(v) : "0", "ax", "end");
    });
    out += C.line(o.l, Y(NUDGE), o.l + o.pw, Y(NUDGE), "nudge");
    out += C.text(o.l + 4, Y(NUDGE) - 4, C.kTok(NUDGE), "ax");

    var done = run.items.filter(function (it) { return it[0] <= tcur; }).length;
    var clears = run.clearsAt.filter(function (t) { return t <= tcur; }).length;
    var cmps = run.compactionEvents.filter(function (e) { return e.t <= tcur; }).length;
    var ctx = idx >= 0 ? s.ctx[idx] : 0;
    var ev = run.group === "relay" ? clears + " " + (clears === 1 ? "clear" : "clears") : cmps + " " + (cmps === 1 ? "compaction" : "compactions");
    var title = C.armName(run.group) + ", run " + run.run;
    var readout = "items " + done + "/" + run.planTotal + "  " + C.kTok(ctx) + " tokens  " + ev;
    out += C.text(o.l, y0 + 13, title, "pt " + cls);
    if (o.narrow) out += C.text(o.l, y0 + 27, readout, "ro");
    else out += C.text(o.l + o.pw, y0 + 13, readout, "ro", "end");

    run.clearsAt.forEach(function (t, i) {
      if (t > tcur) return;
      out += C.line(X(t), py0, X(t), py0 + o.plotH, "ev " + cls);
      if (i === 0) out += C.text(X(t) + 4, py0 + 11, "clear", "evl " + cls);
    });
    run.compactionEvents.forEach(function (e, i) {
      if (e.t > tcur) return;
      out += C.line(X(e.t), py0, X(e.t), py0 + o.plotH, "ev " + cls);
      if (i === 0) out += C.text(X(e.t) + 4, py0 + 11, "compaction " + C.kTok(e.pre) + " to " + C.kTok(e.post), "evl " + cls);
    });

    if (idx >= 0) {
      var pts = [];
      for (var i = 0; i <= idx; i++) pts.push([X(s.t[i]), Y(s.ctx[i])]);
      out += C.poly(pts, "series " + cls);
      out += C.circle(pts[pts.length - 1][0], pts[pts.length - 1][1], 3.5, "dot " + cls);
    }

    if (tcur >= run.endT) {
      var stopped = run.planTicked < run.planTotal;
      if (stopped) {
        out += C.line(X(run.endT), py0, X(run.endT), py0 + o.plotH, "end " + cls);
        out += C.text(X(run.endT) + 6, py0 + o.plotH - 8, "stopped after item " + run.planTicked + ", " + run.planOpen + " open", "flag " + cls);
      } else {
        out += C.text(X(run.endT) - 6, py0 + 11, run.planTicked + " of " + run.planTotal + " items", "flag " + cls, "end");
      }
    }

    var cy = py0 + o.plotH + 9;
    var gap = 2;
    var cw = (o.pw - gap * (run.planTotal - 1)) / run.planTotal;
    for (var c = 0; c < run.planTotal; c++) {
      var on = c < run.items.length && run.items[c][0] <= tcur;
      out += C.rect(o.l + c * (cw + gap), cy, cw, o.cellH, (on ? "cell on " : "cell ") + cls, 1);
    }
    return out;
  }

  C.race = function (data, state, width, p) {
    var narrow = width < 600;
    var o = { narrow: narrow, l: narrow ? 34 : 44, top: 4, plotH: narrow ? 104 : 148, cellH: narrow ? 8 : 10, head: narrow ? 34 : 22 };
    o.pw = width - o.l - (narrow ? 8 : 14);
    o.panelH = o.head + o.plotH + 9 + o.cellH + 18;
    o.xMax = C.raceAxisMax(state.a, state.b);
    var tcur = C.clamp(p, 0, 1) * o.xMax;
    var H = o.top + o.panelH * 2 + 22;
    var out = "";
    out += panel(state.a, 0, tcur, o);
    out += panel(state.b, 1, tcur, o);
    var step = narrow ? 20 : 10;
    var ay = H - 6;
    for (var t = 0; t <= o.xMax; t += step) out += C.text(o.l + (t / o.xMax) * o.pw, ay, t === 0 ? t + " min" : String(t), "ax", t === 0 ? "start" : "middle");
    if (p > 0 && p < 1) {
      var cx = o.l + (tcur / o.xMax) * o.pw;
      out += C.line(cx, o.top, cx, o.top + o.panelH * 2 - 18, "cursor");
    }
    return C.svg(width, H, out, "chart-svg race-svg");
  };
})(typeof window !== "undefined" ? window : globalThis);
