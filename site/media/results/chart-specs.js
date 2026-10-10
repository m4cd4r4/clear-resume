/* The chart specs for each finding, built from crResults. The results page and the results video both call
   C.specs(crResults), so the two draw the same marks from the same data file. */
(function (g) {
  "use strict";
  var C = g.crCharts;
  var SHORT = { relay: "relay", autocompact: "compaction", long: "long session", trim: "trimmed rules", old: "old rules" };

  C.short = SHORT;
  C.usd = function (v) { return "US$" + v.toFixed(2); };

  C.specs = function (D) {
    var runs = D.runs, G = D.groups, usd = C.usd;
    var tokM = function (v) { return v + "M"; };
    function groupRuns(k) { return G[k].runs.map(function (id) { return runs[id]; }); }

    function finishRows() {
      var rows = [];
      ["relay", "autocompact"].forEach(function (k) {
        groupRuns(k).forEach(function (r) {
          rows.push({
            label: SHORT[k] + " " + r.run, cls: C.armClass(k), ticked: r.planTicked, total: r.planTotal,
            text: r.planTicked + " of " + r.planTotal + (r.finished ? "" : ", stopped")
          });
        });
      });
      return rows;
    }
    function dotRow(label, cls, list, key, med, fmt, tagged) {
      var finished = list.filter(function (r) { return r.finished; }).length;
      return {
        label: label, cls: cls,
        runs: list.map(function (r) {
          return { v: r[key], hollow: !r.finished, tag: !r.finished && tagged ? "stopped, item " + r.planTicked : "" };
        }),
        median: finished > 1 ? med : null,
        text: finished > 1 ? "median " + fmt(med) + ", n=" + finished : "n=" + list.length
      };
    }
    function tokenSpec() {
      return {
        lo: 0, hi: 60, ticks: [0, 10, 20, 30, 40, 50, 60], tick: tokM,
        rows: [
          dotRow(SHORT.relay, "c-relay", groupRuns("relay"), "tokensM", G.relay.medianTokensM, tokM, true),
          dotRow(SHORT.autocompact, "c-auto", groupRuns("autocompact"), "tokensM", G.autocompact.medianTokensM, tokM, true),
          dotRow(SHORT.long, "c-long", groupRuns("long"), "tokensM", null, tokM, false)
        ]
      };
    }
    function costSpec() {
      return {
        lo: 0, hi: 20, ticks: [0, 5, 10, 15, 20], tick: function (v) { return "US$" + v; },
        rows: [
          dotRow(SHORT.relay, "c-relay", groupRuns("relay"), "costUsd", G.relay.medianCostUsd, usd, true),
          dotRow(SHORT.autocompact, "c-auto", groupRuns("autocompact"), "costUsd", G.autocompact.medianCostUsd, usd, true),
          dotRow(SHORT.long, "c-long", groupRuns("long"), "costUsd", null, usd, false)
        ]
      };
    }
    function floorSpec() {
      var rows = [["relay", "empty config"], ["trim", "trimmed rules"], ["old", "old rules"]].map(function (k) {
        var f = D.floor[k[0]];
        var list = f.runs.map(function (id) { return runs[id]; });
        var row = dotRow(k[1] + " " + f.floorK + "k", k[0] === "relay" ? "c-relay" : "c-long", list, "tokensM", f.medianTokensM, tokM, false);
        if (f.prediction) row.rings = [{ v: f.prediction.predictedTokensM, label: "predicted " + f.prediction.predictedTokensM + "M" }];
        return row;
      });
      return { lo: 30, hi: 60, ticks: [30, 40, 50, 60], tick: tokM, rows: rows };
    }
    function idleGroups() {
      var I = D.idle, M = D.modelSwitch;
      var k = function (v) { return Math.round(v / 1000) + "k"; };
      return [
        { title: I.model + ", " + k(I.contextTokens) + " context, n=" + I.n, bars: [
          { label: "cold return after " + I.coldReturn.idleMin + " min idle", parts: [{ v: I.coldReturn.costUsd, cls: "c-long" }], text: usd(I.coldReturn.costUsd) },
          { label: "handover before the cache expires", parts: [{ v: I.warmHandover.totalUsd, cls: "c-relay" }], text: usd(I.warmHandover.totalUsd) }
        ] },
        { title: M.model + ", model switch at " + k(M.contextTokens) + ", n=" + M.n, bars: [
          { label: "switch model in the same session", parts: [{ v: M.coldReturn.costUsd, cls: "c-long" }], text: usd(M.coldReturn.costUsd) },
          { label: "handover, then switch", parts: [{ v: M.warmHandover.totalUsd, cls: "c-relay" }], text: usd(M.warmHandover.totalUsd) }
        ] }
      ];
    }

    return {
      groupRuns: groupRuns,
      draw: {
        finish: function (w, p) { return C.cells(finishRows(), w, p); },
        tokens: function (w, p) { return C.dots(tokenSpec(), w, p); },
        cost: function (w, p) { return C.dots(costSpec(), w, p); },
        floor: function (w, p) { return C.dots(floorSpec(), w, p); },
        idle: function (w, p) { return C.bars(idleGroups(), D.modelSwitch.coldReturn.costUsd, w, p); }
      }
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
