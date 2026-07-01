/* ============================================================
   M'AKOMA — scroll-driven 3D hero (turntable)
   Loads the real assembled-bracelet CAD export (Makoma_bracelet_arranged.obj →
   bracelet_assembled.glb) exactly as arranged in Fusion. The camera faces the
   radially-engraved Adinkra symbols; scrolling spins the whole bracelet about its
   axis so every bead's gold symbol — and the hub's gold button — turns to face you
   in turn. Matte-black resin + warm gold, like the Akoma_4E renders.
   Falls back to the static render on mobile / no-WebGL / reduced-motion.
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { if (a === b) return x < a ? 0 : 1; const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180, TAU = Math.PI * 2;

// orientation of the loaded export: flip so the USB-port face is up (not the speaker grille)
const FLIP_X = Math.PI;   // set to 0 if the USB/speaker ends up the wrong way round
const CAM_AZ = 0, CAM_EL = 15;      // low camera that faces the radial symbols
const SPIN_TURNS = 1;               // full revolutions across the scroll (8 beads → 1 is plenty)
const SPIN_PHASE = 169.6 * DEG;    // start rotation: the Akoma (heart) bead faces front at p=0

// ---- GATHER phase: after the hero settles, more scroll fades the text and blooms 5 clones of the
//      bracelet out from the centre into a circle of 6 — all in the SAME scene (no viewports). ----
const HERO_FRAC = 0.64;            // first 64% of the (taller) section = the existing hero; the rest gathers
const GATHER_END = 0.88;           // gather completes here; 0.88–1.0 is an interactive dwell (cluster held)
const GATHER_N = 6;
const GATHER_SCALE = 0.45;         // each bracelet shrinks to this in the cluster
const GATHER_DIST = 6.1;           // camera pull-back at full gather (× modelR) — pulled back to clear room for the guide text
const GATHER_DROP = 0.12;          // shift the cluster DOWN by this fraction of the half-viewport, so the header clears its top
const GATHER_COLX = 0.66;          // half horizontal gap between the two columns (× modelR)
const GATHER_ROWY = 0.72;          // vertical spacing between the three rows (× modelR)
const GATHER_TILT = -18 * DEG;     // the BOTTOM row pitches up by this (about screen-horizontal) so its beads angle up, not down
const GATHER_FLOAT = 0.022;        // very gentle float amplitude (× modelR) — barely-there drift
const GATHER_SIDE = 3.0;           // off-screen start for the side slide-in (× modelR)
const GATHER_FSPEED = [0.24, 0.31, 0.21, 0.34, 0.27, 0.19];   // vertical-drift speed per bracelet (slow, unsynchronised)
const GATHER_FPHASE = [0.0, 1.7, 3.2, 0.8, 4.5, 2.3];         // vertical-drift phase
const GATHER_FSPEED2 = [0.19, 0.27, 0.33, 0.22, 0.29, 0.25];  // horizontal-drift speed (diff freq → drifts every direction)
const GATHER_FPHASE2 = [2.1, 0.4, 3.9, 1.5, 2.8, 0.9];        // horizontal-drift phase
const GATHER_HUE = [0x48C9CB, 0xE0A52A, 0xB77AF4, 0xF0922C, 0x63CE88, 0x5C9CEB];   // tap-glow colour per person
const GATHER_NODE = [4, 0, 6, 7, 2, 3];   // bead node that represents each person (You·Mom·Dad·Priscilla·Sylvester·Phoebe)
const GATHER_NAME = ["You", "Mom", "Dad", "Priscilla", "Sylvester", "Phoebe"];   // the name pinned under each bracelet
const GATHER_SHAKE = 0.025;        // vibrate amplitude of the REACHED BEAD when pinged (× modelR, bracelet-local); decays over ~0.42s
const ECHO_HOLD = 420;             // ms press-and-hold on a bracelet to start an ECHO (a quick tap stays a Pulse)
const ECHO_DUR = 1.9;              // seconds the Echo waveform streams from the pressed bead to the receiving bead
const GATHER_NOTE = [392.00, 440.00, 523.25, 587.33, 659.25, 783.99];   // each person's Echo pitch (G-pentatonic), like the carousel charm notes

const section = $("#hero");
const canvas = $("#heroCanvas");
const poster = $("#heroPoster");
const loaderEl = $("#heroLoader");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
  catch (e) { return false; }
}
const coarse = window.matchMedia("(pointer: coarse)").matches;   // phone / touch — kept to TRIM cost on mobile, NOT to disable
const conn = navigator.connection || navigator.webkitConnection || {};
const slowNet = conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType || "");

// The interactive bead scroll now runs on phones too. The static poster is only a fallback for genuinely
// unsupported cases: no WebGL, an explicit reduced-motion preference, or a data-saver / 2G connection.
// On coarse-pointer devices we keep the experience but lighten the render (pixel ratio + shadow map) in init().
if (reduce || slowNet || !webglOK()) {
  section.classList.add("no3d");
  if (loaderEl) loaderEl.style.display = "none";
  window.__hero = { fallback: true };
} else {
  init();
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.75 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // camera looks from +X (az 0) low; key lights the front so the near symbols catch gold
  const key = new THREE.DirectionalLight(0xfff4e6, 3.6); key.position.set(20, 16, 7);
  key.castShadow = true; key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 120;
  key.shadow.camera.left = -22; key.shadow.camera.right = 22; key.shadow.camera.top = 22; key.shadow.camera.bottom = -22;
  key.shadow.bias = -0.0004;
  const fill = new THREE.DirectionalLight(0xfff1dd, 0.8); fill.position.set(13, -3, -6);
  const rim = new THREE.DirectionalLight(0xbcd2ff, 1.4); rim.position.set(-17, 9, -5);
  const rim2 = new THREE.DirectionalLight(0xffd9a6, 0.8); rim2.position.set(-6, 5, 16);
  const backRim = new THREE.DirectionalLight(0xfff0d6, 0.0); backRim.position.set(-21, 8, 3);   // edge light to pop the beads off a dark bg
  const amb = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(key, fill, rim, rim2, backRim, amb);
  // Bead lighting is deliberately identical in both themes: matte black + warm gold = premium jewelry.
  // Cranking the rim/edge light in dark mode washed the beads out ("pale, sun-bleached"), so instead the
  // bracelet is separated from the page by a warm vignette POOL behind it (see .hero3d-sticky in style.css) —
  // the background does the work, not extra light on the beads.

  const spin = new THREE.Group();        // rotates with scroll (about the bracelet's vertical axis)
  const orient = new THREE.Group();      // fixed flip so USB faces up
  orient.rotation.x = FLIP_X;
  spin.add(orient);
  scene.add(spin);
  let modelR = 10;
  let gatherGroup = null; const gatherInstances = [];   // the 6 bracelet clones for the gather cluster
  const gSpin = [], gVel = [], gBuzz = [], gTarget = [], gSnapping = [], gPitch = [];   // spin · velocity · pulse · snap target · snapping · bottom-row upward tilt
  const frontAngleOf = {};                             // bead node → spin angle that faces it to the camera
  let gLast = 0, gDragging = -1, gDownX = 0, gMoved = false, gLastX = 0;   // interaction state
  let gEcho = null, gHoldTimer = null, gHeld = false;                      // Echo (press-and-hold) state
  let echoCanvas = null, echoCtx = null;                                   // 2-D overlay the waveform stream draws on
  const beadGeomC = {};                                                    // node → bead geometry centre (shared local frame), for the bead's world position
  const _ew1 = new THREE.Vector3(), _ew2 = new THREE.Vector3(), _ep = new THREE.Vector3();   // echo scratch

  // distance that frames the WHOLE 2×3 cluster for the current viewport. On wide desktops GATHER_DIST wins; on
  // narrow portrait phones the cluster would otherwise overflow the sides, so pull the camera back to fit the width.
  function gatherFitDist() {
    const vHalf = Math.tan(camera.fov * 0.5 * DEG);                          // tan(vertical FOV / 2)
    const halfW = (GATHER_COLX + GATHER_SCALE) * modelR;                     // cluster half-width  (columns + a bracelet)
    const halfH = (GATHER_ROWY + GATHER_SCALE * 0.62) * modelR;              // cluster half-height (rows + a bracelet)
    const dW = halfW / (vHalf * Math.max(camera.aspect, 0.05) * 0.9);        // fit the width into 90% (side margins)
    const dH = halfH / (vHalf * 0.56);                                       // fit the height into 56% → reserve top for the header + bottom for the legend
    return Math.max(GATHER_DIST * modelR, dW, dH);
  }
  function placeCamera(settle = 0, g = 0) {
    const az = (CAM_AZ + Math.sin(idle * 0.18) * 0.7 * (1 - settle) * (1 - g)) * DEG;   // idle sway fades out as we settle
    const el = (CAM_EL + (CAM_EL_END - CAM_EL) * settle) * DEG;               // rise toward the top-front edge
    let d = (3.15 + (CAM_DIST_END - 3.15) * settle) * modelR;                  // pull back to frame the whole bracelet
    let pan = CAM_PAN_END * modelR * settle;   // pan the framing DOWN so the bracelet rises into the upper frame
    if (g > 0) { d = lerp(d, gatherFitDist(), g); pan = lerp(pan, -GATHER_DROP * d * Math.tan(camera.fov * 0.5 * DEG), g); }   // gather: FRAME the whole cluster (viewport-aware) + drop it below the header
    const ce = Math.cos(el);
    camera.position.set(Math.cos(az) * ce * d, Math.sin(el) * d - pan, Math.sin(az) * ce * d);
    camera.lookAt(0, -pan, 0);
  }

  // etch a name into the flat UNDERSIDE of a clone's hub (HUB_BASE, −Z face) as a gold-inlay decal that is a real
  // child of the hub mesh — so it rides every spin/tilt the bracelet goes through, never a floating overlay.
  function engraveHubName(clone, name) {
    const base = clone.getObjectByName("HUB_BASE"); if (!base) return;
    base.geometry.computeBoundingBox();
    const s = base.geometry.boundingBox.getSize(new THREE.Vector3());   // 3.245 (x) × 2.888 (y) × 1.525 (z thickness)
    const W = 1024, H = 288, maxW = W * 0.86, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const text = (name || "").toUpperCase(), FONT = (px) => `600 ${px}px Georgia, "Times New Roman", serif`;
    const tw = (t, tr) => { let w = 0; for (const ch of t) w += ctx.measureText(ch).width; return w + tr * Math.max(0, t.length - 1); };
    let fs = 156; ctx.font = FONT(fs);
    while (tw(text, fs * 0.12) > maxW && fs > 28) { fs -= 6; ctx.font = FONT(fs); }
    const tr = fs * 0.12, total = tw(text, tr), cy = H / 2;
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const stroke = (dx, dy, style) => { ctx.fillStyle = style; let x = (W - total) / 2 + dx; for (const ch of text) { ctx.fillText(ch, x, cy + dy); x += ctx.measureText(ch).width + tr; } };
    stroke(2.5, 3.5, "rgba(0,0,0,0.55)");        // carved shadow (depth)
    stroke(0, 0, "#e3c074");                       // warm-gold inlay
    stroke(-1, -1.5, "rgba(255,244,216,0.20)");    // faint top highlight (catch-light on the engraving)
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const pw = s.x * 0.82, ph = pw * (H / W);      // a band across the flat underside, with margin
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    plane.position.set(0, 0, -(s.z / 2) - 0.02);   // sit on the −Z underside flat, just proud of the surface
    plane.rotation.y = Math.PI;                     // face outward from the underside
    plane.renderOrder = 3;
    base.add(plane);
  }

  // build 6 clones of the FINISHED hero bracelet (shared geometry) into one group — the gather cluster
  function buildGather() {
    gatherGroup = new THREE.Group(); gatherGroup.visible = false; scene.add(gatherGroup);
    for (let i = 0; i < GATHER_N; i++) {
      const mc = model.clone(true);
      // give EACH bead platform its OWN material, so a ping lights a single bead (one-to-one), never the whole bracelet;
      // and collect each bead's meshes (cap + base + symbol) by node so a ping can VIBRATE just that one bead.
      const beadMat = {}, beadMeshes = {}, platOf = {};
      mc.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = false;                 // no shadows on the clones
        const nm = o.name || ""; let node = NaN;
        if (nm.indexOf("PLATFORM") === 0) {
          node = nm === "PLATFORM" ? 0 : parseInt(nm.slice(8), 10);
          platOf[node] = o;                                     // the symbol disc — used to locate the bead in world (for the echo endpoints)
          if (o.material === matGlow) { const m = matGlow.clone(); m.userData.lit = true; o.material = m; beadMat[node] = m; }       // a hero-glow bead: breathes, can flare brighter
          else if (o.material === matGold) { const m = matGold.clone(); m.userData.lit = false; o.material = m; beadMat[node] = m; } // a dark bead: gold at rest, lights only when pinged
        } else if (nm.indexOf("FB_CAP") === 0) { node = nm === "FB_CAP" ? 0 : parseInt(nm.slice(6), 10); }   // bead top half
        else if (nm.indexOf("FB_BASE") === 0) { node = nm === "FB_BASE" ? 0 : parseInt(nm.slice(7), 10); }  // bead bottom half
        else return;
        if (!isNaN(node)) (beadMeshes[node] || (beadMeshes[node] = [])).push({ mesh: o, base: o.position.clone() });
      });
      const ori = new THREE.Group(); ori.rotation.x = FLIP_X; ori.add(mc);
      const sp = new THREE.Group(); sp.add(ori);
      const pivot = new THREE.Group(); pivot.add(sp); gatherGroup.add(pivot);
      gSpin[i] = gTarget[i] = endSpin; gVel[i] = 0; gBuzz[i] = null; gSnapping[i] = false;
      engraveHubName(mc, GATHER_NAME[i]);   // the name is etched into the hub's flat underside — part of the bracelet, turns with it
      gatherInstances.push({ pivot, spin: sp, beadMat, beadMeshes, platOf, _shakeNode: -1 });
    }
    makeEchoCanvas();
    // all bracelets keep the same (uniform) facing; the BOTTOM row alone pitches up so its beads angle up, not down.
    const slotU = [GATHER_ROWY, GATHER_ROWY, 0, 0, -GATHER_ROWY, -GATHER_ROWY];
    for (let i = 0; i < GATHER_N; i++) gPitch[i] = slotU[i] < 0 ? GATHER_TILT : 0;
    // per-bead "front" spin angles, found against the cluster's (g=1) camera pose — for snap + the directed ping
    const ELr = CAM_EL_END * DEG, dG = GATHER_DIST * modelR;
    const camG = new THREE.Vector3(Math.cos(ELr) * dG, Math.sin(ELr) * dG, 0);
    const ref = gatherInstances[0], suf = (k) => (k === 0 ? "" : String(k)), wc = new THREE.Vector3();
    ref.pivot.position.set(0, 0, 0); ref.pivot.scale.setScalar(1);
    gatherGroup.updateMatrixWorld(true);
    for (const node of GATHER_NODE) {
      const plat = ref.spin.getObjectByName("PLATFORM" + suf(node)); if (!plat) continue;
      plat.geometry.computeBoundingBox();
      const gcl = plat.geometry.boundingBox.getCenter(new THREE.Vector3());   // the disc's REAL centre (geometry, not the mesh origin)
      beadGeomC[node] = gcl.clone();                                          // shared local centre → bead world pos = centre × platform.matrixWorld
      let best = Infinity, bestTh = 0;
      for (let k = 0; k < 360; k++) {
        const th = k / 360 * TAU; ref.spin.rotation.y = th; ref.spin.updateMatrixWorld(true);
        wc.copy(gcl).applyMatrix4(plat.matrixWorld);
        const d = wc.distanceToSquared(camG);
        if (d < best) { best = d; bestTh = th; }
      }
      frontAngleOf[node] = bestTh;
    }
    ref.spin.rotation.y = endSpin;   // all clones stay at the settled-hero pose (identical); swipe one to choose who to reach
  }
  // shortest signed angle and the person whose bead is nearest the front of bracelet `o`
  const angDelta = (from, to) => ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
  function frontPerson(spinVal) {
    let best = -1, bd = TAU;
    for (let pi = 0; pi < GATHER_N; pi++) { const d = angDelta(spinVal, frontAngleOf[GATHER_NODE[pi]]); if (Math.abs(d) < Math.abs(bd)) { bd = d; best = pi; } }
    return best;
  }
  function gSnapTo(i) { gTarget[i] = gSpin[i] + angDelta(gSpin[i], frontAngleOf[GATHER_NODE[frontPerson(gSpin[i])]]); gSnapping[i] = true; }
  const buzz = () => { try { if (navigator.vibrate) navigator.vibrate([0, 55, 35, 55]); } catch (e) {} };   // a clear two-pulse haptic on the bead that's reached
  // the directed ping: tap bracelet `owner` → on the FRONT person's bracelet, spin to YOUR bead, light ONLY that bead, vibrate + buzz
  function gReach(owner) {
    const p = frontPerson(gSpin[owner]); if (p < 0) return;
    const ownNode = GATHER_NODE[owner];   // the sender's own bead — the single bead that lights on the other bracelet
    if (p === owner) { gBuzz[owner] = { node: ownNode, t0: idle, hue: GATHER_HUE[owner] }; buzz(); return; }
    gTarget[p] = gSpin[p] + angDelta(gSpin[p], frontAngleOf[ownNode]); gSnapping[p] = true;
    setTimeout(() => { gBuzz[p] = { node: ownNode, t0: idle, hue: GATHER_HUE[owner] }; buzz(); }, 260);
  }

  // ---- Echo audio: the same soft Web-Audio voice as the bead carousel — a sustained sine + 5.5 Hz vibrato
  //      (the "transmission" hum), plus two-oscillator bell charms for the send + the landing. ----
  let _actx = null;
  function audioCtx() {
    if (_actx) { if (_actx.state === "suspended") _actx.resume(); return _actx; }
    try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) _actx = new AC(); } catch (e) { _actx = null; }
    return _actx;
  }
  function bell(freq, dur, vol) {
    const c = audioCtx(); if (!c) return;
    try {
      const t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o2.type = "sine"; o.frequency.value = freq; o2.frequency.value = freq * 2.005;   // shimmer
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.5));
      o.connect(g); o2.connect(g); g.connect(c.destination);
      o.start(t); o2.start(t); o.stop(t + (dur || 0.5) + 0.02); o2.stop(t + (dur || 0.5) + 0.02);
    } catch (e) {}
  }
  let _echoOsc = null, _echoGain = null, _echoLfo = null;
  function echoSoundStart(freq) {
    const c = audioCtx(); if (!c) return;
    try {
      const t = c.currentTime; _echoOsc = c.createOscillator(); _echoGain = c.createGain(); _echoLfo = c.createOscillator();
      const lfoGain = c.createGain();
      _echoOsc.type = "sine"; _echoOsc.frequency.value = freq;
      _echoLfo.type = "sine"; _echoLfo.frequency.value = 5.5; lfoGain.gain.value = 4;   // gentle vibrato → "voice"
      _echoLfo.connect(lfoGain); lfoGain.connect(_echoOsc.frequency);
      _echoGain.gain.setValueAtTime(0.0001, t);
      _echoGain.gain.exponentialRampToValueAtTime(0.07, t + 0.1);
      _echoOsc.connect(_echoGain); _echoGain.connect(c.destination);
      _echoOsc.start(t); _echoLfo.start(t);
    } catch (e) {}
  }
  function echoSoundStop() {
    const c = audioCtx(); if (!c || !_echoOsc) return;
    try {
      const t = c.currentTime;
      _echoGain.gain.cancelScheduledValues(t); _echoGain.gain.setValueAtTime(_echoGain.gain.value, t);
      _echoGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      _echoOsc.stop(t + 0.33); _echoLfo.stop(t + 0.33);
    } catch (e) {}
    _echoOsc = null; _echoGain = null; _echoLfo = null;
  }

  // ECHO (press-and-hold): an audio waveform streams from the pressed bead across to the receiving bead.
  // Sender bead = the one at the front of the held bracelet (whom you selected); receiver bead = your bead
  // on THAT person's bracelet (it turns to receive, then lights when the stream lands).
  function startEcho(owner) {
    const p = frontPerson(gSpin[owner]); if (p < 0) return;
    const sNode = GATHER_NODE[p], rNode = GATHER_NODE[owner], note = GATHER_NOTE[owner];
    echoSoundStop();                                                                                          // cut any echo voice still ringing
    if (p === owner) { gBuzz[owner] = { node: rNode, t0: idle, hue: GATHER_HUE[owner] }; buzz(); bell(note, 0.5, 0.1); return; }   // reaching yourself → just a pulse + chime
    gTarget[p] = gSpin[p] + angDelta(gSpin[p], frontAngleOf[rNode]); gSnapping[p] = true;                    // receiver turns to face you
    gEcho = { from: owner, to: p, sNode, rNode, t0: idle, hue: GATHER_HUE[owner], note, arrived: false };
    bell(note, 0.4, 0.07);                                                                                    // soft "send" chime as it leaves
    echoSoundStart(note);                                                                                     // the transmission hums across
    try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}                                       // a soft "sending" cue
  }
  // a bead's world position: its geometry centre (shared local) through that instance's live platform matrix
  function beadWorld(inst, node, out) { const plat = inst.platOf[node], c = beadGeomC[node]; if (!plat || !c) return null; return out.copy(c).applyMatrix4(plat.matrixWorld); }
  function drawEcho(g) {
    if (!echoCtx) return;
    echoCtx.setTransform(1, 0, 0, 1, 0, 0); echoCtx.clearRect(0, 0, echoCanvas.width, echoCanvas.height);
    if (!gEcho) return;
    const e = (idle - gEcho.t0) / ECHO_DUR;
    if (g < 0.9 || e >= 1) { echoSoundStop(); gEcho = null; return; }
    gatherGroup.updateMatrixWorld(true);
    const W = echoCanvas.clientWidth || 1, H = echoCanvas.clientHeight || 1;
    if (!beadWorld(gatherInstances[gEcho.from], gEcho.sNode, _ew1) || !beadWorld(gatherInstances[gEcho.to], gEcho.rNode, _ew2)) return;
    _ep.copy(_ew1).project(camera); if (_ep.z >= 1) return; const sx = (_ep.x * 0.5 + 0.5) * W, sy = (-_ep.y * 0.5 + 0.5) * H;
    _ep.copy(_ew2).project(camera); if (_ep.z >= 1) return; const rx = (_ep.x * 0.5 + 0.5) * W, ry = (-_ep.y * 0.5 + 0.5) * H;
    echoCtx.setTransform(echoCanvas.width / W, 0, 0, echoCanvas.width / W, 0, 0);   // draw in CSS px (square dpr)
    drawWaveStream(echoCtx, sx, sy, rx, ry, e, gEcho.hue);
    if (!gEcho.arrived && e > 0.34) { gEcho.arrived = true; gBuzz[gEcho.to] = { node: gEcho.rNode, t0: idle, hue: gEcho.hue }; bell(gEcho.note * 1.5, 0.55, 0.1); try { if (navigator.vibrate) navigator.vibrate(22); } catch (e2) {} }   // landed: resolve a fifth up on the receiver
  }
  // the waveform itself: a gently bowed channel from sender→receiver with audio-style bars; the stream first
  // REACHES across (front advancing s→r), then bright bands keep FLOWING toward the receiver for the duration.
  function drawWaveStream(ctx, sx, sy, rx, ry, e, hue) {
    const colour = "#" + (hue >>> 0).toString(16).padStart(6, "0");
    const dx = rx - sx, dy = ry - sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const bow = Math.min(len * 0.14, 64), cx = (sx + rx) / 2 + nx * bow, cy = (sy + ry) / 2 + ny * bow;
    const bez = (t) => { const o = 1 - t; return [o * o * sx + 2 * o * t * cx + t * t * rx, o * o * sy + 2 * o * t * cy + t * t * ry]; };
    const tan = (t) => [2 * (1 - t) * (cx - sx) + 2 * t * (rx - cx), 2 * (1 - t) * (cy - sy) + 2 * t * (ry - cy)];
    const reach = Math.min(1, e * 3), gEnv = Math.sin(Math.min(e, 1) * Math.PI), N = Math.max(22, Math.floor(len / 8));
    ctx.save(); ctx.lineCap = "round"; ctx.shadowColor = colour; ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.16 * gEnv; ctx.strokeStyle = colour; ctx.lineWidth = 1.3; ctx.beginPath();   // faint channel
    for (let k = 0; k <= N; k++) { const [bx, by] = bez((k / N) * reach); k ? ctx.lineTo(bx, by) : ctx.moveTo(bx, by); }
    ctx.stroke();
    for (let k = 0; k <= N; k++) {                                                                   // audio bars
      const t = k / N; if (t > reach) break;
      const [bx, by] = bez(t), [tgx, tgy] = tan(t), tl = Math.hypot(tgx, tgy) || 1, pnx = -tgy / tl, pny = tgx / tl;
      const voice = Math.abs(Math.sin(t * 41.3) * 0.55 + Math.sin(t * 83.7 + 1.1) * 0.45);            // irregular → reads as audio
      const ends = Math.sin(t * Math.PI), front = Math.min(1, (reach - t) * 10);                      // taper at both beads + at the advancing front
      const flow = 0.5 + 0.5 * Math.sin((t - e * 1.7) * TAU * 2.6);                                   // bright bands travel toward the receiver
      const amp = (2.5 + 13 * voice) * ends * front * gEnv;
      if (amp < 0.6) continue;
      ctx.globalAlpha = (0.2 + 0.6 * flow) * gEnv * front; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(bx - pnx * amp, by - pny * amp); ctx.lineTo(bx + pnx * amp, by + pny * amp); ctx.stroke();
    }
    ctx.restore();
  }

  // the gather choreography: the main bracelet shrinks from centre, the copies slide IN FROM THE SIDES into a
  // compact 2×3 cluster, then each floats on its own gentle (unsynchronised) bob. Hero text fades.
  function updateGather(g) {
    if (!gatherGroup) return;
    renderer.toneMappingExposure = 1.12 + 0.62 * g;   // lift the matte beads out of the dark as they cluster
    if (g > 0.0015 && outro) { const oo = clamp(1 - smooth(0.0, 0.18, g), 0, 1); outro.style.opacity = String(oo); outro.style.pointerEvents = oo > 0.5 ? "auto" : "none"; }
    if (gatherGuideEl) gatherGuideEl.style.opacity = String(clamp(smooth(0.42, 0.8, g), 0, 1));   // guide fades in as the bracelets settle (outro fades out first)
    const show = g > 0.0015;
    gatherGroup.visible = show; spin.visible = !show;          // hand off from the hero original to the clones
    for (const id of ["#hubLabels", "#beadLabels", "#beadWords"]) { const h = $(id); if (h) h.style.opacity = show ? "0" : ""; }
    if (!show) return;
    camera.updateMatrixWorld(true);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);   // screen-right
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);      // screen-up
    const COLX = GATHER_COLX * modelR, ROWY = GATHER_ROWY * modelR, SIDE = GATHER_SIDE * modelR;
    // 2 columns × 3 rows, in (up,right) screen coords: [u, r]
    const slots = [[ROWY, -COLX], [ROWY, COLX], [0, -COLX], [0, COLX], [-ROWY, -COLX], [-ROWY, COLX]];
    const breathe = matGlow.emissiveIntensity;
    for (let i = 0; i < GATHER_N; i++) {
      const inst = gatherInstances[i];
      const su = slots[i][0], sr = slots[i][1];
      const t0 = 0.04 + i * 0.07;
      const e = smooth(t0, t0 + 0.5, g), ee = e * e * (3 - 2 * e);
      // start: bracelet 0 from the centre (full size); the copies slide in from their column's side
      const startU = i === 0 ? 0 : su, startR = i === 0 ? 0 : Math.sign(sr) * SIDE;
      let u = lerp(startU, su, ee), r = lerp(startR, sr, ee);
      const amp = GATHER_FLOAT * modelR * ee;                                          // subtle, multi-directional drift
      u += Math.sin(idle * GATHER_FSPEED[i] + GATHER_FPHASE[i]) * amp;                 // vertical component
      r += Math.sin(idle * GATHER_FSPEED2[i] + GATHER_FPHASE2[i]) * amp;               // horizontal component
      const scaleNow = lerp(i === 0 ? 1 : GATHER_SCALE, GATHER_SCALE, ee);
      // ping envelope, computed UP FRONT so the vibrate can ride it: expire at 0.7s, half-sine pulse meanwhile
      const b = gBuzz[i];
      if (b && (idle - b.t0) / 0.7 >= 1) gBuzz[i] = null;
      const bb = gBuzz[i];
      const pl = bb ? Math.sin(Math.min((idle - bb.t0) / 0.7, 1) * Math.PI) : 0;
      inst.pivot.position.set(up.x * u + right.x * r, up.y * u + right.y * r, up.z * u + right.z * r);
      inst.pivot.scale.setScalar(scaleNow);
      inst.pivot.quaternion.setFromAxisAngle(right, gPitch[i] * ee);   // bottom row pitches up about the screen-horizontal axis
      // VIBRATE: a ping shakes ONLY the reached bead (its cap + base + symbol meshes), not the whole bracelet
      const shakeNode = bb ? bb.node : -1;
      if (inst._shakeNode !== shakeNode && inst._shakeNode >= 0) {   // a bead was shaking and no longer is → settle it back to rest
        const prev = inst.beadMeshes[inst._shakeNode]; if (prev) for (const bm of prev) bm.mesh.position.copy(bm.base);
      }
      inst._shakeNode = shakeNode;
      if (bb) {
        const sd = Math.max(0, 1 - (idle - bb.t0) / 0.42), k = GATHER_SHAKE * modelR * sd * sd;   // strongest at the hit, gone by ~0.42s
        const dx = Math.sin(idle * 88.0) * k, dy = Math.sin(idle * 97.0 + 1.3) * k, dz = Math.sin(idle * 105.0 + 2.6) * k;   // 3 axes → a visible tremor at any spin
        const meshes = inst.beadMeshes[bb.node];
        if (meshes) for (const bm of meshes) bm.mesh.position.set(bm.base.x + dx, bm.base.y + dy, bm.base.z + dz);
      }
      // spin: drag → momentum → SNAP to the nearest bead's front
      if (gDragging === i) { /* live drag sets gSpin */ }
      else if (gSnapping[i]) { const d = angDelta(gSpin[i], gTarget[i]); gSpin[i] += d * 0.2; if (Math.abs(d) < 0.003) { gSpin[i] = gTarget[i]; gSnapping[i] = false; } }
      else if (Math.abs(gVel[i]) > 0.0004) { gSpin[i] += gVel[i]; gVel[i] *= 0.92; if (Math.abs(gVel[i]) < 0.006) { gVel[i] = 0; gSnapTo(i); } }
      inst.spin.rotation.y = gSpin[i];
      // glow: every lit bead breathes like the hero; a ping flares ONLY the sender's bead (one-to-one), in their hue
      for (const node in inst.beadMat) {
        const m = inst.beadMat[node];
        if (bb && +node === bb.node) { m.emissive.setHex(bb.hue); m.emissiveIntensity = (m.userData.lit ? breathe : 0) + 7 * pl; }
        else if (m.userData.lit) { m.emissive.setHex(0xffb247); m.emissiveIntensity = breathe * (1 - 0.82 * pl); }   // the others dim away so the single reached bead stands alone
        else { m.emissiveIntensity = 0; }
      }
    }
    drawEcho(g);
    canvas.style.cursor = g > 0.92 ? "grab" : "default";
  }

  function build() {
    orient.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.sub(c);
    const size = box.getSize(new THREE.Vector3());
    modelR = Math.max(size.x, size.y, size.z) * 0.5;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(modelR * 40, modelR * 40), new THREE.ShadowMaterial({ opacity: 0.2 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -modelR * 1.15; ground.receiveShadow = true; scene.add(ground);

    ready = true;
    if (loaderEl) loaderEl.classList.add("hide");
    poster.classList.add("hide");
    onScroll(); render();
  }

  // ---- overlay ----
  const intro = $("#heroIntro"), outro = $("#heroOutro"), cue = $("#heroCue"), bar = $("#heroProgress span");
  const gatherGuideEl = $("#gatherGuide");
  const capWrap = $("#heroCaption"), capK = capWrap?.querySelector(".hc-kicker"), capT = capWrap?.querySelector(".hc-title"), capL = capWrap?.querySelector(".hc-line");
  // Scene-tied hero narrative — captions are PINNED to what the bracelet is doing (not spread evenly), so each
  // idea lands while the visual proves it: the bead opens → "alive / you touch it, it answers"; the spin →
  // "a bead per person", then "every symbol means something"; the hub opens → "the core". One screen-free line
  // per moment, never a spec dump. Claim discipline: descriptive only — no battery hours, no waterproof rating,
  // no GPS here until the specs are shippable (see the hub copy + the spec-claims note).
  const SCENE = {
    bead:    { k: "Alive in your hand",   t: "Touch it. It answers.",         l: "A gold plate beneath each symbol feels your touch — and answers in light, a soft pulse, and a voice." },
    person:  { k: "One bead, one person", t: "Everyone gets their own.",      l: "Not one screen for everyone — each person you love lives on their own bead. Nothing else is built this way." },
    symbols: { k: "Adinkra",              t: "Every symbol means something.", l: "Each bead is engraved with an Adinkra symbol — endurance, return, the bonds that hold people together." },
    hub:     { k: "The core",             t: "Everything, quietly inside.",   l: "The battery, the sound, the mic, the brains — sealed into a hub small enough to forget you're wearing." },
  };
  function overlay(p, rawP) {            // p == anim (de-dwelled); rawP == raw scroll (keeps advancing through dwells)
    // Fade the intro on RAW scroll, not anim. The bead explodes at its natural front (early), and anim
    // FREEZES during that dwell — so an anim-based fade would leave the intro frozen on top of the
    // explosion. Raw scroll keeps moving, so the copy clears before the bead opens.
    const introOp = 1 - smooth(0.035, 0.085, rawP == null ? p : rawP);
    if (intro) intro.style.opacity = introOp;
    if (cue) cue.style.opacity = introOp;
    section.style.setProperty("--intro-op", String(introOp));   // light-mode hero veil fades WITH the intro copy
    const outOp = smooth(0.9, 0.99, p);
    // the touch-demo takes over the outro fade once you scroll into it (suppressOutro); default off = unchanged
    if (outro && !(window.__hero && window.__hero._suppressOutro)) { outro.style.opacity = outOp; outro.style.pointerEvents = outOp > 0.5 ? "auto" : "none"; }
    if (bar) bar.style.transform = `scaleX(${p})`;
    // bottom prose captions removed: the exploded-bead callouts (TOUCH/LIGHT/A pulse), the
    // on-bead words ("Everyone gets their own"), and the hub component labels carry the story.
    if (capWrap) capWrap.style.opacity = "0";
  }

  let ready = false, progress = 0, target = 0, idle = 0, inView = true;
  function onScroll() {
    const rect = section.getBoundingClientRect();
    const total = section.offsetHeight - window.innerHeight;
    target = clamp(-rect.top / Math.max(total, 1), 0, 1);
  }
  function resize() {
    // size to the canvas's ACTUAL displayed box, not window.innerHeight — on mobile the URL bar makes
    // innerHeight taller than the 100dvh canvas, and a taller buffer squished into a shorter box stretches
    // the render (beads go wide). Matching the buffer aspect to the display box keeps spheres round.
    const w = canvas.clientWidth || section.clientWidth || window.innerWidth || 1280;
    const h = canvas.clientHeight || window.innerHeight || 800;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.setSize(w, h);
    sizeEchoCanvas();
  }
  // a 2-D overlay (over the WebGL canvas) the Echo waveform stream is drawn onto, sized to the same displayed box
  function makeEchoCanvas() {
    if (echoCanvas) return;
    echoCanvas = document.createElement("canvas"); echoCanvas.setAttribute("aria-hidden", "true");
    echoCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;";
    (canvas.parentElement || document.body).appendChild(echoCanvas);
    echoCtx = echoCanvas.getContext("2d");
    sizeEchoCanvas();
  }
  function sizeEchoCanvas() {
    if (!echoCanvas) return;
    const w = echoCanvas.clientWidth || canvas.clientWidth || 1, h = echoCanvas.clientHeight || canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    echoCanvas.width = Math.round(w * dpr); echoCanvas.height = Math.round(h * dpr);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.7, 0.86); // soft gold glints
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function update(rawP) {
    // the first HERO_FRAC of the (taller) section drives the existing hero exactly as before; the remainder
    // drives the gather. heroP stays clamped at 1 through the gather so the bracelet holds its settled pose.
    const p = Math.min(1, rawP / HERO_FRAC);
    const gather = Math.max(0, Math.min(1, (rawP - HERO_FRAC) / (GATHER_END - HERO_FRAC)));   // reaches 1 before the end → an interactive dwell
    gLast = gather;
    // each reveal "steals" a dwell of scroll where spin + threading FREEZE while it opens & reassembles. Walk the
    // dwells (sorted by pE) to map raw scroll p -> animation progress + each reveal's local explode phase e.
    let anim = p;
    for (const rv of reveals) rv._e = 0;
    if (reveals.length) {
      const totalW = reveals.reduce((s, rv) => s + rv.W, 0), r = 1 / (1 - totalW);
      let remaining = p, a = 0;
      for (const rv of reveals) {
        const gap = (rv.pE - a) / r;                       // scroll to advance anim from a up to this reveal's pE
        if (remaining <= gap) { a += remaining * r; remaining = 0; break; }
        remaining -= gap; a = rv.pE;
        if (remaining <= rv.W) { rv._e = remaining / rv.W; remaining = 0; break; }   // inside this dwell
        remaining -= rv.W;                                 // past it (reassembled), keep walking
      }
      if (remaining > 0) a += remaining * r;
      anim = clamp(a, 0, 1);
    }
    const settle = smooth(SETTLE0, 1, anim);       // 0 through the scroll, ramps to 1 at the very end (the pan-out)
    let spinY = SPIN_PHASE + anim * TAU * SPIN_TURNS;
    if (settle > 0) { let dd = endSpin - spinY; dd = ((dd + Math.PI) % TAU + TAU) % TAU - Math.PI; spinY += dd * settle; }   // ease to hub-at-back
    spin.rotation.y = spinY;
    const f = Math.min(1, anim * 1.8);             // trace draws faster than the spin so it keeps pace (no lag)
    if (cordMesh) {
      cordMesh.geometry.setDrawRange(0, Math.floor(cordTotal * f));
      if (cordTip && cordCurve) {                    // rounded tip caps the growing end (and the far hub end at full trace)
        cordTip.visible = f > 0.004;
        cordTip.position.copy(cordCurve.getPointAt(Math.min(f, 1)));
        if (cordStart) cordStart.visible = f > 0.004;
      }
    }
    if (braidB) { const n = Math.floor(braidTotal * f); braidB.geometry.setDrawRange(0, n); braidC.geometry.setDrawRange(0, n); }
    matGlow.emissiveIntensity = 2.0 + 0.45 * (0.5 + 0.5 * Math.sin(idle * 0.55));   // LED breathing, toned down (2.0..2.45)
    matLED.emissiveIntensity = 3.4 + 0.7 * (0.5 + 0.5 * Math.sin(idle * 0.6));      // the exploded bead's small PCB LED breathes (3.4..4.1)
    placeCamera(settle, gather);
    for (const rv of reveals) updateExplode(rv, rv._e);
    updateHubLabels(hubAsm ? hubAsm._e : 0);
    updateBeadLabels(beadAsm ? beadAsm._e : 0);
    updateBeadWords(anim);
    // NOTE: no end-of-scroll hub rotation. Any "button up" rotation tilts the hub OUT of the
    // bracelet plane — but the cord and every bead's bus holes lie in one plane, so the hub must
    // stay in that plane too (exactly where it's threaded). It keeps its natural threaded
    // orientation through the settle, coplanar with the beads, so the cord stays in the bus holes.
    overlay(anim, p);
    updateGather(gather);
  }

  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
    idle += 0.016;
    progress += (target - progress) * 0.09;
    if (Math.abs(target - progress) < 0.0002) progress = target;
    if (ready && inView) { update(progress); composer.render(); }
  }

  window.__hero = {
    setProgress(p) { p = clamp(p, 0, 1); target = progress = p; if (ready) { update(p); composer.render(); } },
    suppressOutro(v) { this._suppressOutro = v; },   // the touch-demo owns the outro fade once it's in view
    get progress() { return progress; },
    get ready() { return ready; },
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", resize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);   // mobile URL-bar show/hide resizes the canvas box
  new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { threshold: 0 }).observe(section);
  resize();

  // ---- gather interaction: drag a bracelet to spin it; tap it to light up + buzz (only once gathered) ----
  const gRay = new THREE.Raycaster();
  function gPick(ev) {
    if (!gatherGroup || !gatherGroup.visible) return -1;
    const rect = canvas.getBoundingClientRect();
    gRay.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hits = gRay.intersectObject(gatherGroup, true);
    if (!hits.length) return -1;
    let o = hits[0].object; while (o && o.parent !== gatherGroup) o = o.parent;
    return gatherInstances.findIndex((g) => g.pivot === o);
  }
  const clearHold = () => { if (gHoldTimer) { clearTimeout(gHoldTimer); gHoldTimer = null; } };
  canvas.addEventListener("pointerdown", (ev) => {
    if (gLast < 0.92) return;
    const i = gPick(ev); if (i < 0) return;
    audioCtx();   // wake the AudioContext inside this gesture so the hold-fired Echo is allowed to sound
    gDragging = i; gDownX = gLastX = ev.clientX; gMoved = false; gVel[i] = 0;
    gHeld = false; clearHold();
    gHoldTimer = setTimeout(() => { gHoldTimer = null; if (gDragging === i && !gMoved) { gHeld = true; startEcho(i); } }, ECHO_HOLD);   // hold → Echo
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (gDragging < 0) return;
    if (Math.abs(ev.clientX - gDownX) > 4) { gMoved = true; clearHold(); }   // a drag cancels the pending Echo
    const d = (ev.clientX - gLastX) * 0.012;
    gSpin[gDragging] += d; gVel[gDragging] = d; gLastX = ev.clientX;
  });
  const gEnd = (ev) => {
    if (gDragging < 0) return; const i = gDragging; gDragging = -1;
    clearHold();
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    if (gHeld) { gHeld = false; }                        // the Echo already fired on the long press — no tap
    else if (!gMoved) gReach(i);                         // quick tap → directed Pulse to the front person's bracelet
    else if (Math.abs(gVel[i]) < 0.006) gSnapTo(i);     // slow release → snap now; else momentum carries, then snaps
  };
  canvas.addEventListener("pointerup", gEnd);
  canvas.addEventListener("pointercancel", gEnd);

  // matte Akoma_4E look: deep matte-black resin + warm gold (no glossy clearcoat)
  const matBlack = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.82, metalness: 0.0, clearcoat: 0.0, envMapIntensity: 0.2 });
  const matGold = new THREE.MeshStandardMaterial({ color: 0xc6a24c, roughness: 0.36, metalness: 1.0, envMapIntensity: 0.6 });
  // the platform behind each lit bead's symbol: a bright warm-gold EMISSIVE so the internal LED reads as light
  // through the symbol cut-throughs — a genuinely BACKLIT symbol. The bloom pass turns the lit symbol into a soft
  // halo. Low metalness so it reads as a glowing light source, not shiny metal. Breathed gently in update().
  const matGlow = new THREE.MeshStandardMaterial({ color: 0xffd089, emissive: 0xffb247, emissiveIntensity: 2.3, roughness: 0.5, metalness: 0.15 });
  // the gold CAPACITIVE TOUCH / backlight plate inside each bead. In the explode it's a flat disc seen near edge-on
  // from the low camera, so a plain gold finish barely reads — instead it GLOWS warm gold (the "touch it, it answers
  // in light" moment made literal), which stays unmistakable at any angle and blooms softly.
  const matPlate = new THREE.MeshStandardMaterial({ color: 0xffcf7a, emissive: 0xffb24a, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.55 });
  // the gold capacitive ELECTRODE plate — a passive touch pad, NOT a light source.
  // Satin warm gold with lower metalness so it catches the key light and reads as a
  // gold surface at the low camera angle (rather than a dark mirror). The glow comes
  // from the LED on the PCB, not from this plate.
  const matElectrode = new THREE.MeshStandardMaterial({ color: 0xdcb35f, roughness: 0.46, metalness: 0.4, envMapIntensity: 0.7 });
  // the PCB's indicator LED — THIS is the actual light source. Bright warm emissive that
  // blooms; breathed gently in update() like the backlit symbols.
  const matLED = new THREE.MeshStandardMaterial({ color: 0xfff1d4, emissive: 0xffb24a, emissiveIntensity: 3.2, roughness: 0.4, metalness: 0.0 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.46, metalness: 0.55, envMapIntensity: 0.35 });
  const remap = (m) => { const mm = (m && m.metalness !== undefined) ? m.metalness : 0; return mm > 0.8 ? matGold : (mm > 0.3 ? matMetal : matBlack); };

  // ---- black macramé cord — REAL path traced from the Fusion-threaded cord ("Body13" in
  // makoma_threaded). Centerline extracted in Blender; closed loop through all 8 bead
  // bus-holes and the hub, in the same gltf frame as bracelet_threaded.glb so it threads
  // exactly. Radius matched to the Ø2.6 mm bus-holes (≈0.13 model units, ~0.0966 u/mm). ----
  const CORD_PATH = [
    [-1.7119,0.0008,0.7003], [-1.8506,0.0008,0.7424], [-2.1044,0.0012,0.6781], [-2.3372,0.0012,0.6510],
    [-2.6085,0.0015,0.5994], [-2.7991,0.0011,0.6523], [-3.0102,0.0010,0.7046], [-3.2010,0.0010,0.7889],
    [-3.3715,0.0010,0.8970], [-3.5664,0.0011,1.0803], [-3.7252,0.0010,1.2955], [-3.8493,0.0010,1.5199],
    [-3.8916,0.0010,1.7126], [-3.9518,0.0016,1.8646], [-3.9752,0.0016,2.1147], [-4.0022,0.0016,2.3738],
    [-3.9935,0.0011,2.6689], [-4.0045,0.0011,2.8668], [-4.0096,0.0011,3.0347], [-3.9980,0.0011,3.2275],
    [-3.9695,0.0011,3.4154], [-3.9281,0.0011,3.5957], [-3.8784,0.0011,3.7559], [-3.8317,0.0012,3.9302],
    [-3.7848,0.0011,4.1126], [-3.7429,0.0011,4.2946], [-3.6921,0.0011,4.4776], [-3.6271,0.0011,4.6523],
    [-3.5445,0.0011,4.8020], [-3.4385,0.0011,4.9321], [-3.2908,0.0008,5.0453], [-3.1627,0.0009,5.1581],
    [-3.0520,0.0010,5.2678], [-2.9713,0.0014,5.3795], [-2.8451,0.0013,5.4899], [-2.6678,0.0012,5.6351],
    [-2.4474,0.0011,5.8093], [-2.1852,0.0008,5.9802], [-1.9883,0.0009,6.1086], [-1.8311,0.0009,6.1963],
    [-1.7300,0.0013,6.2659], [-1.5960,0.0013,6.3207], [-1.4296,0.0010,6.3218], [-1.2796,0.0012,6.3307],
    [-1.1311,0.0012,6.3322], [-0.9903,0.0012,6.3314], [-0.8740,0.0015,6.3644], [-0.7128,0.0011,6.3189],
    [-0.6164,0.0018,6.3731], [-0.4287,0.0012,6.3321], [-0.2197,0.0015,6.3592], [0.1012,0.0012,6.3231],
    [0.3952,0.0012,6.3169], [0.6390,0.0015,6.3406], [0.7720,0.0011,6.3031], [0.9038,0.0011,6.3022],
    [1.0484,0.0012,6.3094], [1.1919,0.0012,6.3112], [1.3959,0.0013,6.3270], [1.5736,0.0010,6.2973],
    [1.8094,0.0013,6.3252], [1.9733,0.0012,6.2974], [2.1445,0.0012,6.2679], [2.3150,0.0011,6.2223],
    [2.4626,0.0010,6.1568], [2.5953,0.0010,6.0800], [2.7198,0.0011,5.9753], [2.8925,0.0018,5.8693],
    [2.9815,0.0015,5.7453], [3.1378,0.0015,5.5805], [3.2864,0.0011,5.4145], [3.4791,0.0015,5.2431],
    [3.5657,0.0012,5.1246], [3.6271,0.0009,4.9932], [3.7065,0.0008,4.8418], [3.7886,0.0012,4.6456],
    [3.8358,0.0012,4.4043], [3.8821,0.0012,4.1357], [3.9332,0.0012,3.8603], [3.9773,0.0011,3.5738],
    [4.0026,0.0011,3.3162], [4.0085,0.0011,3.0832], [4.0333,0.0015,2.8628], [4.0112,0.0014,2.6810],
    [3.9953,0.0014,2.4908], [3.9442,0.0010,2.2894], [3.9372,0.0014,2.0114], [3.9061,0.0012,1.7652],
    [3.8675,0.0012,1.5483], [3.7644,0.0007,1.3764], [3.6701,0.0009,1.2083], [3.5353,0.0009,1.0736],
    [3.3907,0.0012,0.9705], [3.1797,0.0011,0.8910], [2.9453,0.0011,0.8466], [2.7233,0.0012,0.8153],
    [2.5062,0.0013,0.7958], [2.3093,0.0013,0.7715], [2.1000,0.0009,0.7834], [1.9191,0.0008,0.7831],
    [1.7583,0.0009,0.7640], [0.6052,0.0009,0.7123], [-0.5427,0.0009,0.6946],
  ];
  const tl = new THREE.TextureLoader();
  const cordNormal = tl.load("assets/textures/cord_normal.png");
  const cordRough = tl.load("assets/textures/cord_rough.png");
  [cordNormal, cordRough].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(120, 2); });
  cordNormal.colorSpace = THREE.NoColorSpace;
  const matCord = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.2, normalMap: cordNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: cordRough, side: THREE.DoubleSide });
  let cordMesh = null, cordTotal = 0, cordCurve = null, cordTip = null, cordStart = null;
  let cordEndL = null, cordEndR = null;   // the two cord ends at the hub (model space) = the bus-hole axis
  let CORD_RAD = 0.2;  // core cord — fattened from the Ø2.8 mm path so it fully backs the sennit (no see-through
                       // gaps between the braid coils): the sennit/wraps read as a SOLID rope, not a hollow coil.
  function buildCord() {
    if (cordMesh) { model.remove(cordMesh); cordMesh.geometry.dispose(); cordMesh = null; }
    // drop the last 2 points (they cut ACROSS the hub) and run OPEN — the cord ends at the hub on both sides
    // instead of looping straight through it. Then EXTEND each end along its tangent so it embeds INTO the hub
    // wall (the thread fuses into the hub instead of floating in front of it).
    const raw = CORD_PATH.slice(0, 101).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const n = raw.length, CORD_EMBED = 0.5;
    const pL = raw[0].clone().addScaledVector(raw[0].clone().sub(raw[1]).normalize(), CORD_EMBED);
    const pR = raw[n - 1].clone().addScaledVector(raw[n - 1].clone().sub(raw[n - 2]).normalize(), CORD_EMBED);
    cordEndL = pL.clone(); cordEndR = pR.clone();   // remember the hub entries for the settle rotation
    const pts = [pL, ...raw, pR];
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const geo = new THREE.TubeGeometry(curve, 760, CORD_RAD, 12, false);
    cordMesh = new THREE.Mesh(geo, matCord); cordMesh.castShadow = true; cordMesh.receiveShadow = true;
    cordTotal = geo.index ? geo.index.count : geo.attributes.position.count;
    geo.setDrawRange(0, Math.floor(cordTotal * Math.min(1, progress * 1.8)));
    model.add(cordMesh);
    cordCurve = curve;
    if (cordTip) { model.remove(cordTip); cordTip.geometry.dispose(); }
    if (cordStart) { model.remove(cordStart); cordStart.geometry.dispose(); }
    cordTip = new THREE.Mesh(new THREE.SphereGeometry(CORD_RAD, 16, 12), matCord);
    cordTip.castShadow = true; cordTip.receiveShadow = true; model.add(cordTip);
    cordStart = new THREE.Mesh(new THREE.SphereGeometry(CORD_RAD, 16, 12), matCord);
    cordStart.castShadow = true; cordStart.receiveShadow = true;
    cordStart.position.copy(curve.getPointAt(0)); model.add(cordStart);   // cap the hub end too
  }
  window.__rebuild = (R) => { if (R !== undefined) CORD_RAD = R; buildCord(); };

  // ---- second cord: the Shamballa macramé braid (two working cords B & C) wrapping the main cord,
  //      weaving over the top / under the bottom belt grooves of the beads. Traced in sync with the main cord. ----
  let braidB = null, braidC = null, braidTotal = 0;
  // founder-tuned tight dense sennit (the run BETWEEN beads):
  let BRAID_R = 0.19, BRAID_FREQ = 69, BRAID_RAD = 0.065, BRAID_OVER = 0.18, BRAID_K = 3.0;
  // bead-wrap: at each bead the two working cords leave the sennit and ride the bead's REAL top/bottom belt
  // grooves (extracted from the founder's Fusion groove pipes), then resume the sennit.
  let BEAD_RGROW = 0.03, BEAD_BLEND = 0.22, BEAD_ON = 1;   // wrap radius grown past the groove floor · arc->sennit blend width near the bead's side · on/off
  // the 8 Adinkra bead centres in the cord/glTF frame (vertex-density-along-cord over bracelet_threaded.glb;
  // each sits ON the cord — the hub/closure region is correctly excluded).
  const BEAD_CENTERS = [   // full-bead geometric centres (base+cap+platform) = the belt-groove centres
    [-3.9372, 0.0, 2.2015], [3.9402, 0.0, 2.2948], [3.8848, 0.0, 4.0827], [3.0354, -0.0007, 5.6426],
    [1.25, 0.0, 6.3], [-0.7849, 0.0, 6.317], [-2.6822, 0.0, 5.5997], [-3.8073, 0.0, 4.0195],
  ];
  // the REAL top/bottom belt-groove centrelines per bead, from the founder's Fusion groove pipes
  // (makoma_threaded), in the cord/glTF frame. Each runs PARALLEL to the cord through the bead, arcing up to
  // the bead's top (~0.70) and down to ~0.52 at the bus-hole ends.
  const BEAD_PIPES = [
    { top: [[-3.895,0.520,1.723],[-3.901,0.564,1.790],[-3.911,0.627,1.905],[-3.924,0.678,2.051],[-3.937,0.696,2.202],[-3.950,0.678,2.353],[-3.963,0.627,2.499],[-3.973,0.564,2.613],[-3.979,0.520,2.681]],
      bot: [[-3.979,-0.517,2.685],[-3.973,-0.561,2.617],[-3.963,-0.626,2.501],[-3.950,-0.678,2.353],[-3.937,-0.696,2.202],[-3.924,-0.678,2.051],[-3.911,-0.626,1.903],[-3.901,-0.561,1.786],[-3.895,-0.517,1.719]] },
    { top: [[3.898,0.517,1.812],[3.904,0.561,1.879],[3.914,0.626,1.996],[3.927,0.678,2.143],[3.940,0.696,2.295],[3.953,0.678,2.446],[3.966,0.626,2.593],[3.977,0.561,2.710],[3.982,0.517,2.777]],
      bot: [[3.982,-0.520,2.774],[3.976,-0.564,2.706],[3.966,-0.627,2.591],[3.953,-0.678,2.445],[3.940,-0.696,2.295],[3.927,-0.678,2.144],[3.914,-0.627,1.998],[3.904,-0.564,1.883],[3.898,-0.520,1.815]] },
    { top: [[3.969,0.517,3.606],[3.957,0.561,3.672],[3.937,0.626,3.788],[3.911,0.678,3.934],[3.885,0.696,4.083],[3.858,0.678,4.232],[3.833,0.626,4.378],[3.812,0.561,4.494],[3.801,0.517,4.560]],
      bot: [[3.801,-0.520,4.557],[3.813,-0.564,4.490],[3.833,-0.627,4.376],[3.859,-0.678,4.232],[3.885,-0.696,4.083],[3.911,-0.678,3.934],[3.937,-0.627,3.790],[3.957,-0.564,3.676],[3.968,-0.520,3.609]] },
    { top: [[3.380,0.516,5.298],[3.332,0.559,5.346],[3.248,0.625,5.430],[3.143,0.679,5.535],[3.035,0.696,5.643],[2.928,0.679,5.750],[2.822,0.625,5.856],[2.738,0.559,5.940],[2.691,0.516,5.987]],
      bot: [[2.695,-0.520,5.983],[2.743,-0.564,5.935],[2.825,-0.627,5.853],[2.928,-0.678,5.750],[3.035,-0.695,5.643],[3.142,-0.678,5.536],[3.246,-0.627,5.432],[3.327,-0.564,5.351],[3.375,-0.520,5.303]] },
    { top: [[1.731,0.520,6.300],[1.663,0.564,6.300],[1.548,0.627,6.300],[1.401,0.678,6.300],[1.250,0.696,6.300],[1.099,0.678,6.300],[0.952,0.627,6.300],[0.837,0.564,6.300],[0.769,0.520,6.300]],
      bot: [[0.766,-0.517,6.300],[0.833,-0.561,6.300],[0.950,-0.626,6.300],[1.098,-0.678,6.300],[1.250,-0.696,6.300],[1.402,-0.678,6.300],[1.550,-0.626,6.300],[1.667,-0.561,6.300],[1.734,-0.517,6.300]] },
    { top: [[-0.304,0.520,6.317],[-0.372,0.564,6.317],[-0.487,0.627,6.317],[-0.633,0.678,6.317],[-0.785,0.696,6.317],[-0.936,0.678,6.317],[-1.083,0.627,6.317],[-1.198,0.564,6.317],[-1.266,0.520,6.317]],
      bot: [[-1.269,-0.517,6.317],[-1.202,-0.561,6.317],[-1.085,-0.626,6.317],[-0.937,-0.678,6.317],[-0.785,-0.696,6.317],[-0.633,-0.678,6.317],[-0.485,-0.626,6.317],[-0.368,-0.561,6.317],[-0.300,-0.517,6.317]] },
    { top: [[-2.313,0.520,5.909],[-2.365,0.564,5.865],[-2.454,0.627,5.791],[-2.566,0.678,5.697],[-2.682,0.696,5.600],[-2.798,0.678,5.502],[-2.910,0.627,5.408],[-2.998,0.564,5.334],[-3.050,0.520,5.291]],
      bot: [[-3.055,-0.515,5.287],[-3.004,-0.558,5.330],[-2.912,-0.625,5.406],[-2.798,-0.678,5.502],[-2.682,-0.696,5.600],[-2.565,-0.678,5.697],[-2.451,-0.625,5.793],[-2.360,-0.558,5.870],[-2.309,-0.515,5.913]] },
    { top: [[-3.683,0.520,4.485],[-3.700,0.564,4.419],[-3.730,0.627,4.307],[-3.768,0.678,4.166],[-3.807,0.696,4.020],[-3.846,0.678,3.874],[-3.884,0.627,3.732],[-3.914,0.564,3.621],[-3.932,0.520,3.555]],
      bot: [[-3.933,-0.515,3.549],[-3.916,-0.558,3.614],[-3.885,-0.625,3.729],[-3.847,-0.678,3.873],[-3.807,-0.696,4.020],[-3.768,-0.678,4.167],[-3.729,-0.625,4.311],[-3.699,-0.558,4.426],[-3.681,-0.515,4.490]] },
  ];
  function buildBraid() {
    for (const m of [braidB, braidC]) if (m) { model.remove(m); m.geometry.dispose(); }
    braidB = braidC = null;
    if (!cordCurve) return;
    const N = 2000, up = new THREE.Vector3(0, 1, 0);
    const total = cordCurve.getLength() || 1;
    const THETA_END = Math.PI / 2;   // sweep each groove from its crown (0) down to the bead's side (±90°)
    // per bead: cord-t at its centre + a frame FITTED TO THE USER'S PIPE POINTS for each groove — centre O (the
    // bead centre, verified to be the groove circle's centre), in-plane crown dir (eUp) and axis (eAxis), and the
    // pipe's own radius R. So the wrap rides the actual pipe through its real extent, and the SAME circle is
    // continued past the pipe ends, down the bead's side to the sennit (lift->0 at ±90°, y≈0). eAxis is sign-
    // aligned to the cord so the top and bottom grooves sweep to the SAME side and converge at the bead's edge.
    const beadG = BEAD_CENTERS.map((bc, k) => {
      const O = new THREE.Vector3(bc[0], bc[1], bc[2]);
      let bt = 0, bd = Infinity;
      for (let j = 0; j < 1600; j++) { const tt = j / 1600; const d = cordCurve.getPointAt(tt).distanceToSquared(O); if (d < bd) { bd = d; bt = tt; } }
      const cordDir = cordCurve.getTangentAt(bt).clone().normalize();   // used ONLY to pick the +sweep direction
      const fit = (raw) => {
        const P = raw.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
        const eUp = P[4].clone().sub(O).normalize();                    // centre -> groove crown (a pipe point)
        const eAxis = P[P.length - 1].clone().sub(O);
        eAxis.addScaledVector(eUp, -eAxis.dot(eUp)).normalize();         // in-plane, perp to eUp (the pipe's axis)
        if (eAxis.dot(cordDir) < 0) eAxis.multiplyScalar(-1);            // +sweep = +cord (top & bottom agree)
        let R = 0; for (const p of P) R += p.distanceTo(O); R /= P.length;
        return { eUp, eAxis, R };
      };
      return { t: bt, O, top: fit(BEAD_PIPES[k].top), bot: fit(BEAD_PIPES[k].bot) };
    });
    const ptsA = [], ptsC = [], tan = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const t = i / N, base = cordCurve.getPointAt(t);
      cordCurve.getTangentAt(t, tan);
      u.copy(up).addScaledVector(tan, -up.dot(tan)); if (u.lengthSq() < 1e-6) u.set(0, 1, 0); u.normalize();
      w.crossVectors(tan, u).normalize();
      // SENNIT (between beads): cords run +/-R and swap sides at each crossing with an over/under pulse.
      const ph = t * BRAID_FREQ * TAU, sn = Math.sin(ph);
      const sq = Math.tanh(BRAID_K * sn), pulse = (1 - sq * sq) * Math.cos(ph);
      const sB = base.clone().addScaledVector(u, BRAID_R * sq).addScaledVector(w, BRAID_OVER * pulse);
      const sC = base.clone().addScaledVector(u, -BRAID_R * sq).addScaledVector(w, -BRAID_OVER * pulse);
      let pB = sB, pC = sC;
      if (BEAD_ON) {
        let bi = -1, dt = 0, ad = 1;
        for (let k = 0; k < beadG.length; k++) { let d = t - beadG[k].t; d -= Math.round(d); if (Math.abs(d) < ad) { ad = Math.abs(d); dt = d; bi = k; } }
        const g = beadG[bi], halfWin = (g.top.R + BEAD_RGROW) / total;   // cord-t half-window: edge lands at the side
        if (ad < halfWin) {
          // sweep the groove's own circle from crown (frac 0) to side (frac ±1 -> θ ±90°): rides the user's pipe
          // through its real ±43°, then CONTINUES THE SAME CIRCLE down the bead's side to the sennit — external,
          // never through the body.
          const frac = dt / halfWin, th = frac * THETA_END, ct = Math.cos(th), st = Math.sin(th);
          const RwT = g.top.R + BEAD_RGROW, RwB = g.bot.R + BEAD_RGROW;
          const wB = g.O.clone().addScaledVector(g.top.eUp, RwT * ct).addScaledVector(g.top.eAxis, RwT * st);
          const wC = g.O.clone().addScaledVector(g.bot.eUp, RwB * ct).addScaledVector(g.bot.eAxis, RwB * st);
          const rel = Math.abs(frac), a = 1 - BEAD_BLEND;               // blend to sennit only near the side
          const tt = Math.min(1, Math.max(0, (rel - a) / (1 - a))), oscW = tt * tt * (3 - 2 * tt);
          pB = wB.lerp(sB, oscW); pC = wC.lerp(sC, oscW);
        }
      }
      ptsA.push(pB); ptsC.push(pC);
    }
    const mk = (pp) => {
      const cu = new THREE.CatmullRomCurve3(pp, false, "centripetal");   // OPEN — the braid ends at the hub, not a loop
      const g = new THREE.TubeGeometry(cu, 2600, BRAID_RAD, 10, false);
      const m = new THREE.Mesh(g, matCord); m.castShadow = true; m.receiveShadow = true; model.add(m); return m;
    };
    braidB = mk(ptsA); braidC = mk(ptsC);
    braidTotal = braidB.geometry.index ? braidB.geometry.index.count : braidB.geometry.attributes.position.count;
  }

  // ---- EXPLODED-VIEW reveals. As the spin/threading runs, certain assemblies FREEZE in frame, tilt their axis
  //      to vertical and split flat to show real internals, then reassemble and resume. Two reveals: the
  //      akoma_ntoaso bead (real KiCad board + ERM motor) and the core hub (real KiCad board + battery + speaker).
  const MM = 0.0966;                 // hero units per millimetre
  const EXPLODE_BEAD = 7;            // BEAD_CENTERS index of akoma_ntoaso
  const EXPLODE_NODE = '1';          // its GLB node suffix: FB_CAP1 / FB_BASE1 / PLATFORM1
  const EXPLODE_WIN = 0.2;           // scroll fraction each reveal's dwell occupies (spin/trace freeze)
  const EXPLODE_AXIS = new THREE.Vector3(0, 1, 0);   // world axis each assembly tilts to & splits along (Three Y-up = CAD +Z)
  const reveals = [];                // [{ pivot, parts:[{obj,rest,dir,dist}], axis, pE, W, internals:[...], presentSpin }]
  // end-of-scroll SETTLE: the spin eases to a stop with the hub at the back, the camera rises to a top-front 3/4
  // view and pulls back to frame the whole bracelet, and the hub rotates upright (button up) like the product shot.
  const SETTLE0 = 0.82, CAM_EL_END = 27, CAM_DIST_END = 4.7, CAM_PAN_END = 0.5;
  let hubAsm = null, beadAsm = null, endSpin = 0;

  function buildBoard(url, axis) {   // a REAL routed board exported from KiCad (Draco glTF), laid flat ⟂ axis
    const g = new THREE.Group();     // filled asynchronously when the board GLB loads
    loader.load(url, (gltf) => {
      const board = gltf.scene;
      board.position.sub(new THREE.Box3().setFromObject(board).getCenter(new THREE.Vector3()));   // centre on origin
      board.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const holder = new THREE.Group();
      holder.add(board);
      holder.scale.setScalar(MM * 1000);                                 // KiCad glTF is in metres -> hero units
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);   // component side -> assembly axis
      g.add(holder);
    }, undefined, (e) => console.warn("[hero3d] board load failed:", url, e));
    return g;
  }
  const mkMetal = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  function buildBox(L, T, W, axis, mat, decor) {   // an L×W slab, T thick; its thin (Y) axis aligned to `axis`
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(L * MM, T * MM, W * MM), mat));
    if (decor) decor(g);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  function buildBattery(axis) {      // PKCELL LP402025 LiPo pouch, 25 × 20 × 4 mm
    return buildBox(25, 4, 20, axis, mkMetal(0xb9bcc4, 0.42, 0.7), (g) => {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(4 * MM, 4 * MM, 6 * MM), mkMetal(0xc9a84a, 0.45, 0.6));
      tab.position.x = 13 * MM; g.add(tab);                              // foil tab / leads on one edge
    });
  }
  function buildSpeaker(axis) {      // Soberton SP-1308 micro speaker, 13 × 8 × 2.5 mm
    return buildBox(13, 2.5, 8, axis, mkMetal(0x202024, 0.5, 0.55), (g) => {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(3 * MM, 3.4 * MM, 0.5 * MM, 20), mkMetal(0x111114, 0.7, 0.15));
      cone.position.y = 1.45 * MM; g.add(cone);
    });
  }
  function buildMotor(axis) {         // Adafruit 1201 ERM: Φ10 × 2.7 mm can + eccentric weight + leads
    const g = new THREE.Group();
    const R = 5.0 * MM, thk = 2.7 * MM;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(R, R, thk, 28),
      new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.85 }));
    g.add(can);
    const weight = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.62, thk * 0.7, 24, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xcaa24a, roughness: 0.3, metalness: 0.95 }));  // brass eccentric mass
    weight.position.y = thk * 0.18; g.add(weight);
    for (const [c, dx] of [[0xb22222, -1.2 * MM], [0x161616, 1.2 * MM]]) {                       // red/black flying leads
      const lead = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * MM, 0.45 * MM, 3.2 * MM, 8),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
      lead.position.set(dx, thk / 2 + 1.6 * MM, 0); g.add(lead);
    }
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);   // can axis along the assembly axis
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  // recenter a GLB shell node's geometry on its own centre + reparent into `pivot`, so the pivot rotates it IN PLACE
  function attachPart(pivot, name, dist) {
    const o = model.getObjectByName(name); if (!o) return null;
    o.updateWorldMatrix(true, false);
    o.geometry.computeBoundingBox();
    const gcL = o.geometry.boundingBox.getCenter(new THREE.Vector3());
    const wc = gcL.clone().applyMatrix4(o.matrixWorld);
    const wq = o.getWorldQuaternion(new THREE.Quaternion());
    o.geometry.translate(-gcL.x, -gcL.y, -gcL.z);
    pivot.add(o); pivot.updateWorldMatrix(true, false);
    o.position.copy(pivot.worldToLocal(wc.clone()));
    o.quaternion.copy(pivot.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
    return { obj: o, rest: o.position.clone(), dir: null, dist };
  }
  const frontSpin = (pivot) => {   // spin angle that brings `pivot` frontmost (max world-X, toward the camera)
    let bestX = -Infinity, bestTh = 0; const tmpv = new THREE.Vector3(), sav = spin.rotation.y;
    for (let k = 0; k < 360; k++) { const th = k / 360 * TAU; spin.rotation.y = th; spin.updateMatrixWorld(true); pivot.getWorldPosition(tmpv); if (tmpv.x > bestX) { bestX = tmpv.x; bestTh = th; } }
    spin.rotation.y = sav; spin.updateMatrixWorld(true); return bestTh;
  };

  function setupExplode() {
    if (!model || !cordCurve) return;
    model.updateMatrixWorld(true);
    setupBeadReveal();
    setupHubReveal();
    setupBeadWords();
    // subtle gold halo through the MIDDLE 5 beads' symbols (cord order pos 3-7); NOT the first (Akoma),
    // second (akoma_ntoaso, the exploded bead) or last (sankofa).
    for (const n of [2, 3, 4, 5, 6]) { const o = model.getObjectByName('PLATFORM' + n); if (o) o.material = matGlow; }
    reveals.sort((a, b) => a.pE - b.pE);
  }

  function setupBeadReveal() {   // akoma_ntoaso bead: revealed RIGHT BEFORE the cord threads it (so it swings to front)
    const bc = BEAD_CENTERS[EXPLODE_BEAD];
    const O = new THREE.Vector3(bc[0], bc[1], bc[2]);
    const pivot = new THREE.Group(); pivot.position.copy(O); model.add(pivot); model.updateMatrixWorld(true);
    // explode the bead WHEN it naturally swings frontmost (no present-swing), exactly like the hub —
    // so the spin runs straight into the reveal instead of overshooting to the next bead and retracting.
    const fs = frontSpin(pivot);
    const pE = (((fs - SPIN_PHASE) / (TAU * SPIN_TURNS)) % 1 + 1) % 1;
    const parts = [];
    const cap = attachPart(pivot, 'FB_CAP' + EXPLODE_NODE, 1.7); parts.push(cap);   // lift the symbol lid well clear so the plate under it is exposed
    const base = attachPart(pivot, 'FB_BASE' + EXPLODE_NODE, -0.85); parts.push(base);
    const axis = cap.rest.clone().sub(base.rest).normalize();   // true symbol axis (cap centre -> base centre)
    const plate = attachPart(pivot, 'PLATFORM' + EXPLODE_NODE, 0.55);   // the gold capacitive electrode — sits in the OPEN gap below the lifted lid
    if (plate) { plate.obj.material = matElectrode; parts.push(plate); }  // passive gold pad (NOT glowing — the light is the PCB LED)
    const pcb = buildBoard('assets/models/akoma_pcb.glb', axis); pcb.position.copy(axis).multiplyScalar(0.3 * MM); pivot.add(pcb);
    parts.push({ obj: pcb, rest: pcb.position.clone(), dir: axis, dist: 0.18 });
    // a small SMD indicator LED sitting flat ON the board surface (NOT a dome) — the real
    // light source. Offset toward an edge like a real placed component; it glows + blooms.
    const led = new THREE.Mesh(new THREE.BoxGeometry(2.4 * MM, 0.85 * MM, 1.5 * MM), matLED);
    led.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);   // lie flat on the board
    const ledPerp = new THREE.Vector3(0, 0, 1).cross(axis);
    if (ledPerp.lengthSq() < 1e-4) ledPerp.copy(new THREE.Vector3(1, 0, 0).cross(axis));
    ledPerp.normalize();
    led.position.copy(axis).multiplyScalar(0.45 * MM).addScaledVector(ledPerp, 3.4 * MM);   // just proud of the surface, off-centre
    pcb.add(led);
    const motor = buildMotor(axis); motor.position.copy(axis).multiplyScalar(-1.5 * MM); pivot.add(motor);
    parts.push({ obj: motor, rest: motor.position.clone(), dir: axis, dist: -0.42 });
    for (const p of parts) p.dir = axis;
    // exploded-diagram callouts: touch goes IN at the electrode; the answer comes OUT
    // as light (the PCB LED) and a pulse (the ERM motor) — "touch it, it answers"
    const labels = buildLabels(beadLabelHost, [
      [plate ? plate.obj : pcb, "Touch"],
      [led,                     "Light"],
      [motor,                   "A pulse"],
    ]);
    beadAsm = { pivot, parts, axis, pE, W: EXPLODE_WIN, internals: [pcb, motor], presentSpin: null, labels };
    reveals.push(beadAsm);
  }

  function setupHubReveal() {     // core hub: revealed WHEN it rotates into frame (already front -> no swing needed)
    const wc = (nm) => { const o = model.getObjectByName(nm); o.geometry.computeBoundingBox(); const c = o.geometry.boundingBox.getCenter(new THREE.Vector3()); o.localToWorld(c); return model.worldToLocal(c.clone()); };
    const O = wc('HUB_BASE').add(wc('HUB_TOP')).multiplyScalar(0.5);
    const pivot = new THREE.Group(); pivot.position.copy(O); model.add(pivot); model.updateMatrixWorld(true);
    const parts = [];
    const base = attachPart(pivot, 'HUB_BASE', -1.25); parts.push(base);
    const top = attachPart(pivot, 'HUB_TOP', 0.9); parts.push(top);
    parts.push(attachPart(pivot, 'BASIN_SWITCH', 1.45));
    const axis = top.rest.clone().sub(base.rest).normalize();   // base -> top (button/up direction)
    const board = buildBoard('assets/models/akoma_hub_pcb.glb', axis); board.position.copy(axis).multiplyScalar(0.3); pivot.add(board);
    parts.push({ obj: board, rest: board.position.clone(), dir: axis, dist: 0.3 });
    const battery = buildBattery(axis); battery.position.copy(axis).multiplyScalar(-0.3); pivot.add(battery);
    parts.push({ obj: battery, rest: battery.position.clone(), dir: axis, dist: -0.35 });
    const speaker = buildSpeaker(axis); speaker.position.copy(axis).multiplyScalar(-0.15); pivot.add(speaker);
    parts.push({ obj: speaker, rest: speaker.position.clone(), dir: axis, dist: -0.8 });
    for (const p of parts) p.dir = axis;
    // one defensible tag per component (GPS is flagged "soon" — it isn't shipped; battery is the documented standby figure)
    const labels = buildHubLabels([
      [top.obj,  "Water-ready"],
      [board,    "Motion-aware · GPS soon"],
      [battery,  "Weeks on standby"],
      [speaker,  "Real sound + mic"],
      [base.obj, "Adjustable fit"],
    ]);
    const fs = frontSpin(pivot);
    const pE = (((fs - SPIN_PHASE) / TAU) % 1 + 1) % 1;   // anim where the hub is frontmost
    hubAsm = { pivot, parts, axis, pE, W: EXPLODE_WIN, internals: [board, battery, speaker], presentSpin: null, labels, O: O.clone() };
    reveals.push(hubAsm);
    endSpin = fs + Math.PI;   // settle target: hub swung to the BACK so the beads face the camera in the final shot
  }

  // ---- on-bead words: attach each word of "Everyone gets their own" to a bead that comes
  //      around AFTER the exploded bead, so the phrase spells out across the beads as they spin.
  //      Each word is anchored to its bead (a child of `model`) so it tracks the bead's spin. ----
  function setupBeadWords() {
    if (!beadWordHost || !model) return;
    const words = ["Everyone", "gets", "their", "own", "bead"];
    // front-facing anim for every bead (the anim value where it swings frontmost to the camera)
    const info = BEAD_CENTERS.map((bc, i) => {
      const a = new THREE.Group(); a.position.set(bc[0], bc[1], bc[2]); model.add(a);
      model.updateMatrixWorld(true);
      const anim = ((((frontSpin(a) - SPIN_PHASE) / (TAU * SPIN_TURNS)) % 1) + 1) % 1;
      return { i, anchor: a, anim };
    });
    const exAnim = info[EXPLODE_BEAD].anim;
    // the beads whose front moment falls AFTER the exploded bead (circular), nearest first
    const chosen = info
      .filter((b) => b.i !== EXPLODE_BEAD)
      .map((b) => ({ b, d: (((b.anim - exAnim) % 1) + 1) % 1 }))
      .sort((p, q) => p.d - q.d)
      .slice(0, words.length)
      .map((x) => x.b);
    info.forEach((b) => { if (!chosen.includes(b)) model.remove(b.anchor); });   // drop unused anchors
    beadWordHost.innerHTML = "";
    beadWords = chosen.map((b, k) => {
      const el = document.createElement("div"); el.className = "bead-word"; el.textContent = words[k];
      beadWordHost.appendChild(el);
      return { anchor: b.anchor, el, frontAnim: b.anim };   // the anim where this bead is dead-front
    });
  }

  function updateExplode(asm, e) {
    const rot = clamp(Math.min(smooth(0.05, 0.28, e), 1 - smooth(0.74, 0.97, e)), 0, 1);   // tilt-up, hold, tilt-back
    const exp = clamp(Math.min(smooth(0.22, 0.46, e), 1 - smooth(0.66, 0.9, e)), 0, 1);    // split-out, hold, reassemble
    if (asm.presentSpin != null && rot > 0) {   // swing the bracelet to bring this assembly frontmost
      const frozen = SPIN_PHASE + asm.pE * TAU * SPIN_TURNS;
      let d = asm.presentSpin - frozen; d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      spin.rotation.y = frozen + d * rot; spin.updateMatrixWorld(true);
    }
    // TILT so the assembly's axis faces EXPLODE_AXIS (world up), then split the parts flat along it.
    const tgt = EXPLODE_AXIS.clone()
      .applyQuaternion(spin.quaternion.clone().invert())
      .applyQuaternion(orient.quaternion.clone().invert()).normalize();
    asm.pivot.quaternion.slerpQuaternions(new THREE.Quaternion(), new THREE.Quaternion().setFromUnitVectors(asm.axis, tgt), rot);
    for (const pt of asm.parts) pt.obj.position.copy(pt.rest).addScaledVector(pt.dir, pt.dist * exp);
    for (const o of asm.internals) o.visible = exp > 0.004;
  }

  // ---- per-component labels: one tag pinned to each part, projected to screen and revealed as the assembly splits ----
  const hubLabelHost = $("#hubLabels");
  const beadLabelHost = $("#beadLabels");
  const beadWordHost = $("#beadWords");
  let beadWords = [];
  function buildLabels(host, defs) {
    if (!host) return [];
    host.innerHTML = "";
    return defs.map(([obj, text]) => {
      const el = document.createElement("div"); el.className = "hub-label";
      el.innerHTML = '<i></i><span>' + text + '</span>';
      host.appendChild(el);
      return { obj, el };
    });
  }
  function buildHubLabels(defs) { return buildLabels(hubLabelHost, defs); }
  const _lblV = new THREE.Vector3();
  function updateHubLabels(e) {
    if (!hubAsm || !hubAsm.labels || !hubAsm.labels.length) return;
    const show = clamp(Math.min(smooth(0.34, 0.54, e), 1 - smooth(0.66, 0.86, e)), 0, 1);   // appear once parts have split, fade before they close
    if (show < 0.01) { for (const L of hubAsm.labels) L.el.style.opacity = "0"; return; }
    const w = canvas.clientWidth || window.innerWidth || 1, h = canvas.clientHeight || window.innerHeight || 1;
    camera.updateMatrixWorld();
    hubAsm.labels.forEach((L, i) => {
      L.obj.getWorldPosition(_lblV); _lblV.project(camera);
      if (_lblV.z >= 1) { L.el.style.opacity = "0"; return; }    // behind the camera
      const x = (_lblV.x * 0.5 + 0.5) * w, y = (-_lblV.y * 0.5 + 0.5) * h;
      const side = (i % 2 === 0) ? 1 : -1;                        // alternate parts to opposite margins so the tags never collide
      const off = Math.min(w, 1400) * 0.075 * side;              // and sit clear of the central part column
      L.el.style.left = Math.round(x + off) + "px"; L.el.style.top = Math.round(y) + "px";
      L.el.classList.toggle("flip", side < 0);                    // left margin: tag reads inward, toward its part
      L.el.style.opacity = String(show);
    });
  }

  // ---- bead-reveal callouts: Touch (electrode) → Light (PCB LED) + A pulse (motor) ----
  const _bLblV = new THREE.Vector3();
  function updateBeadLabels(e) {
    if (!beadAsm || !beadAsm.labels || !beadAsm.labels.length) return;
    const show = clamp(Math.min(smooth(0.34, 0.54, e), 1 - smooth(0.66, 0.86, e)), 0, 1);
    if (show < 0.01) { for (const L of beadAsm.labels) L.el.style.opacity = "0"; return; }
    const w = canvas.clientWidth || window.innerWidth || 1, h = canvas.clientHeight || window.innerHeight || 1;
    camera.updateMatrixWorld();
    beadAsm.labels.forEach((L, i) => {
      L.obj.getWorldPosition(_bLblV); _bLblV.project(camera);
      if (_bLblV.z >= 1) { L.el.style.opacity = "0"; return; }
      const x = (_bLblV.x * 0.5 + 0.5) * w, y = (-_bLblV.y * 0.5 + 0.5) * h;
      const side = (i === 1) ? -1 : 1;                 // "Light" to the left margin; "Touch"/"A pulse" to the right
      const off = Math.min(w, 1400) * 0.06 * side;
      L.el.style.left = Math.round(x + off) + "px"; L.el.style.top = Math.round(y) + "px";
      L.el.classList.toggle("flip", side < 0);
      L.el.style.opacity = String(show);
    });
  }

  // ---- on-bead words: project each word to its bead's screen position every frame so it tracks
  //      the spin; fade in as the bead swings to the front, out as it rotates away ----
  const _bwV = new THREE.Vector3();
  function updateBeadWords(anim) {
    if (!beadWords.length) return;
    if (beadAsm && beadAsm._e > 0.03 && beadAsm._e < 0.97) {   // exploded bead is mid-reveal → keep the words clear of it
      for (const W of beadWords) W.el.style.opacity = "0"; return;
    }
    const startA = beadAsm ? beadAsm.pE - 0.02 : 0.14;     // full by the time the first after-bead swings front
    const master = clamp(smooth(startA, startA + 0.02, anim) * (1 - smooth(0.86, 0.96, anim)), 0, 1);
    const w = canvas.clientWidth || window.innerWidth || 1, h = canvas.clientHeight || window.innerHeight || 1;
    if (master < 0.01) { for (const W of beadWords) W.el.style.opacity = "0"; return; }
    camera.updateMatrixWorld();
    for (const W of beadWords) {
      W.anchor.getWorldPosition(_bwV);
      let d = anim - W.frontAnim; d = ((d % 1) + 1) % 1; if (d > 0.5) d -= 1;   // signed circular distance to this bead's front
      const facing = clamp(1 - smooth(0, 0.085, Math.abs(d)), 0, 1);            // full at dead-front, gone within ±0.085 → words fire one after another
      _bwV.project(camera);
      if (_bwV.z >= 1 || facing < 0.01) { W.el.style.opacity = "0"; continue; }
      const x = (_bwV.x * 0.5 + 0.5) * w, y = (-_bwV.y * 0.5 + 0.5) * h;
      const rise = h * (0.085 + 0.06 * facing);             // pops UP from behind the bead as it turns to front; always sits ABOVE it
      W.el.style.left = Math.round(x) + "px";
      W.el.style.top = Math.round(y - rise) + "px";
      W.el.style.opacity = String(master * facing);
    }
  }

  window.addEventListener("keydown", (e) => {            // q/a belt · w/s window · e/d smooth-core · r/f sennit-gap · b=toggle bead-wrap
    const k = e.key; let h = true;
    if (k === "1") BRAID_R = Math.max(0.1, BRAID_R - 0.03);
    else if (k === "2") BRAID_R += 0.03;
    else if (k === "3") BRAID_FREQ = Math.max(2, BRAID_FREQ - 1);
    else if (k === "4") BRAID_FREQ += 1;
    else if (k === "5") BRAID_RAD = Math.max(0.02, BRAID_RAD - 0.008);
    else if (k === "6") BRAID_RAD += 0.008;
    else if (k === "7") BRAID_OVER = Math.max(0.14, BRAID_OVER - 0.02);
    else if (k === "8") BRAID_OVER += 0.02;
    else if (k === "g") BEAD_RGROW += 0.01;          // grow wrap radius (sit prouder out of the groove)
    else if (k === "f") BEAD_RGROW -= 0.01;
    else if (k === "e") BEAD_BLEND = Math.min(0.9, BEAD_BLEND + 0.03);   // wider arc->sennit blend near the side
    else if (k === "d") BEAD_BLEND = Math.max(0.05, BEAD_BLEND - 0.03);
    else if (k === "b") BEAD_ON = BEAD_ON ? 0 : 1;   // toggle the groove wrap
    else h = false;
    if (!h) return; e.preventDefault(); buildBraid();
    if (ready) { update(progress); composer.render(); }
    console.log(`[braid] R ${BRAID_R.toFixed(2)} freq ${BRAID_FREQ} rad ${BRAID_RAD.toFixed(3)} over ${BRAID_OVER.toFixed(2)} rgrow ${BEAD_RGROW.toFixed(2)} blend ${BEAD_BLEND.toFixed(2)} on ${BEAD_ON}`);
  });

  let model = null;
  if (loaderEl) loaderEl.classList.remove("hide");
  const draco = new DRACOLoader(); draco.setDecoderPath("assets/vendor/three/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const fail = (err) => { console.warn("[hero3d] CAD load failed:", err); section.classList.add("no3d"); if (loaderEl) loaderEl.style.display = "none"; poster.classList.remove("hide"); };
  loader.load("assets/models/bracelet_threaded.glb", (g) => {
    model = g.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.material = Array.isArray(o.material) ? o.material.map(remap) : remap(o.material);
      }
    });
    buildCord();
    buildBraid();
    build();
    setupExplode();
    buildGather();      // clone the FINISHED hero bracelet (after setupExplode → glow + hub correct) for the circle
  }, undefined, fail);
}
