// ── Portable humanoid retargeting engine (zero runtime dependencies) ─────────
//
// WHY THIS EXISTS
// The kinetic dancer duet drives rigged glTF humanoids with a shared procedural
// choreography (see kinetic-dancer.js MOVE_TABLE). Porting a NEW model onto that
// choreography used to mean hand-tuning, per bone per rig, an axis-remap and a
// rest offset, discovered by rotating one axis at a time and screenshotting the
// result (this is how the fairy-punk rig's `armZSign` flip and its arm rest
// offsets were found). That trial-and-error is exactly what this module removes.
//
// The design follows what Unity's Humanoid Avatar, the VRM humanoid bone spec,
// and @pixiv/three-vrm's "normalized bones" all converge on:
//   (a) a STANDARD set of named joint ROLES with semantic meaning (not the raw
//       node names a given model happens to use), a small required core plus
//       clearly-defined OPTIONAL roles (spine subdivisions, shoulders, hands,
//       fingers, toes, tail/accessory segments) that a simpler rig omits and a
//       richer rig can drive for extra flourish, with graceful degradation;
//   (b) rest/bind-pose CAPTURE from the loaded model, so the delta between the
//       rig's actual bone frame and a canonical anatomical frame is computed
//       MATHEMATICALLY (a quaternion change-of-basis) rather than guessed; and
//   (c) an authoring space (the "proxy" layer) that is identical for every rig,
//       so one move runs unchanged across rigs of different joint counts.
//
// TWO RETARGET MODES per bone:
//   • EXPLICIT  - honour a hand-supplied { rest, mx, my, mz } hint. This path is
//     bit-identical to the original inline applyRig math, so the two shipping
//     rigs (Armadrillo, fairy-punk) keep their exact, screenshot-verified look
//     with ZERO regression. It is the safe path and the migration bridge.
//   • ANALYTIC  - derive the canonical->local axis mapping from the captured
//     bind pose (a change-of-basis quaternion qCorr, see deriveBodyFrame /
//     buildAdapter). This is the portable path: a new rig needs only a role ->
//     bone-name map, no per-axis sign hunting.
//
// HONEST SCOPE (matches the retargeting literature, see the research notes in
// the PR): the analytic path removes the AXIS-SIGN trial-and-error. It does NOT
// remove every manual input. Rest-pose normalization (e.g. bringing a T-pose
// arm down to a hanging rest) stays a declared, semantic `rest` hint because it
// encodes a bind pose that is not the canonical rest - a case every mature
// system (Unity, VRM, Mixamo) also delegates to a human "put the model in a
// clean T-pose" step. Bone-roll about the limb axis, leaf bones with no child
// to point down, and negative-scale mirrored sides are the other genuine
// residuals. See deriveBodyFrame's comments for exactly where each lands.

// ── Role schema ──────────────────────────────────────────────────────────────
// Each role: { core, parent, side, group, heavy, axisDir }.
//  core   - true for the required set (present on essentially every biped); the
//           12 shipping moves only ever touch core roles, so they run identically
//           on any rig that provides the core.
//  parent - the role this bone hangs off in the canonical hierarchy (for the
//           analytic body-frame walk and for future IK). null = root (pelvis).
//  heavy  - spring-damper profile hint: heavy joints carry skinned secondary
//           geometry (hair on Head, wings/ornament on Chest) and get real
//           momentum/overshoot; see kinetic-dancer.js springStep.
//  axisDir- the bone's canonical "point down the limb toward its child"
//           direction, in the canonical anatomical frame (X = body right,
//           Y = up toward head, Z = body forward). Used by the analytic path to
//           sanity-check the captured child direction; omitted for the torso
//           stack where the direction is simply +Y (toward the head).
//
// OPTIONAL roles are listed but a rig omitting them simply gets no adapter for
// them: the proxy still exists (so a move can write to it unconditionally) and
// the write is a free no-op. That is the graceful-degradation contract.
export const HUMANOID_ROLES = {
  // ── core torso + head ──
  pelvis: { core: true, parent: null, group: 'torso', axisDir: [0, 1, 0] },
  spine: { core: true, parent: 'pelvis', group: 'torso', heavy: true, axisDir: [0, 1, 0] },
  chest: { core: true, parent: 'spine', group: 'torso', heavy: true, axisDir: [0, 1, 0] },
  neck: { core: true, parent: 'chest', group: 'torso', heavy: true, axisDir: [0, 1, 0] },
  head: { core: true, parent: 'neck', group: 'torso', heavy: true, axisDir: [0, 1, 0] },
  // ── core arms ──
  upperArmL: { core: true, parent: 'chest', side: 'L', group: 'arm', axisDir: [1, 0, 0] },
  forearmL: { core: true, parent: 'upperArmL', side: 'L', group: 'arm', axisDir: [1, 0, 0] },
  upperArmR: { core: true, parent: 'chest', side: 'R', group: 'arm', axisDir: [-1, 0, 0] },
  forearmR: { core: true, parent: 'upperArmR', side: 'R', group: 'arm', axisDir: [-1, 0, 0] },
  // ── core legs ──
  thighL: { core: true, parent: 'pelvis', side: 'L', group: 'leg', axisDir: [0, -1, 0] },
  shinL: { core: true, parent: 'thighL', side: 'L', group: 'leg', axisDir: [0, -1, 0] },
  thighR: { core: true, parent: 'pelvis', side: 'R', group: 'leg', axisDir: [0, -1, 0] },
  shinR: { core: true, parent: 'thighR', side: 'R', group: 'leg', axisDir: [0, -1, 0] },

  // ── OPTIONAL: torso subdivisions (VRM upperChest / extra spine + neck) ──
  spine2: { core: false, parent: 'spine', group: 'torso', heavy: true, axisDir: [0, 1, 0] },
  upperChest: { core: false, parent: 'chest', group: 'torso', heavy: true, axisDir: [0, 1, 0] },
  neck2: { core: false, parent: 'neck', group: 'torso', heavy: true, axisDir: [0, 1, 0] },
  // ── OPTIONAL: shoulders (clavicles) ──
  shoulderL: { core: false, parent: 'chest', side: 'L', group: 'arm', axisDir: [1, 0, 0] },
  shoulderR: { core: false, parent: 'chest', side: 'R', group: 'arm', axisDir: [-1, 0, 0] },
  // ── OPTIONAL: hands + feet extremities ──
  handL: { core: false, parent: 'forearmL', side: 'L', group: 'arm', axisDir: [1, 0, 0] },
  handR: { core: false, parent: 'forearmR', side: 'R', group: 'arm', axisDir: [-1, 0, 0] },
  footL: { core: false, parent: 'shinL', side: 'L', group: 'leg', axisDir: [0, 0, 1] },
  footR: { core: false, parent: 'shinR', side: 'R', group: 'leg', axisDir: [0, 0, 1] },
  toesL: { core: false, parent: 'footL', side: 'L', group: 'leg', axisDir: [0, 0, 1] },
  toesR: { core: false, parent: 'footR', side: 'R', group: 'leg', axisDir: [0, 0, 1] },
  // ── OPTIONAL: fingers (thumb + 4, three segments each, both hands) ──
  //   named <side><finger><segment>, e.g. thumbLProx. A move can curl a whole
  //   hand by writing all present finger proxies; absent ones no-op.
  ...fingerRoles(),
  // ── OPTIONAL: accessory chains (tail, wing, antenna) - arbitrary extension.
  //   These have no fixed anatomy, so the analytic path derives their frame
  //   purely from captured child direction (see buildAdapter).
  tailBase: { core: false, parent: 'pelvis', group: 'accessory', heavy: true, axisDir: [0, 0, -1] },
  tailMid: { core: false, parent: 'tailBase', group: 'accessory', heavy: true, axisDir: [0, 0, -1] },
  tailTip: { core: false, parent: 'tailMid', group: 'accessory', heavy: true, axisDir: [0, 0, -1] },
};

function fingerRoles() {
  const out = {};
  const fingers = ['thumb', 'index', 'middle', 'ring', 'little'];
  const segs = ['Prox', 'Mid', 'Dist'];
  for (const side of ['L', 'R']) {
    for (const f of fingers) {
      let parent = side === 'L' ? 'handL' : 'handR';
      for (const s of segs) {
        const role = f + side + s;
        out[role] = { core: false, parent, side, group: 'finger', axisDir: side === 'L' ? [1, 0, 0] : [-1, 0, 0] };
        parent = role;
      }
    }
  }
  return out;
}

// The required core, in a stable order (proxy allocation + framing iterate it).
export const CORE_ROLES = Object.keys(HUMANOID_ROLES).filter((r) => HUMANOID_ROLES[r].core);
export const ALL_ROLES = Object.keys(HUMANOID_ROLES);

// GLTFLoader SANITIZES node names on import: a space becomes an underscore, but
// a DOT is DROPPED entirely (confirmed empirically: "UpperArm.L" imports as
// "UpperArmL", not "UpperArm_L"). Normalize both the model's node names and the
// role -> name map through this so lookups match regardless of the source
// naming convention (Blender dots vs Sketchfab spaces).
export function normalizeBoneName(s) {
  return String(s).replace(/\s/g, '_').replace(/\./g, '');
}

// Resolve role -> THREE.Bone from a { role: sourceName } map, tolerant of the
// GLTFLoader name sanitization above.
export function mapBones(model, nameOf) {
  const wanted = {};
  for (const role in nameOf) wanted[normalizeBoneName(nameOf[role])] = role;
  const boneByRole = {};
  model.traverse((o) => {
    if (!o.isBone) return;
    const role = wanted[o.name];
    if (role) boneByRole[role] = o;
  });
  return boneByRole;
}

// ── proxy layer (the rig-agnostic authoring space) ───────────────────────────
// One proxy { rotation:Euler, position:Vector3 } PER SCHEMA ROLE, present in the
// model or not. dance() writes here; the adapter converts present roles to real
// bones. Allocating every schema role (not just the ones a rig has) is what lets
// a single move write `b.upperChest.rotation.z = ...` unconditionally: on a rig
// without an upperChest bone there is simply no adapter, so the write is a free
// no-op. `heavy` axes are tagged for the spring integrator's underdamped profile.
export function createProxyRig(THREE, roleNames) {
  const roles = roleNames || ALL_ROLES;
  const proxies = {};
  for (const role of roles) {
    const meta = HUMANOID_ROLES[role] || {};
    const rotation = new THREE.Euler(0, 0, 0, 'XYZ');
    const position = new THREE.Vector3();
    if (meta.heavy) { rotation.__heavy = true; position.__heavy = true; }
    proxies[role] = { rotation, position };
  }
  return proxies;
}

// ── analytic derivation: the model's canonical body frame (for reporting) ────
// The canonical anatomical frame: X = body RIGHT, Y = UP toward the head,
// Z = body FORWARD. Derived from the rig's own landmark bones' rest WORLD
// positions (UP from pelvis->head, RIGHT from left->right arm root, FORWARD from
// their cross product, re-orthogonalized). The per-bone axis derivation below
// does NOT depend on this (it uses each bone's child direction, which is the
// robust cross-rig method), but the body frame is a useful whole-rig sanity
// signal in the report (e.g. is the rig even upright/facing consistently).
// Returns a THREE.Quaternion mapping canonical axes into world, or null.
export function deriveBodyFrame(THREE, boneByRole) {
  const { pelvis, head, neck, chest, upperArmL, upperArmR } = boneByRole;
  const topBone = head || neck || chest;
  if (!pelvis || !topBone) return null;
  const v = () => new THREE.Vector3();
  const pPelvis = v(), pTop = v(), pL = v(), pR = v();
  pelvis.getWorldPosition(pPelvis);
  topBone.getWorldPosition(pTop);
  const up = pTop.clone().sub(pPelvis);
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();

  let right = null;
  if (upperArmL && upperArmR) {
    upperArmL.getWorldPosition(pL);
    upperArmR.getWorldPosition(pR);
    right = pR.clone().sub(pL);              // left -> right = +X body right
    if (right.lengthSq() < 1e-8) right = null;
  }
  if (!right) right = new THREE.Vector3(1, 0, 0);
  const forward = up.clone().cross(right).normalize();
  if (forward.lengthSq() < 1e-8) return null;
  const rightO = forward.clone().cross(up).normalize();
  const m = new THREE.Matrix4().makeBasis(rightO, up, forward);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// The rest direction from a bone to its child, expressed in the bone's OWN LOCAL
// frame (a unit vector), or null if no usable child. Requires world matrices to
// be current (buildRig calls model.updateMatrixWorld first).
export function childDirLocal(THREE, bone, childBone) {
  if (!childBone) return null;
  const bw = bone.getWorldPosition(new THREE.Vector3());
  const cw = childBone.getWorldPosition(new THREE.Vector3());
  const dirWorld = cw.sub(bw);
  if (dirWorld.lengthSq() < 1e-10) return null;
  dirWorld.normalize();
  const invW = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  return dirWorld.applyQuaternion(invW).normalize();
}

// ── adapter build (per mapped bone) ──────────────────────────────────────────
// hint (optional, per role): { rest:{x,y,z}, mx:[axis,sign], my, mz } forces the
// EXPLICIT path (bit-identical to the original inline math). Without an axis-map
// hint, the ANALYTIC path derives qCorr from the captured rest so canonical
// rotations map into the bone's own local axes with no manual sign hunting.
// `childBone` is this bone's child in the driven hierarchy (used to derive the
// bone's actual "point down the limb" direction). A `rest` hint may still be
// supplied WITHOUT mx/my/mz to keep the analytic axis derivation while declaring
// a semantic rest-pose normalization (e.g. T-pose arms -> hanging).
export function buildAdapter(THREE, role, bone, proxy, opts) {
  const hint = (opts && opts.hint) || null;
  const childBone = opts && opts.childBone;
  const bindQ = bone.quaternion.clone();
  const a = { role, bone, proxy, bindQ, mode: 'analytic' };

  const rest = (hint && hint.rest) || { x: 0, y: 0, z: 0 };
  a.rest = { x: rest.x || 0, y: rest.y || 0, z: rest.z || 0 };

  if (hint && (hint.mx || hint.my || hint.mz)) {
    // EXPLICIT: replicate the original applyRig exactly.
    a.mode = 'explicit';
    a.mx = hint.mx || ['x', 1];
    a.my = hint.my || ['y', 1];
    a.mz = hint.mz || ['z', 1];
    return a;
  }

  // ANALYTIC (research-endorsed per-bone method, cf. Mixamo/VRM):
  // qCorr maps a rotation authored in the CANONICAL bone frame into this bone's
  // own LOCAL frame. The canonical frame's primary axis is the direction the
  // bone SHOULD point toward its child (schema axisDir); the bone's ACTUAL
  // local pointing direction is measured from the captured rest (childDirLocal).
  //   qCorr = setFromUnitVectors(axisDir, dirLocal)   // r128: minimal-arc
  // so qCorr * axisDir = dirLocal. Then per frame:
  //   deltaLocal = qCorr * qCanon * qCorr^-1           // change of basis
  //   bone.quaternion = bindQ * restQ * deltaLocal.
  // For a bone whose local axis already points down its length in the canonical
  // sense (the common Blender +Y-down-the-bone case for torso/legs), dirLocal ==
  // axisDir so qCorr == identity and the analytic path COLLAPSES to the same
  // "apply the euler in local space" the explicit identity map used - it
  // recovers the hand mapping with zero tuning. For a rig authored with a
  // different local axis convention, qCorr rotates the choreography into place
  // automatically, which is the portability win. LIMITS (see the PR notes):
  //  - setFromUnitVectors fixes only where the bone POINTS, not its ROLL about
  //    that axis - so a bone with a nonstandard roll still needs a small manual
  //    correction (arms are the usual case);
  //  - a leaf bone (no child) has no direction to measure -> identity fallback;
  //  - rest-pose normalization (T-pose arm -> hanging) is a declared `rest`
  //    hint, not derived - a bind pose that is not the canonical rest is the one
  //    input every retargeter (Unity/VRM/Mixamo) leaves to a human.
  const meta = HUMANOID_ROLES[role] || {};
  const axisDir = meta.axisDir ? new THREE.Vector3(meta.axisDir[0], meta.axisDir[1], meta.axisDir[2]).normalize() : null;
  const dirLocal = axisDir ? childDirLocal(THREE, bone, childBone) : null;
  if (axisDir && dirLocal) {
    a.qCorr = new THREE.Quaternion().setFromUnitVectors(axisDir, dirLocal);
    a.derivedFrom = 'child-direction';
  } else {
    a.qCorr = new THREE.Quaternion();        // leaf / no schema axis: identity fallback
    a.derivedFrom = 'identity-fallback';
  }
  a.qCorrInv = a.qCorr.clone().invert();
  a.restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(a.rest.x, a.rest.y, a.rest.z, 'XYZ'));
  return a;
}

// Compute the target bone quaternion for one adapter given a proxy rotation
// (rx,ry,rz) into `out`, using `scratch` for temporaries. Pure: does NOT write
// the bone. applyAdapters and measureAutoVsManual share this so the live path
// and the validation path can never diverge.
export function computeBoneQuat(adapter, rx, ry, rz, scratch, out) {
  const e = scratch.e, q = scratch.q, q2 = scratch.q2;
  const a = adapter;
  if (a.mode === 'explicit') {
    // Bit-identical to the original inline applyRig math.
    const src = { x: rx, y: ry, z: rz };
    const lx = a.rest.x + a.mx[1] * src[a.mx[0]];
    const ly = a.rest.y + a.my[1] * src[a.my[0]];
    const lz = a.rest.z + a.mz[1] * src[a.mz[0]];
    e.set(lx, ly, lz, 'XYZ');
    q.setFromEuler(e);
    out.copy(a.bindQ).multiply(q);
  } else {
    // ANALYTIC: qCanon (authored rotation) -> change of basis -> local delta.
    e.set(rx, ry, rz, 'XYZ');
    q.setFromEuler(e);                                   // qCanon
    q2.copy(a.qCorr).multiply(q).multiply(a.qCorrInv);  // deltaLocal
    out.copy(a.bindQ).multiply(a.restQ).multiply(q2);
  }
  return out;
}

// ── per-frame apply (proxy rotations -> real bone quaternions) ───────────────
// scratch: { e:THREE.Euler, q, q2, out : THREE.Quaternion } reused so there is
// no per-frame allocation (matches the original hot loop).
export function applyAdapters(adapters, scratch) {
  for (let i = 0; i < adapters.length; i++) {
    const a = adapters[i];
    const r = a.proxy.rotation;
    computeBoneQuat(a, r.x, r.y, r.z, scratch, a.bone.quaternion);
  }
}

// Angle (radians) between two unit quaternions (orientation distance).
export function quatAngle(qa, qb) {
  let d = qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w;
  d = Math.min(1, Math.abs(d));
  return 2 * Math.acos(d);
}

// ── whole rig assembly ───────────────────────────────────────────────────────
// One call builds everything the render loop needs from a loaded model + a
// role->name map + optional per-role hints. Returns adapters, the pelvis
// translation binding, the resolved bone map, and a `report` describing which
// roles were driven and (for analytic bones) how far the derived correction sat
// from an identity mapping - the honest measure of what the auto path recovered.
export function buildRig(THREE, opts) {
  const { model, nameOf, hints = {}, proxies } = opts;
  // Which roles to actually ANIMATE. Defaults to the core set. Kept separate
  // from `nameOf` because a rig may MAP extra bones purely so framing/fit can
  // measure the true silhouette (the Armadrillo maps shoulders/hands/feet for
  // this reason) without those bones being driven by the choreography.
  const driveRoles = opts.driveRoles || CORE_ROLES;
  const driveSet = new Set(driveRoles);

  const boneByRole = mapBones(model, nameOf);
  // The analytic path reads WORLD rest orientations (bone frame relative to the
  // model), so the model's world matrices must be current. The model need not be
  // attached to the live scene graph yet: any common parent transform cancels in
  // the qCorr = Rw^-1 * bodyFrameQ change-of-basis, so updating relative to the
  // model root is sufficient. Harmless for the explicit path (it uses only the
  // local bind quaternion).
  model.updateMatrixWorld(true);
  const bodyFrameQ = deriveBodyFrame(THREE, boneByRole);
  const adapters = [];
  const report = { driven: [], missing: [], analytic: [], explicit: [], bodyFrame: !!bodyFrameQ };

  // For each role, its child bone in the CANONICAL hierarchy (first schema role
  // whose parent is this role and which the model actually provides). Used by
  // the analytic path to measure the bone's real pointing direction.
  const childOf = {};
  for (const r of ALL_ROLES) {
    const p = HUMANOID_ROLES[r].parent;
    if (p && boneByRole[r] && !childOf[p]) childOf[p] = boneByRole[r];
  }

  // Build an adapter for every DRIVEN role the model provides; preserve schema
  // order for determinism.
  for (const role of ALL_ROLES) {
    if (!driveSet.has(role)) continue;
    const bone = boneByRole[role];
    if (!bone) { report.missing.push(role); continue; }
    const proxy = proxies[role];
    if (!proxy) continue;
    const adapter = buildAdapter(THREE, role, bone, proxy, { hint: hints[role], childBone: childOf[role] });
    adapters.push(adapter);
    report.driven.push(role);
    if (adapter.mode === 'analytic') {
      report.analytic.push(role);
      // angle of qCorr away from identity = how much the bone's rest frame
      // deviates from the canonical body frame (0 = already aligned).
      const w = Math.min(1, Math.abs(adapter.qCorr.w));
      adapter.corrAngleDeg = +(2 * Math.acos(w) * 180 / Math.PI).toFixed(1);
    } else {
      report.explicit.push(role);
    }
  }

  const pelvisBone = boneByRole.pelvis || null;
  const pelvisBind = pelvisBone ? pelvisBone.position.clone() : null;

  return { boneByRole, bodyFrameQ, adapters, pelvisBone, pelvisBind, report };
}

// ── honest measurement: auto-derived vs hand-tuned ───────────────────────────
// Given a model already wired with EXPLICIT (known-good, hand-tuned) adapters,
// build a SHADOW set of purely ANALYTIC adapters (no hints at all) for the same
// roles, and measure, over a set of probe proxy rotations, the worst-case
// angular disagreement per role between the auto-derived bone orientation and
// the hand-tuned one. This is the evidence for "how much of the manual axis
// tuning does the analytic path actually recover":
//   small angle  -> the auto path reproduces the human's choice (axis mapping
//                   was recoverable from the captured bind pose);
//   large angle  -> a residual the human still had to supply by hand (rest-pose
//                   normalization such as T-pose arms, or bone-roll offset).
// `probes` is an array of {x,y,z} proxy rotations to sweep. Non-destructive:
// only reads bind data already captured on the explicit adapters. Returns a
// per-role { corrAngleDeg, maxErrDeg, restErrDeg } table plus overall stats.
export function measureAutoVsManual(THREE, explicitAdapters, bodyFrameQ, probes) {
  const scratch = { e: new THREE.Euler(0, 0, 0, 'XYZ'), q: new THREE.Quaternion(), q2: new THREE.Quaternion() };
  const outE = new THREE.Quaternion(), outA = new THREE.Quaternion();
  // child bone per role, reconstructed from the driven adapters (same rule as
  // buildRig): the analytic derivation needs each bone's child direction.
  const boneOf = {};
  for (const ex of explicitAdapters) boneOf[ex.role] = ex.bone;
  const childOf = {};
  for (const r in HUMANOID_ROLES) {
    const p = HUMANOID_ROLES[r].parent;
    if (p && boneOf[r] && !childOf[p]) childOf[p] = boneOf[r];
  }
  const rows = {};
  let worst = 0, worstRole = null;
  for (const ex of explicitAdapters) {
    if (ex.mode !== 'explicit') continue;
    // shadow analytic adapter for the same bone, no hint (pure auto).
    const an = buildAdapter(THREE, ex.role, ex.bone, ex.proxy, { hint: null, childBone: childOf[ex.role] });
    const w = Math.min(1, Math.abs(an.qCorr.w));
    const corrAngleDeg = +(2 * Math.acos(w) * 180 / Math.PI).toFixed(1);
    // rest error: the hand-tuned rest offset the auto path does NOT attempt
    // (rest-pose normalization is a declared semantic input, not derived).
    const restMag = Math.hypot(ex.rest.x, ex.rest.y, ex.rest.z);
    let maxErr = 0;
    for (const p of probes) {
      computeBoneQuat(ex, p.x, p.y, p.z, scratch, outE);
      computeBoneQuat(an, p.x, p.y, p.z, scratch, outA);
      const err = quatAngle(outE, outA);
      if (err > maxErr) maxErr = err;
    }
    const maxErrDeg = +(maxErr * 180 / Math.PI).toFixed(1);
    rows[ex.role] = { corrAngleDeg, maxErrDeg, restErrDeg: +(restMag * 180 / Math.PI).toFixed(1) };
    if (maxErrDeg > worst) { worst = maxErrDeg; worstRole = ex.role; }
  }
  return { rows, worstRole, worstErrDeg: worst };
}

// Pelvis translation sway. The armature parent frame is Z-up (Blender default),
// so side = local X and up = local Z; kept as an explicit mapping because it is
// a translation, not a rotation, and the two shipping rigs share this frame.
export function applyPelvisSway(pelvisBone, pelvisBind, proxyPos, posScale) {
  if (!pelvisBone || !pelvisBind) return;
  pelvisBone.position.set(
    pelvisBind.x + proxyPos.x * posScale,   // side sway (local X)
    pelvisBind.y,                           // depth unchanged
    pelvisBind.z + proxyPos.y * posScale,   // vertical bob (up = local Z)
  );
}
