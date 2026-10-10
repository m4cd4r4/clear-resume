/* Dot plots, plan-item strips and cost bars. Every mark is a measured run; nothing is drawn for a run that
   did not happen. p = 0 to 1 plays the reveal: dots land in run order, then the range, then the median tick. */
(function (g) {
  "use strict";
  var C = g.crCharts;

  /* spec: { lo, hi, ticks: [v], tick: fn(v) -> text, rows: [{ label, cls, runs: [{ v, hollow, tag }], median, text, rings: [{ v, label }] }] } */
  C.dots = function (spec, width, p) {
    var narrow = width < 600;
    var labelW = narrow ? 0 : 168, textW = narrow ? 0 : 150;
    var l = labelW + (narrow ? 10 : 8), r = textW + 14;
    var pw = width - l - r;
    var rowH = narrow ? 74 : 54;
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
      var cy = narrow ? y0 + 48 : y0 + rowH / 2;
      out += C.text(narrow ? 10 : 0, narrow ? y0 + 14 : ly + 4, row.label, "rl " + row.cls);
      out += C.text(narrow ? width - 10 : width - 14, narrow ? y0 + 14 : ly + 4, row.text, "rv", "end");
      out += C.line(l, cy, l + pw, cy, "axis");
      var done = row.runs.filter(function (q) { return !q.hollow; }).map(function (q) { return q.v; });
      var reveal = C.span(p, 0.0, 0.55);
      if (done.length > 1 && p > 0.7) out += C.line(X(Math.min.apply(null, done)), cy, X(Math.max.apply(null, done)), cy, "range " + row.cls);
      var placed = [];
      row.runs.slice().sort(function (a, b) { return a.v - b.v; }).forEach(function (q, di) {
        var t = C.ease(C.span(p, ri * 0.07 + di * 0.06, ri * 0.07 + di * 0.06 + 0.3));
        if (t <= 0) return;
        var x = X(q.v), off = 0;
        [0, -1, 1, -2, 2].some(function (k) {
          off = k * (rad * 1.7);
          return !placed.some(function (o) { return Math.abs(o[0] - x) < rad * 2.1 && Math.abs(o[1] - off) < rad * 1.7; });
        });
        placed.push([x, off]);
        out += "<circle cx=\"" + Math.round(x * 10) / 10 + "\" cy=\"" + Math.round((cy + off - (1 - t) * 18) * 10) / 10 + "\" r=\"" + rad +
          "\" class=\"dot " + row.cls + (q.hollow ? " hollow" : "") + "\" opacity=\"" + Math.round(t * 100) / 100 + "\"/>";
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

  /* One strip per run, one cell per PLAN item. rows: [{ label, cls, ticked, total, text }] */
  C.cells = function (rows, width, p) {
    var narrow = width < 600;
    var labelW = narrow ? 0 : 96, textW = narrow ? 0 : 150;
    var l = labelW, pw = width - l - textW - (narrow ? 0 : 6);
    var rowH = narrow ? 50 : 30;
    var cellH = narrow ? 14 : 16;
    var H = rows.length * rowH + 4;
    var out = "";
    rows.forEach(function (row, ri) {
      var y0 = ri * rowH + 2;
      var cy = narrow ? y0 + 22 : y0 + (rowH - cellH) / 2;
      out += C.text(0, narrow ? y0 + 13 : cy + cellH - 4, row.label, "rl " + row.cls);
      var gap = 2, cw = (pw - gap * (row.total - 1)) / row.total;
      var t = C.ease(C.span(p, ri * 0.06, ri * 0.06 + 0.5));
      var shown = Math.round(row.ticked * t);
      for (var c = 0; c < row.total; c++) {
        var cls = c < shown ? "cell on " + row.cls : c < row.ticked ? "cell " + row.cls : "cell open " + row.cls;
        out += C.rect(l + c * (cw + gap), cy, cw, cellH, cls, 1);
      }
      if (t >= 1) out += C.text(narrow ? width : width - 2, narrow ? y0 + 13 : cy + cellH - 4, row.text, "rv " + (row.ticked < row.total ? "stopped" : ""), "end");
    });
    return C.svg(width, H, out, "chart-svg cells-svg");
  };

  /* Paired cost bars on one shared scale. groups: [{ title, bars: [{ label, parts: [{ v, cls }], text }] }], max */
  C.bars = function (groups, max, width, p) {
    var narrow = width < 600;
    var l = narrow ? 0 : 0, tw = 78;
    var pw = width - l - tw - 4;
    var barH = narrow ? 18 : 22;
    var out = "", y = 4;
    groups.forEach(function (grp, gi) {
      out += C.text(0, y + 14, grp.title, "rl");
      y += 24;
      grp.bars.forEach(function (bar, bi) {
        out += C.text(0, y + 11, bar.label, "ax");
        y += 16;
        var t = C.ease(C.span(p, gi * 0.25 + bi * 0.15, gi * 0.25 + bi * 0.15 + 0.5));
        var x = l;
        bar.parts.forEach(function (part) {
          var w = (part.v / max) * pw * t;
          out += C.rect(x, y, w, barH, "bar " + part.cls, 2);
          x += w + (w > 0 ? 1 : 0);
        });
        if (t >= 1) out += C.text(x + 8, y + barH - 5, bar.text, "rv");
        y += barH + 10;
      });
      y += 8;
    });
    return C.svg(width, y, out, "chart-svg bars-svg");
  };
})(typeof window !== "undefined" ? window : globalThis);
