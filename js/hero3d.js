/* ============================================================
   M'AKOMA — scroll-driven 3D hero
   Real CAD throughout: the 8 Adinkra bead caps + core-hub shells (Fusion STL→GLB)
   and the actual friend-bead & core-hub PCBs (KiCad → GLB). Engraved gold symbols
   (gold platform read through the cap window) — no glow. Proxy parts only for the
   ERM motor, LiPo battery and speaker (no CAD yet).
   Falls back to the static render on mobile / no-WebGL / reduced-motion.
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { if (a === b) return x < a ? 0 : 1; const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const bump = (p, a, b, r = 0.05) => Math.min(smooth(a, a + r, p), 1 - smooth(b - r, b, p));

// bead caps, in ring order; the focus/explode bead is akoma
const RING = ["nsoroma", "nkonsonkonson", "sankofa", "akoma", "akoma_ntoaso", "aya", "nkyinkyim", "gye_nyame"];

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
// honour Save-Data / very slow connections: skip the heavy 3D (and its ~9 MB of CAD) and show the poster
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
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 5000);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

  const key = new THREE.DirectionalLight(0xfff4e2, 3.1); key.position.set(38, 66, 54);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 8; key.shadow.camera.far = 400;
  key.shadow.camera.left = -110; key.shadow.camera.right = 110; key.shadow.camera.top = 110; key.shadow.camera.bottom = -110;
  key.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.7); rim.position.set(-56, 30, -50);   // edge light: separates black beads from black bg
  const rim2 = new THREE.DirectionalLight(0xffe0b0, 1.2); rim2.position.set(50, 14, -40);
  const fill = new THREE.DirectionalLight(0xffe6c0, 0.7); fill.position.set(8, -26, 40);
  scene.add(key, rim, rim2, fill, new THREE.AmbientLight(0xffffff, 0.4));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.ShadowMaterial({ opacity: 0.4 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -22; ground.receiveShadow = true; scene.add(ground);

  // ---- premium materials (no emissive — symbols read as engraved gold) ----
  const matResin = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, roughness: 0.74, metalness: 0.0, clearcoat: 0.18, clearcoatRoughness: 0.55, envMapIntensity: 0.45, transparent: true }); // matte black resin
  const matGold = new THREE.MeshStandardMaterial({ color: 0xcaa657, roughness: 0.28, metalness: 1.0, envMapIntensity: 1.2, transparent: true });
  const matCopper = new THREE.MeshStandardMaterial({ color: 0xc07f43, roughness: 0.34, metalness: 1.0, envMapIntensity: 1.1, transparent: true });
  const matDarkMetal = new THREE.MeshStandardMaterial({ color: 0x16171b, roughness: 0.4, metalness: 0.6, envMapIntensity: 0.9, transparent: true });
  const matSilver = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.28, metalness: 0.95, envMapIntensity: 1.1, transparent: true });
  const matBattery = new THREE.MeshStandardMaterial({ color: 0x1d1f25, roughness: 0.46, metalness: 0.5, envMapIntensity: 0.9, transparent: true });
  const matCord = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.85, metalness: 0.0, transparent: true });
  const matCitrine = new THREE.MeshPhysicalMaterial({ color: 0xd9b15a, roughness: 0.12, metalness: 0.0, transmission: 0.4, transparent: true, opacity: 0.8 });

  const groups = { bracelet: new THREE.Group(), bead: new THREE.Group(), hub: new THREE.Group() };
  scene.add(groups.bracelet, groups.bead, groups.hub);
  groups.bead.visible = false; groups.hub.visible = false;

  let parts = {}, pcbBead = null, pcbHub = null;
  function partMesh(name, material) {
    if (!parts[name]) return null;
    const m = new THREE.Mesh(parts[name], material);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // ---- one real Adinkra bead: cap + base + gold platform (symbol reads through the window) ----
  function makeBead(sym) {
    const b = new THREE.Group();
    const cap = partMesh(`CAP_${sym}`, matResin.clone());
    const base = partMesh("FB_BASE", matResin.clone());
    const plat = partMesh(`PLAT_${sym}`, matGold.clone());
    [base, plat, cap].forEach(m => m && b.add(m));
    b.userData = { cap, base, plat };
    return b;
  }

  function build() {
    /* ---------- BRACELET — like the CAD layout: core hub IN-LINE at the centre,
       4 beads strung on each side, one gentle strand; macramé tails off the ends ---------- */
    const N = RING.length, half = N / 2;            // 8 beads → 4 each side
    const beadGap = 13.2, hubGap = 23, drop = 9;     // hubGap = centre→first bead; drop = end fall-off
    const maxX = hubGap + (half - 1) * beadGap;
    const yAt = (x) => -drop * (x / maxX) * (x / maxX);   // gentle downward curve, hub highest at centre
    // orient each bead like the real CAD: symbol on the front face (→ camera, +Z),
    // cord holes on the sides (→ along the strand, ±X), belt top/bottom (±Y)
    const beadQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
    );
    // bead x positions: 4 left (outer→inner), 4 right (inner→outer); hub at x=0
    const beadPos = [];
    for (let i = 0; i < N; i++) {
      const side = i < half ? -1 : 1;
      const rank = i < half ? (half - i) : (i - half + 1);          // 1..4 outward from the hub
      const x = side * (hubGap + (rank - 1) * beadGap);
      const p = new THREE.Vector3(x, yAt(x), 0); beadPos.push(p);
      const bead = makeBead(RING[i]);
      bead.position.copy(p);
      bead.quaternion.copy(beadQuat);
      groups.bracelet.add(bead);
    }
    const ordered = [...beadPos].sort((a, b) => a.x - b.x);
    const leftBeads = ordered.filter(p => p.x < 0), rightBeads = ordered.filter(p => p.x > 0);

    // core hub IN-LINE at the centre of the strand, gold button facing the camera
    const hubArc = new THREE.Group();
    [partMesh("HUB_BASE", matResin.clone()), partMesh("HUB_TOP", matResin.clone()), partMesh("HUB_SWITCH", matGold.clone())].forEach(m => m && hubArc.add(m));
    hubArc.rotation.x = Math.PI / 2;
    hubArc.position.set(0, 1.5, 0);
    hubArc.scale.setScalar(0.82);
    groups.bracelet.add(hubArc);

    // citrine accents just outside the outermost beads
    const citL = new THREE.Vector3(-maxX - 9, yAt(maxX) - 1, 0), citR = new THREE.Vector3(maxX + 9, yAt(maxX) - 1, 0);
    [citL, citR].forEach(p => { const c = new THREE.Mesh(new THREE.SphereGeometry(2.9, 24, 18), matCitrine.clone()); c.position.copy(p); groups.bracelet.add(c); });

    // one cord through it all: left tail → citrine → left beads → into hub → out hub → right beads → citrine → right tail
    const strandPts = [citL, ...leftBeads, new THREE.Vector3(-13, 2, 0), new THREE.Vector3(13, 2, 0), ...rightBeads, citR];
    const strand = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strandPts, false, "catmullrom", 0.25), 300, 1.2, 12, false), matCord.clone());
    strand.castShadow = true; groups.bracelet.add(strand);

    // adjustable macramé tails off the two ends, splaying outward and slightly back
    function tail(dir, start) {
      const pts = [start, new THREE.Vector3(dir * (maxX + 22), yAt(maxX) + 4, -3), new THREE.Vector3(dir * (maxX + 40), yAt(maxX) + 9, -5), new THREE.Vector3(dir * (maxX + 54), yAt(maxX) + 11, -7)];
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
      const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 1.05, 10, false), matCord.clone());
      t.castShadow = true; groups.bracelet.add(t);
      [0.4, 0.66, 0.88].forEach(f => {                              // macramé wrap knots
        const k = new THREE.Mesh(new THREE.SphereGeometry(1.9, 18, 14), matResin.clone());
        k.position.copy(curve.getPoint(f)); k.scale.set(1.15, 1.5, 1.15); groups.bracelet.add(k);
      });
      const e = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 16), matResin.clone());   // end bead
      e.position.copy(pts[pts.length - 1]); groups.bracelet.add(e);
    }
    tail(-1, citL); tail(1, citR);
    groups.bracelet.position.y = 1;

    /* ---------- BEAD DETAIL: real akoma cap/base/platform + real PCB + ERM motor ---------- */
    const bd = groups.bead;
    const cap = partMesh("CAP_akoma", matResin.clone());
    const base = partMesh("FB_BASE", matResin.clone());
    const plat = partMesh("PLAT_akoma", matGold.clone());
    [base, plat, cap].forEach(m => m && bd.add(m));
    if (pcbBead) bd.add(pcbBead);               // real friend-bead PCB (KiCad)
    const motor = new THREE.Group();             // ERM motor — proxy (no CAD)
    motor.add(new THREE.Mesh(new THREE.CylinderGeometry(4.9, 4.9, 2.6, 44), matCopper.clone()));
    const mw = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 2.8, 24, 1, false, 0, Math.PI), matDarkMetal.clone()); mw.position.x = 2.0; motor.add(mw);
    bd.add(motor);
    bd.userData = { cap, base, plat, pcb: pcbBead, motor };

    /* ---------- HUB DETAIL: real hub shells + real core PCB + battery + speaker ---------- */
    const hd = groups.hub;
    const hBase = partMesh("HUB_BASE", matResin.clone());
    const hTop = partMesh("HUB_TOP", matResin.clone());
    const hSwitch = partMesh("HUB_SWITCH", matGold.clone());
    [hBase, hTop, hSwitch].forEach(m => m && hd.add(m));
    if (pcbHub) hd.add(pcbHub);                  // real core-hub PCB (KiCad)
    const battery = new THREE.Group();           // LiPo — proxy
    battery.add(new THREE.Mesh(new THREE.BoxGeometry(25, 5, 17), matBattery.clone()));
    const bt = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 3), matSilver.clone()); bt.position.z = -9.8; battery.add(bt);
    const speaker = new THREE.Group();           // speaker — proxy
    speaker.add(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 3.2, 44), matDarkMetal.clone()));
    const sm = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.3, 44), matSilver.clone()); sm.position.y = 1.7; speaker.add(sm);
    hd.add(battery, speaker);
    hd.position.y = -7;
    hd.userData = { hBase, hTop, hSwitch, pcb: pcbHub, battery, speaker };

    ready = true;
    if (loaderEl) loaderEl.classList.add("hide");
    poster.classList.add("hide");
    onScroll(); render();
  }

  // ---- explode (move parts along +Y) ----
  function explodeBead(t) {
    const u = groups.bead.userData; if (!u.cap) return;
    if (u.plat) u.plat.position.y = 16 * t;
    if (u.cap) u.cap.position.y = 9 * t;
    if (u.pcb) u.pcb.position.y = 0.5 + 1 * t;
    u.motor.position.y = -4.2 - 9 * t;
    if (u.base) u.base.position.y = -15 * t;
  }
  function explodeHub(t) {
    const u = groups.hub.userData; if (!u.hBase) return;
    if (u.hSwitch) u.hSwitch.position.y = 34 * t;
    if (u.hTop) u.hTop.position.y = 26 * t;
    if (u.pcb) u.pcb.position.y = 11 + 17 * t;
    u.battery.position.y = 6 + 10 * t;
    u.speaker.position.y = 2.6 + 4 * t;
    if (u.hBase) u.hBase.position.y = -14 * t;
  }

  function setOpacity(group, op) {
    group.visible = op > 0.01;
    group.traverse(o => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => { x.transparent = true; x.opacity = op; }); } });
  }

  // ---- camera keyframes (Y-up, mm) ----
  const KEYS = [
    { p: 0.00, px: 0, py: 7, pz: 112, tx: 0, ty: 2, tz: 0 },
    { p: 0.14, px: -26, py: 13, pz: 104, tx: 0, ty: 2, tz: 0 },
    { p: 0.24, px: 11, py: 22, pz: 48, tx: 0, ty: 4, tz: 0 },
    { p: 0.38, px: 13, py: 46, pz: 72, tx: 0, ty: 4, tz: 0 },
    { p: 0.50, px: 7, py: 22, pz: 50, tx: 0, ty: 3, tz: 0 },
    { p: 0.62, px: -18, py: 30, pz: 96, tx: 0, ty: 6, tz: 0 },
    { p: 0.77, px: 24, py: 52, pz: 138, tx: 0, ty: 17, tz: 0 },
    { p: 0.90, px: -8, py: 30, pz: 100, tx: 0, ty: 7, tz: 0 },
    { p: 1.00, px: 0, py: 7, pz: 114, tx: 0, ty: 2, tz: 0 },
  ];
  const _t = new THREE.Vector3();
  function placeCamera(p) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) { if (p >= KEYS[i].p && p <= KEYS[i + 1].p) { a = KEYS[i]; b = KEYS[i + 1]; break; } }
    const t = smooth(a.p, b.p, p);
    camera.position.set(lerp(a.px, b.px, t), lerp(a.py, b.py, t), lerp(a.pz, b.pz, t));
    _t.set(lerp(a.tx, b.tx, t), lerp(a.ty, b.ty, t), lerp(a.tz, b.tz, t));
    camera.lookAt(_t);
  }

  // ---- overlay ----
  const intro = $("#heroIntro"), outro = $("#heroOutro"), cue = $("#heroCue"), bar = $("#heroProgress span");
  const capWrap = $("#heroCaption"), capK = capWrap?.querySelector(".hc-kicker"), capT = capWrap?.querySelector(".hc-title"), capL = capWrap?.querySelector(".hc-line");
  let capStage = "";
  function overlay(p) {
    const introOp = 1 - smooth(0.03, 0.11, p);
    if (intro) intro.style.opacity = introOp;
    if (cue) cue.style.opacity = introOp;
    const outOp = smooth(0.93, 0.99, p);
    if (outro) { outro.style.opacity = outOp; outro.style.pointerEvents = outOp > 0.5 ? "auto" : "none"; }
    if (bar) bar.style.transform = `scaleX(${p})`;
    let stage = "", op = 0;
    const beadOp = bump(p, 0.18, 0.55, 0.05), hubOp = bump(p, 0.58, 0.92, 0.05);
    if (beadOp >= hubOp && beadOp > 0.01) { stage = "bead"; op = beadOp; }
    else if (hubOp > 0.01) { stage = "hub"; op = hubOp; }
    if (stage && stage !== capStage) {
      capStage = stage;
      if (stage === "bead") { capK.textContent = "One bead, one person"; capT.textContent = "A relationship you keep close."; capL.textContent = "Real CAD: the engraved Adinkra cap, the friend-bead PCB, a haptic motor — touch, light and a voice Echo in a 13 mm bead."; }
      else { capK.textContent = "The core hub"; capT.textContent = "Connection, made physical."; capL.textContent = "The real core-hub board — Bluetooth, a microphone and a speaker — with the battery, under the gold."; }
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.5, 0.95); // barely-there — no symbol/platform "glow"
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function update(p) {
    placeCamera(p);
    setOpacity(groups.bracelet, Math.max(1 - smooth(0.14, 0.2, p), smooth(0.94, 0.995, p)));
    setOpacity(groups.bead, bump(p, 0.17, 0.575, 0.045));
    setOpacity(groups.hub, bump(p, 0.55, 0.93, 0.045));
    explodeBead(Math.min(smooth(0.27, 0.39, p), 1 - smooth(0.45, 0.53, p)));
    explodeHub(Math.min(smooth(0.65, 0.78, p), 1 - smooth(0.83, 0.91, p)));
    groups.bracelet.rotation.y = -0.22 + p * 0.7 + Math.sin(idle * 0.32) * 0.12; // gentle turn (arc never goes edge-on)
    groups.bead.rotation.y = -0.6 + p * 1.4 + idle * 0.12;
    groups.hub.rotation.y = -0.4 + p * 1.2 + idle * 0.1;
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

  // ---- load all CAD ----
  if (loaderEl) loaderEl.classList.remove("hide");
  const loader = new GLTFLoader();
  let pending = 3, failed = false;
  const fail = (err) => { if (failed) return; failed = true; console.warn("[hero3d] CAD load failed:", err); section.classList.add("no3d"); if (loaderEl) loaderEl.style.display = "none"; poster.classList.remove("hide"); };
  const tick = () => { if (--pending === 0 && !failed) build(); };

  function preparePCB(root) {
    root.scale.setScalar(1000);                 // KiCad GLB is in metres → mm
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.sub(c);                        // recentre to origin
    root.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        const m = Array.isArray(o.material) ? o.material : [o.material];
        m.forEach(x => {                                   // tame KiCad's shiny mats so the board doesn't blow out
          x.transparent = true;
          x.envMapIntensity = 0.35;
          if (x.metalness !== undefined && x.metalness > 0.6) x.metalness = 0.55;
          if (x.roughness !== undefined && x.roughness < 0.45) x.roughness = 0.5;
          if (x.emissive) x.emissive.multiplyScalar(0.3);
        });
      }
    });
    const g = new THREE.Group(); g.add(root); return g;
  }

  loader.load("assets/models/akoma_parts.glb", (g) => {
    g.scene.traverse(o => {
      if (o.isMesh) {
        const geo = o.geometry.clone();    // plain GLB = real-mm coords
        geo.rotateX(-Math.PI / 2);          // Fusion Z-up → three Y-up
        geo.computeVertexNormals();
        parts[o.name] = geo;
      }
    });
    tick();
  }, undefined, fail);
  loader.load("assets/models/friend_bead_pcb.glb", (g) => { pcbBead = preparePCB(g.scene); tick(); }, undefined, fail);
  loader.load("assets/models/core_hub_pcb.glb", (g) => { pcbHub = preparePCB(g.scene); tick(); }, undefined, fail);
}
