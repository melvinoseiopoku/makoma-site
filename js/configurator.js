/* ============================================================
   M'AKOMA — "Who are your five?" bracelet configurator (the PANEL)
   ------------------------------------------------------------
   The stage is no longer here. This panel lives inside the hero (#customize)
   and what it edits is the hero's REAL 3-D bracelet, dropped into the
   manufacturing box by hero3d.js ("box mode"). This file owns the form —
   roster, name, symbol, light, shell, save — and delegates every visual
   consequence to window.__hero.box:
     focus(node)      the turntable brings that bead round to the front
     pulse(node,hex)  the bead's light flares
   and the design itself flows through window.MAKOMA_DESIGN, which hero3d.js
   subscribes to (shell colourway + per-person platform lights).
   Taps on the 3-D beads come BACK as a "makoma:pick" window event, so a
   touch on the piece selects that person here. The old CSS ring stage
   (8 divs on an ellipse) is retired with the section it lived in.

   State lives in window.MAKOMA_DESIGN (js/design.js) — names never leave
   the browser. This file is the view only.
   ============================================================ */
(function () {
  "use strict";

  var D = window.MAKOMA_DESIGN;
  if (!D) return;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var TAU = Math.PI * 2;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Symbol meanings. Duplicated from main.js's BEADS on purpose: that array
     lives inside a closed IIFE and is in a NON-alphabetical order, so it is
     not safe to index by position. Always look up by key. */
  var SYM = {
    akoma:         { name: "Akoma",         lit: "The heart",             light: "#e8c57a", note: 392.00 },
    akoma_ntoaso:  { name: "Akoma Ntoaso",  lit: "Linked hearts",         light: "#ecb07a", note: 440.00 },
    aya:           { name: "Aya",           lit: "The fern",              light: "#6fcf97", note: 783.99 },
    gye_nyame:     { name: "Gye Nyame",     lit: "Except God",            light: "#f1e9d2", note: 880.00 },
    nkonsonkonson: { name: "Nkonsonkonson", lit: "Linked together",       light: "#5fd3e0", note: 659.25 },
    nkyinkyim:     { name: "Nkyinkyim",     lit: "The winding path",      light: "#6aa6ff", note: 1046.50 },
    nsoroma:       { name: "Nsoroma",       lit: "Child of the heavens",  light: "#f4d58d", note: 587.33 },
    sankofa:       { name: "Sankofa",       lit: "Return & retrieve",     light: "#a78bfa", note: 523.25 }
  };

  var LIGHTS = [
    { hex: "#e8c57a", name: "Warm Gold" },
    { hex: "#ecb07a", name: "Soft Amber" },
    { hex: "#6fcf97", name: "Steady Green" },
    { hex: "#6aa6ff", name: "Calm Blue" },
    { hex: "#a78bfa", name: "Quiet Violet" },
    { hex: "#5fd3e0", name: "Still Teal" }
  ];
  var lightName = function (hex) {
    for (var i = 0; i < LIGHTS.length; i++) if (LIGHTS[i].hex.toLowerCase() === String(hex).toLowerCase()) return LIGHTS[i].name;
    return "Custom";
  };

  var root = $("#customize");
  if (!root) return;

  var roster  = $(".cfg-roster", root);
  var editor  = $(".cfg-editor", root);
  var nameIn  = $("#cfgName");
  var symRail = $(".cfg-symrail", root);
  var symMeta = $(".cfg-symmeta", root);
  var lightRow= $(".cfg-lights", root);
  var lightLbl= $(".cfg-lightname", root);
  var shellRow= $(".cfg-shells", root);
  var shellLbl= $(".cfg-shellname", root);
  var toastEl = $(".cfg-toast", root);
  var srLive  = $(".cfg-sr", root);

  var selected = 0;
  var progScroll = 0;              // timestamp: suppress the scroll-debounce during our own scrollIntoView

  /* the 3-D stage, when it's alive (hero3d.js box mode); every call is optional */
  function box() { return (window.__hero && window.__hero.box) || null; }
  function boxFocus(node) { var b = box(); if (b) b.focus(node); }
  function boxPulse(node, hex) { var b = box(); if (b) b.pulse(node, hex); }

  /* ---------- glyph rendering (from window.ADINKRA_PATHS, already loaded) ---------- */
  function glyphSVG(key, cls) {
    var g = (window.ADINKRA_PATHS || {})[key];
    if (!g) return "";
    var paths = g.paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("");
    return '<svg class="' + (cls || "") + '" viewBox="' + g.viewBox + '" aria-hidden="true" focusable="false">' + paths + "</svg>";
  }

  /* ---------- roster ---------- */
  function buildRoster() {
    roster.innerHTML = "";
    var st = D.get();
    st.people.forEach(function (p, i) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cfg-chip";
      chip.setAttribute("role", "tab");
      chip.dataset.i = String(i);
      chip.innerHTML =
        '<span class="cfg-chipface">' + glyphSVG(p.sym, "cfg-glyph") + "</span>" +
        '<span class="cfg-chipname"></span>';
      chip.addEventListener("click", function () { select(i, true); });
      roster.appendChild(chip);
    });
    paintRoster();
  }

  function paintRoster() {
    var st = D.get();
    [].forEach.call(roster.children, function (chip, i) {
      var p = st.people[i];
      chip.setAttribute("aria-selected", i === selected ? "true" : "false");
      chip.classList.toggle("is-on", i === selected);
      var nm = chip.querySelector(".cfg-chipname");
      var real = p.name.trim();
      nm.textContent = real || p.ghost;
      nm.classList.toggle("is-ghost", !real);
      var face = chip.querySelector(".cfg-chipface");
      face.innerHTML = glyphSVG(p.sym, "cfg-glyph");
      face.style.setProperty("--lit", p.glow);
    });
  }

  /* ---------- editor ---------- */
  function buildSymRail() {
    symRail.innerHTML = "";
    D.SYMBOLS.forEach(function (key) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cfg-sym";
      b.dataset.sym = key;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", SYM[key].name + " — " + SYM[key].lit.toLowerCase());
      b.innerHTML = '<span class="cfg-symface">' + glyphSVG(key, "cfg-glyph") + "</span>";
      b.addEventListener("click", function () { chooseSymbol(key); });
      symRail.appendChild(b);
    });
  }

  function buildLights() {
    lightRow.innerHTML = "";
    LIGHTS.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cfg-light";
      b.dataset.hex = l.hex;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", l.name);
      b.innerHTML = '<i style="background:' + l.hex + '"></i>';
      b.addEventListener("click", function () {
        D.setGlow(selected, l.hex);
        pulse(D.beadOf(D.get().people[selected].sym), l.hex);
      });
      lightRow.appendChild(b);
    });
  }

  function buildShells() {
    shellRow.innerHTML = "";
    D.SHELLS.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cfg-shell";
      b.dataset.id = s.id;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", s.name);
      b.innerHTML = '<i style="background:' + s.hex + '"></i>';
      b.addEventListener("click", function () { D.setShell(s.id); });
      shellRow.appendChild(b);
    });
  }

  function chooseSymbol(key) {
    var before = D.get().people.map(function (p) { return p.sym; });
    var displaced = -1;
    before.forEach(function (s, j) { if (s === key && j !== selected) displaced = j; });
    D.setSymbol(selected, key);
    var st = D.get();
    /* If the symbol determines the physical bead, taking someone else's symbol
       moves BOTH people around the ring. Say so rather than letting it look
       like a glitch. */
    if (displaced !== -1) {
      var who = st.people[displaced].name.trim() || st.people[displaced].ghost;
      toast(SYM[key].name + " was " + who + "’s — they’ve traded.");
    }
    boxFocus(D.beadOf(key));
    pulse(D.beadOf(key), st.people[selected].glow);
  }

  function select(i, scrollChip) {
    selected = Math.max(0, Math.min(D.SLOTS - 1, i));
    var st = D.get();
    var p = st.people[selected];
    boxFocus(D.beadOf(p.sym));
    paintEditor();
    paintRoster();
    if (scrollChip && roster.children[selected]) {
      progScroll = Date.now();     // an explicit tap wins; don't let our own smooth-scroll re-derive it
      roster.children[selected].scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
  }

  function paintEditor() {
    var st = D.get();
    var p = st.people[selected];
    var real = p.name.trim();

    if (document.activeElement !== nameIn) nameIn.value = real;   // never fight the caret mid-type
    nameIn.placeholder = p.ghost;

    [].forEach.call(symRail.children, function (b) {
      var key = b.dataset.sym;
      var mine = key === p.sym;
      b.classList.toggle("is-on", mine);
      b.setAttribute("aria-checked", mine ? "true" : "false");
      var takenBy = -1;
      st.people.forEach(function (q, j) { if (q.sym === key && j !== selected) takenBy = j; });
      b.classList.toggle("is-taken", takenBy !== -1);
      b.querySelector(".cfg-symface").style.setProperty("--lit", mine ? p.glow : "transparent");
    });
    symMeta.innerHTML = '<b>' + SYM[p.sym].name + "</b><span>" + SYM[p.sym].lit + "</span>";

    [].forEach.call(lightRow.children, function (b) {
      var on = b.dataset.hex.toLowerCase() === p.glow.toLowerCase();
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    lightLbl.textContent = lightName(p.glow);

    [].forEach.call(shellRow.children, function (b) {
      var on = b.dataset.id === st.shell;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    var sd = D.shellDef(st.shell);
    shellLbl.textContent = sd.name;
    root.style.setProperty("--shell", sd.hex);
    root.classList.toggle("is-lightshell", sd.mark === "dark");

    if (srLive) {
      srLive.textContent = "Five beads on " + (/^[aeiou]/i.test(sd.name) ? "an " : "a ") + sd.name.toLowerCase() +
        " bracelet. Now editing " + (real || p.ghost) + ", " + SYM[p.sym].name + ", " + lightName(p.glow) + ".";
    }
  }

  /* ---------- feedback ---------- */
  var actx = null;
  function tone(freq) {
    if (reduce) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, actx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.5);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.52);
    } catch (e) {}
  }

  function pulse(beadIdx, hex) {
    boxPulse(beadIdx, hex);                    // the REAL bead flares in the box
    try { if (navigator.vibrate) navigator.vibrate([0, 48, 110, 26]); } catch (e) {}
    var sym = D.SYMBOLS[beadIdx];
    if (SYM[sym]) tone(SYM[sym].note);
  }

  var toastT = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2400);
  }

  /* ---------- wiring ---------- */
  function init() {
    buildRoster();
    buildSymRail();
    buildLights();
    buildShells();

    /* Settling the rail on a chip selects that person — which turns the piece in the box.
       Passive listener; the browser keeps full ownership of the gesture. */
    var scrollT = null;
    roster.addEventListener("scroll", function () {
      clearTimeout(scrollT);
      scrollT = setTimeout(function () {                        // Safari has no scrollend
        if (Date.now() - progScroll < 700) return;   // this scroll was ours, not the user's
        var idx = centredChip();
        if (idx !== selected) select(idx, false);
      }, 120);
    }, { passive: true });

    /* Which chip is actually nearest the rail's centre. Measured rather than derived
       from a scrollLeft fraction, because scroll-padding + snap mean the travel does
       not map linearly onto the five chips. */
    function centredChip() {
      var mid = roster.getBoundingClientRect().left + roster.clientWidth / 2;
      var best = selected, bd = Infinity;
      [].forEach.call(roster.children, function (c, i) {
        var r = c.getBoundingClientRect();
        var d = Math.abs(r.left + r.width / 2 - mid);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    }

    /* Tapping a REAL bead in the box selects that person AND pulses it — one rule, both
       halves rewarding. hero3d.js raycasts the tap and reports the bead node here. */
    window.addEventListener("makoma:pick", function (e) {
      var idx = e.detail && e.detail.node;
      if (idx == null || idx < 0) return;
      var st = D.get();
      var who = -1;
      st.people.forEach(function (p, j) { if (D.beadOf(p.sym) === idx) who = j; });
      if (who !== -1) {
        select(who, true);
        pulse(idx, st.people[who].glow);
      } else {
        pulse(idx, null);                    // an unassigned bead still answers
      }
    });

    nameIn.addEventListener("input", function () { D.setName(selected, nameIn.value); });
    var resetBtn = $(".cfg-reset", root);
    if (resetBtn) resetBtn.addEventListener("click", function () {
      D.reset(); selected = 0; buildRoster(); select(0, true); toast("Started over.");
    });

    /* Focusing the name field opens the soft keyboard; the bottom sheet grows to make
       room for the editor (CSS keys off .is-typing). */
    nameIn.addEventListener("focus", function () { root.classList.add("is-typing"); });
    nameIn.addEventListener("blur",  function () { root.classList.remove("is-typing"); });

    var cta = $(".cfg-cta", root);
    if (cta) cta.addEventListener("click", function () {
      var b = box(); if (b && b.isOpen) b.close();     // the box unlocks the page scroll first
      setTimeout(function () {
        var join = document.getElementById("join");
        if (join) join.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        var em = document.getElementById("joinEmail");
        if (em) setTimeout(function () { try { em.focus({ preventScroll: true }); } catch (e) { em.focus(); } }, reduce ? 0 : 620);
      }, 60);
    });

    D.subscribe(function () { paintEditor(); paintRoster(); });

    select(0, false);
    root.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
