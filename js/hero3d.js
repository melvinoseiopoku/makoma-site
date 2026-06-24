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
    const f = Math.min(1, p * 1.8);                // trace draws faster than the spin so it keeps pace (no lag)
    if (cordMesh) {
      cordMesh.geometry.setDrawRange(0, Math.floor(cordTotal * f));
      if (cordTip && cordCurve) {                    // rounded tip caps the growing end so the cord reads solid, not hollow
        const vis = f > 0.004 && f < 0.996;
        cordTip.visible = vis;
        if (vis) cordTip.position.copy(cordCurve.getPointAt(Math.min(f, 0.999)));
        if (cordStart) cordStart.visible = f > 0.004;
      }
    }
    if (braidB) { const n = Math.floor(braidTotal * f); braidB.geometry.setDrawRange(0, n); braidC.geometry.setDrawRange(0, n); }
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
  let CORD_RAD = 0.2;  // core cord — fattened from the Ø2.8 mm path so it fully backs the sennit (no see-through
                       // gaps between the braid coils): the sennit/wraps read as a SOLID rope, not a hollow coil.
  function buildCord() {
    if (cordMesh) { model.remove(cordMesh); cordMesh.geometry.dispose(); cordMesh = null; }
    const pts = CORD_PATH.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    const geo = new THREE.TubeGeometry(curve, 760, CORD_RAD, 12, true);
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
      const cu = new THREE.CatmullRomCurve3(pp, true, "centripetal");
      const g = new THREE.TubeGeometry(cu, 2600, BRAID_RAD, 10, true);
      const m = new THREE.Mesh(g, matCord); m.castShadow = true; m.receiveShadow = true; model.add(m); return m;
    };
    braidB = mk(ptsA); braidC = mk(ptsC);
    braidTotal = braidB.geometry.index ? braidB.geometry.index.count : braidB.geometry.attributes.position.count;
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
  }, undefined, fail);
}
