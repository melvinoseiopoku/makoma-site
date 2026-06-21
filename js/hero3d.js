/* ============================================================
   M'AKOMA — scroll-driven 3D hero (assembled bracelet, matches the product render)
   8 real Adinkra friend-beads (cap + base + engraved gold platform) in a gentle
   wrist arc with the core hub at the top — symbols facing the viewer, exactly the
   layout of the marketing render. A BLACK macramé cord (braided normal map) runs
   through the beads and up into the hub, finished with wrapped knots, two adjustable
   sliders, two smoky-quartz accent beads and end-knots. As you scroll the camera
   pans from the LEFT to the straight-on hero view while the cord traces in and the
   five centre symbols ignite gold.
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

// 8 beads, left → right along the arc. The 5 in the middle glow; the 3 toward the
// ends (incl. the two whose symbol caps aren't recut yet) stay dark/engraved.
const BEADS = [
  { sym: "nsoroma",       glow: false },
  { sym: "sankofa",       glow: true  },
  { sym: "aya",           glow: true  },
  { sym: "akoma",         glow: true  },
  { sym: "gye_nyame",     glow: true  },
  { sym: "nkyinkyim",     glow: true  },
  { sym: "nkonsonkonson", glow: false },
  { sym: "akoma_ntoaso",  glow: false },
];

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
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 6000);

  // dim environment — strong env was the "light leaking through the crevices"
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.DirectionalLight(0xfff4e6, 3.4); key.position.set(40, 80, 90);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 10; key.shadow.camera.far = 700;
  key.shadow.camera.left = -160; key.shadow.camera.right = 160; key.shadow.camera.top = 160; key.shadow.camera.bottom = -160;
  key.shadow.bias = -0.0004;
  const rim = new THREE.DirectionalLight(0xbcd2ff, 1.5); rim.position.set(-70, 40, -30);   // cool edge to peel black off black
  const rim2 = new THREE.DirectionalLight(0xffd9a6, 1.0); rim2.position.set(64, -10, -40);
  const fill = new THREE.DirectionalLight(0xfff1dd, 0.45); fill.position.set(0, 10, 70);
  scene.add(key, rim, rim2, fill, new THREE.AmbientLight(0xffffff, 0.09)); // low ambient → crevices stay dark

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -52; ground.receiveShadow = true; scene.add(ground);

  // ---- materials ----
  const matResin = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.55, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.28 });
  const matHub = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0f, roughness: 0.46, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.26, envMapIntensity: 0.32 });
  const matGoldBtn = new THREE.MeshStandardMaterial({ color: 0xcaa450, roughness: 0.3, metalness: 1.0, envMapIntensity: 0.9 });
  const cordTex = {};
  const tl = new THREE.TextureLoader();
  const cordNormal = tl.load("assets/textures/cord_normal.png");
  const cordRough = tl.load("assets/textures/cord_rough.png");
  [cordNormal, cordRough].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  cordNormal.colorSpace = THREE.NoColorSpace;
  const matCord = new THREE.MeshStandardMaterial({
    color: 0x0c0c0c, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.25,
    normalMap: cordNormal, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: cordRough,
  });
  const matQuartz = new THREE.MeshPhysicalMaterial({ color: 0x3a2c1c, roughness: 0.18, metalness: 0.0, transmission: 0.6, ior: 1.5, thickness: 3, transparent: true, opacity: 0.92, envMapIntensity: 0.6 });

  const bracelet = new THREE.Group();
  scene.add(bracelet);

  let parts = {};
  function mesh(name, mat) {
    const g = parts[name]; if (!g) return null;
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function recenter(group) {
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    group.children.forEach((ch) => ch.position.sub(c));
    return c;
  }

  // ---- arc layout (XY plane, beads face +Z toward the camera) ----
  const N = BEADS.length;
  const Rx = 58, Ry = 12, TH = 60 * DEG, Cy = -2;   // wide shallow wrist arc, hub just above
  const TILT = 0.42;                                 // how much each bead leans along the arc
  function arcPos(t) { const a = t * TH; return new THREE.Vector3(Rx * Math.sin(a), Cy - Ry * Math.cos(a), 0); }
  const tFor = (i) => (i - (N - 1) / 2) / ((N - 1) / 2);   // -1 .. 1

  const glowMats = [];          // emissive symbol materials to ramp on scroll
  let hubGroup = null, hubY = 0;

  function build() {
    BEADS.forEach((b, i) => {
      const t = tFor(i);
      const inner = new THREE.Group();
      const base = mesh(`${b.sym}__FB_BASE`, matResin); if (base) inner.add(base);
      const cap = mesh(`${b.sym}__FB_CAP`, matResin); if (cap) inner.add(cap);
      const symMat = new THREE.MeshStandardMaterial({ color: 0xc69b45, roughness: 0.33, metalness: 1.0, envMapIntensity: 0.85, emissive: b.glow ? 0xffae3a : 0x000000, emissiveIntensity: 0 });
      symMat.polygonOffset = true; symMat.polygonOffsetFactor = -2; symMat.polygonOffsetUnits = -2; // kill platform/window z-fight (the "flicker")
      const plat = mesh(`${b.sym}__PLATFORM`, symMat);
      if (plat) { plat.position.z -= 0.18; inner.add(plat); }   // tuck the platform behind the window
      if (b.glow) glowMats.push(symMat);
      recenter(inner);
      const bead = new THREE.Group(); bead.add(inner);
      bead.position.copy(arcPos(t));
      bead.rotation.z = -t * TH * TILT;            // lean along the arc tangent
      bracelet.add(bead);
    });

    // hub at the top centre, button facing the camera
    const hi = new THREE.Group();
    [["HUB_BASE", matHub], ["HUB_TOP", matHub]].forEach(([n, m]) => { const o = mesh(n, m); if (o) hi.add(o); });
    const sw = mesh("HUB_SWITCH", matGoldBtn); if (sw) hi.add(sw);
    recenter(hi);
    hubGroup = new THREE.Group(); hubGroup.add(hi);
    hubY = arcPos(1).y + 16;                        // sit just above the arc ends
    hubGroup.position.set(0, hubY, -1);
    bracelet.add(hubGroup);

    buildCord();
    bracelet.position.y = 4;

    ready = true;
    if (loaderEl) loaderEl.classList.add("hide");
    poster.classList.add("hide");
    onScroll(); render();
  }

  // ---- black macramé cord: through the beads + up to the hub + the closure ----
  let cordMesh = null, cordTotal = 0;
  function tube(pts, r, segs, closed = false) {
    const curve = new THREE.CatmullRomCurve3(pts, closed, "catmullrom", 0.3);
    return new THREE.TubeGeometry(curve, segs, r, 10, closed);
  }
  function setCordUV(geo, lengthMM) {
    geo.attributes.uv && (geo.attributes.uv.needsUpdate = true);
  }
  function knot(pos, rx, ry) {                      // a wrapped macramé knot (short fat barrel)
    const g = new THREE.Mesh(new THREE.CylinderGeometry(rx, rx, ry, 16, 1), matCord);
    g.position.copy(pos); g.castShadow = true; return g;
  }
  function buildCord() {
    // 1) main strand through the bead arc, ends rising to the hub sides
    const pts = [];
    const hubL = new THREE.Vector3(-9, hubY - 9, 1), hubR = new THREE.Vector3(9, hubY - 9, 1);
    pts.push(hubL);
    for (let i = 0; i < N; i++) { const p = arcPos(tFor(i)).clone(); p.z = 1; pts.push(p); }
    pts.push(hubR);
    const geo = tube(pts, 1.5, 420);
    geo.attributes.uv && setRepeat(geo);
    cordMesh = new THREE.Mesh(geo, matCord); cordMesh.castShadow = true; cordMesh.receiveShadow = true;
    bracelet.add(cordMesh);
    cordTotal = geo.index ? geo.index.count : geo.attributes.position.count;
    geo.setDrawRange(0, 0);

    // 2) closure above the hub: two cords up, wrapped knots, sliders, tails, accents, end-knots
    const closure = new THREE.Group(); bracelet.add(closure); cordClosure = closure;
    const top = hubY + 16;
    const wrapL = new THREE.Vector3(-5, top, 2), wrapR = new THREE.Vector3(5, top, 2);
    closure.add(new THREE.Mesh(tube([new THREE.Vector3(-9, hubY + 8, 2), wrapL], 1.5, 40), matCord));
    closure.add(new THREE.Mesh(tube([new THREE.Vector3(9, hubY + 8, 2), wrapR], 1.5, 40), matCord));
    closure.add(knot(new THREE.Vector3(0, top + 4, 2), 5.5, 9));        // central wrapped knot bundle
    // two tails splaying up-left / up-right with a slider knot, accent bead, end-knot
    [[-1, wrapL], [1, wrapR]].forEach(([dir, base]) => {
      const slider = new THREE.Vector3(dir * 16, top + 20, 1.5);
      const mid = new THREE.Vector3(dir * 30, top + 34, 0);
      const end = new THREE.Vector3(dir * 40, top + 48, -1);
      closure.add(new THREE.Mesh(tube([new THREE.Vector3(0, top + 8, 2), slider, mid, end], 1.35, 120), matCord));
      const k = knot(slider, 3.4, 6); k.lookAt(mid); closure.add(k);     // adjustable slider knot
      const q = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 18), matQuartz); q.position.copy(mid); closure.add(q); // smoky-quartz accent
      closure.add(knot(end, 2.6, 4.5));                                  // end knot
    });
    closure.visible = false;
  }
  function setRepeat(geo) {
    // tile the braid: many repeats along the tube length, ~2 around
    const len = 1; // TubeGeometry u is along length 0..1
    cordNormal.repeat.set(46, 2); cordRough.repeat.set(46, 2);
  }
  let cordClosure = null;

  // ---- camera: LEFT 3/4 → straight-on hero (the render) ----
  const KEYS = [
    { p: 0.00, az: 150, el: 8, d: 178 },    // from the left
    { p: 0.25, az: 132, el: 7, d: 162 },
    { p: 0.50, az: 114, el: 6, d: 150 },
    { p: 0.75, az: 100, el: 6, d: 142 },
    { p: 1.00, az: 90,  el: 5, d: 138 },    // straight-on front = the render
  ];
  const _t = new THREE.Vector3();
  function placeCamera(p) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) { if (p >= KEYS[i].p && p <= KEYS[i + 1].p) { a = KEYS[i]; b = KEYS[i + 1]; break; } }
    const t = smooth(a.p, b.p, p);
    const az = (lerp(a.az, b.az, t) + Math.sin(idle * 0.22) * 0.5) * DEG;
    const el = lerp(a.el, b.el, t) * DEG;
    const d = lerp(a.d, b.d, t);
    const ce = Math.cos(el);
    camera.position.set(Math.cos(az) * ce * d, Math.sin(el) * d, Math.sin(az) * ce * d);
    _t.set(0, -1, 0);
    camera.lookAt(_t);
  }

  // ---- overlay ----
  const intro = $("#heroIntro"), outro = $("#heroOutro"), cue = $("#heroCue"), bar = $("#heroProgress span");
  const capWrap = $("#heroCaption"), capK = capWrap?.querySelector(".hc-kicker"), capT = capWrap?.querySelector(".hc-title"), capL = capWrap?.querySelector(".hc-line");
  let capStage = "";
  function overlay(p) {
    const introOp = 1 - smooth(0.02, 0.1, p);
    if (intro) intro.style.opacity = introOp;
    if (cue) cue.style.opacity = introOp;
    const outOp = smooth(0.9, 0.99, p);
    if (outro) { outro.style.opacity = outOp; outro.style.pointerEvents = outOp > 0.5 ? "auto" : "none"; }
    if (bar) bar.style.transform = `scaleX(${p})`;
    const op = Math.min(smooth(0.2, 0.34, p), 1 - smooth(0.82, 0.9, p));
    const stage = p < 0.6 ? "thread" : "light";
    if (stage !== capStage) {
      capStage = stage;
      if (stage === "thread") { capK.textContent = "One cord"; capT.textContent = "Eight beads, hand-knotted."; capL.textContent = "A single black macramé cord runs through every Adinkra bead and into the core hub — the same bracelet you'll wear."; }
      else { capK.textContent = "Five, lit"; capT.textContent = "The people you carry."; capL.textContent = "Five beads glow for the five you keep closest; the hub holds the channel that connects them."; }
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.6, 0.82); // gold glow on the lit symbols
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function update(p) {
    placeCamera(p);
    if (cordMesh) cordMesh.geometry.setDrawRange(0, Math.floor(cordTotal * smooth(0.05, 0.6, p)));
    if (cordClosure) cordClosure.visible = p > 0.5;
    const glow = smooth(0.55, 0.95, p);
    glowMats.forEach((m) => { m.emissiveIntensity = glow * 2.6; });
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

  if (loaderEl) loaderEl.classList.remove("hide");
  const draco = new DRACOLoader(); draco.setDecoderPath("assets/vendor/three/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const fail = (err) => { console.warn("[hero3d] CAD load failed:", err); section.classList.add("no3d"); if (loaderEl) loaderEl.style.display = "none"; poster.classList.remove("hide"); };
  loader.load("assets/models/bracelet_parts.glb", (g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.geometry.computeVertexNormals(); parts[o.name] = o.geometry; } });
    build();
  }, undefined, fail);
}
