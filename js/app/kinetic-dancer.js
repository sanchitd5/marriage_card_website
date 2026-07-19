import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';

// ── Kinetic dancer (persistent side wireframe humanoid) ─────────────────
// A procedural tall/slender "Anyma alien" figure — built from ONE continuous
// high-poly SKINNED surface (NO glTF model), rendered as a cyan ADDITIVE
// wireframe (+ a skinned "probe point" cloud) on its own small WebGL canvas
// (#k-dancer-canvas, fixed on the right, CSS-positioned/sized).
// It DANCES to the background music across every panel: ambient decoration,
// no user interaction, no audio node of its own.
//
// This is a sibling to lightshow.js (same renderer posture, same
// context-loss / resize / visibility handling) but a completely separate,
// tiny context. It reads the OFFLINE music energy the lightshow already
// computes (appState.lightshow.energy) rather than opening a new AnalyserNode,
// so the two stay in lockstep and there is no extra audio cost.
//
// ── FLUID DEFORMATION (the core of this build) ───────────────────────────
// Earlier this figure was ~15 RIGID nested Groups, one tapered wireframe tube
// per bone → joints creased/segmented, never fluid, and wireframe-of-tubes
// isn't truly high-poly. It is now a SINGLE high-poly BufferGeometry (a merged
// humanoid surface) driven by a THREE.Bone SKELETON via GPU skinning. Each
// vertex is weighted to 2–4 bones with a SMOOTH inverse-distance falloff that
// BLENDS across every joint, so bends are organic and never crease. The same
// named joints the old rig used are now Bones, so the BPM choreography in
// dance() rotates them unchanged (`bone.rotation.x/y/z` is the same API).
//
// ── "Nanite-like" performance (WebGL analog — NOT real Nanite) ───────────
// True Nanite / virtualized micro-polygon geometry is an Unreal-Engine-only
// feature; WebGL has no equivalent. What IS feasible in the browser, and what
// this file does instead, is the practical equivalent:
//  (a) a device/canvas-size DETAIL TIER that picks the mesh resolution
//      (radial + ring segment counts) up front — a small canvas / low-core
//      device builds fewer segments (a size-based LOD pick, in lieu of a
//      streaming THREE.LOD swap);
//  (b) ONE SkinnedMesh = ONE draw call — all deformation is GPU vertex
//      skinning (bone matrices), not per-frame CPU vertex work;
//  (c) a bounded high vertex budget (~40k–90k tris on the HIGH tier) that the
//      GPU chews through in a single pass, DPR capped at 2;
//  (d) RAF pauses on a hidden tab; dt clamped so a long pause can't lurch.
//
// Safety & performance:
//  • reduced-motion → never runs (no WebGL init at all); CSS hides the canvas.
//  • FLASH SAFETY (WCAG 2.3.1): element BRIGHTNESS (opacity) is driven only by
//    SLOW-smoothed energy, rate-limited — never pulsed from `beat`. Beats drive
//    MOTION (a small side element moving is not a flash), never a light pulse.
//  • RAF pauses on hidden tab; dt clamped so a long pause can't lurch the pose.

export function initKineticDancer() {
  if (REDUCED) return;                 // static path — CSS keeps the canvas hidden
  if (!window.THREE) return;           // no three.js → nothing to draw
  const canvas = $('#k-dancer-canvas');
  if (!canvas) return;

  const THREE = window.THREE;

  // ── shared materials ─────────────────────────────────────────────────
  // The wireframe now DEFORMS with the skin (it is drawn from the skinned
  // surface geometry), so it stays a smooth fluid mesh at every pose.
  // WebGL linewidth is always 1px, so "bloom" is faked with an additive halo
  // SkinnedMesh at ~1.02× over a brighter additive core.
  // NOTE: this surface is genuinely HIGH-POLY (tens of thousands of tris).
  // Additive blending accumulates where lines overlap, so in compact poses
  // (arms/legs together) a dense mesh blows out into a soft glowing blob. Keep
  // per-line alpha LOW so the wireframe stays crisp at every pose; the density
  // supplies presence. `skinning:true` is REQUIRED in r128 for the material to
  // inject the skinning shader chunks.
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff, wireframe: true, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false, skinning: true });
  const disposables = [];   // geometries + materials to dispose on teardown
  disposables.push(coreMat);

  // ── detail tier (Nanite analog (a): size/device-based LOD pick) ──────────
  // Choose the mesh resolution ONCE from the canvas footprint + device. The
  // mobile canvas is CSS-hidden ≤900px, so on phones this rarely even runs; the
  // tier still guards small/embedded canvases and low-core machines from paying
  // for the full HIGH vertex budget. (A streaming THREE.LOD swap is overkill for
  // one small always-on-screen figure — a single up-front pick is the right
  // WebGL-feasible LOD here.)
  function pickTier() {
    const w = canvas.clientWidth || 180, h = canvas.clientHeight || 520;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = w * h * dpr;
    const cores = navigator.hardwareConcurrency || 4;
    // HIGH: ~40k–90k tris; LOW: ~1/3 of that for small canvases / weak devices.
    if (px < 120000 || cores <= 4) return { radial: 30, ringF: 24, minRing: 10, headDetail: 3 };
    return { radial: 52, ringF: 46, minRing: 16, headDetail: 4 };
  }
  const TIER = pickTier();

  // ── runtime state ────────────────────────────────────────────────────
  let renderer, scene, camera, rig, skeleton, geo, points, pointsMat;
  let bones = null;                         // the named rig (built in build())
  let boneList = null;                      // ordered skeleton bone array
  let triCount = 0, vertCount = 0;
  let running = true, raf = 0, live = false, dead = false;

  // dance/energy state (reused across frames; nothing allocated in the loop)
  // Idle-energy baseline lifted to ~0.28 so the groove amplitude reads even
  // without music (the figure still visibly dances when silent).
  let energy = 0.28, prevFast = 0, energySlow = 0.28, beat = 0, phase = 0;
  let beatAccent = 0;                 // on-beat pulse (0..1), music-locked
  let ENV = null;                     // the offline envelope JSON (fetched once)
  const trackInfo = {};               // per-track { beatPeriod, bpm, t0 } (cached)
  const N_BEATS = 4;                  // a full gesture spans this many musical beats
  let headTrail = 0; // secondary-motion memory for the head

  // ── rest-pose joints (rig-local, UNSCALED space) ─────────────────────────
  // Single source of truth for BOTH the geometry (tube endpoints) and the bone
  // hierarchy (local offsets). Slender, elongated "Anyma alien" proportions —
  // reuse the old rig's radii/lengths verbatim so the silhouette (and thus the
  // tuned camera framing) is unchanged. y grows UP; the figure faces +Z.
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const J = {
    waist:     V(0, 0, 0),
    hipCenter: V(0, -0.30, 0),
    chestBase: V(0, 0.70, 0),
    neckBase:  V(0, 1.48, 0),
    headBase:  V(0, 1.92, 0),
    headTop:   V(0, 1.92 + 0.225 * 1.7, 0),   // ovoid apex
    // arms (L = +x). Shoulder sits high on the widening chest; arm hangs down.
    shoulderL: V(0.27, 1.4332, 0),
    elbowL:    V(0.27, 0.5932, 0),
    wristL:    V(0.27, -0.2068, 0),
    handTipL:  V(0.27, -0.2768, 0),
    // legs (L = +x). Planted, near-straight stance.
    hipL:      V(0.155, -0.30, 0),
    kneeL:     V(0.155, -1.38, 0),
    ankleL:    V(0.155, -2.42, 0),
    toeL:      V(0.155, -2.52, 0),
  };
  const mir = (v) => V(-v.x, v.y, v.z);   // mirror a joint to the right side
  J.shoulderR = mir(J.shoulderL); J.elbowR = mir(J.elbowL); J.wristR = mir(J.wristL); J.handTipR = mir(J.handTipL);
  J.hipR = mir(J.hipL); J.kneeR = mir(J.kneeL); J.ankleR = mir(J.ankleL); J.toeR = mir(J.toeL);

  // ── geometry helpers ─────────────────────────────────────────────────────
  // A smooth tapered tube (open generalized cylinder) from A→B, rProx→rDist,
  // authored DIRECTLY in rig-local rest space so it wraps the matching bone.
  // High segment counts (radial ≥20, rings ≥10) keep it a fine mesh; every tube
  // is merged into ONE geometry so the whole body is a single draw path.
  const _tmpAxis = new THREE.Vector3(), _ref = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3();
  function tube(A, B, rProx, rDist, radial, rings, parts) {
    _tmpAxis.copy(B).sub(A); const L = _tmpAxis.length() || 1e-5; _tmpAxis.divideScalar(L);
    // orthonormal ring frame (pick a reference axis not parallel to the tube)
    _ref.set(Math.abs(_tmpAxis.y) > 0.99 ? 1 : 0, Math.abs(_tmpAxis.y) > 0.99 ? 0 : 1, 0);
    _u.crossVectors(_tmpAxis, _ref).normalize();
    _v.crossVectors(_tmpAxis, _u).normalize();
    const nv = radial * (rings + 1);
    const pos = new Float32Array(nv * 3);
    const idx = new Uint32Array(radial * rings * 6);
    let p = 0;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, r = rProx + (rDist - rProx) * t;
      const cx = A.x + _tmpAxis.x * L * t, cy = A.y + _tmpAxis.y * L * t, cz = A.z + _tmpAxis.z * L * t;
      for (let j = 0; j < radial; j++) {
        const a = 2 * Math.PI * j / radial, cs = Math.cos(a), sn = Math.sin(a);
        pos[p++] = cx + (_u.x * cs + _v.x * sn) * r;
        pos[p++] = cy + (_u.y * cs + _v.y * sn) * r;
        pos[p++] = cz + (_u.z * cs + _v.z * sn) * r;
      }
    }
    let q = 0;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial;
        const a = i * radial + j, b = i * radial + j2, c = (i + 1) * radial + j2, d = (i + 1) * radial + j;
        idx[q++] = a; idx[q++] = b; idx[q++] = d;
        idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    parts.push(g);
  }

  // Merge indexed parts into one BufferGeometry. Uses BufferGeometryUtils if it
  // happens to be on window.THREE (examples build); the core r128 CDN bundle
  // here does NOT ship it, so the default path hand-concatenates the Float32/
  // index arrays (offsetting indices) — zero extra dependency.
  function mergeParts(parts) {
    const BGU = THREE.BufferGeometryUtils;
    if (BGU && BGU.mergeBufferGeometries) {
      const m = BGU.mergeBufferGeometries(parts, false);
      for (const p of parts) p.dispose();
      return m;
    }
    let vcount = 0, icount = 0;
    for (const p of parts) { vcount += p.attributes.position.count; icount += p.index.count; }
    const pos = new Float32Array(vcount * 3);
    const idx = new Uint32Array(icount);
    let vOff = 0, iOff = 0;
    for (const p of parts) {
      pos.set(p.attributes.position.array, vOff * 3);
      const pi = p.index.array;
      for (let k = 0; k < pi.length; k++) idx[iOff + k] = pi[k] + vOff;
      vOff += p.attributes.position.count;
      iOff += p.index.count;
      p.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  // ── skin weights: SMOOTH joint blend by distance-to-bone-segment ─────────
  // For every vertex, measure the distance to each weightable bone SEGMENT
  // (proximal→distal line) and weight by a soft inverse-cube falloff, keeping
  // the nearest 4 and normalising to sum 1. This is what makes the figure
  // FLUID: mid-shaft, the vertex's own segment is far closer than any other so
  // it stays effectively rigid; approaching a JOINT, two segments become nearly
  // equidistant so their weights cross-fade ~50/50 — a feather whose width
  // scales with the local limb radius, so bends are organic and never crease.
  // (Zero-length bones — the root, shoulder & hip offset bones — carry NO
  // segment, so no vertex ever weights to them; their child limb covers the joint.)
  function segDist2(px, py, pz, ax, ay, az, bx, by, bz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const ab2 = abx * abx + aby * aby + abz * abz || 1e-9;
    let t = (apx * abx + apy * aby + apz * abz) / ab2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
    return dx * dx + dy * dy + dz * dz;
  }
  function computeSkin(positions, segs) {
    const n = positions.length / 3;
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    // per-vertex top-4 accumulators
    const bi = [0, 0, 0, 0], bw = [0, 0, 0, 0];
    for (let vi = 0; vi < n; vi++) {
      const px = positions[vi * 3], py = positions[vi * 3 + 1], pz = positions[vi * 3 + 2];
      bi[0] = bi[1] = bi[2] = bi[3] = 0;
      bw[0] = bw[1] = bw[2] = bw[3] = 0;
      for (let s = 0; s < segs.length; s++) {
        const seg = segs[s];
        const d2 = segDist2(px, py, pz, seg.ax, seg.ay, seg.az, seg.bx, seg.by, seg.bz);
        // soft inverse-cube of distance → smooth joint feather, rigid mid-shaft
        const w = 1 / Math.pow(d2 + 1e-5, 1.5);
        // insertion sort into the top-4 (keep the 4 largest weights)
        if (w > bw[3]) {
          let k = 3;
          while (k > 0 && w > bw[k - 1]) { bw[k] = bw[k - 1]; bi[k] = bi[k - 1]; k--; }
          bw[k] = w; bi[k] = seg.bone;
        }
      }
      const sum = bw[0] + bw[1] + bw[2] + bw[3] || 1;
      for (let k = 0; k < 4; k++) {
        skinIndex[vi * 4 + k] = bi[k];
        skinWeight[vi * 4 + k] = bw[k] / sum;
      }
    }
    return { skinIndex, skinWeight };
  }

  // ── build ────────────────────────────────────────────────────────────────
  // The rig, once built:
  //  rig(static) → rootBone → pelvis → spine → chest → neck → head
  //  chest → shoulderL/R → upperArmL/R → forearmL/R → handL/R
  //  pelvis → hipL/R → thighL/R → shinL/R → footL/R
  // `rig` (a Group) carries the STATIC scale/placement; `rootBone` carries the
  // dance's whole-figure sway (b.root.rotation.y). Keeping scale/placement on
  // `rig` — the shared parent of BOTH the skinned meshes and the skeleton —
  // means the skinned meshes' matrixWorld never changes, so nothing is double-
  // transformed while the skeleton animates.
  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    // A lost GL context (iOS backgrounding etc.) must not freeze a dead frame:
    // stop cleanly and leave the canvas transparent.
    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); stop(); dead = true; }, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));   // Nanite analog (c): DPR capped

    scene = new THREE.Scene();

    // static placement group (unchanged tuning from the old `root`)
    rig = new THREE.Group();
    rig.position.y = 0.05;
    rig.scale.setScalar(0.60);   // tall alien scaled down so head→feet + arm-span frame with ~6% inset
    scene.add(rig);

    // ── skeleton (THREE.Bone hierarchy mirroring the old rig) ──
    boneList = [];
    bones = {};
    const bone = (name, parent, pos) => {
      const b = new THREE.Bone();
      b.position.copy(pos);
      parent.add(b);
      bones[name] = b;
      b.userData.idx = boneList.length;
      boneList.push(b);
      return b;
    };
    // torso chain (local offsets = child joint − parent joint; identity at bind)
    const rootBone = bone('root', rig, V(0, 0, 0));           // whole-figure sway pivot + skeleton root
    const pelvis = bone('pelvis', rootBone, V(0, 0, 0));      // pivots at the waist
    const spine = bone('spine', pelvis, V(0, 0, 0));
    const chest = bone('chest', spine, J.chestBase);
    const neck = bone('neck', chest, J.neckBase.clone().sub(J.chestBase));
    bone('head', neck, J.headBase.clone().sub(J.neckBase));
    // arms
    const shoulderL = bone('shoulderL', chest, J.shoulderL.clone().sub(J.chestBase));
    const upperArmL = bone('upperArmL', shoulderL, V(0, 0, 0));
    const forearmL = bone('forearmL', upperArmL, J.elbowL.clone().sub(J.shoulderL));
    bone('handL', forearmL, J.wristL.clone().sub(J.elbowL));
    const shoulderR = bone('shoulderR', chest, J.shoulderR.clone().sub(J.chestBase));
    const upperArmR = bone('upperArmR', shoulderR, V(0, 0, 0));
    const forearmR = bone('forearmR', upperArmR, J.elbowR.clone().sub(J.shoulderR));
    bone('handR', forearmR, J.wristR.clone().sub(J.elbowR));
    // legs
    const hipL = bone('hipL', pelvis, J.hipL);
    const thighL = bone('thighL', hipL, V(0, 0, 0));
    const shinL = bone('shinL', thighL, J.kneeL.clone().sub(J.hipL));
    bone('footL', shinL, J.ankleL.clone().sub(J.kneeL));
    const hipR = bone('hipR', pelvis, J.hipR);
    const thighR = bone('thighR', hipR, V(0, 0, 0));
    const shinR = bone('shinR', thighR, J.kneeR.clone().sub(J.hipR));
    bone('footR', shinR, J.ankleR.clone().sub(J.kneeR));

    // ── high-poly surface (tubes + ovoid head), merged to ONE geometry ──
    const R = TIER.radial;
    const rings = (a, b) => Math.max(TIER.minRing, Math.round(a.distanceTo(b) * TIER.ringF));
    const parts = [];
    const segs = [];   // weightable bone segments (rest space)
    // tube(A, B, rProx, rDist, radial, rings) + record its bone segment for skinning
    const limb = (A, B, rP, rD, name) => {
      tube(A, B, rP, rD, R, rings(A, B), parts);
      segs.push({ bone: bones[name].userData.idx, ax: A.x, ay: A.y, az: A.z, bx: B.x, by: B.y, bz: B.z });
    };
    // torso (radii verbatim from the old rig)
    limb(J.waist, J.hipCenter, 0.155, 0.185, 'pelvis');   // waist → hips (hangs down)
    limb(J.waist, J.chestBase, 0.165, 0.140, 'spine');    // long slender torso
    limb(J.chestBase, J.neckBase, 0.150, 0.190, 'chest'); // ribcage widening to shoulders
    limb(J.neckBase, J.headBase, 0.082, 0.072, 'neck');   // swan neck
    // arms — taper to a fine point + a needle tip (no hand blob)
    limb(J.shoulderL, J.elbowL, 0.086, 0.066, 'upperArmL');
    limb(J.elbowL, J.wristL, 0.062, 0.012, 'forearmL');
    limb(J.wristL, J.handTipL, 0.014, 0.00168, 'handL');
    limb(J.shoulderR, J.elbowR, 0.086, 0.066, 'upperArmR');
    limb(J.elbowR, J.wristR, 0.062, 0.012, 'forearmR');
    limb(J.wristR, J.handTipR, 0.014, 0.00168, 'handR');
    // legs — taper to a pointed toe
    limb(J.hipL, J.kneeL, 0.120, 0.084, 'thighL');
    limb(J.kneeL, J.ankleL, 0.080, 0.013, 'shinL');
    limb(J.ankleL, J.toeL, 0.016, 0.00192, 'footL');
    limb(J.hipR, J.kneeR, 0.120, 0.084, 'thighR');
    limb(J.kneeR, J.ankleR, 0.080, 0.013, 'shinR');
    limb(J.ankleR, J.toeR, 0.016, 0.00192, 'footR');
    // elongated featureless ovoid head (geodesic icosphere → dense holographic
    // mesh, no face); its base sits at the neck-top joint so it skins to `head`.
    const hg = new THREE.IcosahedronGeometry(0.225, TIER.headDetail);
    hg.scale(0.88, 1.7, 0.88);
    hg.translate(0, J.headBase.y + 0.225 * 1.7, 0);   // ovoid centre above the joint
    if (!hg.index) {                                   // Polyhedron geom is non-indexed → give it a trivial index
      const c = hg.attributes.position.count;
      const hi = new Uint32Array(c);
      for (let i = 0; i < c; i++) hi[i] = i;
      hg.setIndex(new THREE.BufferAttribute(hi, 1));
    }
    parts.push(hg);
    segs.push({ bone: bones.head.userData.idx, ax: J.headBase.x, ay: J.headBase.y, az: J.headBase.z, bx: J.headTop.x, by: J.headTop.y, bz: J.headTop.z });

    geo = mergeParts(parts);
    disposables.push(geo);
    const positions = geo.attributes.position.array;
    vertCount = geo.attributes.position.count;
    triCount = geo.index.count / 3;

    // skin weights (smooth joint blend, top-4 per vertex)
    const { skinIndex, skinWeight } = computeSkin(positions, segs);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

    // ── skinned meshes: fluid wireframe core + dim halo (one draw each) ──
    // Bind order: rig placed & world-matrix current FIRST, so both the bone
    // inverse-binds and the mesh bindMatrix capture the same static rig space.
    rig.updateMatrixWorld(true);
    skeleton = new THREE.Skeleton(boneList);

    const coreMesh = new THREE.SkinnedMesh(geo, coreMat);
    coreMesh.frustumCulled = false;   // skinned bounds move; don't let it cull out
    rig.add(coreMesh);
    coreMesh.bind(skeleton);

    // (Halo shell removed: the 1.02× second SkinnedMesh read as a doubled ghost
    // outline — "two figures" — and the probe points already carry the glow.)

    // ── "probe points": a POINT CLOUD skinned to the SAME vertices ──────────
    // THREE.Points is not skinned by default, so this ShaderMaterial replicates
    // three.js's skinning math manually: the skeleton's bone matrices are fed in
    // as a small `mat4[NB]` uniform (only ~22 bones) and indexed by the shared
    // skinIndex/skinWeight attributes, with the core mesh's bindMatrix /
    // bindMatrixInverse. The dots therefore ride the surface fluidly — a
    // holographic scan of glowing probe points over the deforming wireframe.
    const NB = boneList.length;
    const pr = renderer.getPixelRatio();
    pointsMat = new THREE.ShaderMaterial({
      uniforms: {
        boneMatrices: { value: skeleton.boneMatrices },   // Float32Array, updated in place each frame
        bindMatrix: { value: coreMesh.bindMatrix },
        bindMatrixInverse: { value: coreMesh.bindMatrixInverse },
        uSize: { value: 2.6 * pr },
        uColor: { value: new THREE.Color(0x8af7ff) },
        uOpacity: { value: 0.14 },
      },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
      vertexShader: `
        #define NB ${NB}
        uniform mat4 boneMatrices[NB];
        uniform mat4 bindMatrix;
        uniform mat4 bindMatrixInverse;
        uniform float uSize;
        attribute vec4 skinIndex;
        attribute vec4 skinWeight;
        void main() {
          mat4 bx = boneMatrices[int(skinIndex.x)];
          mat4 by = boneMatrices[int(skinIndex.y)];
          mat4 bz = boneMatrices[int(skinIndex.z)];
          mat4 bw = boneMatrices[int(skinIndex.w)];
          vec4 sv = bindMatrix * vec4(position, 1.0);
          vec4 sk = bx * sv * skinWeight.x + by * sv * skinWeight.y + bz * sv * skinWeight.z + bw * sv * skinWeight.w;
          vec3 tformed = (bindMatrixInverse * sk).xyz;
          vec4 mv = modelViewMatrix * vec4(tformed, 1.0);
          gl_PointSize = uSize;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = dot(c, c);
          if (d > 0.25) discard;               // round soft dot
          float a = 1.0 - d * 4.0;
          gl_FragColor = vec4(uColor, a * a * uOpacity);
        }
      `,
    });
    disposables.push(pointsMat);
    // DECIMATE the probe cloud — at full density (~29k verts) the additive dots
    // overlap on the thin tube silhouettes and wash to a pale film. Keep ~1 in
    // STRIDE vertices so they read as DISTINCT glowing probe points (holographic
    // scan) across the whole figure, still skinned to the same bones. The
    // high-poly SURFACE (wireframe/skin) stays full-res for fluid deformation.
    const STRIDE = 5;
    const sp = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const nSrc = sp.count, keep = Math.ceil(nSrc / STRIDE);
    const pPos = new Float32Array(keep * 3), pSI = new Float32Array(keep * 4), pSW = new Float32Array(keep * 4);
    let j = 0;
    for (let i = 0; i < nSrc; i += STRIDE) {
      pPos[j * 3] = sp.getX(i); pPos[j * 3 + 1] = sp.getY(i); pPos[j * 3 + 2] = sp.getZ(i);
      pSI[j * 4] = si.getX(i); pSI[j * 4 + 1] = si.getY(i); pSI[j * 4 + 2] = si.getZ(i); pSI[j * 4 + 3] = si.getW(i);
      pSW[j * 4] = sw.getX(i); pSW[j * 4 + 1] = sw.getY(i); pSW[j * 4 + 2] = sw.getZ(i); pSW[j * 4 + 3] = sw.getW(i);
      j++;
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pPos.subarray(0, j * 3), 3));
    pgeo.setAttribute('skinIndex', new THREE.BufferAttribute(pSI.subarray(0, j * 4), 4));
    pgeo.setAttribute('skinWeight', new THREE.BufferAttribute(pSW.subarray(0, j * 4), 4));
    disposables.push(pgeo);
    points = new THREE.Points(pgeo, pointsMat);
    points.frustumCulled = false;
    rig.add(points);

    // ── camera: TALL/NARROW canvas → frame the full figure vertically.
    // Dimensions match the old rig exactly, so the previously-tuned framing is
    // preserved unchanged (retune only if the silhouette were to change). ──
    camera = new THREE.PerspectiveCamera(38, 0.5, 0.1, 100);
    camera.position.set(0, 0.05, 8.4);
    camera.lookAt(0, -0.05, 0);

    sizeToCanvas();
  }

  // Size the renderer + camera aspect to the canvas's CSS box (client px).
  function sizeToCanvas() {
    if (!renderer || !camera) return;
    const w = canvas.clientWidth || 180;
    const h = canvas.clientHeight || 520;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ── energy + beat, from the repo's existing offline envelope engine ──────
  // Read the lightshow's already-smoothed energy; if the lightshow floored /
  // never ran, synthesize a calm idle breath so the figure still grooves.
  function readRawEnergy(t) {
    const ls = appState.lightshow;
    if (ls && typeof ls.energy === 'number') return ls.energy;
    return 0.28 + 0.06 * Math.sin(t * 0.5);   // idle breath (raised baseline) when the lightshow is absent
  }

  // Adaptive energy-flux beat detector on the RAW signal (the lightshow's
  // `energy` is already smoothed, so we derive our own onset here). Refractory
  // via the `beat < 0.2` gate; brightness never reads from this.
  function updateBeat(rawE) {
    const flux = Math.max(0, rawE - prevFast);
    prevFast = rawE;
    energySlow += (rawE - energySlow) * 0.02;
    if (rawE > energySlow * 0.9 + 0.06 && flux > 0.05 && beat < 0.2) beat = 1;
    beat *= 0.86;
  }

  // ── BPM sync (adapted from zhaojw1998/Real-Time-Music-Driven-Dancing-Robot) ──
  // That robot ran madmom's DBN beat-tracker live and time-scaled motion frames
  // onto the beat (spb/fpb) with a PID re-sync. We already have the OFFLINE
  // envelope (per-track energy + onsets) AND an authoritative clock
  // (audio.currentTime), so we skip live DSP + PID: estimate a fixed BPM per
  // track by AUTOCORRELATING the energy envelope (robust for 4-on-the-floor
  // techno), phase-align the beat grid to the onsets, then derive the beat phase
  // analytically from currentTime — drift-free by construction.
  function analyzeEnv(fps, env, onsets) {
    const minBPM = 100, maxBPM = 160;                    // techno band → also fixes octave
    const lagMin = Math.max(1, Math.round(fps * 60 / maxBPM));
    const lagMax = Math.round(fps * 60 / minBPM);
    let mean = 0; for (let i = 0; i < env.length; i++) mean += env[i]; mean /= env.length || 1;
    let bestLag = lagMin, bestR = -Infinity;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let r = 0;
      for (let k = 0; k + lag < env.length; k++) r += (env[k] - mean) * (env[k + lag] - mean);
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    const beatPeriod = bestLag / fps;
    // phase-align the grid {t0 + n*beatPeriod} to the onset times (max overlap)
    let t0 = (onsets && onsets.length) ? onsets[0] % beatPeriod : 0;
    if (onsets && onsets.length > 4) {
      const STEPS = 32; let bestPhi = 0, bestS = -Infinity;
      for (let s = 0; s < STEPS; s++) {
        const phi = s / STEPS * beatPeriod; let sum = 0;
        for (let i = 0; i < onsets.length; i++) sum += Math.cos(2 * Math.PI * (onsets[i] - phi) / beatPeriod);
        if (sum > bestS) { bestS = sum; bestPhi = phi; }
      }
      t0 = bestPhi;
    }
    return { beatPeriod, bpm: 60 / beatPeriod, t0 };
  }
  fetch('assets/audio/techno/envelopes.json').then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !j.tracks) return;
    ENV = j;
    for (const name in j.tracks) {
      const tr = j.tracks[name];
      if (tr && tr.env && tr.env.length) trackInfo[name] = analyzeEnv(j.fps || 25, tr.env, tr.onsets || []);
    }
  }).catch(() => {});

  // Returns the gesture-phase RATE (Hz) + the on-beat accent for `now`. When the
  // music is playing and its track is analysed, the rate is BPM-locked (a full
  // gesture spans N_BEATS beats) and the accent spikes on each beat; otherwise a
  // slow free-run idle with no phantom beat. Rate-based (not absolute) so play/
  // pause never snaps the phase.
  function musicClock() {
    const m = appState.music, a = m && m.audio;
    const playing = !!(a && !m.paused && !a.paused && a.currentTime > 0.05);
    const info = playing && a._trackName && trackInfo[a._trackName];
    if (info) {
      const beatPos = (a.currentTime - info.t0) / info.beatPeriod;
      const beatPhase = beatPos - Math.floor(beatPos);   // 0 = on the beat
      return { rateHz: 1 / (N_BEATS * info.beatPeriod), accent: Math.pow(1 - beatPhase, 4) };
    }
    // idle free-run (no music yet): keep it LIVELY so it visibly dances even
    // before any track plays (~one gesture every ~2.4s), no beat accent.
    return { rateHz: 0.42 + energy * 0.15, accent: 0 };
  }

  // ── the dance ────────────────────────────────────────────────────────
  // Everything is DAMPED toward a target each frame (factor k, framerate-aware)
  // so the figure grooves smoothly and never snaps or seizures. Ranges are kept
  // inside safe limits so no bone clips through another. The bones ARE the rig
  // now (THREE.Bone), so `bone.rotation.x/y/z` drives GPU skinning → the whole
  // continuous surface bends fluidly around each joint. Gesture math unchanged.
  function dance(dt, t) {
    const b = bones;
    const k = 1 - Math.pow(0.001, dt);         // framerate-independent damping
    // SLOW, weighty tempo — the Anyma "Genesys" figure moves like an awakening
    // statue (contemporary dance), NOT a club bounce. Motion is a cycle of
    // emotive GESTURES: arms drawing up toward the face/chest with deep elbows
    // (hands-to-face / self-embrace), a slow torso curl-and-uncurl, weight
    // shifts — all large, flowing, damped. (Ref: Anyma – Syren, lIdrRRofKm0.)
    // `phase` is advanced in frame() at the BPM-locked rate (musicClock) so the
    // gesture TEMPO matches the music; a full gesture spans N_BEATS beats.
    const A = 0.7 + energy * 0.5;              // gesture reach scales with energy
    const hit = beatAccent * (0.45 + energy * 0.5);  // music-locked on-beat accent
    const p = phase;

    const tgt = (euler, axis, target) => { euler[axis] += (target - euler[axis]) * k; };
    const set = (vec, axis, target) => { vec[axis] += (target - vec[axis]) * k; };
    const add = (obj, axis, extra) => { obj[axis] += extra * k * 3; };

    // gesture drivers (0..1), slow. reachL/R rise+fall out of phase so the arms
    // alternate/overlap; `curl` is the slow torso breathing undulation.
    const reachL = 0.5 - 0.5 * Math.cos(p);
    const reachR = 0.5 - 0.5 * Math.cos(p + 2.1);
    const curl = 0.5 - 0.5 * Math.cos(p * 0.5);

    // pelvis: a slow sink/rise (breathing) + gentle weight shift — no bounce
    set(b.pelvis.position, 'y', 0.12 - curl * 0.06 * A);
    set(b.pelvis.position, 'x', Math.sin(p * 0.5) * 0.10 * A);
    tgt(b.pelvis.rotation, 'z', Math.sin(p * 0.5) * 0.10 * A);
    tgt(b.pelvis.rotation, 'y', Math.sin(p * 0.5 + 0.5) * 0.14 * A);

    // torso: slow curl forward and uncurl — an awakening undulation
    tgt(b.spine.rotation, 'x', 0.10 + curl * 0.22 * A);
    tgt(b.spine.rotation, 'y', -Math.sin(p * 0.5) * 0.12 * A);
    tgt(b.chest.rotation, 'x', 0.06 + curl * 0.16 * A);
    tgt(b.chest.rotation, 'z', Math.sin(p * 0.5) * 0.08 * A);

    // ARMS: slow draw UP toward the head/chest with deepening elbows (hands-to-
    // face / self-embrace), then release down. Asymmetric L↔R. Elbows always
    // bent (never hyperextend).
    tgt(b.upperArmL.rotation, 'z', 0.15 + reachL * 0.65 * A);
    tgt(b.upperArmL.rotation, 'x', 0.20 + reachL * 1.05 * A);
    tgt(b.forearmL.rotation, 'x', -0.6 - reachL * 1.15 * A);
    tgt(b.upperArmR.rotation, 'z', -(0.15 + reachR * 0.65 * A));
    tgt(b.upperArmR.rotation, 'x', 0.20 + reachR * 1.05 * A);
    tgt(b.forearmR.rotation, 'x', -0.6 - reachR * 1.15 * A);

    // legs: planted, weighted stance with a tiny sway (the figure is grounded/
    // crouched, not stepping). Knees bend one way only.
    tgt(b.thighL.rotation, 'x', 0.05 + Math.sin(p * 0.5) * 0.05 * A);
    tgt(b.thighR.rotation, 'x', 0.08 - Math.sin(p * 0.5) * 0.05 * A);
    tgt(b.shinL.rotation, 'x', 0.06);
    tgt(b.shinR.rotation, 'x', 0.09);

    // head: bows into the gesture as the arms reach up (looking into the hands),
    // lifts as they lower; slow drift + secondary motion.
    headTrail += (b.chest.rotation.x - headTrail) * 0.06;
    tgt(b.head.rotation, 'x', 0.05 + Math.max(reachL, reachR) * 0.32 * A);
    tgt(b.head.rotation, 'y', Math.sin(t * 0.11) * 0.08);
    tgt(b.head.rotation, 'z', Math.sin(p * 0.5 + 0.4) * 0.06 * A);

    // ON-BEAT accent — MUSIC-LOCKED (beatAccent spikes on each beat). A weighted
    // pulse (knee dip + body sink + head) so the TEMPO is felt on the beat, not a
    // club bounce. MOTION only (flash-safe — brightness never reads this).
    add(b.pelvis.position, 'y', -hit * 0.05);   // sink on the beat
    add(b.thighL.rotation, 'x', hit * 0.10);    // knees dip
    add(b.thighR.rotation, 'x', hit * 0.10);
    add(b.shinL.rotation, 'x', hit * 0.10);
    add(b.shinR.rotation, 'x', hit * 0.10);
    add(b.spine.rotation, 'x', hit * 0.06);
    add(b.head.rotation, 'x', hit * 0.07);

    // slow 3/4 sway of the whole figure (never flat-on) — via the skeleton root
    tgt(b.root.rotation, 'y', Math.sin(p * 0.5) * 0.12);
  }

  // ── main loop ──────────────────────────────────────────────────────────
  let last = 0;
  function frame(ts) {
    if (!running || dead) return;
    const now = ts / 1000;
    let dt = last ? now - last : 0.016;
    dt = Math.min(dt, 1 / 30);      // clamp so a background pause can't lurch the pose
    last = now;

    // energy: read raw (music envelope or idle), smooth, derive beat
    const rawE = readRawEnergy(now);
    energy += (rawE - energy) * 0.12;
    updateBeat(rawE);

    // Advance the gesture phase at the BPM-locked rate (a full gesture spans
    // N_BEATS beats), and capture the on-beat accent — so movement matches BPM.
    const clk = musicClock();
    phase += clk.rateHz * dt * 2 * Math.PI;
    beatAccent = clk.accent;

    dance(dt, now);

    // Refresh bone world matrices → skeleton bone matrices BEFORE render, so the
    // (non-SkinnedMesh) probe-point shader reads a current boneMatrices uniform
    // regardless of draw order. GPU skinning does the per-vertex work.
    rig.updateMatrixWorld(true);
    skeleton.update();

    // FLASH SAFETY: brightness (opacity) tracks SLOW energy only, eased at a
    // capped rate. NEVER pulse opacity from `beat` — beats move the body, they
    // do not flash the light.
    // LOW per-line alpha (dense high-poly mesh) so additive overlap never blows
    // out to a soft blob in compact poses — crisp wireframe at every pose.
    // The surface is very high-poly, so a bright wireframe additively saturates
    // into a solid pale blob. Keep the wireframe FAINT (structural hint only) and
    // let the PROBE POINTS carry the figure as a glowing cyan point-cloud (a
    // dense point cloud stays crisp — points don't overlap-accumulate like the
    // wire triangles). All opacity slow-energy driven (flash-safe), never beat.
    coreMat.opacity = 0.015 + energy * 0.02;       // near-invisible wire (structure hint)
    pointsMat.uniforms.uOpacity.value = 0.6 + energy * 0.3;     // probe points = the whole figure

    renderer.render(scene, camera);

    if (!live) { live = true; canvas.classList.add('is-live'); }  // CSS fades it in
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running && raf) return;
    if (dead) return;
    running = true; last = 0; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); raf = 0; }

  // ── lifecycle wiring ────────────────────────────────────────────────────
  try {
    build();
  } catch (e) {
    // teardown anything half-built and bail (no context left running)
    try { for (const g of disposables) g.dispose(); } catch (_) {}
    try { renderer && renderer.dispose(); } catch (_) {}
    dead = true;
    return;
  }

  // resize: prefer a ResizeObserver on the canvas (its CSS box drives us);
  // fall back to the window resize event where RO is unavailable.
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => sizeToCanvas());
    ro.observe(canvas);
  } else {
    window.addEventListener('resize', sizeToCanvas, { passive: true });
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });

  appState.dancer = {
    start, stop,
    // live diagnostics (also handy for tuning): current locked BPM + on-beat pulse
    get bpm() { const a = appState.music && appState.music.audio; const i = a && trackInfo[a._trackName]; return i ? Math.round(i.bpm) : 0; },
    get beatAccent() { return +beatAccent.toFixed(2); },
    get locked() { const m = appState.music, a = m && m.audio; return !!(a && !m.paused && !a.paused && a.currentTime > 0.05 && trackInfo[a._trackName]); },
    // geometry diagnostics (skinned high-poly budget for the chosen detail tier)
    get tris() { return triCount; },
    get verts() { return vertCount; },
    get phase() { return +phase.toFixed(2); },
    get energy() { return +energy.toFixed(2); },
  };

  raf = requestAnimationFrame(frame);
}
