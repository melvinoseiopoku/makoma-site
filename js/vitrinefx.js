/* vitrinefx.js — the manufacturing-box VFX: volumetric smoke + believable glass.
 *
 * SMOKE — one raymarched volume, not sprites. A single box mesh (BackSide) marches a
 * procedural density field: four pressurized jets from the bottom corners (narrow fast
 * cores arcing across the case, expanding into FBM-displaced billows) plus an ambient
 * fill that accumulates, holds the piece hidden, then clears UPWARD with buoyant lift.
 * Depth-aware: a half-res packed-depth prepass of the scene lets the march stop at real
 * geometry, so smoke sits naturally behind AND in front of the bracelet, with a soft
 * contact fade (no hard intersections). One draw call; zero per-click allocation — a
 * re-fire only resets uniforms, and every envelope is eased so rapid clicks cross-fade
 * instead of popping.
 *
 * GLASS — shader panes + edge bars: view-dependent Fresnel, restrained moving glare
 * bands from a fake 4-strip studio rig, pale white/aqua highlights with subtle green
 * absorption. The glare env is FOUR-FOLD SYMMETRIC by construction (|sin 2az|), so the
 * turntable's invisible 90° wrap cannot make reflections jump. Edge noise lives in
 * geometry space (all bars share it), wrap-safe for the same reason. No transmission —
 * that resolves white under the alpha-canvas + composer pipeline.
 */

const NOISE_GLSL = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float c000 = hash13(i), c100 = hash13(i + vec3(1, 0, 0));
  float c010 = hash13(i + vec3(0, 1, 0)), c110 = hash13(i + vec3(1, 1, 0));
  float c001 = hash13(i + vec3(0, 0, 1)), c101 = hash13(i + vec3(1, 0, 1));
  float c011 = hash13(i + vec3(0, 1, 1)), c111 = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(c000, c100, f.x), mix(c010, c110, f.x), f.y),
             mix(mix(c001, c101, f.x), mix(c011, c111, f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.17 + 11.7; a *= 0.5; }
  return s;   // ~0..0.875
}
`;

const SMOKE_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorld;
void main() {
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SMOKE_FRAG = /* glsl */ `
precision highp float;
#include <packing>
varying vec3 vLocal;
varying vec3 vWorld;
uniform vec3 uCamLocal;        // camera position in the smoke mesh's LOCAL space
uniform vec3 uBoxMin, uBoxMax; // the volume AABB, local
uniform sampler2D uDepth;      // RGBA-packed scene depth (half res)
uniform vec2 uResolution;      // full canvas pixels
uniform float uNear, uFar;
uniform float uTime;           // scrolls the turbulence
uniform float uHead;           // jet front progress 0..1 (eased in JS)
uniform float uSwell;          // plume expansion over time 0..1 — the jets widen until they merge
uniform float uRare;           // rarefaction 0..1 — the fade is THINNING, not a dissolve pattern
uniform float uGlobal;         // master envelope
uniform vec3 uJetC[4];         // jet corner origins, local
uniform vec3 uJetE[4];         // jet targets across the case, local
uniform float uArc;            // upward arc of the jet path, local units
uniform float uR0, uRGrow;     // jet core radius: at the nozzle / growth along the path
uniform float uSigma;          // extinction — how fast density goes opaque
uniform vec3 uTintPale, uTintCore;
${NOISE_GLSL}

float jetDensity(vec3 p, int i, float n) {
  vec3 C = uJetC[i], E = uJetE[i];
  vec3 AB = E - C;
  float L = length(AB);
  vec3 A = AB / L;
  float s = clamp(dot(p - C, A) / L, 0.0, 1.0);
  vec3 axisP = C + A * (s * L);
  axisP.y += uArc * s * (1.0 - s) * 4.0;               // arched flight
  float r = length(p - axisP);
  // the plume WIDENS with time (uSwell): four streams spray, expand, and merge into one
  // irregular mass — the density source is plume geometry, never the volume box
  float coreR = (uR0 + uRGrow * s) * (0.62 + 0.65 * n) * (1.0 + 2.1 * uSwell);
  float behindFront = smoothstep(uHead, uHead - 0.16, s);
  float prof = exp(-pow(r / max(coreR, 1e-3), 2.0) * 2.4);
  return prof * behindFront * (0.9 + 1.0 * smoothstep(0.0, 0.2, s));
}

float density(vec3 p) {
  vec3 dims = uBoxMax - uBoxMin;
  vec3 q = (p - uBoxMin) / dims;
  // containment is only a CLAMP at the glass — the smoke's shape comes from the plumes
  float wall = smoothstep(0.0, 0.10, q.x) * smoothstep(1.0, 0.90, q.x)
             * smoothstep(0.0, 0.10, q.z) * smoothstep(1.0, 0.90, q.z)
             * smoothstep(-0.02, 0.05, q.y) * smoothstep(1.0, 0.80, q.y);
  if (wall <= 0.0) return 0.0;
  // TWO decorrelated turbulence scalars drive a vector displacement: the streams fold and
  // curl into each other instead of staying tubes — the random mixing of real smoke
  float n1 = fbm(p * 0.85 + vec3(0.0, -uTime * 1.0, 0.0));
  float n2 = fbm(p * 0.85 + vec3(9.2, -uTime * 0.7, 4.1));
  float mixAmp = (uBoxMax.x - uBoxMin.x) * (0.05 + 0.16 * uSwell);
  vec3 pd = p + vec3(n1 - 0.44, (n2 - 0.44) * 0.7, (n1 * 0.4 + n2 * 0.6) - 0.44) * mixAmp * 2.2;
  float den = 0.0;
  for (int i = 0; i < 4; i++) den += jetDensity(pd, i, n1);
  // noise-eroded boundary — where the plumes DO reach the glass, the contact is billowy
  wall = pow(wall, 1.0 + 1.6 * (1.0 - n1));
  // THE FADE THINS IN PLACE. Raising density to a HIGHER power (what this used to do) is
  // morphological erosion: it eats thin fringes first and spares dense cores, and the cores
  // sit where the four plumes converge — so the cloud visibly shrank onto the bracelet before
  // vanishing. The exponent is now INVERTED (<1), which flattens the field — thin regions are
  // lifted toward the cores, holding the silhouette (even dilating it slightly) while uGlobal
  // scales every sample down uniformly. Result: it goes transparent where it stands.
  den = pow(max(den, 0.0), 1.0 / (1.0 + 0.75 * uRare)) * wall * uGlobal;
  return den;
}

void main() {
  vec3 rd = normalize(vLocal - uCamLocal);
  // slab intersection with the volume AABB (local units == world units, uniform scale)
  vec3 inv = 1.0 / rd;
  vec3 t0v = (uBoxMin - uCamLocal) * inv, t1v = (uBoxMax - uCamLocal) * inv;
  vec3 tmin = min(t0v, t1v), tmax = max(t0v, t1v);
  float tEnter = max(max(tmin.x, tmin.y), tmin.z);
  float tExit = min(min(tmax.x, tmax.y), tmax.z);
  tEnter = max(tEnter, 0.0);
  if (tExit <= tEnter) discard;
  // scene depth clamp: reconstruct the distance to the nearest opaque surface along this ray
  vec2 suv = gl_FragCoord.xy / uResolution;
  float packed = unpackRGBAToDepth(texture2D(uDepth, suv));
  float sceneDist = 1e5;
  if (packed < 0.9999) {
    float viewZ = perspectiveDepthToViewZ(packed, uNear, uFar);
    vec3 rdWorld = normalize(vWorld - cameraPosition);
    float k = (viewMatrix * vec4(rdWorld, 0.0)).z;     // ray's view-forward component (negative)
    sceneDist = viewZ / k;                             // both negative -> positive distance
  }
  float tEnd = min(tExit, sceneDist);
  if (tEnd <= tEnter) discard;
  const int STEPS = 22;
  float stepLen = (tEnd - tEnter) / float(STEPS);
  float t = tEnter + stepLen * (0.25 + 0.5 * hash13(vec3(gl_FragCoord.xy, uTime))); // jittered start beats banding
  float a = 0.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 p = uCamLocal + rd * t;
    float den = density(p);
    if (den > 1e-4) {
      // soft contact: fade the last stretch before real geometry — no hard smoke/bead seam
      den *= smoothstep(0.0, 0.12, sceneDist - t);   // thin band: soft seam without carving a de-smoked aura round each bead
      float aStep = 1.0 - exp(-den * uSigma * (1.0 - 0.55 * uRare) * stepLen);
      float coreK = clamp(den * 1.5, 0.0, 1.0);
      vec3 base = mix(uTintPale, uTintCore, coreK);
      vec3 dims = uBoxMax - uBoxMin;
      float qy = (p.y - uBoxMin.y) / dims.y;
      base *= 0.86 + 0.26 * qy;                        // quiet top-light gradient
      col += (1.0 - a) * aStep * base;
      a += (1.0 - a) * aStep;
      if (a > 0.985) break;
    }
    t += stepLen;
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;

const PANE_VERT = /* glsl */ `
varying vec3 vW, vN;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}
`;

// the fake studio rig: four identical strip lights at 90° spacing (|sin 2az|), a little
// above the horizon. Four-fold symmetric — the turntable's 90° wrap maps the reflection
// pattern exactly onto itself, so glare can never jump at the wrap.
const GLARE_GLSL = /* glsl */ `
float glareBand(vec3 R, float tight) {
  float az = atan(R.z, R.x);
  // two strip-light bands at different phases — ANY phase of |sin 2az| keeps the exact
  // 4-fold symmetry, so the turntable's 90° wrap still maps the glare onto itself
  float band = pow(abs(sin(2.0 * az)), tight) + 0.45 * pow(abs(sin(2.0 * az + 1.1)), tight * 2.0);
  return band * smoothstep(-0.08, 0.42, R.y) * (1.0 - smoothstep(0.75, 1.0, R.y));
}
`;

const PANE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vW, vN;
${GLARE_GLSL}
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float NdV = dot(N, V);
  N *= sign(NdV + 1e-5);                               // DoubleSide: face the camera
  float f = pow(1.0 - abs(NdV), 3.0);                  // Fresnel rim
  vec3 R = reflect(-V, N);
  float g = glareBand(R, 14.0) * (0.45 + 0.55 * f);
  float alpha = 0.016 + 0.10 * f + 0.85 * g;
  vec3 col = mix(vec3(0.78, 0.94, 0.88), vec3(0.985, 1.0, 0.99), clamp(g * 2.0, 0.0, 1.0));
  col *= mix(vec3(1.0), vec3(0.85, 1.0, 0.94), f);     // subtle green absorption at grazing
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.6));
}
`;

const EDGE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vW, vN;
varying vec3 vLp;
${GLARE_GLSL}
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; return fract(p * (p + p)); }
float lnoise(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), f);
}
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float NdV = dot(N, V);
  N *= sign(NdV + 1e-5);
  float f = pow(1.0 - abs(NdV), 2.0);
  vec3 R = reflect(-V, N);
  float g = glareBand(R, 60.0);
  // internal-reflection shimmer along the bar — GEOMETRY-space noise (bars share geometry,
  // uprights swap with uprights on the wrap), gentle, not a glued-on stripe
  float n = 0.72 + 0.42 * lnoise(vLp.x * 2.6) * (0.6 + 0.4 * lnoise(vLp.x * 9.1 + 4.7));
  vec3 deep = vec3(0.10, 0.40, 0.31), pale = vec3(0.78, 0.98, 0.92);
  vec3 col = mix(deep, pale, clamp(0.30 + 0.55 * f + 0.9 * g, 0.0, 1.0)) * n;
  float alpha = clamp(0.34 + 0.38 * f + 0.5 * g, 0.0, 0.92) * (0.8 + 0.2 * n);
  gl_FragColor = vec4(col, alpha);
}
`;

const EDGE_VERT = /* glsl */ `
varying vec3 vW, vN;
varying vec3 vLp;
void main() {
  vLp = position;
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}
`;

export function createVitrineFX(THREE) {
  const paneMaterial = () => new THREE.ShaderMaterial({
    vertexShader: PANE_VERT, fragmentShader: PANE_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const edgeMaterial = () => new THREE.ShaderMaterial({
    vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG,
    transparent: true, depthWrite: false, side: THREE.FrontSide,
  });

  // ---- the smoke volume ----
  function createSmoke({ boxSide, boxWallH, boxFloorY }) {
    const H = boxWallH * 1.02;                          // inside the case — no glowing slab above the rails
    const hw = boxSide / 2;
    const boxMin = new THREE.Vector3(-hw, boxFloorY + 0.01, -hw);
    const boxMax = new THREE.Vector3(hw, boxFloorY + 0.01 + H, hw);
    const jets = { C: [], E: [] };
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      jets.C.push(new THREE.Vector3(sx * hw * 0.9, boxFloorY + H * 0.03, sz * hw * 0.9));
      jets.E.push(new THREE.Vector3(-sx * hw * 0.52, boxFloorY + H * 0.62, -sz * hw * 0.52));
    }
    const uniforms = {
      uCamLocal: { value: new THREE.Vector3() },
      uBoxMin: { value: boxMin }, uBoxMax: { value: boxMax },
      uDepth: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.01 }, uFar: { value: 1000 },
      uTime: { value: 0 }, uHead: { value: 0 }, uSwell: { value: 0 },
      uRare: { value: 0 }, uGlobal: { value: 1 },
      uJetC: { value: jets.C }, uJetE: { value: jets.E },
      uArc: { value: H * 0.10 },
      uR0: { value: boxSide * 0.055 }, uRGrow: { value: boxSide * 0.22 },
      uSigma: { value: 4.6 },
      uTintPale: { value: new THREE.Color(0.8, 0.8, 0.82).convertSRGBToLinear() },
      uTintCore: { value: new THREE.Color(0.16, 0.16, 0.18).convertSRGBToLinear() },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, uniforms,
      transparent: true, depthWrite: false, depthTest: false,   // compositing is done manually against the prepass
      side: THREE.BackSide,
    });
    const geo = new THREE.BoxGeometry(boxSide, H, boxSide);
    geo.translate(0, boxFloorY + 0.01 + H / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;                               // over plate + blob, under glass
    mesh.visible = false;
    mesh.frustumCulled = false;

    // the depth prepass target — packed RGBA depth at half resolution.
    // NEAREST on purpose: packed depth breaks under linear filtering.
    const depthRT = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
    });
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    uniforms.uDepth.value = depthRT.texture;

    // eased state: every envelope approaches its phase target, so a re-fire mid-run
    // cross-fades instead of popping (rapid clicks: last one wins, smoothly)
    const st = { t: 99, active: false, head: 0, swell: 0, rare: 0, global: 1,
      paleT: new THREE.Color(0.8, 0.8, 0.82).convertSRGBToLinear(),
      coreT: new THREE.Color(0.16, 0.16, 0.18).convertSRGBToLinear() };

    function fire(hexColor) {
      const wasActive = st.active;
      st.t = 0; st.active = true;
      const c = new THREE.Color(hexColor || 0x9a9a9e), hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      // pale feathered edges, darker less-saturated cores — with a lightness floor so
      // Midnight reads charcoal/blue-black and a ceiling so Bone stays warm ivory
      // HSL rules are perceptual, so they are computed in sRGB terms — but the shader works in
      // LINEAR: without this conversion the output pass gamma-lifts every tint ~1.6× too light
      // smooth lightness ramps: near-black shells still get a VISIBLE charcoal veil (0.44-ish)
      // without ever reading pale, and light shells stay warm ivory rather than blowing white
      const sat = hsl.s * (0.45 + 0.5 * hsl.l);          // dark shells go charcoal, not neon
      st.paleT.setHSL(hsl.h, Math.min(1, sat), 0.42 + hsl.l * 0.52).convertSRGBToLinear();
      st.coreT.setHSL(hsl.h, sat * 0.6, 0.10 + hsl.l * 0.42).convertSRGBToLinear();
      if (!wasActive) { uniforms.uTintPale.value.copy(st.paleT); uniforms.uTintCore.value.copy(st.coreT); }
    }

    // phase targets from the fire clock (all times in seconds)
    const smoothT = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    function step(dt, time) {
      if (!st.active) return { hidden: false, done: true };
      st.t += dt;
      const T = st.t;
      // TIGHTENED ~30%: 3.35s -> 2.4s. The SHAPE is unchanged — jets cross, the piece is
      // buried and held, then the cloud thins in place — every phase is just shorter.
      const headTgt = 1 - Math.exp(-T / 0.24);          // fronts leave the corners immediately
      const swellTgt = smoothT(0.14, 0.48, T) + 0.62 * smoothT(0.62, 1.68, T);   // spreads as it fades
      const rareTgt = smoothT(0.62, 1.4, T);
      const globalTgt = 1 - smoothT(0.92, 1.66, T);
      const k = (r) => 1 - Math.exp(-dt * r);
      st.head += (headTgt - st.head) * k(14);
      st.swell += (swellTgt - st.swell) * k(9);
      st.rare += (rareTgt - st.rare) * k(9);
      st.global += (globalTgt - st.global) * k(9);
      uniforms.uTime.value = time;
      uniforms.uHead.value = st.head;
      uniforms.uSwell.value = st.swell;
      uniforms.uRare.value = st.rare;
      uniforms.uGlobal.value = st.global;
      uniforms.uTintPale.value.lerp(st.paleT, k(8));
      uniforms.uTintCore.value.lerp(st.coreT, k(8));
      const hidden = T >= 0.42 && T <= 0.66 && st.swell > 0.85 && st.rare < 0.1;
      const done = T > 1.8;
      if (done) st.active = false;
      return { hidden, done };
    }

    // render the packed-depth prepass; caller hides glass/blob/smoke first
    function prepass(renderer, scene, camera) {
      const oldTarget = renderer.getRenderTarget();
      const oldOverride = scene.overrideMaterial;
      renderer.getClearColor(_oldClear); const oldAlpha = renderer.getClearAlpha();
      renderer.setClearColor(0xffffff, 1);              // packed depth "far"
      scene.overrideMaterial = depthMat;
      renderer.setRenderTarget(depthRT);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = oldOverride;
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(_oldClear, oldAlpha);
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value = camera.far;
    }
    const _oldClear = new THREE.Color();

    function setSize(w, h) {
      depthRT.setSize(Math.max(2, Math.round(w / 3)), Math.max(2, Math.round(h / 3)));
      uniforms.uResolution.value.set(w, h);
    }
    function updateCam(camera) {
      mesh.updateMatrixWorld();
      uniforms.uCamLocal.value.copy(camera.getWorldPosition(_camW));
      mesh.worldToLocal(uniforms.uCamLocal.value);
    }
    const _camW = new THREE.Vector3();

    return { mesh, fire, step, prepass, setSize, updateCam,
      get active() { return st.active; } };
  }

  return { paneMaterial, edgeMaterial, createSmoke };
}
