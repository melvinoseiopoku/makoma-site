/* Why M'AKOMA → The Circle, merged.
   Scroll-driven: as #circle (a tall sticky section) scrolls, the phone goes notifications →
   Messages → the five pinned avatars peel off ONE-BY-ONE and fly to the EXACT position+size of
   the real carousel beads, cross-fading into them; then the phone fades and the existing
   (untouched) carousel takes over, interactive. carousel.js is not modified — we just read its
   bead rects to land the avatars precisely, hide its beads during the intro, and reveal at handoff.
   Reduced-motion / no-scroll: jump straight to the carousel. window.__cp(p) drives it for testing. */
(function () {
  var section = document.getElementById("circle");
  if (!section || !section.classList.contains("circle-merge")) return;
  var stage = document.getElementById("whyStage");
  if (!stage) return;

  var people  = [].slice.call(stage.querySelectorAll(".wp-person"));
  var wpPeople = stage.querySelector(".wp-people");

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  section.classList.add("circle-anim");

  function carBeads() { return [].slice.call(section.querySelectorAll("#car-track .car-bead")); }

  // pin a departing avatar onto its matching carousel bead's exact centre + size, so the cross-fade is seamless
  function placeOnBead(el, bead) {
    if (!bead || !wpPeople) return false;
    var pr = wpPeople.getBoundingClientRect(), br = bead.getBoundingClientRect();
    if (!br.width) return false;
    el.style.left   = (br.left + br.width / 2 - pr.left) + "px";
    el.style.top    = (br.top + br.height / 2 - pr.top) + "px";
    el.style.width  = br.width + "px";
    el.style.height = br.width + "px";
    return true;
  }
  function clearPlace(el) { el.style.left = el.style.top = el.style.width = el.style.height = ""; }

  function apply(prog) {
    prog = prog < 0 ? 0 : prog > 1 ? 1 : prog;

    // lock + notifications → swipe away → Messages
    var phase = prog < 0.04 ? 0 : prog < 0.18 ? 1 : prog < 0.30 ? 2 : 3;
    stage.setAttribute("data-phase", String(phase));
    stage.classList.toggle("cap-b", prog >= 0.34);

    // single-file peel: each avatar departs as progress passes its own slice, landing on its carousel bead
    var beads = carBeads();
    var PEEL_A = 0.36, PEEL_B = 0.74, n = people.length;
    for (var i = 0; i < n; i++) {
      var thresh = PEEL_A + (PEEL_B - PEEL_A) * (i + 0.65) / n;
      var dep = prog >= thresh;
      people[i].classList.toggle("departed", dep);
      if (dep) placeOnBead(people[i], beads[i]); else clearPlace(people[i]);
    }

    // once the beads have formed, fade the device; then hand off to the interactive carousel beneath them
    stage.classList.toggle("phone-out", prog >= 0.70);
    section.classList.toggle("is-handoff", prog >= 0.80);
  }

  function onScroll() {
    var rect = section.getBoundingClientRect();
    var total = section.offsetHeight - window.innerHeight;
    apply(total > 0 ? (-rect.top / total) : 0);
  }

  window.__cp = apply;   // test hook: drive progress directly without scrolling

  if (reduce) { apply(1); return; }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  // first pass once the carousel has built its beads (carousel.js inits on DOMContentLoaded)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onScroll);
  onScroll();
})();
