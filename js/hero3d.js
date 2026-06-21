/* ============================================================
   M'AKOMA — scroll-driven 3D hero
   Loads the real assembled-bracelet CAD export exactly as arranged in Fusion
   (Makoma_bracelet_arranged.obj → bracelet_assembled.glb): the 8 Adinkra beads
   and the core hub in their designed wrist arc, matte-black with engraved gold
   symbols and the gold hub button. Scroll tilts the camera from a top-down view
   of the arrangement to a front view of the hub.
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
const DEG = Math.PI / 180;

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
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 1000);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // camera views from the -Z (front) side, so the key lights from front-top
  const key = new THREE.DirectionalLight(0xfff4e6, 3.4); key.position.set(7, 20, -15);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 120;
  key.shadow.camera.left = -24; key.shadow.camera.right = 24; key.shadow.camera.top = 24; key.shadow.camera.bottom = -24;
  key.shadow.bias = -0.0004;
  const rim = new THREE.DirectionalLight(0xbcd2ff, 1.5); rim.position.set(-13, 7, 12);   // back rim peels black off black
  const rim2 = new THREE.DirectionalLight(0xffd9a6, 0.9); rim2.position.set(12, 3, 10);
  const fill = new THREE.DirectionalLight(0xfff1dd, 0.9); fill.position.set(-3, 6, -18);  // soft front fill
  scene.add(key, rim, rim2, fill, new THREE.AmbientLight(0xffffff, 0.16));

  const bracelet = new THREE.Group();
  scene.add(bracelet);
  let modelR = 10;          // bracelet radius (set after load)

  // ---- camera: front + top of the beads (az 270 = the symbol side, hub at top) ----
  const KEYS = [
    { p: 0.00, az: 270, el: 60, dz: 3.05 },  // front-top, overhead — the arrangement + gold read
    { p: 0.50, az: 270, el: 56, dz: 3.0 },
    { p: 1.00, az: 270, el: 53, dz: 2.95 },   // gentle tilt, staying in the front-top gold zone
  ];
  const _t = new THREE.Vector3(0, 0, 0);
  function placeCamera(p) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) { if (p >= KEYS[i].p && p <= KEYS[i + 1].p) { a = KEYS[i]; b = KEYS[i + 1]; break; } }
    const t = smooth(a.p, b.p, p);
    const az = (lerp(a.az, b.az, t) + Math.sin(idle * 0.2) * 0.6) * DEG;
    const el = lerp(a.el, b.el, t) * DEG;
    const d = lerp(a.dz, b.dz, t) * modelR;
    const ce = Math.cos(el);
    camera.position.set(Math.cos(az) * ce * d, Math.sin(el) * d, Math.sin(az) * ce * d);
    camera.lookAt(_t);
  }

  function build() {
    bracelet.add(model);
    // recentre to origin
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.sub(c);
    const size = box.getSize(new THREE.Vector3());
    modelR = Math.max(size.x, size.y, size.z) * 0.5;

    // contact shadow
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(modelR * 40, modelR * 40), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -modelR * 1.1; ground.receiveShadow = true; scene.add(ground);

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
    const op = Math.min(smooth(0.18, 0.3, p), 1 - smooth(0.82, 0.92, p));
    if (capWrap) {
      if (capK) capK.textContent = "The bracelet";
      if (capT) capT.textContent = "Eight beads, one hub.";
      if (capL) capL.textContent = "The real assembly — eight Adinkra friend-beads and the core hub on one cord, exactly as it's built.";
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.7, 0.9); // soft glints on the gold
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function update(p) {
    placeCamera(p);
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

  let model = null;
  if (loaderEl) loaderEl.classList.remove("hide");
  const draco = new DRACOLoader(); draco.setDecoderPath("assets/vendor/three/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const fail = (err) => { console.warn("[hero3d] CAD load failed:", err); section.classList.add("no3d"); if (loaderEl) loaderEl.style.display = "none"; poster.classList.remove("hide"); };
  // matte Akoma_4E look: deep matte-black resin + warm engraved gold (no glossy clearcoat)
  const matBlack = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.82, metalness: 0.0, clearcoat: 0.0, envMapIntensity: 0.2 });
  const matGold = new THREE.MeshStandardMaterial({ color: 0xc6a24c, roughness: 0.36, metalness: 1.0, envMapIntensity: 0.6 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.46, metalness: 0.55, envMapIntensity: 0.35 });
  const remap = (m) => { const mm = (m && m.metalness !== undefined) ? m.metalness : 0; return mm > 0.8 ? matGold : (mm > 0.3 ? matMetal : matBlack); };
  loader.load("assets/models/bracelet_assembled.glb", (g) => {
    model = g.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.material = Array.isArray(o.material) ? o.material.map(remap) : remap(o.material);
      }
    });
    build();
  }, undefined, fail);
}
