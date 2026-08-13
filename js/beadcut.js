/* ============================================================
   M'AKOMA — the bead cut engine (lazy module)
   ------------------------------------------------------------
   Turns any SVG artwork into a REAL cut through a bead cap: the blank
   redesigned cap (fab handoff 2026-07-30, MAKOMA_BEAD_TOP) is boolean-
   subtracted with the extruded artwork (three-bvh-csg), and the result
   replaces that bead's baked cap on the hero model. A real hole with cut
   walls — the lit platform behind shows through it — never a texture.

   Loaded only from the designer (dynamic import), so the page's first
   paint never pays for it: CSG + BVH + this file arrive on first use.

   GEOMETRY FACTS this file is built on (measured on the live model):
   - Bead caps sit in the model's XZ plane (y ≈ 0 for every centroid).
   - The GLB is MOUNTED FLIPPED: the model's world quaternion is a 180°
     rotation about an in-plane axis, so WORLD up = model −Y. Calibrated
     empirically with an up-arrow cut (it rendered exactly 180° rotated,
     unmirrored) — hence the rotateZ(π) in install(), which flips cap and
     artwork together, the same way every baked part is flipped.
   - The blank cap's canonical frame already matches bead node 3: +Z is
     the radial (symbol) axis, +Y is up, footprint 14.30 × 15.31 mm vs
     the baked caps' 14.48 × 15.54 mm — per-axis scale corrects the
     ~1.5% so a swapped cap is indistinguishable from its neighbours.
   - Placing a cap on bead n is therefore ONE rotation about +Y by the
     bead's azimuth (atan2 of its radial axis in XZ), no other tilt.
   - CSG runs in the cap's canonical mm frame (numerically well
     conditioned), and the finished mesh is scaled/rotated into place.
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

const CAP_MM = { x: 14.3, y: 15.31, z: 7.25 };   // the blank cap's own extents
const WINDOW_MM = 7.6;                            // max symbol diameter — sits inside the 8.7 mm platform disc
const TARGET_INK_MM2 = 18;                        // every cut removes the SAME area of cap — a lone "M" and
                                                  // a three-letter "MUM" carry equal visual weight. 18 mm² is
                                                  // the centre of the adinkra masters' range (12.4–32.3 mm²
                                                  // under the old fit), so the family barely moves.
const MIN_CUT_MM = 0.8;                           // narrowest cut that survives manufacturing at bead scale

export async function createCutEngine(ctx) {
  // ctx: { model, matShell, onReplace(node, newMesh, origMesh) }
  const { model, matShell } = ctx;

  // ---- the blank cap, once ----
  const draco = new DRACOLoader(); draco.setDecoderPath("assets/vendor/three/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const capGeo = await new Promise((res, rej) => {
    loader.load("assets/models/blank_cap.glb?v=2", (g) => {
      let geo = null;
      g.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
      geo ? res(geo) : rej(new Error("blank cap: no mesh"));
    }, undefined, rej);
  });
  capGeo.computeBoundingBox();
  {  // normalise the canonical frame defensively: centre XY, floor Z at 0
    const bb = capGeo.boundingBox;
    capGeo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z);
  }

  // ---- per-bead frames, measured off the live model in MODEL space ----
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const frames = {};
  const centreOf = (o) => {
    o.geometry.computeBoundingBox();
    const c = o.geometry.boundingBox.getCenter(new THREE.Vector3());
    o.updateMatrixWorld(true);
    return c.applyMatrix4(o.matrixWorld).applyMatrix4(inv);
  };
  for (let node = 0; node < 8; node++) {
    const suf = node === 0 ? "" : String(node);
    const cap = model.getObjectByName("FB_CAP" + suf), base = model.getObjectByName("FB_BASE" + suf);
    if (!cap || !base) continue;
    const capC = centreOf(cap), baseC = centreOf(base);
    const axis = capC.clone().sub(baseC); axis.y = 0; axis.normalize();      // radial, in the ring plane
    const az = Math.atan2(axis.x, axis.z);                                    // rotation about +Y from canonical (+Z)
    frames[node] = { capMesh: cap, capC, axis, az };
  }
  // per-axis mm→model-unit factors, anchored on the axis-aligned bead-3 measurements. These are
  // the WHOLE conversion (measured units / blank mm), so they also absorb the blank's ~1.5%
  // smaller footprint — a swapped cap lands exactly on the baked ones' envelope.
  const SCALE = {
    x: (1.3991 / CAP_MM.x),                       // 14.48 mm baked footprint over the blank's 14.30
    y: (1.5011 / CAP_MM.y),
    z: (0.7250 / CAP_MM.z),
  };

  const evaluator = new Evaluator();
  evaluator.attributes = ["position", "normal"];
  const replaced = {};                             // node -> replacement mesh currently installed

  /* ---- SVG string → THREE.Shape[] in the canonical mm frame, fitted to the window ----
     SVG y grows DOWN; the cap's +Y is visual up → flip Y. X is kept as-is: the artwork is
     authored as seen from OUTSIDE the bead, which is exactly how the +Z face is viewed.
     (Verified against the baked sankofa — see the calibration note in the repo memory.) */
  function shapesFromSVG(svgText, { dropHoles = false } = {}) {
    const parsed = new SVGLoader().parse(svgText);
    let shapes = [];
    for (const p of parsed.paths) shapes.push(...SVGLoader.createShapes(p));
    if (!shapes.length) return { shapes: [], islands: 0 };
    let islands = 0;
    for (const sh of shapes) { islands += sh.holes.length; if (dropHoles) sh.holes = []; }
    // fit: EQUAL INK AREA, capped by the window. Scaling every bbox to the window made sparse
    // artwork enormous (one initial dwarfed three); scaling so the CUT AREA is constant gives
    // every mark the same visual weight on the bead, and the window cap keeps wide art inside
    // the platform disc.
    const pts = [];
    for (const sh of shapes) { pts.push(...sh.getPoints(24)); for (const h of sh.holes) pts.push(...h.getPoints(24)); }
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6);
    let inkUnit = 0;
    for (const sh of shapes) {
      inkUnit += Math.abs(THREE.ShapeUtils.area(sh.getPoints(48)));
      for (const hh of sh.holes) inkUnit -= Math.abs(THREE.ShapeUtils.area(hh.getPoints(48)));
    }
    inkUnit = Math.max(inkUnit, 1e-6);
    const s = Math.min(Math.sqrt(TARGET_INK_MM2 / inkUnit), WINDOW_MM / Math.max(w, h));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const m = new THREE.Matrix3().set(s, 0, -cx * s, 0, -s, cy * s, 0, 0, 1);   // -s on Y: SVG y-down → cap y-up
    const xf = (v) => { const x = v.x, y = v.y; v.x = m.elements[0] * x + m.elements[3] * y + m.elements[6]; v.y = m.elements[1] * x + m.elements[4] * y + m.elements[7]; };
    // Every contour becomes a sampled polygon Shape: curves turn into dense polylines (invisible
    // at 7.6 mm and screen scale), which makes the affine transform trivial and the extrusion
    // watertight for CSG.
    const poly = [];
    for (const sh of shapes) {
      const outer = sh.getPoints(48).map((p) => { const q = p.clone(); xf(q); return q; });
      const ns = new THREE.Shape(outer);
      ns.holes = sh.holes.map((hh) => new THREE.Path(hh.getPoints(48).map((p) => { const q = p.clone(); xf(q); return q; })));
      poly.push(ns);
    }
    return { shapes: poly, islands };
  }

  /* ---- a fitted shape set → the cut cap geometry (canonical mm frame) ---- */
  function cutCapGeometry(shapes) {
    const capBrush = new Brush(capGeo.clone());
    capBrush.updateMatrixWorld();
    const extr = new THREE.ExtrudeGeometry(shapes, { depth: CAP_MM.z + 6, bevelEnabled: false, curveSegments: 24 });
    extr.translate(0, 0, -3);                       // pierce cleanly through both faces
    const cutBrush = new Brush(extr);
    cutBrush.updateMatrixWorld();
    const out = evaluator.evaluate(capBrush, cutBrush, SUBTRACTION);
    const g = out.geometry;
    g.computeVertexNormals();
    return g;
  }

  /* ---- install a cut on a bead ---- */
  function install(node, geo) {
    const fr = frames[node];
    if (!fr) throw new Error("no frame for bead " + node);
    const mesh = new THREE.Mesh(geo, matShell);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.scale.set(SCALE.x, SCALE.y, SCALE.z);     // geometry is in canonical mm; SCALE is the whole mm→unit conversion
    mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), fr.az);
    mesh.rotateZ(Math.PI);   // the model is mounted flipped (world up = model −Y): flip cap + artwork like every baked part
    // the canonical z-mid must land on the baked cap's bbox centre along the bead axis
    const zMid = (CAP_MM.z / 2) * SCALE.z;
    mesh.position.copy(fr.capC).addScaledVector(fr.axis, -zMid);
    if (replaced[node]) { replaced[node].parent && replaced[node].parent.remove(replaced[node]); replaced[node].geometry.dispose(); }
    model.add(mesh);
    replaced[node] = mesh;
    fr.capMesh.visible = false;
    if (ctx.onReplace) ctx.onReplace(node, mesh, fr.capMesh);
    return mesh;
  }

  function restore(node) {
    if (replaced[node]) {
      replaced[node].parent && replaced[node].parent.remove(replaced[node]);
      replaced[node].geometry.dispose();
      delete replaced[node];
    }
    const fr = frames[node];
    if (fr) { fr.capMesh.visible = true; if (ctx.onReplace) ctx.onReplace(node, null, fr.capMesh); }
  }

  /* ---- public: apply a cut spec ---- */
  async function applyCut(node, svgText, opts) {
    const { shapes, islands } = shapesFromSVG(svgText, opts);
    if (!shapes.length) throw new Error("empty artwork");
    const geo = cutCapGeometry(shapes);
    const mesh = install(node, geo);
    return { mesh, islands };
  }

  /* the un-cut blank — how the box presents a bead nobody has chosen for yet */
  function applyBlank(node) {
    return install(node, capGeo.clone());
  }

  return { applyCut, applyBlank, restore, frames, WINDOW_MM, MIN_CUT_MM,
    // the laser needs the SAME fitted artwork the boolean will use, the cap currently on the
    // bead to carve into, and the canonical frame's extents
    fitShapes: (svgText, opts) => shapesFromSVG(svgText, opts).shapes,
    installed: (node) => replaced[node] || null,
    CAP_MM };
}

/* ---- helpers shared with the panel (no three.js needed) ---- */
export function adinkraSVG(sym) {
  const g = (window.ADINKRA_PATHS || {})[sym];
  if (!g) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}">` +
    g.paths.map((d) => `<path d="${d}"/>`).join("") + "</svg>";
}

let fontPromise = null;
export async function initialsSVG(text) {
  if (!fontPromise) {
    fontPromise = import("opentype.js").then((ot) =>
      fetch("assets/vendor/text/AllertaStencil-Regular.ttf")
        .then((r) => r.arrayBuffer())
        .then((buf) => ot.parse(buf)));
  }
  const font = await fontPromise;
  const size = 100;
  const path = font.getPath(String(text || "").toUpperCase(), 0, 0, size, { kerning: true });
  const bb = path.getBoundingBox();
  const pad = 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x1 - pad} ${bb.y1 - pad} ${bb.x2 - bb.x1 + 2 * pad} ${bb.y2 - bb.y1 + 2 * pad}"><path d="${path.toPathData(3)}"/></svg>`;
}

/* The manufacturing file: the SAME artwork, on the A4-style page the laser masters use
   (03_SYMBOLS_FOR_LASER convention), symbol scaled to 60 mm and centred. */
export function manufacturingSVG(svgText, label) {
  // the label is a person's name — free text. Inside an XML comment, "--" is illegal and "-->"
  // breaks OUT of the comment (markup injection into a same-origin blob). Reduce to a safe
  // alphabet and collapse hyphen runs before it goes anywhere near the file.
  const safe = String(label || "bead").replace(/[^\w '.]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) || "bead";
  const inner = svgText.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const vb = /viewBox="([^"]+)"/.exec(svgText);
  const [x, y, w, h] = (vb ? vb[1] : "0 0 100 100").split(/\s+/).map(Number);
  const s = 60 / Math.max(w, h);
  const tx = 105 - (x + w / 2) * s, ty = 148.5 - (y + h / 2) * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm">` +
    `<!-- M'AKOMA custom bead cut - ${safe} - generated by the site designer -->` +
    `<g transform="translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${s.toFixed(5)})">${inner}</g></svg>`;
}
