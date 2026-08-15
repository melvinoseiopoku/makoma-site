/* ============================================================
   M'AKOMA — interactive layer
   ============================================================ */
(function () {
  "use strict";
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const PATHS = window.ADINKRA_PATHS || {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- the eight beads: symbol, meaning, glow color, a sample person, a charm note ---- */
  const BEADS = [
    { key:"sankofa",       person:"Maya",       name:"Sankofa",       lit:"Return & retrieve",
      meaning:"It is not wrong to go back for what you have forgotten.",
      proverb:"“Se wo were fi na wosankofa a yenkyi.”", color:"#a78bfa", note:523.25 },
    { key:"nkonsonkonson", person:"The group",  name:"Nkonsonkonson", lit:"Linked together",
      meaning:"Unity and human bonds — we are chained together in life and in death.",
      proverb:"One link is weak; together, unbreakable.", color:"#5fd3e0", note:659.25 },
    { key:"akoma_ntoaso",  person:"Amara",      name:"Akoma Ntoaso",  lit:"Linked hearts",
      meaning:"Two hearts joined — agreement, partnership, an enduring bond.",
      proverb:"Hearts bound together beat as one.", color:"#ecb07a", note:440.00 },
    { key:"akoma",         person:"Mum",        name:"Akoma",         lit:"The heart",
      meaning:"Patience, love and the readiness to forgive — the seat of feeling.",
      proverb:"“Nya akoma” — take heart.", color:"#e8c57a", note:392.00 },
    { key:"gye_nyame",     person:"Nana",       name:"Gye Nyame",     lit:"Except God",
      meaning:"Awe at what is greater than us — the supremacy of the divine.",
      proverb:"None has seen its beginning; none will see its end.", color:"#f1e9d2", note:880.00 },
    { key:"aya",           person:"Kwame",      name:"Aya",           lit:"The fern",
      meaning:"Endurance and resourcefulness — I have grown through hard ground.",
      proverb:"The fern thrives where others cannot.", color:"#6fcf97", note:783.99 },
    { key:"nsoroma",       person:"Kojo",       name:"Nsoroma",       lit:"Child of the heavens",
      meaning:"A star — hope, and a light to steer by in the dark.",
      proverb:"I shine, guided by a light above.", color:"#f4d58d", note:587.33 },
    { key:"nkyinkyim",     person:"Adwoa",      name:"Nkyinkyim",     lit:"The winding path",
      meaning:"Life twists and turns — adaptability, devotion, resilience.",
      proverb:"The road bends, and so do the wise.", color:"#6aa6ff", note:1046.50 },
  ];

  const PRESENCE = ["#e8c57a","#f59e0b","#2dd4bf","#3b82f6","#34d399","#a78bfa","#ef4444"];

  /* build an inline <svg> for a glyph key, colored with --g */
  function glyphSVG(key) {
    const g = PATHS[key];
    if (!g) return "";
    const paths = g.paths.map(d => `<path d="${d}"/>`).join("");
    return `<svg viewBox="${g.viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paths}</svg>`;
  }

  /* ------------------------------------------------------------------
     Web Audio — gentle bell "charm" so the bracelet can be heard
  ------------------------------------------------------------------ */
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function charm(freq, kind) {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    const master = ac.createGain();
    master.connect(ac.destination);
    master.gain.value = 0.0001;
    const dur = kind === "pulse" ? 0.5 : 1.6;
    // two partials = a warm bell
    [[1, 0.5], [2.01, 0.22], [2.99, 0.12]].forEach(([mult, amp]) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = kind === "pulse" ? "triangle" : "sine";
      o.frequency.value = freq * mult;
      g.gain.value = amp;
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.1);
    });
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(kind === "pulse" ? 0.18 : 0.28, t + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function buzz(ms) { if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }

  /* ------------------------------------------------------------------
     Build the interactive bracelet (hub centered, 4 beads each side)
  ------------------------------------------------------------------ */
  const bracelet = $("#bracelet");
  const hub = $("#hub");
  let selected = null;

  function buildBracelet() {
    if (!bracelet) return;
    const beadEls = BEADS.map((b, i) => {
      const el = document.createElement("button");
      el.className = "bead";
      el.style.setProperty("--g", b.color);
      el.setAttribute("aria-label", `${b.person} — ${b.name}`);
      el.dataset.i = i;
      el.innerHTML = `<span class="halo"></span><span class="ring-pulse"></span><span class="glyph">${glyphSVG(b.key)}</span>`;
      el.addEventListener("click", () => selectBead(i, el));
      el.addEventListener("mouseenter", () => el.classList.add("lit"));
      el.addEventListener("mouseleave", () => { if (!el.classList.contains("selected")) el.classList.remove("lit"); });
      return el;
    });
    const frag = document.createDocumentFragment();
    beadEls.slice(0, 4).forEach(e => frag.appendChild(e));
    frag.appendChild(hub);
    beadEls.slice(4).forEach(e => frag.appendChild(e));
    bracelet.appendChild(frag);

    hub.addEventListener("click", () => {
      hub.classList.remove("pinging"); void hub.offsetWidth; hub.classList.add("pinging");
      charm(330, "pulse"); buzz(30);
    });
  }

  /* bead detail panel */
  const panel = { wrap:$("#beadPanel"), glyph:$("#bpGlyph"), person:$("#bpPerson"),
    symbol:$("#bpSymbol"), meaning:$("#bpMeaning"), proverb:$("#bpProverb") };

  function selectBead(i, el) {
    const b = BEADS[i];
    selected = i;
    $$(".bead", bracelet).forEach(x => x.classList.remove("selected", "lit"));
    el.classList.add("selected", "lit");
    // pulse animation
    el.classList.remove("pulsing"); void el.offsetWidth; el.classList.add("pulsing");
    charm(b.note, "echo"); buzz([18, 40, 18]);

    // fill panel
    panel.person.textContent = b.person;
    panel.symbol.textContent = b.name;
    panel.meaning.textContent = b.meaning;
    panel.proverb.textContent = b.proverb;
    panel.glyph.innerHTML = glyphSVG(b.key);
    panel.glyph.style.setProperty("--g", b.color);
    $$("path", panel.glyph).forEach(p => {
      p.style.fill = b.color;
      p.style.filter = `drop-shadow(0 0 4px ${b.color}) drop-shadow(0 0 14px ${b.color})`;
    });
    panel.wrap.style.borderColor = "color-mix(in srgb, " + b.color + " 40%, transparent)";
    panel.wrap.style.boxShadow = `0 30px 90px -50px ${b.color}, 0 30px 80px -40px #000`;
    const hint = $("#braceletHint");
    if (hint) hint.textContent = `${b.person} · ${b.name} — ${b.lit}`;
  }

  /* panel actions: Echo / Pulse / Glow */
  let glowIdx = 0;
  $$("#bpActions .act").forEach(btn => {
    btn.addEventListener("click", () => {
      if (selected == null) return;
      const b = BEADS[selected];
      const el = $$(".bead", bracelet)[/* find by data-i */ [...$$(".bead", bracelet)].findIndex(x => +x.dataset.i === selected)];
      const beadEl = $$(".bead", bracelet).find(x => +x.dataset.i === selected);
      const act = btn.dataset.act;
      if (!beadEl) return;
      beadEl.classList.add("lit");
      beadEl.classList.remove("pulsing"); void beadEl.offsetWidth; beadEl.classList.add("pulsing");
      if (act === "echo")  { charm(b.note, "echo");  buzz([20, 60, 20, 60, 120]); }
      if (act === "pulse") { charm(b.note * 1.5, "pulse"); buzz(60); }
      if (act === "glow")  {
        glowIdx = (glowIdx + 1) % PRESENCE.length;
        const c = PRESENCE[glowIdx];
        beadEl.style.setProperty("--g", c);
        charm(b.note, "pulse"); buzz(25);
      }
    });
  });

  /* ------------------------------------------------------------------
     Symbol gallery
  ------------------------------------------------------------------ */
  function buildSymbols() {
    const grid = $("#symbolGrid"); if (!grid) return;
    grid.innerHTML = BEADS.map(b => `
      <div class="sym-card reveal" style="--g:${b.color}">
        <div class="sym-ico">${glyphSVG(b.key)}</div>
        <div class="sym-name">${b.name}</div>
        <div class="sym-lit">${b.lit}</div>
        <div class="sym-desc">${b.meaning}</div>
      </div>`).join("");
    $$(".sym-ico path", grid).forEach(p => { /* color set via --g in CSS */ });
    observeReveals(grid);
  }

  /* ------------------------------------------------------------------
     How-it-works micro demos
  ------------------------------------------------------------------ */
  function wavePath(amp) {
    const pts = [];
    for (let x = 0; x <= 200; x += 8) {
      const env = Math.sin((x / 200) * Math.PI);
      const y = 30 + (Math.sin(x * 0.5) * 22 * amp * env) * (0.5 + Math.random() * 0.5);
      pts.push(`${x},${y.toFixed(1)}`);
    }
    return "M" + pts.join(" L");
  }
  function setupHow() {
    // Echo — hold to record (animated waveform)
    const echoCard = $('[data-demo="echo"]');
    const echoBtn  = $('[data-hold="echo"]');
    const waveSvg  = echoCard && $(".wave", echoCard);
    if (waveSvg) waveSvg.innerHTML = `<path d="${wavePath(0.25)}"/>`;
    let recTimer = null;
    const startRec = (e) => {
      e && e.preventDefault();
      echoCard.classList.add("recording");
      audio(); charm(523.25, "echo");
      recTimer = setInterval(() => { waveSvg.firstChild.setAttribute("d", wavePath(1)); }, 120);
    };
    const stopRec = () => {
      if (!recTimer) return;
      clearInterval(recTimer); recTimer = null;
      echoCard.classList.remove("recording");
      waveSvg.firstChild.setAttribute("d", wavePath(0.25));
    };
    if (echoBtn) {
      ["mousedown", "touchstart"].forEach(ev => echoBtn.addEventListener(ev, startRec, { passive:false }));
      ["mouseup", "mouseleave", "touchend"].forEach(ev => echoBtn.addEventListener(ev, stopRec));
    }

    // Pulse — tap ripple
    const pulseCard = $('[data-demo="pulse"]');
    const pulseBtn  = $('[data-tap="pulse"]');
    if (pulseBtn) pulseBtn.addEventListener("click", () => {
      pulseCard.classList.remove("tapped"); void pulseCard.offsetWidth; pulseCard.classList.add("tapped");
      charm(440, "pulse"); buzz(50);
    });

    // Glow — cycle presence colors
    const glowCard = $('[data-demo="glow"]');
    const glowBtn  = $('[data-cycle="glow"]');
    const glowBead = glowCard && $(".glow-bead", glowCard);
    let gi = 0;
    if (glowBead) glowBead.style.setProperty("--gc", PRESENCE[0]);
    if (glowBtn) glowBtn.addEventListener("click", () => {
      gi = (gi + 1) % PRESENCE.length;
      glowBead.style.setProperty("--gc", PRESENCE[gi]);
      charm(660, "pulse");
    });
  }


  /* ------------------------------------------------------------------
     Stat counters
  ------------------------------------------------------------------ */
  function runCounters(scope) {
    $$(".stat-num", scope).forEach(el => {
      if (el.dataset.done) return;
      el.dataset.done = "1";
      const to = +el.dataset.to, pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
      const dur = 1400; const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = pre + Math.round(to * e) + suf;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ------------------------------------------------------------------
     Reveal on scroll + section-specific triggers
  ------------------------------------------------------------------ */
  let io;
  function observeReveals(root = document) {
    if (reduce) { $$(".reveal", root).forEach(el => el.classList.add("in")); return; }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          en.target.classList.add("in");
          if (en.target.id === "stats" || en.target.querySelector?.(".stat-num")) runCounters(en.target);
          io.unobserve(en.target);
        });
      }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    }
    $$(".reveal", root).forEach(el => io.observe(el));
    const stats = $("#stats"); if (stats) io.observe(stats);
  }

  // stagger refusals
  function staggerRefusals() {
    $$("#refusals li").forEach((li, i) => li.style.setProperty("--i", i));
  }

  /* ------------------------------------------------------------------
     Nav, cursor glow, parallax
  ------------------------------------------------------------------ */
  // Building in public — the evidence strip. The build film autoplays muted while in
  // view (paused off-screen; never autoplayed under reduced motion), and the sound pill
  // unmutes the bench audio — the whole point of an ASMR cut.
  function setupBip() {
    const vid = $("#bipVideo"), btn = $("#bipSound");
    if (!vid) return;
    if (!reduce && "IntersectionObserver" in window) {
      new IntersectionObserver((es) => {
        es.forEach((en) => { if (en.isIntersecting) vid.play().catch(() => {}); else vid.pause(); });
      }, { threshold: 0.35 }).observe(vid);
    }
    vid.addEventListener("click", () => { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); });
    if (btn) btn.addEventListener("click", (e) => {
      e.stopPropagation();
      vid.muted = !vid.muted;
      const on = !vid.muted;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "Sound off" : "Sound on";
      btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
      if (on && vid.paused) vid.play().catch(() => {});
    });
  }

  function setupChrome() {
    const nav = $("#nav");

    // mobile menu (hamburger) — accessible: aria-expanded, close on link/Escape/outside
    const burger = $("#navBurger"), navLinks = $("#navLinks");
    if (nav && burger) {
      const setMenu = (open) => {
        nav.classList.toggle("menu-open", open);
        burger.setAttribute("aria-expanded", open ? "true" : "false");
        burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      };
      burger.addEventListener("click", (e) => { e.stopPropagation(); setMenu(!nav.classList.contains("menu-open")); });
      if (navLinks) navLinks.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
      document.addEventListener("click", (e) => { if (nav.classList.contains("menu-open") && !nav.contains(e.target)) setMenu(false); });
    }
    // Nav anchors jump INSTANTLY via JS. The CSS smooth scroll dies on phones: the same tap
    // wakes the deferred 3D hero, the main thread disappears under module + GLB work, and iOS
    // abandons the animated scroll at ~0px — which read as "the menu does nothing".
    if (nav) {
      nav.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a) return;
        const target = document.getElementById(a.getAttribute("href").slice(1));
        if (!target) return;
        e.preventDefault();
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: "instant" });   // "auto" defers to the CSS smooth-behavior — "instant" is the hard jump
        try { history.replaceState(history.state, "", a.getAttribute("href")); } catch (err) {}
      });
    }

    const onScroll = () => {
      if (nav) nav.classList.toggle("scrolled", window.scrollY > 40);
      // hero parallax
      const hero = $("#heroImg");
      if (hero && !reduce) {
        const y = window.scrollY;
        if (y < window.innerHeight) hero.style.transform = `translateY(${y * 0.18}px) scale(1.05)`;
      }
    };
    window.addEventListener("scroll", onScroll, { passive:true });
    onScroll();

    if (!reduce && window.matchMedia("(pointer:fine)").matches) {
      const glow = $("#cursorGlow");
      window.addEventListener("mousemove", (e) => {
        glow.style.opacity = "1";
        glow.style.left = e.clientX + "px";
        glow.style.top  = e.clientY + "px";
      });
    }

    // smooth anchor + nudge AudioContext alive on first gesture
    window.addEventListener("pointerdown", () => audio(), { once:true });
  }

  /* ------------------------------------------------------------------
     Join form — waitlist capture (wired for Buttondown)

     ▶ TO GO LIVE: create a Buttondown account, then drop your username into
       the URL below (replace YOUR_USERNAME). Signups then land in your
       Buttondown subscriber list and you can broadcast to the whole circle
       at launch. By default Buttondown sends a confirmation email (double
       opt-in) — that's why the success copy says "watch your inbox".
         const JOIN_ENDPOINT = "https://buttondown.com/api/emails/embed-subscribe/makoma";

     Buttondown's embed endpoint is a cross-origin form target, not a CORS/JSON
     API — a normal fetch() can't read its reply — so Buttondown URLs are
     auto-detected and POSTed in no-cors mode (a completed request counts as
     success). Any other provider whose endpoint accepts a POST with an `email`
     field still works (Formspree: https://formspree.io/f/ID, ConvertKit, …);
     those are posted as FormData and their HTTP status is checked.

     Until JOIN_ENDPOINT is set, submissions are saved in the visitor's browser
     (localStorage key "makoma_waitlist") so nothing is lost while testing.
  ------------------------------------------------------------------ */
  const JOIN_ENDPOINT = "https://buttondown.com/api/emails/embed-subscribe/makoma";

  /* The designer's save step joins the SAME list with the SAME design metadata — one
     subscribe path, two doors. `extra` carries fields the visitor typed about THEMSELVES
     (their own name, source) — freely given here; the six people's names still never leave. */
  window.MAKOMA_JOIN = async function (emailValue, extra) {
    const v = String(emailValue || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { ok: false, reason: "email" };
    // store any traced artwork FIRST, so toMetadata() reports its key instead of
    // "unsent". Never rejects, so a storage outage cannot cost someone their signup.
    if (window.MAKOMA_DESIGN && window.MAKOMA_DESIGN.flushUploads) {
      try { await window.MAKOMA_DESIGN.flushUploads(); } catch (_) {}
    }
    const design = (window.MAKOMA_DESIGN && window.MAKOMA_DESIGN.toMetadata()) || null;
    try {
      const k = "makoma_waitlist";
      const list = JSON.parse(localStorage.getItem(k) || "[]");
      list.push({ email: v, extra: extra || null, design, at: new Date().toISOString() });
      localStorage.setItem(k, JSON.stringify(list));
    } catch (_) {}
    if (!JOIN_ENDPOINT) return { ok: true };
    try {
      const params = new URLSearchParams();
      params.append("email", v);
      params.append("embed", "1");
      params.append("tag", "designer");
      if (extra) Object.keys(extra).forEach((k2) => { if (extra[k2]) params.append("metadata__" + k2, String(extra[k2]).slice(0, 120)); });
      if (design) Object.keys(design).forEach((k2) => params.append("metadata__" + k2, design[k2]));
      await fetch(JOIN_ENDPOINT, { method: "POST", mode: "no-cors", body: params });
      return { ok: true };
    } catch (err) { return { ok: false, reason: "network" }; }
  };

  function setupForm() {
    const form = $("#joinForm"), status = $("#joinStatus"),
          email = $("#joinEmail"), submit = $("#joinSubmit"), sugg = $("#joinSuggestion");
    if (!form) return;

    // the For me / As a gift chooser is gone from the form; nothing downstream may assume it
    const intent = () => "self";

    const say = (msg, isError) => {
      status.textContent = msg;
      status.classList.toggle("is-error", !!isError);
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = (email.value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
        say("A real email, please — your circle is waiting.", true);
        email.focus();
        return;
      }
      const giving = false;
      const sug = ((sugg && sugg.value) || "").trim();

      // The bracelet they designed in the box. toMetadata() is the ONLY path from the
      // design store to the network and it deliberately never reads the five names —
      // those are personal data about third parties who never visited this site.
      // What ships is the manufacturing signal: shell colourway, symbols, lights, and
      // cfg=custom|default so colour votes can be counted over real choices only.
      // store any traced artwork FIRST, so toMetadata() reports its key instead of
      // "unsent". Never rejects, so a storage outage cannot cost someone their signup.
      if (window.MAKOMA_DESIGN && window.MAKOMA_DESIGN.flushUploads) {
        try { await window.MAKOMA_DESIGN.flushUploads(); } catch (_) {}
      }
      const design = (window.MAKOMA_DESIGN && window.MAKOMA_DESIGN.toMetadata()) || null;

      // always keep a local copy so a submission is never silently lost
      try {
        const k = "makoma_waitlist";
        const list = JSON.parse(localStorage.getItem(k) || "[]");
        list.push({ email: v, intent: intent(), suggestion: sug, design: design, at: new Date().toISOString() });
        localStorage.setItem(k, JSON.stringify(list));
      } catch (_) {}

      const done = () => {
        say(sug
          ? "You’re in — and thank you, I’ve read your note. Founding pricing and ship dates go to the circle first."
          : giving
          ? "Beautiful — you’re in. We’ll be in touch about making it a gift; founding pricing and dates go to the circle first."
          : "You’re in. Founding pricing and ship dates go to the circle first — watch your inbox.");
        email.value = ""; if (sugg) sugg.value = "";
      };

      if (!JOIN_ENDPOINT) { done(); return; } // placeholder mode — no backend wired yet

      const isButtondown = /buttondown\.(com|email)/i.test(JOIN_ENDPOINT);
      const label = submit.textContent;
      submit.disabled = true; submit.textContent = "Reserving…";
      say("Reserving your spot…");
      try {
        if (isButtondown) {
          // cross-origin form target → no-cors POST; the reply is opaque, so a
          // completed request is treated as success (localStorage above is the backup)
          const params = new URLSearchParams();
          params.append("email", v);
          params.append("embed", "1");
          params.append("tag", giving ? "gift" : "self");   // segment the list in Buttondown
          params.append("metadata__intent", intent());
          if (sug) params.append("metadata__suggestion", sug);   // design feedback → subscriber metadata in Buttondown
          if (design) {                                          // the bracelet they built (never their names)
            Object.keys(design).forEach((k) => params.append("metadata__" + k, design[k]));
          }
          await fetch(JOIN_ENDPOINT, { method: "POST", mode: "no-cors", body: params });
          done();
        } else {
          const body = new FormData();
          body.append("email", v);
          body.append("intent", intent());
          if (sug) body.append("suggestion", sug);
          // mirror the design here too, so swapping email providers never silently
          // drops the manufacturing signal
          if (design) Object.keys(design).forEach((k) => body.append(k, design[k]));
          const res = await fetch(JOIN_ENDPOINT, { method: "POST", body, headers: { Accept: "application/json" } });
          if (!res.ok) throw new Error("HTTP " + res.status);
          done();
        }
      } catch (err) {
        say("Hmm — that didn’t go through. Mind trying again in a moment?", true);
      } finally {
        submit.disabled = false; submit.textContent = label;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------
     Logo trace — the M'AKOMA mark draws itself as you scroll into the
     closing section (stroke-dashoffset tied to scroll progress).
  ------------------------------------------------------------------ */
  function setupLogoTrace() {
    const svg = $("#logoTrace"); if (!svg) return;
    const section = $("#join"); if (!section) return;
    const draws = $$(".lt-draw", svg);
    const fills = $$(".lt-fill", svg);
    const lens = draws.map(p => {
      let L = 1000; try { L = p.getTotalLength(); } catch (e) {}
      p.style.strokeDasharray = L;
      p.style.strokeDashoffset = L;
      return L;
    });
    if (reduce) {
      draws.forEach(p => { p.style.strokeDashoffset = 0; });
      fills.forEach(f => { f.style.opacity = 1; });
      return;
    }
    const upd = () => {
      const r = section.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      // begin drawing only once the logo has risen into the upper part of the viewport
      let p = (vh * 0.38 - r.top) / (vh * 0.40);
      p = Math.max(0, Math.min(1, p));
      draws.forEach((path, i) => { path.style.strokeDashoffset = (lens[i] * (1 - p)).toFixed(1); });
      const fo = Math.max(0, Math.min(1, (p - 0.62) / 0.3));   // beads/knot fade in near the end
      fills.forEach(f => { f.style.opacity = fo.toFixed(2); });
    };
    window.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    upd();
  }

  /* light / dark toggle (initial theme is set by an inline <head> script) */
  function setupTheme() {
    const btn = $("#themeToggle"); if (!btn) return;
    btn.addEventListener("click", () => {
      const root = document.documentElement;
      const toLight = root.getAttribute("data-theme") !== "light";
      root.setAttribute("data-theme", toLight ? "light" : "dark");
      try { localStorage.setItem("makoma-theme", toLight ? "light" : "dark"); } catch (e) {}
    });
  }

  function init() {
    // v2: the bead ring, how-it-works demos, symbol gallery and positioning map
    // were merged into the carousel (carousel.js) and the 2D→3D viz (positioning.js).
    staggerRefusals();
    observeReveals();
    setupChrome();
    setupBip();
    setupForm();
    setupLogoTrace();
    setupTheme();
  }

  // fill panel without sound on initial load
  function fillPanelOnly(i) {
    const b = BEADS[i];
    panel.person.textContent = b.person; panel.symbol.textContent = b.name;
    panel.meaning.textContent = b.meaning; panel.proverb.textContent = b.proverb;
    panel.glyph.innerHTML = glyphSVG(b.key); panel.glyph.style.setProperty("--g", b.color);
    $$("path", panel.glyph).forEach(p => { p.style.fill = b.color; p.style.filter = `drop-shadow(0 0 4px ${b.color}) drop-shadow(0 0 14px ${b.color})`; });
    panel.wrap.style.borderColor = "color-mix(in srgb, " + b.color + " 40%, transparent)";
    selected = i;
  }

  function buildHeroOrbsParallax() {
    if (reduce) return;
    const orbs = $$(".orb");
    window.addEventListener("mousemove", (e) => {
      const cx = (e.clientX / window.innerWidth - .5);
      const cy = (e.clientY / window.innerHeight - .5);
      orbs.forEach((o, i) => {
        const f = (i + 1) * 14;
        o.style.transform = `translate(${cx * f}px, ${cy * f}px)`;
      });
    }, { passive:true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* --------------------------------------------------------------------------
   WHAT ELSE — the bead-as-button rig.

   The first build made you pick a bead and THEN pick an action, with no signpost
   for the second step — which read as nothing happening. So the primary action is
   now a single click: every bead already holds a job, and pressing one fires it
   straight through to the phone. Changing a job is a separate, visible target —
   the badge above each bead — and its choices open right there rather than in a
   detached row you had to notice.
-------------------------------------------------------------------------- */
(function () {
  var root = document.getElementById("beadBtns");
  if (!root) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var slots = [].slice.call(root.querySelectorAll(".bx-slot"));
  var beads = [].slice.call(root.querySelectorAll(".bx-bead"));
  var tags = [].slice.call(root.querySelectorAll(".bx-tagbtn"));
  var menu = document.getElementById("bxMenu");
  var items = [].slice.call(menu.querySelectorAll(".bx-mi"));
  var strap = root.querySelector(".bx-strap");
  var pulse = root.querySelector(".bx-pulse");
  var spark = root.querySelector(".bx-spark");
  var motion = spark && spark.querySelector("animateMotion");
  var screen = document.getElementById("bxScreen");

  var GLYPH = { camera: "◉", music: "♪", dnd: "☾", find: "◎", voice: "▮", home: "⌂", sos: "△" };
  // the screens speak for themselves now — only the alert keeps a caption, because its
  // outcome (who was reached) is not otherwise visible
  var SAID = { camera: "", music: "", dnd: "", find: "", voice: "", home: "", sos: "" };
  var NAME = { camera: "Camera", music: "Music", dnd: "Do not disturb", find: "Find my phone",
               voice: "Voice note", home: "Lights", sos: "Alert my circle" };
  // every bead ARRIVES with a job, so the section states its idea before anyone clicks
  var assigned = ["camera", "music", "dnd", "find", "voice"];
  var touched = false, demo = null, screenTimer = null, openOn = -1;

  /* ---- THE RING -------------------------------------------------------------
     The five beads used to sit in a flat row. They now ride a turnable ring, the
     way the app's Bracelet3DView does: the bead at the front is big, upright and
     the only one that takes a press; the others shrink, dim and fall away along
     the cord. Drag, swipe, arrow-key or press Tab-then-arrows to turn it.

     Everything below only decides WHERE a slot sits — slot indices, the job
     badges and every existing handler are untouched, and the pulse/menu code
     reads live rects so it follows the beads automatically. */
  // NOTE: `strap` is already declared above — do not redeclare it here, that would null the
  // reference the pulse code depends on.
  // ring.N / ring.focusTarget are the geometry contract: the CSS ring has as many stations
  // as slots and bead i is front when off ≡ i; the REAL carousel (beadring3d.js) overrides
  // them, because the app's cord has 8 wrap stations and its front station is index 6.
  var ring = { off: 0, target: 0, drag: false, id: null, x0: 0, o0: 0, moved: 0, raf: 0,
               N: slots.length, focusTarget: null };
  var STEP = (Math.PI * 2) / Math.max(1, slots.length);

  /* The beads ride a TILTED RING, not a flat arc — the same read as the app's Bracelet3DView.
     Seen from slightly above, the bracelet's circle projects to an ellipse: the bead at the
     front sits at the bottom of it, nearest and largest; beads turning away climb the ellipse,
     shrink and dim. The cord IS that ellipse, so the beads are always threaded on it rather
     than floating near it. Radii are derived from the bead size so the ring stays proportioned
     at every viewport. */
  var ring3dActive = false;   // the real 3D carousel took over: its frame loop owns the slot vars
  function ringLayout() {
    if (!strap) return;
    if (ring3dActive) return;                          // beadring3d.js projects the real geometry instead
    var w = strap.clientWidth || 1, h = strap.clientHeight || 1;
    var slotW = slots[0] ? slots[0].offsetWidth : 96;
    var Rx = Math.min(slotW * 1.28, w * 0.42);         // half-width of the ring
    var Ry = Math.max(16, Math.min(slotW * 0.34, h * 0.22));   // how far it is tilted toward us
    var frontIdx = -1, frontCos = -2;
    for (var i = 0; i < slots.length; i++) {
      var a = (i - ring.off) * STEP;
      var c = Math.cos(a), s = Math.sin(a);
      var st = slots[i].style;
      st.setProperty("--bx-x", (Rx * s).toFixed(1) + "px");
      st.setProperty("--bx-y", (Ry * c).toFixed(1) + "px");     // +Ry at the front (bottom of the ellipse)
      st.setProperty("--bx-s", (0.52 + 0.48 * (0.5 + 0.5 * c)).toFixed(3));
      st.setProperty("--bx-o", (0.22 + 0.78 * Math.max(0, 0.5 + 0.5 * c)).toFixed(3));
      st.setProperty("--bx-z", String(Math.round(100 + c * 100)));
      if (c > frontCos) { frontCos = c; frontIdx = i; }
    }
    for (var j = 0; j < slots.length; j++) slots[j].setAttribute("data-front", j === frontIdx ? "1" : "0");
    // the cord: the very ellipse the beads sit on, in the strap's own pixel space
    var svg = document.getElementById("bxCord"), path = document.getElementById("bxCordPath");
    if (svg && path) {
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      var cx = w / 2, cy = h / 2;
      path.setAttribute("d",
        "M " + (cx - Rx) + " " + cy +
        " a " + Rx + " " + Ry + " 0 1 0 " + (2 * Rx) + " 0" +
        " a " + Rx + " " + Ry + " 0 1 0 " + (-2 * Rx) + " 0");
    }
    return frontIdx;
  }

  function ringSettle() {                              // ease toward the nearest whole bead
    cancelAnimationFrame(ring.raf);
    var tick = function () {
      var d = ring.target - ring.off;
      if (Math.abs(d) < 0.0008) { ring.off = ring.target; ringLayout(); return; }
      ring.off += d * 0.18;
      ringLayout();
      ring.raf = requestAnimationFrame(tick);
    };
    ring.raf = requestAnimationFrame(tick);
  }
  // move to an absolute step on the ring (drag settle, arrow keys)
  function ringTo(n) { ring.target = n; if (reduce) { ring.off = n; ringLayout(); } else ringSettle(); }
  function ringBy(d) { stopDemo(); if (openOn >= 0) closeMenu(); ringTo(Math.round(ring.target) + d); }
  // bring SLOT i to the front. The ring wraps, so step counts drift away from 0..n-1 as you
  // turn — target the nearest position congruent to i, or the bracelet spins the long way
  // round every time the demo advances.
  function ringFocus(i) {
    var m = ring.N || slots.length;
    var t = ring.focusTarget ? ring.focusTarget(i) : i;   // the off value that puts bead i front
    var d = (((t - ring.off) % m) + m) % m;
    if (d > m / 2) d -= m;
    ringTo(ring.off + d);
  }

  function ringInit() {
    if (!strap) return;
    ringLayout();
    addEventListener("resize", ringLayout, { passive: true });

    strap.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".bx-tagbtn") || e.target.closest(".bx-mi")) return;   // badges own their own taps
      ring.drag = true; ring.id = e.pointerId; ring.x0 = e.clientX; ring.o0 = ring.off; ring.moved = 0; ring.eat = false;
      strap.classList.add("is-drag");
      cancelAnimationFrame(ring.raf);
      try { strap.setPointerCapture(e.pointerId); } catch (_) {}
    });
    strap.addEventListener("pointermove", function (e) {
      if (!ring.drag || e.pointerId !== ring.id) return;
      var dx = e.clientX - ring.x0;
      ring.moved = Math.max(ring.moved, Math.abs(dx));
      if (ring.moved > 6 && openOn >= 0) closeMenu();                             // a turning ring must not drag a menu with it
      if (ring.moved > 6) stopDemo();
      // content follows the finger: dragging right turns the ring right (was mirrored)
      ring.off = ring.o0 + dx / ((strap.clientWidth || 300) * 0.30);
      ringLayout();
    });
    var end = function (e) {
      if (!ring.drag || (e.pointerId != null && e.pointerId !== ring.id)) return;
      ring.drag = false; strap.classList.remove("is-drag");
      try { strap.releasePointerCapture(ring.id); } catch (_) {}
      // arm the one-shot click swallow ONLY for the click this drag is about to emit
      ring.eat = ring.moved > 6;
      // snap ONLY after a real drag: a tap's own pointerup otherwise rounds the ring back and
      // clobbers whatever a tap handler (the 3D raycast focus) just asked for
      if (ring.moved > 6) ringTo(Math.round(ring.off));
    };
    strap.addEventListener("pointerup", end);
    strap.addEventListener("pointercancel", end);
    // A real drag must not also fire the bead it ended on. This has to be a ONE-SHOT flag:
    // testing ring.moved directly leaves it high after the drag, which swallowed every later
    // tap on a bead or a job badge.
    strap.addEventListener("click", function (e) {
      if (ring.eat) { ring.eat = false; e.preventDefault(); e.stopPropagation(); }
    }, true);
    strap.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); ringBy(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); ringBy(-1); }
    });
  }

  function paint(i) {
    var act = assigned[i];
    tags[i].querySelector(".bx-tg").textContent = GLYPH[act] || "•";
    tags[i].setAttribute("aria-label", "Change what this bead does — now " + (NAME[act] || ""));
    beads[i].setAttribute("aria-label", NAME[act] + " — press to try it");
    slots[i].classList.toggle("is-sos", act === "sos");
  }
  assigned.forEach(function (a, i) { paint(i); });

  // ---- press: bead → cord → hub → phone ----
  function fire(i) {
    var act = assigned[i], b = beads[i];
    b.classList.remove("is-press"); void b.offsetWidth; b.classList.add("is-press");
    slots[i].classList.add("is-press");
    setTimeout(function () { slots[i].classList.remove("is-press"); }, 600);
    if (reduce) { showScreen(act); return; }
    var sb = strap.getBoundingClientRect(), bb = b.getBoundingClientRect();
    pulse.style.left = (bb.left - sb.left + bb.width / 2 - 4) + "px";
    pulse.style.setProperty("--bx-to", (sb.width - 20) + "px");
    pulse.classList.remove("is-run"); void pulse.offsetWidth; pulse.classList.add("is-run");
    // the signal should feel INSTANT: the spark leaves almost with the click and the screen
    // lights a breath later. The old 400+560ms chain read as lag, not as travel.
    setTimeout(function () {
      if (motion) { spark.classList.add("is-fly"); try { motion.beginElement(); } catch (e) {} }
      setTimeout(function () { spark.classList.remove("is-fly"); showScreen(act); }, 170);
    }, 90);
  }
  function showScreen(act) {
    clearTimeout(screenTimer);
    screen.dataset.act = act;
    screen.classList.add("is-on");
    screen.querySelector(".bx-label").textContent = SAID[act] || "";
    screenTimer = setTimeout(function () { screen.classList.remove("is-on"); }, 2400);
  }

  // ---- change a job: the choices open AT the bead ----
  function openMenu(i) {
    openOn = i;
    items.forEach(function (m) { m.classList.toggle("is-on", m.dataset.act === assigned[i]); });
    menu.hidden = false;
    var sr = root.getBoundingClientRect(), tr = tags[i].getBoundingClientRect();
    var x = tr.left - sr.left + tr.width / 2 - menu.offsetWidth / 2;
    menu.style.left = Math.max(6, Math.min(sr.width - menu.offsetWidth - 6, x)) + "px";
    menu.style.top = (tr.bottom - sr.top + 10) + "px";
    tags[i].setAttribute("aria-expanded", "true");
    slots[i].classList.add("is-open");
    items[0].focus();
  }
  function closeMenu() {
    menu.hidden = true;
    tags.forEach(function (t) { t.setAttribute("aria-expanded", "false"); });
    slots.forEach(function (s2) { s2.classList.remove("is-open"); });
    openOn = -1;
  }
  tags.forEach(function (t, i) {
    t.setAttribute("aria-expanded", "false");
    t.addEventListener("click", function (e) {
      e.stopPropagation(); stopDemo();
      if (openOn === i) closeMenu(); else openMenu(i);
    });
  });
  items.forEach(function (m) {
    m.addEventListener("click", function () {
      var i = openOn; if (i < 0) return;
      assigned[i] = m.dataset.act; paint(i); closeMenu();
      tags[i].focus();
      setTimeout(function () { fire(i); }, 220);       // show the new job immediately
    });
  });
  beads.forEach(function (b, i) {
    b.addEventListener("click", function () { stopDemo(); closeMenu(); fire(i); });
  });
  document.addEventListener("click", function () { if (openOn >= 0) closeMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openOn >= 0) { var i = openOn; closeMenu(); tags[i].focus(); } });

  // ---- it presses itself until someone takes over ----
  function stopDemo() { touched = true; if (demo) { clearTimeout(demo); demo = null; } }
  var order = [0, 1, 3, 2, 4], oi = 0;
  function play() {
    if (touched || reduce) return;
    fire(order[oi++ % order.length]);
    demo = setTimeout(play, 3600);
  }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting && !touched && !demo) demo = setTimeout(play, 700);
      else if (!e.isIntersecting && demo) { clearTimeout(demo); demo = null; }
    });
  }, { threshold: 0.35 });
  io.observe(root);

  // the ring goes last: it needs stopDemo/closeMenu, and it turns the flat row into the
  // bracelet carousel the moment it runs
  ringInit();
  window.__mkRing = ring;   // read-only debug/test handle, like window.__hero

  // UPGRADE to the app's actual carousel — real cord + CAD beads in WebGL — the moment the
  // section approaches the viewport. The CSS ring above stays as the no-WebGL / load-failure
  // fallback: same slots, same handlers, same drag state either way.
  // The REAL carousel at every width — Melvin's explicit call, three times over. The LCP
  // protection is the trigger, not a device gate: the observer fires only on TRUE visibility
  // (threshold, no rootMargin) and defers to idle, so the three.js + CAD work can never race
  // first paint — it starts strictly after the visitor has scrolled to the section. (The
  // 10.8s LCP regression came from a 400px rootMargin firing with zero scroll on a
  // one-viewport hero, not from phones being phones.)
  // If the upgrade WILL run, the flat CSS ring must never flash first (Melvin saw the old
  // ring for seconds before the real one landed). Probe WebGL up front: hide the flat layer
  // immediately, reveal it only if the 3D fails.
  var probe = document.createElement("canvas");
  var webgl = false;
  try { webgl = !!(window.WebGLRenderingContext && (probe.getContext("webgl2") || probe.getContext("webgl"))); } catch (e) {}
  if (webgl) strap.classList.add("bx-upgrading");
  var up = new IntersectionObserver(function (es) {
    var near = false;
    for (var k = 0; k < es.length; k++) if (es[k].isIntersecting) near = true;
    if (!near) return;
    up.disconnect();
    if (!webgl) return;
    (window.requestIdleCallback || function (fn) { setTimeout(fn, 350); })(function () {
      import("./beadring3d.js")
        .then(function (mod) {
          return mod.initBeadRing3D({ strap: strap, slots: slots, ring: ring, getStep: function () { return STEP; }, focus: ringFocus, wasDrag: function () { return ring.moved > 6; } });
        })
        .then(function (ok) { if (ok) ring3dActive = true; strap.classList.remove("bx-upgrading"); })
        .catch(function (e) { console.warn("[beadring3d] staying on the CSS ring:", e); strap.classList.remove("bx-upgrading"); });
    }, { timeout: 2000 });
  }, { threshold: 0.05 });
  up.observe(root);
  // the self-playing demo should bring its bead to the front rather than firing one behind you
  var _fire = fire;
  fire = function (i) { if (!ring.drag) ringFocus(i); _fire(i); };
})();
