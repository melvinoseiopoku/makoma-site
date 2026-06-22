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
const SPIN_PHASE = -40 * DEG;       // starting rotation so a symbol faces front at p=0

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 120;
  key.shadow.camera.left = -22; key.shadow.camera.right = 22; key.shadow.camera.top = 22; key.shadow.camera.bottom = -22;
  key.shadow.bias = -0.0004;
  const fill = new THREE.DirectionalLight(0xfff1dd, 0.8); fill.position.set(13, -3, -6);
  const rim = new THREE.DirectionalLight(0xbcd2ff, 1.4); rim.position.set(-17, 9, -5);
  const rim2 = new THREE.DirectionalLight(0xffd9a6, 0.8); rim2.position.set(-6, 5, 16);
  scene.add(key, fill, rim, rim2, new THREE.AmbientLight(0xffffff, 0.18));

  const spin = new THREE.Group();        // rotates with scroll (about the bracelet's vertical axis)
  const orient = new THREE.Group();      // fixed flip so USB faces up
  orient.rotation.x = FLIP_X;
  spin.add(orient);
  scene.add(spin);
  let modelR = 10;

  function placeCamera() {
    const az = (CAM_AZ + Math.sin(idle * 0.18) * 0.7) * DEG, el = CAM_EL * DEG;
    const d = 3.15 * modelR, ce = Math.cos(el);
    camera.position.set(Math.cos(az) * ce * d, Math.sin(el) * d, Math.sin(az) * ce * d);
    camera.lookAt(0, 0, 0);
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
  const capWrap = $("#heroCaption"), capK = capWrap?.querySelector(".hc-kicker"), capT = capWrap?.querySelector(".hc-title"), capL = capWrap?.querySelector(".hc-line");
  function overlay(p) {
    const introOp = 1 - smooth(0.03, 0.12, p);
    if (intro) intro.style.opacity = introOp;
    if (cue) cue.style.opacity = introOp;
    const outOp = smooth(0.9, 0.99, p);
    if (outro) { outro.style.opacity = outOp; outro.style.pointerEvents = outOp > 0.5 ? "auto" : "none"; }
    if (bar) bar.style.transform = `scaleX(${p})`;
    const op = Math.min(smooth(0.16, 0.28, p), 1 - smooth(0.82, 0.92, p));
    if (capWrap) {
      if (capK) capK.textContent = "Eight beads";
      if (capT) capT.textContent = "Turn to meet them.";
      if (capL) capL.textContent = "Each bead carries an engraved Adinkra symbol; the core hub holds the gold button. The real assembly, exactly as it's built.";
      capWrap.style.opacity = op;
    }
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.7, 0.86); // soft gold glints
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function update(p) {
    spin.rotation.y = SPIN_PHASE + p * TAU * SPIN_TURNS;
    if (cordMesh) cordMesh.geometry.setDrawRange(0, Math.floor(cordTotal * smooth(0.0, 0.6, p))); // trace keeps ahead of the spin (no lag)
    placeCamera();
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

  // matte Akoma_4E look: deep matte-black resin + warm gold (no glossy clearcoat)
  const matBlack = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.82, metalness: 0.0, clearcoat: 0.0, envMapIntensity: 0.2 });
  const matGold = new THREE.MeshStandardMaterial({ color: 0xc6a24c, roughness: 0.36, metalness: 1.0, envMapIntensity: 0.6 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.46, metalness: 0.55, envMapIntensity: 0.35 });
  const remap = (m) => { const mm = (m && m.metalness !== undefined) ? m.metalness : 0; return mm > 0.8 ? matGold : (mm > 0.3 ? matMetal : matBlack); };

  // ---- black macramé cord threaded through the bead bus-holes (positions from the CAD) ----
  // Cord through the real bus-holes (positions ray-cast from the CAD, then offset into the
  // GLB's centred frame by −[0.188,0.194,-3.618]). Bead holes sit at Y≈0.016; the hub holes
  // are lower (Y≈-0.66) — two on the +Z/right side, one on the −Z/left side. Ordered so the
  // trace runs the SAME rotational way as the turntable spin.
  const H = 0.016;       // bus-hole height through the beads
  // NOTE: interim hand-placed cord. The exact bus-hole/hub-hole routing comes from the
  // Fusion-modelled cord (export the assembly WITH the cord and it renders precisely).
  const CORD_PATH = [
    [1.20, -0.95, 3.30],      // hub, +X hole (b)
    [1.20, -0.95, 2.65],      // hub, +X hole (a)
    [4.218, H, 1.630],        // G
    [4.634, H, -0.414],       // F
    [3.108, H, -2.324],       // E
    [0.998, H, -3.217],       // D
    [-1.397, H, -3.252],      // C
    [-3.413, H, -2.293],      // B
    [-4.594, H, -0.427],      // A
    [-4.598, H, 1.638],       // H
    [-1.60, -0.95, 2.45],     // hub, −X hole (single)
  ];
  const tl = new THREE.TextureLoader();
  const cordNormal = tl.load("assets/textures/cord_normal.png");
  const cordRough = tl.load("assets/textures/cord_rough.png");
  [cordNormal, cordRough].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 2); });
  cordNormal.colorSpace = THREE.NoColorSpace;
  const matCord = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.2, normalMap: cordNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: cordRough });
  let cordMesh = null, cordTotal = 0, cordExtras = [];
  let CORD_R = 0.82, CORD_RAD = 0.105;
  function buildCord(showMarks) {
    if (cordMesh) { model.remove(cordMesh); cordMesh.geometry.dispose(); cordMesh = null; }
    cordExtras.forEach((m) => model.remove(m)); cordExtras = [];
    const raw = CORD_PATH.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const pts = [];
    for (let i = 0; i < raw.length; i++) {
      if (i >= 2 && i <= 9) {
        const T = new THREE.Vector3().subVectors(raw[i + 1], raw[i - 1]); T.y = 0; T.normalize();
        const entry = raw[i].clone().addScaledVector(T, -CORD_R), exit = raw[i].clone().addScaledVector(T, CORD_R);
        pts.push(entry, raw[i], exit);
        if (showMarks) [entry, exit].forEach((pp) => { const mk = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0x00ff66 })); mk.position.copy(pp); model.add(mk); cordExtras.push(mk); });
      } else {
        pts.push(raw[i]);
        if (showMarks) { const mk = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0x33aaff })); mk.position.copy(raw[i]); model.add(mk); cordExtras.push(mk); }
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.12);
    const geo = new THREE.TubeGeometry(curve, 820, CORD_RAD, 12, false);
    cordMesh = new THREE.Mesh(geo, matCord); cordMesh.castShadow = true; cordMesh.receiveShadow = true;
    cordTotal = geo.index ? geo.index.count : geo.attributes.position.count;
    geo.setDrawRange(0, Math.floor(cordTotal * smooth(0.0, 0.6, progress)));
    model.add(cordMesh);
  }
  window.__rebuild = (path, showMarks, R) => {
    if (path) { CORD_PATH.length = 0; path.forEach((p) => CORD_PATH.push(p)); }
    if (R !== undefined) CORD_R = R;
    buildCord(showMarks);
  };

  let model = null;
  if (loaderEl) loaderEl.classList.remove("hide");
  const draco = new DRACOLoader(); draco.setDecoderPath("assets/vendor/three/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const fail = (err) => { console.warn("[hero3d] CAD load failed:", err); section.classList.add("no3d"); if (loaderEl) loaderEl.style.display = "none"; poster.classList.remove("hide"); };
  loader.load("assets/models/bracelet_assembled.glb", (g) => {
    model = g.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.material = Array.isArray(o.material) ? o.material.map(remap) : remap(o.material);
      }
    });
    buildCord();
    build();
  }, undefined, fail);
}
