/* ============================================================
   The REAL bead carousel — a port of the app's Bracelet3DView, not an imitation.
   Same assets (cord.usdz's baked guide pipes + the per-person CAD beads, converted to
   GLB), same constants: 8 slots on ring R=2.058 z=0.132, bead axes mapped
   +X(holes)→tangent · +Y(grooves)→ring-axis · +Z(symbol)→radial-out, ring laid flat
   with a -90° X tilt, camera fov 40 at (0, 0.7, 6.9), and the app's three-light rig.

   Division of labour: main.js OWNS the interaction — its `ring` object (drag, settle,
   focus, the one-shot click eat) is the single source of truth, exactly as it was for
   the CSS ring. This module renders that state in real 3D, projects each bead back to
   the DOM so the job badges ride above the actual geometry, and reports which bead is
   front (max world-Z, the app's own rule). If WebGL or a GLB fails, main.js keeps the
   CSS ellipse ring — same handlers, same tests.
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// Bracelet3DView.beadPos — verbatim
const BEAD_POS = [
  [ 2.0580,  0.0000, 0.132],
  [ 1.4553,  1.4553, 0.132],
  [ 0.0000,  2.0580, 0.132],
  [-1.4553,  1.4553, 0.132],
  [-2.0580,  0.0000, 0.132],
  [-1.4553, -1.4553, 0.132],
  [ 0.0000, -2.0580, 0.132],
  [ 1.4553, -1.4553, 0.132],
];
const SLOT_COUNT = 8, BEAD_SCALE = 0.9, CAM_DIST = 5.4;   // the app frames portrait; our wide strap needs a tighter fit
const MODELS = ["sankofa", "aya", "nsoroma", "gye_nyame", "nkyinkyim"];
// The back of the ring is never empty on a real bracelet: the remaining three CAD beads fill
// stations 5-7 as jewellery only — no job, no badge, no press target, never the front bead.
const FILLERS = ["akoma", "akoma_ntoaso", "nkonsonkonson"];

export async function initBeadRing3D(ctx) {
  const { strap, slots, ring, onFront, focus, wasDrag } = ctx;
  // the app's cord: 8 wrap stations 45 deg apart; the station facing the camera after the
  // -90 deg X tilt is index 6 (scene angle 270 deg). Publishing these through the shared ring
  // state makes main.js's drag/settle/focus math station-true without forking any of it.
  const APP_STEP = (Math.PI * 2) / SLOT_COUNT;
  ring.N = SLOT_COUNT;
  ring.focusTarget = function (i) { return 6 - i; };

  const canvas = document.createElement("canvas");
  canvas.className = "bx-gl";
  strap.insertBefore(canvas, strap.firstChild);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;

  const scene = new THREE.Scene();
  const tilt = new THREE.Group();
  tilt.rotation.x = -Math.PI / 2;                       // modelEuler: lay the ring flat
  scene.add(tilt);
  const ringNode = new THREE.Group();
  tilt.add(ringNode);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  camera.position.set(0, 0.55, CAM_DIST);                // ~5° above the hole plane
  camera.lookAt(0, 0, 0);

  // the app's rig, SceneKit lux ≈ /1000 into three.js intensities
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(0.4, 0.8, 1); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-0.6, -0.4, 0.7); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  rim.position.set(0, 1, -0.6); scene.add(rim);
  scene.add(new THREE.AmbientLight(0x585850, 1.4));

  const draco = new DRACOLoader(); draco.setDecoderPath("assets/vendor/three/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));

  // Bracelet3DView.styleCord / the gold-vs-black material split, by the app's own rule:
  // gold-ish name or metalness > 0.5 → warm gold; everything else → deep matte black.
  const matBlack = new THREE.MeshStandardMaterial({ color: 0x111009, roughness: 0.62, metalness: 0.0 });
  const matCord  = new THREE.MeshStandardMaterial({ color: 0x070706, roughness: 0.92, metalness: 0.0 });
  const matGold  = new THREE.MeshStandardMaterial({ color: 0xd9a54a, roughness: 0.33, metalness: 1.0, emissive: 0x4d3a13, emissiveIntensity: 1 });

  const cordG = await load("assets/models/carousel/cord.glb");
  cordG.scene.traverse((o) => { if (o.isMesh) o.material = matCord; });
  ringNode.add(cordG.scene);

  const beads = [];
  for (let slot = 0; slot < MODELS.length; slot++) {
    const g = await load(`assets/models/carousel/${MODELS[slot]}.glb`);
    const bead = g.scene;
    const golds = [];
    bead.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material, name = ((m && m.name) || "").toLowerCase();
      const isGold = name.includes("gold") || name.includes("brass") || (m && m.metalness > 0.5);
      o.material = isGold ? matGold.clone() : matBlack;
      if (isGold) golds.push(o.material);
    });
    const [px, py, pz] = BEAD_POS[slot];
    const phi = Math.atan2(py, px), c = Math.cos(phi), s = Math.sin(phi);
    // rotation matrix columns exactly as the app builds them
    const rot = new THREE.Matrix4().set(
      -s, 0, c, 0,
       c, 0, s, 0,
       0, 1, 0, 0,
       0, 0, 0, 1);
    bead.quaternion.setFromRotationMatrix(rot);
    bead.position.set(px, py, pz);
    bead.scale.setScalar(BEAD_SCALE);
    ringNode.add(bead);
    beads.push({ slot, node: bead, golds });
  }
  for (let f = 0; f < FILLERS.length; f++) {
    const slot = MODELS.length + f;                    // stations 5, 6, 7
    const g = await load(`assets/models/carousel/${FILLERS[f]}.glb`);
    const bead = g.scene;
    bead.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material, name = ((m && m.name) || "").toLowerCase();
      const isGold = name.includes("gold") || name.includes("brass") || (m && m.metalness > 0.5);
      o.material = isGold ? matGold.clone() : matBlack;
      if (isGold) { o.material.emissive.setRGB(0.30, 0.225, 0.075); o.material.emissiveIntensity = 0.55; }
    });
    const [px, py, pz] = BEAD_POS[slot];
    const phi = Math.atan2(py, px), c = Math.cos(phi), s = Math.sin(phi);
    const rot = new THREE.Matrix4().set(
      -s, 0, c, 0,
       c, 0, s, 0,
       0, 1, 0, 0,
       0, 0, 0, 1);
    bead.quaternion.setFromRotationMatrix(rot);
    bead.position.set(px, py, pz);
    bead.scale.setScalar(BEAD_SCALE);
    ringNode.add(bead);
    // NOT pushed into `beads`: fillers are scenery — no slot DOM, no front detection, no glow swap
  }

  const resize = () => {
    const w = strap.clientWidth || 1, h = strap.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener("resize", resize, { passive: true });

  // applyPresence: front bead's gold glows, the rest dim — the app's exact colours
  const GOLD_ON = new THREE.Color(0.78, 0.58, 0.20), GOLD_DIM = new THREE.Color(0.30, 0.225, 0.075);
  let lastFront = -1;
  const _v = new THREE.Vector3();

  let raf = 0, running = false;
  function frame() {
    raf = requestAnimationFrame(frame);
    // main.js's ring.off IS the angle, in bead-steps; the ring spins about its local Z
    ringNode.rotation.z = ring.off * APP_STEP;
    // project every bead to the strap's pixel space and park its DOM slot there, so the
    // badges ride above the real geometry
    const w = strap.clientWidth || 1, h = strap.clientHeight || 1;
    let front = 0, frontZ = -1e9;
    for (const b of beads) {
      b.node.getWorldPosition(_v);
      const wz = _v.z;
      if (wz > frontZ) { frontZ = wz; front = b.slot; }
      _v.project(camera);
      const x = (_v.x * 0.5) * w;                        // slot CSS centres at 50%/50% already
      const y = (-_v.y * 0.5) * h;
      const sl = slots[b.slot]; if (!sl) continue;
      const depth = (wz + 2.058) / 4.116;                // 0 back … 1 front
      sl.style.setProperty("--bx-x", x.toFixed(1) + "px");
      sl.style.setProperty("--bx-y", (y - h * 0.13).toFixed(1) + "px");   // badge rides just above the bead
      sl.style.setProperty("--bx-s", (0.7 + 0.45 * depth).toFixed(3));
      sl.style.setProperty("--bx-o", (0.25 + 0.75 * depth).toFixed(3));
      sl.style.setProperty("--bx-z", String(Math.round(100 + depth * 100)));
    }
    if (front !== lastFront) {
      lastFront = front;
      for (let j = 0; j < slots.length; j++) slots[j].setAttribute("data-front", j === front ? "1" : "0");
      if (onFront) onFront(front);
    }
    for (const b of beads) {
      const on = b.slot === front;
      for (const m of b.golds) { m.emissive.copy(on ? GOLD_ON : GOLD_DIM); m.emissiveIntensity = on ? 1.0 : 0.55; }
    }
    if (window.__hero || true) window.__beadScreens = beads.map((b) => {
      b.node.getWorldPosition(_v); const wz = _v.z; _v.project(camera);
      return { s: b.slot, x: Math.round((_v.x * 0.5 + 0.5) * (strap.clientWidth || 1)), y: Math.round((-_v.y * 0.5 + 0.5) * (strap.clientHeight || 1)), wz: +wz.toFixed(2) };
    });
    renderer.render(scene, camera);
  }
  // render only while the section is near the viewport — this lives below the fold, and a
  // hidden carousel must not burn frames
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (e.isIntersecting && !running) { running = true; frame(); }
      else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
    }
  }, { threshold: 0.05 });
  io.observe(strap);

  // Taps land on the DRAWN beads, not on invisible DOM proxies: raycast the click into the
  // scene. The front bead presses (through its existing DOM button, so every handler and
  // animation stays wired); any other bead turns to the front. Drags never fire (wasDrag).
  const ray = new THREE.Raycaster();
  const _p = new THREE.Vector2();
  // DOCUMENT capture, not strap/canvas: the drag handler takes pointer capture, which
  // retargets the whole pointer sequence unpredictably across browsers — a capture-phase
  // document listener sees every click first, wherever it was retargeted. We filter by the
  // canvas rect ourselves.
  // POINTERUP, not click: with the strap's pointer capture in play, Chrome does not reliably
  // synthesize a click for this sequence at all (observed: press fired via the DOM button
  // while no click event ever reached a document-level capture listener). pointerup always
  // fires; the moved-guard keeps drags from tapping.
  document.addEventListener("pointerup", (e) => {
    if (wasDrag && wasDrag()) return;
    if (e.target && e.target.closest && (e.target.closest(".bx-tagbtn") || e.target.closest(".bx-mi"))) return;   // badges own their taps
    const cr = canvas.getBoundingClientRect();
    if (e.clientX < cr.left || e.clientX > cr.right || e.clientY < cr.top || e.clientY > cr.bottom) return;
    const r = canvas.getBoundingClientRect();
    _p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(_p, camera);
    let best = null, bestD = Infinity;
    for (const b of beads) {
      // per-bead try/catch: one un-raycastable child must not kill the tap for every other bead
      try {
        const hits = ray.intersectObject(b.node, true);
        if (hits.length && hits[0].distance < bestD) { bestD = hits[0].distance; best = b.slot; }
      } catch (err) { /* skip this bead */ }
    }
    if (window.__hero) window.__rayHit = best;            // test/debug probe
    if (best == null) return;
    const front = [...slots].findIndex((s) => s.getAttribute("data-front") === "1");
    if (best === front) {
      const btn = slots[best] && slots[best].querySelector(".bx-bead");
      if (btn) btn.click();
    } else if (focus) {
      focus(best);
    }
  }, true);

  // debug: ray-test any strap-local point without the event system
  window.__rayTest = (px, py) => {
    const w = strap.clientWidth || 1, h = strap.clientHeight || 1;
    _p.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
    ray.setFromCamera(_p, camera);
    return beads.map((b) => {
      const hits = ray.intersectObject(b.node, true);
      const sph = [];
      b.node.traverse((o) => { if (o.isMesh) sph.push(o.geometry.boundingSphere ? +o.geometry.boundingSphere.radius.toFixed(3) : "null"); });
      return { s: b.slot, hits: hits.length, d: hits.length ? +hits[0].distance.toFixed(2) : null, spheres: sph.slice(0, 3) };
    });
  };

  strap.classList.add("bx-3d");
  // seat the first bead dead-front on arrival (station 6), the way the app opens focused
  ring.off = ring.target = ring.focusTarget(0);
  return true;
}
