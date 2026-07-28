/* ============================================================
   M'AKOMA — bracelet design state
   ------------------------------------------------------------
   The single shared store for what the visitor designs: one shell colour,
   and five people (name + Adinkra symbol + glow colour).

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

  function defaults() {
    return {
      v: 1,
      shell: "onyx",
      touched: false,               // did they actually choose a shell? (see toMetadata)
      /* `ghost` is a placeholder only — it renders in the input's placeholder and in italic
         on the chip, and is NEVER stored as a name. It exists so the section reads as a
         finished piece of jewellery rather than an empty form. The symbols are spread
         around the ring (beads 0,3,1,4,6) so the lit beads don't clump on one side. */
      people: [
        { name: "", ghost: "Mum",         sym: "akoma",         glow: "#e8c57a" },
        { name: "", ghost: "Dad",         sym: "gye_nyame",     glow: "#f1e9d2" },
        { name: "", ghost: "Sis",         sym: "akoma_ntoaso",  glow: "#ecb07a" },
        { name: "", ghost: "Best friend", sym: "nkonsonkonson", glow: "#5fd3e0" },
        { name: "", ghost: "My person",   sym: "nsoroma",       glow: "#f4d58d" }
      ],
      updatedAt: null
    };
  }

  var state = load();
  var subs = [];

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var d = JSON.parse(raw);
      if (!d || d.v !== 1 || !Array.isArray(d.people)) return defaults();
      var base = defaults();
      // merge defensively so a partial/corrupt object can never break the page
      base.shell   = validShell(d.shell) ? d.shell : base.shell;
      base.touched = !!d.touched;
      for (var i = 0; i < SLOTS; i++) {
        var p = d.people[i]; if (!p) continue;
        if (typeof p.name === "string") base.people[i].name = p.name.slice(0, 24);
        if (SYMBOLS.indexOf(p.sym) !== -1) base.people[i].sym = p.sym;
        if (/^#[0-9a-f]{6}$/i.test(p.glow || "")) base.people[i].glow = p.glow;
      }
      dedupe(base);
      return base;
    } catch (e) { return defaults(); }
  }

  function validShell(id) { return SHELLS.some(function (s) { return s.id === id; }); }

  /* Symbols must stay distinct across the five — that is the whole reason a
     person can map onto one real bead. If a restored or set() value collides,
     push the loser to the first free symbol rather than silently showing two
     people on one bead. */
  function dedupe(d) {
    var seen = {};
    d.people.forEach(function (p) {
      if (!seen[p.sym]) { seen[p.sym] = 1; return; }
      for (var i = 0; i < SYMBOLS.length; i++) {
        if (!seen[SYMBOLS[i]]) { p.sym = SYMBOLS[i]; seen[SYMBOLS[i]] = 1; return; }
      }
    });
  }

  function save() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    subs.forEach(function (fn) { try { fn(state); } catch (e) {} });
  }

  var API = {
    SHELLS: SHELLS,
    SYMBOLS: SYMBOLS,
    SLOTS: SLOTS,
    beadOf: function (sym) { return BEAD_OF[sym]; },
    shellDef: function (id) {
      for (var i = 0; i < SHELLS.length; i++) if (SHELLS[i].id === (id || state.shell)) return SHELLS[i];
      return SHELLS[0];
    },
    get: function () { return JSON.parse(JSON.stringify(state)); },

    setShell: function (id) {
      if (!validShell(id) || state.shell === id) return;
      state.shell = id; state.touched = true; save();
    },
    setName: function (i, name) {
      if (!state.people[i]) return;
      state.people[i].name = String(name || "").slice(0, 24);
      save();
    },
    /* Assigning a symbol already in use SWAPS the two people, so the set stays
       distinct and the visitor never loses a choice they already made. */
    setSymbol: function (i, sym) {
      if (!state.people[i] || SYMBOLS.indexOf(sym) === -1) return;
      var holder = -1;
      state.people.forEach(function (p, j) { if (p.sym === sym && j !== i) holder = j; });
      if (holder !== -1) state.people[holder].sym = state.people[i].sym;
      state.people[i].sym = sym;
      state.touched = true; save();
    },
    setGlow: function (i, hex) {
      if (!state.people[i] || !/^#[0-9a-f]{6}$/i.test(hex)) return;
      state.people[i].glow = hex; state.touched = true; save();
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
      return {
        shell:   state.shell,
        cfg:     state.touched ? "custom" : "default",
        symbols: state.people.map(function (p) { return p.sym; }).join(","),
        glows:   state.people.map(function (p) { return p.glow.replace("#", ""); }).join(","),
        slots:   String(named)     // how many of the five they actually named
      };
    }
  };

  window.MAKOMA_DESIGN = API;
})();
