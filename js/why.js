/* Why M'AKOMA — phone-of-noise → five pinned people → beads.
   Drives #whyStage through data-phase 1..5 once it scrolls into view; CSS does the rest.
   Reduced-motion / no-IO: jump straight to the end state (the beads). */
(function () {
  var stage = document.getElementById("whyStage");
  if (!stage) return;

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  if (reduce || !("IntersectionObserver" in window)) { stage.setAttribute("data-phase", "5"); return; }

  // phase, delay(ms) from the moment it enters view
  var SEQ = [[1, 350], [2, 2700], [3, 3500], [4, 4600], [5, 5650]];
  var played = false;
  function play() {
    if (played) return; played = true;
    SEQ.forEach(function (s) { setTimeout(function () { stage.setAttribute("data-phase", String(s[0])); }, s[1]); });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { play(); io.disconnect(); } });
  }, { threshold: 0.45 });
  io.observe(stage);
})();
