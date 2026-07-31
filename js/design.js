/* ============================================================
   M'AKOMA — bracelet design state
   ------------------------------------------------------------
   The single shared store for what the visitor designs: one shell colour,
   and five people (name + glow colour + a CUT — what is cut clean through
   their bead: an Adinkra symbol, stencil initials, or their own artwork).

   v2: a person OWNS a fixed bead (SLOT_BEAD) and the cut is pure choice.
   In v1 the symbol decided which bead a person sat on; now the bead in
   frame is theirs and anything can be cut into it — which is the whole
   point of the designer. Duplicate symbols across people are ALLOWED
   (two beads with the same cut is physically fine).

   Loaded as a CLASSIC script BEFORE main.js, because main.js is a classic
   IIFE and hero3d.js is an ES module — neither can import the other, so a
   window global is the only thing both worlds can see. Same pattern the
   codebase already uses for window.ADINKRA_PATHS and window.__hero.

   PRIVACY — deliberate and structural, not a convention:
   the five names are personal data about third parties who never visited
   this site and never consented. They are stored ONLY in this browser and
   are NEVER included in toMetadata(). Not hashed either — five first names
   is a tiny keyspace, so a hash would be trivially reversible and would
   offer false comfort. Nothing about choosing which three shell colours to
   manufacture needs a single name.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "makoma_design_v1";

  /* The six shell colourways offered. Every one is mid-to-dark EXCEPT bone,
     because a light shell washes the gold symbol out — verified by rendering
     all six on the real CAD: on #E8E1D3 the gold heart nearly disappeared.
     `mark` is how the symbol is finished: lasering a light polymer burns a
     DARK mark, which is both what the factory would actually produce and
     what keeps the symbol legible. */
  var SHELLS = [
    { id: "onyx",     name: "Onyx",       hex: "#0C0C0D", mark: "gold" },
    { id: "clay",     name: "Clay",       hex: "#A65A3F", mark: "gold" },
    { id: "forest",   name: "Forest",     hex: "#1F3A2E", mark: "gold" },
    { id: "midnight", name: "Midnight",   hex: "#16233D", mark: "gold" },
    { id: "rose",     name: "Dusty Rose", hex: "#8E5A63", mark: "gold" },
    { id: "bone",     name: "Bone",       hex: "#C9B79C", mark: "dark" }
  ];

  /* Bead index -> Adinkra symbol. PROVEN against the model, not assumed:
     each bead's symbol is baked geometry in bracelet_threaded.glb, so every
     bead was rendered head-on and matched against the named reference
     renders in assets/beads/. The order is alphabetical.
     Because each person picks a DISTINCT symbol, a person maps to exactly
     one bead index — which is why no geometry has to be swapped to show a
     custom design. */
  var SYMBOLS = [
    "akoma", "akoma_ntoaso", "aya", "gye_nyame",
    "nkonsonkonson", "nkyinkyim", "nsoroma", "sankofa"
  ];
  var BEAD_OF = {};
  SYMBOLS.forEach(function (s, i) { BEAD_OF[s] = i; });

  var SLOTS = 5;
  /* Person i's bead, fixed. Chosen so the DEFAULT design (each person's cut = the symbol
     already baked onto their bead) renders the pristine model with zero geometry work,
     and matches the spread the ring always used. */
  var SLOT_BEAD = [0, 3, 1, 4, 6];

  function defaults() {
    return {
      v: 2,
      shell: "onyx",
      touched: false,               // did they actually choose a shell? (see toMetadata)
      /* `ghost` is a placeholder only — it renders in the input's placeholder and in italic
         on the chip, and is NEVER stored as a name. It exists so the section reads as a
         finished piece of jewellery rather than an empty form. The symbols are spread
         around the ring (beads 0,3,1,4,6) so the lit beads don't clump on one side. */
      people: [
        { name: "", ghost: "Mum",         cut: { type: "adinkra", sym: "akoma" },         glow: "#e8c57a" },
        { name: "", ghost: "Dad",         cut: { type: "adinkra", sym: "gye_nyame" },     glow: "#f1e9d2" },
        { name: "", ghost: "Sis",         cut: { type: "adinkra", sym: "akoma_ntoaso" },  glow: "#ecb07a" },
        { name: "", ghost: "Best friend", cut: { type: "adinkra", sym: "nkonsonkonson" }, glow: "#5fd3e0" },
        { name: "", ghost: "My person",   cut: { type: "adinkra", sym: "nsoroma" },       glow: "#f4d58d" }
      ],
      updatedAt: null
    };
  }

  function validCut(c) {
    if (!c || typeof c !== "object") return false;
    if (c.type === "adinkra")  return SYMBOLS.indexOf(c.sym) !== -1;
    if (c.type === "initials") return typeof c.text === "string" && /^[A-Z0-9]{1,3}$/.test(c.text);
    if (c.type === "upload")   return typeof c.svg === "string" && c.svg.length > 30 && c.svg.length < 300000 && c.svg.indexOf("<svg") === 0;
    return false;
  }

  var state = load();
  var subs = [];

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var d = JSON.parse(raw);
      if (!d || (d.v !== 1 && d.v !== 2) || !Array.isArray(d.people)) return defaults();
      var base = defaults();
      // merge defensively so a partial/corrupt object can never break the page
      base.shell   = validShell(d.shell) ? d.shell : base.shell;
      base.touched = !!d.touched;
      for (var i = 0; i < SLOTS; i++) {
        var p = d.people[i]; if (!p) continue;
        if (typeof p.name === "string") base.people[i].name = p.name.slice(0, 24);
        if (/^#[0-9a-f]{6}$/i.test(p.glow || "")) base.people[i].glow = p.glow;
        if (d.v === 1) {   // migrate: the old symbol becomes the cut; the person moves to their fixed bead
          if (SYMBOLS.indexOf(p.sym) !== -1) base.people[i].cut = { type: "adinkra", sym: p.sym };
        } else if (validCut(p.cut)) base.people[i].cut = p.cut;
      }
      return base;
    } catch (e) { return defaults(); }
  }

  function validShell(id) { return SHELLS.some(function (s) { return s.id === id; }); }

  function save() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    subs.forEach(function (fn) { try { fn(state); } catch (e) {} });
  }

  var API = {
    SHELLS: SHELLS,
    SYMBOLS: SYMBOLS,
    SLOTS: SLOTS,
    beadOf: function (sym) { return BEAD_OF[sym]; },        // symbol -> the bead it is BAKED on (alphabetical); v2 keeps it for glyph lookups
    beadNode: function (i) { return SLOT_BEAD[i]; },         // person -> their fixed bead
    shellDef: function (id) {
      for (var i = 0; i < SHELLS.length; i++) if (SHELLS[i].id === (id || state.shell)) return SHELLS[i];
      return SHELLS[0];
    },
    get: function () { return JSON.parse(JSON.stringify(state)); },

    setShell: function (id) {
      if (!validShell(id)) return;
      var same = state.shell === id;
      state.shell = id;
      // Record the choice even when they re-pick the current colour: clicking Onyx
      // deliberately is a vote, and `touched` is what separates a real vote from a
      // drive-by submit that silently carried the default.
      if (!state.touched || !same) { state.touched = true; save(); }
    },
    setName: function (i, name) {
      if (!state.people[i]) return;
      state.people[i].name = String(name || "").slice(0, 24);
      save();
    },
    /* v2: the cut is pure choice on the person's own bead — no swapping, duplicates fine. */
    setCut: function (i, cut) {
      if (!state.people[i] || !validCut(cut)) return;
      state.people[i].cut = cut;
      save();
    },
    setSymbol: function (i, sym) {                            // legacy sugar (kept for main.js/back-compat)
      if (SYMBOLS.indexOf(sym) !== -1) API.setCut(i, { type: "adinkra", sym: sym });
    },
    setGlow: function (i, hex) {
      if (!state.people[i] || !/^#[0-9a-f]{6}$/i.test(hex)) return;
      state.people[i].glow = hex; save();
    },
    reset: function () { state = defaults(); save(); },
    subscribe: function (fn) { if (typeof fn === "function") { subs.push(fn); fn(state); } },

    /* What is allowed to leave the browser. Names are structurally absent —
       this function is the only path to the network, and it never reads .name.

       `cfg` matters more than it looks: without it every drive-by submit would
       silently vote for the default shell, and the manufacturing tally would
       just measure traffic. Count colour votes over cfg=custom only. */
    toMetadata: function () {
      var named = state.people.filter(function (p) { return p.name.trim(); }).length;
      // `cfg` reports ONLY whether a shell was explicitly chosen — see setShell.
      return {
        shell:   state.shell,
        cfg:     state.touched ? "custom" : "default",
        // the cut signal only: an adinkra choice ships its symbol name (useful demand signal);
        // initials/uploads ship ONLY the type — never text, never artwork
        cuts:    state.people.map(function (p) { return p.cut.type === "adinkra" ? p.cut.sym : p.cut.type; }).join(","),
        glows:   state.people.map(function (p) { return p.glow.replace("#", ""); }).join(","),
        slots:   String(named)     // how many of the five they actually named
      };
    }
  };

  window.MAKOMA_DESIGN = API;
})();
