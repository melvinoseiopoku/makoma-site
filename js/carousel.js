/* ======================================================================
   M'AKOMA — CIRCLE MODE CAROUSEL
   Self-contained IIFE. Inits on DOMContentLoaded, guards on missing root,
   respects prefers-reduced-motion. Prefix: car-
   ====================================================================== */
(function () {
  "use strict";

  var ASSET_BASE = "assets/"; // beads/<sym>.png, beads/<sym>_glow.png, avatars/<name>.png

  var PEOPLE = [
    { name:"Maya",  avatar:"maya",  symbol:"sankofa",        sym:"Sankofa",        color:"#B77AF4", presence:"Quiet Violet", meaning:"Return & retrieve — it is not wrong to go back for what you forgot.", phrase:"Comes back around" },
    { name:"Ama",   avatar:"ama",   symbol:"akoma",          sym:"Akoma",          color:"#D6A84F", presence:"Warm Gold",    meaning:"The heart — patience, love, and the readiness to forgive.",            phrase:"Always close" },
    { name:"Kwame", avatar:"kwame", symbol:"aya",            sym:"Aya",            color:"#63CE88", presence:"Steady Green", meaning:"The fern — endurance; I have grown through hard ground.",               phrase:"Endures" },
    { name:"Nana",  avatar:"nana",  symbol:"gye_nyame",      sym:"Gye Nyame",      color:"#E7A94E", presence:"Soft Amber",   meaning:"Except God — awe at what is greater than us.",                          phrase:"Steady faith" },
    { name:"Kofi",  avatar:"kofi",  symbol:"nkyinkyim",      sym:"Nkyinkyim",      color:"#5C9CEB", presence:"Calm Blue",    meaning:"The winding path — adaptability, devotion, resilience.",                phrase:"Bends, never breaks" },
    { name:"Esi",   avatar:"esi",   symbol:"nsoroma",        sym:"Nsoroma",        color:"#68CFC2", presence:"Open Teal",    meaning:"Child of the heavens — a star to steer by in the dark.",                phrase:"A light to steer by" },
    { name:"Jason", avatar:"jason", symbol:"nkonsonkonson",  sym:"Nkonsonkonson",  color:"#EA6B73", presence:"Ember Red",    meaning:"Linked together — we are chained together in life and in death.",       phrase:"Chained together" }
  ];
  // Presence palette for the GLOW cycle (the 7 presences, in order)
  var PRESENCES = PEOPLE.map(function (p) { return { color:p.color, presence:p.presence }; });

  function init() {
    var section = document.getElementById("circle");
    if (!section) return;

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var track     = section.querySelector("#car-track");
    var stage     = section.querySelector("#car-stage");
    var dotsWrap  = section.querySelector("#car-dots");
    var focusGlow = section.querySelector("#car-focusglow");
    var elName    = section.querySelector("#car-name");
    var elPresBtn = section.querySelector("#car-presence");
    var elPresDot = section.querySelector("#car-presence-dot");
    var elPresLbl = section.querySelector("#car-presence-label");
    var elAvatar  = section.querySelector("#car-avatar");
    var elSym     = section.querySelector("#car-symbolname");
    var elMeaning = section.querySelector("#car-meaningline");
    var elPhrase  = section.querySelector("#car-phrase");
    var wrap      = section.querySelector(".car-wrap");
    var btnEcho   = section.querySelector("#car-echo");
    var btnPulse  = section.querySelector("#car-pulse");
    var btnGlow   = section.querySelector("#car-glow");
    if (!track || !stage) return;

    var index = 0;                 // focused person
    var glowOverride = PEOPLE.map(function (p) { return p.color; });   // per-person current colour
    var glowPresence = PEOPLE.map(function (p) { return p.presence; });
    var beads = [];

    /* ---------- WebAudio (soft bell) ---------- */
    var actx = null;
    function audio() {
      if (actx) { if (actx.state === "suspended") actx.resume(); return actx; }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      } catch (e) { actx = null; }
      return actx;
    }
    function bell(freq, dur, vol) {
      var c = audio(); if (!c) return;
      try {
        var t = c.currentTime;
        var o = c.createOscillator();
        var o2 = c.createOscillator();
        var g = c.createGain();
        o.type = "sine"; o2.type = "sine";
        o.frequency.value = freq; o2.frequency.value = freq * 2.005;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.13, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.5));
        o.connect(g); o2.connect(g); g.connect(c.destination);
        o.start(t); o2.start(t);
        o.stop(t + (dur || 0.5) + 0.02); o2.stop(t + (dur || 0.5) + 0.02);
      } catch (e) {}
    }
    var echoOsc = null, echoGain = null, echoLfo = null;
    function echoStart(freq) {
      var c = audio(); if (!c) return;
      try {
        var t = c.currentTime;
        echoOsc = c.createOscillator();
        echoGain = c.createGain();
        echoLfo = c.createOscillator();
        var lfoGain = c.createGain();
        echoOsc.type = "sine"; echoOsc.frequency.value = freq;
        echoLfo.type = "sine"; echoLfo.frequency.value = 5.5; lfoGain.gain.value = 4;
        echoLfo.connect(lfoGain); lfoGain.connect(echoOsc.frequency);
        echoGain.gain.setValueAtTime(0.0001, t);
        echoGain.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
        echoOsc.connect(echoGain); echoGain.connect(c.destination);
        echoOsc.start(t); echoLfo.start(t);
      } catch (e) {}
    }
    function echoStop() {
      var c = audio(); if (!c || !echoOsc) return;
      try {
        var t = c.currentTime;
        echoGain.gain.cancelScheduledValues(t);
        echoGain.gain.setValueAtTime(echoGain.gain.value, t);
        echoGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        echoOsc.stop(t + 0.28); echoLfo.stop(t + 0.28);
      } catch (e) {}
      echoOsc = null; echoGain = null; echoLfo = null;
    }
    function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

    /* ---------- build beads ---------- */
    PEOPLE.forEach(function (p, i) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "car-bead";
      btn.setAttribute("aria-label", p.name + " — " + p.sym);
      btn.dataset.i = i;
      btn.innerHTML =
        '<span class="car-bead-inner">' +
          '<img class="car-bead-glow" src="' + ASSET_BASE + 'beads/' + p.symbol + '_glow.png" alt="" aria-hidden="true">' +
          '<img class="car-bead-img" src="' + ASSET_BASE + 'beads/' + p.symbol + '.png" alt="">' +
        '</span>';
      li.appendChild(btn);
      track.appendChild(li);
      beads.push(btn);
    });

    // waveform ring (echo) + ripple holder live on the stage
    var wave = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    wave.setAttribute("class", "car-wave");
    wave.setAttribute("viewBox", "0 0 100 100");
    wave.setAttribute("aria-hidden", "true");
    wave.innerHTML = '<circle cx="50" cy="50" r="46" stroke-dasharray="6 10"></circle>';
    stage.appendChild(wave);

    /* ---------- dots ---------- */
    PEOPLE.forEach(function (p, i) {
      var d = document.createElement("button");
      d.type = "button";
      d.className = "car-dot";
      d.setAttribute("role", "tab");
      d.setAttribute("aria-label", p.name);
      d.addEventListener("click", function () { go(i); });
      dotsWrap.appendChild(d);
    });
    var dots = Array.prototype.slice.call(dotsWrap.children);

    /* ---------- spacing tied to bead size so they sit close, like the app ---------- */
    function spacingPx() {
      var bw = (beads[index] && beads[index].offsetWidth) || 108;
      return bw * 0.84;
    }

    /* ---------- layout: position beads around the focused index (wraps around) ---------- */
    function layout() {
      var n = beads.length;
      var spacing = spacingPx();
      beads.forEach(function (b, i) {
        var off = i - index;
        // shortest circular distance, so the ring loops instead of getting stuck
        if (off >  n / 2) off -= n;
        if (off < -n / 2) off += n;
        var abs = Math.abs(off);
        var x = off * spacing;
        var y = Math.min(abs, 3) * 9;                                   // very gentle arc
        var scale = off === 0 ? 1 : Math.max(0.46, 0.74 - (abs - 1) * 0.13);
        var op = off === 0 ? 1 : Math.max(0, 0.6 - (abs - 1) * 0.22);   // far beads fade out
        b.style.setProperty("--car-x", x.toFixed(1) + "px");
        b.style.setProperty("--car-y", y.toFixed(1) + "px");
        b.style.setProperty("--car-scale", scale);
        b.style.setProperty("--car-op", op);
        b.style.zIndex = String(30 - abs);                             // focused on top, near neighbours above far ones
        b.classList.toggle("is-focused", off === 0);
        b.tabIndex = off === 0 ? 0 : -1;
        b.style.setProperty("--car-presence-color", glowOverride[i]);
      });
    }

    /* ---------- render the focused identity / meaning ---------- */
    function render() {
      var p = PEOPLE[index];
      var color = glowOverride[index];
      var presence = glowPresence[index];

      function paint() {
        if (elAvatar) { elAvatar.src = ASSET_BASE + "avatars/" + p.avatar + ".png"; elAvatar.alt = p.name; }
        elName.textContent = p.name;
        elSym.textContent = p.sym;
        elMeaning.textContent = p.meaning;
        elPhrase.textContent = p.phrase;
        elPresLbl.textContent = presence;
        elPresDot.style.setProperty("--car-presence-color", color);
        focusGlow.style.setProperty("--car-presence-color", color);
        wave.style.setProperty("--car-presence-color", color);
        section.style.setProperty("--car-presence-color", color);
      }

      if (reduce) { paint(); }
      else {
        wrap.classList.add("car-fading");
        setTimeout(function () { paint(); wrap.classList.remove("car-fading"); }, 200);
      }

      dots.forEach(function (d, i) {
        d.classList.toggle("is-active", i === index);
        d.setAttribute("aria-selected", i === index ? "true" : "false");
      });
    }

    function go(i) {
      index = (i + PEOPLE.length) % PEOPLE.length;
      layout();
      render();
    }

    /* ---------- bead click: focus it, or act if already focused ---------- */
    beads.forEach(function (b, i) {
      b.addEventListener("click", function () {
        if (i === index) pulse();        // tapping the focused bead = pulse
        else go(i);
      });
    });

    /* ---------- PULSE ---------- */
    function pulse() {
      var color = glowOverride[index];
      bell(528, 0.5, 0.12);
      buzz(18);
      if (!reduce) {
        var r = document.createElement("span");
        r.className = "car-ripple";
        r.style.setProperty("--car-presence-color", color);
        stage.appendChild(r);
        // reflow then animate
        void r.offsetWidth;
        r.classList.add("is-go");
        setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 850);
        var fb = beads[index];
        fb.classList.remove("is-popping"); void fb.offsetWidth; fb.classList.add("is-popping");
        setTimeout(function () { fb.classList.remove("is-popping"); }, 440);
      }
    }

    /* ---------- ECHO (press & hold) ---------- */
    var echoing = false;
    function echoBegin(e) {
      if (echoing) return;
      if (e && e.cancelable) e.preventDefault();
      echoing = true;
      btnEcho.classList.add("is-active");
      beads[index].classList.add("is-echoing");
      wave.classList.add("is-on");
      buzz(12);
      echoStart(392); // soft G4
    }
    function echoEnd() {
      if (!echoing) return;
      echoing = false;
      btnEcho.classList.remove("is-active");
      beads[index].classList.remove("is-echoing");
      wave.classList.remove("is-on");
      echoStop();
      bell(659, 0.4, 0.1); // a gentle resolve on release
    }
    btnEcho.addEventListener("mousedown", echoBegin);
    btnEcho.addEventListener("touchstart", echoBegin, { passive:false });
    ["mouseup","mouseleave","touchend","touchcancel"].forEach(function (ev) {
      btnEcho.addEventListener(ev, echoEnd);
    });
    // keyboard: hold Space/Enter on the Echo button
    btnEcho.addEventListener("keydown", function (e) {
      if ((e.key === " " || e.key === "Enter") && !echoing) { e.preventDefault(); echoBegin(); }
    });
    btnEcho.addEventListener("keyup", function (e) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); echoEnd(); }
    });
    window.addEventListener("blur", echoEnd);

    /* press & hold the focused bead itself also echoes */
    var holdTimer = null;
    function beadHoldStart(e) {
      var b = e.currentTarget;
      if (+b.dataset.i !== index) return;
      holdTimer = setTimeout(function () { echoBegin(); }, 280);
    }
    function beadHoldEnd() {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (echoing) echoEnd();
    }
    beads.forEach(function (b) {
      b.addEventListener("mousedown", beadHoldStart);
      b.addEventListener("touchstart", beadHoldStart, { passive:true });
      ["mouseup","mouseleave","touchend","touchcancel"].forEach(function (ev) {
        b.addEventListener(ev, beadHoldEnd);
      });
    });

    /* ---------- PULSE button ---------- */
    btnPulse.addEventListener("click", function () { pulse(); });

    /* ---------- GLOW (cycle presence colours) ---------- */
    btnGlow.addEventListener("click", function () {
      var cur = glowPresence[index];
      var curIdx = PRESENCES.map(function (x) { return x.presence; }).indexOf(cur);
      var next = PRESENCES[(curIdx + 1) % PRESENCES.length];
      glowOverride[index] = next.color;
      glowPresence[index] = next.presence;
      bell(440 + (curIdx * 22), 0.45, 0.1);
      buzz(10);
      layout();
      render();
      btnGlow.classList.add("is-active");
      setTimeout(function () { btnGlow.classList.remove("is-active"); }, 260);
    });

    /* presence pill also cycles colour */
    elPresBtn.addEventListener("click", function () { btnGlow.click(); });

    /* ---------- keyboard arrows on the stage ---------- */
    stage.setAttribute("tabindex", "0");
    stage.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
    });

    /* ---------- drag / swipe ---------- */
    var dragX = 0, dragging = false, startIndex = 0;
    function ptDown(x) { dragging = true; dragX = x; startIndex = index; }
    function ptMove(x) {
      if (!dragging) return;
      var spacing = spacingPx();
      var moved = (x - dragX);
      var steps = Math.round(-moved / spacing);
      var n = PEOPLE.length;
      var target = ((startIndex + steps) % n + n) % n;   // wrap around
      if (target !== index) { index = target; layout(); render(); }
    }
    function ptUp() { dragging = false; }

    stage.addEventListener("mousedown", function (e) { ptDown(e.clientX); });
    window.addEventListener("mousemove", function (e) { if (dragging) ptMove(e.clientX); });
    window.addEventListener("mouseup", ptUp);
    stage.addEventListener("touchstart", function (e) { ptDown(e.touches[0].clientX); }, { passive:true });
    stage.addEventListener("touchmove", function (e) { ptMove(e.touches[0].clientX); }, { passive:true });
    stage.addEventListener("touchend", ptUp);

    /* ---------- responsive relayout ---------- */
    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt); rt = setTimeout(layout, 120);
    });

    /* ---------- go ---------- */
    layout();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
