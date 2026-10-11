/* Dot plots and the predicted-against-measured strip. Every mark is a measured run; nothing is drawn for a run
   that did not happen. p = 0 to 1 plays the reveal: dots land in run order, then the range, then the median tick. */
(function (g) {
  "use strict";
  var C = g.crCharts;
  var STACK = [0, -1, 1, -2, 2, -3, 3];

  /* A dot, with a hover title naming the run. */
  function dot(x, y, r, cls, opacity, title) {
    return "<circle cx=\"" + Math.round(x * 10) / 10 + "\" cy=\"" + Math.round(y * 10) / 10 + "\" r=\"" + r + "\" class=\"" + cls + "\" opacity=\"" +
      Math.round(opacity * 100) / 100 + "\">" + (title ? "<title>" + C.esc(title) + "</title>" : "") + "</circle>";
  }

  /* Offsets that keep dots at (nearly) the same x from landing on each other. */
  function stack(placed, x, rad) {
    var off = 0;
    STACK.some(function (k) {
      off = k * (rad * 1.7);
      return !placed.some(function (o) { return Math.abs(o[0] - x) < rad * 2.1 && Math.abs(o[1] - off) < rad * 1.7; });
    });
    placed.push([x, off]);
    return off;
  }

  /* spec: { lo, hi, ticks: [v], tick: fn(v) -> text, tall, rows: [{ label, cls, runs: [{ v, hollow, tag, title }], median, text, rings: [{ v, label }] }] } */
  C.dots = function (spec, width, p) {
    var narrow = width < 600;
    var labelW = narrow ? 0 : 168, textW = narrow ? 0 : (spec.textW || 150);
    var l = labelW + (narrow ? 10 : 8), r = textW + 14;
    var pw = width - l - r;
    var rowH = (narrow ? 74 : 54) + (spec.tall ? 14 : 0);
    var top = 6;
    var H = top + spec.rows.length * rowH + 26;
    var X = function (v) { return l + ((v - spec.lo) / (spec.hi - spec.lo)) * pw; };
    var rad = narrow ? 5.5 : 6.5;
    var out = "";
    spec.ticks.forEach(function (v) {
      out += C.line(X(v), top, X(v), H - 24, "grid");
      out += C.text(X(v), H - 8, spec.tick(v), "ax", "middle");
    });
    spec.rows.forEach(function (row, ri) {
      var y0 = top + ri * rowH;
      var ly = narrow ? y0 + 20 : y0 + rowH / 2;
      var cy = narrow ? y0 + 48 + (spec.tall ? 7 : 0) : y0 + rowH / 2;
      out += C.text(narrow ? 10 : 0, narrow ? y0 + 14 : ly + 4, row.label, "rl " + row.cls);
      out += C.text(narrow ? width - 10 : width - 14, narrow ? y0 + 14 : ly + 4, row.text, "rv", "end");
      out += C.line(l, cy, l + pw, cy, "axis");
      var done = row.runs.filter(function (q) { return !q.hollow; }).map(function (q) { return q.v; });
      if (done.length > 1 && p > 0.7) out += C.line(X(Math.min.apply(null, done)), cy, X(Math.max.apply(null, done)), cy, "range " + row.cls);
      var placed = [];
      row.runs.slice().sort(function (a, b) { return a.v - b.v; }).forEach(function (q, di) {
        var t = C.ease(C.span(p, ri * 0.07 + di * 0.06, ri * 0.07 + di * 0.06 + 0.3));
        if (t <= 0) return;
        var x = X(q.v), off = stack(placed, x, rad);
        out += dot(x, cy + off - (1 - t) * 18, rad, "dot " + row.cls + (q.hollow ? " hollow" : ""), t, q.title);
        if (q.tag && t >= 1) out += C.text(x, cy + off + rad + 13, q.tag, "evl " + row.cls, "middle");
      });
      if (row.median != null && p > 0.85) {
        out += C.line(X(row.median), cy - rad - 7, X(row.median), cy + rad + 7, "median " + row.cls);
      }
      (row.rings || []).forEach(function (ring) {
        if (p < 0.9) return;
        out += C.circle(X(ring.v), cy, rad + 3, "ring");
        out += C.text(X(ring.v), cy + rad + 17, ring.label, "evl", "middle");
      });
    });
    return C.svg(width, H, out, "chart-svg dots-svg");
  };

  /* The predictions strip: one row per prediction, each on its own scale. The dashed box is the predicted
     range (written before the runs); each dot is one measured run. spec.rows: [{ label, cls, lo, hi, ticks,
     tick: fn(v) -> text, band: [a, b], runs: [{ v, title }], text }] */
  C.predict = function (spec, width, p) {
    var narrow = width < 600;
    var labelW = narrow ? 0 : 226, textW = narrow ? 0 : 118;
    var l = labelW + (narrow ? 14 : 10), r = textW + 18;
    var pw = width - l - r;
    var rowH = narrow ? 78 : 50;
    var top = 4;
    var H = top + spec.rows.length * rowH + 2;
    var rad = narrow ? 5.5 : 6;
    var out = "";
    spec.rows.forEach(function (row, ri) {
      var y0 = top + ri * rowH;
      var cy = narrow ? y0 + 38 : y0 + 19;
      var X = function (v) { return l + ((v - row.lo) / (row.hi - row.lo)) * pw; };
      out += C.text(narrow ? 14 : 0, narrow ? y0 + 14 : cy + 4, row.label, "rl " + row.cls);
      out += C.line(l, cy, l + pw, cy, "axis");
      row.ticks.forEach(function (v) {
        out += C.line(X(v), cy - 4, X(v), cy + 4, "tk");
        out += C.text(X(v), cy + 24, row.tick(v), "ax", "middle");
      });
      var t = C.ease(C.span(p, ri * 0.05, ri * 0.05 + 0.25));
      if (t > 0) {
        var a = X(row.band[0]), b = X(row.band[1]);
        var w = Math.max(b - a, 12);
        out += "<g opacity=\"" + Math.round(t * 100) / 100 + "\">" + C.rect(a - (w - (b - a)) / 2, cy - 12, w, 24, "ring", 3) + "</g>";
      }
      var placed = [];
      row.runs.slice().sort(function (u, v) { return u.v - v.v; }).forEach(function (q, di) {
        var d = C.ease(C.span(p, 0.3 + ri * 0.05 + di * 0.04, 0.3 + ri * 0.05 + di * 0.04 + 0.25));
        if (d <= 0) return;
        var x = X(q.v), off = stack(placed, x, rad) * 0.8;
        out += dot(x, cy + off, rad, "dot " + row.cls, d, q.title);
      });
      if (p > 0.85) out += C.text(narrow ? width - 14 : width - 4, narrow ? y0 + 14 : cy + 4, row.text, "rv", "end");
    });
    return C.svg(width, H, out, "chart-svg predict-svg");
  };
})(typeof window !== "undefined" ? window : globalThis);
