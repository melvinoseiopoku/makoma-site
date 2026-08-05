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

  /* lights left the designer — presence colours are set in the app, not at purchase */

  var root = $("#customize");
  if (!root) return;

  var roster  = $(".cfg-roster", root);
  var editor  = $(".cfg-editor", root);
  var cutTabs = $(".cfg-cuttabs", root);
  var boxTitle= $(".box-title", root);
  var boxEyebrow = $(".box-eyebrow", root);
  var saveName= $(".cfg-savename", root);
  var saveEmail = $(".cfg-saveemail", root);
  var saveBtn = $(".cfg-savebtn", root);
  var saveStatus = $(".cfg-savestatus", root);
  var iniRow  = $(".cfg-inirow", root);
  var upInput = $(".cfg-upbtn input", root);
  var upStatus= $(".cfg-upstatus", root);
  var cutFile = $(".cfg-cutfile", root);
  var nameIn  = $("#cfgName");
  var symRail = $(".cfg-symrail", root);
  var symMeta = $(".cfg-symmeta", root);
  var shellRow= $(".cfg-shells", root);
  var shellLbl= $(".cfg-shellname", root);
  var cordRow = $(".cfg-cordsw", root);
  var cordLbl = $(".cfg-cordname", root);
  var toastEl = $(".cfg-toast", root);
  var srLive  = $(".cfg-sr", root);

  var selected = 0;
  var progScroll = 0;              // timestamp: suppress the scroll-debounce during our own scrollIntoView

  /* the 3-D stage, when it's alive (hero3d.js box mode); every call is optional */
  function box() { return (window.__hero && window.__hero.box) || null; }
  function boxFocus(node) { var b = box(); if (b) b.focus(node); }
  // colour changes play through the box's smoke reveal when it's open (the swap lands while
  // the piece is shrouded); anywhere else they just apply
  // cord colours dye the cord (a wetting front sweeps the piece); shells use the smoke chamber
  function dyeSwap(apply, hex) {
    var b = box();
    if (b && b.isOpen && b.dye) b.dye(apply, hex); else apply();
  }
  function smokeSwap(apply, hex) {
    var b = box();
    if (b && b.isOpen && b.smoke) b.smoke(apply, hex); else apply();
  }
  function boxPulse(node, hex) { var b = box(); if (b) b.pulse(node, hex); }

  /* ---------- glyph rendering (from window.ADINKRA_PATHS, already loaded) ---------- */
  function glyphSVG(key, cls) {
    var g = (window.ADINKRA_PATHS || {})[key];
    if (!g) return "";
    var paths = g.paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("");
    return '<svg class="' + (cls || "") + '" viewBox="' + g.viewBox + '" aria-hidden="true" focusable="false">' + paths + "</svg>";
  }

  /* ---------- roster ---------- */
  /* how a cut renders on a chip face: adinkra = its glyph; initials = the letters
     (in the same stencil face that will be cut); upload = a generic mark */
  function cutFace(cut) {
    if (cut && cut.type === "adinkra") return glyphSVG(cut.sym, "cfg-glyph");
    if (cut && cut.type === "initials") return '<span class="cfg-chipini">' + cut.text + "</span>";
    if (cut && cut.type === "upload") return '<span class="cfg-chipini">✦</span>';
    return '<span class="cfg-chipblank">+</span>';       // not chosen yet — the bead is blank in the box
  }

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
        '<span class="cfg-chipface">' + cutFace(p.cut) + "</span>" +
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
      face.innerHTML = cutFace(p.cut);
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

  function buildCords() {
    if (!cordRow) return;
    cordRow.innerHTML = "";
    D.CORDS.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cfg-shell cfg-cordbtn";
      b.dataset.id = c.id;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", c.name + " cord");
      b.innerHTML = '<i style="background:' + c.hex + '"></i>';
      b.addEventListener("click", function () { dyeSwap(function () { D.setCord(c.id); }, c.hex); });
      cordRow.appendChild(b);
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
      b.addEventListener("click", function () { smokeSwap(function () { D.setShell(s.id); }, s.hex); });
      shellRow.appendChild(b);
    });
  }

  function chooseSymbol(key) {
    D.setCut(selected, { type: "adinkra", sym: key });
    var st = D.get();
    boxFocus(D.beadNode(selected));
    pulse(D.beadNode(selected), st.people[selected].glow);
  }

  function select(i, scrollChip) {
    selected = Math.max(0, Math.min(D.SLOTS - 1, i));
    var st = D.get();
    var p = st.people[selected];
    tabOverride = null;                       // a new person starts on the pane their cut lives in
    boxFocus(D.beadNode(selected));
    paintNext();
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

    var cut = p.cut || null;
    [].forEach.call(symRail.children, function (b) {
      var key = b.dataset.sym;
      var mine = !!cut && cut.type === "adinkra" && key === cut.sym;
      b.classList.toggle("is-on", mine);
      b.setAttribute("aria-checked", mine ? "true" : "false");
      b.querySelector(".cfg-symface").style.setProperty("--lit", mine ? p.glow : "transparent");
    });
    showTab(tabOverride || (!cut ? "adinkra" : cut.type === "initials" ? "initials" : cut.type === "upload" ? "upload" : "adinkra"), false);
    paintInitials(p, cut);
    if (symMeta) {   // the meta block left the dock (founder's call) — kept null-safe if it returns
      symMeta.innerHTML = !cut ? "<b>Blank</b>"
        : cut.type === "adinkra" ? "<b>" + SYM[cut.sym].name + "</b><span>" + SYM[cut.sym].lit + "</span>"
        : cut.type === "initials" ? "<b>" + cut.text + "</b>"
        : "<b>Your artwork</b>";
    }
    paintCutFile(p, cut);

    [].forEach.call(shellRow.children, function (b) {
      var on = b.dataset.id === st.shell;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    if (cordRow) [].forEach.call(cordRow.children, function (b) {
      var on = b.dataset.id === st.cord;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    if (cordLbl) cordLbl.textContent = D.cordDef(st.cord).name + " cord";
    var sd = D.shellDef(st.shell);
    shellLbl.textContent = sd.name;
    root.style.setProperty("--shell", sd.hex);
    root.classList.toggle("is-lightshell", sd.mark === "dark");

    if (srLive) {
      srLive.textContent = "Five beads on " + (/^[aeiou]/i.test(sd.name) ? "an " : "a ") + sd.name.toLowerCase() +
        " bracelet. Now editing " + (real || p.ghost) + ": " +
        (!cut ? "blank, no mark chosen yet" : cut.type === "adinkra" ? SYM[cut.sym].name : cut.type === "initials" ? "initials " + cut.text : "their own artwork") + ".";
    }
  }

  /* ---------- the wizard: colours → the six beads → save ---------- */
  var step = "colors";
  var STEP_COPY = {
    colors: { eyebrow: "Make it yours", title: 'Choose your <span class="gold-ink">colours.</span>' },
    beads:  { eyebrow: "Make it yours", title: 'Who are your <span class="gold-ink">six?</span>' },
    save:   { eyebrow: "Almost done",   title: 'Save your <span class="gold-ink">six.</span>' }
  };
  function setStep(sname) {
    step = sname;
    root.dataset.step = sname;
    if (boxEyebrow) boxEyebrow.textContent = STEP_COPY[sname].eyebrow;
    if (boxTitle) boxTitle.innerHTML = STEP_COPY[sname].title;
    paintNext();
    if (sname === "beads") select(selected, false);
  }
  function paintNext() {
    var nextBtn = $(".cfg-next", root);
    if (!nextBtn) return;
    nextBtn.textContent = step === "colors" ? "Next — your six"
                        : selected < D.SLOTS - 1 ? "Next bead" : "Finish";
  }

  /* ---------- the mark chooser: tabs, initials, upload ---------- */
  var tabOverride = null;   // the user's tab choice survives store-driven repaints (typing a name repaints per keystroke)
  function showTab(tab, user) {
    if (!cutTabs) return;
    if (user) tabOverride = tab;
    [].forEach.call(cutTabs.children, function (b) { b.classList.toggle("is-on", b.dataset.tab === tab); });
    [].forEach.call(root.querySelectorAll(".cfg-cutpane"), function (pn) { pn.hidden = pn.dataset.pane !== tab; });
    if (user && tab === "initials") paintInitials(D.get().people[selected], D.get().people[selected].cut);
  }

  /* 1–3 character options from the name: first letter, first two, first three,
     and word-initials when they typed more than one word. */
  function initialOptions(name, ghost) {
    var src = String(name || "").trim() || String(ghost || "").trim();
    var words = src.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var first = words[0];
    var opts = [first.slice(0, 1), first.slice(0, 2), first.slice(0, 3)];
    if (words.length > 1) opts.push(words.map(function (w) { return w[0]; }).join("").slice(0, 3));
    var seen = {};
    return opts.filter(function (o) { return o && o.length && !seen[o] && (seen[o] = 1); });
  }

  function paintInitials(p, cut) {
    if (!iniRow) return;
    var opts = initialOptions(p.name, p.ghost);
    iniRow.innerHTML = "";
    opts.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "cfg-ini"; b.textContent = o;
      b.setAttribute("role", "radio");
      var on = cut && cut.type === "initials" && cut.text === o;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.addEventListener("click", function () {
        D.setCut(selected, { type: "initials", text: o });
        boxFocus(D.beadNode(selected));
        pulse(D.beadNode(selected), D.get().people[selected].glow);
      });
      iniRow.appendChild(b);
    });
  }

  /* the traced-upload pipeline — all of it on-device. ImageTracer is injected only
     when someone actually reaches for it. */
  var tracerP = null;
  function tracer() {
    tracerP = tracerP || new Promise(function (res, rej) {
      var sc = document.createElement("script");
      sc.src = "assets/vendor/trace/imagetracer.js";
      sc.onload = function () { res(window.ImageTracer); };
      sc.onerror = rej;
      document.head.appendChild(sc);
    });
    return tracerP;
  }

  function upSay(msg, warn) {
    if (!upStatus) return;
    upStatus.textContent = msg || "";
    upStatus.classList.toggle("is-warn", !!warn);
  }

  function handleUpload(file) {
    if (!file) return;
    upSay("Tracing…");
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      tracer().then(function (IT) {
        // downscale into a known frame; trace to exactly two tones (that IS the threshold)
        var S = 240, cv = document.createElement("canvas");
        var k = Math.min(S / img.width, S / img.height);
        cv.width = Math.max(2, Math.round(img.width * k));
        cv.height = Math.max(2, Math.round(img.height * k));
        var g = cv.getContext("2d");
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, cv.width, cv.height);   // flatten alpha to white
        g.drawImage(img, 0, 0, cv.width, cv.height);
        var data = g.getImageData(0, 0, cv.width, cv.height);
        var svgStr = IT.imagedataToSVG(data, {
          numberofcolors: 2, colorsampling: 0, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }],
          ltres: 1, qtres: 1, pathomit: 8, strokewidth: 0, linefilter: true, rightangleenhance: false
        });
        // keep only the DARK paths (the marks); the white layer is the page
        var doc = new DOMParser().parseFromString(svgStr, "image/svg+xml");
        var paths = [].slice.call(doc.querySelectorAll("path")).filter(function (el) {
          var f = (el.getAttribute("fill") || "").replace(/\s/g, "").toLowerCase();
          var m = /rgb\((\d+),(\d+),(\d+)/.exec(f);
          return m ? (+m[1] + +m[2] + +m[3]) < 384 : (f === "#000000" || f === "black");
        });
        if (!paths.length) { upSay("Couldn’t find a dark shape in that image — try a higher-contrast one.", true); return; }
        var vb = doc.documentElement.getAttribute("viewBox") || ("0 0 " + cv.width + " " + cv.height);
        var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' +
          paths.map(function (el) { return '<path d="' + el.getAttribute("d") + '"/>'; }).join("") + "</svg>";
        if (out.length > 280000) { upSay("That shape traced too complex to cut — simplify the image.", true); return; }
        // manufacturability: islands (enclosed pieces fall out of a real cut) + thin strokes
        var islands = countIslands(out);
        var thin = thinStrokeShare(paths, vb);
        var warn = [];
        if (islands > 0) warn.push(islands + " enclosed piece" + (islands > 1 ? "s" : "") + " removed — they’d fall out of a real cut");
        if (thin > 0.75) warn.push("most of this is thinner than 0.8 mm and may not survive manufacturing");
        D.setCut(selected, { type: "upload", svg: out });
        boxFocus(D.beadNode(selected));
        upSay(warn.length ? warn.join(". ") + "." : "Traced. Cut onto the bead.", warn.length > 0);
      }).catch(function () { upSay("Tracing failed — try a PNG or JPG.", true); });
    };
    img.onerror = function () { URL.revokeObjectURL(url); upSay("Couldn’t read that file.", true); };
    img.src = url;
  }

  /* islands = subpaths wound opposite to their container (holes). Cheap proxy: count
     'M' beyond the first inside each path — every extra subpath is potentially a hole;
     the engine drops holes on upload cuts, so we report what will disappear. */
  function countIslands(svg) {
    var m = svg.match(/<path d="([^"]+)"/g) || [];
    var extra = 0;
    m.forEach(function (frag) {
      var subs = (frag.match(/M/gi) || []).length;
      if (subs > 1) extra += subs - 1;
    });
    return extra;
  }

  /* thin-stroke share via raster erosion: draw the cut at 20 px/mm inside the 7.6 mm
     window, blur by half the minimum feature and re-threshold. Every shape loses its
     edge band this way (loss ≈ perimeter × blur), so the warning only fires when nearly
     ALL the ink erodes — i.e. the strokes themselves are sub-minimum. */
  function thinStrokeShare(paths, vb) {
    try {
      var parts = vb.split(/\s+/).map(Number), vw = parts[2] || 100, vh = parts[3] || 100;
      var mmPerUnit = 7.6 / Math.max(vw, vh), pxPerMm = 20;
      var W = Math.max(8, Math.round(vw * mmPerUnit * pxPerMm)), H = Math.max(8, Math.round(vh * mmPerUnit * pxPerMm));
      var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      var g = cv.getContext("2d");
      var p2 = new Path2D(); paths.forEach(function (el) { p2.addPath(new Path2D(el.getAttribute("d"))); });
      g.setTransform(mmPerUnit * pxPerMm, 0, 0, mmPerUnit * pxPerMm, 0, 0);
      g.fillStyle = "#000"; g.fill(p2);
      var before = inkCount(g, W, H);
      if (!before) return 0;
      var blurPx = 0.4 * pxPerMm;                          // half of 0.8 mm
      var cv2 = document.createElement("canvas"); cv2.width = W; cv2.height = H;
      var g2 = cv2.getContext("2d");
      g2.filter = "blur(" + blurPx + "px)";
      g2.drawImage(cv, 0, 0);
      var d = g2.getImageData(0, 0, W, H).data, after = 0;
      for (var i = 3; i < d.length; i += 4) if (d[i] > 245) after++;
      return Math.max(0, (before - after) / before);
    } catch (e) { return 0; }
  }
  function inkCount(g, W, H) {
    var d = g.getImageData(0, 0, W, H).data, c = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 8) c++;
    return c;
  }

  /* the manufacturing file for the selected person's cut — the same artwork on the
     A4 page the laser masters use */
  var cutFileT = 0, cutFileURL = null;
  function paintCutFile(p, cut) {
    if (!cutFile) return;
    cutFile.innerHTML = "";
    if (!window.__hero || !window.__hero.cut) return;
    if (!cut) return;                                     // nothing chosen — nothing to manufacture
    var stamp = ++cutFileT;
    var who = (p.name.trim() || p.ghost);
    window.__hero.cut.manufacturingSVG(cut, who).then(function (svg) {
      if (!svg || stamp !== cutFileT) return;
      if (cutFileURL) { URL.revokeObjectURL(cutFileURL); cutFileURL = null; }   // one live URL, ever — repaints leaked one per keystroke
      var a = document.createElement("a");
      a.textContent = "Download the cut file (SVG)";
      a.download = "makoma-cut-" + who.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".svg";
      cutFileURL = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      a.href = cutFileURL;
      cutFile.appendChild(a);
    }).catch(function () {});
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
    buildShells();
    buildCords();

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
      st.people.forEach(function (p, j) { if (D.beadNode(j) === idx) who = j; });
      if (who !== -1) {
        select(who, true);
        pulse(idx, st.people[who].glow);
      } else {
        pulse(idx, null);                    // an unassigned bead still answers
      }
    });

    nameIn.addEventListener("input", function () { D.setName(selected, nameIn.value); });

    if (cutTabs) cutTabs.addEventListener("click", function (e) {
      var b = e.target.closest(".cfg-cuttab");
      if (b) showTab(b.dataset.tab, true);
    });
    if (upInput) upInput.addEventListener("change", function () { handleUpload(upInput.files && upInput.files[0]); upInput.value = ""; });

    /* The bead-by-bead flow: finish one person, press Next, and the piece turns the next bead
       into frame to be worked on — the ONLY rotation the bracelet does in the box. */
    var nextBtn = $(".cfg-next", root);
    if (nextBtn) nextBtn.addEventListener("click", function () {
      if (step === "colors") { setStep("beads"); return; }
      if (step !== "beads") return;
      if (selected < D.SLOTS - 1) {
        var i = selected + 1;
        select(i, true);
        pulse(D.beadNode(i), D.get().people[i].glow);
      } else {
        setStep("save");
      }
    });

    if (saveBtn) saveBtn.addEventListener("click", function () {
      var em = (saveEmail && saveEmail.value || "").trim();
      var who = (saveName && saveName.value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
        saveStatus.textContent = "A real email, please — it keeps your design saved.";
        saveStatus.classList.add("is-error");
        if (saveEmail) saveEmail.focus();
        return;
      }
      saveStatus.classList.remove("is-error");
      saveStatus.textContent = "Saving your design…";
      saveBtn.disabled = true;
      var join = window.MAKOMA_JOIN || function () { return Promise.resolve({ ok: true }); };
      join(em, { name: who, source: "designer" }).then(function (r) {
        saveBtn.disabled = false;
        if (r && r.ok) {
          saveStatus.textContent = "Saved — your six are on the waitlist with you. Watch your inbox.";
        } else {
          saveStatus.classList.add("is-error");
          saveStatus.textContent = r && r.reason === "email" ? "A real email, please." : "Hmm — that didn’t go through. Try again in a moment?";
        }
      });
    });

    /* The box has closed and the panel is up: present the selected person's bead. */
    window.addEventListener("makoma:boxopen", function () { setStep(step); });
    var resetBtn = $(".cfg-reset", root);
    if (resetBtn) resetBtn.addEventListener("click", function () {
      D.reset(); selected = 0; buildRoster(); setStep("colors"); toast("Started over.");
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
    setStep("colors");
    root.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
