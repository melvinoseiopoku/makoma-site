/* First-run coach for the interactive "circle" cluster.
   Learn-by-doing: a halo lands on a REAL bead and the step only advances once the visitor actually performs the
   gesture (hero3d.js calls done('tap'|'hold'|'drag') when a Pulse/Echo/Turn fires). Terse copy, a Skip to bail.
   hero3d.js feeds gather progress via setGather(g) and the target bead's screen position via setTarget(x,y,r). */
(function () {
  const coach = document.getElementById("coach");
  if (!coach) return;
  const halo    = document.getElementById("coachHalo");
  const titleEl = document.getElementById("coachTitle");
  const hintEl  = document.getElementById("coachHint");
  const dotsEl  = document.getElementById("coachDots");
  const skipBtn = document.getElementById("coachSkip");
  const checkEl = document.getElementById("coachCheck");
  const KEY = "makoma_coach_v2";
  const MAX_OFFERS = 2;

  const STEPS = [
    { g: "tap",  title: "Tap a bead",   hint: "sends a pulse" },
    { g: "hold", title: "Hold a bead",  hint: "sends an echo" },
    { g: "drag", title: "Drag to turn", hint: "choose who" },
  ];

  let seen = false;
  try { seen = localStorage.getItem(KEY) === "1"; } catch (e) {}
  let shown = false, step = 0, offers = 0, advancing = false, hideT = 0;

  STEPS.forEach(() => { const d = document.createElement("span"); d.className = "coach-dot"; dotsEl.appendChild(d); });
  const dots = Array.prototype.slice.call(dotsEl.children);

  function render() {
    const s = STEPS[step];
    titleEl.textContent = s.title;
    hintEl.textContent = s.hint;
    halo.className = "coach-halo is-" + s.g;
    dots.forEach((d, i) => d.classList.toggle("on", i < step));   // fill dots for completed steps
    dots[step] && dots[step].classList.add("current");
    dots.forEach((d, i) => d.classList.toggle("current", i === step));
  }
  function markSeen() { seen = true; try { localStorage.setItem(KEY, "1"); } catch (e) {} }

  function show() {
    if (shown || seen) return;
    shown = true; step = 0; advancing = false;
    window.__coach.needTarget = true;
    clearTimeout(hideT);
    coach.hidden = false;
    void coach.offsetWidth;
    coach.classList.add("on");
    document.body.classList.add("coach-on");
    render();
  }
  function hide(done) {
    if (!shown) return;
    shown = false; window.__coach.needTarget = false;
    coach.classList.remove("on", "is-done");
    document.body.classList.remove("coach-on");
    if (done) markSeen();
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (!shown) coach.hidden = true; }, 420);
  }

  // a real gesture just fired — if it matches the current step, celebrate briefly and advance (or finish)
  function done(gesture) {
    if (!shown || advancing || gesture !== STEPS[step].g) return;
    advancing = true;
    dots[step] && dots[step].classList.add("on");
    coach.classList.add("is-done");                          // flashes the ✓ + settles the halo
    setTimeout(() => {
      coach.classList.remove("is-done");
      if (step < STEPS.length - 1) { step++; render(); advancing = false; }
      else hide(true);                                       // all three done → dismiss for good
    }, 760);
  }

  skipBtn.addEventListener("click", () => hide(true));
  document.addEventListener("keydown", (e) => { if (shown && e.key === "Escape") hide(true); });

  window.__coach = {
    needTarget: false,
    setGather(g) {
      if (g >= 0.985) { if (!seen && !shown) { if (offers < MAX_OFFERS) { offers++; show(); } else markSeen(); } }
      else if (g < 0.8 && shown) hide(false);                // scrolled away undecided → offer again on return
    },
    setTarget(x, y, r) {
      if (!shown) return;
      halo.style.left = x + "px";
      halo.style.top = y + "px";
      halo.style.setProperty("--r", Math.max(26, r) + "px");
    },
    done: done,
  };
})();
