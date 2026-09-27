/*
 * clear-resume demo: the story both cuts tell.
 *
 * Every word on screen and every timing lives here, once. The two cuts,
 * demo/index.html (1920x1080) and demo/vertical/index.html (1080x1920), hold
 * only a canvas size and a stylesheet, then call ClearResumeStory.build().
 *
 * This file sits inside vertical/ because HyperFrames serves each project from
 * its own root and rejects any "../" path (lint rule
 * invalid_parent_traversal_in_asset_path). The vertical project is inside the
 * wide one, so this is the one folder both projects can reach: the wide cut
 * loads it as "vertical/story.js", the vertical cut as "story.js".
 */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------------
   * What the plugin prints. Captured on 2026-09-27 from plugin 0.1.6 by
   * running scripts/save.mjs and scripts/session-start.mjs against a sandbox
   * repo, then given this demo's invented names. The 7-hex id is invented
   * too: the real one is a hash of the record's file name.
   * ---------------------------------------------------------------------- */
  var PLUGIN = {
    saved: 'Saved handover "Cart totals rounding" (id 4f9c2e7).',
    next: "After /clear, the next session in ~/code/widget-shop loads it automatically.",
    loaded: 'clear-resume: loaded handover "Cart totals rounding" (saved just now).',
  };

  // The install: two commands, with the marketplace named by its HTTPS URL.
  var MARKETPLACE_URL = "https://github.com/m4cd4r4/clear-resume";
  var INSTALL_ADD = "claude plugin marketplace add";
  var INSTALL_PLUGIN = "claude plugin install clear-resume@clear-resume";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Tokens a cut that wraps must not break inside: paths, branch names, flags,
  // "3-for-2", and the "(id 4f9c2e7)" pair. A cut that never wraps sees plain text.
  var UNBREAKABLE = /\(id [0-9a-f]{7}\)\.?|[^\s"]*[-\/~][^\s"]*/g;
  function text(s) {
    var out = "";
    var last = 0;
    var m;
    UNBREAKABLE.lastIndex = 0;
    while ((m = UNBREAKABLE.exec(s))) {
      out += esc(s.slice(last, m.index)) + '<span class="nb">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  // A typed prompt is rewritten as plain text while it types, so it keeps no spans.
  function prompt(id, typedId, words, extra) {
    return (
      '<div class="line' + (extra ? " " + extra : "") + '" id="' + id + '">' +
      '<span class="glyph">&gt;</span> <span class="said"' + (typedId ? ' id="' + typedId + '"' : "") + ">" +
      (typedId ? esc(words) : text(words)) + "</span></div>"
    );
  }

  function tool(id, name, words, extra) {
    return (
      '<div class="line tool' + (extra ? " " + extra : "") + '"' + (id ? ' id="' + id + '"' : "") + ">" +
      "<b>" + name + "</b>" + text(words) + "</div>"
    );
  }

  function line(id, cls, words) {
    return '<div class="' + cls + '"' + (id ? ' id="' + id + '"' : "") + ">" + text(words) + "</div>";
  }

  function kv(id, key, value) {
    return '<div class="kv" id="' + id + '"><em>' + esc(key) + "</em><span>" + text(value) + "</span></div>";
  }

  /* ---- timing shared by the markup and the timeline ---- */
  var CUT = {
    p1: [0, 8.5],
    p2: [8.5, 12.4],
    p3: [20.9, 2.1],
    p4: [23, 9.7],
    close: [32.4, 3.6],
  };

  function clip(id, cls, span, track) {
    return (
      '<section class="' + cls + ' clip" id="' + id + '" data-start="' + span[0] +
      '" data-duration="' + span[1] + '" data-track-index="' + track + '">'
    );
  }

  function markup() {
    return [
      '<div id="glow"></div>',
      '<div id="rules"><i></i><i></i></div>',
      '<div class="ghost" id="ghost-1" data-layout-allow-overflow>WORK</div>',
      '<div class="ghost" id="ghost-2" data-layout-allow-overflow>HANDOVER</div>',
      '<div class="ghost" id="ghost-3" data-layout-allow-overflow>CLEAR</div>',
      '<div class="ghost" id="ghost-4" data-layout-allow-overflow>RESUME</div>',

      '<div id="window">',
      '<div id="titlebar">',
      '<div id="where"><div id="repo">widget-shop</div><div id="branch">feat/cart-totals</div></div>',
      '<div id="meter"><div id="meter-label">context</div>',
      '<div id="track"><div id="fill"></div></div><div id="readout">34%</div></div>',
      "</div>",
      '<div id="body">',

      // 01 work
      clip("p1", "phase", CUT.p1, 1),
      // Earlier turns, already on screen when the piece opens: a long session is
      // why the context meter starts at a third. A cut with a taller window
      // shows the "older" lines too; a shorter one hides them.
      '<div id="p1-scrollback">',
      prompt("p1-older", null, "add a cart page that lists the line items and a total", "older"),
      tool(null, "Write", "src/cart.js", "spaced older"),
      tool(null, "Edit", "src/routes.js", "older"),
      tool(null, "Bash", "npm test -- cart", "older"),
      line(null, "line note spaced", "All 22 cart tests pass."),
      prompt("p1-old", null, "now the discount rules, 3-for-2 and 10 per cent off", "spaced"),
      tool(null, "Read", "src/discounts.js", "spaced"),
      tool(null, "Edit", "src/discounts.js"),
      tool(null, "Bash", "npm test -- discounts"),
      line(null, "line note spaced", "Discounts land. Two rounding helpers now disagree."),
      "</div>",
      prompt("p1-ask", null, "the basket total is a cent out when the 3-for-2 offer applies"),
      tool("p1-t1", "Read", "src/cart.js", "spaced"),
      tool("p1-t2", "Read", "src/money.js"),
      tool("p1-t3", "Edit", "src/money.js"),
      tool("p1-t4", "Bash", "npm test -- totals"),
      line("p1-r1", "line note spaced", "Rounding at the line rather than at the total."),
      line("p1-r2", "line note", "14 of 15 tests pass. The 3-for-2 case is still a cent out."),
      "</section>",

      // 02 handover, and the /clear that ends it. The brief is the README's
      // example, in the order skills/handover/SKILL.md specifies.
      clip("p2", "phase", CUT.p2, 1),
      prompt("p2-cmd", "p2-typed", "/clear-resume:handover"),
      '<div id="brief">',
      line("b1", "brief-line h1", "Cart totals rounding"),
      line("b2", "brief-line h2 gap", "Goal"),
      line("b3", "brief-line bd", "Make the basket total match the line items when a discount is applied."),
      line("b4", "brief-line h2 gap", "Next action"),
      line("b5", "brief-line bd", "Run npm test -- totals and fix the failing case for a 3-for-2 offer."),
      line("b6", "brief-line h2 gap", "State"),
      line("b7", "brief-line bd", "Branch feat/cart-totals, last commit a1b2c3d, no PR yet."),
      line("b8", "brief-line bd", "Rounding helper written in src/money.js, unit tests pass."),
      line("b9", "brief-line h2 gap", "Decisions already made"),
      line("b10", "brief-line bd", "Round at the line, not at the total."),
      tool("b11", "Bash", 'node save.mjs --title "Cart totals rounding"', "brief-line"),
      line("b12", "brief-line line voice", PLUGIN.saved),
      line("b13", "brief-line line voice", PLUGIN.next),
      "</div>",
      prompt("p2-clear", "p2-cleartyped", "/clear"),
      "</section>",

      // 03 clear: the emptied window
      clip("p3", "phase", CUT.p3, 1),
      '<div class="line" id="p3-fresh"><span class="glyph">&gt;</span> <span class="caret" id="p3-caret"></span></div>',
      "</section>",

      // 04 resume: the hook's line, then the user asks, then Claude answers
      clip("p4", "phase", CUT.p4, 1),
      '<div id="chip"><i></i><span>' + text(PLUGIN.loaded) + "</span></div>",
      prompt("p4-ask", "p4-typed", "carry on"),
      '<div id="restored">',
      kv("r1", "handover", "Cart totals rounding"),
      kv("r2", "next action", "Run npm test -- totals and fix the 3-for-2 case."),
      kv("r3", "state", "feat/cart-totals at a1b2c3d, src/money.js done, no PR."),
      "</div>",
      tool("r4", "Bash", "npm test -- totals"),
      line("r5", "line note", "The 3-for-2 case passes. 15 of 15."),
      "</section>",

      "</div>", // #body
      "</div>", // #window

      '<div class="beat" id="beat-1"><i>01</i><u>WORK</u></div>',
      '<div class="beat" id="beat-2"><i>02</i><u>HANDOVER</u></div>',
      '<div class="beat" id="beat-3"><i>03</i><u>CLEAR</u></div>',
      '<div class="beat" id="beat-4"><i>04</i><u>RESUME</u></div>',

      // 05 close. Where a cut is too narrow for the first command, its
      // stylesheet shows the continuation mark and drops the URL to its own
      // line, so it still reads as two commands.
      clip("close", "close", CUT.close, 2),
      '<div id="close-name">clear-resume</div>',
      '<div id="close-line">Write a handover, clear the session, carry on in a fresh context.</div>',
      '<div id="close-cmd">',
      '<div class="cmd">' + esc(INSTALL_ADD) + '<span class="cont"> \\</span> <span class="arg">' + esc(MARKETPLACE_URL) + "</span></div>",
      '<div class="cmd">' + esc(INSTALL_PLUGIN) + "</div>",
      "</div>",
      "</section>",

      '<div id="grain"></div>',
    ].join("");
  }

  /* ------------------------------------------------------------------------
   * Build the DOM into the root and return its one paused timeline.
   * ---------------------------------------------------------------------- */
  function build(root) {
    root.insertAdjacentHTML("afterbegin", markup());

    var F = 1 / 30;
    var DURATION = Number(root.getAttribute("data-duration"));
    var tl = gsap.timeline({ paused: true });

    /* --------------------------------------------------------------------
     * Typing: the typed-prompt law, taken from the registry component
     * code-terminal-run. One chars-at-time row table is built synchronously
     * before the timeline registers; the timeline only ever reads it, so a
     * given time renders the same string whichever direction it was seeked
     * from. The caret blinks on integer sine cycles across exactly the typing
     * window, then pins solid and hides when the line is submitted.
     * ------------------------------------------------------------------ */
    var lcg = 0x51ec0ded;
    function rnd() {
      lcg = (Math.imul(1664525, lcg) + 1013904223) >>> 0;
      return lcg / 4294967296;
    }

    function typeInto(element, startAt, speed) {
      var full = element.textContent;
      element.textContent = "";

      var caret = document.createElement("span");
      caret.className = "caret";
      caret.setAttribute("aria-hidden", "true");
      element.parentNode.appendChild(caret);

      var rows = [{ t: 0, n: 0 }];
      var t = startAt;
      var n = 0;
      var i = 0;
      while (i < full.length) {
        var chunk = full.slice(i, i + 1 + Math.floor(rnd() * 3));
        t += chunk.length * speed * (0.72 + rnd() * 0.6);
        n += chunk.length;
        rows.push({ t: t, n: n });
        i += chunk.length;
      }
      var endAt = rows[rows.length - 1].t;

      function charsAt(time) {
        for (var k = rows.length - 1; k >= 0; k -= 1) {
          if (time >= rows[k].t - 0.001) return rows[k].n;
        }
        return 0;
      }

      var driver = { t: 0 };
      tl.to(
        driver,
        {
          t: endAt,
          duration: endAt,
          ease: "none",
          onUpdate: function () {
            element.textContent = full.slice(0, charsAt(driver.t));
          },
        },
        0,
      );

      var span = Math.max(0.3, endAt - startAt);
      var blink = { p: 0 };
      tl.to(
        blink,
        {
          p: Math.PI * 2 * Math.max(1, Math.round(span / 0.62)),
          duration: span,
          ease: "none",
          onUpdate: function () {
            caret.style.opacity = Math.sin(blink.p) >= 0 ? "1" : "0";
          },
        },
        startAt,
      );
      tl.set(caret, { opacity: 1 }, endAt);
      tl.set(caret, { opacity: 0 }, endAt + 0.26);

      return endAt + 0.26;
    }

    /* ---- a printed terminal line: it arrives, it never fades in ---- */
    function print(selector, at) {
      tl.set(selector, { opacity: 1, y: 10 }, at);
      tl.to(selector, { y: 0, duration: 0.14, ease: "power4.out" }, at);
    }

    /* --------------------------------------------------------------------
     * The context meter. One ease:none driver over the whole piece, and the
     * value is a pure function of time read from a baked schedule, so it is
     * identical whichever way the renderer seeks to a frame.
     * ------------------------------------------------------------------ */
    var fill = document.getElementById("fill");
    var readout = document.getElementById("readout");
    var SEGMENTS = [
      { t0: 0.9, t1: 4.0, v0: 0.34, v1: 0.52, ease: "linear" },
      { t0: 4.2, t1: 7.6, v0: 0.52, v1: 0.78, ease: "linear" },
      { t0: 8.8, t1: 13.0, v0: 0.78, v1: 0.86, ease: "linear" },
      { t0: 19.88, t1: 20.68, v0: 0.86, v1: 0.04, ease: "out3" },
      { t0: 23.35, t1: 24.95, v0: 0.04, v1: 0.11, ease: "out2" },
      { t0: 27.6, t1: 29.4, v0: 0.11, v1: 0.19, ease: "linear" },
    ];
    function shape(p, ease) {
      if (ease === "out3") return 1 - Math.pow(1 - p, 3);
      if (ease === "out2") return 1 - Math.pow(1 - p, 2);
      return p;
    }
    function meterAt(time) {
      var value = SEGMENTS[0].v0;
      for (var k = 0; k < SEGMENTS.length; k += 1) {
        var s = SEGMENTS[k];
        if (time >= s.t1) {
          value = s.v1;
        } else if (time > s.t0) {
          return s.v0 + (s.v1 - s.v0) * shape((time - s.t0) / (s.t1 - s.t0), s.ease);
        } else {
          return value;
        }
      }
      return value;
    }
    var lastPercent = null;
    function paintMeter(time) {
      var v = meterAt(time);
      fill.style.transform = "scaleX(" + v.toFixed(4) + ")";
      fill.style.backgroundColor = v > 0.7 ? "#c07c2a" : "#e5a743";
      var percent = Math.round(v * 100);
      if (percent !== lastPercent) {
        readout.textContent = percent + "%";
        lastPercent = percent;
      }
    }
    paintMeter(0);

    var clock = { t: 0 };
    tl.to(
      clock,
      {
        t: DURATION,
        duration: DURATION,
        ease: "none",
        onUpdate: function () {
          paintMeter(clock.t);
        },
      },
      0,
    );

    /* ---- ambient decoratives: finite repeats, slow, never static ---- */
    tl.fromTo(
      "#glow",
      { scale: 0.95, opacity: 0.72 },
      { scale: 1.05, opacity: 1, duration: 3.6, ease: "sine.inOut", yoyo: true, repeat: 9 },
      0,
    );
    tl.fromTo(
      "#rules",
      { opacity: 0.55 },
      {
        opacity: 1,
        duration: 4.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: Math.max(0, Math.floor(DURATION / 9) * 2 - 1),
      },
      0,
    );

    /* ---- ghost word and beat marker, one pair per phase ---- */
    var closeAt = CUT.close[0];
    var recedeAt = closeAt - 0.4;
    var PHASES = [
      { ghost: "#ghost-1", beat: "#beat-1", at: 0, until: 8.5 },
      { ghost: "#ghost-2", beat: "#beat-2", at: 8.5, until: 19.6 },
      { ghost: "#ghost-3", beat: "#beat-3", at: 19.6, until: 23 },
      { ghost: "#ghost-4", beat: "#beat-4", at: 23, until: recedeAt - 0.1 },
    ];
    PHASES.forEach(function (phase) {
      tl.fromTo(phase.ghost, { opacity: 0, y: 26 }, { opacity: 0.06, y: 0, duration: 0.7, ease: "power2.out" }, phase.at);
      tl.fromTo(
        phase.ghost,
        { y: 0 },
        { y: -22, duration: phase.until - phase.at - 1.1, ease: "sine.inOut", immediateRender: false },
        phase.at + 0.7,
      );
      tl.fromTo(
        phase.ghost,
        { opacity: 0.06 },
        { opacity: 0, duration: 0.4, ease: "power2.in", immediateRender: false },
        phase.until - 0.4,
      );

      tl.set(phase.beat, { opacity: 1, y: 14 }, phase.at + 0.15);
      tl.to(phase.beat, { y: 0, duration: 0.18, ease: "power4.out" }, phase.at + 0.15);
      tl.to(phase.beat, { opacity: 0, duration: 0.3, ease: "power2.in" }, phase.until - 0.34);
    });

    /* ==================================================================
     * 01 WORK - 0.0 to 8.5
     * ================================================================ */
    print("#p1-ask", 0.9);
    print("#p1-t1", 1.9);
    print("#p1-t2", 2.5);
    print("#p1-t3", 3.3);
    print("#p1-t4", 4.2);
    print("#p1-r1", 5.4);
    print("#p1-r2", 6.2);

    /* ==================================================================
     * 02 HANDOVER - 8.5 to 20.9, ending in the /clear
     * ================================================================ */
    tl.set("#p2-cmd", { opacity: 1 }, 8.7);
    var handoverTyped = typeInto(document.getElementById("p2-typed"), 8.8, 0.055);

    // The brief arrives as a cascade: the title travels furthest, the gaps
    // shrink across the wave, and every reveal is binary rather than a fade.
    var BRIEF = [
      { id: "#b1", y: 74, d: 0.2, gap: 2 },
      { id: "#b2", y: 46, d: 0.15, gap: 1 },
      { id: "#b3", y: 44, d: 0.15, gap: -1 },
      { id: "#b4", y: 46, d: 0.15, gap: 1 },
      { id: "#b5", y: 44, d: 0.15, gap: -1 },
      { id: "#b6", y: 46, d: 0.14, gap: 1 },
      { id: "#b7", y: 42, d: 0.14, gap: -1 },
      { id: "#b8", y: 42, d: 0.13, gap: -1 },
      { id: "#b9", y: 46, d: 0.13, gap: -1 },
      { id: "#b10", y: 42, d: 0.12, gap: -2 },
    ];
    var cursor = handoverTyped + 0.18;
    BRIEF.forEach(function (row) {
      tl.set(row.id, { opacity: 1, y: row.y }, cursor);
      tl.to(row.id, { y: 0, duration: row.d, ease: "power4.out" }, cursor);
      cursor = cursor + row.d + row.gap * F;
    });
    // Claude saves it, and the save script answers in the plugin's voice.
    print("#b11", cursor + 0.45);
    print("#b12", cursor + 1.05);
    print("#b13", cursor + 1.35);

    // The /clear that ends the session belongs to this phase: the brief is
    // still on screen while it is typed, so the emptying is visible.
    tl.set("#p2-clear", { opacity: 1 }, 19.1);
    var clearTyped = typeInto(document.getElementById("p2-cleartyped"), 19.2, 0.07);

    /* ==================================================================
     * 03 CLEAR - the session leaves as one group, the meter follows
     * ================================================================ */
    tl.fromTo(
      ["#brief", "#p2-cmd", "#p2-clear"],
      { y: 0 },
      { y: -74, duration: 0.46, ease: "power3.in", immediateRender: false },
      clearTyped,
    );
    tl.fromTo(
      ["#brief", "#p2-cmd", "#p2-clear"],
      { opacity: 1 },
      { opacity: 0, duration: 0.46, ease: "power3.in", immediateRender: false },
      clearTyped,
    );

    // The emptied window: one fresh prompt, one blinking caret, holding.
    tl.set("#p3-fresh", { opacity: 1 }, 20.95);
    var freshSpan = 23 - 20.95;
    var freshBlink = { p: 0 };
    var freshCaret = document.getElementById("p3-caret");
    tl.to(
      freshBlink,
      {
        p: Math.PI * 2 * Math.max(1, Math.round(freshSpan / 0.62)),
        duration: freshSpan,
        ease: "none",
        onUpdate: function () {
          freshCaret.style.opacity = Math.sin(freshBlink.p) >= 0 ? "1" : "0";
        },
      },
      20.95,
    );

    /* ==================================================================
     * 04 RESUME - 23.0 to the close
     * The hook's line is there before anyone types. Claude says nothing
     * until the user asks; then it answers from the handover and runs the
     * next action.
     * ================================================================ */
    tl.fromTo("#chip", { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: 0.42, ease: "back.out(2)" }, 23.35);

    tl.set("#p4-ask", { opacity: 1 }, 24.3);
    var carryTyped = typeInto(document.getElementById("p4-typed"), 24.4, 0.075);
    print("#r1", carryTyped + 0.5);
    print("#r2", carryTyped + 1.1);
    print("#r3", carryTyped + 1.7);
    print("#r4", 27.6);
    print("#r5", 28.9);

    /* ==================================================================
     * 05 CLOSE
     * ================================================================ */
    tl.fromTo(
      "#window",
      { scale: 1, opacity: 1 },
      { scale: 0.93, opacity: 0, duration: 0.6, ease: "power3.inOut", immediateRender: false },
      recedeAt,
    );
    tl.set("#close-name", { opacity: 1, y: 78 }, closeAt + 0.15);
    tl.to("#close-name", { y: 0, duration: 0.2, ease: "power4.out" }, closeAt + 0.15);
    tl.set("#close-line", { opacity: 1, y: 46 }, closeAt + 0.38);
    tl.to("#close-line", { y: 0, duration: 0.16, ease: "power4.out" }, closeAt + 0.38);
    tl.set("#close-cmd", { opacity: 1, y: 40 }, closeAt + 0.57);
    tl.to("#close-cmd", { y: 0, duration: 0.15, ease: "power4.out" }, closeAt + 0.57);

    tl.seek(0);
    return tl;
  }

  global.ClearResumeStory = { build: build };
})(window);
