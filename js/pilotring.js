/* ============================================================
   Founder Pilot — the circle as the real bead carousel.
   The same ring the home page turns (main.js's CSS ellipse, upgraded to the WebGL
   bracelet by beadring3d.js), trimmed to one job: show N live beads, fade the rest,
   and carry a badge above each bead. Interaction (drag, arrow keys, tap-to-turn) is
   the home page's, so the two never drift apart.
   ============================================================ */
(function () {
  var SYMS = ["sankofa", "aya", "nsoroma", "gye_nyame", "nkyinkyim", "akoma"];
  var EXT  = { sankofa: "webp", aya: "webp", nsoroma: "webp", gye_nyame: "webp", nkyinkyim: "webp", akoma: "png" };
  var FILL = ["akoma_ntoaso", "nkonsonkonson"];
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function mount(strap, live, opts) {
    opts = opts || {};
    var slots = [];
    for (var i = 0; i < SYMS.length; i++) {
      var s = document.createElement("span"); s.className = "bx-slot"; s.dataset.i = String(i);
      s.innerHTML = '<button class="bx-tagbtn" type="button" aria-label="Bead ' + (i + 1) + '"><span class="bx-tg">+</span></button>' +
        '<button class="bx-bead" type="button" aria-label="Bead ' + (i + 1) + '"><span class="bx-orb">' +
        '<img class="bx-base" src="assets/beads/' + SYMS[i] + "." + EXT[SYMS[i]] + '" alt="" width="256" height="256">' +
        '<img class="bx-lit" src="assets/beads/' + SYMS[i] + "_glow." + EXT[SYMS[i]] + '" alt="" width="256" height="256"></span></button>';
      strap.appendChild(s); slots.push(s);
    }
    var ring = { off: 0, target: 0, drag: false, id: null, x0: 0, o0: 0, moved: 0, raf: 0, eat: false, N: slots.length, focusTarget: null };
    var STEP = (Math.PI * 2) / slots.length, ring3d = false;

    function stationOf(i) { return ring.focusTarget ? ring.focusTarget(i) : i; }
    function clamp(t) {                                // turning stops at the circle's own beads
      var a = stationOf(0), b = stationOf(live - 1), lo = Math.min(a, b), hi = Math.max(a, b);
      return Math.max(lo, Math.min(hi, t));
    }
    var labels = [];                                  // per-bead assignment text for screen readers
    function personName(i) { return i === 0 ? "You" : "Person " + (i + 1); }
    function relabel(i) {
      var s = slots[i], off = i >= live, b = s.querySelector(".bx-bead"), t = s.querySelector(".bx-tagbtn");
      var text = personName(i) + (labels[i] ? ", " + labels[i] : ", no country yet");
      b.setAttribute("aria-label", text); t.setAttribute("aria-label", "Country for " + text);
      b.tabIndex = off ? -1 : 0; t.tabIndex = off ? -1 : 0;
      s.setAttribute("aria-hidden", off ? "true" : "false");
    }
    function setLive(n) {
      live = Math.max(1, Math.min(slots.length, n));
      slots.forEach(function (s, i) { s.classList.toggle("is-off", i >= live); relabel(i); });
      ringTo(clamp(Math.round(ring.target)));
    }
    function layout() {
      if (ring3d) return;
      var w = strap.clientWidth || 1, h = strap.clientHeight || 1, slotW = slots[0].offsetWidth || 96;
      var Rx = Math.min(slotW * 1.28, w * 0.42), Ry = Math.max(16, Math.min(slotW * 0.34, h * 0.22));
      var frontIdx = -1, frontCos = -2;
      for (var i = 0; i < slots.length; i++) {
        var a = (i - ring.off) * STEP, c = Math.cos(a), sn = Math.sin(a), st = slots[i].style;
        st.setProperty("--bx-x", (Rx * sn).toFixed(1) + "px"); st.setProperty("--bx-y", (Ry * c).toFixed(1) + "px");
        st.setProperty("--bx-s", (0.52 + 0.48 * (0.5 + 0.5 * c)).toFixed(3)); st.setProperty("--bx-o", (0.22 + 0.78 * Math.max(0, 0.5 + 0.5 * c)).toFixed(3));
        st.setProperty("--bx-z", String(Math.round(100 + c * 100)));
        if (c > frontCos) { frontCos = c; frontIdx = i; }
      }
      slots.forEach(function (s, j) { s.setAttribute("data-front", j === frontIdx ? "1" : "0"); });
      var svg = strap.querySelector(".bx-cord"), path = svg && svg.querySelector("path");
      if (svg && path) { svg.setAttribute("viewBox", "0 0 " + w + " " + h); var cx = w / 2, cy = h / 2;
        path.setAttribute("d", "M " + (cx - Rx) + " " + cy + " a " + Rx + " " + Ry + " 0 1 0 " + (2 * Rx) + " 0 a " + Rx + " " + Ry + " 0 1 0 " + (-2 * Rx) + " 0"); }
      onFront(frontIdx);
    }
    var lastFront = -1;
    function onFront(i) {
      if (i === lastFront) return; lastFront = i;
      slots.forEach(function (s, j) { var b = s.querySelector(".bx-bead"); if (j === i) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
      if (opts.onFront) opts.onFront(i);
    }
    // a turn the USER started (drag, arrow key, tap on a side bead) cancels any programmatic one
    function userTurn() { if (opts.onUserTurn) opts.onUserTurn(); }
    function settle() {
      cancelAnimationFrame(ring.raf);
      var tick = function () { var d = ring.target - ring.off; if (Math.abs(d) < 0.0008) { ring.off = ring.target; layout(); return; } ring.off += d * 0.18; layout(); ring.raf = requestAnimationFrame(tick); };
      ring.raf = requestAnimationFrame(tick);
    }
    function ringTo(n) { ring.target = clamp(n); if (reduce) { ring.off = ring.target; layout(); } else settle(); }
    function ringBy(d) { ringTo(Math.round(ring.target) + d); }
    function focus(i) { if (i >= live) return; ringTo(stationOf(i)); }
    function userFocus(i) { userTurn(); focus(i); }

    strap.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".bx-tagbtn")) return;
      userTurn();
      ring.drag = true; ring.id = e.pointerId; ring.x0 = e.clientX; ring.o0 = ring.off; ring.moved = 0; ring.eat = false;
      strap.classList.add("is-drag"); cancelAnimationFrame(ring.raf);
      try { strap.setPointerCapture(e.pointerId); } catch (_) {}
    });
    strap.addEventListener("pointermove", function (e) {
      if (!ring.drag || e.pointerId !== ring.id) return;
      var dx = e.clientX - ring.x0; ring.moved = Math.max(ring.moved, Math.abs(dx));
      ring.off = clamp(ring.o0 + dx / ((strap.clientWidth || 300) * 0.30)); layout();
    });
    var end = function (e) {
      if (!ring.drag || (e.pointerId != null && e.pointerId !== ring.id)) return;
      ring.drag = false; strap.classList.remove("is-drag");
      try { strap.releasePointerCapture(ring.id); } catch (_) {}
      ring.eat = ring.moved > 6; if (ring.moved > 6) ringTo(Math.round(ring.off));
    };
    strap.addEventListener("pointerup", end); strap.addEventListener("pointercancel", end);
    strap.addEventListener("click", function (e) { if (ring.eat) { ring.eat = false; e.preventDefault(); e.stopPropagation(); } }, true);
    strap.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); userTurn(); ringBy(ring3d ? -1 : 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); userTurn(); ringBy(ring3d ? 1 : -1); }
    });
    slots.forEach(function (s, i) { s.addEventListener("click", function () { if (!ring3d && s.getAttribute("data-front") !== "1") userFocus(i); }); });

    setLive(live); layout();
    addEventListener("resize", layout, { passive: true });

    // the real bracelet, if WebGL and the models load; the CSS ring stays otherwise
    var canGL = (function () { try { var c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } })();
    if (canGL && !reduce) {
      strap.classList.add("bx-upgrading");
      var saved = { N: ring.N, focusTarget: ring.focusTarget, off: ring.off, target: ring.target };
      import("./beadring3d.js?v=2").then(function (m) {
        return m.initBeadRing3D({ strap: strap, slots: slots, ring: ring, onFront: onFront, focus: userFocus,
          wasDrag: function () { return ring.moved > 6; }, models: SYMS, fillers: FILL, isOff: function (i) { return i >= live; } });
      }).then(function () { ring3d = true; strap.classList.remove("bx-upgrading"); ringTo(stationOf(0)); window.dispatchEvent(new Event("resize")); })
        .catch(function (e) {
          // the initializer rewrites the station mapping before the models load; undo all of it
          console.warn("[pilotring] staying on the CSS ring:", e);
          ring.N = saved.N; ring.focusTarget = saved.focusTarget; ring.off = saved.off; ring.target = saved.target; ring3d = false;
          var gl = strap.querySelector("canvas.bx-gl"); if (gl) gl.remove();
          strap.classList.remove("bx-upgrading", "bx-3d"); layout();
        });
    }

    return {
      focus: focus, setLive: setLive,
      setBadge: function (i, text, label) { var s = slots[i]; if (!s) return; s.querySelector(".bx-tg").textContent = text || "+"; s.classList.toggle("is-set", !!text); labels[i] = label || ""; relabel(i); },
      front: function () { return lastFront; },
      is3d: function () { return ring3d; },
      state: function () { return { off: +ring.off.toFixed(3), target: ring.target, live: live, has3d: ring3d, ft: ring.focusTarget ? ring.focusTarget(0) : null }; }
    };
  }
  window.PilotRing = { mount: mount };
})();
