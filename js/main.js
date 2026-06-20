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
     Positioning map
  ------------------------------------------------------------------ */
  function buildMap() {
    const plot = $("#mapPlot"); if (!plot) return;
    // x: 0=takes effort -> 100=lives with you ; y: 0=anyone -> 100=chosen few
    const dots = [
      { x:18, y:20, t:"Social feeds" },
      { x:30, y:34, t:"Group chats" },
      { x:24, y:64, t:"Calls / FaceTime" },
      { x:46, y:40, t:"Texts" },
      { x:70, y:50, t:"Bond Touch" },
      { x:88, y:88, t:"M’AKOMA", us:true },
    ];
    plot.innerHTML = dots.map(d =>
      `<div class="dot${d.us ? " us" : ""}" style="left:${d.x}%; bottom:${d.y}%"><i></i><span>${d.t}</span></div>`
    ).join("");
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
     Join form — waitlist capture

     ▶ TO GO LIVE: paste your endpoint into JOIN_ENDPOINT below. It works
       with any service that accepts a POST of the fields { email, intent }:
         • Buttondown : https://buttondown.email/api/emails/embed-subscribe/YOUR_USERNAME
         • Formspree  : https://formspree.io/f/YOUR_FORM_ID
         • ConvertKit : https://app.convertkit.com/forms/YOUR_FORM_ID/subscriptions
     Until it is set, submissions are saved in the visitor's browser
     (localStorage key "makoma_waitlist") so nothing is lost while testing.
  ------------------------------------------------------------------ */
  const JOIN_ENDPOINT = ""; // e.g. "https://formspree.io/f/abcdwxyz"

  function setupForm() {
    const form = $("#joinForm"), status = $("#joinStatus"),
          email = $("#joinEmail"), submit = $("#joinSubmit");
    if (!form) return;

    // intent toggle (For me / As a gift) — keep the visual pill in sync with the radio
    const pills  = $$(".intent-pill", form);
    const radios = $$('input[name="intent"]', form);
    const syncPills = () => pills.forEach(p => p.classList.toggle("is-on", p.querySelector("input").checked));
    radios.forEach(r => r.addEventListener("change", syncPills));
    syncPills();
    const intent = () => (form.querySelector('input[name="intent"]:checked') || {}).value || "self";

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
      const giving = intent() === "gift";

      // always keep a local copy so a submission is never silently lost
      try {
        const k = "makoma_waitlist";
        const list = JSON.parse(localStorage.getItem(k) || "[]");
        list.push({ email: v, intent: intent(), at: new Date().toISOString() });
        localStorage.setItem(k, JSON.stringify(list));
      } catch (_) {}

      const done = () => {
        say(giving
          ? "Beautiful — you’re in. We’ll be in touch about making it a gift; founding pricing and dates go to the circle first."
          : "You’re in. Founding pricing and ship dates go to the circle first — watch your inbox.");
        email.value = "";
      };

      if (!JOIN_ENDPOINT) { done(); return; } // placeholder mode — no backend wired yet

      const label = submit.textContent;
      submit.disabled = true; submit.textContent = "Reserving…";
      say("Reserving your spot…");
      try {
        const body = new FormData();
        body.append("email", v);
        body.append("intent", intent());
        const res = await fetch(JOIN_ENDPOINT, { method: "POST", body, headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error("HTTP " + res.status);
        done();
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
      let p = (vh * 0.95 - r.top) / (vh * 0.6);   // 0 as it enters, 1 once well in view
      p = Math.max(0, Math.min(1, p));
      draws.forEach((path, i) => { path.style.strokeDashoffset = (lens[i] * (1 - p)).toFixed(1); });
      const fo = Math.max(0, Math.min(1, (p - 0.62) / 0.3));   // beads/knot fade in near the end
      fills.forEach(f => { f.style.opacity = fo.toFixed(2); });
    };
    window.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    upd();
  }

  function init() {
    // v2: the bead ring, how-it-works demos, symbol gallery and positioning map
    // were merged into the carousel (carousel.js) and the 2D→3D viz (positioning.js).
    staggerRefusals();
    observeReveals();
    setupChrome();
    setupForm();
    setupLogoTrace();
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
