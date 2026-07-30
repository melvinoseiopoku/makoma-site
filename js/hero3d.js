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

// [0..OBJECT_FRAC] = THE OBJECT. Before a single word of tech, the finished bracelet simply
// turns, with one bead opening as it comes round. It is jewellery first. The rest of the timeline
// is compressed into what remains, so every downstream phase keeps its existing tuning untouched.
const OBJECT_FRAC = 0.13;
// The phone-in-the-noise story used to own the next 20% of the scroll — a 3-D phone flooded with
// notifications whose five pinned people flew out and became the beads. It is gone: the page now
// leads with the object and the invitation to customise it, and does not open by arguing.
// THE SEAM IT LEFT: that story also supplied the threading phase's entry state (beads present,
// cord not yet drawn). Without it the object phase's finished bracelet would cut straight to an
// unthreaded ring — same beads, no cord, different framing. CUT_WIN below dips the frame to black
// across the boundary, which is what the cut wants anyway: a hero shot, then how it is made.
const CUT_WIN = 0.012;             // raw-scroll half-window of the dip-to-black at the object → threading cut

// ---- GATHER phase: after the hero settles, more scroll fades the text and brings in 5 clones of the
//      bracelet around the centre one — all in the SAME scene (no viewports). ----
const HERO_FRAC = 0.87;            // the hero anim (threading→settle) runs from 0 to here; a TINY scroll past it triggers the drop
const GATHER_END = 1.0;            // the short remaining scroll (HERO_FRAC→1) is the interactive dwell — not a scrubbed gather anymore
// ---- the GRAVITY DROP: the instant you scroll past "Five people. One quiet channel." the "table" under the bracelet
//      is pulled, it free-falls into the how-it-works section and lands with a firm, WEIGHTY thud + one small rebound.
//      Beads + hub rebound slightly out of sync; the loose clasp thread whips down and slaps. (feel: weighty & subtle) ----
const DROP_FALL = 0.48;            // fraction of the DROP that is free fall — the rest is the bounce + settle (a smooth, watchable fall)
const DROP_DIST = 2.7;             // how far the bracelet falls (× modelR) — hero "table" down to the how-it-works one
const DROP_BOUNCE = 0.11;          // height of the single rebound (× modelR) — one small weighty hop, then rest
const DROP_CAMLAG = 0.5;           // the camera reaches the landing framing by this drop fraction (lags the fall so it reads)
const DROP_IMPACT = 0.14;          // per-element rebound amplitude at impact (× modelR); beads/hub/thread jiggle out of sync
const DROP_WHIP = 0.42;            // clasp-thread whip amplitude at the free end (× modelR) — the rope BENDS + curls on impact
const DROP_LASH = 0.34;            // clasp-thread SIDEWAYS lash amplitude at the free end (× modelR) — the tail also whips laterally
const DROP_TRIGGER = 0.02;         // a TINY scroll past "Five people" (this much gather) flips the drop TARGET (down = fall, back = rise)
const DROP_TIME = 1.2;             // the forward drop (hold → fall → bounce) eases in over this long, on the idle clock
const DROP_REV = 0.6;              // reverse-scroll rewinds the drop over this long — the bracelet rises back up (no still-frame jump)
const DROP_HOLD_F = 0.3;           // the first 30% of the drop HOLDS the bracelet up (still showing "Five people") before it falls
const GATHER_N = 6;
const GATHER_SCALE = 0.45;         // each bracelet shrinks to this in the cluster
const GATHER_DIST = 6.1;           // camera pull-back at full gather (× modelR) — pulled back to clear room for the guide text
const GATHER_DROP = 0.12;          // shift the cluster DOWN by this fraction of the half-viewport, so the header clears its top
const GATHER_RING = 1.25;          // radius of the ring of 5 bracelets around the centre "You" bracelet (× modelR)
const GATHER_VSTRETCH = 1.22;      // portrait only: stretch the ring vertically into a gentle tall ellipse so a tall phone's height is used (beads stay big, sides don't clip more)
// ---- YOU-centric stage: the "You" bracelet is the big, central interaction target; the other five wait in the
//      background (small + dim) and only the RECEIVER steps forward, glowing + vibrating, when you reach them. ----
const GATHER_YOU_SCALE = 0.86;     // the big central YOU bracelet (× modelR, applied to the clone)
const GATHER_BG_SCALE = 0.3;       // the backgrounded others: small
const GATHER_BG_DIM = 0.16;        // their lit beads are dimmed right down while backgrounded
const GATHER_BG_RING = 1.15;       // radius of the faint background cluster tucked behind YOU (× modelR)
const GATHER_BG_FWD = 2.6;         // how far the background sits BEHIND YOU (× modelR, pushed from the camera → small + dim)
const GATHER_RECV_SCALE = 0.86;    // a called bracelet grows to EXACTLY YOU's size — the two meet as equals (== GATHER_YOU_SCALE)
const GATHER_RECV_LIFT = 0;        // (disabled) a warm emissive self-glow on receiver beads over-tinted them brown/washed — DAD's beads already match YOU under the scene lights, so no fake glow.
const GATHER_RECV_UP = 1.12;       // PORTRAIT/mobile: the receiver settles directly above/below YOU (× modelR)
// DESKTOP/landscape: the receiver settles AROUND YOU on a wide ring (out to the sides), not just top/bottom.
const GATHER_RECV_V = 1.12;        // ring vertical radius (× modelR)
const GATHER_RECV_H = 1.9;         // ring horizontal radius (× modelR) — wider, so receivers come in from the sides
const GATHER_RECV_FWD = 0.0;       // same depth as YOU — an equal beside you, not looming in front
const GATHER_RECV_GAPFILL = 0.86;  // camera looks toward the mid-point of the pair (× RECV_UP) so YOU + receiver are balanced
const PRESENCE_IN = 0.5, PRESENCE_HOLD = 1.6, PRESENCE_OUT = 0.95;   // receiver: rise → hold (glow/buzz) → recede (seconds)
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
const PERSON_OF_NODE = {};   // reverse of GATHER_NODE: bead node → the person it stands for, so a tap on a SPECIFIC bead reaches THAT person (not just the front one)
GATHER_NODE.forEach((n, p) => { PERSON_OF_NODE[n] = p; });
const GATHER_NAME = ["You", "Mom", "Dad", "Priscilla", "Sylvester", "Phoebe"];   // the name pinned under each bracelet
const GATHER_SHAKE = 0.025;        // vibrate amplitude of the REACHED BEAD when pinged (× modelR, bracelet-local); decays over ~0.42s
const ECHO_HOLD = 340;             // ms press-and-hold on a bracelet to start an ECHO (a quick tap stays a Pulse) — shortened so finger drift is less likely to cancel it
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
  // OBJECT MODE: the hero's opening phase reuses the gather machinery so a tap can summon a
  // receiver, but WITHOUT the cluster's staging — YOU stays at the hero bracelet's exact size
  // and position, the exposure lift is off, and every instructional overlay stays hidden.
  let objectMode = false;
  /* The object phase says what the piece IS, one line at a time — an ambient cycle under the
     title, not a prompt. Each line is a pair so the second clause can carry the gold. */
  const OBJ_LINES = [
    ["Six beads.",     "One quiet channel."],
    ["Touch a bead.",  "They feel it."],
    ["Speak to it.",   "They hear your echo."]
  ];
  const OBJ_IN = 0.7, OBJ_HOLD = 2.9, OBJ_OUT = 0.7, OBJ_SPAN = OBJ_IN + OBJ_HOLD + OBJ_OUT;
  let subEl = null, subIdx = -1, subBase = "";
  let gatherGroup = null; const gatherInstances = [];   // the 6 bracelet clones for the gather cluster
  const gSpin = [], gVel = [], gBuzz = [], gTarget = [], gSnapping = [], gPitch = [];   // spin · velocity · pulse · snap target · snapping · bottom-row upward tilt
  const gCalled = new Array(GATHER_N).fill(-99);       // idle-time each background bracelet was last summoned to receive (drives its step-forward)
  let gManyUp = false;   // more than one receiver up (SOS) — the frame must fit the fanned ring, not one caller
  let gRecvPres = 0;                                    // strongest receiver step-forward this frame → the camera opens the frame to share it with YOU
  let dropClusterY = 0;                                 // the gravity-drop's current world-Y offset of the cluster (0 = hero table, −DROP_DIST·modelR = landed)
  let dropGd = 0, _dropPrevIdle = 0, _prevFg = 0;       // bidirectional time-based drop: gd eases toward a scroll-set target (0 = up on the hero table ↔ 1 = fully landed); _prevFg tracks the fall for one-shot SFX
  let gConn = null;                                     // the live bond: { p, sNode (their bead on YOUR wrist), rNode (your bead on THEIRS), sHue, rHue, pres } — both ends glow while together
  const _gfwd = new THREE.Vector3();                   // scratch: camera-forward, for pushing bracelets back/forward in depth
  const _dropUp = new THREE.Vector3(), _dropSide = new THREE.Vector3(), _dropQ = new THREE.Quaternion();   // scratch: world-up + a lateral axis mapped into the bracelet's spun local frame, for the drop rebound + lash
  // receiver step-forward envelope: 0 in the background → 1 fully up-front (glowing/buzzing) → back to 0
  const presenceEnv = (age) => {
    if (age < 0 || age > PRESENCE_IN + PRESENCE_HOLD + PRESENCE_OUT) return 0;
    if (age < PRESENCE_IN) { const t = age / PRESENCE_IN; return t * t * (3 - 2 * t); }
    if (age < PRESENCE_IN + PRESENCE_HOLD) return 1;
    const t = (age - PRESENCE_IN - PRESENCE_HOLD) / PRESENCE_OUT; return 1 - t * t * (3 - 2 * t);
  };
  const frontAngleOf = {};                             // bead node → spin angle that faces it to the camera
  let gLast = 0, gDragging = -1, gDownX = 0, gDownY = 0, gDownNode = -1, gDownHub = false, gMoved = false, gVertScroll = false, gLastX = 0;   // interaction state (gDownNode: the bead under the finger at press; gDownY: radial tap-slop origin; gVertScroll: a vertical gesture handed to the page)
  let gEcho = null, gHoldTimer = null, gHeld = false;                      // Echo (press-and-hold) state
  let echoCanvas = null, echoCtx = null;                                   // 2-D overlay the waveform stream draws on
  const beadGeomC = {};                                                    // node → bead geometry centre (shared local frame), for the bead's world position
  const _ew1 = new THREE.Vector3(), _ew2 = new THREE.Vector3(), _ep = new THREE.Vector3();   // echo scratch
  const _cw = new THREE.Vector3(), _cw2 = new THREE.Vector3();   // scratch: project the coach's target bead to screen

  // frame YOU big + central when solo; OPEN the frame to fit YOU + the receiver (as equals) when one steps up.
  function gatherFitDist() {
    const vHalf = Math.tan(camera.fov * 0.5 * DEG);                          // tan(vertical FOV / 2)
    const aspect = Math.max(camera.aspect, 0.05), portrait = aspect < 1;
    const bHalfV = GATHER_YOU_SCALE * 0.62 * modelR;                         // a bracelet's on-screen half-HEIGHT (wide + short)
    const bHalfW = GATHER_YOU_SCALE * modelR * 1.08;                         // a bracelet's on-screen half-WIDTH
    // STATIC frame (issue #3): permanently reserve room for ONE receiver, so YOU stays DEAD-CENTRE and never shifts
    // or shrinks when a receiver steps in. PORTRAIT: receiver goes top/bottom → reserve vertical room only. LANDSCAPE:
    // receiver rings AROUND YOU (out to the sides) → reserve room on BOTH axes so a side receiver never clips.
    let halfW, halfH;
    // portrait normally reserves room for ONE receiver above/below. On SOS the circle fans out
    // on both axes (see updateGather), so the frame has to open for the whole ring instead.
    if (portrait && gManyUp) { halfW = GATHER_RECV_H * 0.40 * modelR + bHalfW; halfH = GATHER_RECV_V * 1.02 * modelR + bHalfV; }
    else if (portrait) { halfW = bHalfW; halfH = GATHER_RECV_UP * modelR + bHalfV; }
    else { halfW = GATHER_RECV_H * modelR + bHalfW; halfH = GATHER_RECV_V * modelR + bHalfV; }
    const wFill = portrait ? 0.94 : 0.9;
    const hFill = portrait ? 0.9 : 0.88;
    const dW = halfW / (vHalf * aspect * wFill);
    const dH = halfH / (vHalf * hFill);
    return Math.max(dW, dH);
  }
  /* Same arithmetic as gatherFitDist, but for ONE bracelet with no receiver room reserved —
     so the object phase frames the piece to the viewport it is actually in. The fixed
     CAM_DIST_END is tuned for desktop and over-zooms badly in portrait. */
  function objectFitDist() {
    const vHalf = Math.tan(camera.fov * 0.5 * DEG);
    const aspect = Math.max(camera.aspect, 0.05), portrait = aspect < 1;
    const bHalfV = 0.62 * modelR, bHalfW = 1.08 * modelR;   // scale 1 here, not GATHER_YOU_SCALE
    const wFill = portrait ? 0.84 : 0.62;   // leave the title its room; on desktop it shares the frame
    const hFill = portrait ? 0.42 : 0.66;   // portrait: the title owns the top, so sit smaller
    return Math.max(bHalfW / (vHalf * aspect * wFill), bHalfV / (vHalf * hFill));
  }
  function placeCamera(settle = 0, g = 0, dropY = 0) {
    const az = (CAM_AZ + Math.sin(idle * 0.18) * 0.7 * (1 - settle) * (1 - g)) * DEG;   // idle sway fades out as we settle
    const el = (CAM_EL + (CAM_EL_END - CAM_EL) * settle) * DEG;               // rise toward the top-front edge
    let d = (3.15 + (CAM_DIST_END - 3.15) * settle) * modelR;                  // pull back to frame the whole bracelet
    let pan = CAM_PAN_END * modelR * settle;   // pan the framing DOWN so the bracelet rises into the upper frame
    // THE OBJECT sits DEAD CENTRE and fits whatever viewport it is in: CAM_PAN_END exists to lift
    // the bracelet into the upper frame for the settle, which is wrong for the opening.
    if (objectMode) { d = objectFitDist(); pan = 0; }
    if (g > 0) { d = lerp(d, gatherFitDist(), g); pan = lerp(pan, 0, g); }   // gather: aim dead-centre on YOU; the frame is STATIC (never chases a receiver), so YOU never moves (#3)
    const ce = Math.cos(el);
    camera.position.set(Math.cos(az) * ce * d, Math.sin(el) * d - pan + dropY, Math.sin(az) * ce * d);
    camera.lookAt(0, -pan + dropY, 0);   // dropY: the camera follows the falling bracelet DOWN into the how-it-works frame
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
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaToCoverage: true });   // hashed alpha → the name dissolves as part of the one-unit fade (matches the clone materials)
    const pw = s.x * 0.82, ph = pw * (H / W);      // a band across the flat underside, with margin
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    plane.position.set(0, 0, -(s.z / 2) - 0.02);   // sit on the −Z underside flat, just proud of the surface
    plane.rotation.y = Math.PI;                     // face outward from the underside
    plane.renderOrder = 3;
    base.add(plane);
    return mat;
  }

  // build 6 clones of the FINISHED hero bracelet (shared geometry) into one group — the gather cluster
  function buildGather() {
    gatherGroup = new THREE.Group(); gatherGroup.visible = false; scene.add(gatherGroup);
    for (let i = 0; i < GATHER_N; i++) {
      const mc = model.clone(true);
      // give EACH bead platform its OWN material, so a ping lights a single bead (one-to-one), never the whole bracelet;
      // and collect each bead's meshes (cap + base + symbol) by node so a ping can VIBRATE just that one bead.
      // EVERY material is cloned per-bracelet + made transparent, so each bracelet can fade in/out on its own
      // (the background five are invisible until summoned). `mats` = every material to drive opacity from.
      const beadMat = {}, beadMeshes = {}, platOf = {}, mats = [], hubMeshes = [], threadMeshes = [];   // hub + clasp-thread meshes → the gravity-drop's per-element rebound
      let basinMat = null;
      const matMap = new Map();                                 // original → this bracelet's shared clone (black resin / hub / cord)
      // FADE AS ONE UNIT: every clone material fades via alphaToCoverage (opacity → MSAA sample coverage), not blended
      // transparency. It renders in the OPAQUE queue (each kept sample is opaque + writes depth), so a half-faded
      // bracelet is depth-culled to its own outer silhouette — no seeing the gold platforms / button / far beads
      // THROUGH it, and every part crosses the same coverage together (no component lingering brighter). MSAA on the
      // composer target resolves the coverage into a SMOOTH dissolve instead of a dither.
      const cloneShared = (orig) => { let c = matMap.get(orig); if (!c) { c = orig.clone(); c.alphaToCoverage = true; c.transparent = false; matMap.set(orig, c); mats.push(c); } return c; };
      const isInternal = (o) => { for (let a = o; a && a !== mc; a = a.parent) if (a.userData && a.userData.internal) return true; return false; };
      mc.traverse((o) => {
        if (!o.isMesh) return;
        if (isInternal(o)) { o.visible = false; return; }       // sealed-hub/bead internals: hidden in the cluster so a fading shell never shows them
        o.castShadow = o.receiveShadow = false;                 // no shadows on the clones
        o.visible = true;                                       // a clone is always whole (the original can be mid-explode when it is cloned)
        const orig = o.material, nm = o.name || ""; let node = NaN;
        if (nm.indexOf("PLATFORM") === 0) {
          node = nm === "PLATFORM" ? 0 : parseInt(nm.slice(8), 10);
          platOf[node] = o;                                     // the symbol disc — used to locate the bead in world (for the echo endpoints)
          const m = orig.clone(); m.alphaToCoverage = true; m.transparent = false; o.material = m; mats.push(m);   // UNIQUE per platform (one-to-one glow)
          if (orig === matGlow) { m.userData.lit = true; beadMat[node] = m; }           // a hero-glow bead: breathes, can flare brighter
          else if (orig === matGold) { m.userData.lit = false; beadMat[node] = m; }     // a dark bead: gold at rest, lights only when pinged
        } else if (nm === "BASIN_SWITCH") {
          // the gold hub button — its own gold material, hashed-alpha like the rest so it dissolves as part of the
          // one-unit fade (the hub shell's opaque fragments depth-cull it, so it never ghosts through mid-fade).
          const m = matGold.clone(); m.alphaToCoverage = true; m.transparent = false; o.material = m; basinMat = m;
        } else {
          o.material = Array.isArray(orig) ? orig.map((x) => cloneShared(x)) : cloneShared(orig);   // black resin / hub / cord: shared per bracelet
          if (nm.indexOf("FB_CAP") === 0) node = nm === "FB_CAP" ? 0 : parseInt(nm.slice(6), 10);   // bead top half
          else if (nm.indexOf("FB_BASE") === 0) node = nm === "FB_BASE" ? 0 : parseInt(nm.slice(7), 10);  // bead bottom half
        }
        if (!isNaN(node)) (beadMeshes[node] || (beadMeshes[node] = [])).push({ mesh: o, base: o.position.clone() });
        if (nm.indexOf("HUB_") === 0 || nm === "BASIN_SWITCH") hubMeshes.push({ mesh: o, base: o.position.clone() });   // hub assembly → its own weighty settle bob on landing
        else if (o.userData.adjuster) threadMeshes.push({ mesh: o, base: o.position.clone() });                         // loose clasp thread → flops down + jiggles longer
      });
      // ONLY YOU (i===0) drops → give its clasp rope its OWN geometry so the drop can BEND it (a real whip) without
      // touching the shared strands. Each strand vertex gets a t = position along the tail (0 = hub root, 1 = free tip).
      let threadStrands = null, threadBeads = null;
      if (i === 0) {
        threadStrands = []; threadBeads = [];
        for (const tm of threadMeshes) {
          const geo = tm.mesh.geometry;
          if (geo.type === "TubeGeometry") {
            const cg = geo.clone(); tm.mesh.geometry = cg;
            const pos = cg.attributes.position, base = new Float32Array(pos.array), tArr = new Float32Array(pos.count);
            for (let v = 0; v < pos.count; v++) tArr[v] = Math.min(1, Math.max(0, (base[v * 3 + 1] - 0.30) / 1.42));   // tail spans model-Y 0.30 (root) → 1.72 (tip)
            threadStrands.push({ mesh: tm.mesh, geo: cg, base, tArr });
          } else {
            const r = geo.parameters ? geo.parameters.radius : 0.2;
            threadBeads.push({ mesh: tm.mesh, base: tm.mesh.position.clone(), t: r > 0.17 ? 0.82 : 1.0 });   // quartz slider (0.22) mid-tail, end knot (0.13) at the tip
          }
        }
      }
      const ori = new THREE.Group(); ori.rotation.x = FLIP_X; ori.add(mc);
      const sp = new THREE.Group(); sp.add(ori);
      const pivot = new THREE.Group(); pivot.add(sp); gatherGroup.add(pivot);
      gSpin[i] = gTarget[i] = endSpin; gVel[i] = 0; gBuzz[i] = null; gSnapping[i] = false;
      const engMat = engraveHubName(mc, GATHER_NAME[i]);   // the name is etched into the hub's flat underside — part of the bracelet, turns with it
      if (engMat) mats.push(engMat);                      // …and fades with it
      gatherInstances.push({ pivot, spin: sp, mc, beadMat, beadMeshes, platOf, mats, engMat, basinMat, hubMeshes, threadMeshes, threadStrands, threadBeads, bodyMat: matMap.get(matBlack) || null, _shakeNode: -1, _whipped: false });
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
  // the FRIEND (never YOU) whose bead is nearest the front — the graceful fallback when a tap lands on a non-friend
  // bead (the "You" bead or the two symbolic beads) or between beads, so every tap still reaches a receiver.
  function frontFriend() {
    let best = 1, bd = TAU;
    for (let p = 1; p < GATHER_N; p++) { const d = Math.abs(angDelta(gSpin[0], frontAngleOf[GATHER_NODE[p]])); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function gSnapTo(i) { gTarget[i] = gSpin[i] + angDelta(gSpin[i], frontAngleOf[GATHER_NODE[frontPerson(gSpin[i])]]); gSnapping[i] = true; }
  const buzz = () => { try { if (navigator.vibrate) navigator.vibrate([0, 48, 110, 26]); } catch (e) {} };   // a heartbeat haptic (lub-dub) on the bead that's reached
  // summon person p's bracelet forward from the background to receive — one at a time (any other up-front bracelet recedes)
  function callReceiver(p) {
    if (p <= 0) return;
    for (let j = 1; j < GATHER_N; j++) if (j !== p && presenceEnv(idle - gCalled[j]) > 0.02) gCalled[j] = idle - (PRESENCE_IN + PRESENCE_HOLD);   // send others into recede
    // If p is ALREADY up in frame, don't yank it away and bring it back — just REFRESH its hold (hold it at full
    // presence and restart the dwell countdown). A re-tap then re-fires the ping/glow on the bracelet already here,
    // instead of a jarring fade-out/fade-in. Only a p that has faded (or nearly) steps up fresh from the background.
    gCalled[p] = (presenceEnv(idle - gCalled[p]) > 0.5) ? (idle - PRESENCE_IN) : idle;
  }
  // the directed ping: tap a bead on YOUR bracelet → THAT bead's person steps forward, spins to YOUR bead, lights + vibrates it.
  // pTarget is the person the tapped bead stands for; if omitted (e.g. a non-bead tap) fall back to the front person.
  /* SOS. Pressing the hub button is not a message to one person — it calls the whole circle in
     at once, every bracelet arriving with the bead that stands for YOU buzzing on their wrist.
     Deliberately does NOT go through callReceiver(), whose whole job is to keep exactly one
     receiver up front; here they all come. The frame opens on its own because gRecvPres hits 1. */
  function sosAll(owner) {
    const ownNode = GATHER_NODE[owner];
    let staggered = 0;
    for (let j = 1; j < GATHER_N; j++) {
      if (j === owner) continue;
      gCalled[j] = idle;                                        // all of them, together
      gTarget[j] = gSpin[j] + angDelta(gSpin[j], frontAngleOf[ownNode]);
      gSnapping[j] = true;                                      // each turns YOUR bead to the front
      const d = 0.06 * staggered++;                             // a beat apart so it reads as a wave, not a blink
      setTimeout(() => { gBuzz[j] = { node: ownNode, t0: idle, hue: GATHER_HUE[owner] }; }, d * 1000);
    }
    gConn = null;                                               // this is not a one-to-one bond
    gBuzz[owner] = { node: ownNode, t0: idle, hue: GATHER_HUE[owner] };
    try { if (navigator.vibrate) navigator.vibrate([0, 90, 70, 90, 70, 160]); } catch (e) {}
    buzzSound(GATHER_NOTE[owner], 0.11);
    setTimeout(() => buzzSound(GATHER_NOTE[owner] * 1.5, 0.09), 150);
    setTimeout(() => buzzSound(GATHER_NOTE[owner] * 2.0, 0.08), 300);
  }

  function gReach(owner, pTarget) {
    if (window.__coach) window.__coach.done("tap");   // coach: a real tap completes the Tap step
    const p = (pTarget != null && pTarget >= 0) ? pTarget : frontPerson(gSpin[owner]); if (p < 0) return;
    const ownNode = GATHER_NODE[owner];   // the sender's own bead — the single bead that lights on the other bracelet
    if (p === owner) { gBuzz[owner] = { node: ownNode, t0: idle, hue: GATHER_HUE[owner] }; buzz(); buzzSound(GATHER_NOTE[owner], 0.09); return; }
    callReceiver(p);
    buzzSound(GATHER_NOTE[p], 0.09);                                        // the touched bead answers with ITS person's distinct buzz
    gConn = { p, sNode: GATHER_NODE[p], rNode: ownNode, sHue: GATHER_HUE[p], rHue: GATHER_HUE[owner], pres: 0 };   // the bond glows at BOTH ends while together
    gBuzz[owner] = { node: GATHER_NODE[p], t0: idle, hue: GATHER_HUE[p] };   // YOUR bead for THEM lights, in their colour — the near end of the bond
    gTarget[p] = gSpin[p] + angDelta(gSpin[p], frontAngleOf[ownNode]); gSnapping[p] = true;
    setTimeout(() => { gBuzz[p] = { node: ownNode, t0: idle, hue: GATHER_HUE[owner] }; buzz(); buzzSound(GATHER_NOTE[owner] * 1.5, 0.07); }, PRESENCE_IN * 1000 * 0.75);   // the far end: YOUR bead lights on THEIR wrist as it arrives up-front
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
  // BEAD TAP = a soft HEARTBEAT (lub-dub) at a per-bead pitch + rhythm, so each bead you touch feels DISTINCT.
  function buzzSound(freq, vol) {
    const c = audioCtx(); if (!c) return;
    const V = vol || 0.18, f = freq || 440;
    const base = 44 + (f % 130) * 0.045;                 // ~44–63 Hz thump body — distinct low pitch per bead
    const gap = 0.13 + (f % 40) * 0.0016;                // slight per-bead rhythm variation between the two beats
    const thump = (dt, pitch, amp, dur) => {
      try {
        const tt = c.currentTime + dt, o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(pitch * 1.7, tt); o.frequency.exponentialRampToValueAtTime(pitch, tt + 0.05);   // pitch drop = a soft body "thud"
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(amp, tt + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
        o.connect(g); g.connect(c.destination); o.start(tt); o.stop(tt + dur + 0.03);
      } catch (e) {}
    };
    thump(0, base, V, 0.14);                              // "lub" (S1) — the stronger first beat
    thump(gap, base * 1.12, V * 0.68, 0.12);             // "dub" (S2) — softer, a touch higher, ~150 ms later
  }
  // filtered-noise whoosh (air) — the fall / lift
  function noiseWhoosh(dur, f0, f1, vol) {
    const c = audioCtx(); if (!c) return;
    try {
      const t = c.currentTime, n = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const flt = c.createBiquadFilter(); flt.type = "bandpass"; flt.Q.value = 0.9;
      flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt); flt.connect(g); g.connect(c.destination); src.start(t);
    } catch (e) {}
  }
  const dropWhoosh = () => noiseWhoosh(0.5, 820, 150, 0.05);    // the bracelet lets go and falls through air
  const dropRise = () => noiseWhoosh(0.34, 200, 620, 0.03);     // reverse-scroll: it lifts back up
  function dropThud() {                                          // the landing: a deep body + a bright bead clack
    const c = audioCtx(); if (!c) return;
    try {
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(125, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.24, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.32);
    } catch (e) {}
    noiseWhoosh(0.08, 2400, 600, 0.05);                          // the beads + clasp clack on impact
  }
  // a slight airy "reveal" whoosh + faint rising shimmer as a CAD assembly explodes open
  function explodeSound() {
    noiseWhoosh(0.55, 300, 1400, 0.03);
    const c = audioCtx(); if (!c) return;
    try {
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1250, t + 0.42);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.52);
    } catch (e) {}
  }
  // a very slight low ambient pad while the bracelet threads together (lazily built; gain follows the threading level)
  let _amb = null;
  function threadAmbient(level) {
    const c = audioCtx(); if (!c) return;
    if (!_amb) {
      if (level <= 0.001) return;                                // don't spin it up until threading actually starts
      try {
        const t = c.currentTime, g = c.createGain(); g.gain.value = 0;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 360; lp.Q.value = 0.4;
        const o1 = c.createOscillator(), o2 = c.createOscillator();
        o1.type = "triangle"; o1.frequency.value = 98; o2.type = "triangle"; o2.frequency.value = 147; o2.detune.value = 5;
        const flfo = c.createOscillator(), flg = c.createGain(); flfo.type = "sine"; flfo.frequency.value = 0.08; flg.gain.value = 110;
        flfo.connect(flg); flg.connect(lp.frequency);
        o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(c.destination);
        o1.start(t); o2.start(t); flfo.start(t); _amb = { g };
      } catch (e) { _amb = null; return; }
    }
    try { _amb.g.gain.setTargetAtTime(Math.max(0, level) * 0.05, c.currentTime, 0.2); } catch (e) {}
  }
  let _echoOsc = null, _echoGain = null, _echoLfo = null;
  function echoSoundStart(freq) {
    const c = audioCtx(); if (!c) return;
    try {
      const t = c.currentTime;
      _echoOsc = c.createOscillator(); _echoGain = c.createGain(); _echoLfo = c.createOscillator();
      _echoOsc.type = "triangle"; _echoOsc.frequency.value = freq;                        // softer than a pure-sine beep
      // gentle throb so the delay taps read as distinct ECHO repeats, not one flat tone
      const tg = c.createGain(); _echoLfo.type = "sine"; _echoLfo.frequency.value = 4.2; tg.gain.value = 0.03;
      _echoLfo.connect(tg); tg.connect(_echoGain.gain);
      // a filter that OPENS as the echo leaves → it evolves, not a static beep
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 4;
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.55);
      // THE ECHO: a feedback delay — the tone repeats, fading + darkening, like it's ringing across the distance
      const delay = c.createDelay(1.0); delay.delayTime.value = 0.3;
      const fb = c.createGain(); fb.gain.value = 0.46;
      const damp = c.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 1500;
      _echoGain.gain.setValueAtTime(0.0001, t);
      _echoGain.gain.exponentialRampToValueAtTime(0.05, t + 0.09);
      _echoOsc.connect(lp); lp.connect(_echoGain);
      _echoGain.connect(c.destination);                                                   // dry
      _echoGain.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay);  // feedback loop → the repeats
      delay.connect(c.destination);                                                        // …fed to the output
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
  function startEcho(owner, pTarget) {
    if (window.__coach) window.__coach.done("hold");   // coach: a real hold completes the Hold step
    const p = (pTarget != null && pTarget >= 0) ? pTarget : frontPerson(gSpin[owner]); if (p < 0) return;
    const sNode = GATHER_NODE[p], rNode = GATHER_NODE[owner], note = GATHER_NOTE[owner];
    echoSoundStop();                                                                                          // cut any echo voice still ringing
    if (p === owner) { gBuzz[owner] = { node: rNode, t0: idle, hue: GATHER_HUE[owner] }; buzz(); bell(note, 0.5, 0.1); return; }   // reaching yourself → just a pulse + chime
    callReceiver(p);                                                                                          // step p forward from the background to receive
    gConn = { p, sNode, rNode, sHue: GATHER_HUE[p], rHue: GATHER_HUE[owner], pres: 0 };                       // the bond glows at BOTH ends while together
    gBuzz[owner] = { node: sNode, t0: idle, hue: GATHER_HUE[p] };                                            // YOUR bead for THEM lights, in their colour — the near end of the bond
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

  // The hero's text hooks. This used to be initPhone(), which also collected every bead/hub mesh so
  // the phone story could hide and fly them; with that story gone the model simply renders whole, and
  // all that is left to capture is the sub-line the object phase cycles its copy through.
  function initHeroText() {
    subEl = $("#heroSub"); if (subEl && !subBase) subBase = subEl.innerHTML;
  }

  // the gather choreography: the main bracelet shrinks from centre, the copies slide IN FROM THE SIDES into a
  // compact 2×3 cluster, then each floats on its own gentle (unsynchronised) bob. Hero text fades.
  function updateGather(g) {
    if (!gatherGroup) return;
    renderer.toneMappingExposure = objectMode ? 1.12 : 1.12 + 0.62 * g;   // lift the matte beads out of the dark as they cluster
    if (objectMode && outro) { outro.style.opacity = "0"; outro.style.pointerEvents = "none"; }
    if (!objectMode && g > 0.0015 && outro) { const oo = clamp(1 - smooth(0.0, 0.18, g), 0, 1); outro.style.opacity = String(oo); outro.style.pointerEvents = oo > 0.5 ? "auto" : "none"; }
    let recvPres = 0;   // the strongest step-forward among the five receivers → the header yields + the frame opens
    let recvUp = 0;
    for (let j = 1; j < GATHER_N; j++) { const pj = presenceEnv(idle - gCalled[j]); recvPres = Math.max(recvPres, pj); if (pj > 0.02) recvUp++; }
    const many = recvUp > 1;   // SOS: the whole circle at once, not one caller
    gRecvPres = recvPres; gManyUp = many;
    if (gConn) { gConn.pres = presenceEnv(idle - gCalled[gConn.p]); if (gConn.pres <= 0.001) gConn = null; }   // the bond lives while they're together
    if (gatherGuideEl) gatherGuideEl.style.opacity = objectMode ? "0" : String(clamp(smooth(0.42, 0.8, g) * (1 - recvPres), 0, 1));   // guide fades in as the bracelets settle, and yields when a receiver steps up top
    if (window.__coach && !objectMode) window.__coach.setGather(g);   // first-run coach marks: freeze-frame + walk the gestures once
    const show = g > 0.0015;
    // Normally the clones take over from the hero original. In OBJECT MODE we keep the ORIGINAL
    // visible instead, because the exploded-bead rig (setupExplode) lives on it — the clones have
    // no such rig. The gather group stays live so receivers can still be summoned; YOU's own clone
    // is simply held invisible (see the pres line below) so we are not drawing two bracelets.
    gatherGroup.visible = show; spin.visible = objectMode ? true : !show;
    // These hosts are killed once the clones take over, so callouts can't float over the wrong
    // bracelet. OBJECT MODE is the exception for #beadLabels: the bead reveal IS running there (on
    // the original), so its "Touch / Light / A pulse" callouts have to come through.
    for (const id of ["#hubLabels", "#beadLabels", "#beadWords"]) {
      const h = $(id); if (!h) continue;
      h.style.opacity = (show && !(objectMode && id === "#beadLabels")) ? "0" : "";
    }
    if (!show) return;
    camera.updateMatrixWorld(true);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);   // screen-right
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);      // screen-up
    // YOU (bracelet 0) is the big central stage. The other five wait small + dim in a ring BEHIND it; only the one
    // you REACH steps forward (glowing + buzzing) to receive, then recedes back into the background.
    const RN = GATHER_N - 1;
    const portrait = camera.aspect < 1;   // mobile → receivers top/bottom; desktop → receivers ring AROUND YOU (sides)
    camera.getWorldDirection(_gfwd);                                                    // into the scene (away from camera) — depth axis
    const eIn = smooth(0.06, 0.7, g);
    const entr = objectMode ? 1 : eIn * eIn * (3 - 2 * eIn);          // the whole stage blooms in as g→1; object mode is already 'there'
    const breathe = matGlow.emissiveIntensity;
    for (let i = 0; i < GATHER_N; i++) {
      const inst = gatherInstances[i];
      // ping envelope, up front so the vibrate rides it: expire at 0.7s, half-sine pulse meanwhile
      const b = gBuzz[i];
      if (b && (idle - b.t0) / 0.7 >= 1) gBuzz[i] = null;
      const bb = gBuzz[i];
      const pl = bb ? Math.sin(Math.min((idle - bb.t0) / 0.7, 1) * Math.PI) : 0;
      // ---- POSE + FADE: YOU is always here; the others are INVISIBLE in the background and fade in only as they
      //      step forward to receive (opacity == presence), then fade back out and vanish. ----
      const pres = (i === 0) ? (objectMode ? 0 : 1) : presenceEnv(idle - gCalled[i]);   // object mode draws the ORIGINAL, so YOU's clone stays hidden
      inst.pivot.visible = pres > 0.004;
      if (!inst.pivot.visible) { inst._shakeNode = -1; continue; }   // fully faded out → skip (nothing to draw)
      for (const m of inst.mats) m.opacity = pres;
      // In the object phase the bracelet is not labelled — it is simply the piece. The names
      // belong to the cluster further down, where they identify who is who.
      if (objectMode && inst.engMat) inst.engMat.opacity = 0;                   // EVERY part crosses the same hashed-alpha coverage together → the bracelet dissolves in/out as ONE unit
      if (inst.basinMat) inst.basinMat.opacity = pres;               // the button (not in `mats`) fades on the same uniform curve
      // RECEIVER PARITY: lift ONLY a summoned receiver's bead bodies with a faint warm self-glow (× presence), so DAD
      // reads as bright as YOU even sitting low in the dark. YOU (i===0) is exempt — it already basks in the warm pool.
      if (inst.bodyMat) { inst.bodyMat.emissive.setHex(0x3a2a12); inst.bodyMat.emissiveIntensity = (i === 0 ? 0 : GATHER_RECV_LIFT) * pres; }
      let U, R, F, pivScale;
      if (i === 0) {
        U = 0; R = 0; F = 0;                                                             // YOU stays dead-centre + bright
        pivScale = objectMode ? 1 : lerp(1, GATHER_YOU_SCALE, entr);   // object mode: stay exactly the hero bracelet's size                                       // SEAMLESS hand-off (#4): enters at the hero bracelet's EXACT size (1), eases to YOU's cluster size — no pop-in
      } else {
        const th = (i - 1) * (TAU / RN) + Math.PI / RN;                                  // its fixed slot on the ring
        // WHERE it settles: PORTRAIT → directly above/below YOU (narrow screen); LANDSCAPE → around YOU, out to the
        // SIDES at its own ring angle. Its slot never changes — it's simply revealed there.
        let tU, tR;
        if (portrait && many) { tU = Math.cos(th) * GATHER_RECV_V * 1.02; tR = Math.sin(th) * GATHER_RECV_H * 0.40; }
        else if (portrait) { tU = (Math.cos(th) >= 0 ? 1 : -1) * GATHER_RECV_UP; tR = 0; }
        else { tU = Math.cos(th) * GATHER_RECV_V; tR = Math.sin(th) * GATHER_RECV_H; }
        // SUBTLE reveal — the bracelet was ALWAYS there; pressing just reveals it. NO travel: it holds its slot and
        // fades in (opacity == pres), with only a whisper of scale + a hair of depth. Never dragged in from afar.
        U = tU; R = tR;
        F = lerp(0.16, -GATHER_RECV_FWD, pres);                                          // a hair back → settles level
        pivScale = lerp(GATHER_RECV_SCALE * 0.93, GATHER_RECV_SCALE, pres) * entr;
      }
      const amp = GATHER_FLOAT * modelR * entr;                                          // barely-there float
      const uu = U * modelR * entr + Math.sin(idle * GATHER_FSPEED[i] + GATHER_FPHASE[i]) * amp;
      const rr = R * modelR * entr + Math.sin(idle * GATHER_FSPEED2[i] + GATHER_FPHASE2[i]) * amp;
      const ff = F * modelR * entr;
      inst.pivot.position.set(up.x * uu + right.x * rr + _gfwd.x * ff, up.y * uu + right.y * rr + _gfwd.y * ff, up.z * uu + right.z * rr + _gfwd.z * ff);
      inst.pivot.scale.setScalar(pivScale);
      inst.pivot.quaternion.identity();
      // VIBRATE: a ping shakes ONLY the reached bead (its cap + base + symbol meshes)
      const shakeNode = bb ? bb.node : -1;
      if (inst._shakeNode !== shakeNode && inst._shakeNode >= 0) {
        const prev = inst.beadMeshes[inst._shakeNode]; if (prev) for (const bm of prev) bm.mesh.position.copy(bm.base);
      }
      inst._shakeNode = shakeNode;
      if (bb) {
        const sd = Math.max(0, 1 - (idle - bb.t0) / 0.42), k = GATHER_SHAKE * modelR * sd * sd;   // strongest at the hit, gone by ~0.42s
        const dx = Math.sin(idle * 88.0) * k, dy = Math.sin(idle * 97.0 + 1.3) * k, dz = Math.sin(idle * 105.0 + 2.6) * k;
        const meshes = inst.beadMeshes[bb.node];
        if (meshes) for (const bm of meshes) bm.mesh.position.set(bm.base.x + dx, bm.base.y + dy, bm.base.z + dz);
      }
      // spin: drag → momentum → SNAP to the nearest bead's front
      if (gDragging === i) { /* live drag sets gSpin */ }
      else if (gSnapping[i]) { const d = angDelta(gSpin[i], gTarget[i]); gSpin[i] += d * 0.2; if (Math.abs(d) < 0.003) { gSpin[i] = gTarget[i]; gSnapping[i] = false; } }
      else if (Math.abs(gVel[i]) > 0.0004) { gSpin[i] += gVel[i]; gVel[i] *= 0.92; if (Math.abs(gVel[i]) < 0.006) { gVel[i] = 0; gSnapTo(i); } }
      inst.spin.rotation.y = gSpin[i];
      // GRAVITY-DROP REBOUND (YOU only, on landing): every bead + the hub + the loose thread settles with its OWN
      // damped spring, staggered so they rebound slightly OUT OF SYNC like real loose beads. Weighty & subtle — small
      // amplitudes, quick decay, one main compression. World-up is mapped into the bracelet's spun local frame.
      if (i === 0) {
        const itau = (gLast - DROP_FALL) / (1 - DROP_FALL);
        if (gLast < 0.985 && itau > 0) {                                        // IMPACT: unsynchronized rebound + a real thread whip
          inst.mc.updateWorldMatrix(true, false);
          inst.mc.getWorldQuaternion(_dropQ); _dropQ.invert();
          _dropUp.set(0, 1, 0).applyQuaternion(_dropQ);                         // world-up in the bracelet's spun local frame
          const A = DROP_IMPACT * modelR;                                       // itau: 0 at impact → 1 by the settle; one compression + rebound, then rest
          for (const node in inst.beadMeshes) {                                  // beads: staggered freq + phase per node → they settle OUT OF SYNC
            const n = +node, off = -A * 0.5 * Math.exp(-3.2 * itau) * Math.sin((6.5 + (n % 4) * 0.8) * itau + n * 0.7);
            for (const bm of inst.beadMeshes[node]) bm.mesh.position.copy(bm.base).addScaledVector(_dropUp, off);
          }
          const hubOff = -A * 0.55 * Math.exp(-2.8 * itau) * Math.sin(5.0 * itau + 0.4);   // hub: heavier, slower, its own phase
          for (const bm of inst.hubMeshes) bm.mesh.position.copy(bm.base).addScaledVector(_dropUp, hubOff);
          // THREAD WHIP: the clasp rope genuinely BENDS — a travelling wave runs down the tail (root barely moves, the
          // free tip whips DOWN + curls, and LASHES sideways). Vertices displace along world-up (whip) + a lateral axis
          // (lash), each weighted toward the free tip and phase-shifted so the tail curls in an arc, not a straight kick.
          _dropSide.set(1, 0, 0).applyQuaternion(_dropQ);
          const WA = DROP_WHIP * modelR, LA = DROP_LASH * modelR;
          const wamp = (t) => -WA * Math.pow(t, 1.7) * Math.exp(-1.5 * itau) * Math.sin(6.2 * itau + 2.7 * t);
          const lamp = (t) => LA * Math.pow(t, 2.0) * Math.exp(-1.3 * itau) * Math.sin(4.7 * itau + 3.4 * t + 0.9);   // lateral lash — lags the whip, curls to the side
          for (const st of inst.threadStrands) {
            const a = st.geo.attributes.position.array, base = st.base, tA = st.tArr;
            for (let v = 0, nn = tA.length; v < nn; v++) { const t = tA[v], wo = wamp(t), lo = lamp(t), k = v * 3;
              a[k] = base[k] + _dropUp.x * wo + _dropSide.x * lo; a[k + 1] = base[k + 1] + _dropUp.y * wo + _dropSide.y * lo; a[k + 2] = base[k + 2] + _dropUp.z * wo + _dropSide.z * lo; }
            st.geo.attributes.position.needsUpdate = true;
          }
          for (const bd of inst.threadBeads) bd.mesh.position.copy(bd.base).addScaledVector(_dropUp, wamp(bd.t)).addScaledVector(_dropSide, lamp(bd.t));
          inst._whipped = true;
        } else {                                                                // falling (rigid) OR dwell (rest): beads + hub to base; un-bend the rope ONCE
          if (gLast < 0.985) for (const node in inst.beadMeshes) for (const bm of inst.beadMeshes[node]) bm.mesh.position.copy(bm.base);
          for (const bm of inst.hubMeshes) bm.mesh.position.copy(bm.base);
          if (inst._whipped) {
            for (const st of inst.threadStrands) { st.geo.attributes.position.array.set(st.base); st.geo.attributes.position.needsUpdate = true; }
            for (const bd of inst.threadBeads) bd.mesh.position.copy(bd.base);
            inst._whipped = false;
          }
        }
      }
      // which of THIS bracelet's beads is a live bond end (their bead on YOUR wrist, or your bead on THEIRS)?
      const connNode = gConn ? (i === 0 ? gConn.sNode : (i === gConn.p ? gConn.rNode : -1)) : -1;
      const connHue = gConn ? (i === 0 ? gConn.sHue : gConn.rHue) : 0;
      // glow: lit beads breathe; a ping flares the reached bead; a live bond keeps BOTH ends glowing. EVERY glow is
      // scaled by `pres` so it dims out in lock-step with the shell's opacity — the bracelet fades as ONE unit and no
      // lit bead (or the platform behind it) ever lingers bright / blooms through a half-faded shell.
      for (const node in inst.beadMat) {
        const m = inst.beadMat[node];
        const n = +node;
        let ei;
        if (bb && n === bb.node) { m.emissive.setHex(bb.hue); ei = (m.userData.lit ? breathe : 0) + 7 * pl; }
        else if (n === connNode) { m.emissive.setHex(connHue); ei = (m.userData.lit ? breathe : 0) + 3.4 * gConn.pres; }   // the bond: steady glow while together
        else if (m.userData.lit) { m.emissive.setHex(0xffb247); ei = breathe * (1 - 0.82 * pl); }
        else { ei = 0; }
        m.emissiveIntensity = ei * pres;
      }
    }
    // point the coach at the ACTUAL front bead of the YOU bracelet (only while it's asking) — a halo lands right on it
    if (window.__coach && window.__coach.needTarget && gatherInstances.length) {
      gatherGroup.updateMatrixWorld(true);
      const node = GATHER_NODE[frontPerson(gSpin[0])];
      if (beadWorld(gatherInstances[0], node, _cw)) {
        _cw2.copy(_cw).addScaledVector(right, 0.2 * GATHER_SCALE * modelR);   // a bead-radius offset → the halo's on-screen size
        const rect = canvas.getBoundingClientRect();
        _cw.project(camera); _cw2.project(camera);
        const sx = rect.left + (_cw.x * 0.5 + 0.5) * rect.width, sy = rect.top + (-_cw.y * 0.5 + 0.5) * rect.height;
        const rx = rect.left + (_cw2.x * 0.5 + 0.5) * rect.width, ry = rect.top + (-_cw2.y * 0.5 + 0.5) * rect.height;
        window.__coach.setTarget(sx, sy, Math.hypot(rx - sx, ry - sy));
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
    groundMesh = ground;   // box mode hides it — its shadow plane would otherwise hang mid-air inside the vitrine

    ready = true;
    if (loaderEl) loaderEl.classList.add("hide");
    poster.classList.add("hide");
    // NOTE: the first render is kicked from the loader callback, AFTER setupExplode(), not here.
    // The object phase arms its turn off beadAsm.frontY, so a frame drawn before that rig exists
    // would paint at SPIN_PHASE and then visibly snap ~53° on the next one.
  }

  // ---- overlay ----
  const intro = $("#heroIntro"), outro = $("#heroOutro"), cue = $("#heroCue"), bar = $("#heroProgress span");
  const heroCta = $("#heroCta");   // the opening CTAs, pinned bottom-centre; fades with the intro copy
  const cutEl = $("#heroCut");     // full-bleed black, dipped through the object → threading cut
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
  function overlay(p, rawP, gd = 0) {    // p == anim (de-dwelled); rawP == raw scroll (keeps advancing through dwells); gd == drop progress
    // Fade the intro on RAW scroll, not anim. The bead explodes at its natural front (early), and anim
    // FREEZES during that dwell — so an anim-based fade would leave the intro frozen on top of the
    // explosion. Raw scroll keeps moving, so the copy clears before the bead opens.
    const introOp = 1 - smooth(0.035, 0.085, rawP == null ? p : rawP);
    if (intro) intro.style.opacity = introOp;
    if (cue) cue.style.opacity = introOp;
    if (heroCta) { heroCta.style.opacity = introOp; heroCta.style.pointerEvents = introOp > 0.5 ? "auto" : "none"; }
    section.style.setProperty("--intro-op", String(introOp));   // light-mode hero veil fades WITH the intro copy
    const outOp = smooth(0.9, 0.99, p) * (1 - smooth(0.04, 0.34, gd));   // "Five people" rises at the settle, then fades as the drop plays
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
    // Guarantee the exploded-view boards are in flight long before they're needed: the object phase
    // owns the front of the scroll and the reveals come well after it, so 6% is a wide safety margin.
    if (target > 0.06) requestBoards();
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

  // MSAA render target so alphaToCoverage (the one-unit bracelet fade) resolves to a SMOOTH dissolve, not a dither.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: coarse ? 4 : 8 }));   // HalfFloat = HDR, matching the default composer live uses → ACES desaturates the bright emissive to white (not clamped amber); samples = MSAA for the alphaToCoverage fade
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.7, 0.86); // soft gold glints
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* Cross-fade the object phase's three lines through the hero's own sub-line, so nothing new
     is added to the layout. Restores the original copy the moment the phase ends. */
  function cycleObjectLine(on) {
    if (!subEl) return;
    if (!on) {
      if (subIdx !== -1) { subEl.innerHTML = subBase; subEl.style.opacity = ""; subIdx = -1; }
      return;
    }
    const t = idle % (OBJ_LINES.length * OBJ_SPAN);
    const i = Math.floor(t / OBJ_SPAN), u = t - i * OBJ_SPAN;
    if (i !== subIdx) {
      subIdx = i;
      subEl.innerHTML = OBJ_LINES[i][0] + ' <span class="gold-ink">' + OBJ_LINES[i][1] + "</span>";
    }
    const op = u < OBJ_IN ? u / OBJ_IN
             : u < OBJ_IN + OBJ_HOLD ? 1
             : Math.max(0, 1 - (u - OBJ_IN - OBJ_HOLD) / OBJ_OUT);
    subEl.style.opacity = String(op);
  }

  /* THE ONE BEAD THAT OPENS — keyed to the TURN, not to a clock. akoma_ntoaso splits open only as
     it comes round to face you, is fully open dead-front, and is closed again before it swings
     away. So the reveal is something the rotation brings you rather than something that happens at
     the object.

     The input is the signed angle from the current turn to the angle that faces that bead
     (beadAsm.frontY): it sweeps +OBJ_EX_WIN -> 0 -> -OBJ_EX_WIN as the bead passes front, and
     anything beyond that window is off-frame and closed.

     IMPORTANT: `_e` is NOT "how open" — updateExplode carries its OWN open/hold/close envelope
     across e = 0 -> 1 (tilt up by .28, split out by .46, hold to .66, reassemble by .9). So e = 1
     is CLOSED AGAIN, not open. What this returns is therefore a RAMP through that envelope, with
     the segments placed so the fully-open hold straddles u = 0.5 — dead-front. Both ends of the
     sweep land on a closed state, which is also why the ±π wrap on the far side is invisible. */
  const OBJ_TURN = 0.16;                       // rad/s — the object's slow turn
  const OBJ_EX_WIN = 0.95;                     // rad (~54°) either side of dead-front that counts as "in frame"
  const OBJ_EX_LEAD = 0.30;                    // rad of closed turning before the bead first swings in (~2 s)
  let objTurn = SPIN_PHASE, objTurnPrev = 0, objTurnArmed = false;
  const OBJ_EX_SEG = [
    [0.00, 0.10, 0,    0   ],   // swinging in — still shut
    [0.10, 0.35, 0,    0.46],   // tilt up + split out
    [0.35, 0.62, 0.46, 0.66],   // held open, straddling dead-front
    [0.62, 0.88, 0.66, 1   ],   // reassemble + tilt back
    [0.88, 1.00, 1,    1   ]    // swinging away — shut again (e = 1 is assembled)
  ];
  function objExplodeEnv(d) {
    const u = clamp((OBJ_EX_WIN - d) / (2 * OBJ_EX_WIN), 0, 1);
    for (const [u0, u1, e0, e1] of OBJ_EX_SEG) {
      if (u >= u1) continue;
      return e0 === e1 ? e0 : e0 + (e1 - e0) * smooth(u0, u1, u);
    }
    return 1;
  }

  function update(rawP0) {
    // The object phase owns the first OBJECT_FRAC of scroll; everything that follows is the
    // original timeline, rescaled into the remainder so its tuning still holds.
    const objP = clamp(rawP0 / OBJECT_FRAC, 0, 1);
    const inObject = objP < 1;
    // THE OBJECT. Do not reconstruct a bracelet here — the timeline already produces a
    // perfectly assembled one at the end of its threading/settle run (hub in place, cord
    // closed, every bead restored, camera in the tuned product-shot framing). So the object
    // phase simply RENDERS THAT STATE and turns it. Rebuilding it by hand is what dropped the
    // hub (the bead map held beads only) and glitched akoma_ntoaso (setupExplode reparents its
    // meshes, so restoring them from a saved base position cannot put it back).
    const rawP = inObject ? HERO_FRAC
                          : clamp((rawP0 - OBJECT_FRAC) / (1 - OBJECT_FRAC), 0, 1);
    // scroll timeline: [0..HERO_FRAC] the hero anim (threading → reveals → settle) →
    // [HERO_FRAC..GATHER_END] the gather → dwell to 1. (The phone story used to own the front of it.)
    const p = clamp(rawP / HERO_FRAC, 0, 1);
    const gather = Math.max(0, Math.min(1, (rawP - HERO_FRAC) / (GATHER_END - HERO_FRAC)));   // scroll into the gather zone — now only ARMS/triggers the drop
    // TIME-BASED DROP: a tiny scroll past "Five people" TRIGGERS the fall, which then plays out on its OWN clock (idle)
    // as one sudden motion — instead of the fall being scroll-scrubbed frame-by-frame (which read as a "frozen" drop).
    // BIDIRECTIONAL TIME-BASED DROP: a tiny scroll past the caption sets the target (past → 1 fall, back → 0 rise); gd
    // eases there on its OWN clock, so the fall plays as one sudden motion AND reverse-scroll smoothly REWINDS it.
    const dTgt = gather > DROP_TRIGGER ? 1 : 0;
    const ddt = Math.min(0.1, Math.max(0, idle - _dropPrevIdle)); _dropPrevIdle = idle;        // per-frame idle delta (clamped for tab-switch safety)
    if (dropGd < dTgt) dropGd = Math.min(1, dropGd + ddt / DROP_TIME);
    else if (dropGd > dTgt) dropGd = Math.max(0, dropGd - ddt / DROP_REV);
    const gd = dropGd;                                                                         // 0 = up on the hero table → 1 = fully landed
    const fg = Math.max(0, (gd - DROP_HOLD_F) / (1 - DROP_HOLD_F));                             // fall+bounce progress (stays 0 through the hold)
    gLast = fg;
    if (fg > _prevFg) {                                                                         // forward drop → whoosh as it lets go, thud when it lands
      if (_prevFg < 0.02 && fg >= 0.02) dropWhoosh();
      if (_prevFg < DROP_FALL && fg >= DROP_FALL) dropThud();
    } else if (fg < _prevFg && _prevFg >= 0.02 && fg < 0.02) dropRise();                        // reverse-scroll → a soft lift whoosh
    _prevFg = fg;
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
    // OBJECT PHASE: the finished bracelet turns, and the ONE bead that opens does so as it comes
    // round — the hero's own exploded-bead rig, not a second one. Both the turn and the explode
    // phase are worked out HERE, before the updateExplode pass below, because that pass resets
    // every reveal's _e to 0 each frame (so a later assignment is silently discarded) AND reads
    // spin's orientation to decide which way to tilt the assembly.
    // beadAsm.presentSpin is null, so updateExplode never seizes the spin for its own staging: the
    // bead tilts its axis up and splits flat while the piece keeps turning at a constant rate.
    if (inObject) {
      // Arm the turn just SHORT of the window the first time in, so the hero opens on a whole,
      // assembled piece and the bead swings in about two seconds later. Left at SPIN_PHASE it
      // starts 0.33 rad from front — INSIDE the window — so the very first frame would already be
      // a half-split bead. (SPIN_PHASE is tuned for the threading timeline, not for this.)
      if (!objTurnArmed && beadAsm) { objTurnArmed = true; objTurn = beadAsm.frontY - OBJ_EX_WIN - OBJ_EX_LEAD; objTurnPrev = idle; }

      objTurn += Math.min(0.1, Math.max(0, idle - objTurnPrev)) * OBJ_TURN;   // own accumulator, so the entry phase can be set without a jump
      objTurnPrev = idle;
      if (beadAsm) beadAsm._e = objExplodeEnv(angDelta(objTurn, beadAsm.frontY));
    } else {
      // Disarm on the way out, so coming BACK to the top re-arms and opens on a whole piece again.
      // Latched, a return landed on the frozen angle — mid-split in one frame if they left mid-
      // reveal, or nothing at all for most of a revolution if they left just past it. The re-arm
      // is invisible: the phase boundary is already a hard cut, played behind the dip to black.
      objTurnArmed = false;
    }
    const settle = smooth(SETTLE0, 1, anim);       // 0 through the scroll, ramps to 1 at the very end (the pan-out)
    let spinY = SPIN_PHASE + anim * TAU * SPIN_TURNS;
    if (settle > 0) { let dd = endSpin - spinY; dd = ((dd + Math.PI) % TAU + TAU) % TAU - Math.PI; spinY += dd * settle; }   // ease to hub-at-back
    spin.rotation.y = inObject ? objTurn : spinY;   // the object phase owns its turn (set just above); the timeline owns it everywhere else
    const f = Math.min(1, anim * 1.8);             // trace draws faster than the spin so it keeps pace — threading begins only when the bead scroll (hero phase) does
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
    // GRAVITY DROP: the cluster free-falls from the hero "table" (y=0) to the how-it-works one (y=-DROP_DIST), then one
    // weighty rebound. The camera follows DOWN but LAGS, so the fall reads on screen before it settles centred.
    let dFall, dBounce = 0;
    if (fg < DROP_FALL) { const t = fg / DROP_FALL; dFall = t * t; }               // smooth gravity accel (t²) — a fluid fall, not an abrupt snap
    else { dFall = 1; const s = (fg - DROP_FALL) / (1 - DROP_FALL); dBounce = DROP_BOUNCE * 4 * s * (1 - s); }   // one arch rebound
    dropClusterY = (-DROP_DIST * dFall + dBounce) * modelR;
    const camY = -DROP_DIST * smooth(0, DROP_CAMLAG, fg) * modelR;
    if (gatherGroup) gatherGroup.position.set(0, dropClusterY, 0);
    // When someone is summoned in the object phase, ease the framing out to the gather fit so
    // the arriving bracelet is actually in shot, and let it close again as they recede.
    placeCamera(settle, objectMode ? gRecvPres : fg, camY);
    threadAmbient(smooth(0.04, 0.16, anim) * (1 - smooth(0.86, 1.0, anim)) * (1 - Math.min(1, fg * 3)));   // slight ambient pad while the bracelet threads (off during the drop)
    for (const rv of reveals) {
      if (!inObject && rv._e > 0.06 && (rv._prevE || 0) <= 0.06) explodeSound();   // the CAD assembly opens → a slight airy reveal whoosh. Muted in the object phase on purpose: that reveal is ambient, and the opening of the page should not make a noise nobody asked for.
      rv._prevE = rv._e;
      updateExplode(rv, rv._e);
    }
    updateHubLabels(hubAsm ? hubAsm._e : 0);
    updateBeadLabels(beadAsm ? beadAsm._e : 0);
    updateBeadWords(anim);
    // NOTE: no end-of-scroll hub rotation. Any "button up" rotation tilts the hub OUT of the
    // bracelet plane — but the cord and every bead's bus holes lie in one plane, so the hub must
    // stay in that plane too (exactly where it's threaded). It keeps its natural threaded
    // orientation through the settle, coplanar with the beads, so the cord stays in the bus holes.
    // Drive the intro fade off the RAW, un-remapped scroll so it is MONOTONIC across the whole
    // hero. Two earlier attempts were both wrong: rawP is pinned to HERO_FRAC in object mode (so
    // the fade read the opening as "long past the intro" and hid the title), and switching to the
    // object phase's own progress made the copy fade out and then FLASH BACK ON, because the
    // remapped rawP restarts near 0 the instant object mode ends. This holds the copy up through
    // the object phase, clears it as the phone story arrives, and keeps it cleared.
    const introDrive = 0.035 + 0.05 * smooth(OBJECT_FRAC * 0.72, OBJECT_FRAC, rawP0);
    overlay(anim, introDrive, fg);   // intro/cue fade on RAW scroll; the "Five people" outro fades as the FALL starts (held through DROP_HOLD_F)
    // THE CUT. The object phase ends on a finished, threaded bracelet in its own framing; the
    // timeline resumes on the same beads with no cord yet, at a different angle and distance.
    // Three discontinuities at once, so rather than pretend otherwise, dip the whole frame to
    // black through the boundary and let it read as an edit.
    if (cutEl) {
      const dc = Math.abs(rawP0 - OBJECT_FRAC);
      cutEl.style.opacity = String(clamp(1 - smooth(0, CUT_WIN, dc), 0, 1));
    }
    // Hand the object phase to the gather rig (YOU == the hero bracelet, unchanged in size or
    // place) so that tapping a bead can summon a receiver. Nothing is announced: the bracelet
    // just turns, and a touch is the only thing that reveals there is someone on the other end.
    objectMode = inObject;
    // Keep the gather maths in step with the turn (gReach/frontFriend read gSpin[0]); the turn
    // itself is advanced up in the reveal block.
    if (inObject) gSpin[0] = objTurn;
    cycleObjectLine(inObject);
    updateGather(inObject ? 1 : fg);
  }

  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
    idle += 0.016;
    progress += (target - progress) * 0.09;
    if (Math.abs(target - progress) < 0.0002) progress = target;
    if (ready && inView) { if (boxMode) updateBox(); else update(progress); composer.render(); }
  }

  window.__hero = {
    setProgress(p) { p = clamp(p, 0, 1); target = progress = p; if (ready) { update(p); composer.render(); } },
    suppressOutro(v) { this._suppressOutro = v; },   // the touch-demo owns the outro fade once it's in view
    get progress() { return progress; },
    get ready() { return ready; },
  };

  // Wake the AudioContext on the user's FIRST real interaction so sound starts as early as possible (not only after a bead
  // tap). Browsers only allow audio to resume from an ACTIVATION gesture (click/tap/key — NOT scroll/wheel), and a failed
  // resume must NOT consume the primer — so keep listening across ALL gestures until the context is actually running.
  const _AUDIO_EV = ["pointerdown", "touchstart", "touchend", "mousedown", "keydown", "click", "wheel"];
  const _primeAudio = () => {
    const c = audioCtx(); if (!c) return;                                   // audioCtx() creates + attempts a resume
    const done = () => { if (c.state === "running") _AUDIO_EV.forEach((ev) => window.removeEventListener(ev, _primeAudio)); };
    if (c.state === "running") done();
    else if (c.resume) c.resume().then(done).catch(done);                   // resolve when the gesture actually unlocks it
  };
  _AUDIO_EV.forEach((ev) => window.addEventListener(ev, _primeAudio, { passive: true }));
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", resize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);   // mobile URL-bar show/hide resizes the canvas box
  new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { threshold: 0 }).observe(section);
  resize();

  // ---- gather interaction: drag a bracelet to spin it; tap it to light up + buzz (only once gathered) ----
  const gRay = new THREE.Raycaster();
  // a fat fingertip rarely lands pixel-perfect on YOU's mesh; sample a small cross so a near-miss still registers.
  // which bead node a mesh belongs to (its cap / base / symbol-disc are all named "<part><node>", node 0 unsuffixed)
  const beadNodeOf = (o) => {
    const nm = o.name || "";
    if (nm.indexOf("PLATFORM") === 0) return nm === "PLATFORM" ? 0 : parseInt(nm.slice(8), 10);
    if (nm.indexOf("FB_CAP") === 0)  return nm === "FB_CAP"  ? 0 : parseInt(nm.slice(6), 10);
    if (nm.indexOf("FB_BASE") === 0) return nm === "FB_BASE" ? 0 : parseInt(nm.slice(7), 10);
    return -1;
  };
  // the gold hub button is its own mesh — a press there is not a bead press, it is the SOS
  const isHubButton = (o) => /^(BASIN_SWITCH|HUB_TOP)/.test(o.name || "");
  // the person a tapped bead reaches: a friend bead → that friend; the "You"/symbolic beads or a between-beads tap → nearest friend
  const personForTap = (node) => { const p = (node >= 0) ? PERSON_OF_NODE[node] : undefined; return (p != null && p > 0) ? p : frontFriend(); };
  // Ray-pick the SPECIFIC bead tapped on YOU (so every exposed bead is independently pressable, not just the front one).
  // A 5-point cross gives fat-finger tolerance (centre first); hidden internals are skipped; a sample whose nearest
  // surface is another bracelet is discarded so a background bracelet can't hijack the tap.
  function gPickBead(ev) {
    const you = gatherInstances[0];
    if (!gatherGroup || !you) return { i: -1, node: -1 };
    // object mode displays the original, so raycast THAT; the clone is hidden there
    const target = (objectMode || boxMode) ? spin : you.pivot;
    if (!objectMode && !boxMode && !gatherGroup.visible) return { i: -1, node: -1 };
    const rect = canvas.getBoundingClientRect();
    const R = 16, offs = [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]];
    let youHit = false;
    for (const off of offs) {
      const nx = ((ev.clientX - rect.left + off[0]) / rect.width) * 2 - 1;
      const ny = -((ev.clientY - rect.top + off[1]) / rect.height) * 2 + 1;
      gRay.setFromCamera(new THREE.Vector2(nx, ny), camera);
      // ONLY raycast YOU: the background bracelets are opacity-0/invisible but their meshes are still raycast-hittable
      // (the raycaster ignores the pivot's visible flag), and they'd otherwise sit in front and block taps on YOU's beads.
      const hits = gRay.intersectObject(target, true);
      let hit = null; for (const h of hits) { if (h.object.visible) { hit = h; break; } }   // skip the hidden internals
      if (!hit) continue;
      youHit = true;
      if (isHubButton(hit.object)) return { i: 0, node: -1, hub: true };   // the gold button → SOS
      const node = beadNodeOf(hit.object);
      if (node >= 0) return { i: 0, node };   // landed on a specific bead of YOU
    }
    return { i: youHit ? 0 : -1, node: -1 };   // on YOU but between beads (cord) → node -1
  }
  const clearHold = () => { if (gHoldTimer) { clearTimeout(gHoldTimer); gHoldTimer = null; } };
  canvas.addEventListener("pointerdown", (ev) => {
    if (boxMode) {
      const pick = gPickBead(ev);
      if (pick.node >= 0) window.dispatchEvent(new CustomEvent("makoma:pick", { detail: { node: pick.node } }));
      return;                                          // no summon/echo/drag inside the box
    }
    if (gLast < 0.90 && !objectMode) return;
    const pick = gPickBead(ev); if (pick.i !== 0) return;   // only the big central YOU bracelet is interactive; the others are backgrounded
    const i = 0;
    audioCtx();   // wake the AudioContext inside this gesture so the hold-fired Echo is allowed to sound
    gDragging = i; gDownNode = pick.node; gDownHub = !!pick.hub; gDownX = gLastX = ev.clientX; gDownY = ev.clientY; gMoved = false; gVertScroll = false; gVel[i] = 0;
    gHeld = false; clearHold();
    gHoldTimer = setTimeout(() => { gHoldTimer = null; if (gDragging === i && !gMoved) { gHeld = true; startEcho(i, personForTap(gDownNode)); } }, ECHO_HOLD);   // hold → Echo to the pressed bead's person
    // NOTE: no setPointerCapture here — capture only once a horizontal drag is confirmed (below), so a tap or a
    // vertical scroll gesture that begins on YOU is left to the browser (touch-action:pan-y keeps the page scrolling).
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (gDragging < 0) return;
    if (gVertScroll) return;                                // committed to a vertical scroll → never spin
    if (!gMoved) {
      const dx = ev.clientX - gDownX, dy = ev.clientY - gDownY;
      if (Math.hypot(dx, dy) <= 10) return;                 // still inside platform tap-slop → keep the tap/hold alive
      gMoved = true; clearHold();                           // moved beyond the slop → no longer a tap/hold, either way
      if (Math.abs(dx) <= Math.abs(dy)) { gVertScroll = true; return; }   // vertical-dominant → hand it to the page scroll (no spin, no pulse)
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}   // horizontal-dominant → it's a spin; grab the gesture only now
      if (window.__coach) window.__coach.done("drag");      // completes the coach's Drag step
    }
    const d = (ev.clientX - gLastX) * 0.012;
    gSpin[gDragging] += d; gVel[gDragging] = d; gLastX = ev.clientX;
  });
  const gEnd = (ev) => {
    if (gDragging < 0) return; const i = gDragging; gDragging = -1;
    clearHold();
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    if (gHeld) { gHeld = false; }                                        // the Echo already fired on the long press — no tap
    else if (!gMoved && ev.type === "pointerup") {
      if (gDownHub) sosAll(i);                                           // the hub button reaches EVERYONE
      else gReach(i, personForTap(gDownNode));                           // a bead reaches ITS person
    }
    else if (gMoved && !gVertScroll && Math.abs(gVel[i]) < 0.006) gSnapTo(i);   // slow horizontal-drag release → snap now; else momentum carries, then snaps
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

  // ---- adjustable macramé closure: the real Shamballa sliding clasp — two cord tails leaving the BACK of the hub,
  //      each cinched by a wrapped sennit knot, then a smoky-quartz bead, ending in a small knot bead. Built INTO
  //      `model` (children) so it clones into the gather cluster and rides every spin/settle like the rest. ----
  // smoky-quartz accent bead: a SUBTLE dark-amber frosted bead. Kept dim (barely any emissive) + small so it reads as
  // a quiet detail on the tail, not a glowing orb the bloom pass turns into a distracting halo.
  const matQuartz = new THREE.MeshStandardMaterial({ color: 0x7c5f34, roughness: 0.44, metalness: 0.05, emissive: 0x140d04, emissiveIntensity: 0.18, envMapIntensity: 0.75 });
  let adjusters = null;
  function buildAdjusters() {
    if (adjusters) { model.remove(adjusters); adjusters = null; }
    adjusters = new THREE.Group(); adjusters.name = "ADJUSTERS";
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // a 3-strand twisted rope along `curve` — reads as a braided macramé cord (a smooth tube reads as plastic).
    // Strands are offset tubes revolving around the centreline via the curve's own Frenet frames.
    const rope = (curve, segs, strandR, offR, turns) => {
      const g = new THREE.Group();
      const frames = curve.computeFrenetFrames(segs, false);
      for (let s = 0; s < 3; s++) {
        const phase = s * TAU / 3, pts = [];
        for (let i = 0; i <= segs; i++) {
          const t = i / segs, ang = phase + t * turns * TAU;
          const p = curve.getPointAt(t);
          pts.push(p.addScaledVector(frames.normals[i], Math.cos(ang) * offR).addScaledVector(frames.binormals[i], Math.sin(ang) * offR));
        }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom"), segs, strandR, 8, false), matCord));
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      return g;
    };
    // Each tail is the SAME cord continuing: it threads out of the hub right BELOW the main bus cord, at the SAME Z
    // (in line), embedded through the side wall like the main cord, then hangs straight down (+Y = world-down),
    // drifting only slightly outward to clear the hub. A dark end bead caps the free tip.
    for (const sign of [-1, 1]) {
      const main = (sign < 0 ? cordEndL : cordEndR);   // this side's main bus-cord hub entry
      const z0 = main.z;                               // IN LINE with the main cord in Z
      const embed = V(sign * 1.12, 0.30, z0);          // starts INSIDE the hub (occluded) — threaded through the wall
      const mouth = V(sign * 1.50, 0.36, z0);          // emerges from the side wall, right below the main cord
      const p1 = V(sign * 1.70, 0.82, z0);             // hangs down, drifting a touch outward to clear the hub
      const pq = V(sign * 1.86, 1.30, z0);             // smoky-quartz slider
      const pe = V(sign * 1.95, 1.72, z0);             // end knot bead at the tip
      const curve = new THREE.CatmullRomCurve3([embed, mouth, p1, pq, pe], false, "centripetal");
      adjusters.add(rope(curve, 100, 0.062, 0.055, 4));
      const q = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), matQuartz); q.position.copy(pq); q.castShadow = true; adjusters.add(q);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), matBlack); e.position.copy(pe); e.castShadow = e.receiveShadow = true; adjusters.add(e);
    }
    adjusters.traverse((o) => { if (o.isMesh) o.userData.adjuster = true; });   // tagged so the clasp tails can be treated as part of the hub
    model.add(adjusters);
  }

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

  // The two KiCad board GLBs (akoma_pcb 78 KB + akoma_hub_pcb 229 KB) are only ever seen deep inside the
  // exploded view, but they used to be requested the instant the bracelet GLB finished parsing — which
  // extended the cold-load critical chain from 3.7 s to 7.4 s for something nobody has scrolled to yet.
  // Queue them instead and fetch on the first idle moment, or the moment the scroll starts heading toward
  // the reveal, whichever comes first. `buildBoard` still returns its (initially empty) group synchronously,
  // so the assembly graph is unchanged — only the network request moves off the critical path.
  const boardQueue = [];
  let boardsRequested = false;
  function buildBoard(url, axis) {   // a REAL routed board exported from KiCad (Draco glTF), laid flat ⟂ axis
    const g = new THREE.Group();     // filled asynchronously when the board GLB loads
    boardQueue.push(() => loader.load(url, (gltf) => {
      const board = gltf.scene;
      board.position.sub(new THREE.Box3().setFromObject(board).getCenter(new THREE.Vector3()));   // centre on origin
      board.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const holder = new THREE.Group();
      holder.add(board);
      holder.scale.setScalar(MM * 1000);                                 // KiCad glTF is in metres -> hero units
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);   // component side -> assembly axis
      g.add(holder);
    }, undefined, (e) => console.warn("[hero3d] board load failed:", url, e)));
    return g;
  }
  function requestBoards() {         // idempotent; safe to call from both the idle hook and the scroll handler
    if (boardsRequested) return;
    boardsRequested = true;
    while (boardQueue.length) boardQueue.shift()();
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
    // Tag the sealed internals (bead PCB + motor, hub board + battery + speaker) so the gather CLONES can hide them.
    // In the cluster the hub/bead are CLOSED; a fading (semi-transparent) shell would otherwise reveal these parts
    // through it, which reads as unfinished. The tag rides clone(true) via userData; buildGather skips tagged meshes.
    for (const asm of [beadAsm, hubAsm]) if (asm) for (const g of asm.internals) if (g) g.userData.internal = true;
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
    beadAsm = { pivot, parts, axis, pE, W: EXPLODE_WIN, internals: [pcb, motor], presentSpin: null, labels, frontY: fs };   // frontY: the object phase eases the turn here so the reveal never happens on the far side
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

  // NOTE: a dev-only keydown handler used to live here to tune the braid params live (keys 1-8/g/f/e/d/b).
  // It called e.preventDefault() on those keys at the window level, which swallowed them everywhere on the
  // page — including the waitlist email field (you couldn't type an 'e', 'd', 'b', etc.). Removed for good.

  // ==================================================================
  // THE MANUFACTURING BOX. "Customize bracelet" plays a cinematic: a clear
  // acrylic vitrine on a lit white base rises under the turning piece, the
  // bracelet drops in (whoosh, thud, one soft bounce), and the customise
  // panel (#customize — the SAME panel configurator.js drives) slides in.
  // The lit base is a turntable: selecting a person eases their bead round
  // to the front; otherwise the piece keeps a slow display turn.
  // Page scroll is locked while the box is up, so the scroll timeline is
  // simply not consulted (render() calls updateBox() instead of update()).
  // The visitor's design (shell colourway + each person's light) is applied
  // to the REAL model here — and deliberately KEPT after closing, so the
  // hero keeps showing the bracelet they made.
  // ==================================================================
  const BOX_AZ = 26, BOX_EL = 12.5;         // three-quarter view — straight-on, a clear cube reads as a flat rectangle
  // THE CATCH. The bracelet never falls and never idles in rotation: it hangs on a slow weightless
  // bob (turning ONLY when a person is selected, to present their bead). The base rises from
  // below, and then the glass closes on the piece FROM THE SIDES — two half-shell jaws that
  // approach slowly and strike fast, an animal catching its prey, with one short bite-shudder as
  // they meet. The seam the two shells leave down the front is deliberate: it reads as the doors
  // they are.
  const BOX_RISE_AT = 0.2, BOX_RISE_T = 1.5;         // the lit base, up from below
  const BOX_JAW_AT = 1.15, BOX_JAW_T = 1.6;          // the glass jaws: slow approach, fast close
  const BOX_CAM_T = 2.4, BOX_PANEL_AT = 3.2;
  let boxMode = false, boxT0 = 0, boxGroup = null, boxJaws = null, boxJawL = null, boxJawR = null, boxPlate = null;
  let boxSide = 0, boxWallH = 0, boxBaseTh = 0, boxFloorY = 0, boxCY = 0;
  let boxSpin = 0, boxSpinTgt = null, boxSounded = false, boxSnapped = false, boxCamFrom = null, boxFront = null, boxFlare = null;
  let groundMesh = null, designApplied = false;
  const boxPlatMat = {};                    // node -> this mode's own platform material (colourable per person)

  function buildVitrine() {
    if (boxGroup) return;
    orient.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(orient);
    boxSide = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 1.14;
    boxWallH = boxSide * 0.62;
    boxBaseTh = boxSide * 0.15;
    // the piece FLOATS, riding LOW in the glass — just clear of the plate, most of the air above
    boxFloorY = bb.min.y - boxWallH * 0.16;
    boxCY = boxFloorY + boxWallH * 0.42;    // what the box camera looks at
    boxGroup = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(boxSide * 1.06, boxBaseTh, boxSide * 1.06),
      new THREE.MeshStandardMaterial({ color: 0x83858a, roughness: 0.55, metalness: 0.3, envMapIntensity: 0.5 }));
    base.position.y = boxFloorY - boxBaseTh / 2;
    // dialled LOW on purpose (0.9 → 0.34 → 0.12 across founder rounds): the plate's job is a
    // soft under-glow, and any brighter it steals the frame from the piece
    boxPlate = new THREE.Mesh(new THREE.BoxGeometry(boxSide, boxBaseTh * 0.14, boxSide),
      new THREE.MeshStandardMaterial({ color: 0x9b9ea4, emissive: 0xfff4e4, emissiveIntensity: 0.1, roughness: 0.5, metalness: 0 }));
    boxPlate.position.y = boxFloorY - boxBaseTh * 0.07;   // its TOP face is the lit floor the piece lands on
    boxPlate.receiveShadow = true;
    // GLASS. Not `transmission` — that renders through the renderer's transmission buffer, which
    // under this pipeline (alpha canvas + EffectComposer) resolves WHITE and turned every pane
    // into frosted milk. Glass over a black stage is sold by absence + edges instead: panes at
    // near-zero opacity with a faint cool tint and a whisper of env sheen, and BRIGHT edge lines.
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe9ff, metalness: 0, roughness: 0.05,
      transparent: true, opacity: 0.028, envMapIntensity: 0.12, specularIntensity: 0.15,
      side: THREE.DoubleSide, depthWrite: false });
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    // TWO HALF-SHELL JAWS, split down the middle: each carries a full side wall, half the front,
    // half the back and half the lid. They slide in along ±X (see updateBox).
    const hw = boxSide / 2, midY = boxFloorY + boxWallH / 2, topY = boxFloorY + boxWallH;
    const pane = (jaw, w, h, px, py, pz, ry, rx) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.Mesh(g, glassMat);
      m.position.set(px, py, pz); if (ry) m.rotation.y = ry; if (rx) m.rotation.x = rx;
      m.renderOrder = 3;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), lineMat);
      e.position.copy(m.position); e.rotation.copy(m.rotation); e.renderOrder = 4;
      jaw.add(m, e);
    };
    boxJawL = new THREE.Group(); boxJawR = new THREE.Group();
    pane(boxJawL, boxSide, boxWallH, -hw, midY, 0, Math.PI / 2, 0);        // left wall
    pane(boxJawL, hw, boxWallH, -hw / 2, midY, hw, 0, 0);                  // front, left half
    pane(boxJawL, hw, boxWallH, -hw / 2, midY, -hw, 0, 0);                 // back, left half
    pane(boxJawL, hw, boxSide, -hw / 2, topY, 0, 0, -Math.PI / 2);         // lid, left half
    pane(boxJawR, boxSide, boxWallH, hw, midY, 0, Math.PI / 2, 0);         // right wall
    pane(boxJawR, hw, boxWallH, hw / 2, midY, hw, 0, 0);                   // front, right half
    pane(boxJawR, hw, boxWallH, hw / 2, midY, -hw, 0, 0);                  // back, right half
    pane(boxJawR, hw, boxSide, hw / 2, topY, 0, 0, -Math.PI / 2);          // lid, right half
    boxJaws = new THREE.Group(); boxJaws.add(boxJawL, boxJawR);
    boxJaws.visible = false;
    scene.add(boxJaws);
    // the vitrine's own downlight — a museum spot from above, so the piece is LIT over the plate
    // rather than backlit by it. Parented to the STATIC jaws root, not the rising base, so the
    // light doesn't sweep up the piece during the rise.
    const spot = new THREE.SpotLight(0xffe9c4, 1.7, 0, 0.62, 0.55, 1.1);   // warm + restrained: white at 2.6 washed the matte-black shell grey
    spot.position.set(boxSide * 0.35, boxFloorY + boxWallH * 2.1, boxSide * 0.4);
    spot.target.position.set(0, boxFloorY, 0);
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.001; spot.shadow.radius = 5;   // soft contact shadow; the tighter bias printed banding streaks on the plate
    boxJaws.add(spot, spot.target);
    boxGroup.add(base, boxPlate);
    boxGroup.visible = false;
    scene.add(boxGroup);
    // per-node front angles for THIS camera azimuth (frontAngleOf was sampled for the gather
    // camera and only covers the six gather nodes; a person may sit on any of the eight)
    boxFront = {};
    const camDir = new THREE.Vector3(Math.cos(BOX_AZ * DEG), 0, Math.sin(BOX_AZ * DEG));
    const sav = spin.rotation.y, v = new THREE.Vector3();
    for (let node = 0; node < 8; node++) {
      const plat = model.getObjectByName("PLATFORM" + (node === 0 ? "" : String(node))); if (!plat) continue;
      plat.geometry.computeBoundingBox();
      const c = plat.geometry.boundingBox.getCenter(new THREE.Vector3());
      let best = -Infinity, bth = 0;
      for (let k = 0; k < 180; k++) {
        const th = k / 180 * TAU; spin.rotation.y = th; spin.updateMatrixWorld(true);
        v.copy(c).applyMatrix4(plat.matrixWorld);
        const d = v.dot(camDir); if (d > best) { best = d; bth = th; }
      }
      boxFront[node] = bth;
    }
    spin.rotation.y = sav; spin.updateMatrixWorld(true);
  }

  // The stored design onto the REAL model: the shell colourway recolours the shared shell
  // material (beads + hub together — that IS what a colourway means), and each person's light
  // becomes their bead's platform emissive. Platforms get this mode's own materials because the
  // stock ones are shared (matGlow across five beads, matGold elsewhere) — per-person colour
  // needs one material per bead.
  function applyDesign() {
    const D = window.MAKOMA_DESIGN; if (!D || !model) return;
    const st = D.get();
    matBlack.color.set(D.shellDef(st.shell).hex);
    const lit = {};
    st.people.forEach((p) => { lit[D.beadOf(p.sym)] = p.glow; });
    for (let node = 0; node < 8; node++) {
      const plat = model.getObjectByName("PLATFORM" + (node === 0 ? "" : String(node))); if (!plat) continue;
      let m = boxPlatMat[node];
      if (!m) { m = boxPlatMat[node] = matGlow.clone(); }
      if (lit[node]) { m.color.set(lit[node]); m.emissive.set(lit[node]); m.userData.base = 2.2; }
      else { m.color.set(0xc6a24c); m.emissive.set(0xc6a24c); m.userData.base = 0.0; m.roughness = 0.36; m.metalness = 1.0; }
      m.emissiveIntensity = m.userData.base;
      plat.material = m;
    }
    designApplied = true;
  }

  const lockScroll = (on) => {
    document.documentElement.style.overflow = on ? "hidden" : "";
    document.body.style.overflow = on ? "hidden" : "";
  };

  function openBox() {
    if (boxMode) return;
    const cust = $("#customize"); if (!cust) return;
    audioCtx();                                        // wake audio inside the gesture
    if (section.classList.contains("no3d")) {          // no-WebGL fallback: the panel alone, over the poster
      lockScroll(true); section.classList.add("in-box"); cust.classList.add("is-open");
      return;
    }
    window.scrollTo(0, 0);
    target = progress = 0;
    update(0);                                         // settle the object-phase state before freezing it
    for (const rv of reveals) { rv._e = 0; rv._prevE = 0; updateExplode(rv, 0); }   // the open bead closes for the drop
    for (const id of ["#hubLabels", "#beadLabels", "#beadWords"]) { const h = $(id); if (h) h.style.opacity = "0"; }
    buildVitrine();
    applyDesign();
    if (groundMesh) groundMesh.visible = false;
    if (gatherGroup) gatherGroup.visible = false;
    spin.visible = true;
    if (cutEl) cutEl.style.opacity = "0";
    boxMode = true; boxT0 = idle; boxSounded = false; boxSnapped = false; boxFlare = null;
    boxSpin = spin.rotation.y; boxSpinTgt = null;
    boxGroup.visible = true; boxJaws.visible = true;
    boxJawL.position.x = -1.7 * boxSide; boxJawR.position.x = 1.7 * boxSide;
    boxCamFrom = { pos: camera.position.clone(), tgt: new THREE.Vector3(0, 0, 0) };
    lockScroll(true); section.classList.add("in-box");
    // the panel arrives once the glass has closed; "makoma:boxopen" tells the configurator to
    // present the currently-selected person's bead (the only rotation the piece does in here)
    const showPanel = () => { if (!boxMode) return; cust.classList.add("is-open"); window.dispatchEvent(new CustomEvent("makoma:boxopen")); };
    if (reduce) showPanel();
    else setTimeout(showPanel, BOX_PANEL_AT * 1000);
  }

  function closeBox() {
    const cust = $("#customize");
    if (section.classList.contains("no3d")) {
      lockScroll(false); section.classList.remove("in-box"); if (cust) cust.classList.remove("is-open");
      return;
    }
    if (!boxMode) return;
    if (cust) cust.classList.remove("is-open");
    // a quick dip to black covers the box striking + the camera cut back to the object framing —
    // the same edit idiom as the object → threading boundary
    if (cutEl) cutEl.style.opacity = "1";
    setTimeout(() => {
      boxMode = false;
      boxGroup.visible = false; if (boxJaws) boxJaws.visible = false;
      orient.position.y = 0;
      if (groundMesh) groundMesh.visible = true;
      objTurnArmed = false;                            // the object phase re-arms → re-opens on a whole piece
      lockScroll(false); section.classList.remove("in-box");
      update(progress);                                // repaint the object phase under the black, then it lifts
    }, reduce ? 0 : 380);
  }

  function boxCamera(blend) {
    const az = BOX_AZ * DEG, el = BOX_EL * DEG;
    const vHalf = Math.tan(camera.fov * 0.5 * DEG);
    const aspect = Math.max(camera.aspect, 0.05), portrait = aspect < 1;
    // fit the vitrine: its own half-extents, with room for the drop above it
    const hHalf = (boxWallH + boxBaseTh) * 0.64, wHalf = boxSide * 0.78;
    const wFill = portrait ? 0.86 : 0.6, hFill = portrait ? 0.42 : 0.72;
    const d = Math.max(wHalf / (vHalf * aspect * wFill), hHalf / (vHalf * hFill));
    const ce = Math.cos(el);
    const pos = new THREE.Vector3(Math.cos(az) * ce * d, Math.sin(el) * d + boxCY, Math.sin(az) * ce * d);
    const tgt = new THREE.Vector3(0, boxCY, 0);
    if (boxCamFrom && blend < 1) {
      pos.lerpVectors(boxCamFrom.pos, pos, blend);
      tgt.lerpVectors(boxCamFrom.tgt, tgt, blend);
    }
    camera.position.copy(pos);
    camera.lookAt(tgt);
    // shift the scene clear of the panel (right side on desktop, bottom sheet on phones) —
    // translate the camera along its own axes so the aim is preserved
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    const worldPerPx = d * Math.tan(camera.fov * 0.5 * DEG) / (h * 0.5);
    camera.updateMatrixWorld(true);
    const k = blend;                                   // the shift arrives with the framing
    const _s = new THREE.Vector3();
    if (w > h) { _s.setFromMatrixColumn(camera.matrixWorld, 0); camera.position.addScaledVector(_s, 0.5 * Math.min(420, w * 0.4) * worldPerPx * k); }
    else { _s.setFromMatrixColumn(camera.matrixWorld, 1); camera.position.addScaledVector(_s, -0.24 * h * worldPerPx * k); }
  }

  function updateBox() {
    const t = reduce ? 99 : idle - boxT0;
    // THE PIECE: it never falls. A slight rise as the mode opens — it lets go of the page — then
    // a slow weightless bob, riding low over the plate.
    const float = smooth(0, 1.6, t);
    orient.position.y = float * (0.06 * modelR + (reduce ? 0 : 0.035 * modelR * Math.sin(idle * 0.5)));
    // THE BASE rises from below with a soft breath of air…
    const rise = smooth(BOX_RISE_AT, BOX_RISE_AT + BOX_RISE_T, t);
    boxGroup.position.y = (1 - rise) * (-3.0 * modelR);
    if (!boxSounded && t >= BOX_RISE_AT) { boxSounded = true; if (!reduce) dropRise(); }
    // …then the glass JAWS take the piece from the sides: a slow approach that accelerates into
    // the strike (cubic ease-IN — the predator profile), one clack as they meet, and a short
    // damped bite-shudder while they settle shut.
    const ju = clamp((t - BOX_JAW_AT) / BOX_JAW_T, 0, 1);
    let off = (1 - ju * ju * ju) * 1.7 * boxSide;
    if (ju >= 1) {
      if (!boxSnapped) { boxSnapped = true;
        if (!reduce) { noiseWhoosh(0.1, 2400, 800, 0.05); try { if (navigator.vibrate) navigator.vibrate([0, 30]); } catch (e) {} } }
      const sh = t - BOX_JAW_AT - BOX_JAW_T;
      off = -Math.exp(-6 * sh) * Math.sin(sh * 34) * 0.012 * boxSide;   // the bite: a hair inward, then still
    }
    boxJawL.position.x = -off; boxJawR.position.x = off;
    // NO display turn — the piece holds still in the glass. It rotates only when a person is
    // selected, easing their bead round to the front to be worked on.
    const dt = 0.016;
    if (boxSpinTgt != null) {
      const d = angDelta(boxSpin, boxSpinTgt);
      boxSpin += d * Math.min(1, 5 * dt);
      if (Math.abs(d) < 0.012) boxSpinTgt = null;
    }
    spin.rotation.y = boxSpin;
    // lights: each person's platform breathes; a pulse flares the tapped bead briefly
    for (const node in boxPlatMat) {
      const m = boxPlatMat[node], base = m.userData.base || 0;
      let v = base > 0 ? base * (0.88 + 0.12 * Math.sin(idle * 0.9 + node * 1.7)) : 0;
      if (boxFlare && String(boxFlare.node) === String(node)) {
        const f = Math.max(0, 1 - (idle - boxFlare.t0) / 0.7);
        v = Math.max(v, 0.3) + 2.6 * f * f;
        if (f <= 0) boxFlare = null;
      }
      m.emissiveIntensity = v;
    }
    boxPlate.material.emissiveIntensity = 0.1 + 0.01 * Math.sin(idle * 0.7);
    boxCamera(reduce ? 1 : smooth(0, BOX_CAM_T, t));
  }

  window.__hero.box = {
    open: openBox,
    close: closeBox,
    get isOpen() { return boxMode; },
    focus(node) { if (boxMode && boxFront && boxFront[node] != null) boxSpinTgt = boxFront[node]; },
    pulse(node, hex) {
      if (!boxMode) return;
      if (hex && boxPlatMat[node]) { boxPlatMat[node].color.set(hex); boxPlatMat[node].emissive.set(hex); }
      boxFlare = { node, t0: idle };
    },
  };
  // "Customize bracelet" / "Design yours" / the #yourfive button all open the box (the anchor
  // stays as fallback markup for non-JS; with the module alive the cinematic takes over)
  for (const el of document.querySelectorAll('a[href="#yourfive"], [data-open-box]')) {
    el.addEventListener("click", (e) => { e.preventDefault(); openBox(); });
  }
  const boxCloseBtn = document.getElementById("boxClose");
  if (boxCloseBtn) boxCloseBtn.addEventListener("click", closeBox);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeBox(); });
  // live re-apply while designing (and keep the design on the hero afterwards)
  if (window.MAKOMA_DESIGN) window.MAKOMA_DESIGN.subscribe(() => { if (designApplied) applyDesign(); });

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
    buildAdjusters();   // the sliding macramé clasp tails (part of `model` → clones into the gather cluster)
    initHeroText();     // capture the sub-line the object phase cycles its copy through
    build();
    setupExplode();
    onScroll(); render();   // FIRST paint — deliberately after setupExplode(), see the note at the end of build()
    buildGather();      // clone the FINISHED hero bracelet (after setupExplode → glow + hub correct) for the circle
    // setupExplode queued the two board GLBs rather than fetching them. Pull them in once the main thread
    // goes quiet (the timeout is the backstop for browsers without requestIdleCallback, e.g. older Safari).
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 1500)))(requestBoards, { timeout: 4000 });
  }, undefined, fail);
}
