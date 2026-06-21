/* ============================================================
   M'AKOMA — scroll-driven 3D hero (assembled bracelet + cord trace)
   Real CAD: 5 corrected Adinkra friend-beads (cap + base + gold platform, the
   engraved symbol reading through the cap window) strung in a ring with the core
   hub. As you scroll the camera starts at the LEFT, pans around the threaded
   beads while a macramé cord traces out through every bus hole — out of the hub's
   left, through each bead, back into the hub — then lifts to a TOP view of the
   finished bracelet.
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
const TAU = Math.PI * 2, DEG = Math.PI / 180;

// bead ring order (all corrected exports); hub sits at the top of the ring
const RING = ["akoma", "sankofa", "aya", "gye_nyame", "nkyinkyim"];

const section = $("#hero");
const canvas = $("#heroCanvas");
const poster = $("#heroPoster");
const loaderEl = $("#heroLoader");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
  catch (e) { return false; }
}
const isMobile = window.matchMedia("(pointer: coarse)").matches || (window.innerWidth > 0 && window.innerWidth <= 820);
const conn = navigator.connection || navigator.webkitConnection || {};
const slowNet = conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType || "");

if (reduce || isMobile || slowNet || !webglOK()) {
  section.classList.add("no3d");
  if (loaderEl) loaderEl.style.display = "none";
  window.__hero = { fallback: true };
} else {
  init();
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.9));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 6000);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

  // studio-ish lighting: warm key, cool rim to peel matte black off black, soft fill
  const key = new THREE.DirectionalLight(0xfff3e0, 3.0); key.position.set(60, 95, 70);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 10; key.shadow.camera.far = 600;
  key.shadow.camera.left = -140; key.shadow.camera.right = 140; key.shadow.camera.top = 140; key.shadow.camera.bottom = -140;
  key.shadow.bias = -0.0004;
  const rim = new THREE.DirectionalLight(0xcfe0ff, 2.0); rim.position.set(-80, 36, -64);
  const rim2 = new THREE.DirectionalLight(0xffe1b2, 1.3); rim2.position.set(70, 20, -52);
  const fill = new THREE.DirectionalLight(0xffe9cc, 0.6); fill.position.set(10, -40, 60);
  scene.add(key, rim, rim2, fill, new THREE.AmbientLight(0xffffff, 0.34));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.ShadowMaterial({ opacity: 0.24 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -44; ground.receiveShadow = true; scene.add(ground);

  // ---- premium materials (no emissive — symbols read as engraved gold) ----
  const matResin = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.6, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.34, envMapIntensity: 0.7 });
  const matHub = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0f, roughness: 0.5, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.8 });
  const matGold = new THREE.MeshStandardMaterial({ color: 0xc9a24b, roughness: 0.31, metalness: 1.0, envMapIntensity: 1.35 });
  const matCord = new THREE.MeshStandardMaterial({ color: 0x6b5740, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.7 }); // waxed-macramé tan, reads on black

  const bracelet = new THREE.Group();
  scene.add(bracelet);

  let parts = {};
  function mesh(name, mat) {
    const g = parts[name]; if (!g) return null;
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
  }

  // ---- geometry of the bracelet ring ----
  const Rr = 42;                 // ring radius (mm)
  const HUB_ANG = 90 * DEG;      // hub at the top/back of the ring
  const up = new THREE.Vector3(0, 1, 0);
  const ringPt = (a) => new THREE.Vector3(Math.cos(a) * Rr, 0, Math.sin(a) * Rr);
  const tangent = (a) => new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).normalize(); // direction the cord runs

  let cordTube = null, cordTotal = 0;

  function recenter(group) {
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    group.position.sub(c);
    return c;
  }

  // one bead: cap + base (resin) + platform (gold). Local frame from the CAD:
  // symbol on +Z, bus-hole along +Y, belt on +X.  We orient it so the symbol
  // faces UP (+Y world, visible in the top view) and the bus-hole runs along the
  // cord tangent so the cord threads straight through it.
  function placeBead(sym, ang) {
    const inner = new THREE.Group();
    const base = mesh(`${sym}__FB_BASE`, matResin); if (base) inner.add(base);
    const cap = mesh(`${sym}__FB_CAP`, matResin); if (cap) inner.add(cap);
    const plat = mesh(`${sym}__PLATFORM`, matGold); if (plat) inner.add(plat);
    recenter(inner);
    const bead = new THREE.Group(); bead.add(inner);
    const T = tangent(ang);
    const Ximg = new THREE.Vector3().crossVectors(T, up);   // local X (belt) → radial
    bead.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Ximg, T, up)); // X→radial, Y(hole)→T, Z(symbol)→up
    bead.position.copy(ringPt(ang));
    bracelet.add(bead);
    return bead;
  }

  function placeHub(ang) {
    const inner = new THREE.Group();
    [["HUB_BASE", matHub], ["HUB_TOP", matHub], ["HUB_SWITCH", matGold]].forEach(([n, m]) => { const o = mesh(n, m); if (o) inner.add(o); });
    recenter(inner);
    const hub = new THREE.Group(); hub.add(inner);
    const T = tangent(ang);                                  // hub bus-holes run along its long (X) axis
    const Yimg = new THREE.Vector3().crossVectors(up, T);
    hub.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(T, Yimg, up)); // X(hole)→T, Z(button)→up
    hub.position.copy(ringPt(ang));
    bracelet.add(hub);
    return hub;
  }

  function buildCord() {
    // start at the hub, wind once around through every bead, back to the hub
    const pts = [], SEG = 192;
    for (let i = 0; i <= SEG; i++) { const a = HUB_ANG - (i / SEG) * TAU; pts.push(ringPt(a)); }
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.0);
    const geo = new THREE.TubeGeometry(curve, 384, 1.35, 14, false);
    cordTube = new THREE.Mesh(geo, matCord); cordTube.castShadow = true; cordTube.receiveShadow = true;
    bracelet.add(cordTube);
    cordTotal = geo.index ? geo.index.count : geo.attributes.position.count;
    geo.setDrawRange(0, 0);
  }

  function build() {
    const beadAng = [150, 210, 270, 330, 30].map((d) => d * DEG);
    RING.forEach((s, i) => placeBead(s, beadAng[i]));
    placeHub(HUB_ANG);
    buildCord();
    bracelet.position.y = 2;

    ready = true;
    if (loaderEl) loaderEl.classList.add("hide");
    poster.classList.add("hide");
    onScroll(); render();
  }

  // ---- camera path: spherical (azimuth, elevation, distance), LEFT → around → TOP ----
  const KEYS = [
    { p: 0.00, az: 200, el: 13, d: 150 },  // left, low
    { p: 0.16, az: 156, el: 16, d: 142 },
    { p: 0.34, az: 98, el: 21, d: 133 },   // swing toward the front of the ring
    { p: 0.52, az: 40, el: 27, d: 134 },
    { p: 0.68, az: -8, el: 38, d: 140 },   // coming back around
    { p: 0.84, az: -28, el: 62, d: 162 },
    { p: 1.00, az: -45, el: 89, d: 190 },  // straight-down top view (framed, hub not clipped)
  ];
  const _t = new THREE.Vector3(0, 0, 0);
  function placeCamera(p) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) { if (p >= KEYS[i].p && p <= KEYS[i + 1].p) { a = KEYS[i]; b = KEYS[i + 1]; break; } }
    const t = smooth(a.p, b.p, p);
    const az = lerp(a.az, b.az, t) * DEG + Math.sin(idle * 0.25) * 0.012;
    const el = clamp(lerp(a.el, b.el, t), 1, 89.5) * DEG;
    const d = lerp(a.d, b.d, t);
    const ce = Math.cos(el);
    camera.position.set(Math.cos(az) * ce * d, Math.sin(el) * d, Math.sin(az) * ce * d);
    _t.set(0, lerp(2, -1, smooth(0.6, 1, p)), 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(_t);
  }

  // ---- overlay ----
  const intro = $("#heroIntro"), outro = $("#heroOutro"), cue = $("#heroCue"), bar = $("#heroProgress span");
  const capWrap = $("#heroCaption"), capK = capWrap?.querySelector(".hc-kicker"), capT = capWrap?.querySelector(".hc-title"), capL = capWrap?.querySelector(".hc-line");
  let capStage = "";
  function overlay(p) {
    const introOp = 1 - smooth(0.03, 0.1, p);
    if (intro) intro.style.opacity = introOp;
    if (cue) cue.style.opacity = introOp;
    const outOp = smooth(0.92, 0.99, p);
    if (outro) { outro.style.opacity = outOp; outro.style.pointerEvents = outOp > 0.5 ? "auto" : "none"; }
    if (bar) bar.style.transform = `scaleX(${p})`;
    let stage = "", op = 0;
    const s1 = Math.min(smooth(0.16, 0.28, p), 1 - smooth(0.44, 0.52, p));   // threading
    const s2 = Math.min(smooth(0.56, 0.66, p), 1 - smooth(0.86, 0.92, p));   // wound back to the hub
    if (s1 >= s2 && s1 > 0.01) { stage = "thread"; op = s1; }
    else if (s2 > 0.01) { stage = "knot"; op = s2; }
    if (stage && stage !== capStage) {
      capStage = stage;
      if (stage === "thread") { capK.textContent = "One cord"; capT.textContent = "Threaded through, bead by bead."; capL.textContent = "A single macramé cord runs out of the hub and through the bus-hole of every friend-bead — the people you carry, on one line."; }
      else { capK.textContent = "The core hub"; capT.textContent = "Where the circle closes."; capL.textContent = "The cord winds back into the hub — Bluetooth, microphone and speaker under the gold. One quiet channel for the whole circle."; }
    }
    if (capWrap) capWrap.style.opacity = op;
  }

  let ready = false, progress = 0, target = 0, idle = 0, inView = true;
  function onScroll() {
    const rect = section.getBoundingClientRect();
    const total = section.offsetHeight - window.innerHeight;
    target = clamp(-rect.top / Math.max(total, 1), 0, 1);
  }
  function resize() {
    const w = section.clientWidth || window.innerWidth || 1280, h = window.innerHeight || 800;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.setSize(w, h);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.55, 0.96); // tiny — only gold glints
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function update(p) {
    placeCamera(p);
    if (cordTube) {
      const frac = smooth(0.07, 0.64, p);     // cord traces out as the camera pans
      cordTube.geometry.setDrawRange(0, Math.floor(cordTotal * frac));
    }
    overlay(p);
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
    get progress() { return progress; },
    get ready() { return ready; },
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", resize);
  new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { threshold: 0 }).observe(section);
  resize();

  // ---- load the CAD (Draco-compressed) ----
  if (loaderEl) loaderEl.classList.remove("hide");
  const draco = new DRACOLoader();
  draco.setDecoderPath("assets/vendor/three/draco/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const fail = (err) => { console.warn("[hero3d] CAD load failed:", err); section.classList.add("no3d"); if (loaderEl) loaderEl.style.display = "none"; poster.classList.remove("hide"); };
  loader.load("assets/models/bracelet_parts.glb", (g) => {
    g.scene.traverse((o) => {
      if (o.isMesh) {
        const geo = o.geometry; geo.computeVertexNormals();
        parts[o.name] = geo;
      }
    });
    build();
  }, undefined, fail);
}
