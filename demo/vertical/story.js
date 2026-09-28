/*
 * clear-resume explainer (v3): the story both cuts tell.
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
 *
 * Two kinds of words, kept apart on purpose:
 *   CAPTURED  what the plugin and its hooks really print, copied verbatim from
 *             D:/Scratch/cr-video3-sandbox/captured-text.md (plugin 0.1.6,
 *             feat/loaded-handover @ 20d987c). A long body may be shortened by
 *             leaving lines out; a printed line is never reworded.
 *   AUTHORED  the user's prompts and Claude's replies (always labelled "you" or
 *             "Claude" on screen), and the side cards.
 */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------------
   * CAPTURED text. The short id 31c9af7, the copy's file name and the age
   * words vary per run; these are the values from the capture run.
   * ---------------------------------------------------------------------- */
  var CAP = {
    saveCmd: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/save.mjs" --title "Cart totals rounding"',
    body: [
      ["h1", "# Cart totals rounding"],
      ["h2", "## Goal"],
      ["bd", "Cart totals must round to the cent the way the payment provider does, so the checkout total and the receipt always match."],
      ["h2", "## Next action"],
      ["bd", "Run `npm test -- cart` and fix `src/cart.js:2` so `cartTotal` rounds once at the end, half-up, to 2 decimal places."],
      ["h2", "## Decisions already made"],
      ["bd", "- Round once, at the total, never per line: the payment provider does the same."],
    ],
    saved: 'Saved handover "Cart totals rounding" (id 31c9af7).',
    next: "After /clear, the next session in ~/code/widget-shop loads it automatically.",
    loaded: 'SessionStart:clear says: clear-resume: loaded handover "Cart totals rounding" (saved just now).',
    copy: "A copy to read or share: ~/.clear-resume/loaded/widget-shop-cart-totals-rounding-31c9af7.md",
    waiting: 'SessionStart:startup says: clear-resume: 1 handover waiting for this repo: "Cart totals rounding". Say which to resume.',
    nudge: "Stop says: clear-resume: context is about 182k tokens (nudge at 180k). Claude is asked to save a handover, then you can type /clear.",
    viewHeader: "CLEAR-RESUME: HANDOVERS",
    groupLoaded: "Loaded",
    rowTitle: "Cart totals rounding",
    rowAge: "loaded 3h ago",
    status: "Handover: Cart totals rounding (loaded 3h ago)",
    copyName: "widget-shop-cart-totals-rounding-31c9af7.md",
    copyBody: [
      ["h1", "# Cart totals rounding"],
      ["bd", "- Repo: widget-shop"],
      ["bd", "- Branch: fix/cart-rounding"],
      ["bd", "- Saved: 2026-09-28 13:58 (UTC+08:00)"],
      ["bd", "- Loaded: 2026-09-28 13:59 (UTC+08:00)"],
      ["mu", "---"],
      ["h2", "## Goal"],
      ["bd", "Cart totals must round to the cent the way the payment provider does, so the checkout total and the receipt always match."],
      ["h2", "## Next action"],
      ["bd", "Run `npm test -- cart` and fix `src/cart.js:2` so `cartTotal` rounds once at the end, half-up, to 2 decimal places."],
    ],
    installAdd: "claude plugin marketplace add",
    installUrl: "https://github.com/m4cd4r4/clear-resume",
    installPlugin: "claude plugin install clear-resume@clear-resume",
  };

  /* ------------------------------------------------------------------------
   * The side cards. One plain claim each, at most about twelve words.
   * The paraphrase of each is in demo/STORYBOARD.md.
   * ---------------------------------------------------------------------- */
  var CARDS = {
    c1a: "<b>Context</b>: everything Claude is holding in mind for this chat.",
    c1b: "Each reply rereads all of it, so long chats get slow.",
    c1c: "Long chats also cost more, and Claude starts losing track.",
    c2a: "<code>/compact</code>: Claude summarises itself. You do not choose what stays.",
    c2b: "<code>/clear</code>: a fresh start. Like a new shift with no note.",
    c3a: "A third way: a short handover note, written on purpose.",
    c3b: "Like a nurse's shift note, so the next shift can carry on.",
    c3c: "It holds the goal, the next step and the decisions made.",
    c4a: "Type <code>/clear</code>. The fresh session loads the note by itself.",
    c4b: "Then type <code>go</code>. The next shift reads the note and carries on.",
    c4c: "It also saves a readable copy and prints where it is.",
    c6a: "Each note belongs to the window that wrote it.",
    c6b: "Other open windows see it waiting. They do not load it.",
    c7a: "Hours later, the sidebar shows what this window loaded.",
    c7b: "Click the status bar line to reopen the note.",
    c8a: "Auto mode is off unless you turn it on.",
    c8b: "When on, it offers a handover past a size you choose.",
  };

  var STATS = {
    token: "Token: a small piece of text, roughly a word.",
    s1: ["197,536", "tokens in the chat before each /clear"],
    s2: ["102,088", "tokens freed by each /clear"],
    s3: ["780", "tokens in the handover note (an estimate)"],
    share: "The note is about 0.4% of the chat it replaces.",
    source: "Measured on the author's own 104 /clears, 20 to 28 Sep 2026, medians.",
  };

  var CLOSE = {
    headline: "Clear often, lose nothing.",
    line: "clear-resume: a free, open-source plugin for Claude Code.",
    foot: "Made by an independent developer. Not an Anthropic product.",
  };

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Tokens a wrapping line must not break inside: paths, branch names, flags,
  // "(id 31c9af7)". A token too long for a phone-width line may break after a
  // slash, and nowhere else.
  var UNBREAKABLE = /\(id [0-9a-f]{7}\)\.?|[^\s"`]*[-\/~:][^\s"`]*/g;
  function nb(tok) {
    if (tok.length <= 34 || tok.indexOf("/") < 0) return '<span class="nb">' + esc(tok) + "</span>";
    return tok
      .split(/(?<=\/)/)
      .map(function (part) {
        return '<span class="nb">' + esc(part) + "</span>";
      })
      .join("<wbr>");
  }
  function text(s) {
    var out = "";
    var last = 0;
    var m;
    UNBREAKABLE.lastIndex = 0;
    while ((m = UNBREAKABLE.exec(s))) {
      if (!m[0]) {
        UNBREAKABLE.lastIndex += 1;
        continue;
      }
      out += esc(s.slice(last, m.index)) + nb(m[0]);
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  /* ---- terminal rows. A row is hidden (display:none) until printed, so a
   * new row pushes the older ones up, the way a terminal scrolls. Rows marked
   * "pre" are already on screen when their phase starts. ---- */
  function row(id, who, cls, html, pre) {
    var whoCls = who === "you" ? "who you" : who ? "who claude" : "who";
    return (
      '<div class="row' + (pre ? " pre" : "") + '"' + (id ? ' id="' + id + '"' : "") + ">" +
      '<div class="line ' + (cls || "") + '"><span class="' + whoCls + '">' + esc(who || "") + "</span>" +
      '<span class="txt">' + html + "</span></div></div>"
    );
  }
  function ask(id, words, pre) {
    return row(id, "you", "ask", '<span class="glyph">&gt;</span> <span class="said">' + text(words) + "</span>", pre);
  }
  function typed(id, typedId) {
    return row(id, "you", "ask", '<span class="glyph">&gt;</span> <span class="said" id="' + typedId + '"></span>');
  }
  function tool(id, who, name, words, pre) {
    return row(id, who, "tool", "<b>" + name + "</b>" + text(words), pre);
  }
  function said(id, who, words, pre) {
    return row(id, who, "reply", text(words), pre);
  }
  function out(id, words, cont, pre) {
    return row(id, "", "out voice", (cont ? "&nbsp;&nbsp;" : "&#9151;&nbsp;") + text(words), pre);
  }
  function md(id, kind, words) {
    return row(id, "", "md md-" + kind, text(words));
  }
  function card(id, cls) {
    return '<div class="card' + (cls ? " " + cls : "") + '" id="' + id + '"><p>' + CARDS[id] + "</p></div>";
  }

  /* ---- timing shared by the markup and the timeline ---- */
  var CUT = {
    p1: [0, 17],
    p3: [17, 13.3],
    p4: [30.3, 11.3],
    p6: [50.2, 6.5],
    p8: [62.8, 6.0],
    close: [68.5, 6.5],
  };

  function clip(id, cls, span, track) {
    return (
      '<section class="' + cls + ' clip" id="' + id + '" data-start="' + span[0] +
      '" data-duration="' + span[1] + '" data-track-index="' + track + '">'
    );
  }

  var BEATS = [
    { n: "01", word: "THE PROBLEM", ghost: "CONTEXT", at: 0, until: 9.5 },
    { n: "02", word: "TWO OLD WAYS", ghost: "CHOICES", at: 9.5, until: 17 },
    { n: "03", word: "THE NOTE", ghost: "NOTE", at: 17, until: 30.2 },
    { n: "04", word: "CLEAR, THEN GO", ghost: "RESUME", at: 30.3, until: 41.2 },
    { n: "05", word: "THE NUMBERS", ghost: "NUMBERS", at: 41.5, until: 50.2 },
    { n: "06", word: "MANY WINDOWS", ghost: "WINDOWS", at: 50.3, until: 56.4 },
    { n: "07", word: "THE SIDEBAR", ghost: "SIDEBAR", at: 56.6, until: 62.8 },
    { n: "08", word: "AUTO MODE", ghost: "AUTO", at: 63, until: 68.2 },
  ];

  function markup() {
    var html = [
      '<div id="glow"></div>',
      '<div id="rules"><i></i><i></i></div>',
    ];
    BEATS.forEach(function (b, i) {
      html.push('<div class="ghost" id="ghost-' + (i + 1) + '" data-layout-allow-overflow data-layout-allow-overlap>' + b.ghost + "</div>");
    });

    html.push(
      '<div id="window">',
      '<div id="titlebar">',
      '<div id="where"><div id="repo">widget-shop</div><div id="branch">fix/cart-rounding</div>' +
        '<div id="wtag">window 1</div></div>',
      '<div id="meter"><div id="meter-label">context</div>',
      '<div id="track"><div id="fill"></div></div></div>',
      "</div>",
      '<div id="body">',

      // 01 the problem, 02 the two old ways: one long session
      clip("p1", "phase scroll", CUT.p1, 1),
      ask(null, "start a widget-shop cart: items, quantities, prices", true),
      tool(null, "Claude", "Write", "src/items.js", true),
      said(null, "", "Items, quantities and prices are in place.", true),
      ask(null, "add a cart page that lists the line items and a total", true),
      tool(null, "Claude", "Write", "src/cart.js", true),
      tool(null, "", "Bash", "npm test -- cart", true),
      said(null, "", "The cart page lists each line and a total.", true),
      ask(null, "now print the same total on the receipt", true),
      tool(null, "Claude", "Edit", "src/receipt.js", true),
      said(null, "", "The receipt now prints the cart total.", true),
      ask("p1-ask", "the receipt total is a cent less than the cart total"),
      tool("p1-c1", "Claude", "Read", "src/cart.js"),
      tool("p1-c2", "", "Read", "src/receipt.js"),
      tool("p1-c3", "", "Read", "test/cart.test.js"),
      tool("p1-c4", "", "Bash", "npm test -- cart"),
      said("p1-c5", "", "Reproduced: 3 items at $19.99 total 59.97 in the cart but 59.96 on the receipt."),
      typed("p1-type", "p1-typed"),
      "</section>",

      // 03 the note: the handover skill saves it
      clip("p3", "phase scroll", CUT.p3, 1),
      '<div id="p3-stack">',
      typed("p3-ask", "p3-typed"),
      tool("p3-t", "Claude", "Bash", CAP.saveCmd + " <<'EOF'")
    );
    CAP.body.forEach(function (b, i) {
      html.push(md("p3-b" + i, b[0], b[1]));
    });
    html.push(
      md("p3-eof", "mu", "EOF"),
      out("p3-o1", CAP.saved),
      out("p3-o2", CAP.next, true),
      typed("p3-clear", "p3-cleartyped"),
      "</div>",
      "</section>",

      // 04 clear, then go
      clip("p4", "phase top", CUT.p4, 1),
      out("p4-h1", CAP.loaded),
      out("p4-h2", CAP.copy, true),
      typed("p4-go", "p4-gotyped"),
      said("p4-c1", "Claude", "The handover's next action: run the cart tests, then fix src/cart.js:2."),
      tool("p4-c2", "", "Bash", "npm test -- cart"),
      tool("p4-c3", "", "Edit", "src/cart.js"),
      tool("p4-c4", "", "Bash", "npm test -- cart"),
      said("p4-c5", "", "cartTotal now rounds once, at the total. The cart tests pass."),
      "</section>",

      // 06 many windows: window 1 has just saved; window 2 opens
      clip("p6", "phase top", CUT.p6, 1),
      ask(null, "/clear-resume:handover", true),
      tool(null, "Claude", "Bash", CAP.saveCmd, true),
      out(null, CAP.saved, false, true),
      out(null, CAP.next, true, true),
      "</section>",

      // 08 auto mode: a long session again, and the nudge
      clip("p8", "phase scroll", CUT.p8, 1),
      ask(null, "add a discount code field to the checkout", true),
      tool(null, "Claude", "Edit", "src/checkout.js", true),
      tool(null, "", "Bash", "npm test -- checkout", true),
      said(null, "", "Discount codes apply before the total is rounded.", true),
      ask(null, "show the discount on the receipt too", true),
      tool(null, "Claude", "Edit", "src/receipt.js", true),
      said(null, "", "The receipt lists the discount on its own line.", true),
      ask(null, "also email a copy of the receipt to the customer", true),
      tool(null, "Claude", "Edit", "src/receipt.js", true),
      tool(null, "", "Bash", "npm test -- receipt", true),
      said(null, "", "The receipt email sends the rounded total.", true),
      row("p8-nudge", "", "out voice nudge", text(CAP.nudge)),
      "</section>",

      "</div>", // #body
      "</div>", // #window

      // the second window, in front of the first
      '<div id="win2" data-layout-allow-overlap>',
      '<div class="tb2"><span class="repo2">widget-shop</span><span class="tag2">window 2</span></div>',
      '<div class="body2">',
      out("w2-line", CAP.waiting),
      "</div>",
      "</div>",

      // VS Code, hours later: the sidebar, the status bar, the readable copy
      '<div id="editor">',
      '<div id="ed-top"><span>widget-shop</span></div>',
      '<div id="ed-main">',
      '<div id="ed-activity"><i></i><i></i><i></i><i class="on"></i></div>',
      '<div id="ed-side">',
      '<div id="ed-head">' + esc(CAP.viewHeader) + "</div>",
      '<div id="ed-group"><span class="chev">&#8250;</span> ' + esc(CAP.groupLoaded) + ' <span class="count">1</span></div>',
      '<div id="ed-row"><span class="check">&#10003;</span><span class="t">' + esc(CAP.rowTitle) +
        '</span><span class="d">' + esc(CAP.rowAge) + "</span></div>",
      "</div>",
      '<div id="ed-pane">',
      '<div id="ed-tab">' + text(CAP.copyName) + "</div>",
      '<div id="ed-doc">'
    );
    CAP.copyBody.forEach(function (b, i) {
      html.push('<div class="doc doc-' + b[0] + '" id="doc-' + i + '">' + text(b[1]) + "</div>");
    });
    html.push(
      "</div>",
      "</div>",
      "</div>", // #ed-main
      '<div id="ed-status"><span class="br">fix/cart-rounding</span>' +
        '<span id="ed-item">' + esc(CAP.status) + "</span></div>",
      "</div>", // #editor

      // the side cards, one set per beat
      '<div id="cards">',
      '<div class="cardset" id="cs1">' + card("c1a") + card("c1b") + card("c1c") + "</div>",
      '<div class="cardset" id="cs2">' + card("c2a") + card("c2b", "shift") + "</div>",
      '<div class="cardset" id="cs3">' + card("c3a") + card("c3b", "shift") + card("c3c") + "</div>",
      '<div class="cardset" id="cs4">' + card("c4a") + card("c4b", "shift") + card("c4c") + "</div>",
      '<div class="cardset" id="cs6">' + card("c6a") + card("c6b") + "</div>",
      '<div class="cardset" id="cs7">' + card("c7a") + card("c7b") + "</div>",
      '<div class="cardset" id="cs8">' + card("c8a") + card("c8b") + "</div>",
      "</div>",

      // 05 the numbers
      '<div id="stats">',
      '<div id="st-token">' + esc(STATS.token) + "</div>",
      '<div id="st-row">',
      '<div class="stat" id="st1"><div class="num">' + STATS.s1[0] + '</div><div class="lab">' + text(STATS.s1[1]) + "</div></div>",
      '<div class="stat" id="st2"><div class="num">' + STATS.s2[0] + '</div><div class="lab">' + text(STATS.s2[1]) + "</div></div>",
      '<div class="stat" id="st3"><div class="num"><small>about</small>' + STATS.s3[0] + '</div><div class="lab">' + text(STATS.s3[1]) + "</div></div>",
      "</div>",
      '<div id="st-share">' + esc(STATS.share) + "</div>",
      '<div id="st-source">' + text(STATS.source) + "</div>",
      "</div>"
    );

    BEATS.forEach(function (b, i) {
      html.push('<div class="beat" id="beat-' + (i + 1) + '"><i>' + b.n + "</i><u>" + b.word + "</u></div>");
    });

    html.push(
      // close. Where a cut is too narrow for the first command, its
      // stylesheet shows the continuation mark and drops the URL to its own
      // line, so it still reads as two commands.
      clip("close", "close", CUT.close, 2),
      '<div id="close-head">' + esc(CLOSE.headline) + "</div>",
      '<div id="close-line">' + text(CLOSE.line) + "</div>",
      '<div id="close-cmd">',
      '<div class="cmd">' + esc(CAP.installAdd) + '<span class="cont"> \\</span> <span class="arg">' + esc(CAP.installUrl) + "</span></div>",
      '<div class="cmd">' + esc(CAP.installPlugin) + "</div>",
      "</div>",
      '<div id="close-foot">' + esc(CLOSE.foot) + "</div>",
      "</section>",

      '<div id="grain"></div>'
    );
    return html.join("");
  }

  /* ------------------------------------------------------------------------
   * Build the DOM into the root and return its one paused timeline.
   * ---------------------------------------------------------------------- */
  function build(root) {
    root.insertAdjacentHTML("afterbegin", markup());

    var DURATION = Number(root.getAttribute("data-duration"));
    var tl = gsap.timeline({ paused: true });

    /* --------------------------------------------------------------------
     * Typing, and un-typing. A string-at-time row table is built
     * synchronously before the timeline registers; the timeline only reads
     * it, so a given time renders the same string whichever way it was
     * seeked. The caret blinks on integer sine cycles and hides at hideAt.
     * ------------------------------------------------------------------ */
    var lcg = 0x51ec0ded;
    function rnd() {
      lcg = (Math.imul(1664525, lcg) + 1013904223) >>> 0;
      return lcg / 4294967296;
    }

    function typeScript(element, steps, hideAt) {
      var caret = document.createElement("span");
      caret.className = "caret";
      caret.setAttribute("aria-hidden", "true");
      element.parentNode.appendChild(caret);

      var rows = [{ t: 0, s: "" }];
      var cur = "";
      var t = 0;
      steps.forEach(function (step) {
        t = step.at;
        if (step.erase) {
          while (cur.length) {
            var k = Math.min(cur.length, 1 + Math.floor(rnd() * 2));
            cur = cur.slice(0, cur.length - k);
            t += k * step.speed;
            rows.push({ t: t, s: cur });
          }
        } else {
          var full = step.text;
          var i = 0;
          while (i < full.length) {
            var chunk = full.slice(i, i + 1 + Math.floor(rnd() * 3));
            t += chunk.length * step.speed * (0.72 + rnd() * 0.6);
            i += chunk.length;
            cur += chunk;
            rows.push({ t: t, s: cur });
          }
        }
      });
      var endAt = t;

      function stringAt(time) {
        for (var k = rows.length - 1; k >= 0; k -= 1) {
          if (time >= rows[k].t - 0.001) return rows[k].s;
        }
        return "";
      }

      var driver = { t: 0 };
      tl.to(
        driver,
        {
          t: hideAt,
          duration: hideAt,
          ease: "none",
          onUpdate: function () {
            element.textContent = stringAt(driver.t);
          },
        },
        0,
      );

      var firstAt = steps[0].at - 0.1;
      var span = Math.max(0.3, hideAt - firstAt);
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
        firstAt,
      );
      tl.set(caret, { opacity: 0 }, hideAt);
      return endAt;
    }

    /* ---- a printed row: it arrives, it never fades in ---- */
    function print(selector, at, lift) {
      tl.set(selector, { display: "block", opacity: 1, y: lift || 10 }, at);
      tl.to(selector, { y: 0, duration: 0.14, ease: "power4.out" }, at);
    }

    /* ---- a card: binary reveal with a short lift ---- */
    function showCard(selector, at) {
      tl.set(selector, { opacity: 1, y: 28 }, at);
      tl.to(selector, { y: 0, duration: 0.22, ease: "power4.out" }, at);
    }
    function hideSet(selector, at) {
      tl.fromTo(selector, { opacity: 1 }, { opacity: 0, duration: 0.3, ease: "power2.in", immediateRender: false }, at);
    }
    function fadeIn(selector, at, dur) {
      tl.fromTo(selector, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: dur || 0.4, ease: "power3.out", immediateRender: false }, at);
    }
    function fadeOut(selector, at, dur) {
      tl.fromTo(selector, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.96, duration: dur || 0.4, ease: "power3.in", immediateRender: false }, at);
    }

    /* --------------------------------------------------------------------
     * The context meter: a bar with no number on it, so it makes no claim.
     * One ease:none driver over the whole piece reads a baked schedule, so
     * the value is a pure function of time. Jumps happen while the window
     * is off screen.
     * ------------------------------------------------------------------ */
    var fill = document.getElementById("fill");
    var SEGMENTS = [
      { t0: 0.8, t1: 4.2, v0: 0.62, v1: 0.82, ease: "linear" },
      { t0: 4.3, t1: 5.6, v0: 0.82, v1: 0.93, ease: "linear" },
      { t0: 18.9, t1: 23.4, v0: 0.93, v1: 0.96, ease: "linear" },
      { t0: 29.55, t1: 30.3, v0: 0.96, v1: 0.05, ease: "out3" },
      { t0: 30.9, t1: 31.7, v0: 0.05, v1: 0.08, ease: "out2" },
      { t0: 33.4, t1: 37.0, v0: 0.08, v1: 0.13, ease: "linear" },
      { t0: 50.1, t1: 50.15, v0: 0.13, v1: 0.96, ease: "linear" },
      { t0: 62.7, t1: 62.75, v0: 0.96, v1: 0.91, ease: "linear" },
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
    function paintMeter(time) {
      var v = meterAt(time);
      fill.style.transform = "scaleX(" + v.toFixed(4) + ")";
      fill.style.backgroundColor = v > 0.7 ? "#c07c2a" : "#e5a743";
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
      { scale: 1.05, opacity: 1, duration: 3.6, ease: "sine.inOut", yoyo: true, repeat: Math.ceil(DURATION / 3.6) },
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

    /* ---- ghost word and beat marker, one pair per beat ---- */
    BEATS.forEach(function (b, i) {
      var ghost = "#ghost-" + (i + 1);
      var beat = "#beat-" + (i + 1);
      tl.fromTo(ghost, { opacity: 0, y: 26 }, { opacity: 0.06, y: 0, duration: 0.7, ease: "power2.out" }, b.at);
      tl.fromTo(ghost, { y: 0 }, { y: -22, duration: b.until - b.at - 1.1, ease: "sine.inOut", immediateRender: false }, b.at + 0.7);
      tl.fromTo(ghost, { opacity: 0.06 }, { opacity: 0, duration: 0.4, ease: "power2.in", immediateRender: false }, b.until - 0.4);

      tl.set(beat, { opacity: 1, y: 14 }, b.at + 0.15);
      tl.to(beat, { y: 0, duration: 0.18, ease: "power4.out" }, b.at + 0.15);
      tl.to(beat, { opacity: 0, duration: 0.3, ease: "power2.in" }, b.until - 0.34);
    });

    /* ==================================================================
     * 01 THE PROBLEM - 0.0 to 9.5
     * ================================================================ */
    print("#p1-ask", 0.8);
    print("#p1-c1", 1.7);
    print("#p1-c2", 2.3);
    print("#p1-c3", 3.0);
    print("#p1-c4", 3.9);
    print("#p1-c5", 5.2);
    showCard("#c1a", 1.2);
    showCard("#c1b", 4.4);
    showCard("#c1c", 6.9);
    hideSet("#cs1", 9.2);

    /* ==================================================================
     * 02 TWO OLD WAYS - 9.5 to 17.0: the user types each, and thinks better
     * ================================================================ */
    print("#p1-type", 9.8);
    typeScript(
      document.getElementById("p1-typed"),
      [
        { at: 10.1, text: "/compact", speed: 0.075 },
        { at: 12.9, erase: true, speed: 0.035 },
        { at: 13.5, text: "/clear", speed: 0.075 },
        { at: 16.0, erase: true, speed: 0.035 },
      ],
      16.9,
    );
    showCard("#c2a", 10.2);
    showCard("#c2b", 13.6);
    hideSet("#cs2", 16.7);

    /* ==================================================================
     * 03 THE NOTE - 17.0 to 30.3: the handover skill writes and saves it
     * ================================================================ */
    print("#p3-ask", 17.2);
    typeScript(document.getElementById("p3-typed"), [{ at: 17.3, text: "/clear-resume:handover", speed: 0.05 }], 18.7);
    print("#p3-t", 18.9);
    var at = 19.35;
    CAP.body.forEach(function (b, i) {
      print("#p3-b" + i, at, b[0] === "bd" ? 30 : 44);
      at += b[0] === "bd" ? 0.32 : 0.2;
    });
    print("#p3-eof", at + 0.1);
    print("#p3-o1", 23.4);
    print("#p3-o2", 23.75);
    showCard("#c3a", 17.6);
    showCard("#c3b", 20.4);
    showCard("#c3c", 22.4);

    // The /clear that ends the session: typed with the note still on screen,
    // then the whole session leaves upward as one group.
    print("#p3-clear", 28.6);
    var clearTyped = typeScript(document.getElementById("p3-cleartyped"), [{ at: 28.7, text: "/clear", speed: 0.07 }], 29.5);
    hideSet("#cs3", 29.2);
    tl.fromTo("#p3-stack", { y: 0 }, { y: -80, duration: 0.46, ease: "power3.in", immediateRender: false }, Math.max(clearTyped, 29.5));
    tl.fromTo("#p3-stack", { opacity: 1 }, { opacity: 0, duration: 0.46, ease: "power3.in", immediateRender: false }, Math.max(clearTyped, 29.5));

    /* ==================================================================
     * 04 CLEAR, THEN GO - 30.3 to 41.2
     * The hook's lines are there before anyone types. Claude says nothing
     * until the user types go.
     * ================================================================ */
    print("#p4-h1", 30.9);
    print("#p4-h2", 31.15);
    print("#p4-go", 32.4);
    typeScript(document.getElementById("p4-gotyped"), [{ at: 32.5, text: "go", speed: 0.09 }], 33.1);
    print("#p4-c1", 33.4);
    print("#p4-c2", 34.3);
    print("#p4-c3", 35.2);
    print("#p4-c4", 36.0);
    print("#p4-c5", 37.0);
    showCard("#c4a", 30.6);
    showCard("#c4b", 32.8);
    showCard("#c4c", 37.9);
    // the copy's path line lights up as the card names it
    tl.fromTo("#p4-h2 .txt", { backgroundColor: "rgba(229,167,67,0)" }, { backgroundColor: "rgba(229,167,67,0.14)", duration: 0.3, ease: "power2.out", immediateRender: false }, 38.0);
    hideSet("#cs4", 40.8);
    fadeOut("#window", 41.0, 0.45);

    /* ==================================================================
     * 05 THE NUMBERS - 41.5 to 50.2
     * ================================================================ */
    tl.set("#stats", { opacity: 1 }, 41.45);
    showCard("#st-token", 41.6);
    showCard("#st-source", 41.6);
    showCard("#st1", 42.3);
    showCard("#st2", 43.7);
    showCard("#st3", 45.1);
    showCard("#st-share", 46.7);
    hideSet("#stats", 49.9);

    /* ==================================================================
     * 06 MANY WINDOWS - 50.3 to 56.4
     * ================================================================ */
    tl.set("#wtag", { opacity: 1 }, 50.2);
    tl.set("#wtag", { opacity: 0 }, 56.7);
    fadeIn("#window", 50.35, 0.4);
    tl.fromTo("#win2", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out", immediateRender: false }, 51.2);
    print("#w2-line", 51.9);
    showCard("#c6a", 50.9);
    showCard("#c6b", 53.3);
    hideSet("#cs6", 56.1);
    fadeOut("#window", 56.2, 0.35);
    tl.fromTo("#win2", { opacity: 1 }, { opacity: 0, duration: 0.35, ease: "power3.in", immediateRender: false }, 56.2);

    /* ==================================================================
     * 07 THE SIDEBAR - 56.6 to 62.8, hours later in VS Code
     * ================================================================ */
    fadeIn("#editor", 56.6, 0.4);
    showCard("#ed-group", 57.1);
    showCard("#ed-row", 57.3);
    showCard("#ed-item", 57.7);
    showCard("#c7a", 57.2);
    showCard("#c7b", 59.3);
    tl.fromTo("#ed-item", { backgroundColor: "rgba(229,167,67,0)" }, { backgroundColor: "rgba(229,167,67,0.30)", duration: 0.25, ease: "power2.out", immediateRender: false }, 59.7);
    tl.set("#ed-tab", { opacity: 1 }, 60.3);
    tl.set("#ed-doc", { opacity: 1 }, 60.3);
    tl.fromTo("#ed-doc", { y: 16 }, { y: 0, duration: 0.2, ease: "power4.out", immediateRender: false }, 60.3);
    hideSet("#cs7", 62.5);
    fadeOut("#editor", 62.5, 0.35);

    /* ==================================================================
     * 08 AUTO MODE - 63.0 to 68.2
     * ================================================================ */
    fadeIn("#window", 62.95, 0.4);
    showCard("#c8a", 63.4);
    print("#p8-nudge", 64.5);
    showCard("#c8b", 65.3);
    hideSet("#cs8", 67.9);

    /* ==================================================================
     * CLOSE - 68.5 to the end
     * ================================================================ */
    fadeOut("#window", 68.0, 0.5);
    showCard("#close-head", 68.7);
    showCard("#close-line", 69.0);
    showCard("#close-cmd", 69.3);
    showCard("#close-foot", 69.7);

    tl.seek(0);
    return tl;
  }

  global.ClearResumeStory = { build: build };
})(window);
