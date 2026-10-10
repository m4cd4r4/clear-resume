/* Shared chart helpers. Every chart on the results page and in the results video is an SVG string built from
   crResults at a progress value p (0 to 1), so a page and a video frame at the same p show the same marks.
   Colours come only from CSS classes (results.css); this file holds no colour and no figure. */
(function (g) {
  "use strict";
  var C = (g.crCharts = g.crCharts || {});

  C.esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; });
  };
  C.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  C.ease = function (x) { x = C.clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };
  /* the part of p between a and b, as 0 to 1 */
  C.span = function (p, a, b) { return C.clamp((p - a) / (b - a), 0, 1); };
  C.r1 = function (v) { return Math.round(v * 10) / 10; };
  C.kTok = function (n) { return Math.round(n / 1000) + "k"; };
  C.get = function (data, path) {
    return String(path).split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, data);
  };
  /* how a data-res slot shows its value: data-fixed="n" gives n decimals, data-k="1" gives thousands */
  C.fmt = function (value, fixed, k) {
    if (typeof value !== "number") return String(value);
    if (k) return String(Math.round(value / 1000));
    if (fixed !== null && fixed !== undefined && fixed !== "") return value.toFixed(Number(fixed));
    return String(value);
  };

  C.svg = function (w, h, body, cls) {
    return "<svg class=\"" + (cls || "chart-svg") + "\" viewBox=\"0 0 " + w + " " + h + "\" width=\"" + w + "\" height=\"" + h +
      "\" aria-hidden=\"true\" focusable=\"false\">" + body + "</svg>";
  };
  var n1 = function (v) { return Math.round(v * 10) / 10; };
  C.line = function (x1, y1, x2, y2, cls) {
    return "<line x1=\"" + n1(x1) + "\" y1=\"" + n1(y1) + "\" x2=\"" + n1(x2) + "\" y2=\"" + n1(y2) + "\" class=\"" + cls + "\"/>";
  };
  C.rect = function (x, y, w, h, cls, rx) {
    return "<rect x=\"" + n1(x) + "\" y=\"" + n1(y) + "\" width=\"" + n1(Math.max(0, w)) + "\" height=\"" + n1(h) + "\" rx=\"" + (rx || 0) + "\" class=\"" + cls + "\"/>";
  };
  C.circle = function (x, y, r, cls) {
    return "<circle cx=\"" + n1(x) + "\" cy=\"" + n1(y) + "\" r=\"" + r + "\" class=\"" + cls + "\"/>";
  };
  C.text = function (x, y, str, cls, anchor) {
    return "<text x=\"" + n1(x) + "\" y=\"" + n1(y) + "\" class=\"" + cls + "\"" + (anchor ? " text-anchor=\"" + anchor + "\"" : "") + ">" + C.esc(str) + "</text>";
  };
  C.poly = function (pts, cls) {
    return "<polyline points=\"" + pts.map(function (q) { return n1(q[0]) + "," + n1(q[1]); }).join(" ") + "\" class=\"" + cls + "\"/>";
  };
  /* index of the last element of a sorted array that is at or below v (or -1) */
  C.upTo = function (arr, v) {
    var lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (arr[mid] <= v) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  };
  C.armClass = function (group) { return group === "relay" ? "c-relay" : group === "autocompact" ? "c-auto" : group === "long" ? "c-long" : "c-relay"; };
  C.armName = function (group) {
    return { relay: "relay", autocompact: "auto-compaction", long: "one long session", trim: "relay, trimmed rules", old: "relay, old rules" }[group] || group;
  };
  /* count-up and similar: the value shown at progress p */
  C.lerp = function (a, b, t) { return a + (b - a) * t; };
  if (typeof module !== "undefined" && module.exports) module.exports = C;
})(typeof window !== "undefined" ? window : globalThis);
