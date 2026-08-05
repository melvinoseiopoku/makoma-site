/* beadlaser.js — the mark is CUT, and you watch it happen.
 *
 * A galvo head above the case fires a beam at the bead's face and traces the artwork.
 * The kerf is real: the trace is stroked into a mask texture that the cap's shader
 * DISCARDS, so the slit genuinely opens through the cap as the beam passes — you can see
 * the black interior through it. Holes are cut before outlines (real practice: inner
 * features first, so the part stays anchored), the beam blanks while the head repositions
 * between contours, and when the last outline closes the slug drops out of the window.
 * Then the finished CSG geometry — with true cut walls — is swapped in.
 *
 * Everything is driven by an arc-length resampling of the fitted artwork, so the head moves
 * at a constant mm/s no matter how the contours were authored.
 */

const KERF_MM = 0.42;                 // slit width the beam opens
const SPEED_MM_S = 34;                // head speed along the cut
const TRAVEL_S = 0.11;                // beam off, repositioning between contours
const MIN_S = 1.3, MAX_S = 3.0;       // total trace clamp
const SLUG_S = 0.42;                  // the cut-out piece dropping away
const COOL_S = 0.5;                   // edges cooling before the finished part lands
const TEX = 512;

export function createLaser(THREE, { scene, camera }) {
  // ---------- the burn mask: kerf (persistent) composited with heat (per frame) ----------
  const kerfCv = document.createElement("canvas"); kerfCv.width = kerfCv.height = TEX;
  const kerfCtx = kerfCv.getContext("2d");
  const cv = document.createElement("canvas"); cv.width = cv.height = TEX;
  const ctx2d = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;               // this is DATA (kerf + heat), not colour

  // ---------- the beam rig (scene-level: it must not ride the turntable) ----------
  const rig = new THREE.Group(); rig.visible = false; scene.add(rig);
  // THE BEAM IS A CAMERA-FACING GLOW QUAD, not a tube. Nested cylinders always betray
  // themselves — their silhouettes are hard edges, so the beam reads as a plastic rod. One
  // billboard carrying a soft across-width falloff (incandescent white core bleeding out
  // through amber to nothing) has no silhouette at all, which is what a real beam looks like.
  const beamTex = (() => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 4;
    const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 256, 0);
    // a long, faint outer bloom collapsing into a very narrow incandescent centre — the
    // profile of the founder's reference. A broad mid-range alpha is what made it read as a bar.
    gr.addColorStop(0.00, "rgba(255,120,40,0)");
    gr.addColorStop(0.34, "rgba(255,140,55,0.035)");
    gr.addColorStop(0.445, "rgba(255,180,95,0.14)");
    gr.addColorStop(0.486, "rgba(255,232,190,0.62)");
    gr.addColorStop(0.50, "rgba(255,255,255,1)");
    gr.addColorStop(0.514, "rgba(255,232,190,0.62)");
    gr.addColorStop(0.555, "rgba(255,180,95,0.14)");
    gr.addColorStop(0.66, "rgba(255,140,55,0.035)");
    gr.addColorStop(1.00, "rgba(255,120,40,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), beamMat);
  beam.renderOrder = 6; rig.add(beam);
  // the emitter itself, mounted INSIDE the chamber: a stubby dark barrel with a hot lens, so
  // the beam visibly issues from a machine in the case rather than dropping out of the sky
  const emitter = new THREE.Group(); rig.add(emitter);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.72, 14),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.42, metalness: 0.85 }));
  barrel.position.y = -0.36; emitter.add(barrel);            // extends BACK from the muzzle
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.145, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  lens.position.y = 0.005; lens.rotation.x = -Math.PI / 2; emitter.add(lens);

  const flareTex = (() => {                          // contact flare + sparks share one sprite map
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,226,170,0.85)");
    gr.addColorStop(0.6, "rgba(255,150,60,0.25)");
    gr.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flareTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, opacity: 0,
  }));
  flare.renderOrder = 7; rig.add(flare);

  const SPARKS = 10;
  const sparks = [];
  for (let i = 0; i < SPARKS; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flareTex, color: 0xffc072, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, opacity: 0,
    }));
    s.renderOrder = 7; rig.add(s);
    sparks.push({ sp: s, life: 0, vel: new THREE.Vector3() });
  }

  // ---------- the cap shader: kerf discards, heat glows ----------
  function burnMaterial(base, halfMM) {
    const m = base.clone();
    m.userData.burn = {
      uBurn: { value: tex },
      uHalf: { value: halfMM },
      uHeat: { value: 1 },
    };
    m.onBeforeCompile = (sh) => {
      for (const k in m.userData.burn) sh.uniforms[k] = m.userData.burn[k];
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vBurnXY;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBurnXY = position.xy;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform sampler2D uBurn; uniform float uHalf; uniform float uHeat;
          varying vec2 vBurnXY;
          vec4 burnSample() { return texture2D(uBurn, vBurnXY / (2.0 * uHalf) + 0.5); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec4 bs = burnSample();
          if (bs.g > 0.5) discard;                       // the kerf is a REAL hole in the cap
          // scorch: the material darkens where the beam has passed close by
          diffuseColor.rgb *= 1.0 - 0.55 * smoothstep(0.15, 0.9, bs.b);`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float hh = bs.r * uHeat;
          // white-hot at the head, cooling through amber to a dull ember behind it
          vec3 hot = mix(vec3(1.6, 0.42, 0.06), vec3(2.2, 1.9, 1.5), smoothstep(0.45, 1.0, hh));
          totalEmissiveRadiance += hot * (hh * hh) * 3.4;`);
    };
    m.needsUpdate = true;
    return m;
  }

  /* ---------- arc-length resample of the fitted artwork ----------
     Contour order is real laser practice: every hole first, then the outline that frees the
     piece. Between contours the beam blanks and the head travels. */
  function buildPath(shapes) {
    const contours = [];
    for (const sh of shapes) {
      for (const h of sh.holes) contours.push(h.getPoints(64));
      contours.push(sh.getPoints(64));
    }
    const samples = [];
    let total = 0;
    let prevEnd = null;
    for (const raw of contours) {
      const pts = raw.slice();
      if (pts.length < 2) continue;
      const first = pts[0], last = pts[pts.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-4) pts.push(first.clone());
      if (prevEnd) samples.push({ x: pts[0].x, y: pts[0].y, on: false, travel: true, from: prevEnd });
      // walk the contour at a fixed spacing so the head speed is constant
      const STEP = 0.05;
      let carry = 0;
      samples.push({ x: pts[0].x, y: pts[0].y, on: true });
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        if (seg < 1e-9) continue;
        let t = carry;
        while (t < seg) {
          const k = t / seg;
          samples.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, on: true });
          t += STEP; total += STEP;
        }
        carry = t - seg;
      }
      prevEnd = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
    }
    return { samples, total };
  }

  // ---------- painting ----------
  const toPx = (v, halfMM) => (v / (2 * halfMM) + 0.5) * TEX;
  function resetMask() {
    kerfCtx.globalCompositeOperation = "source-over";
    kerfCtx.fillStyle = "#000"; kerfCtx.fillRect(0, 0, TEX, TEX);
    ctx2d.fillStyle = "#000"; ctx2d.fillRect(0, 0, TEX, TEX);
    tex.needsUpdate = true;
  }

  let run = null;      // the active carve

  function start({ node, shapes, capMesh, matShell, halfMM, capThickMM, onDone, isStale, headAt }) {
    const { samples, total } = buildPath(shapes);
    if (!samples.length) { onDone && onDone(); return null; }
    resetMask();
    const mat = burnMaterial(matShell, halfMM);
    capMesh.material = mat;
    const dur = Math.max(MIN_S, Math.min(MAX_S, total / SPEED_MM_S));
    run = {
      node, samples, shapes, capMesh, mat, halfMM, capThickMM, onDone, isStale, headAt,
      t: 0, dur, idx: 0, phase: "trace", slug: 0, cool: 0, travelLeft: 0,
      kerfPx: Math.max(1.5, (KERF_MM / (2 * halfMM)) * TEX),
    };
    rig.visible = true;
    return run;
  }

  function paint(r, headIdx) {
    // kerf + scorch are PERSISTENT: stroke only what was newly traced this frame
    kerfCtx.globalCompositeOperation = "lighter";
    kerfCtx.lineCap = "round"; kerfCtx.lineJoin = "round";
    for (let i = Math.max(1, r.idx); i <= headIdx; i++) {
      const a = r.samples[i - 1], b = r.samples[i];
      if (!b.on || b.travel) continue;
      const ax = toPx(a.x, r.halfMM), ay = TEX - toPx(a.y, r.halfMM);
      const bx = toPx(b.x, r.halfMM), by = TEX - toPx(b.y, r.halfMM);
      kerfCtx.strokeStyle = "rgba(0,40,0,1)";        // BLUE-free: G channel is the cut mask
      kerfCtx.lineWidth = r.kerfPx * 2.6;            // scorch halo, wider than the slit
      kerfCtx.strokeStyle = "rgba(0,0,90,1)";        // B channel = scorch
      kerfCtx.beginPath(); kerfCtx.moveTo(ax, ay); kerfCtx.lineTo(bx, by); kerfCtx.stroke();
      kerfCtx.lineWidth = r.kerfPx;
      kerfCtx.strokeStyle = "rgba(0,255,0,1)";       // G channel = the through-cut slit
      kerfCtx.beginPath(); kerfCtx.moveTo(ax, ay); kerfCtx.lineTo(bx, by); kerfCtx.stroke();
    }
    r.idx = headIdx;
    // composite: persistent kerf + a hot tail that only exists this frame
    ctx2d.globalCompositeOperation = "source-over";
    ctx2d.drawImage(kerfCv, 0, 0);
    ctx2d.globalCompositeOperation = "lighter";
    ctx2d.lineCap = "round"; ctx2d.lineJoin = "round";
    const TAIL = 46;
    for (let i = Math.max(1, headIdx - TAIL); i <= headIdx; i++) {
      const a = r.samples[i - 1], b = r.samples[i];
      if (!b || !b.on || b.travel) continue;
      const k = 1 - (headIdx - i) / TAIL;             // 1 at the head, 0 at the tail end
      const ax = toPx(a.x, r.halfMM), ay = TEX - toPx(a.y, r.halfMM);
      const bx = toPx(b.x, r.halfMM), by = TEX - toPx(b.y, r.halfMM);
      ctx2d.strokeStyle = "rgba(" + Math.round(255 * k * k) + ",0,0,1)";
      ctx2d.lineWidth = r.kerfPx * (1.1 + 1.9 * k * k);
      ctx2d.beginPath(); ctx2d.moveTo(ax, ay); ctx2d.lineTo(bx, by); ctx2d.stroke();
    }
    tex.needsUpdate = true;
  }

  function dropSlug(r, u) {
    // the freed piece slides out of the window: fill the artwork interior into the cut mask
    // from the top down, so the hole opens the way a slug actually falls away
    kerfCtx.globalCompositeOperation = "lighter";
    kerfCtx.fillStyle = "rgba(0,255,0,1)";
    kerfCtx.save();
    kerfCtx.beginPath();
    kerfCtx.rect(0, 0, TEX, TEX * u);
    kerfCtx.clip();
    for (const sh of r.shapes) {
      const draw = (pts, first) => {
        kerfCtx.beginPath();
        pts.forEach((p, i) => {
          const x = toPx(p.x, r.halfMM), y = TEX - toPx(p.y, r.halfMM);
          i ? kerfCtx.lineTo(x, y) : kerfCtx.moveTo(x, y);
        });
        kerfCtx.closePath(); kerfCtx.fill();
      };
      draw(sh.getPoints(64));
      // holes are NOT part of the slug — they were freed already; punch them back out
      kerfCtx.globalCompositeOperation = "destination-out";
      for (const h of sh.holes) draw(h.getPoints(64));
      kerfCtx.globalCompositeOperation = "lighter";
    }
    kerfCtx.restore();
    ctx2d.globalCompositeOperation = "source-over";
    ctx2d.drawImage(kerfCv, 0, 0);
    tex.needsUpdate = true;
  }

  const _v = new THREE.Vector3(), _hd = new THREE.Vector3(), _dir = new THREE.Vector3();
  const _n = new THREE.Vector3(), _x = new THREE.Vector3(), _m = new THREE.Matrix4();

  function update(dt) {
    if (!run) return;
    const r = run;
    if (r.isStale && r.isStale()) { abort(); return; }
    r.t += dt;

    if (r.phase === "trace") {
      const u = Math.min(1, r.t / r.dur);
      const headIdx = Math.min(r.samples.length - 1, Math.floor(u * (r.samples.length - 1)));
      paint(r, headIdx);
      const s = r.samples[headIdx];
      // the contact point on the cap's OUTER face, in world
      _v.set(s.x, s.y, r.capThickMM);
      r.capMesh.localToWorld(_v);
      // the head is a fixture INSIDE the case — high in a back corner — so the beam rakes
      // across the chamber at an angle instead of dropping vertically from above
      if (r.headAt) r.headAt(_hd);
      else { camera.getWorldDirection(_dir); _hd.copy(_v).addScaledVector(_dir, -2.6).add(new THREE.Vector3(0, 3.4, 0)); }
      const on = s.on && !s.travel;
      _dir.copy(_v).sub(_hd);
      const len = _dir.length();
      beam.position.copy(_hd).addScaledVector(_dir, 0.5);   // midpoint
      _dir.normalize();
      // billboard the quad about the beam axis: its normal is the camera vector with the beam
      // direction projected out, so it always presents its full width to the viewer
      _n.copy(camera.position).sub(beam.position);
      _n.addScaledVector(_dir, -_n.dot(_dir)).normalize();
      _x.crossVectors(_dir, _n).normalize();
      _m.makeBasis(_x, _dir, _n);
      beam.quaternion.setFromRotationMatrix(_m);
      // mostly falloff: the incandescent centre is a small fraction of the quad's width
      beam.scale.set(0.5, len, 1);
      beamMat.opacity = on ? 0.92 + 0.08 * Math.random() : 0.05;
      // point the emitter down the beam: its local +Y is the muzzle direction
      emitter.position.copy(_hd);
      emitter.quaternion.setFromRotationMatrix(_m);
      lens.material.opacity = on ? 0.85 : 0.12;
      flare.position.copy(_v);
      flare.material.opacity = on ? 0.85 + 0.15 * Math.random() : 0;
      const fs = 0.24 + 0.07 * Math.random();
      flare.scale.set(fs, fs, 1);
      // sparks fly off the contact point
      for (const sk of sparks) {
        if (sk.life <= 0) {
          if (on && Math.random() < 0.5) {
            sk.life = 0.18 + 0.22 * Math.random();
            sk.sp.position.copy(_v);
            sk.vel.set((Math.random() - 0.5) * 3.2, 1.2 + Math.random() * 2.6, (Math.random() - 0.5) * 3.2);
          } else { sk.sp.material.opacity = 0; continue; }
        }
        sk.life -= dt;
        sk.vel.y -= 7.5 * dt;                          // gravity
        sk.sp.position.addScaledVector(sk.vel, dt);
        const l = Math.max(0, sk.life);
        sk.sp.material.opacity = Math.min(1, l * 4);
        const ss = 0.05 + 0.07 * l;
        sk.sp.scale.set(ss, ss, 1);
      }
      if (u >= 1) { r.phase = "slug"; r.t = 0; }
      return;
    }

    if (r.phase === "slug") {
      const u = Math.min(1, r.t / SLUG_S);
      dropSlug(r, u * u);                              // accelerating, like a piece falling
      beamMat.opacity *= 0.72;
      flare.material.opacity *= 0.72;
      for (const sk of sparks) {
        if (sk.life > 0) {
          sk.life -= dt; sk.vel.y -= 7.5 * dt;
          sk.sp.position.addScaledVector(sk.vel, dt);
          sk.sp.material.opacity = Math.min(1, Math.max(0, sk.life) * 4);
        } else sk.sp.material.opacity = 0;
      }
      if (u >= 1) { r.phase = "cool"; r.t = 0; }
      return;
    }

    // cool: the ember edges fade, then the finished part (with real cut walls) lands
    const u = Math.min(1, r.t / COOL_S);
    r.mat.userData.burn.uHeat.value = 1 - u;
    beamMat.opacity = 0; flare.material.opacity = 0;
    for (const sk of sparks) sk.sp.material.opacity = 0;
    if (u >= 1) finish();
  }

  function teardown() {
    rig.visible = false;
    beamMat.opacity = 0; flare.material.opacity = 0;
    for (const sk of sparks) { sk.sp.material.opacity = 0; sk.life = 0; }
  }
  function finish() {
    const r = run; run = null;
    teardown();
    if (r) { const cb = r.onDone; r.mat.dispose(); cb && cb(); }
  }
  function abort() {
    const r = run; run = null;
    teardown();
    if (r) { r.mat.dispose(); r.onDone && r.onDone(); }
  }

  return { start, update, get busy() { return !!run; }, abort };
}
