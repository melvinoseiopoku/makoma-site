/* ============================================================
   M'AKOMA — "Where we live"  (prefix: wl-)
   Scroll / IntersectionObserver-driven 2D -> 3D positioning stage.
   Self-contained IIFE. Reduced motion -> jump to 3D end-state.
   ============================================================ */
(function () {
  "use strict";

  function init() {
    var section = document.getElementById("position");
    if (!section) return;

    var stage = section.querySelector(".wl-stage");
    var plane = section.querySelector(".wl-plane");
    var axis  = section.querySelector(".wl-axis");
    var nodes = Array.prototype.slice.call(section.querySelectorAll(".wl-node"));
    var steps = Array.prototype.slice.call(section.querySelectorAll(".wl-step"));
    if (!stage || !plane) return;

    var reduce = window.matchMedia &&
                 window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Per-stage geometry. tilt = plane rotateX; liftScale maps a node's
    // data-lift (0..100) into translateZ pixels (presence height).
    var STAGES = {
      1: { tilt: 0,  liftScale: 0.0,  axis: 0   },   // flat top-down map
      2: { tilt: 56, liftScale: 2.4,  axis: 300 },   // tilt + presence axis (lift is now SCREEN px, no perspective blow-up)
      3: { tilt: 56, liftScale: 2.4,  axis: 300 }    // beads vs hub focus
    };

    // place each node's x/y on the plane (percent), cache its lift
    nodes.forEach(function (n) {
      var x = parseFloat(n.getAttribute("data-x")) || 50;
      var y = parseFloat(n.getAttribute("data-y")) || 50;
      n.style.setProperty("--nx", x + "%");
      n.style.setProperty("--ny", y + "%");
      n.dataset.liftVal = parseFloat(n.getAttribute("data-lift")) || 0;
      // tag flat ones for the stage-3 recede
      if (n.getAttribute("data-kind") === "flat") n.classList.add("wl-node--flat");
    });

    var current = 0;

    function apply(stageNum) {
      if (stageNum === current) return;
      current = stageNum;
      var cfg = STAGES[stageNum];

      stage.setAttribute("data-stage", String(stageNum));
      plane.style.setProperty("--tilt", cfg.tilt + "deg");
      if (axis) axis.style.setProperty("--axis", cfg.axis + "px");

      nodes.forEach(function (n) {
        var lift = stageNum === 1 ? 0 : (n.dataset.liftVal * cfg.liftScale);
        n.style.setProperty("--lift", lift.toFixed(1) + "px");
      });

      steps.forEach(function (s) {
        var on = parseInt(s.getAttribute("data-go"), 10) === stageNum;
        s.classList.toggle("is-on", on);
        s.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    // ---- reduced motion: straight to the rich 3D end state, no autoplay ----
    if (reduce) {
      apply(3);
      // still let the step controls work (instant, no transition)
      steps.forEach(function (s) {
        s.addEventListener("click", function () {
          apply(parseInt(s.getAttribute("data-go"), 10));
        });
      });
      return;
    }

    apply(1);

    // ---- manual scrub via the step controls (also a11y tabs) ----
    steps.forEach(function (s) {
      s.addEventListener("click", function () {
        userTook = true;            // hand control to the user
        apply(parseInt(s.getAttribute("data-go"), 10));
      });
    });

    var userTook = false;
    var autoTimer = null;
    var seen = false;

    // ---- subtle autoplay: when first revealed, walk 1 -> 2 -> 3 ----
    function autoplay() {
      if (userTook || current !== 1) return;   // if scroll already moved us on, don't yank it back
      apply(2);
      autoTimer = window.setTimeout(function () {
        if (userTook) return;
        apply(3);
      }, 1600);
    }

    // ---- scroll-driven tween: map the section's progress through the
    //      viewport onto stages 1/2/3, so scrolling controls the reveal.
    //      Autoplay is a fallback if the user lands without scrolling. ----
    var ticking = false;
    function onScroll() {
      if (userTook || ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        var r = section.getBoundingClientRect();
        var vh = window.innerHeight || 800;
        // progress 0..1 as the section travels from entering to centered/past
        var p = 1 - (r.top + r.height * 0.35) / vh;
        p = Math.max(0, Math.min(1, p));
        if (p < 0.58)      apply(1);
        else if (p < 0.82) apply(2);
        else               apply(3);
      });
    }

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && !seen) {
            seen = true;
            // hold on the flat 2D map a long beat so it's unmistakably seen first;
            // scrolling can project sooner if the user chooses to
            autoTimer = window.setTimeout(autoplay, 4500);
            window.addEventListener("scroll", onScroll, { passive: true });
          }
        });
      }, { threshold: 0.35 });
      io.observe(section);
    } else {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    // keyboard: left/right arrows scrub stages when a step is focused
    section.addEventListener("keydown", function (ev) {
      if (ev.target && ev.target.classList.contains("wl-step")) {
        if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
          ev.preventDefault();
          userTook = true;
          var next = current + (ev.key === "ArrowRight" ? 1 : -1);
          next = Math.max(1, Math.min(3, next));
          apply(next);
          var btn = section.querySelector('.wl-step[data-go="' + next + '"]');
          if (btn) btn.focus();
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
