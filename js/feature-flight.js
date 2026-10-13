/* ============================================================
   M'AKOMA — feature flight (Melvin, 2026-10-13)
   ------------------------------------------------------------
   One gold icon racing through the air, no frame: speed streaks rush past, a smeared,
   blurred tail stretches behind it, and the "air" never stops working on the shape (the
   trailing side flutters and is dragged back, the nose is pushed in, the whole icon bobs and
   tilts into the wind). Every HOLD ms the drag spikes and pulls the outline into the next
   feature: voice -> pulse -> alert -> color -> shortcuts -> notes.

   The morph: each icon is up to three strokes sampled to N points along their length, paired
   longest-to-longest; loops are cut where the next line begins (or opened where the line
   begins) so outlines unroll instead of knotting; a stroke the next icon lacks melts onto its
   outline, a new one grows out of the old outline.

   Markup (any page):
     <div class="fm"><button class="fm-ic"><svg viewBox="0 0 240 90" ...></svg></button><p class="fm-name"></p></div>
     <p class="fx-cap"></p>
     <div class="fm-dots"><button class="fm-dot"></button> x6</div>
   The caption and dots are found in the .fm element's parent. Tap the icon = next, a dot = jump.
   Real-delta clock; stops off screen or in a hidden tab; reduced motion = a still icon that
   swaps on tap.
   ============================================================ */
(function () {
  "use strict";
  var F = [
    { n: "Voice", c: "Hold a bead, speak, then tap to send your voice.", d: ["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M5.5 11a6.5 6.5 0 0 0 13 0", "M12 17.5V21"] },
    { n: "Pulse", c: "Touch a bead. Their bracelet lights up.", d: ["M3 12h4l2.2-5.5 4.4 11 2.2-5.5H21"] },
    { n: "Alert", c: "Double-tap the hub to alert your trusted circle.", d: ["M6 16v-5a6 6 0 1 1 12 0v5l1.6 2H4.4z", "M10 20.5a2 2 0 0 0 4 0"] },
    { n: "Color", c: "Your color, glowing on their wrist.", d: ["M12 3s6.2 6.6 6.2 11.1a6.2 6.2 0 0 1-12.4 0C5.8 9.6 12 3 12 3z"] },
    { n: "Shortcuts", c: "Set up phone shortcuts in the M’AKOMA app.", d: ["M9.6 2.5h4.8a2.6 2.6 0 0 1 2.6 2.6v13.8a2.6 2.6 0 0 1-2.6 2.6H9.6A2.6 2.6 0 0 1 7 18.9V5.1a2.6 2.6 0 0 1 2.6-2.6z", "M11 18.6h2"] },
    { n: "Notes", c: "Save personal voice notes.", d: ["M4 5.5h16v10.5H9.5L4 20z", "M8.5 9.5h7", "M8.5 12.5h4.5"] }
  ];
  var K = 3, N = 72, HOLD = 1900, MORPH = 900, W = 240, H = 90, CX = 120, CY = 45, SC = 2.45;
  var NEAR = 4, FAR = 5, STEP = 2, NSTREAK = 14;
  var ICON_W = 3.4, TRAIL_W = 4.6;            // px (non-scaling): a heavy icon, a broad soft tail
  var NS = "http://www.w3.org/2000/svg", uid = 0;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function d2(a, b) { var x = a[0] - b[0], y = a[1] - b[1]; return x * x + y * y; }
  function loopFrom(p, start) { var M = N - 1, o = []; for (var i = 0; i < M; i++) o.push(p[(i + start) % M]); o.push(o[0]); return o; }
  function nearestIdx(p, q, M) { var b = 0, bd = Infinity; for (var i = 0; i < M; i++) { var d = d2(p[i], q); if (d < bd) { bd = d; b = i; } } return b; }
  function pair(fromP, fromClosed, to) {   // -> [A, B]: the same strokes, point orders that travel least
    var M = N - 1, cands = [], i;
    if (fromClosed && to.closed) {
      var best = null, bestD = Infinity, Bo = to.p.slice(0, M);
      [Bo, Bo.slice().reverse()].forEach(function (C) {
        for (var rot = 0; rot < M; rot++) { var d = 0; for (var j = 0; j < M; j += 3) d += d2(fromP[j], C[(j + rot) % M]); if (d < bestD) { bestD = d; best = { C: C, rot: rot }; } }
      });
      var out = []; for (var k = 0; k < M; k++) out.push(best.C[(k + best.rot) % M]); out.push(out[0]); return [fromP, out];
    }
    if (fromClosed) {
      [to.p, to.p.slice().reverse()].forEach(function (T) {
        var c = nearestIdx(fromP, T[0], M);
        [loopFrom(fromP, c), loopFrom(fromP.slice(0, M).reverse().concat([fromP[M - 1]]), M - 1 - c)].forEach(function (L) { var d = 0; for (i = 0; i < N; i += 2) d += d2(L[i], T[i]); cands.push({ d: d, A: L, B: T }); });
      });
    } else if (to.closed) {
      [fromP, fromP.slice().reverse()].forEach(function (F0) {
        var c = nearestIdx(to.p, F0[0], M);
        [loopFrom(to.p, c), loopFrom(to.p.slice(0, M).reverse().concat([to.p[M - 1]]), M - 1 - c)].forEach(function (L) { var d = 0; for (i = 0; i < N; i += 2) d += d2(F0[i], L[i]); cands.push({ d: d, A: F0, B: L }); });
      });
    } else {
      var f = 0, r = 0; for (i = 0; i < N; i++) { f += d2(fromP[i], to.p[i]); r += d2(fromP[i], to.p[N - 1 - i]); }
      return [fromP, r < f ? to.p.slice().reverse() : to.p];
    }
    cands.sort(function (x, y) { return x.d - y.d; }); return [cands[0].A, cands[0].B];
  }
  function onto(pts, line) { return pts.map(function (q) { var b = line[0], bd = Infinity; for (var i = 0; i < line.length; i++) { var d = d2(q, line[i]); if (d < bd) { bd = d; b = line[i]; } } return [b[0], b[1]]; }); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function polyStr(p) { var s = "M" + p[0][0].toFixed(2) + " " + p[0][1].toFixed(2); for (var i = 1; i < p.length; i++) s += "L" + p[i][0].toFixed(2) + " " + p[i][1].toFixed(2); return s; }

  var sampled = false;
  function sampleAll(svg) {   // once per page: needs a live <svg> for getPointAtLength
    if (sampled) return; sampled = true;
    var probe = el("path", { visibility: "hidden" }, svg);
    F.forEach(function (f) {
      var s = f.d.map(function (d) {
        probe.setAttribute("d", d);
        var L = probe.getTotalLength(), p = [];
        for (var i = 0; i < N; i++) { var q = probe.getPointAtLength(L * i / (N - 1)); p.push([q.x, q.y]); }
        return { p: p, L: L, closed: /z\s*$/i.test(d), real: true };
      }).sort(function (a, b) { return b.L - a.L; });
      while (s.length < K) { var c = []; for (var i = 0; i < N; i++) c.push([12, 12]); s.push({ p: c, L: 0, closed: false, real: false }); }
      f.s = s;
    });
    svg.removeChild(probe);
  }

  function init(root) {
    var scope = root.parentNode, svg = root.querySelector("svg"), btn = root.querySelector(".fm-ic"), nameEl = root.querySelector(".fm-name"),
        cap = scope.querySelector(".fx-cap"), dots = [].slice.call(scope.querySelectorAll(".fm-dot"));
    if (!svg || !btn) return;
    sampleAll(svg);
    var id = "fm" + (++uid);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var defs = el("defs", {}, svg);
    var grad = el("linearGradient", { id: id + "g", x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
    [[0, 0], [0.2, 1], [0.8, 1], [1, 0]].forEach(function (s) { el("stop", { offset: s[0], "stop-color": "#fff", "stop-opacity": s[1] }, grad); });
    var mask = el("mask", { id: id + "m", maskUnits: "userSpaceOnUse", x: -40, y: -40, width: W + 80, height: H + 80 }, defs);
    el("rect", { x: -40, y: -40, width: W + 80, height: H + 80, fill: "url(#" + id + "g)" }, mask);
    // the tail: two blur strengths, mostly sideways (motion blur), the far end softer
    var fNear = el("filter", { id: id + "bn", x: "-60%", y: "-80%", width: "220%", height: "260%" }, defs);
    el("feGaussianBlur", { stdDeviation: "3.2 1.1" }, fNear);
    var fFar = el("filter", { id: id + "bf", x: "-80%", y: "-100%", width: "260%", height: "300%" }, defs);
    el("feGaussianBlur", { stdDeviation: "7.5 2.2" }, fFar);
    var gStreaks = el("g", { mask: "url(#" + id + "m)", "stroke-width": 1 }, svg);
    var gTrail = el("g", { mask: "url(#" + id + "m)" }, svg);
    var gFar = el("g", { filter: "url(#" + id + "bf)" }, gTrail), gNear = el("g", { filter: "url(#" + id + "bn)" }, gTrail);
    var gIcon = el("g", {}, svg);
    var strokes = [], ghosts = [];
    for (var k0 = 0; k0 < K; k0++) strokes.push(el("path", { "vector-effect": "non-scaling-stroke", "stroke-width": ICON_W }, gIcon));
    for (var j = 0; j < NEAR + FAR; j++) {   // j = 0 is right behind the icon
      var parent = j < NEAR ? gNear : gFar, gg = el("g", { opacity: (0.62 * Math.pow(0.8, j)).toFixed(3) }, null), gp = [];
      parent.insertBefore(gg, parent.firstChild);   // farther ghosts painted first
      for (var k1 = 0; k1 < K; k1++) gp.push(el("path", { "vector-effect": "non-scaling-stroke", "stroke-width": TRAIL_W }, gg));
      ghosts.push({ g: gg, p: gp });
    }

    var cur = 0, base = F[0].s.map(function (s) { return s.p.slice(); }), closedNow = F[0].s.map(function (s) { return s.closed; }),
        op = F[0].s.map(function (s) { return s.real ? 1 : 0; }), mFrom = null, mTo = null, opFrom = null, opTo = null, next = 0,
        mStart = -1, holdStart = 0, swapped = true, raf = 0, last = 0, clock = 0, running = false, inView = true, hist = [];
    function label(i) {
      if (nameEl) nameEl.textContent = F[i].n;
      if (cap) { cap.classList.remove("is-in"); void cap.offsetWidth; cap.textContent = F[i].c; cap.classList.add("is-in"); }
      dots.forEach(function (d, k) { d.classList.toggle("is-on", k === i); if (k === i) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
    }
    function begin(to) {
      if (to === next && mStart >= 0) return;
      if (to === cur && mStart < 0) return;
      var T = F[to], from = base.map(function (p) { return p.slice(); }), target = [];
      opFrom = op.slice(); opTo = T.s.map(function (s) { return s.real ? 1 : 0; });
      var m = pair(from[0], closedNow[0], T.s[0]); from[0] = m[0]; target[0] = m[1];
      for (var k = 1; k < K; k++) {
        var wasOn = opFrom[k] > 0.01, isOn = T.s[k].real;
        if (wasOn && isOn) { var pr = pair(from[k], closedNow[k], T.s[k]); from[k] = pr[0]; target[k] = pr[1]; }
        else if (wasOn) target[k] = onto(from[k], target[0]);                         // melts into the new outline
        else if (isOn) { target[k] = T.s[k].p; from[k] = onto(T.s[k].p, from[0]); }  // grows out of the old outline
        else target[k] = from[k];
      }
      mFrom = from; mTo = target; next = to; mStart = clock; swapped = false;
      if (still) { finish(); render(0, 0); }
    }
    function finish() {
      cur = next; base = F[cur].s.map(function (s) { return s.p.slice(); }); closedNow = F[cur].s.map(function (s) { return s.closed; });
      op = opTo.slice(); mStart = -1; holdStart = clock; if (!swapped) { label(cur); swapped = true; }
    }
    var streaks = [];
    function seed(s, anywhere) { s.len = 8 + Math.random() * 46; s.y = 6 + Math.random() * (H - 12); s.x = anywhere ? Math.random() * (W + 60) : W + Math.random() * 80; s.v = 260 + Math.random() * 420; s.o = 0.12 + Math.random() * 0.32; }
    if (!still) for (var si = 0; si < NSTREAK; si++) { var s0 = { line: el("line", { "vector-effect": "non-scaling-stroke" }, gStreaks) }; seed(s0, true); streaks.push(s0); }
    function tf(x, y, rot, sx, sy) { return "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ") rotate(" + rot.toFixed(2) + ") scale(" + sx.toFixed(3) + " " + sy.toFixed(3) + ") translate(-12 -12)"; }
    function render(t, dt) {
      var mp = mStart >= 0 ? Math.min(1, (clock - mStart) / MORPH) : 0, e = ease(mp), boost = Math.sin(Math.PI * mp), shape = [], k;
      for (k = 0; k < K; k++) {
        var p;
        if (mStart >= 0) { var a = mFrom[k], b = mTo[k]; p = []; for (var i = 0; i < N; i++) p.push([a[i][0] + (b[i][0] - a[i][0]) * e, a[i][1] + (b[i][1] - a[i][1]) * e]); op[k] = opFrom[k] + (opTo[k] - opFrom[k]) * e; base[k] = p; }
        else p = base[k];
        shape.push(p);
      }
      var drag = still ? 0 : 0.2 + 0.09 * Math.sin(t * 3.1) + 0.85 * boost, flut = still ? 0 : 0.4 + 1.6 * boost;
      var minx = Infinity, maxx = -Infinity;
      shape.forEach(function (p, kk) { if (op[kk] > 0.01) p.forEach(function (q) { if (q[0] < minx) minx = q[0]; if (q[0] > maxx) maxx = q[0]; }); });
      var span = Math.max(4, maxx - minx), ds = [];
      for (k = 0; k < K; k++) {
        ds.push(polyStr(shape[k].map(function (q) {
          if (still) return q;
          var u = (q[0] - minx) / span, tr = 1 - u;
          return [q[0] - drag * tr * tr * 7.5 + drag * u * u * 1.1 + 0.15 * Math.sin(t * 9.3 + q[1] * 0.8),
                  q[1] + flut * tr * Math.sin(t * 15 + q[0] * 0.55 + q[1] * 0.2) * 0.7 + 0.14 * Math.sin(t * 11.7 + q[0] * 0.7)];
        })));
      }
      var bx = still ? 0 : 5 * Math.sin(t * 1.6) + 2 * Math.sin(t * 4.3), by = still ? 0 : 3 * Math.sin(t * 2.2 + 1), rot = still ? 0 : -4 * drag - 2.5 * Math.sin(t * 1.3);
      gIcon.setAttribute("transform", tf(CX + bx, CY + by, rot, SC, SC));
      for (k = 0; k < K; k++) { strokes[k].setAttribute("d", ds[k]); strokes[k].style.opacity = op[k].toFixed(3); }
      if (still) { ghosts.forEach(function (gh) { gh.g.style.display = "none"; }); return; }
      hist.push({ ds: ds, op: op.slice(), bx: bx, by: by, rot: rot }); if (hist.length > (NEAR + FAR) * STEP + 1) hist.shift();
      ghosts.forEach(function (gh, j) {
        var h = hist[Math.max(0, hist.length - 1 - (j + 1) * STEP)], n = j + 1,
            back = n * (4.2 + 7 * boost) + n * n * 0.35,              // the tail lengthens with speed
            sx = SC * (1 + 0.07 * n + 0.12 * boost * n / 3), sy = SC * (1 - 0.035 * n);   // smeared along the flight, squashed across it
        gh.g.setAttribute("transform", tf(CX + h.bx - back, CY + h.by, h.rot, sx, sy));
        for (var kk = 0; kk < K; kk++) { gh.p[kk].setAttribute("d", h.ds[kk]); gh.p[kk].style.opacity = h.op[kk].toFixed(3); }
      });
      var sp = 1 + 1.8 * boost;
      streaks.forEach(function (s) {
        s.x -= s.v * sp * dt; if (s.x + s.len < -10) seed(s, false);
        s.line.setAttribute("x1", s.x.toFixed(1)); s.line.setAttribute("x2", (s.x + s.len * (1 + boost)).toFixed(1));
        s.line.setAttribute("y1", s.y.toFixed(1)); s.line.setAttribute("y2", s.y.toFixed(1)); s.line.style.opacity = s.o.toFixed(2);
      });
    }
    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; clock += dt * 1000;
      if (mStart >= 0) { if (!swapped && clock - mStart >= MORPH * 0.5) { label(next); swapped = true; } if (clock - mStart >= MORPH) finish(); }
      else if (clock - holdStart >= HOLD) begin((cur + 1) % F.length);
      render(clock / 1000, dt);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running || still || !inView || document.hidden) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    btn.addEventListener("click", function () { begin(((mStart >= 0 ? next : cur) + 1) % F.length); });
    dots.forEach(function (d, k) { d.addEventListener("click", function () { begin(k); }); });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) start(); else stop(); }).observe(root);
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    label(0); render(0, 0); start();
  }

  function boot() { [].forEach.call(document.querySelectorAll(".fm"), init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
