/* ============================================================
   M'AKOMA — "Who are your five?" bracelet configurator
   ------------------------------------------------------------
   Deliberately NO WebGL. The hero already holds a WebGLRenderer with the
   762 KB GLB, a PMREM env map and a bloom pass; a second GL context would
   duplicate every geometry and texture, and on a mid-range Android inside
   Instagram's webview (where most of our traffic comes from) that is the
   likeliest source of jank or a blank canvas. This stage is 8 positioned
   divs driven by one `angle` number — crisper than 3D at 375px, zero new
   network bytes, and it works under reduced-motion and save-data.

   The rotation control IS the roster rail: a native horizontal scroll-snap
   list whose scrollLeft drives the ring. That is the whole answer to the
   drag-vs-scroll trap a tester hit on the hero ("I thought I had to swipe
   sideways") — iOS and Android apply their own directional lock to a native
   scroller, so a vertical-ish swipe scrolls the PAGE and never the rail. No
   custom gesture physics, no axis ambiguity, and the same gesture picks who
   you're editing.

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

  var root = $("#yourfive");
  if (!root) return;

  var stage   = $(".cfg-ring", root);
  var cordSvg = $(".cfg-cord", root);
  var roster  = $(".cfg-roster", root);
  var frontLbl= $(".cfg-front", root);
  var hint    = $(".cfg-hint", root);
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
  var angle = 0, targetAngle = 0;
  var beadEls = [];
  var tapped = false;
  var raf = null;
  var litMap = {};                 // bead index -> glow colour, rebuilt only when the design changes
  var progScroll = 0;              // timestamp: suppress the scroll-debounce during our own scrollIntoView
  function refreshLit() {
    litMap = {};
    D.get().people.forEach(function (p) { litMap[D.beadOf(p.sym)] = p.glow; });
  }

  /* ---------- glyph rendering (from window.ADINKRA_PATHS, already loaded) ---------- */
  function glyphSVG(key, cls) {
    var g = (window.ADINKRA_PATHS || {})[key];
    if (!g) return "";
    var paths = g.paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("");
    return '<svg class="' + (cls || "") + '" viewBox="' + g.viewBox + '" aria-hidden="true" focusable="false">' + paths + "</svg>";
  }

  /* ---------- the ring ---------- */
  function buildRing() {
    stage.innerHTML = "";
    beadEls = [];
    for (var i = 0; i < 8; i++) {
      var b = document.createElement("div");
      b.className = "cfg-bead";
      b.dataset.bead = String(i);
      b.innerHTML = '<span class="cfg-face">' + glyphSVG(D.SYMBOLS[i], "cfg-glyph") + "</span>";
      stage.appendChild(b);
      beadEls.push(b);
    }
  }

  /* Lay the 8 beads on a tilted ellipse. One `angle` variable rotates the whole
     thing; scale/opacity/z-index fake the depth so it reads as a real bracelet
     lying at an angle rather than a flat circle of dots. */
  function layout() {
    var w = stage.clientWidth || 320, h = stage.clientHeight || 300;
    var bead = beadEls[0] ? beadEls[0].offsetWidth : 64;
    var cx = w / 2, cy = h / 2;
    // keep the whole ring (plus a bead radius) inside the stage on any viewport
    var rx = Math.min((w - bead) / 2 - 6, (h - bead) / 2 / 0.52 - 6, 220);
    var ry = rx * 0.52;                              // a bracelet lying tilted away, not a flat circle
    var lit = litMap;                                        // cached; refreshed on state change, not per frame

    for (var i = 0; i < 8; i++) {
      var t = angle + i * TAU / 8;
      var depth = (1 + Math.cos(t)) / 2;             // 1 = nearest the viewer
      var x = cx + rx * Math.sin(t);
      var y = cy + ry * Math.cos(t);                 // +cos: the front bead sits LOW, nearest the eye
      var sc = 0.66 + 0.34 * depth;
      var el = beadEls[i];
      el.style.transform = "translate(-50%,-50%) translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(" + sc.toFixed(3) + ")";
      el.style.zIndex = String(Math.round(sc * 100));
      el.style.opacity = (0.40 + 0.60 * depth).toFixed(3);
      var glow = lit[i];
      if (glow) { el.classList.add("is-lit"); el.style.setProperty("--lit", glow); }
      else { el.classList.remove("is-lit"); el.style.removeProperty("--lit"); }
    }
    drawCord(cx, cy, rx, ry);
  }

  function drawCord(cx, cy, rx, ry) {
    if (!cordSvg) return;
    var w = stage.clientWidth || 320, h = stage.clientHeight || 300;
    cordSvg.setAttribute("viewBox", "0 0 " + w + " " + h);
    var e = cordSvg.querySelector("ellipse");
    if (!e) { e = document.createElementNS("http://www.w3.org/2000/svg", "ellipse"); cordSvg.appendChild(e); }
    e.setAttribute("cx", cx); e.setAttribute("cy", cy);
    e.setAttribute("rx", rx); e.setAttribute("ry", ry);
    e.setAttribute("class", "cfg-cordline");
  }

  /* Bring a bead to the front of the ring (nearest the viewer = cos(t) max, t≈0). */
  function angleForBead(i) { return -i * TAU / 8; }

  function easeTo(a) {
    targetAngle = a;
    if (reduce) { angle = norm(targetAngle); layout(); return; }
    if (raf) return;
    var step = function () {
      var d = shortest(targetAngle - angle);
      if (Math.abs(d) < 0.002) { angle = norm(targetAngle); layout(); raf = null; return; }
      angle = norm(angle + d * 0.16);
      layout();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function norm(a) { a %= TAU; return a < 0 ? a + TAU : a; }
  function shortest(d) { d %= TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

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
    easeTo(angleForBead(D.beadOf(key)));
    pulse(D.beadOf(key), st.people[selected].glow);
  }

  function select(i, scrollChip) {
    selected = Math.max(0, Math.min(D.SLOTS - 1, i));
    var st = D.get();
    var p = st.people[selected];
    easeTo(angleForBead(D.beadOf(p.sym)));
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

    frontLbl.textContent = real || p.ghost;
    frontLbl.classList.toggle("is-ghost", !real);

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
    var el = beadEls[beadIdx];
    if (!el) return;
    el.classList.remove("is-pulse");
    void el.offsetWidth;                       // restart the animation
    if (hex) el.style.setProperty("--lit", hex);
    el.classList.add("is-pulse");
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
    buildRing();
    buildRoster();
    buildSymRail();
    buildLights();
    buildShells();

    /* The rail's native scroll drives the ring. Passive listener, no preventDefault
       anywhere — the browser keeps full ownership of the gesture. */
    var scrollT = null;
    roster.addEventListener("scroll", function () {
      if (raf) { cancelAnimationFrame(raf); raf = null; }     // the finger wins over the ease
      var max = roster.scrollWidth - roster.clientWidth;
      if (max > 4) {
        var f = Math.max(0, Math.min(1, roster.scrollLeft / max));   // clamp: WebKit rubber-banding overscrolls
        var st = D.get();
        var beadIdxs = st.people.map(function (p) { return D.beadOf(p.sym); });
        var pos = f * (D.SLOTS - 1);
        var i0 = Math.floor(pos), i1 = Math.min(D.SLOTS - 1, i0 + 1), frac = pos - i0;
        var a0 = angleForBead(beadIdxs[i0]), a1 = angleForBead(beadIdxs[i1]);
        var na = norm(a0 + shortest(a1 - a0) * frac);
        if (isFinite(na)) { angle = na; layout(); }   // a NaN here would spin the rAF loop forever
      }
      clearTimeout(scrollT);
      scrollT = setTimeout(function () {                        // Safari has no scrollend
        if (Date.now() - progScroll < 700) return;   // this scroll was ours, not the user's
        var idx = centredChip();
        if (idx !== selected) { selected = idx; paintEditor(); paintRoster(); }
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

    /* Tapping any bead selects that person AND pulses it — one rule, both halves
       rewarding. A two-rule system ("front pulses, side selects") is not inferable. */
    stage.addEventListener("click", function (e) {
      var b = e.target.closest(".cfg-bead");
      if (!b) return;
      var idx = +b.dataset.bead;
      var st = D.get();
      var who = -1;
      st.people.forEach(function (p, j) { if (D.beadOf(p.sym) === idx) who = j; });
      if (who !== -1) {
        select(who, true);
        pulse(idx, st.people[who].glow);
      } else {
        pulse(idx, null);                    // an unassigned bead still answers
      }
      if (!tapped) { tapped = true; if (hint) hint.classList.add("is-gone"); }
    });

    nameIn.addEventListener("input", function () { D.setName(selected, nameIn.value); });
    var resetBtn = $(".cfg-reset", root);
    if (resetBtn) resetBtn.addEventListener("click", function () {
      D.reset(); selected = 0; buildRoster(); select(0, true); toast("Started over.");
    });

    /* Focusing the name field opens the soft keyboard; collapse the stage so the
       editor rises above it instead of being squashed. */
    nameIn.addEventListener("focus", function () { root.classList.add("is-typing"); });
    nameIn.addEventListener("blur",  function () { root.classList.remove("is-typing"); });

    var cta = $(".cfg-cta", root);
    if (cta) cta.addEventListener("click", function () {
      var join = document.getElementById("join");
      if (join) join.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      var em = document.getElementById("joinEmail");
      if (em) setTimeout(function () { try { em.focus({ preventScroll: true }); } catch (e) { em.focus(); } }, reduce ? 0 : 620);
    });

    D.subscribe(function () { refreshLit(); paintEditor(); paintRoster(); layout(); });

    var ro = window.ResizeObserver ? new ResizeObserver(function () { layout(); }) : null;
    if (ro) ro.observe(stage); else window.addEventListener("resize", layout);

    select(0, false);
    layout();
    root.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
