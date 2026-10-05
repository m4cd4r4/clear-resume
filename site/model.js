/* clear-resume cost model. A model, not a measurement. No DOM access, so node can load it (site/simtest.mjs). */
var crModel = (function () {
  var STEP = 5000;
  var HANDOVER = 780;
  var SUMMARY = 8000;
  var COMPACT_AT = 0.9;

  function compactAt(window) {
    return Math.round(window * COMPACT_AT);
  }

  function walk(start, work, limit, floor) {
    if (limit < floor + STEP) {
      throw new Error('limit ' + limit + ' is below floor ' + floor + ' plus one step (' + STEP + ')');
    }
    var ctx = start, done = 0, resets = 0, reread = 0, replies = 0, peak = start;
    var pts = [[0, start]];
    while (done < work) {
      var add = Math.min(STEP, work - done);
      if (ctx + add > limit) {
        resets++;
        ctx = floor;
        pts.push([done, floor]);
      }
      ctx += add;
      done += add;
      reread += ctx;
      replies++;
      if (ctx > peak) peak = ctx;
      pts.push([done, ctx]);
    }
    return { resets: resets, peak: peak, reread: reread, replies: replies, pts: pts, limit: limit };
  }

  function run(opts) {
    return {
      clear: walk(opts.start, opts.work, opts.clearAt, opts.start + HANDOVER),
      base: walk(opts.start, opts.work, compactAt(opts.window), opts.start + SUMMARY)
    };
  }

  return { STEP: STEP, HANDOVER: HANDOVER, SUMMARY: SUMMARY, COMPACT_AT: COMPACT_AT, compactAt: compactAt, run: run };
})();
