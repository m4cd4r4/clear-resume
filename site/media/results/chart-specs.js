/* The chart specs for each finding, built from crResults. The results page and the results video both call
   C.specs(crResults), so the two draw the same marks from the same data file. */
(function (g) {
  "use strict";
  var C = g.crCharts;
  var SHORT = { relay: "relay", autocompact: "compaction", long: "long session", trim: "trimmed rules", old: "old rules" };

  C.short = SHORT;
  C.usd = function (v) { return "US$" + v.toFixed(2); };

  C.specs = function (D) {
    var runs = D.runs, usd = C.usd;
    var tokM = function (v) { return v + "M"; };
    var MODELS = [["sonnet", D.groups, "Sonnet"], ["opus", D.opusGroups, "Opus"]];
    function ids(list) { return list.map(function (id) { return runs[id]; }); }
    function tip(r, what) {
      return C.armName(r.group) + ", run " + r.run + ", " + C.dateLabel(r.batch) + ", " + what + (r.finished ? "" : ", stopped at item " + r.planTicked);
    }
    /* one dot per run; a run that stopped is hollow. med: the tick (null for none), shown with its n */
    function dotRow(label, cls, list, key, med, fmt, tagged, what) {
      var finished = list.filter(function (r) { return r.finished; }).length;
      return {
        label: label, cls: cls,
        runs: list.map(function (r) {
          return { v: r[key], hollow: !r.finished, tag: !r.finished && tagged ? "stopped, item " + r.planTicked : "", title: tip(r, what(r)) };
        }),
        median: finished > 1 ? med : null,
        text: finished > 1 ? "median " + fmt(med) + ", n=" + finished : "n=" + list.length
      };
    }
    var tokWhat = function (r) { return r.tokensM + "M tokens"; };

    function idleSpec() {
      var I = D.idle, L = I.latest, E = I.earlier;
      var rowFor = function (kind, batch, med) {
        var list = (kind === "cold" ? I.cold : I.warm).filter(function (x) { return x.batch === batch; });
        var latest = batch === L.batch;
        var vals = list.map(function (x) { return kind === "cold" ? x.costUsd : x.totalUsd; });
        return {
          label: (kind === "cold" ? "cold return, " : "handover, ") + C.dateLabel(batch), cls: kind === "cold" ? "c-long" : "c-relay",
          runs: list.map(function (x, i) {
            return { v: vals[i], hollow: false, tag: "",
              title: (kind === "cold" ? "cold return after " + x.idleMin + " min idle, " : "handover then fresh read, ") + C.dateLabel(batch) + ", " + usd(vals[i]) };
          }),
          median: latest ? med : null,
          text: latest ? "median " + usd(med) + ", n=" + list.length : "n=" + list.length
        };
      };
      return {
        lo: 0, hi: 2, textW: 180, ticks: [0, 0.5, 1, 1.5, 2], tick: function (v) { return "US$" + v; },
        rows: [rowFor("cold", E.batch, null), rowFor("cold", L.batch, L.coldMedianUsd), rowFor("warm", E.batch, null), rowFor("warm", L.batch, L.warmMedianUsd)]
      };
    }
    function finishSpec() {
      var rows = [];
      MODELS.forEach(function (m) {
        ["relay", "autocompact"].forEach(function (k) {
          var list = ids(m[1][k].runs);
          rows.push({
            label: SHORT[k] + ", " + m[2], cls: C.armClass(k),
            runs: list.map(function (r) {
              return { v: r.planTicked, hollow: !r.finished, tag: !r.finished ? "stopped, item " + r.planTicked : "", title: tip(r, r.planTicked + " items") };
            }),
            median: null,
            text: m[1][k].finished + " of " + m[1][k].n + " finished"
          });
        });
      });
      return { lo: 0, hi: D.meta.planItems, ticks: [0, 10, 20, 30], tick: String, tall: true, rows: rows };
    }
    function tokenSpec() {
      var rows = [];
      MODELS.forEach(function (m) {
        var G = m[1];
        [["relay", "c-relay", true], ["autocompact", "c-auto", true], ["long", "c-long", false]].forEach(function (k) {
          rows.push(dotRow(SHORT[k[0]] + ", " + m[2], k[1], ids(G[k[0]].runs), "tokensM", G[k[0]].medianTokensM, tokM, k[2], tokWhat));
        });
      });
      return { lo: 0, hi: 90, ticks: [0, 15, 30, 45, 60, 75, 90], tick: tokM, rows: rows };
    }
    /* cost at today's list price, every date (the CLI priced Sonnet cache reads at 0.1x input before 10 Oct) */
    function costSpec(model) {
      var K = D.listCost[model];
      var rows = [["relay", "c-relay", true], ["autocompact", "c-auto", true], ["long", "c-long", false]].filter(function (k) { return K[k[0]].n > 0; }).map(function (k) {
        var row = dotRow(SHORT[k[0]] + ", " + (model === "opus" ? "Opus" : "Sonnet"), k[1], ids(K[k[0]].runs), "listUsd", K[k[0]].meanUsd, usd, k[2], function (r) { return usd(r.listUsd) + " at list price"; });
        if (row.median != null) row.text = "mean " + usd(K[k[0]].meanUsd) + ", n=" + K[k[0]].finished;
        return row;
      });
      return model === "sonnet"
        ? { lo: 0, hi: 12, ticks: [0, 3, 6, 9, 12], tick: function (v) { return "US$" + v; }, rows: rows }
        : { lo: 22, hi: 30, ticks: [22, 24, 26, 28, 30], tick: function (v) { return "US$" + v; }, rows: rows };
    }
    function predictSpec() {
      var fmts = { M: tokM, count: String, pct: function (v) { return v + "%"; }, usd: function (v) { return "US$" + v; } };
      return {
        rows: D.predictions.rows.map(function (q) {
          return {
            label: q.label, cls: q.cls, lo: q.lo, hi: q.hi, ticks: q.ticks, tick: fmts[q.unit], band: q.band,
            runs: q.measured.map(function (v) { return { v: v, title: q.label + ": " + fmts[q.unit](v) }; }),
            text: q.verdict + (q.n > 1 ? ", n=" + q.n : "")
          };
        })
      };
    }

    return {
      ids: ids,
      draw: {
        idle: function (w, p) { return C.dots(idleSpec(), w, p); },
        finish: function (w, p) { return C.dots(finishSpec(), w, p); },
        tokens: function (w, p) { return C.dots(tokenSpec(), w, p); },
        cost: function (w, p) { return C.dots(costSpec("sonnet"), w, p); },
        costOpus: function (w, p) { return C.dots(costSpec("opus"), w, p); },
        predict: function (w, p) { return C.predict(predictSpec(), w, p); }
      }
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
