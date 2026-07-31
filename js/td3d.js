/* Touch demo — six swipeable carousels, each the EXACT Akoma_4E bracelet: the real
   8-bead bracelet_threaded.glb with its Fusion-threaded macramé cord and the Shamballa
   braid that wraps every bead's top/bottom belt grooves (ported from the hero). One
   bracelet is built once and rendered, spun, into six viewports. Swipe to bring a
   person to the front; tap the front bead to reach them — and on their bracelet the
   ring spins to your bead, which lights up and buzzes. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CORD_PATH, BEAD_CENTERS, BEAD_PIPES } from "./bracelet_data.js";

const stack = document.getElementById("tdStack");
const foot = document.querySelector("#tdFoot span");

const TAU = Math.PI * 2;
const FLIP_X = Math.PI;                 // same orientation flip the hero uses (USB face up)
const CORD_RAD = 0.2;

// Each person = one identity bead: a GLB node (its Adinkra symbol) + a colour.
const NODE = { akoma: 0, aya: 2, gye_nyame: 3, nkonsonkonson: 4, nsoroma: 6, sankofa: 7 };
const PEOPLE = [
  { name: "You",  node: NODE.nkonsonkonson, hue: 0x48C9CB },
  { name: "Maa",  node: NODE.akoma,         hue: 0xE0A52A },
  { name: "Kojo", node: NODE.nsoroma,       hue: 0xB77AF4 },
  { name: "Ama",  node: NODE.sankofa,       hue: 0xF0922C },
  { name: "Nana", node: NODE.aya,           hue: 0x63CE88 },
  { name: "John", node: NODE.gye_nyame,     hue: 0x5C9CEB },
];
const N = PEOPLE.length;
const hex = (h) => "#" + h.toString(16).padStart(6, "0");
const norm = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };

function webglOK() { try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch (e) { return false; } }
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (stack) { if (webglOK()) build3D(); else buildFallback(); }

function build3D() {
  // --- DOM: a full-viewport canvas + six invisible hit-areas (td3d positions them every frame) ---
  const canvas = document.createElement("canvas"); canvas.id = "tdCanvas"; stack.appendChild(canvas);
  const hits = [], stageGlows = [];
  for (let o = 0; o < N; o++) {
    const hit = document.createElement("div"); hit.className = "td-hit"; hit.dataset.owner = String(o);
    hit.setAttribute("role", "group");
    hit.setAttribute("aria-label", PEOPLE[o].name + "'s bracelet — swipe to a person, tap to reach them");
    const glow = document.createElement("div"); glow.className = "td-stage-glow"; glow.setAttribute("aria-hidden", "true");
    hit.appendChild(glow); stack.appendChild(hit);
    hits.push(hit); stageGlows.push(glow);
  }
  const copyEl = document.querySelector("#touchdemo .td-copy");
  const heroOutro = document.getElementById("heroOutro");
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // --- scroll progress through the pinned section (same formula the hero uses) ---
  const section = document.getElementById("touchdemo");
  let pIn = 0, pOverride = null;
  function onScroll() {
    const rect = section.getBoundingClientRect();
    const total = section.offsetHeight - window.innerHeight;
    pIn = Math.max(0, Math.min(1, -rect.top / Math.max(total, 1)));
  }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // --- renderer / scene / lights (the hero's matte-jewelry rig) ---
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.28;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);   // transparent — bracelets float on the pinned stage
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff4e6, 3.6); key.position.set(20, 16, 7); scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff1dd, 0.8); fill.position.set(13, -3, -6); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xbcd2ff, 1.4); rim.position.set(-17, 9, -5); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffd9a6, 0.8); rim2.position.set(-6, 5, 16); scene.add(rim2);
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  // matte Akoma look — deep matte-black resin + warm gold (NO clearcoat → not "ashy")
  const matBlack = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.82, metalness: 0.0, clearcoat: 0.0, envMapIntensity: 0.2 });
  const matGold = new THREE.MeshStandardMaterial({ color: 0xc6a24c, roughness: 0.36, metalness: 1.0, envMapIntensity: 0.6 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.46, metalness: 0.55, envMapIntensity: 0.35 });
  const matCord = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.18, side: THREE.DoubleSide });
  const remap = (m) => { const mm = (m && m.metalness !== undefined) ? m.metalness : 0; return mm > 0.8 ? matGold : (mm > 0.3 ? matMetal : matBlack); };

  // the spin rig (exactly like the hero): scene → spin → orient(FLIP_X) → model
  const spin = new THREE.Group();
  const orient = new THREE.Group(); orient.rotation.x = FLIP_X; spin.add(orient); scene.add(spin);
  let model = null, modelR = 8, ready = false;
  const platformOf = {};    // node → gold platform mesh (own material, so it can glow)
  const frontAngleOf = {};  // node → spin.rotation.y that brings this bead to the front (+X, facing camera)

  const draco = new DRACOLoader(); draco.setDecoderPath("assets/vendor/three/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.load("assets/models/bracelet_threaded.glb", (g) => {
    model = g.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = false;
      o.material = Array.isArray(o.material) ? o.material.map(remap) : remap(o.material);
    });
    const suf = (k) => (k === 0 ? "" : String(k));
    for (const sym in NODE) {
      const k = NODE[sym], pm = model.getObjectByName("PLATFORM" + suf(k));
      if (pm) { pm.material = matGold.clone(); platformOf[k] = pm; }
    }
    const cordCurve = buildCord(model, matCord);
    buildBraid(model, cordCurve, matCord);
    orient.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.sub(c);
    const size = box.getSize(new THREE.Vector3());
    modelR = Math.max(size.x, size.y, size.z) * 0.5;
    model.updateWorldMatrix(true, true);
    for (const sym in NODE) {
      const k = NODE[sym], cap = model.getObjectByName("FB_CAP" + suf(k)) || platformOf[k];
      if (!cap) continue;
      cap.geometry.computeBoundingBox();
      const wc = cap.geometry.boundingBox.getCenter(new THREE.Vector3());
      cap.localToWorld(wc);
      frontAngleOf[k] = frontSpin(model.worldToLocal(wc.clone()));
    }
    for (let o = 0; o < N; o++) { scroll[o] = target[o] = frontAngleOf[PEOPLE[(o + 1) % N].node]; }
    ready = true; resize();
  }, undefined, (e) => { console.warn("[td3d] GLB load failed", e); canvas.remove(); hits.forEach((h) => h.remove()); buildFallback(); });

  // camera lerp: the hero's SETTLED framing (enter=0, far + elevated) → the tight demo framing (enter=1)
  function placeCamera(enter) {
    const EL = lerp(27 * Math.PI / 180, 4 * Math.PI / 180, enter);
    const d = lerp(4.7, 1.68, enter) * modelR;
    const pan = lerp(0.5, 0.0, enter) * modelR;
    camera.position.set(Math.cos(EL) * d, Math.sin(EL) * d - pan, 0);
    camera.lookAt(0, -pan, 0);
  }
  // brute-force the spin that maximises a model-local point's world X (hero's frontSpin)
  function frontSpin(localPt) {
    const m = new THREE.Object3D(); m.position.copy(localPt); model.add(m);
    let bestX = -Infinity, bestTh = 0; const tmp = new THREE.Vector3(), sav = spin.rotation.y;
    for (let k = 0; k < 720; k++) { const th = k / 720 * TAU; spin.rotation.y = th; spin.updateMatrixWorld(true); m.getWorldPosition(tmp); if (tmp.x > bestX) { bestX = tmp.x; bestTh = th; } }
    spin.rotation.y = sav; spin.updateMatrixWorld(true); model.remove(m);
    return bestTh;
  }

  // the six FINAL screen rects — a centred RING of 6 (vertical hexagon), recomputed each frame
  function layoutRects(W, H) {
    const cx = W / 2, cy = H / 2;
    if (W < 760) {                                  // mobile: a compact 2 × 3
      const BR = Math.min(W * 0.46, H * 0.27), gx = BR * 0.98, gy = BR * 0.66;
      return [[cx - gx * 0.5, cy - gy * 2], [cx + gx * 0.5, cy - gy * 2],
              [cx - gx * 0.5, cy], [cx + gx * 0.5, cy],
              [cx - gx * 0.5, cy + gy * 2], [cx + gx * 0.5, cy + gy * 2]]
        .map(([x, y]) => ({ cx: x, cy: y, w: BR, h: BR * 0.62 }));
    }
    const BR = Math.min(W * 0.24, H * 0.385), Rx = BR * 1.08, Ry = BR * 0.84, ringY = H * 0.45;
    const slots = [
      [cx,      ringY - Ry],          // top
      [cx + Rx, ringY - Ry * 0.42],   // upper-right
      [cx + Rx, ringY + Ry * 0.42],   // lower-right
      [cx,      ringY + Ry],          // bottom
      [cx - Rx, ringY + Ry * 0.42],   // lower-left
      [cx - Rx, ringY - Ry * 0.42],   // upper-left
    ];
    return slots.map(([x, y]) => ({ cx: x, cy: y, w: BR, h: BR * 0.6 }));
  }

  // entrance: every bracelet BLOOMS from the centre (where the hero bracelet sits) out to its ring slot
  function rectFor(o, enter, finals, W, H) {
    const f = finals[o];
    const t0 = o === 0 ? 0 : 0.10 + (o - 1) * 0.085;
    const e = smooth(t0, t0 + 0.55, enter), ee = e * e * (3 - 2 * e);
    const alpha = o === 0 ? 1 : smooth(t0, t0 + 0.22, enter);
    const bigW = W * 0.98, bigH = H * 0.98;   // start near-full-frame so bracelet 0 matches the hero's size
    return {
      cx: lerp(W / 2, f.cx, ee), cy: lerp(H / 2, f.cy, ee),
      w: lerp(bigW, f.w, ee), h: lerp(bigH, f.h, ee), alpha,
    };
  }

  // --- per-carousel spin state: scroll = the spin angle; snap to the nearest person's bead ---
  const scroll = new Array(N).fill(0), target = new Array(N).fill(0), vel = new Array(N).fill(0), snapping = new Array(N).fill(false);
  const buzz = new Array(N).fill(null);
  function nearestPerson(o) {
    let best = -1, bd = Infinity;
    for (let p = 0; p < N; p++) { const d = Math.abs(norm(frontAngleOf[PEOPLE[p].node] - scroll[o])); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function snapToNearest(o) { const p = nearestPerson(o); target[o] = scroll[o] + norm(frontAngleOf[PEOPLE[p].node] - scroll[o]); snapping[o] = true; }

  function reach(owner, p) {
    if (p == null || p === owner) return;
    if (foot) foot.textContent = PEOPLE[owner].name + " reached for " + PEOPLE[p].name + " — feel it land on their wrist.";
    target[p] = scroll[p] + norm(frontAngleOf[PEOPLE[owner].node] - scroll[p]); snapping[p] = true;
    setTimeout(() => {
      buzz[p] = { pid: owner, t0: performance.now(), hue: PEOPLE[owner].hue };
      if (stageGlows[p]) stageGlows[p].style.setProperty("--hue", hex(PEOPLE[owner].hue));
      try { if (navigator.vibrate) navigator.vibrate(45); } catch (e) {}
    }, 220);
  }
  window.__td = { reach, focusedPid: nearestPerson, setProgress: (v) => { pOverride = v; } };

  // --- pointer: drag a hit-area to spin, tap (no drag) to reach the front person ---
  let dragging = -1, downX = 0, downY = 0, downScroll = 0, lastX = 0, lastT = 0, moved = false;
  const SENS = 0.006;
  hits.forEach((hit, o) => {
    hit.addEventListener("pointerdown", (ev) => {
      dragging = o; downX = lastX = ev.clientX; downY = ev.clientY; downScroll = scroll[o];
      vel[o] = 0; snapping[o] = false; moved = false; lastT = performance.now();
      try { hit.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    hit.addEventListener("pointermove", (ev) => {
      if (dragging !== o) return;
      const dx = ev.clientX - downX;
      if (Math.abs(dx) > 4 || Math.abs(ev.clientY - downY) > 4) moved = true;
      scroll[o] = downScroll - dx * SENS;
      const nt = performance.now(), ddx = ev.clientX - lastX;
      if (nt > lastT) vel[o] = -ddx * SENS / (nt - lastT);
      lastX = ev.clientX; lastT = nt;
    });
    const end = (ev) => {
      if (dragging !== o) return; dragging = -1;
      try { hit.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (!moved) { reach(o, nearestPerson(o)); snapToNearest(o); return; }
      if (Math.abs(vel[o]) <= 0.0006) snapToNearest(o);
    };
    hit.addEventListener("pointerup", end);
    hit.addEventListener("pointercancel", end);
  });

  // --- loop ---
  let inView = true, enterNow = 0;
  new IntersectionObserver((es) => {
    inView = es[0].isIntersecting;
    // hand the hero back its outro when we leave the demo (so it isn't left stuck-hidden on scroll-up)
    if (!inView && window.__hero && window.__hero.suppressOutro) window.__hero.suppressOutro(false);
  }, { threshold: 0 }).observe(section);
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!ready || !inView) { last = now; return; }
    const dt = Math.min(50, now - last) || 16; last = now;
    const p = pOverride != null ? pOverride : pIn;
    enterNow = smooth(0.0, 0.46, p);
    // the demo owns the hero outro fade while in view; demo copy resolves AFTER the ring lands
    if (window.__hero && window.__hero.suppressOutro) window.__hero.suppressOutro(p > 0.008);
    if (heroOutro) { const hf = smooth(0.0, 0.22, p); heroOutro.style.opacity = String(1 - hf); heroOutro.style.pointerEvents = hf > 0.5 ? "none" : "auto"; }
    if (copyEl) copyEl.style.opacity = (smooth(0.55, 0.9, p)).toFixed(3);
    for (let o = 0; o < N; o++) {
      if (dragging === o) { /* live */ }
      else if (snapping[o]) {
        scroll[o] += (target[o] - scroll[o]) * Math.min(1, dt * 0.011);
        if (Math.abs(target[o] - scroll[o]) < 0.0006) { scroll[o] = target[o]; snapping[o] = false; }
      } else if (Math.abs(vel[o]) > 0.00002) {
        scroll[o] += vel[o] * dt; vel[o] *= 0.9;
        if (Math.abs(vel[o]) < 0.0008) { vel[o] = 0; snapToNearest(o); }
      }
    }
    renderAll(now, enterNow);
  }
  requestAnimationFrame(frame);

  // ONE bracelet, rendered six times — each at its ring rect, its own spin, its own glow
  function renderAll(now, enter) {
    const cr = canvas.getBoundingClientRect(), W = cr.width, H = cr.height;
    if (W < 2 || H < 2) return;
    const finals = layoutRects(W, H);
    placeCamera(enter);
    for (let o = 0; o < N; o++) {
      const r = rectFor(o, enter, finals, W, H);
      const hit = hits[o];
      hit.style.left = (r.cx - r.w / 2) + "px"; hit.style.top = (r.cy - r.h / 2) + "px";
      hit.style.width = r.w + "px"; hit.style.height = r.h + "px";
      hit.style.pointerEvents = (enter > 0.9 && r.alpha > 0.9) ? "auto" : "none";
      if (r.alpha < 0.02) continue;
      spin.rotation.y = scroll[o];
      let lit = null;
      const b = buzz[o];
      if (b) {
        const e = (now - b.t0) / 1000;
        if (e >= 1) { buzz[o] = null; if (stageGlows[o]) stageGlows[o].style.opacity = "0"; }
        else {
          const gg = Math.max(0, Math.min(Math.min(1, e * 6), 1 - Math.max(0, (e - 0.62) / 0.38)));
          lit = platformOf[PEOPLE[b.pid].node];
          if (lit) { lit.material.emissive.setHex(b.hue); lit.material.emissiveIntensity = 5.5 * gg; lit.material.color.setHex(0xffe6b8); }
          if (stageGlows[o]) stageGlows[o].style.opacity = (0.6 * gg).toFixed(3);
        }
      }
      const x = r.cx - r.w / 2, yTop = r.cy - r.h / 2, y = H - (yTop + r.h);
      camera.aspect = r.w / r.h; camera.updateProjectionMatrix();
      renderer.setViewport(x, y, r.w, r.h);
      renderer.setScissor(x, y, r.w, r.h);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      if (lit) { lit.material.emissiveIntensity = 0; lit.material.color.setHex(0xc6a24c); }
    }
  }

  function resize() {
    const r = stack.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
  }
  window.addEventListener("resize", () => { onScroll(); resize(); });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stack);
  window.addEventListener("load", () => { onScroll(); resize(); });
  resize();
}

/* ---- the Fusion-threaded macramé cord (ported from hero3d.buildCord, full draw) ---- */
function buildCord(model, matCord) {
  const raw = CORD_PATH.slice(0, 101).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const n = raw.length, EMBED = 0.5;
  const pL = raw[0].clone().addScaledVector(raw[0].clone().sub(raw[1]).normalize(), EMBED);
  const pR = raw[n - 1].clone().addScaledVector(raw[n - 1].clone().sub(raw[n - 2]).normalize(), EMBED);
  const curve = new THREE.CatmullRomCurve3([pL, ...raw, pR], false, "centripetal");
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 480, CORD_RAD, 10, false), matCord);
  model.add(mesh);
  return curve;
}

/* ---- the Shamballa braid wrapping every bead's top/bottom belt grooves (ported from hero3d.buildBraid) ---- */
function buildBraid(model, cordCurve, matCord) {
  const N2 = 1400, up = new THREE.Vector3(0, 1, 0);
  const total = cordCurve.getLength() || 1;
  const THETA_END = Math.PI / 2;
  const BRAID_R = 0.19, BRAID_FREQ = 69, BRAID_RAD = 0.065, BRAID_OVER = 0.18, BRAID_K = 3.0;
  const BEAD_RGROW = 0.03, BEAD_BLEND = 0.22;
  const beadG = BEAD_CENTERS.map((bc, k) => {
    const O = new THREE.Vector3(bc[0], bc[1], bc[2]);
    let bt = 0, bd = Infinity;
    for (let j = 0; j < 1600; j++) { const tt = j / 1600; const d = cordCurve.getPointAt(tt).distanceToSquared(O); if (d < bd) { bd = d; bt = tt; } }
    const cordDir = cordCurve.getTangentAt(bt).clone().normalize();
    const fit = (rawPts) => {
      const P = rawPts.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
      const eUp = P[4].clone().sub(O).normalize();
      const eAxis = P[P.length - 1].clone().sub(O);
      eAxis.addScaledVector(eUp, -eAxis.dot(eUp)).normalize();
      if (eAxis.dot(cordDir) < 0) eAxis.multiplyScalar(-1);
      let R = 0; for (const p of P) R += p.distanceTo(O); R /= P.length;
      return { eUp, eAxis, R };
    };
    return { t: bt, O, top: fit(BEAD_PIPES[k].top), bot: fit(BEAD_PIPES[k].bot) };
  });
  const ptsA = [], ptsC = [], tan = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < N2; i++) {
    const t = i / N2, base = cordCurve.getPointAt(t);
    cordCurve.getTangentAt(t, tan);
    u.copy(up).addScaledVector(tan, -up.dot(tan)); if (u.lengthSq() < 1e-6) u.set(0, 1, 0); u.normalize();
    w.crossVectors(tan, u).normalize();
    const ph = t * BRAID_FREQ * TAU, sn = Math.sin(ph);
    const sq = Math.tanh(BRAID_K * sn), pulse = (1 - sq * sq) * Math.cos(ph);
    const sB = base.clone().addScaledVector(u, BRAID_R * sq).addScaledVector(w, BRAID_OVER * pulse);
    const sC = base.clone().addScaledVector(u, -BRAID_R * sq).addScaledVector(w, -BRAID_OVER * pulse);
    let pB = sB, pC = sC;
    let bi = -1, dt = 0, ad = 1;
    for (let k = 0; k < beadG.length; k++) { let d = t - beadG[k].t; d -= Math.round(d); if (Math.abs(d) < ad) { ad = Math.abs(d); dt = d; bi = k; } }
    const gB = beadG[bi], halfWin = (gB.top.R + BEAD_RGROW) / total;
    if (ad < halfWin) {
      const frac = dt / halfWin, th = frac * THETA_END, ct = Math.cos(th), st = Math.sin(th);
      const RwT = gB.top.R + BEAD_RGROW, RwB = gB.bot.R + BEAD_RGROW;
      const wB = gB.O.clone().addScaledVector(gB.top.eUp, RwT * ct).addScaledVector(gB.top.eAxis, RwT * st);
      const wC = gB.O.clone().addScaledVector(gB.bot.eUp, RwB * ct).addScaledVector(gB.bot.eAxis, RwB * st);
      const rel = Math.abs(frac), a = 1 - BEAD_BLEND;
      const tt = Math.min(1, Math.max(0, (rel - a) / (1 - a))), oscW = tt * tt * (3 - 2 * tt);
      pB = wB.lerp(sB, oscW); pC = wC.lerp(sC, oscW);
    }
    ptsA.push(pB); ptsC.push(pC);
  }
  const mk = (pp) => { const cu = new THREE.CatmullRomCurve3(pp, false, "centripetal"); model.add(new THREE.Mesh(new THREE.TubeGeometry(cu, 1500, BRAID_RAD, 8, false), matCord)); };
  mk(ptsA); mk(ptsC);
}

/* ============================ static fallback (no WebGL) ============================ */
function buildFallback() {
  const sec = document.getElementById("touchdemo"); if (sec) sec.classList.add("td-no3d");
  stack.classList.add("td-flat");
  const order = [];
  for (let o = 0; o < N; o++) { const others = []; for (let p = 0; p < N; p++) if (p !== o) others.push(p); order.push(others); }
  const SYM = { 0: "nkonsonkonson", 1: "akoma", 2: "nsoroma", 3: "sankofa", 4: "aya", 5: "gye_nyame" };
  for (let o = 0; o < N; o++) {
    const row = document.createElement("div"); row.className = "td-car td-car-flat";
    const name = document.createElement("span"); name.className = "td-name"; name.textContent = PEOPLE[o].name;
    const strand = document.createElement("div"); strand.className = "td-flatstrand";
    for (const p of order[o]) {
      const cell = document.createElement("div"); cell.className = "td-flatcell";
      cell.innerHTML = '<img src="assets/beads/' + SYM[p] + '.png" alt="" draggable="false"><span>' + PEOPLE[p].name + '</span>';
      strand.appendChild(cell);
    }
    row.appendChild(name); row.appendChild(strand); stack.appendChild(row);
  }
  if (foot) foot.textContent = "Each bead is a person you carry.";
}
