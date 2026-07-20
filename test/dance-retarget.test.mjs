// Unit tests for the portable retargeting engine (js/app/dance-retarget.js).
//
// The engine's ANALYTIC path (world-matrix capture, child-direction change of
// basis) is validated numerically in the browser harness against the two real
// glTF rigs; those checks need a full three.js + a loaded model. Here we cover
// the parts that are pure logic or need only quaternion algebra, with a small
// but CORRECT quaternion/euler shim: the role schema, tolerant bone-name
// mapping, proxy allocation + heavy tagging, graceful degradation, and - the
// regression-critical one - that the EXPLICIT mapping reproduces the original
// inline applyRig formula (bindQ · euler(rest + axisMap·proxy)) exactly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HUMANOID_ROLES, CORE_ROLES, ALL_ROLES,
  normalizeBoneName, mapBones, createProxyRig, buildAdapter, computeBoneQuat, quatAngle,
} from '../js/app/dance-retarget.js';

// ── minimal, correct quaternion/euler/vector shim (XYZ order, THREE semantics) ──
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Eul {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') { this.x = x; this.y = y; this.z = z; this.order = order; }
  set(x, y, z, order) { this.x = x; this.y = y; this.z = z; if (order) this.order = order; return this; }
}
class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quat(this.x, this.y, this.z, this.w); }
  setFromEuler(e) {
    const c1 = Math.cos(e.x / 2), c2 = Math.cos(e.y / 2), c3 = Math.cos(e.z / 2);
    const s1 = Math.sin(e.x / 2), s2 = Math.sin(e.y / 2), s3 = Math.sin(e.z / 2);
    this.x = s1 * c2 * c3 + c1 * s2 * s3;
    this.y = c1 * s2 * c3 - s1 * c2 * s3;
    this.z = c1 * c2 * s3 + s1 * s2 * c3;
    this.w = c1 * c2 * c3 - s1 * s2 * s3;
    return this;
  }
  multiply(q) {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = q.x, by = q.y, bz = q.z, bw = q.w;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
}
const THREE = { Euler: Eul, Vector3: V3, Quaternion: Quat };
const scratch = () => ({ e: new Eul(), q: new Quat(), q2: new Quat() });

// A fake bone with an arbitrary local rest quaternion (bindQ source).
function fakeBone(name, q = new Quat()) { return { isBone: true, name, quaternion: q.clone ? q : new Quat() }; }
function fakeModel(bones) { return { traverse(fn) { for (const b of bones) fn(b); } }; }

// ── schema ───────────────────────────────────────────────────────────────────
test('schema: core role set matches the choreography (13 required roles)', () => {
  assert.equal(CORE_ROLES.length, 13);
  for (const r of ['pelvis', 'spine', 'chest', 'neck', 'head',
    'upperArmL', 'forearmL', 'upperArmR', 'forearmR',
    'thighL', 'shinL', 'thighR', 'shinR']) {
    assert.ok(CORE_ROLES.includes(r), `core role ${r} present`);
    assert.equal(HUMANOID_ROLES[r].core, true);
  }
});

test('schema: optional roles exist and are extensible (spine subdiv, fingers, tail)', () => {
  for (const r of ['upperChest', 'spine2', 'shoulderL', 'handR', 'toesL', 'tailBase']) {
    assert.ok(r in HUMANOID_ROLES, `optional role ${r} present`);
    assert.equal(HUMANOID_ROLES[r].core, false);
  }
  // per-finger tube roles: 5 fingers x 3 segments x 2 hands = 30
  const fingerTubes = ALL_ROLES.filter((r) => /^(thumb|index|middle|ring|little)[LR](Prox|Mid|Dist)$/.test(r));
  assert.equal(fingerTubes.length, 30);
  assert.ok(ALL_ROLES.includes('thumbLProx') && ALL_ROLES.includes('littleRDist'));
  // combined finger-curl roles (a single grip bone per hand) — the honest
  // stand-in for a mitt with no separable finger geometry (fairy-punk uses these).
  for (const r of ['fingersL', 'fingersR']) {
    assert.ok(r in HUMANOID_ROLES, `combined finger-curl role ${r} present`);
    assert.equal(HUMANOID_ROLES[r].core, false);
    assert.equal(HUMANOID_ROLES[r].group, 'finger');
  }
});

test('schema: every parent reference resolves to a real role or null (valid hierarchy)', () => {
  for (const r of ALL_ROLES) {
    const p = HUMANOID_ROLES[r].parent;
    assert.ok(p === null || (p in HUMANOID_ROLES), `${r} parent ${p} is valid`);
  }
  assert.equal(HUMANOID_ROLES.pelvis.parent, null);
});

test('schema: heavy tag is on the joints that carry skinned secondary geometry', () => {
  for (const r of ['spine', 'chest', 'neck', 'head']) assert.equal(HUMANOID_ROLES[r].heavy, true);
  for (const r of ['pelvis', 'upperArmL', 'thighR', 'shinL']) assert.ok(!HUMANOID_ROLES[r].heavy);
});

// ── name mapping (GLTFLoader sanitization tolerance) ──────────────────────────
test('normalizeBoneName: spaces -> underscore, dots dropped', () => {
  assert.equal(normalizeBoneName('Left shoulder_028'), 'Left_shoulder_028');
  assert.equal(normalizeBoneName('UpperArm.L'), 'UpperArmL');
  assert.equal(normalizeBoneName('Forearm.L'), 'ForearmL');
});

test('mapBones: resolves roles across dot AND space conventions', () => {
  // model node names as GLTFLoader would import them (dots dropped, spaces _)
  const model = fakeModel([
    fakeBone('Pelvis'), fakeBone('UpperArmL'), fakeBone('Left_shoulder_028'), fakeBone('Unrelated'),
  ]);
  const byRole = mapBones(model, { pelvis: 'Pelvis', upperArmL: 'UpperArm.L', shoulderL: 'Left shoulder_028' });
  assert.equal(byRole.pelvis.name, 'Pelvis');
  assert.equal(byRole.upperArmL.name, 'UpperArmL');
  assert.equal(byRole.shoulderL.name, 'Left_shoulder_028');
  assert.equal(byRole.head, undefined);
});

// ── proxy allocation + graceful degradation ───────────────────────────────────
test('createProxyRig: allocates every schema role so a move can write any role', () => {
  const proxies = createProxyRig(THREE);
  assert.equal(Object.keys(proxies).length, ALL_ROLES.length);
  // a move writing to a role the rig lacks is a no-op, but the proxy must exist
  assert.ok(proxies.tailTip && proxies.tailTip.rotation && proxies.tailTip.position);
  assert.doesNotThrow(() => { proxies.upperChest.rotation.set(0.1, 0.2, 0.3); });
});

test('createProxyRig: heavy proxies are tagged for the underdamped spring profile', () => {
  const proxies = createProxyRig(THREE);
  assert.equal(proxies.head.rotation.__heavy, true);
  assert.equal(proxies.head.position.__heavy, true);
  assert.ok(!proxies.upperArmL.rotation.__heavy);
});

// ── explicit mapping is bit-identical to the original inline formula ───────────
// Max per-component absolute quaternion difference. Used for bit-identical
// assertions instead of quatAngle: the angle metric is 2·acos(|dot|), whose
// derivative blows up as dot -> 1, so it reports ~1e-8 "error" for quaternions
// that agree to all 16 digits. Component diff has no such amplification.
function compDiff(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z), Math.abs(a.w - b.w));
}

// Independent oracle: bindQ · euler(rest + axisMap·proxy), XYZ order.
function oracle(bindQ, hint, px, py, pz) {
  const src = { x: px, y: py, z: pz };
  const lx = (hint.rest?.x || 0) + hint.mx[1] * src[hint.mx[0]];
  const ly = (hint.rest?.y || 0) + hint.my[1] * src[hint.my[0]];
  const lz = (hint.rest?.z || 0) + hint.mz[1] * src[hint.mz[0]];
  const q = new Quat().setFromEuler(new Eul(lx, ly, lz, 'XYZ'));
  return bindQ.clone().multiply(q);
}

test('computeBoneQuat explicit: reproduces the original applyRig formula exactly', () => {
  // a nontrivial bind orientation + the fairy-punk-style upper-arm Z-sign flip
  const bindQ = new Quat().setFromEuler(new Eul(0.3, -0.7, 1.1, 'XYZ'));
  const proxy = { rotation: new Eul(), position: new V3() };
  const hint = { rest: { x: 0, y: 0, z: 0 }, mx: ['x', 1], my: ['y', 1], mz: ['z', -1] };
  const a = buildAdapter(THREE, 'upperArmL', { name: 'X', quaternion: bindQ }, proxy, { hint });
  assert.equal(a.mode, 'explicit');
  const s = scratch(), out = new Quat();
  for (const p of [[0, 0, 0], [1.55, 0, 0.62], [-0.6, 0.3, -0.3], [1.5, 0.2, 0.9]]) {
    computeBoneQuat(a, p[0], p[1], p[2], s, out);
    const ref = oracle(bindQ, hint, p[0], p[1], p[2]);
    assert.ok(compDiff(out, ref) < 1e-12, `pose ${p} bit-identical to oracle`);
  }
});

test('computeBoneQuat explicit: rest offset folds in (T-pose arm-down case)', () => {
  const bindQ = new Quat().setFromEuler(new Eul(0, 0, 0, 'XYZ'));
  const proxy = { rotation: new Eul(), position: new V3() };
  const hint = { rest: { x: -1.15, y: 0, z: 0 }, mx: ['x', 1], my: ['y', 1], mz: ['z', 1] };
  const a = buildAdapter(THREE, 'upperArmL', { name: 'X', quaternion: bindQ }, proxy, { hint });
  const s = scratch(), out = new Quat();
  computeBoneQuat(a, 0, 0, 0, s, out);                       // proxy at rest
  const ref = new Quat().setFromEuler(new Eul(-1.15, 0, 0, 'XYZ'));  // = pure rest offset
  assert.ok(compDiff(out, ref) < 1e-12);
});

// ── quatAngle sanity ──────────────────────────────────────────────────────────
test('quatAngle: 0 for identical, ~pi/2 for a 90deg rotation', () => {
  const a = new Quat().setFromEuler(new Eul(0, 0, 0, 'XYZ'));
  const b = new Quat().setFromEuler(new Eul(0, 0, 0, 'XYZ'));
  assert.ok(quatAngle(a, b) < 1e-12);
  const c = new Quat().setFromEuler(new Eul(Math.PI / 2, 0, 0, 'XYZ'));
  assert.ok(Math.abs(quatAngle(a, c) - Math.PI / 2) < 1e-9);
});
