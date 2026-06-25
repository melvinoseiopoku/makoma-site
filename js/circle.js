/* Why M'AKOMA → The Circle, merged. AUTOPLAY on scroll-into-view.
   When #circle enters the viewport the sequence plays on a timeline: phone notifications →
   Messages → the five pinned avatars peel off ONE-BY-ONE and fly to the EXACT position+size of
   the real carousel beads, cross-fading into them; then the phone fades and the existing
   (untouched) carousel takes over, interactive. carousel.js is not modified — we just read its
   bead rects to land the avatars precisely, hide its beads during the intro, and reveal at handoff.
   Reduced-motion: jump straight to the carousel. window.__cp(p) drives progress for testing. */
(function () {
  var section = document.getElementById("circle");
  if (!section || !section.classList.contains("circle-merge")) return;
  var stage = document.getElementById("whyStage");
  if (!stage) return;

  var people   = [].slice.call(stage.querySelectorAll(".wp-person"));
  var wpPeople = stage.querySelector(".wp-people");

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  section.classList.add("circle-anim");

  function carBeads() { return [].slice.call(section.querySelectorAll("#car-track .car-bead")); }

  // pin a departing avatar onto its matching carousel bead's exact centre + size, for a seamless cross-fade
  function placeOnBead(el, bead) {
    if (!bead || !wpPeople) return;
    var pr = wpPeople.getBoundingClientRect(), br = bead.getBoundingClientRect();
    if (!br.width) return;
    el.style.left   = (br.left + br.width / 2 - pr.left) + "px";
    el.style.top    = (br.top + br.height / 2 - pr.top) + "px";
    el.style.width  = br.width + "px";
    el.style.height = br.width + "px";
  }
  function clearPlace(el) { el.style.left = el.style.top = el.style.width = el.style.height = ""; }

  function apply(prog) {
    prog = prog < 0 ? 0 : prog > 1 ? 1 : prog;
    var phase = prog < 0.04 ? 0 : prog < 0.18 ? 1 : prog < 0.30 ? 2 : 3;   // lock+notifs → swipe → Messages
    stage.setAttribute("data-phase", String(phase));
    stage.classList.toggle("cap-b", prog >= 0.34);

    var beads = carBeads();
    var PEEL_A = 0.36, PEEL_B = 0.74, n = people.length;
    for (var i = 0; i < n; i++) {
      var thresh = PEEL_A + (PEEL_B - PEEL_A) * (i + 0.65) / n;   // each avatar departs one after the other
      var dep = prog >= thresh;
      people[i].classList.toggle("departed", dep);
      if (dep) placeOnBead(people[i], beads[i]); else clearPlace(people[i]);
    }

    stage.classList.toggle("phone-out", prog >= 0.70);    // device fades once the beads have formed
    section.classList.toggle("is-handoff", prog >= 0.80); // then hand off to the interactive carousel beneath
  }

  window.__cp = apply;   // test hook

  if (reduce) { apply(1); return; }   // skip the animation; show the carousel

  // autoplay: interpolate progress over a timeline of [timeMs, progress] keyframes
  var KEYS = [[0,0],[300,0.03],[700,0.11],[2300,0.17],[3000,0.29],[3500,0.35],[4100,0.40],[6400,0.74],[7000,0.82],[7800,1]];
  var DUR = KEYS[KEYS.length - 1][0];
  function progAt(t) {
    if (t <= 0) return 0; if (t >= DUR) return 1;
    for (var i = 1; i < KEYS.length; i++) {
      if (t <= KEYS[i][0]) { var a = KEYS[i-1], b = KEYS[i]; return a[1] + (b[1]-a[1]) * (t-a[0]) / (b[0]-a[0]); }
    }
    return 1;
  }
  var played = false, startT = 0, raf = 0;
  function frame(now) {
    if (!startT) startT = now;
    var t = now - startT;
    apply(progAt(t));
    if (t < DUR) raf = requestAnimationFrame(frame);
  }
  function play() { if (played) return; played = true; startT = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }

  apply(0);   // start state (phone, notifications hidden) before it scrolls in
  if (!("IntersectionObserver" in window)) { play(); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { play(); io.disconnect(); } });
  }, { threshold: 0.4 });
  io.observe(section);
})();
