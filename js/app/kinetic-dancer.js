import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import {
  CORE_ROLES, createProxyRig, buildRig, applyAdapters, applyPelvisSway, measureAutoVsManual,
} from './dance-retarget.js';

// ── Kinetic dancers (a persistent chrome DUET, cyan wireframe accent) ────
// TWO loaded, rigged glTF humanoids driven by a shared procedural choreography.
// See the git history / dance-retarget.js for the full design rationale (the
// portable retargeting engine, the spring-damper secondary motion, the ambient
// crowd + Way Big presenter). This file is the ENGINE; the choreography itself
// (the 25 move phrases, MOVE_TABLE, the tuning constants, the pure math helpers)
// lives as module-level values below — they are STATELESS strategy functions of
// a per-frame context, so they stay plain functions the engine calls, unchanged.
//
// OOP shape:
//   • class Rig          — one featured dancer's per-rig state (was createRigState)
//   • class KineticDancer — the whole engine: THREE renderer/scene/camera, the
//                           shared music clock, the ambient crowd pool, the Way
//                           Big presenter, and the RAF loop. All the former
//                           module-`let` state is encapsulated as instance fields
//                           and the former inner functions are methods.
//   • initKineticDancer() — thin factory (unchanged call site in main.kinetic.js).
//
// Safety & performance notes (unchanged): reduced-motion never runs (factory
// bails); RAF pauses on hidden tab; dt clamped; async loads fail safe per rig.
// The full per-subsystem commentary is retained inline on the methods below.

// ── module-level tuning constants (shared by the move library + the engine) ──
// Rest targets + the always-on weight bounce peak; see the move library + dance.
const REST_ARM_X = 0.20, REST_FORE_X = 0.12, REST_LEG_X = 0.06;
const BOUNCE_MAX = 0.12;
const REST_SPINE2_X = 0.05, REST_UCHEST_X = 0.04;

// spring-damper profiles (see springStep) — LIGHT for limbs/pelvis (barely any
// overshoot), HEAVY for head/neck/chest/spine (underdamped settle = hair/wing
// momentum), HAIR/CLOTH for the dangle bones.
const SPRING_LIGHT = { k1: 210, k2: 26 };   // omega≈14.5 rad/s, zeta≈0.90
const SPRING_HEAVY = { k1: 90, k2: 14 };    // omega≈9.5 rad/s,  zeta≈0.74
const SPRING_SUBSTEPS = 2;   // cheap stability margin at low framerates (dt clamped ≤1/30 in frame())
const SPRING_HAIR = { k1: 34, k2: 7 };    // omega≈5.8 rad/s, zeta≈0.60 — soft, trailing lag
const SPRING_CLOTH = { k1: 70, k2: 12 };  // omega≈8.4 rad/s, zeta≈0.72 — stiffer plate, less droop

const N_BEATS = 2;                  // grooveSway's master sway spans this many beats
const BAR_WEIGHT = [1.0, 0.35, 0.6, 0.35];   // beat-in-bar accent weighting (downbeat strongest)
const IDLE_BEAT_PERIOD = 0.6;                // synthetic ~100bpm grid while no track is locked
const FACE_SPIN = 0;      // rotation about the (Z-up) vertical to face the camera

// materials / aura palette
const ARMADRILLO_TINT = 0x22d3ee;   // site accent cyan
const AURA_CORE = 0xcaf6ff;   // white-hot cyan core (theme)
const AURA_FLAME = 0x22d3ee;  // site accent cyan flame column

// ambient crowd + featured placement
const AMBIENT_MIN_WIDTH = 768;       // tablet + desktop only; phones skip entirely
const AMBIENT_MIN = 5;
const AMBIENT_SCALE_BASE = 0.34;     // fraction of the armadrillo's duet fit scale → scattered-crowd size
const MIN_NDC_SEP = 0.36;
const FEATURED_SCALE_MULT = 0.32;   // featured dancer displayed small; giant sizes off the FULL baseScale, not this

// giant presenter
const CROWD_START_DELAY = 2;         // seconds after the HUD appears before the first small armadrillo
const WELCOME_SECONDS = 3;           // HUD appears this long after gate-unlock — a FIXED timer
const GIANT_FADE_SECONDS = 0.55;     // giant fade in/out duration (opacity ramp)
const GIANT_SCALE_MULT = 1.5;        // × Way Big's OWN fit → humongous but head + torso stay in frame
const GIANT_NDC_X = 0;
const GIANT_HEAD_NDC = 0.05;         // screen NDC-y the head BONE pins to → face reads ~centre
const GIANT_MAX_OPACITY = 1.0;       // Way Big body FULLY opaque
const DROP_ON = 0.55, DROP_OFF = 0.42;        // hysteresis band on appState.lightshow.drop (0..1)
const DROP_BURST_SECONDS = 4.5;               // capped takeover per drop EDGE

// Which partner shares the featured stage (see git history). false → lone armadrillo.
const SHOW_FAIRY_PUNK = false;
const hasPartner = SHOW_FAIRY_PUNK;

// ── per-rig config: model URL, bone-name map, rest offsets, framing ──
const RIG_A = {
  url: 'assets/scene/armadrillo/scene.gltf',
  nameOf: {
    pelvis: 'Hips_01', spine: 'Spine_08', chest: 'Chest_09',
    neck: 'Armadrillo Neck_010', head: 'Armadrillo Head_00',
    shoulderL: 'Left shoulder_028', upperArmL: 'Left arm_029', forearmL: 'Left elbow_030', handL: 'Left wrist_031',
    shoulderR: 'Right shoulder_011', upperArmR: 'Right arm_012', forearmR: 'Right elbow_013', handR: 'Right wrist_014',
    thighL: 'Left leg_02', shinL: 'Left_ShortKnee_03', footL: 'Left_ShortAnkle_04',
    thighR: 'Right leg_05', shinR: 'Right_ShortKnee_06', footR: 'Right_ShortAnkle_07',
  },
  posScale: 0.55,
  armDown: -1.15, foreRest: 0.15,
  fitH: 0.58, fitW: 0.52,
};
const RIG_B = {
  url: 'assets/scene/fairy-punk/scene.gltf',
  nameOf: {
    pelvis: 'Pelvis', spine: 'Spine', spine2: 'Spine2', chest: 'Chest',
    upperChest: 'UpperChest', neck: 'Neck', head: 'Head',
    shoulderL: 'Shoulder.L', upperArmL: 'UpperArm.L', forearmL: 'Forearm.L',
    handL: 'Hand.L', fingersL: 'Fingers.L',
    shoulderR: 'Shoulder.R', upperArmR: 'UpperArm.R', forearmR: 'Forearm.R',
    handR: 'Hand.R', fingersR: 'Fingers.R',
    thighL: 'Thigh.L', shinL: 'Shin.L', thighR: 'Thigh.R', shinR: 'Shin.R',
  },
  extraRoles: ['spine2', 'upperChest', 'shoulderL', 'shoulderR', 'handL', 'handR', 'fingersL', 'fingersR'],
  danglers: ['HairMid', 'HairTip', 'WingTipL', 'WingTipR'],
  posScale: 0.55,
  armDown: 0, foreRest: 0.12, fingerRest: 0.35,
  armZSign: 1,
  faceSpin: Math.PI,
  fitH: 0.5, fitW: 0.44,
};
const RIG_WAYBIG = {
  url: 'assets/scene/waybig/scene.gltf',
  nameOf: {
    pelvis: 'Hips', spine: 'Spine', chest: 'Spine1', upperChest: 'Spine2',
    neck: 'Neck', head: 'Head',
    shoulderL: 'LeftShoulder', upperArmL: 'LeftArm', forearmL: 'LeftForeArm', handL: 'LeftHand',
    shoulderR: 'RightShoulder', upperArmR: 'RightArm', forearmR: 'RightForeArm', handR: 'RightHand',
    // L/R legs SWAPPED vs the arms (Way Big's leg-bone axes read mirrored under
    // the analytic retarget) so a move's left-leg step lands on the leg that
    // reads as left on screen. (Arms are correct as-is.)
    thighL: 'RightUpLeg', shinL: 'RightLeg', footL: 'RightFoot',
    thighR: 'LeftUpLeg', shinR: 'LeftLeg', footR: 'LeftFoot',
  },
  extraRoles: ['upperChest', 'shoulderL', 'shoulderR', 'handL', 'handR'],
  posScale: 0.9,
  faceSpin: Math.PI / 2,
  fitH: 0.56, fitW: 0.5,
};

// Probe proxy rotations for the auto-vs-manual measurement.
const AUTO_PROBES = [
  { x: 0.5, y: 0, z: 0 }, { x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 0.5 },
  { x: 1.3, y: 0, z: 0.4 }, { x: -0.6, y: 0.3, z: -0.3 }, { x: 1.5, y: 0.2, z: 0.9 },
];

// Build the EXPLICIT (hand-tuned) retarget hints for a rig from its cfg,
// reproducing exactly the original per-rig adapter setup so the engine's
// explicit path is bit-identical to the old inline applyRig.
function makeExplicitHints(cfg) {
  const armDown = cfg.armDown || 0, foreRest = cfg.foreRest || 0, armZSign = cfg.armZSign || 1;
  const fingerRest = cfg.fingerRest || 0;
  const id = () => ({ mx: ['x', 1], my: ['y', 1], mz: ['z', 1] });
  const hints = {
    pelvis: id(), spine: id(), chest: id(), neck: id(), head: id(),
    upperArmL: { rest: { x: armDown, y: 0, z: 0 }, mx: ['x', 1], my: ['y', 1], mz: ['z', armZSign] },
    upperArmR: { rest: { x: armDown, y: 0, z: 0 }, mx: ['x', 1], my: ['y', 1], mz: ['z', armZSign] },
    forearmL: { rest: { x: foreRest, y: 0, z: 0 }, ...id() },
    forearmR: { rest: { x: foreRest, y: 0, z: 0 }, ...id() },
    thighL: id(), shinL: id(), thighR: id(), shinR: id(),
  };
  if (cfg.extraRoles) {
    const extra = {
      spine2: id(), upperChest: id(),
      shoulderL: id(), shoulderR: id(), handL: id(), handR: id(),
      fingersL: { rest: { x: fingerRest, y: 0, z: 0 }, ...id() },
      fingersR: { rest: { x: fingerRest, y: 0, z: 0 }, ...id() },
    };
    for (const r of cfg.extraRoles) if (extra[r]) hints[r] = extra[r];
  }
  return hints;
}

// BPM estimate by autocorrelating the energy envelope + onset phase-align.
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

// ── secondary-motion PHYSICS (spring-damper, zero dependencies) ──────────
// Semi-implicit Euler damped harmonic oscillator, sub-stepped for stability.
// Pure: integrates obj[axis] + obj['_v'+axis] toward `target` in place.
function springStep(obj, axis, target, dt, profile) {
  const vKey = '_v' + axis;
  let v = obj[vKey] || 0;
  let x = obj[axis];
  if (!Number.isFinite(v)) v = 0;      // guard: a NaN velocity must never persist
  if (!Number.isFinite(x)) x = target;
  const h = dt / SPRING_SUBSTEPS;
  for (let i = 0; i < SPRING_SUBSTEPS; i++) {
    const accel = profile.k1 * (target - x) - profile.k2 * v;
    v += accel * h;
    x += v * h;
  }
  obj[vKey] = v;
  obj[axis] = x;
}

// Ease-in-out (0..1 in, 0 slope at both ends) for every move's envelopes.
const smoothstep = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

// Ease every extra joint (subdivided spine/clavicles/wrists/finger-curls) back
// to rest. `t` is the move context's `tgt`. Free no-op on the 13-bone armadrillo.
function restExtras(b, t) {
  t(b.spine2.rotation, 'x', REST_SPINE2_X); t(b.spine2.rotation, 'z', 0); t(b.spine2.rotation, 'y', 0);
  t(b.upperChest.rotation, 'x', REST_UCHEST_X); t(b.upperChest.rotation, 'z', 0); t(b.upperChest.rotation, 'y', 0);
  t(b.shoulderL.rotation, 'x', 0); t(b.shoulderL.rotation, 'z', 0); t(b.shoulderL.rotation, 'y', 0);
  t(b.shoulderR.rotation, 'x', 0); t(b.shoulderR.rotation, 'z', 0); t(b.shoulderR.rotation, 'y', 0);
  t(b.handL.rotation, 'x', 0); t(b.handL.rotation, 'z', 0); t(b.handR.rotation, 'x', 0); t(b.handR.rotation, 'z', 0);
  t(b.fingersL.rotation, 'x', 0); t(b.fingersR.rotation, 'x', 0);
}

// ── move library ─────────────────────────────────────────────────────
// Twenty-five move phrases, each a PURE function of a shared context — `b`
// (proxy joints), the damping helpers tgt/set/add, amplitude `A`/beat accent
// `hit`, the grooveSway oscillator `p`/`s`, this move's own `elapsedBeats`,
// `mirror` (±1), and `rig` (this move's OWN rig state). EVERY move sets a target
// for EVERY proxy axis another move might drive so moves crossfade for free
// through the shared damping. See git history for the per-move rationale.

// A. Groove sway — the retuned workhorse.
function grooveSway(c) {
  const { b, tgt, set, A, p, s, rig } = c;
  const reachL = 0.5 - 0.5 * Math.cos(p);
  const reachR = 0.5 - 0.5 * Math.cos(p + 2.4);
  const reach = Math.max(reachL, reachR);
  const look = Math.sin(p * 0.5 + 0.7);

  set(b.pelvis.position, 'x', s * 0.17 * A);
  set(b.pelvis.position, 'y', 0.12 + Math.abs(s) * 0.08 * A);
  tgt(b.pelvis.rotation, 'z', s * 0.16 * A);
  tgt(b.pelvis.rotation, 'y', s * 0.20 * A);

  tgt(b.spine.rotation, 'x', 0.08 + (0.5 - 0.5 * Math.cos(p)) * 0.14 * A);
  tgt(b.spine.rotation, 'z', -s * 0.14 * A);
  tgt(b.chest.rotation, 'z', s * 0.14 * A);
  tgt(b.chest.rotation, 'y', -s * 0.14 * A);

  tgt(b.upperArmL.rotation, 'z', 0.12 + reachL * 0.50 * A);
  tgt(b.upperArmL.rotation, 'x', 0.25 + reachL * 1.30 * A);
  tgt(b.forearmL.rotation, 'x', -0.6 - reachL * 1.55 * A);
  tgt(b.upperArmR.rotation, 'z', -(0.12 + reachR * 0.50 * A));
  tgt(b.upperArmR.rotation, 'x', 0.25 + reachR * 1.30 * A);
  tgt(b.forearmR.rotation, 'x', -0.6 - reachR * 1.55 * A);

  tgt(b.thighL.rotation, 'x', 0.05 + Math.max(0, s) * 0.22 * A);
  tgt(b.thighR.rotation, 'x', 0.05 + Math.max(0, -s) * 0.22 * A);
  tgt(b.shinL.rotation, 'x', 0.05 + Math.max(0, s) * 0.40 * A);
  tgt(b.shinR.rotation, 'x', 0.05 + Math.max(0, -s) * 0.40 * A);

  // head trails the chest (secondary motion) — per-rig, kept local to this move only
  rig.headTrail += (b.chest.rotation.z - rig.headTrail) * (1 - Math.pow(0.92, (c.dt || 0.016) * 60));
  tgt(b.neck.rotation, 'x', 0.03 + reach * 0.20 * A);
  tgt(b.neck.rotation, 'z', s * 0.08 * A);
  tgt(b.neck.rotation, 'y', look * 0.10 * A);
  tgt(b.head.rotation, 'x', -0.12 + reach * 0.54 * A);
  tgt(b.head.rotation, 'z', s * 0.16 * A - rig.headTrail * 0.4);
  tgt(b.head.rotation, 'y', look * 0.22 * A);
}

// C. Barrier strike — the Anyma signature accent (drop edge).
function strike(c) {
  const { b, tgt, set, add, A, elapsedBeats } = c;
  const eb = elapsedBeats;
  if (eb < 2) {
    const w = smoothstep(eb / 2);
    set(b.pelvis.position, 'x', 0); set(b.pelvis.position, 'y', 0.10 - w * 0.03 * A);
    tgt(b.upperArmL.rotation, 'x', 0.25 - w * 0.6 * A); tgt(b.upperArmL.rotation, 'z', 0.10);
    tgt(b.upperArmR.rotation, 'x', 0.25 - w * 0.6 * A); tgt(b.upperArmR.rotation, 'z', -0.10);
    tgt(b.forearmL.rotation, 'x', REST_FORE_X); tgt(b.forearmR.rotation, 'x', REST_FORE_X);
    tgt(b.chest.rotation, 'y', w * 0.3 * A); tgt(b.chest.rotation, 'z', 0);
    tgt(b.spine.rotation, 'z', w * 0.2 * A); tgt(b.spine.rotation, 'x', 0.08);
    tgt(b.head.rotation, 'x', -0.12); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', 0);
    tgt(b.neck.rotation, 'x', 0.03); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', 0);
  } else {
    const punch = 1 - smoothstep(Math.min(1, (eb - 2) / 6));
    set(b.pelvis.position, 'x', 0); set(b.pelvis.position, 'y', 0.11 + punch * 0.03 * A);
    tgt(b.upperArmL.rotation, 'x', 0.25 + 1.5 * punch * A); tgt(b.upperArmL.rotation, 'z', 0.10 * (1 - punch));
    tgt(b.upperArmR.rotation, 'x', 0.25 + 1.5 * punch * A); tgt(b.upperArmR.rotation, 'z', -0.10 * (1 - punch));
    tgt(b.forearmL.rotation, 'x', REST_FORE_X - 0.2 * punch); tgt(b.forearmR.rotation, 'x', REST_FORE_X - 0.2 * punch);
    tgt(b.chest.rotation, 'y', -punch * 0.3 * A); tgt(b.chest.rotation, 'z', 0);
    tgt(b.spine.rotation, 'x', 0.08 + punch * 0.25 * A); tgt(b.spine.rotation, 'z', 0);
    tgt(b.head.rotation, 'x', -0.12 - punch * 0.2 * A); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', 0);
    tgt(b.neck.rotation, 'x', 0.03 + punch * 0.1 * A); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', 0);
    add(b.pelvis.position, 'y', -punch * 0.08);
  }
  tgt(b.thighL.rotation, 'x', REST_LEG_X + 0.04); tgt(b.thighR.rotation, 'x', REST_LEG_X + 0.04);
  tgt(b.shinL.rotation, 'x', REST_LEG_X); tgt(b.shinR.rotation, 'x', REST_LEG_X);
}

// E. Step-touch — a 4-beat weight-shifting step with elbow pumps ON the beat.
function stepTouch(c) {
  const { b, tgt, set, A, elapsedBeats } = c;
  const eb = elapsedBeats % 4;
  const swing = Math.sin(eb * Math.PI);       // 0..1..0 across each beat pair
  const dir = Math.floor(eb) % 2 === 0 ? 1 : -1;

  set(b.pelvis.position, 'x', dir * 0.13 * A * Math.abs(swing));
  set(b.pelvis.position, 'y', 0.12 + Math.abs(swing) * 0.06 * A);
  tgt(b.pelvis.rotation, 'z', dir * 0.10 * A); tgt(b.pelvis.rotation, 'y', 0);
  tgt(b.spine.rotation, 'x', 0.08); tgt(b.spine.rotation, 'z', -dir * 0.08 * A);
  tgt(b.chest.rotation, 'z', dir * 0.08 * A); tgt(b.chest.rotation, 'y', 0);

  tgt(b.upperArmL.rotation, 'z', 0.10); tgt(b.upperArmL.rotation, 'x', 0.3 + Math.max(0, Math.sin(eb * Math.PI + Math.PI)) * 0.4 * A);
  tgt(b.upperArmR.rotation, 'z', -0.10); tgt(b.upperArmR.rotation, 'x', 0.3 + Math.max(0, -Math.sin(eb * Math.PI + Math.PI)) * 0.4 * A);
  tgt(b.forearmL.rotation, 'x', REST_FORE_X); tgt(b.forearmR.rotation, 'x', REST_FORE_X);

  tgt(b.thighL.rotation, 'x', 0.08 + Math.max(0, Math.sin(eb * Math.PI)) * 0.30 * A);
  tgt(b.thighR.rotation, 'x', 0.08 + Math.max(0, -Math.sin(eb * Math.PI)) * 0.30 * A);
  tgt(b.shinL.rotation, 'x', 0.05 + Math.max(0, Math.sin(eb * Math.PI)) * 0.35 * A);
  tgt(b.shinR.rotation, 'x', 0.05 + Math.max(0, -Math.sin(eb * Math.PI)) * 0.35 * A);

  tgt(b.neck.rotation, 'x', 0.03); tgt(b.neck.rotation, 'z', dir * 0.05); tgt(b.neck.rotation, 'y', 0);
  tgt(b.head.rotation, 'x', -0.08); tgt(b.head.rotation, 'z', dir * 0.06); tgt(b.head.rotation, 'y', 0);
}

// H. Tribal stomp — grounded percussive stomping, alternating legs.
function tribalStomp(c) {
  const { b, tgt, set, A, elapsedBeats } = c;
  const eb = elapsedBeats % 4;
  const beatFrac = eb - Math.floor(eb);
  const impact = smoothstep(Math.min(1, beatFrac / 0.12)) * (1 - smoothstep(Math.max(0, (beatFrac - 0.12) / 0.35)));
  const legIdx = Math.floor(eb) % 2;
  const dir = legIdx === 0 ? 1 : -1;

  set(b.pelvis.position, 'x', dir * 0.05 * A);
  set(b.pelvis.position, 'y', 0.06 - impact * 0.06 * A);
  tgt(b.pelvis.rotation, 'z', -dir * 0.10 * A); tgt(b.pelvis.rotation, 'y', 0);
  tgt(b.spine.rotation, 'x', 0.10 + impact * 0.08 * A); tgt(b.spine.rotation, 'z', dir * 0.06 * A);
  tgt(b.chest.rotation, 'z', -dir * (0.10 + impact * 0.14 * A)); tgt(b.chest.rotation, 'y', 0);

  tgt(b.upperArmL.rotation, 'z', 0.16); tgt(b.upperArmL.rotation, 'x', REST_ARM_X + (dir < 0 ? impact * 0.35 * A : 0));
  tgt(b.upperArmR.rotation, 'z', -0.16); tgt(b.upperArmR.rotation, 'x', REST_ARM_X + (dir > 0 ? impact * 0.35 * A : 0));
  tgt(b.forearmL.rotation, 'x', REST_FORE_X + (dir < 0 ? impact * 0.4 : 0));
  tgt(b.forearmR.rotation, 'x', REST_FORE_X + (dir > 0 ? impact * 0.4 : 0));

  tgt(b.thighL.rotation, 'x', REST_LEG_X + 0.10 + (legIdx === 0 ? impact * 0.5 * A : 0));
  tgt(b.thighR.rotation, 'x', REST_LEG_X + 0.10 + (legIdx === 1 ? impact * 0.5 * A : 0));
  tgt(b.shinL.rotation, 'x', REST_LEG_X + 0.08 + (legIdx === 0 ? impact * 0.35 * A : 0));
  tgt(b.shinR.rotation, 'x', REST_LEG_X + 0.08 + (legIdx === 1 ? impact * 0.35 * A : 0));

  tgt(b.neck.rotation, 'x', 0.05); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', 0);
  tgt(b.head.rotation, 'x', -0.06 - impact * 0.08 * A); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', 0);
}

// L. Poly-step — a syncopated stepping pattern against a 6-beat cycle.
function polyStep(c) {
  const { b, tgt, set, A, elapsedBeats, mirror } = c;
  const eb = elapsedBeats % 6;
  const accentPhase = eb % 3;
  const accent = smoothstep(Math.min(1, accentPhase / 0.5)) * (1 - smoothstep(Math.max(0, (accentPhase - 0.5) / 2)));
  const dir = Math.floor(eb / 3) % 2 === 0 ? 1 : -1;
  const featUp = mirror > 0 ? b.upperArmR : b.upperArmL, restUp = mirror > 0 ? b.upperArmL : b.upperArmR;
  const featFore = mirror > 0 ? b.forearmR : b.forearmL, restFore = mirror > 0 ? b.forearmL : b.forearmR;

  set(b.pelvis.position, 'x', dir * 0.09 * A * accent); set(b.pelvis.position, 'y', 0.11 + accent * 0.05 * A);
  tgt(b.pelvis.rotation, 'z', dir * 0.10 * A * accent); tgt(b.pelvis.rotation, 'y', mirror * accent * 0.08 * A);
  tgt(b.spine.rotation, 'x', 0.08); tgt(b.spine.rotation, 'z', -dir * 0.08 * A * accent);
  tgt(b.chest.rotation, 'z', dir * 0.10 * A * accent); tgt(b.chest.rotation, 'y', mirror * accent * 0.12 * A);

  tgt(featUp.rotation, 'x', 0.25 + accent * 0.9 * A); tgt(featUp.rotation, 'z', mirror * (0.12 + accent * 0.3 * A));
  tgt(featFore.rotation, 'x', REST_FORE_X - accent * 0.3);
  tgt(restUp.rotation, 'x', REST_ARM_X); tgt(restUp.rotation, 'z', 0.10 * -mirror);
  tgt(restFore.rotation, 'x', REST_FORE_X);

  tgt(b.thighL.rotation, 'x', REST_LEG_X + Math.max(0, dir) * accent * 0.20 * A);
  tgt(b.thighR.rotation, 'x', REST_LEG_X + Math.max(0, -dir) * accent * 0.20 * A);
  tgt(b.shinL.rotation, 'x', REST_LEG_X + Math.max(0, dir) * accent * 0.18 * A);
  tgt(b.shinR.rotation, 'x', REST_LEG_X + Math.max(0, -dir) * accent * 0.18 * A);

  tgt(b.neck.rotation, 'x', 0.03); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', -mirror * accent * 0.12 * A);
  tgt(b.head.rotation, 'x', -0.08); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', -mirror * accent * 0.16 * A);
}

// ── techno floor moves (M–AF): 20 rave / hardstyle / shuffle phrases ─────
// Authored through applyPose() so each stays a compact pose object. tgt()/set()
// INTEGRATE the spring on the call, so applyPose drives the full core proxy set
// once, easing everything omitted back to dance-neutral rest.
//   px/py  pelvis.position x/y        prz/pry pelvis.rotation z/y
//   spx/spz spine x/z                  chz/chy chest z/y
//   uaLz/uaLx/uaRz/uaRx upperArm z/x   foLx/foRx forearm x
//   thL/thR thigh x                    shL/shR  shin x
//   nx/nz/ny neck x/z/y                hx/hz/hy head x/z/y
function applyPose(c, o) {
  const { b, tgt, set } = c;
  set(b.pelvis.position, 'x', o.px != null ? o.px : 0);
  set(b.pelvis.position, 'y', o.py != null ? o.py : 0.11);
  tgt(b.pelvis.rotation, 'z', o.prz || 0);
  tgt(b.pelvis.rotation, 'y', o.pry || 0);
  tgt(b.spine.rotation, 'x', o.spx != null ? o.spx : 0.08);
  tgt(b.spine.rotation, 'z', o.spz || 0);
  tgt(b.chest.rotation, 'z', o.chz || 0);
  tgt(b.chest.rotation, 'y', o.chy || 0);
  tgt(b.upperArmL.rotation, 'z', o.uaLz != null ? o.uaLz : 0.12);
  tgt(b.upperArmL.rotation, 'x', o.uaLx != null ? o.uaLx : REST_ARM_X);
  tgt(b.forearmL.rotation, 'x', o.foLx != null ? o.foLx : REST_FORE_X);
  tgt(b.upperArmR.rotation, 'z', o.uaRz != null ? o.uaRz : -0.12);
  tgt(b.upperArmR.rotation, 'x', o.uaRx != null ? o.uaRx : REST_ARM_X);
  tgt(b.forearmR.rotation, 'x', o.foRx != null ? o.foRx : REST_FORE_X);
  tgt(b.thighL.rotation, 'x', o.thL != null ? o.thL : REST_LEG_X);
  tgt(b.thighR.rotation, 'x', o.thR != null ? o.thR : REST_LEG_X);
  tgt(b.shinL.rotation, 'x', o.shL != null ? o.shL : REST_LEG_X);
  tgt(b.shinR.rotation, 'x', o.shR != null ? o.shR : REST_LEG_X);
  tgt(b.neck.rotation, 'x', o.nx != null ? o.nx : 0.03);
  tgt(b.neck.rotation, 'z', o.nz || 0);
  tgt(b.neck.rotation, 'y', o.ny || 0);
  tgt(b.head.rotation, 'x', o.hx != null ? o.hx : -0.10);
  tgt(b.head.rotation, 'z', o.hz || 0);
  tgt(b.head.rotation, 'y', o.hy || 0);
}

// M. Italian stomp — high knee lifts driving into the floor, opposite arm marches.
function italianStomp(c) {
  const { A, elapsedBeats: eb } = c;
  const legL = Math.floor(eb) % 2 === 0;             // which knee drives up this beat
  const bf = eb - Math.floor(eb);
  const lift = Math.sin(bf * Math.PI);               // peak mid-beat, slammed home by beat end
  const up = 0.10 + lift * 1.25 * A, knee = REST_LEG_X + lift * 0.95 * A;
  const swing = lift * 0.6 * A;                      // opposite-arm march
  applyPose(c, {
    py: 0.11 - lift * 0.02 * A, prz: (legL ? 1 : -1) * 0.05 * A, spx: 0.10, chy: (legL ? 1 : -1) * 0.06 * A,
    thL: legL ? up : REST_LEG_X, thR: legL ? REST_LEG_X : up,
    shL: legL ? knee : REST_LEG_X + 0.06, shR: legL ? REST_LEG_X + 0.06 : knee,
    uaLz: 0.14, uaRz: -0.14, uaLx: 0.30 + (legL ? 0 : swing), uaRx: 0.30 + (legL ? swing : 0),
    foLx: REST_FORE_X - (legL ? 0 : 0.5), foRx: REST_FORE_X - (legL ? 0.5 : 0),
    hx: -0.06, hz: (legL ? 1 : -1) * 0.05 * A,
  });
}

// N. Melbourne shuffle — rapid heel-toe gliding, whole figure drifts laterally.
function melbourneShuffle(c) {
  const { A, elapsedBeats: eb } = c;
  const fast = Math.sin(eb * Math.PI * 4);           // 2 shuffles per beat
  const glide = Math.sin(eb * Math.PI * 0.5);        // slow lateral drift over 4 beats
  applyPose(c, {
    py: 0.10, px: glide * 0.14 * A, prz: glide * 0.06 * A, pry: fast * 0.05 * A,
    thL: REST_LEG_X + Math.max(0, fast) * 0.30 * A, thR: REST_LEG_X + Math.max(0, -fast) * 0.30 * A,
    shL: REST_LEG_X + Math.max(0, fast) * 0.22 * A, shR: REST_LEG_X + Math.max(0, -fast) * 0.22 * A,
    spz: glide * 0.05 * A, chz: -glide * 0.06 * A,
    uaLz: 0.20, uaRz: -0.20, uaLx: REST_ARM_X + 0.05, uaRx: REST_ARM_X + 0.05, foLx: -0.4, foRx: -0.4,
    hy: glide * 0.10 * A, hz: -glide * 0.05 * A,
  });
}

// O. Running man — continuous illusion of running in one spot.
function runningMan(c) {
  const { A, elapsedBeats: eb } = c;
  const s1 = Math.sin(eb * Math.PI);                 // one stride cycle per 2 beats
  applyPose(c, {
    spx: 0.14, py: 0.11,
    thL: REST_LEG_X + s1 * 0.55 * A, thR: REST_LEG_X - s1 * 0.55 * A,
    shL: REST_LEG_X + Math.max(0, s1) * 0.5, shR: REST_LEG_X + Math.max(0, -s1) * 0.5,
    uaRx: 0.35 + Math.max(0, s1) * 0.7 * A, uaLx: 0.35 + Math.max(0, -s1) * 0.7 * A,
    uaLz: 0.10, uaRz: -0.10, foLx: -0.9, foRx: -0.9,
    chy: s1 * 0.08 * A, hx: -0.06, hy: -s1 * 0.06 * A,
  });
}

// P. T-step — sideways shuffle on sharp heel-and-toe pivots.
function tStep(c) {
  const { A, elapsedBeats: eb } = c;
  const legIdx = Math.floor(eb) % 2, dir = legIdx ? -1 : 1;
  const bf = eb - Math.floor(eb);
  const snap = smoothstep(Math.min(1, bf / 0.15)) * (1 - smoothstep(Math.max(0, (bf - 0.15) / 0.4)));
  applyPose(c, {
    px: dir * 0.13 * A, pry: dir * 0.22 * A * (0.4 + snap), prz: dir * 0.06 * A, spx: 0.08,
    thL: REST_LEG_X + (dir > 0 ? snap * 0.35 * A : 0.02), thR: REST_LEG_X + (dir < 0 ? snap * 0.35 * A : 0.02),
    shL: REST_LEG_X + (dir > 0 ? snap * 0.25 : 0.04), shR: REST_LEG_X + (dir < 0 ? snap * 0.25 : 0.04),
    uaLz: 0.26, uaRz: -0.26, uaLx: REST_ARM_X, uaRx: REST_ARM_X, foLx: -0.5, foRx: -0.5,
    chy: dir * 0.10 * A, hy: dir * 0.18 * A, hx: -0.06,
  });
}

// Q. Hakken — the lightning-fast repetitive gabber step.
function hakken(c) {
  const { A, elapsedBeats: eb } = c;
  const fast = Math.sin(eb * Math.PI * 4);           // 2 steps per beat
  applyPose(c, {
    py: 0.10 + Math.abs(fast) * 0.03 * A, spx: 0.06,
    thL: REST_LEG_X + Math.max(0, fast) * 0.5 * A, thR: REST_LEG_X + Math.max(0, -fast) * 0.5 * A,
    shL: REST_LEG_X + Math.max(0, fast) * 0.3, shR: REST_LEG_X + Math.max(0, -fast) * 0.3,
    uaLz: 0.12, uaRz: -0.12, uaLx: 0.40 + Math.max(0, -fast) * 0.3 * A, uaRx: 0.40 + Math.max(0, fast) * 0.3 * A,
    foLx: -0.8, foRx: -0.8, prz: fast * 0.04 * A, hx: -0.04,
  });
}

// R. Jumpstyle — explosive forward-and-back leg kicks in mid-air.
function jumpstyle(c) {
  const { A, elapsedBeats: eb } = c;
  const hop = Math.max(0, Math.sin(eb * Math.PI));   // airtime per beat
  const kick = Math.sin(eb * Math.PI * 2) * hop;     // legs kick only while airborne
  applyPose(c, {
    py: 0.11 + hop * 0.10 * A, spx: 0.08, chy: kick * 0.08 * A,
    thL: REST_LEG_X + kick * 0.6 * A, thR: REST_LEG_X - kick * 0.6 * A,
    shL: REST_LEG_X + Math.abs(kick) * 0.2, shR: REST_LEG_X + Math.abs(kick) * 0.2,
    uaLz: 0.30 + hop * 0.15 * A, uaRz: -(0.30 + hop * 0.15 * A), uaLx: REST_ARM_X + 0.1, uaRx: REST_ARM_X + 0.1,
    foLx: -0.5, foRx: -0.5, hx: -0.10 - hop * 0.06 * A,
  });
}

// S. Industrial stomp — aggressive heavy marching, stiff robotic arm swings.
function industrialStomp(c) {
  const { A, elapsedBeats: eb } = c;
  const legL = Math.floor(eb) % 2 === 0;
  const bf = eb - Math.floor(eb);
  const march = Math.sin(bf * Math.PI);
  applyPose(c, {
    py: 0.11 - march * 0.02 * A, prz: (legL ? 1 : -1) * 0.06 * A, spx: 0.10,
    thL: REST_LEG_X + (legL ? march * 0.7 * A : 0.02), thR: REST_LEG_X + (legL ? 0.02 : march * 0.7 * A),
    shL: REST_LEG_X + (legL ? march * 0.45 : 0.04), shR: REST_LEG_X + (legL ? 0.04 : march * 0.45),
    uaLz: 0.10, uaRz: -0.10, uaLx: 0.40 + (legL ? march * 0.8 * A : 0), uaRx: 0.40 + (legL ? 0 : march * 0.8 * A),
    foLx: -1.3, foRx: -1.3, hx: -0.04, hz: (legL ? 1 : -1) * 0.04 * A,   // 90° locked elbows
  });
}

// T. Turbo arms — rapid, chaotic spinning of both arms in front of the chest.
function turboArms(c) {
  const { A, elapsedBeats: eb } = c;
  const w = eb * Math.PI * 4;                         // fast
  applyPose(c, {
    py: 0.11, spx: 0.08, chy: Math.sin(w * 0.5) * 0.06 * A,
    uaLx: 0.90 + Math.sin(w) * 0.5 * A, uaLz: 0.40 + Math.cos(w) * 0.4 * A,
    uaRx: 0.90 + Math.sin(w + 2.1) * 0.5 * A, uaRz: -(0.40 + Math.cos(w + 2.1) * 0.4 * A),
    foLx: -1.4 + Math.sin(w * 1.3) * 0.3, foRx: -1.4 + Math.sin(w * 1.3 + 1) * 0.3,
    thL: REST_LEG_X + 0.04, thR: REST_LEG_X + 0.04, hz: Math.sin(w * 0.5) * 0.05 * A, hx: -0.08,
  });
}

// U. Double-time bounce — the entire body pulsing twice as fast as the beat.
function doubleTimeBounce(c) {
  const { A, elapsedBeats: eb } = c;
  const b2 = Math.abs(Math.sin(eb * Math.PI * 2));   // 2 dips per beat
  applyPose(c, {
    py: 0.11 - b2 * 0.06 * A, spx: 0.08 + b2 * 0.05 * A,
    thL: REST_LEG_X + b2 * 0.30 * A, thR: REST_LEG_X + b2 * 0.30 * A,
    shL: REST_LEG_X + b2 * 0.35 * A, shR: REST_LEG_X + b2 * 0.35 * A,
    uaLz: 0.16, uaRz: -0.16, uaLx: REST_ARM_X + b2 * 0.15 * A, uaRx: REST_ARM_X + b2 * 0.15 * A,
    foLx: -0.5, foRx: -0.5, hx: -0.08 - b2 * 0.05 * A,
  });
}

// V. Bass drop jump — a wind-up crouch then an explosion straight up.
function bassDropJump(c) {
  const { A, elapsedBeats: eb } = c;
  const cyc = eb % 2;
  const wind = cyc < 0.5 ? smoothstep(cyc / 0.5) : 0;              // crouch
  const leap = cyc >= 0.5 ? Math.sin((cyc - 0.5) / 1.5 * Math.PI) : 0;  // airborne arc
  applyPose(c, {
    py: 0.11 - wind * 0.10 * A + leap * 0.16 * A, spx: 0.08 + wind * 0.15 * A - leap * 0.1,
    thL: REST_LEG_X + wind * 0.4 * A - leap * 0.1, thR: REST_LEG_X + wind * 0.4 * A - leap * 0.1,
    shL: REST_LEG_X + wind * 0.5 * A, shR: REST_LEG_X + wind * 0.5 * A,
    uaLx: 0.30 + leap * 1.4 * A, uaRx: 0.30 + leap * 1.4 * A,
    uaLz: 0.15 + leap * 0.5 * A, uaRz: -(0.15 + leap * 0.5 * A), foLx: REST_FORE_X, foRx: REST_FORE_X,
    hx: -0.10 - leap * 0.15 * A,
  });
}

// W. Floor slap — bending deep to strike the ground on the heavy kick (mirrored).
function floorSlap(c) {
  const { A, elapsedBeats: eb, mirror } = c;
  const bf = eb - Math.floor(eb);
  const down = bf < 0.5 ? smoothstep(bf / 0.5) : 1 - smoothstep((bf - 0.5) / 0.5);
  const L = mirror > 0;                              // L → strike with the right arm
  applyPose(c, {
    py: 0.11 - down * 0.09 * A, spx: 0.08 + down * 0.85 * A,
    thL: REST_LEG_X + down * 0.4 * A, thR: REST_LEG_X + down * 0.4 * A,
    shL: REST_LEG_X + down * 0.6 * A, shR: REST_LEG_X + down * 0.6 * A,
    uaLx: L ? REST_ARM_X + down * 0.15 : REST_ARM_X - down * 0.7 * A, uaRx: L ? REST_ARM_X - down * 0.7 * A : REST_ARM_X + down * 0.15,
    uaLz: 0.12, uaRz: -0.12, foLx: L ? REST_FORE_X : REST_FORE_X - down * 0.5, foRx: L ? REST_FORE_X - down * 0.5 : REST_FORE_X,
    hx: -0.10 - down * 0.25 * A,
  });
}

// X. Mosher chop — rhythmic overhead downward arm chops.
function mosherChop(c) {
  const { A, elapsedBeats: eb } = c;
  const up = 0.5 + 0.5 * Math.cos(eb * Math.PI * 2); // 1 = overhead on the beat, 0 = chopped low
  applyPose(c, {
    py: 0.11 - (1 - up) * 0.04 * A, spx: 0.08 + (1 - up) * 0.15 * A,
    uaLx: 0.30 + up * 1.3 * A, uaRx: 0.30 + up * 1.3 * A, uaLz: 0.10, uaRz: -0.10,
    foLx: REST_FORE_X, foRx: REST_FORE_X,
    thL: REST_LEG_X + 0.04, thR: REST_LEG_X + 0.04, hx: -0.10 - (1 - up) * 0.12 * A,
  });
}

// Y. Windmill — large upright ARM windmills (both arms, opposite phase).
function windmill(c) {
  const { A, elapsedBeats: eb } = c;
  const w = eb * Math.PI;                            // one revolution per 2 beats
  applyPose(c, {
    py: 0.11, spx: 0.06, chz: Math.sin(w) * 0.06 * A,
    uaLx: 0.75 + Math.sin(w) * 0.75 * A, uaLz: 0.30 + Math.cos(w) * 0.5 * A,
    uaRx: 0.75 + Math.sin(w + Math.PI) * 0.75 * A, uaRz: -(0.30 + Math.cos(w + Math.PI) * 0.5 * A),
    foLx: REST_FORE_X, foRx: REST_FORE_X, prz: Math.sin(w) * 0.04 * A,
    hz: Math.sin(w) * 0.06 * A, hy: Math.cos(w) * 0.05 * A, hx: -0.06,
  });
}

// Z. Kick-step — flicking one foot forward, then snapping into a stomp (mirrored).
function kickStep(c) {
  const { A, elapsedBeats: eb, mirror } = c;
  const bf = eb - Math.floor(eb);
  const flick = bf < 0.4 ? smoothstep(bf / 0.4) : 1 - smoothstep(Math.min(1, (bf - 0.4) / 0.2));
  const stomp = bf >= 0.5 ? smoothstep(Math.min(1, (bf - 0.5) / 0.2)) * (1 - smoothstep(Math.max(0, (bf - 0.7) / 0.3))) : 0;
  const L = mirror > 0;                              // L → kick the right leg
  const kThigh = REST_LEG_X + flick * 0.6 * A, kShin = REST_LEG_X + stomp * 0.25 * A;
  applyPose(c, {
    py: 0.11 - stomp * 0.05 * A, spx: 0.08, prz: (L ? -1 : 1) * 0.05 * A,
    thL: L ? REST_LEG_X : kThigh, thR: L ? kThigh : REST_LEG_X,
    shL: L ? REST_LEG_X + 0.04 : kShin, shR: L ? kShin : REST_LEG_X + 0.04,
    uaLz: 0.12, uaRz: -0.12, uaLx: 0.30 + (L ? flick * 0.4 * A : 0), uaRx: 0.30 + (L ? 0 : flick * 0.4 * A),
    foLx: -0.5, foRx: -0.5, hx: -0.06,
  });
}

// AA. Side-to-side sprint — sprinting motion while shifting horizontally.
function sideToSideSprint(c) {
  const { A, elapsedBeats: eb } = c;
  const s1 = Math.sin(eb * Math.PI * 1.5);           // quick stride
  const glide = Math.sin(eb * Math.PI * 0.5);        // lateral travel over 4 beats
  applyPose(c, {
    px: glide * 0.14 * A, spx: 0.14, py: 0.11,
    thL: REST_LEG_X + s1 * 0.6 * A, thR: REST_LEG_X - s1 * 0.6 * A,
    shL: REST_LEG_X + Math.max(0, s1) * 0.5, shR: REST_LEG_X + Math.max(0, -s1) * 0.5,
    uaRx: 0.35 + Math.max(0, s1) * 0.7 * A, uaLx: 0.35 + Math.max(0, -s1) * 0.7 * A,
    uaLz: 0.10, uaRz: -0.10, foLx: -0.9, foRx: -0.9,
    pry: glide * 0.08 * A, chy: -glide * 0.06 * A, hx: -0.06, hy: glide * 0.10 * A,
  });
}

// AB. Shoulder jacks — fast, violent up-and-down shaking of the upper frame.
function shoulderJacks(c) {
  const { A, elapsedBeats: eb } = c;
  const shake = Math.sin(eb * Math.PI * 6);          // very fast shudder
  applyPose(c, {
    py: 0.11 + shake * 0.02 * A, spx: 0.08 + shake * 0.10 * A, chz: shake * 0.10 * A,
    uaLz: 0.20 + shake * 0.12 * A, uaRz: -(0.20 - shake * 0.12 * A), uaLx: REST_ARM_X + 0.1, uaRx: REST_ARM_X + 0.1,
    foLx: -0.6, foRx: -0.6, shL: REST_LEG_X + Math.abs(shake) * 0.1, shR: REST_LEG_X + Math.abs(shake) * 0.1,
    hx: -0.08 + shake * 0.06 * A, hz: shake * 0.05 * A,
  });
}

// AC. Fist pump sprint — pounding the air while rapidly jogging on the spot.
function fistPumpSprint(c) {
  const { A, elapsedBeats: eb } = c;
  const jog = Math.sin(eb * Math.PI * 4);            // 2 jog steps per beat
  const pump = Math.abs(Math.sin(eb * Math.PI * 2)); // fist up once per beat
  applyPose(c, {
    py: 0.11 + Math.abs(jog) * 0.02 * A, spx: 0.08,
    thL: REST_LEG_X + Math.max(0, jog) * 0.35 * A, thR: REST_LEG_X + Math.max(0, -jog) * 0.35 * A,
    shL: REST_LEG_X + Math.max(0, jog) * 0.25, shR: REST_LEG_X + Math.max(0, -jog) * 0.25,
    uaRx: 0.30 + pump * 1.2 * A, uaRz: -0.05, foRx: -1.3 + pump * 0.5,
    uaLx: 0.40, uaLz: 0.12, foLx: -1.0, hx: -0.06, hy: pump * 0.06 * A,
  });
}

// AD. Ceili step — high-energy, springy Irish-style skips for fast beats.
function ceiliStep(c) {
  const { A, elapsedBeats: eb } = c;
  const bf = eb - Math.floor(eb);
  const hop = Math.max(0, Math.sin(bf * Math.PI));   // spring per beat
  const legL = Math.floor(eb) % 2 === 0;
  applyPose(c, {
    py: 0.11 + hop * 0.07 * A, spx: 0.04, prz: (legL ? 1 : -1) * 0.03 * A,
    thL: REST_LEG_X + (legL ? hop * 0.5 * A : hop * 0.15 * A), thR: REST_LEG_X + (legL ? hop * 0.15 * A : hop * 0.5 * A),
    shL: REST_LEG_X + (legL ? hop * 0.4 : 0.05), shR: REST_LEG_X + (legL ? 0.05 : hop * 0.4),
    uaLz: 0.08, uaRz: -0.08, uaLx: REST_ARM_X, uaRx: REST_ARM_X, foLx: -0.2, foRx: -0.2, hx: -0.10,
  });
}

// AE. Rave low-ride — a deep, sustained squat held low while feet keep bouncing.
function raveLowRide(c) {
  const { A, elapsedBeats: eb } = c;
  const b2 = Math.abs(Math.sin(eb * Math.PI * 2));   // fast foot bounce
  const settle = smoothstep(Math.min(1, eb / 2));    // ease into the squat on entry
  const sway = Math.sin(eb * Math.PI);
  applyPose(c, {
    py: 0.11 - settle * 0.10 * A - b2 * 0.03 * A, spx: 0.12, prz: sway * 0.06 * A, chz: sway * 0.06 * A,
    thL: REST_LEG_X + settle * 0.4 * A + b2 * 0.1 * A, thR: REST_LEG_X + settle * 0.4 * A + b2 * 0.1 * A,
    shL: REST_LEG_X + settle * 0.45 * A + b2 * 0.12 * A, shR: REST_LEG_X + settle * 0.45 * A + b2 * 0.12 * A,
    uaLz: 0.25, uaRz: -0.25, uaLx: REST_ARM_X + 0.15, uaRx: REST_ARM_X + 0.15, foLx: -0.8, foRx: -0.8,
    hx: -0.06, hz: sway * 0.05 * A,
  });
}

// AF. Body roll snap — whipping the torso back and forth to mimic sharp hi-hats.
function bodyRollSnap(c) {
  const { A, elapsedBeats: eb } = c;
  const snap = Math.sin(eb * Math.PI * 4);           // fast
  applyPose(c, {
    py: 0.11 - Math.abs(snap) * 0.02 * A, spx: 0.10 + Math.max(0, snap) * 0.25 * A, chz: snap * 0.06 * A, prz: snap * 0.05 * A,
    thL: REST_LEG_X + Math.abs(snap) * 0.08 * A, thR: REST_LEG_X + Math.abs(snap) * 0.08 * A,
    shL: REST_LEG_X + Math.abs(snap) * 0.1, shR: REST_LEG_X + Math.abs(snap) * 0.1,
    uaLz: 0.18, uaRz: -0.18, uaLx: REST_ARM_X + 0.1, uaRx: REST_ARM_X + 0.1, foLx: -0.7, foRx: -0.7,
    hx: -0.10 - Math.max(0, snap) * 0.25 * A,
  });
}

// `affinity` tags which instrument register a move's vocabulary suits — used to
// WEIGHT (not gate) the pick in updateMoveSelection. Untagged moves get a flat
// baseline weight regardless of the mix, so the vocabulary never narrows.
const MOVE_TABLE = {
  grooveSway: { beats: 8, pool: ['idle', 'low', 'high'], run: grooveSway },
  strike: { beats: 8, pool: ['high'], run: strike },
  stepTouch: { beats: 4, pool: ['high'], affinity: 'low', run: stepTouch },
  tribalStomp: { beats: 4, pool: ['idle', 'low', 'high'], affinity: 'low', run: tribalStomp },
  polyStep: { beats: 6, pool: ['low', 'high'], mirrored: true, affinity: 'high', run: polyStep },
  // ── techno floor moves (M–AF) ──
  italianStomp: { beats: 4, pool: ['low', 'high'], affinity: 'low', run: italianStomp },
  melbourneShuffle: { beats: 4, pool: ['low', 'high'], affinity: 'high', run: melbourneShuffle },
  runningMan: { beats: 4, pool: ['idle', 'low', 'high'], affinity: 'low', run: runningMan },
  tStep: { beats: 4, pool: ['low', 'high'], affinity: 'high', run: tStep },
  hakken: { beats: 4, pool: ['low', 'high'], affinity: 'low', run: hakken },
  jumpstyle: { beats: 4, pool: ['low', 'high'], affinity: 'low', run: jumpstyle },
  industrialStomp: { beats: 4, pool: ['low', 'high'], affinity: 'low', run: industrialStomp },
  turboArms: { beats: 2, pool: ['low', 'high'], affinity: 'high', run: turboArms },
  doubleTimeBounce: { beats: 2, pool: ['idle', 'low', 'high'], affinity: 'low', run: doubleTimeBounce },
  bassDropJump: { beats: 4, pool: ['high'], affinity: 'low', run: bassDropJump },
  floorSlap: { beats: 4, pool: ['low', 'high'], mirrored: true, affinity: 'low', run: floorSlap },
  mosherChop: { beats: 2, pool: ['low', 'high'], affinity: 'high', run: mosherChop },
  windmill: { beats: 4, pool: ['low', 'high'], affinity: 'mid', run: windmill },
  kickStep: { beats: 4, pool: ['low', 'high'], mirrored: true, affinity: 'low', run: kickStep },
  sideToSideSprint: { beats: 4, pool: ['low', 'high'], affinity: 'low', run: sideToSideSprint },
  shoulderJacks: { beats: 2, pool: ['high'], affinity: 'high', run: shoulderJacks },
  fistPumpSprint: { beats: 2, pool: ['low', 'high'], affinity: 'high', run: fistPumpSprint },
  ceiliStep: { beats: 4, pool: ['idle', 'low', 'high'], affinity: 'mid', run: ceiliStep },
  raveLowRide: { beats: 2, pool: ['low', 'high'], affinity: 'low', run: raveLowRide },
  bodyRollSnap: { beats: 2, pool: ['low', 'high'], affinity: 'high', run: bodyRollSnap },
};

// Weighted pick: `weights[i]` is the relative chance of `names[i]`.
function weightedPick(names, weights) {
  let total = 0; for (let i = 0; i < weights.length; i++) total += weights[i];
  if (!(total > 0)) return names[Math.floor(Math.random() * names.length)];
  let r = Math.random() * total;
  for (let i = 0; i < names.length; i++) { r -= weights[i]; if (r <= 0) return names[i]; }
  return names[names.length - 1];
}

// ── one featured dancer's per-rig state (was createRigState) ─────────────
// A plain data holder: the rig-agnostic proxy/adapter set, the loaded model +
// groups, this rig's move-selection state, its persistent asymmetry, and the
// calibrated fit placeDuet re-derives from each frame. The ambient crowd clones
// and the Way Big giant use structurally-identical plain objects (built inline
// in buildAmbientInstance / onGiantLoaded) since they carry a few extra
// lifecycle fields; dance()/applyRig()/placeDuet() duck-type across all of them.
class Rig {
  constructor(cfg) {
    this.cfg = cfg;
    this.rigGroup = null; this.turnGroup = null; this.model = null;
    this.skinnedMeshes = []; this.bones = null;
    this.proxies = {}; this.adapters = []; this.retargetReport = null;
    this.pelvisBone = null; this.pelvisBind = null;
    this.modelReady = false; this.triCount = 0; this.vertCount = 0;
    this.frameBonesCache = null;
    this.currentMoveName = 'grooveSway'; this.currentMove = null;
    this.moveStartBeat = 0; this.moveMirror = 1; this.prevDrop = false;
    this.moveAmp = 1; this.movePhaseOfs = 0;   // per-move-instance jitter
    this.headTrail = 0;   // secondary-motion memory for the head (grooveSway only), per-rig
    this.idlePhase = 0; this.leanSign = 1;
    this.baseX = 0; this.baseY = 0; this.baseZ = 0; this.baseScale = 1;
    this.fitX = 0; this.fitY = 0; this.fitZ = 0;
    this.duetAnchor = null;
  }
}

// ── the engine ───────────────────────────────────────────────────────────
class KineticDancer {
  constructor(THREE, ambientCanvas) {
    this.THREE = THREE;
    this.ambientCanvas = ambientCanvas;

    // shared materials (both rigs): chrome body matcap + wireframe accent
    this.chromeMatcapTex = this.makeChromeMatcap();
    this.auraTex = this.makeAuraTexture();
    this.chromeMats = [];
    this.wireMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff, wireframe: true, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, skinning: true });
    this.disposables = [this.wireMat, this.chromeMatcapTex, this.auraTex];

    // lifecycle
    this.running = true; this.raf = 0; this.dead = false;

    // ambient crowd context (shared with the featured duet)
    this.ambientRenderer = null; this.ambientScene = null; this.ambientCamera = null;
    this.ambientInited = false; this.ambientEnabled = false; this.ambientLive = false; this.ambientNeedsClear = false;
    this.ambientSpawnTimer = 0; this.spawnSeq = 0;
    this.ambientPool = [];
    this.ambientDisposables = [];
    const _cores = navigator.hardwareConcurrency || 4;
    const _mem = navigator.deviceMemory || 4;
    this.AMBIENT_MAX = (_cores >= 8 && _mem >= 8) ? 20 : (_cores <= 4 || _mem <= 4) ? 12 : 16;
    this._ndc = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._vec = new THREE.Vector3();

    // giant presenter
    this.giant = null; this.giantLoading = false; this.giantFailed = false;
    this.giantOpacity = 0; this.giantDropHi = false; this.dropBurstTimer = 0;
    this.crowdReady = false; this.crowdArmed = false; this.crowdArmTimer = 0;
    this.presenterShown = false;
    this.welcomeArmed = false; this.welcomeStarted = false; this.welcomeTimer = 0;

    // Arm the welcome on the gate-open signal kinetic.js dispatches.
    window.addEventListener('kinetic-gate-open', () => { this.welcomeArmed = true; }, { once: true });

    // shared music-driven state (both rigs read the same beat/energy)
    this.energy = 0.28; this.phase = 0;
    this.beatAccent = 0;
    this.ENV = null;
    this.trackInfo = {};
    this.idleBeatAccum = 0;

    // reusable scratch (no per-frame allocation)
    this._e = new THREE.Euler(0, 0, 0, 'XYZ');
    this._q = new THREE.Quaternion();

    // featured rigs + opposite dominant side / de-phased idle clock
    this.rigA = new Rig(RIG_A);
    this.rigB = new Rig(RIG_B);
    this.rigA.leanSign = 1;  this.rigA.idlePhase = 0;
    this.rigB.leanSign = -1; this.rigB.idlePhase = 1.7;
    this.rigA.duetAnchor = hasPartner
      ? { x: -0.46, y: -0.03, driftX: 0.05, driftY: 0.03,  speed: 0.05, phase: 0.0 }
      : { x: -0.06, y: -0.02, driftX: 0.06, driftY: 0.035, speed: 0.05, phase: 0.0 };
    this.rigB.duetAnchor = { x: 0.47, y: 0.04, driftX: 0.05, driftY: 0.03, speed: 0.045, phase: 1.9 };
    this.rigs = [this.rigA, ...(SHOW_FAIRY_PUNK ? [this.rigB] : [])];

    this.duetSetup = false;

    // authored choreography arc + its per-track edge-detect state
    this.ARCS = null;
    this.lastArcTrack = null; this.lastArcSection = null;

    // frameModel scratch
    this._corner = new THREE.Vector3(); this._c = new THREE.Vector3();

    // retarget scratch (shared live path + validation path)
    this._retargetScratch = { e: this._e, q: this._q, q2: new THREE.Quaternion() };

    // dangle-bone scratch
    this._dangleDown = new THREE.Vector3(0, -1, 0);
    this._dangleLocal = new THREE.Vector3();
    this._dangleTarget = new THREE.Vector3();
    this._dangleQ = new THREE.Quaternion();
    this._dangleDeltaQ = new THREE.Quaternion();

    // main loop
    this.last = 0;
    this.frame = this.frame.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);

    // envelope + arc fetches (once)
    fetch('assets/audio/techno/envelopes.json').then(r => r.ok ? r.json() : null).then(j => {
      if (!j || !j.tracks) return;
      this.ENV = j;
      for (const name in j.tracks) {
        const tr = j.tracks[name];
        if (tr && tr.env && tr.env.length) this.trackInfo[name] = analyzeEnv(j.fps || 25, tr.env, tr.onsets || []);
      }
    }).catch(() => {});
    fetch('assets/audio/techno/choreo-arcs.json').then(r => r.ok ? r.json() : null).then(j => {
      if (j && j.tracks) this.ARCS = j.tracks;
    }).catch(() => {});
  }

  // ── procedural chrome matcap (no network fetch) ──────────────────────
  makeChromeMatcap() {
    const THREE = this.THREE;
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#141518';
    ctx.fillRect(0, 0, size, size);
    const hlX = size * 0.36, hlY = size * 0.32;
    const key = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, size * 0.85);
    key.addColorStop(0, '#fbfcfd');
    key.addColorStop(0.16, '#e7ebee');
    key.addColorStop(0.36, '#aeb6ba');
    key.addColorStop(0.58, '#666d70');
    key.addColorStop(0.8, '#2c2f31');
    key.addColorStop(1, '#141518');
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, size, size);
    const rim = ctx.createRadialGradient(size * 0.75, size * 0.82, 0, size * 0.75, size * 0.82, size * 0.4);
    rim.addColorStop(0, 'rgba(120,220,255,0.22)');
    rim.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // Soft radial glow for the giant's aura sprites (one texture, reused).
  makeAuraTexture() {
    const THREE = this.THREE;
    const s = 128, c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.82)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  // One chrome material PER UNIQUE diffuse texture (or the map-less armadrillo
  // tint). Built lazily as meshes load; pushed into chromeMats (the per-frame
  // beat-illumination loop iterates it) + disposables.
  getChromeMat(srcMat) {
    const THREE = this.THREE;
    const map = srcMat && srcMat.map ? srcMat.map : null;
    const key = map ? map.uuid : 'none';
    for (const m of this.chromeMats) if (m.__key === key) return m;
    const opts = { matcap: this.chromeMatcapTex, color: map ? 0xffffff : ARMADRILLO_TINT, skinning: true };
    if (map) opts.map = map;
    if (srcMat && srcMat.transparent) opts.transparent = true;
    if (srcMat && srcMat.alphaTest) opts.alphaTest = srcMat.alphaTest;
    if (srcMat && srcMat.side !== undefined) opts.side = srcMat.side;
    const mat = new THREE.MeshMatcapMaterial(opts);
    mat.__key = key;
    mat.__base = new THREE.Color(opts.color);   // pristine hue; beat-illum modulates brightness off this
    this.chromeMats.push(mat);
    this.disposables.push(mat);
    return mat;
  }

  // ── full-screen featured-duet placement ──────────────────────────────────
  // Positions each hero at its full-screen NDC anchor (duetAnchor) with a slow
  // drift, ON TOP of the calibrated fit captured by frameModel. Maps NDC→world
  // against the LIVE camera aspect every frame. Ownership: placeDuet owns
  // .x/.z/scale + baseY; dance() owns .y. Safe no-op until the fit runs.
  placeDuet(rigState, t) {
    const THREE = this.THREE;
    const cam = this.ambientCamera;
    if (!cam || !rigState.rigGroup) return;
    const anc = rigState.duetAnchor || { x: 0, y: 0, driftX: 0, driftY: 0, speed: 0, phase: 0 };
    const ndcX = anc.x + Math.sin(t * anc.speed + anc.phase) * anc.driftX;
    const ndcY = anc.y + Math.cos(t * anc.speed * 0.8 + anc.phase) * anc.driftY;
    const fovR = THREE.MathUtils.degToRad(cam.fov);
    const dist = Math.abs(cam.position.z - rigState.fitZ) || Math.abs(cam.position.z) || 8.4;
    const worldPerNDC = Math.tan(fovR / 2) * dist;      // world units per NDC half-height at the fit depth
    const aspect = cam.aspect > 0 ? cam.aspect : 1;
    rigState.baseX = rigState.fitX + ndcX * worldPerNDC * aspect;
    rigState.baseY = rigState.fitY + ndcY * worldPerNDC;
    rigState.baseZ = rigState.fitZ;
    rigState.rigGroup.position.x = rigState.baseX;
    rigState.rigGroup.position.z = rigState.baseZ;
    rigState.rigGroup.scale.setScalar(rigState.baseScale * FEATURED_SCALE_MULT);
    // dance() writes rigGroup.position.y each frame from baseY (weight bounce).
  }

  // Create the featured duet's rig groups + kick off both glTF loads, adding
  // them to the SHARED ambient scene. Idempotent (guarded by duetSetup).
  setupDuet() {
    const THREE = this.THREE;
    if (this.duetSetup || !this.ambientScene || !this.ambientCamera || this.dead || !THREE.GLTFLoader) return;
    this.duetSetup = true;
    for (const rigState of this.rigs) {
      rigState.rigGroup = new THREE.Group();
      rigState.rigGroup.rotation.y = (rigState.cfg.faceSpin != null) ? rigState.cfg.faceSpin : FACE_SPIN;
      this.ambientScene.add(rigState.rigGroup);

      // whole-figure sway pivot (dance's b.root.rotation.y — the slow 3/4 turn)
      rigState.turnGroup = new THREE.Group();
      rigState.rigGroup.add(rigState.turnGroup);

      const loader = new THREE.GLTFLoader();
      try {
        if (THREE.DRACOLoader) {
          const draco = new THREE.DRACOLoader();
          draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
          loader.setDRACOLoader(draco);
        }
      } catch (_) { /* DRACO optional — neither asset is draco-compressed */ }

      loader.load(rigState.cfg.url, (gltf) => this.onModelLoaded(rigState, gltf), undefined, () => { /* load error → that rig stays absent, fail safe */ });
    }
  }

  // ── on model load: wire the rig, retarget the dance ──────────────────────
  onModelLoaded(rigState, gltf) {
    const THREE = this.THREE;
    if (this.dead) return;
    const model = gltf.scene;
    rigState.model = model;

    // chrome base pass on every mesh + a thin wireframe ACCENT pass on a clone.
    // Collect the mesh list first, THEN clone+append (mutating the scene graph
    // mid-traversal is unsafe).
    const meshList = [];
    model.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshList.push(o); });
    for (const o of meshList) {
      const srcMat = o.material;
      o.material = this.getChromeMat(srcMat);
      o.frustumCulled = false;   // skinned bounds move; don't let it cull out
      if (o.isSkinnedMesh) rigState.skinnedMeshes.push(o);
      const g = o.geometry;
      if (g && g.attributes && g.attributes.position) {
        rigState.vertCount += g.attributes.position.count;
        rigState.triCount += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
      // Skip the circuitry-accent pass for hair (thin strand tris wash out),
      // identified by the SOURCE material's name.
      const isHair = !!(srcMat && srcMat.name && /hair/i.test(srcMat.name));
      if (!isHair) {
        const wireOverlay = o.clone();
        wireOverlay.material = this.wireMat;
        wireOverlay.frustumCulled = false;
        wireOverlay.renderOrder = (o.renderOrder || 0) + 1;
        if (o.parent) o.parent.add(wireOverlay);
      }
    }

    // ── retarget via the portable engine (dance-retarget.js) ──────────────
    rigState.proxies = createProxyRig(THREE);
    const hints = makeExplicitHints(rigState.cfg);
    const driveRoles = rigState.cfg.extraRoles ? CORE_ROLES.concat(rigState.cfg.extraRoles) : CORE_ROLES;
    const rig = buildRig(THREE, {
      model, nameOf: rigState.cfg.nameOf, driveRoles,
      hints, proxies: rigState.proxies,
    });
    rigState.adapters = rig.adapters;
    rigState.pelvisBone = rig.pelvisBone;
    rigState.pelvisBind = rig.pelvisBind;
    rigState.retargetReport = rig.report;

    // ── frame: fit this rig using its mapped bones, then slot it ──────────
    rigState.turnGroup.add(model);
    this.frameModel(rigState, rig.boneByRole);

    // Honest measurement (once, at load, diagnostics only).
    try {
      const cmp = measureAutoVsManual(THREE, rig.adapters, rig.bodyFrameQ, AUTO_PROBES);
      rigState.retargetReport.autoVsManual = cmp;
      const tag = rigState.cfg.url.split('/').slice(-2, -1)[0];
      console.info('[kinetic-dancer] retarget', tag, '| driven', rig.report.driven.length,
        '| bodyFrame', rig.report.bodyFrame, '| auto-vs-manual worst',
        cmp.worstErrDeg + 'deg at', cmp.worstRole, cmp.rows);
    } catch (_) { /* diagnostics only, never block the dancer */ }

    // dance-facing rig: proxies for every role, the real turnGroup for `root`.
    rigState.bones = { root: rigState.turnGroup };
    for (const role in rigState.proxies) rigState.bones[role] = rigState.proxies[role];

    rigState.currentMove = MOVE_TABLE.grooveSway;
    rigState.modelReady = true;

    // Non-anatomical dangle bones (fairy-punk only) — collect real THREE.Bone refs.
    if (rigState.cfg.danglers) {
      rigState.danglerBones = {};
      model.traverse((o) => {
        if (o.isBone && rigState.cfg.danglers.includes(o.name)) rigState.danglerBones[o.name] = o;
      });
    }
  }

  // ── fit + centre + slot a rig into its duet position (projected) ──────────
  frameModel(rigState, boneByRole) {
    const THREE = this.THREE;
    if (!rigState.model || !this.ambientCamera) return;
    if (!rigState.frameBonesCache) {
      rigState.frameBonesCache = boneByRole ? Object.values(boneByRole) : [];
      if (!rigState.frameBonesCache.length) rigState.model.traverse(o => { if (o.isBone) rigState.frameBonesCache.push(o); });
    }
    const frameBones = rigState.frameBonesCache;
    if (!frameBones.length) return;
    this.ambientCamera.updateMatrixWorld(true);
    const fovR = THREE.MathUtils.degToRad(this.ambientCamera.fov);
    const worldPerNDC = Math.tan(fovR / 2) * Math.abs(this.ambientCamera.position.z);   // ≈ world units per NDC half-height
    let s = rigState.rigGroup.scale.x || 1;
    const FIT_H = rigState.cfg.fitH, FIT_W = rigState.cfg.fitW;
    for (let iter = 0; iter < 8; iter++) {
      rigState.rigGroup.updateMatrixWorld(true);
      let cx = 0, cz = 0, ymin = Infinity, ymax = -Infinity;
      for (const bn of frameBones) { bn.getWorldPosition(this._c); cx += this._c.x; cz += this._c.z; }
      cx /= frameBones.length; cz /= frameBones.length;
      rigState.rigGroup.position.x -= cx; rigState.rigGroup.position.z -= cz;
      rigState.rigGroup.updateMatrixWorld(true);
      let xmin = Infinity, xmax = -Infinity;
      for (const bn of frameBones) {
        bn.getWorldPosition(this._corner).project(this.ambientCamera);
        if (this._corner.y < ymin) ymin = this._corner.y;
        if (this._corner.y > ymax) ymax = this._corner.y;
        if (this._corner.x < xmin) xmin = this._corner.x;
        if (this._corner.x > xmax) xmax = this._corner.x;
      }
      const fracY = (ymax - ymin) / 2;                 // NDC vertical span → fraction of viewport height
      const fracX = (xmax - xmin) / 2;                 // NDC horizontal span → fraction of viewport width
      const yc = (ymax + ymin) / 2;                    // projected vertical centre (NDC)
      if (fracY < 1e-3) break;
      rigState.rigGroup.position.y -= yc * worldPerNDC;              // bring the on-screen centre to the middle
      const kY = FIT_H / fracY;
      const kX = fracX > 1e-3 ? FIT_W / fracX : Infinity;
      const k = Math.min(kY, kX);
      s *= k;
      rigState.rigGroup.scale.setScalar(s);
      if (Math.abs(k - 1) < 0.01 && Math.abs(yc) < 0.01) break;
    }
    rigState.fitX = rigState.rigGroup.position.x;
    rigState.fitY = rigState.rigGroup.position.y;
    rigState.fitZ = rigState.rigGroup.position.z;
    rigState.baseScale = rigState.rigGroup.scale.x;
    rigState.baseX = rigState.fitX; rigState.baseY = rigState.fitY; rigState.baseZ = rigState.fitZ;
  }

  // ── energy + beat, from the repo's existing offline envelope engine ──────
  readRawEnergy(t) {
    const ls = appState.lightshow;
    // Number.isFinite, NOT typeof — a NaN energy would make the whole figure vanish.
    if (ls && Number.isFinite(ls.energy)) return Math.max(0, Math.min(1, ls.energy));
    return 0.28 + 0.06 * Math.sin(t * 0.5);   // idle breath when the lightshow is absent
  }

  // Real per-beat loudness, sampled from the offline RMS envelope.
  beatStrength(trackName, beatCenterT) {
    const tr = this.ENV && this.ENV.tracks && this.ENV.tracks[trackName];
    const env = tr && tr.env;
    if (!env || !env.length) return 0.6;               // fail-safe neutral
    const fps = (this.ENV.fps && this.ENV.fps > 0) ? this.ENV.fps : 25;
    const center = Math.round(beatCenterT * fps);
    let peak = 0, found = false;
    for (let d = -1; d <= 2; d++) {
      const i = center + d;
      if (i < 0 || i >= env.length) continue;
      const v = env[i];
      if (Number.isFinite(v)) { peak = Math.max(peak, v); found = true; }
    }
    return found ? Math.max(0, Math.min(1, peak)) : 0.6;
  }

  // Instrument-band mix at time `tSec` (normalized so it's a mix, not loudness).
  bandMix(trackName, tSec) {
    const tr = this.ENV && this.ENV.tracks && this.ENV.tracks[trackName];
    if (!tr || !tr.envLow || !tr.envMid || !tr.envHigh) return { low: 0.33, mid: 0.34, high: 0.33 };
    const fps = (this.ENV.fps && this.ENV.fps > 0) ? this.ENV.fps : 25;
    const sampleAt = (arr) => {
      const i = Math.round(tSec * fps);
      return (i >= 0 && i < arr.length && Number.isFinite(arr[i])) ? arr[i] : 0;
    };
    const low = sampleAt(tr.envLow), mid = sampleAt(tr.envMid), high = sampleAt(tr.envHigh);
    const sum = low + mid + high;
    if (sum < 1e-4) return { low: 0.33, mid: 0.34, high: 0.33 };
    return { low: low / sum, mid: mid / sum, high: high / sum };
  }

  currentSection(trackName, t) {
    const arc = this.ARCS && this.ARCS[trackName];
    if (!arc || !arc.sections) return null;
    const secs = arc.sections;
    for (let i = 0; i < secs.length; i++) if (t >= secs[i].t0 && t < secs[i].t1) return secs[i].type;
    return null;
  }

  // Returns the gesture-phase RATE (Hz) + on-beat accent + bar-grid beatPos.
  musicClock(dt) {
    const m = appState.music, a = m && m.audio;
    const playing = !!(a && !m.paused && !a.paused && a.currentTime > 0.05);
    const info = playing && a._trackName && this.trackInfo[a._trackName];

    const arcTrackName = a && a._trackName;
    const arcSection = (playing && arcTrackName) ? this.currentSection(arcTrackName, a.currentTime) : null;
    if (arcTrackName !== this.lastArcTrack) { this.lastArcTrack = arcTrackName; this.lastArcSection = null; }
    const arcDropEdge = arcSection === 'drop' && this.lastArcSection !== 'drop';
    this.lastArcSection = arcSection;

    if (info && Number.isFinite(info.beatPeriod) && info.beatPeriod > 0.05) {
      const tempoScale = info.bpm >= 140 ? 2 : 1;   // half-time at high BPM (bigger, slower per beat)
      const beatPos = (a.currentTime - info.t0) / info.beatPeriod;
      const beatIndex = Math.floor(beatPos);
      const beatPhase = beatPos - beatIndex;          // 0 = on the beat
      const barWeight = BAR_WEIGHT[beatIndex & 3];
      const beatCenterT = info.t0 + beatIndex * info.beatPeriod;
      const strength = this.beatStrength(a._trackName, beatCenterT);   // 0..1, THIS beat's real loudness
      const hashN = Math.sin(beatIndex * 12.9898) * 43758.5453;
      const beatJitter = 0.78 + 0.44 * (hashN - Math.floor(hashN));   // ~0.78..1.22, deterministic per beat index
      return {
        rateHz: 1 / (N_BEATS * info.beatPeriod * tempoScale),
        accent: Math.pow(1 - beatPhase, 4) * barWeight * (0.4 + strength * 0.9) * beatJitter,
        beatPos, tempoScale, bpm: info.bpm, locked: true, strength, arcSection, arcDropEdge,
      };
    }
    // idle free-run (no music yet): keep it LIVELY, no beat accent.
    this.idleBeatAccum += (Number.isFinite(dt) ? dt : 0.016) / IDLE_BEAT_PERIOD;
    return { rateHz: 0.42 + this.energy * 0.15, accent: 0, beatPos: this.idleBeatAccum, tempoScale: 1, bpm: 0, locked: false, strength: 0.6, arcSection, arcDropEdge };
  }

  // Re-selects rigState's active move every 8 beats, AND immediately on a drop's
  // rising edge. Context gates the eligible pool; WITHIN it the pick is weighted
  // toward the instrument mix (bandMix). Called independently per rig.
  updateMoveSelection(rigState, clk) {
    const drop = !!(appState.lightshow && appState.lightshow.drop);
    const arcCtx = clk.arcSection === 'drop' ? 'high' : clk.arcSection === 'breakdown' ? 'idle' : null;
    const ctx = arcCtx || (!clk.locked ? 'idle' : (drop ? 'high' : 'low'));

    // Strike fires in unison on EITHER trigger: the live reactive drop signal OR
    // the authored arc entering its known 'drop' section (clk.arcDropEdge).
    if ((drop && !rigState.prevDrop) || clk.arcDropEdge) {
      rigState.currentMoveName = 'strike'; rigState.currentMove = MOVE_TABLE.strike;
      rigState.moveStartBeat = clk.beatPos; rigState.moveMirror = 1;
      rigState.moveAmp = 0.94 + Math.random() * 0.12; rigState.movePhaseOfs = 0;   // drop accent stays tight/on-time
      rigState.prevDrop = drop;
      return;
    }
    rigState.prevDrop = drop;

    const tempoScale = clk.tempoScale || 1;
    const period = Math.max(8, (rigState.currentMove && rigState.currentMove.beats) || 8);
    // `!currentMove` forces the very first pick.
    if (!rigState.currentMove || (clk.beatPos - rigState.moveStartBeat) / tempoScale >= period) {
      // anti-repeat: drop the move that just finished so nothing plays twice in a row.
      const eligible = (extra) => Object.keys(MOVE_TABLE).filter((n) =>
        n !== 'strike' && n !== extra && MOVE_TABLE[n].pool.includes(ctx));
      let pool = eligible(rigState.currentMoveName);
      if (!pool.length) pool = eligible(null);
      let name = 'grooveSway';
      if (pool.length) {
        const a = appState.music && appState.music.audio;
        const mix = (clk.locked && a && a._trackName) ? this.bandMix(a._trackName, a.currentTime) : { low: 0.33, mid: 0.34, high: 0.33 };
        const weights = pool.map((n) => {
          const aff = MOVE_TABLE[n].affinity;
          return aff ? 0.5 + mix[aff] * 3 : 1;   // untagged: flat baseline; tagged: lean toward their band
        });
        name = weightedPick(pool, weights);
      }
      rigState.currentMoveName = name; rigState.currentMove = MOVE_TABLE[name];
      rigState.moveStartBeat = clk.beatPos;
      rigState.moveMirror = (rigState.currentMove.mirrored && Math.random() < 0.5) ? -1 : 1;
      // Per-instance variation, rolled fresh each pick (see dance()).
      rigState.moveAmp = 0.88 + Math.random() * 0.24;          // 0.88..1.12
      rigState.movePhaseOfs = (Math.random() - 0.5) * 0.5;     // ±0.25 beat
    }
  }

  // ── hair/cloth "dangle" bones (fairy-punk only) ──
  // Spring-ease a joint's rest direction toward a blend of (a) its rest and (b)
  // "world down" re-expressed in the joint's PARENT-local frame — cheap gravity
  // settle in normalized DIRECTION space (a cheaper cousin of a verlet chain).
  updateDangleBone(bone, dt, profile, gravityWeight) {
    if (!bone.parent) return;
    if (!bone._restDir) bone._restDir = bone.position.clone().normalize();
    if (!bone._dangleDir) {
      bone._dangleDir = { x: bone._restDir.x, y: bone._restDir.y, z: bone._restDir.z, _vx: 0, _vy: 0, _vz: 0 };
    }
    this._dangleQ.setFromRotationMatrix(bone.parent.matrixWorld);
    this._dangleLocal.copy(this._dangleDown).applyQuaternion(this._dangleQ.invert());
    this._dangleTarget.copy(bone._restDir).lerp(this._dangleLocal, gravityWeight).normalize();
    const d = bone._dangleDir;
    springStep(d, 'x', this._dangleTarget.x, dt, profile);
    springStep(d, 'y', this._dangleTarget.y, dt, profile);
    springStep(d, 'z', this._dangleTarget.z, dt, profile);
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    this._dangleTarget.set(d.x / len, d.y / len, d.z / len);
    this._dangleDeltaQ.setFromUnitVectors(bone._restDir, this._dangleTarget);
    bone.quaternion.copy(this._dangleDeltaQ);
  }

  updateDanglers(rigState, dt) {
    const d = rigState.danglerBones;
    if (!d) return;
    if (d.HairMid) this.updateDangleBone(d.HairMid, dt, SPRING_HAIR, 0.55);
    if (d.HairTip) this.updateDangleBone(d.HairTip, dt, SPRING_HAIR, 0.72);
    if (d.WingTipL) this.updateDangleBone(d.WingTipL, dt, SPRING_CLOTH, 0.35);
    if (d.WingTipR) this.updateDangleBone(d.WingTipR, dt, SPRING_CLOTH, 0.35);
  }

  // ── the dance (per rig) ────────────────────────────────────────────────
  dance(rigState, dt, t, clk) {
    const energy = this.energy, phase = this.phase, beatAccent = this.beatAccent;
    const b = rigState.bones;
    const k = 1 - Math.pow(0.001, dt);         // framerate-independent damping
    const strength = Number.isFinite(clk.strength) ? clk.strength : 0.6;   // THIS beat's real envelope loudness
    let A = 0.9 + energy * 0.55 + strength * 0.35;
    if (A > 1.35) A = 1.35;
    const hit = beatAccent * (0.6 + energy * 0.5);   // music-locked on-beat accent
    const p = phase;
    const s = Math.max(-1, Math.min(1, Math.sin(p) + 0.12 * Math.sin(2 * p + 0.6)));

    const tgt = (euler, axis, target) => springStep(euler, axis, target, dt, euler.__heavy ? SPRING_HEAVY : SPRING_LIGHT);
    const set = (vec, axis, target) => springStep(vec, axis, target, dt, vec.__heavy ? SPRING_HEAVY : SPRING_LIGHT);
    const add = (obj, axis, extra) => { obj[axis] += extra * k * 3; };

    this.updateMoveSelection(rigState, clk);
    // Per-instance amplitude/timing jitter (rolled once per move selection).
    const A_j = A * (rigState.moveAmp || 1);
    let elapsedBeats = Math.max(0, (clk.beatPos - rigState.moveStartBeat) / (clk.tempoScale || 1));
    elapsedBeats = Math.max(0, elapsedBeats + (rigState.movePhaseOfs || 0));
    rigState.currentMove.run({ b, tgt, set, add, A: A_j, hit, p, s, dt, elapsedBeats, mirror: rigState.moveMirror, rig: rigState });
    if (!rigState.currentMove.extras) restExtras(b, tgt);

    // ── shared, always-on GROOVE — the weight engine every move rides on ──
    const beatFrac = clk.beatPos - Math.floor(clk.beatPos);
    const onBeat = 0.5 + 0.5 * Math.cos(beatFrac * Math.PI * 2);   // 1 on the beat → 0 mid-beat
    const grv = 0.7 + 0.4 * energy + 0.35 * (Number.isFinite(clk.strength) ? clk.strength : 0.6);   // high floor
    const figRatio = (rigState.rigGroup.scale.y || 1) / (rigState.baseScale || 1);
    rigState.rigGroup.position.y = rigState.baseY - BOUNCE_MAX * figRatio * onBeat * grv;

    add(b.pelvis.position, 'y', -hit * 0.06);
    add(b.thighL.rotation, 'x', hit * 0.16 * grv);
    add(b.thighR.rotation, 'x', hit * 0.16 * grv);
    add(b.shinL.rotation, 'x', hit * 0.20 * grv);   // knees fold to absorb the drop
    add(b.shinR.rotation, 'x', hit * 0.20 * grv);
    add(b.spine.rotation, 'x', hit * 0.06);
    tgt(b.root.rotation, 'y', Math.sin(p * 0.5) * 0.16);

    // Persistent per-rig asymmetry (dominant-side lean + slow de-phased idle sway).
    const idle = t * 0.6 + rigState.idlePhase;
    rigState.rigGroup.rotation.z = rigState.leanSign * (0.045 + 0.02 * Math.sin(idle));
    rigState.rigGroup.rotation.x = 0.015 * Math.sin(idle * 0.73 + 0.5);
  }

  // ── adapter: proxy joints → real bone transforms (per rig) ────────────────
  applyRig(rigState) {
    applyAdapters(rigState.adapters, this._retargetScratch);
    applyPelvisSway(rigState.pelvisBone, rigState.pelvisBind, rigState.proxies.pelvis.position, rigState.cfg.posScale);
  }

  // ── build (evaluate the width gate; the RAF starts in run()) ──────────────
  build() {
    this.evalAmbientGate();
    window.addEventListener('resize', () => { this.sizeAmbient(); this.evalAmbientGate(); }, { passive: true });
  }

  // Lazily create the shared renderer the first time the viewport is wide enough.
  initAmbient() {
    const THREE = this.THREE;
    if (this.ambientInited || !this.ambientCanvas || !window.THREE || !THREE.SkeletonUtils || this.dead) return;
    this.ambientInited = true;
    try {
      this.ambientRenderer = new THREE.WebGLRenderer({ canvas: this.ambientCanvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      this.ambientRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      // ONE shared context: its loss is FATAL to the whole scene. Stop, dispose,
      // tear down, stay down (transparent canvas).
      this.ambientCanvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault(); this.stop(); this.dead = true;
        try { for (const g of this.disposables) g.dispose(); } catch (_) {}
        try { this.disposeAmbient(); } catch (_) {}
      }, false);
      this.ambientScene = new THREE.Scene();
      // fov 38, z 8.4, full-viewport aspect.
      this.ambientCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      this.ambientCamera.position.set(0, 0.05, 8.4);
      this.ambientCamera.lookAt(0, -0.05, 0);
      this.sizeAmbient();
      this.ambientCamera.updateMatrixWorld(true);   // unproject() (placeAtNDC) needs a current world matrix
    } catch (_) { this.ambientRenderer = null; }
  }

  // Size the shared renderer/camera to the FULL viewport.
  sizeAmbient() {
    if (!this.ambientRenderer || !this.ambientCamera) return;
    const w = window.innerWidth || 1280, h = window.innerHeight || 720;
    this.ambientRenderer.setSize(w, h, false);
    this.ambientCamera.aspect = w / h;
    this.ambientCamera.updateProjectionMatrix();
  }

  // Device gate: enable on tablet + desktop (≥768px) only; re-evaluated on resize.
  evalAmbientGate() {
    if (this.dead) return;
    const allow = (window.innerWidth || 0) >= AMBIENT_MIN_WIDTH;
    if (allow) {
      this.initAmbient();
      if (this.ambientRenderer) {
        this.setupDuet();   // add the featured pair to the shared scene + kick their loads (once)
        if (!this.ambientEnabled) { this.ambientEnabled = true; this.ambientSpawnTimer = 0.6; }
        if (this.welcomeStarted) this.crowdReady = true;   // re-enable after a resize once the welcome already ran
      }
    } else if (this.ambientEnabled) {
      this.ambientEnabled = false;
      this.despawnAllAmbient();
      this.resetPresenter();           // never leave the HUD hidden behind a frozen giant
      this.ambientNeedsClear = true;   // one final render to clear the canvas to transparent
    }
  }

  // Build ONE pooled armadrillo clone. Returns an inactive, hidden instance
  // already added to the ambient scene, or null.
  buildAmbientInstance() {
    const THREE = this.THREE;
    const src = this.rigA.model;
    if (!src || !this.ambientScene || !THREE.SkeletonUtils) return null;
    let clone;
    try { clone = THREE.SkeletonUtils.clone(src); } catch (_) { return null; }

    const rigGroup = new THREE.Group();
    const turnGroup = new THREE.Group();   // b.root — dance()'s slow 3/4 turn pivot
    rigGroup.add(turnGroup);
    turnGroup.add(clone);
    rigGroup.visible = false;

    // SkeletonUtils shares materials by reference → give this instance its OWN
    // clones so its opacity fade is independent (and disposable on teardown).
    const chromeMats = [], wireMats = [], skinnedMeshes = [];
    clone.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh)) return;
      o.frustumCulled = false;
      if (o.material === this.wireMat) {
        const w = this.wireMat.clone(); w.transparent = true; w.opacity = 0;
        o.material = w; wireMats.push(w); this.ambientDisposables.push(w);
      } else if (o.material) {
        const c = o.material.clone(); c.transparent = true; c.opacity = 0;
        c.__base = o.material.__base ? o.material.__base.clone() : (c.color ? c.color.clone() : null);   // carry the cyan body tint
        o.material = c; chromeMats.push(c); this.ambientDisposables.push(c);
      }
      if (o.isSkinnedMesh) skinnedMeshes.push(o);
    });

    // Own proxy + adapter set (armadrillo drives core roles only).
    const proxies = createProxyRig(THREE);
    const rig = buildRig(THREE, {
      model: clone, nameOf: RIG_A.nameOf, driveRoles: CORE_ROLES,
      hints: makeExplicitHints(RIG_A), proxies,
    });
    const bones = { root: turnGroup };
    for (const role in proxies) bones[role] = proxies[role];

    const inst = {
      cfg: RIG_A,
      rigGroup, turnGroup, model: clone, skinnedMeshes,
      proxies, adapters: rig.adapters, pelvisBone: rig.pelvisBone, pelvisBind: rig.pelvisBind,
      bones, chromeMats, wireMats,
      // lifecycle
      active: false, life: 'in', age: 0, opacity: 0, seq: 0,
      fadeIn: 0.4, fadeOut: 0.6, lifeDur: 6,
      // dance state (mirrors Rig's animated fields)
      currentMove: MOVE_TABLE.grooveSway, currentMoveName: 'grooveSway',
      moveStartBeat: 0, moveMirror: 1, prevDrop: false, moveAmp: 1, movePhaseOfs: 0,
      headTrail: 0, idlePhase: 0, leanSign: 1,
      baseX: 0, baseY: 0, baseZ: 0, baseScale: 1,
    };
    this.ambientScene.add(rigGroup);
    this.ambientPool.push(inst);
    return inst;
  }

  // Screen(NDC)→world at a chosen distance from the camera.
  placeAtNDC(inst, ndcX, ndcY, dist) {
    this._ndc.set(ndcX, ndcY, 0.5).unproject(this.ambientCamera);
    this._ndc.sub(this.ambientCamera.position).normalize();
    const px = this.ambientCamera.position.x + this._ndc.x * dist;
    const py = this.ambientCamera.position.y + this._ndc.y * dist;
    const pz = this.ambientCamera.position.z + this._ndc.z * dist;
    inst.rigGroup.position.set(px, py, pz);
    inst.baseX = px; inst.baseY = py; inst.baseZ = pz;   // dance() writes .y each frame from baseY
  }

  // Pick a screen-space (NDC) spot that gives other dancers SOME SPACE.
  pickSpacedNDC(self) {
    const others = [];
    for (let i = 0; i < this.ambientPool.length; i++) { const p = this.ambientPool[i]; if (p.active && p !== self && p.ndcX != null) others.push(p); }
    for (let i = 0; i < this.rigs.length; i++) { const r = this.rigs[i]; if (r.modelReady && r.duetAnchor) others.push({ ndcX: r.duetAnchor.x, ndcY: r.duetAnchor.y }); }
    let best = null, bestD = -1;
    for (let k = 0; k < 8; k++) {
      const x = (Math.random() * 2 - 1) * 0.85, y = (Math.random() * 2 - 1) * 0.85;
      let dmin = Infinity;
      for (let i = 0; i < others.length; i++) { const dx = x - others[i].ndcX, dy = y - others[i].ndcY; const d = Math.sqrt(dx * dx + dy * dy); if (d < dmin) dmin = d; }
      if (dmin >= MIN_NDC_SEP) return [x, y];
      if (dmin > bestD) { bestD = dmin; best = [x, y]; }
    }
    return best || [(Math.random() * 2 - 1) * 0.85, (Math.random() * 2 - 1) * 0.85];
  }

  // (Re)activate a pooled instance at a fresh spaced spot / facing / scale.
  activateInstance(inst) {
    const [ndcX, ndcY] = this.pickSpacedNDC(inst);
    inst.ndcX = ndcX; inst.ndcY = ndcY;                    // remembered so later spawns space off it
    const dist = 9.5 + Math.random() * 6.0;                // DEEP (9.5–15.5) — behind the giant (~8.4)
    this.placeAtNDC(inst, ndcX, ndcY, dist);
    inst.rigGroup.rotation.x = 0; inst.rigGroup.rotation.z = 0;
    inst.rigGroup.rotation.y = (Math.random() * 2 - 1) * 1.2;   // scattered facing (mostly toward camera)
    const scl = (this.rigA.baseScale || 1) * AMBIENT_SCALE_BASE * (0.4 + Math.random() * 0.5);
    inst.rigGroup.scale.setScalar(scl);
    inst.baseScale = this.rigA.baseScale || 1;
    // fresh, independent dance state
    inst.currentMove = MOVE_TABLE.grooveSway; inst.currentMoveName = 'grooveSway';
    inst.moveStartBeat = 0; inst.moveMirror = Math.random() < 0.5 ? -1 : 1; inst.prevDrop = false;
    inst.moveAmp = 1; inst.movePhaseOfs = 0; inst.headTrail = 0;
    inst.idlePhase = Math.random() * Math.PI * 2; inst.leanSign = Math.random() < 0.5 ? -1 : 1;
    // fresh lifecycle
    inst.life = 'in'; inst.age = 0; inst.opacity = 0;
    inst.lifeDur = 4 + Math.random() * 4;                   // live ~4–8s
    inst.active = true; inst.seq = ++this.spawnSeq;
    inst.rigGroup.visible = true;
  }

  deactivate(inst) {
    inst.active = false; inst.opacity = 0;
    if (inst.rigGroup) inst.rigGroup.visible = false;
  }

  despawnAllAmbient() { for (let i = 0; i < this.ambientPool.length; i++) if (this.ambientPool[i].active) this.deactivate(this.ambientPool[i]); }

  // One spawn request: reuse an idle instance, else build under the cap, else recycle oldest.
  requestSpawn() {
    if (!this.rigA.modelReady || !this.ambientRenderer || this.dead) return;
    let inst = null;
    for (let i = 0; i < this.ambientPool.length; i++) if (!this.ambientPool[i].active) { inst = this.ambientPool[i]; break; }
    if (!inst) {
      if (this.ambientPool.length < this.AMBIENT_MAX) inst = this.buildAmbientInstance();
      else {
        let oldest = null;
        for (let i = 0; i < this.ambientPool.length; i++) { const p = this.ambientPool[i]; if (p.active && (!oldest || p.seq < oldest.seq)) oldest = p; }
        inst = oldest;
      }
    }
    if (inst) this.activateInstance(inst);
  }

  // Per-frame ambient update: spawn scheduler, then advance each active instance.
  updateAmbient(dt, now, clk) {
    if (!this.crowdReady) {
      if (this.crowdArmed) { this.crowdArmTimer -= dt; if (this.crowdArmTimer <= 0) this.crowdReady = true; }
      if (!this.crowdReady) return;
    }
    const drive = Math.max(0, Math.min(1, (this.energy - 0.3) / 0.7));
    const target = Math.round(AMBIENT_MIN + (this.AMBIENT_MAX - AMBIENT_MIN) * drive);
    let activeCount = 0;
    for (let i = 0; i < this.ambientPool.length; i++) if (this.ambientPool[i].active) activeCount++;
    this.ambientSpawnTimer -= dt;
    if (this.ambientSpawnTimer <= 0) {
      if (activeCount < target) {
        this.requestSpawn();
        this.ambientSpawnTimer = activeCount < AMBIENT_MIN ? 0.12 : 0.45;
      } else if (activeCount > target) {
        let oldest = null;
        for (let i = 0; i < this.ambientPool.length; i++) { const p = this.ambientPool[i]; if (p.active && p.life !== 'out' && (!oldest || p.seq < oldest.seq)) oldest = p; }
        if (oldest) { oldest.life = 'out'; oldest.age = 0; }
        this.ambientSpawnTimer = 0.6;
      } else {
        this.ambientSpawnTimer = 0.5;   // at target — idle re-check
      }
    }
    // shared beat illumination (same formula as the duet's frame()).
    const glow = Math.min(1, 0.15 + this.energy * 0.3 + this.beatAccent * 0.4);
    const wireOp = Math.min(0.5, 0.06 + glow * 0.28);
    const chromeCol = Math.min(1, 0.62 + glow * 0.38);

    for (let i = 0; i < this.ambientPool.length; i++) {
      const inst = this.ambientPool[i];
      if (!inst.active) continue;
      inst.age += dt;
      if (inst.life === 'in') {
        inst.opacity = inst.fadeIn > 0 ? Math.min(1, inst.age / inst.fadeIn) : 1;
        if (inst.age >= inst.fadeIn) { inst.life = 'live'; inst.age = 0; }
      } else if (inst.life === 'live') {
        inst.opacity = 1;
        if (inst.age >= inst.lifeDur) { inst.life = 'out'; inst.age = 0; }
      } else {   // 'out'
        inst.opacity = inst.fadeOut > 0 ? Math.max(0, 1 - inst.age / inst.fadeOut) : 0;
        if (inst.age >= inst.fadeOut) { this.deactivate(inst); continue; }
      }
      try {
        for (let j = 0; j < inst.chromeMats.length; j++) { const m = inst.chromeMats[j]; m.opacity = inst.opacity; if (m.__base) m.color.copy(m.__base).multiplyScalar(chromeCol); else m.color.setScalar(chromeCol); }
        for (let j = 0; j < inst.wireMats.length; j++) inst.wireMats[j].opacity = wireOp * inst.opacity;
        this.dance(inst, dt, now, clk);   // same engine, own rigState → own move/phase
        this.applyRig(inst);              // proxy joints → real bones (retarget)
        inst.rigGroup.updateMatrixWorld(true);
        for (let j = 0; j < inst.skinnedMeshes.length; j++) { const sk = inst.skinnedMeshes[j].skeleton; if (sk) sk.update(); }
      } catch (_) { /* a bad spawn must never take down the duet */ }
    }
  }

  // Dispose every pooled instance's cloned materials + the ambient renderer.
  // Shared geometry (SkeletonUtils doesn't clone it) is deliberately NOT disposed.
  disposeAmbient() {
    for (let i = 0; i < this.ambientPool.length; i++) {
      const inst = this.ambientPool[i];
      if (inst.rigGroup && this.ambientScene) { try { this.ambientScene.remove(inst.rigGroup); } catch (_) {} }
    }
    if (this.giant && this.giant.rigGroup && this.ambientScene) { try { this.ambientScene.remove(this.giant.rigGroup); } catch (_) {} }
    this.giant = null; this.giantLoading = false; this.giantFailed = false;
    try { this.resetPresenter(); } catch (_) {}
    for (let i = 0; i < this.ambientDisposables.length; i++) { try { this.ambientDisposables[i].dispose(); } catch (_) {} }
    this.ambientDisposables.length = 0;
    this.ambientPool.length = 0;
    this.ambientEnabled = false;
    try { this.ambientRenderer && this.ambientRenderer.dispose(); } catch (_) {}
    this.ambientRenderer = null;
  }

  // ── GIANT presenter build + per-frame state machine ─────────────────────
  // Kick the reserved giant's LAZY, one-shot load (its OWN Way Big glTF).
  buildGiant() {
    const THREE = this.THREE;
    if (this.giant || this.giantLoading || this.giantFailed || this.dead) return this.giant;
    if (!this.ambientScene || !this.ambientCamera || !THREE.GLTFLoader) return null;
    this.giantLoading = true;
    const loader = new THREE.GLTFLoader();
    try {
      if (THREE.DRACOLoader) {
        const draco = new THREE.DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        loader.setDRACOLoader(draco);
      }
    } catch (_) { /* DRACO optional — Way Big is not draco-compressed */ }
    loader.load(RIG_WAYBIG.url,
      (gltf) => { try { this.onGiantLoaded(gltf); } catch (_) { this.giantFailed = true; } this.giantLoading = false; },
      undefined,
      () => { this.giantFailed = true; this.giantLoading = false; /* load error → presenter stays absent, fail safe */ });
    return null;
  }

  // Build the Way Big giant from its loaded glTF (own materials/rig/dance state).
  onGiantLoaded(gltf) {
    const THREE = this.THREE;
    if (this.dead || this.giant || !this.ambientScene || !this.ambientCamera) return;
    const model = gltf.scene;

    // static placement group. Way Big imports UPRIGHT → only the facing spin.
    const rigGroup = new THREE.Group();
    rigGroup.rotation.y = (RIG_WAYBIG.faceSpin != null) ? RIG_WAYBIG.faceSpin : 0;
    const turnGroup = new THREE.Group();   // b.root — dance()'s slow 3/4 turn pivot
    rigGroup.add(turnGroup);
    turnGroup.add(model);

    // Chrome on every mesh (own INSTANCES) — Way Big keeps its OWN colours (real
    // diffuse texture preserved, __base white so beat-illum modulates brightness).
    const chromeMats = [], wireMats = [], skinnedMeshes = [];
    const meshList = [];
    model.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshList.push(o); });
    for (const o of meshList) {
      const srcMat = o.material;
      const map = srcMat && srcMat.map ? srcMat.map : null;
      const opts = { matcap: this.chromeMatcapTex, color: 0xffffff, skinning: true, transparent: true, opacity: 0 };
      if (map) opts.map = map;                                   // Way Big's real texture
      if (srcMat && srcMat.alphaTest) opts.alphaTest = srcMat.alphaTest;
      if (srcMat && srcMat.side !== undefined) opts.side = srcMat.side;
      const mat = new THREE.MeshMatcapMaterial(opts);
      mat.__base = new THREE.Color(0xffffff);   // white → beat-illum modulates brightness, texture colours preserved
      o.material = mat;
      o.frustumCulled = false;
      chromeMats.push(mat); this.ambientDisposables.push(mat);
      if (o.isSkinnedMesh) skinnedMeshes.push(o);
      const wireOverlay = o.clone();
      const w = this.wireMat.clone(); w.transparent = true; w.opacity = 0;
      wireOverlay.material = w;
      wireOverlay.frustumCulled = false;
      wireOverlay.renderOrder = (o.renderOrder || 0) + 1;
      wireMats.push(w); this.ambientDisposables.push(w);
      if (o.parent) o.parent.add(wireOverlay);
    }

    // Retarget via the portable engine, ANALYTIC path (NO axis-map hints).
    const proxies = createProxyRig(THREE);
    const driveRoles = RIG_WAYBIG.extraRoles ? CORE_ROLES.concat(RIG_WAYBIG.extraRoles) : CORE_ROLES;
    const rig = buildRig(THREE, { model, nameOf: RIG_WAYBIG.nameOf, driveRoles, hints: {}, proxies });
    const bones = { root: turnGroup };
    for (const role in proxies) bones[role] = proxies[role];

    const inst = {
      cfg: RIG_WAYBIG,
      rigGroup, turnGroup, model, skinnedMeshes,
      proxies, adapters: rig.adapters, pelvisBone: rig.pelvisBone, pelvisBind: rig.pelvisBind,
      bones, chromeMats, wireMats, retargetReport: rig.report,
      headBone: (rig.boneByRole && rig.boneByRole.head) || null,   // real head bone → per-frame head-centre pin
      // dance state (mirrors Rig's animated fields)
      currentMove: MOVE_TABLE.grooveSway, currentMoveName: 'grooveSway',
      moveStartBeat: 0, moveMirror: 1, prevDrop: false, moveAmp: 1, movePhaseOfs: 0,
      headTrail: 0, idlePhase: 2.4, leanSign: -1,
      baseX: 0, baseY: 0, baseZ: 0, baseScale: 1,
      fitX: 0, fitY: 0, fitZ: 0, frameBonesCache: null,
    };
    rigGroup.visible = false;
    this.ambientScene.add(rigGroup);

    // Fit Way Big to ITS OWN proportions (frameModel scales rigGroup + captures fit).
    this.frameModel(inst, rig.boneByRole);

    // Measure the head-top offset ONCE, AFTER frameModel, in UNSCALED rigGroup-local units.
    rigGroup.updateMatrixWorld(true);
    this._box.setFromObject(model);
    const gs = rigGroup.scale.y || 1;
    inst.headTopLocal = this._box.isEmpty() ? 1.72 : (this._box.max.y - rigGroup.position.y) / gs;

    // Super-Saiyan aura: two additive billboard glows parented to the rig.
    const H = inst.headTopLocal || 1.72;
    const mkAura = (color, w, h, y, baseOp) => {
      const m = new THREE.SpriteMaterial({ map: this.auraTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      const sp = new THREE.Sprite(m);
      sp.scale.set(H * w, H * h, 1);
      sp.position.set(0, H * y, 0);
      sp.renderOrder = 20;   // ON TOP — the cyan energy glows OVER the body
      sp.userData = { bw: H * w, bh: H * h, baseOp };
      rigGroup.add(sp);
      this.ambientDisposables.push(m);
      return sp;
    };
    inst.auraSprites = [
      mkAura(AURA_CORE, 1.5, 1.9, 0.55, 0.9),
      mkAura(AURA_FLAME, 1.0, 2.8, 0.85, 0.7),
    ];

    this.giant = inst;
  }

  // Centre + size the giant against the LIVE camera each frame it shows.
  placeGiant() {
    const THREE = this.THREE;
    const giant = this.giant;
    if (!giant || !this.ambientCamera) return;
    const dist = Math.abs(this.ambientCamera.position.z - (giant.fitZ || 0)) || 8.4;
    const scale = (giant.baseScale || 1) * GIANT_SCALE_MULT;
    this.placeAtNDC(giant, GIANT_NDC_X, 0, dist);   // centre X (+ baseX/baseZ); Y overridden below
    giant.rigGroup.scale.setScalar(scale);
    const worldPerNDC = Math.tan(THREE.MathUtils.degToRad(this.ambientCamera.fov / 2)) * dist;
    const targetY = this.ambientCamera.position.y + GIANT_HEAD_NDC * worldPerNDC;
    giant.baseY = targetY - scale * (giant.headTopLocal || 1);   // feet drop so head reaches target
    giant.rigGroup.position.y = giant.baseY;
    giant.rigGroup.rotation.y = (giant.cfg.faceSpin != null) ? giant.cfg.faceSpin : 0;
  }

  // Force the presenter off the stage + restore the HUD.
  resetPresenter() {
    this.giantOpacity = 0; this.giantDropHi = false; this.welcomeTimer = 0; this.dropBurstTimer = 0;
    if (this.giant && this.giant.rigGroup) this.giant.rigGroup.visible = false;
    if (this.presenterShown) { document.documentElement.classList.remove('hud-hidden'); this.presenterShown = false; }
  }

  // Presenter state machine (per frame, only while the shared context is live).
  updateGiant(dt, now, clk) {
    const THREE = this.THREE;
    if (this.dead || !this.ambientRenderer) return;
    if (!this.giant) this.buildGiant();

    // start the (one-shot) welcome once armed AND the model is ready.
    if (this.welcomeArmed && !this.welcomeStarted && this.giant) {
      this.welcomeStarted = true; this.welcomeArmed = false; this.welcomeTimer = WELCOME_SECONDS;
    }
    let welcomeActive = false;
    if (this.welcomeTimer > 0) { welcomeActive = true; this.welcomeTimer -= dt; }
    if (this.welcomeStarted && this.welcomeTimer <= 0 && !this.crowdArmed) { this.crowdArmed = true; this.crowdArmTimer = CROWD_START_DELAY; }

    // The giant is on stage whenever the HUD is HIDDEN: during the welcome, AND
    // while the mouse is idle. NOT on high beats (that takeover was removed).
    const idleActive = document.documentElement.classList.contains('hud-idle');
    const show = !!this.giant && (welcomeActive || idleActive);
    if (show !== this.presenterShown) {
      document.documentElement.classList.toggle('hud-hidden', show);
      this.presenterShown = show;
      if (!show) { try { window.dispatchEvent(new CustomEvent('kinetic-hud-shown')); } catch (_) {} }
    }
    if (!this.giant) return;
    const giant = this.giant;

    // eased fade toward shown/hidden
    const stepAmt = dt / GIANT_FADE_SECONDS;
    const target = show ? 1 : 0;
    if (this.giantOpacity < target) this.giantOpacity = Math.min(target, this.giantOpacity + stepAmt);
    else if (this.giantOpacity > target) this.giantOpacity = Math.max(target, this.giantOpacity - stepAmt);

    const vis = this.giantOpacity > 0.001;
    giant.rigGroup.visible = vis;
    if (!vis) return;   // fully faded → skip the heavy skinning work

    this.placeGiant();
    // beat illumination (same formula as the duet/crowd), scaled by the fade
    const glow = Math.min(1, 0.15 + this.energy * 0.3 + this.beatAccent * 0.4);
    const wireOp = Math.min(0.5, 0.06 + glow * 0.28);
    const chromeCol = Math.min(1, 0.62 + glow * 0.38);
    try {
      for (let j = 0; j < giant.chromeMats.length; j++) { const m = giant.chromeMats[j]; m.opacity = this.giantOpacity * GIANT_MAX_OPACITY; if (m.__base) m.color.copy(m.__base).multiplyScalar(chromeCol); else m.color.setScalar(chromeCol); }
      for (let j = 0; j < giant.wireMats.length; j++) giant.wireMats[j].opacity = wireOp * this.giantOpacity * 0.4;   // dim the wire so the SOLID body dominates
      // Super-Saiyan aura: base glow + a hard FLARE on the beat, fast flicker, and a scale swell.
      if (giant.auraSprites) {
        const beat = Number.isFinite(this.beatAccent) ? this.beatAccent : 0;
        const flick = 0.8 + 0.2 * Math.sin(now * 30);
        const lvl = this.giantOpacity * (0.3 + 0.9 * beat) * flick;
        const pulse = 1 + 0.3 * beat;
        for (const sp of giant.auraSprites) {
          sp.material.opacity = Math.min(1, lvl * sp.userData.baseOp);
          sp.scale.set(sp.userData.bw * pulse, sp.userData.bh * pulse, 1);
        }
      }
      this.dance(giant, dt, now, clk);       // same engine, own rigState → own move/phase
      this.applyRig(giant);                  // proxy joints → real bones (retarget)
      giant.rigGroup.updateMatrixWorld(true);
      // HEAD-CENTRE PIN: read the REAL head bone's world position and shift the
      // whole rig so the head lands at GIANT_HEAD_NDC (self-correcting).
      if (giant.headBone) {
        giant.headBone.getWorldPosition(this._vec);
        const dist = Math.abs(this.ambientCamera.position.z - (giant.fitZ || 0)) || 8.4;
        const worldPerNDC = Math.tan(THREE.MathUtils.degToRad(this.ambientCamera.fov / 2)) * dist;
        const targetY = this.ambientCamera.position.y + GIANT_HEAD_NDC * worldPerNDC;
        giant.rigGroup.position.y += (targetY - this._vec.y);
        giant.rigGroup.updateMatrixWorld(true);
      }
      for (let j = 0; j < giant.skinnedMeshes.length; j++) { const sk = giant.skinnedMeshes[j].skeleton; if (sk) sk.update(); }
    } catch (_) { /* a giant failure must never take down the RAF */ }
  }

  // ── main loop ──────────────────────────────────────────────────────────
  frame(ts) {
    if (!this.running || this.dead) return;
    const now = ts / 1000;
    let dt = this.last ? now - this.last : 0.016;
    dt = Math.min(dt, 1 / 30);      // clamp so a background pause can't lurch the pose
    this.last = now;

    // shared music clock: advances even if one (or both) rigs haven't loaded yet.
    const rawE = this.readRawEnergy(now);
    const kEnergy = 1 - Math.pow(0.88, dt * 60);   // ≈ the old flat 0.12-per-frame-at-60fps factor
    this.energy += (rawE - this.energy) * kEnergy;
    if (!Number.isFinite(this.energy)) this.energy = 0.28;          // never let NaN corrupt either figure

    const clk = this.musicClock(dt);
    const rate = Number.isFinite(clk.rateHz) ? clk.rateHz : 0.42;
    this.phase += rate * dt * 2 * Math.PI;
    if (!Number.isFinite(this.phase)) this.phase = 0;               // guard against any NaN creep
    this.beatAccent = Number.isFinite(clk.accent) ? clk.accent : 0;
    if (!Number.isFinite(clk.beatPos)) clk.beatPos = 0;   // guard: never let move-selection see NaN
    if (!Number.isFinite(clk.tempoScale) || clk.tempoScale <= 0) clk.tempoScale = 1;
    if (!Number.isFinite(clk.strength)) clk.strength = 0.6;

    // ── featured armadrillo + ambient crowd + Way Big giant: ONE shared context ─
    if (this.ambientRenderer && this.rigA.modelReady) {
      if (this.ambientEnabled) {
        for (let i = 0; i < this.rigs.length; i++) {
          const rigState = this.rigs[i];
          if (!rigState.modelReady || !rigState.bones) continue;   // that rig's load hasn't landed yet
          // Hide the featured dancer while the presenter giant holds the stage.
          if (this.presenterShown) { rigState.rigGroup.visible = false; continue; }
          rigState.rigGroup.visible = true;

          this.placeDuet(rigState, now);       // full-screen anchor placement
          this.dance(rigState, dt, now, clk);
          this.applyRig(rigState);             // proxy joints → real bones (retarget)
          this.updateDanglers(rigState, dt);   // hair/cloth secondary motion (fairy-punk only)

          rigState.rigGroup.updateMatrixWorld(true);
          for (let j = 0; j < rigState.skinnedMeshes.length; j++) {
            const sk = rigState.skinnedMeshes[j].skeleton;
            if (sk) sk.update();
          }
        }

        // Beat illumination for the featured pair's SHARED materials.
        const glow = Math.min(1, 0.15 + this.energy * 0.3 + this.beatAccent * 0.4);
        this.wireMat.opacity = Math.min(0.5, 0.06 + glow * 0.28);
        const chromeColor = Math.min(1, 0.62 + glow * 0.38);
        for (let i = 0; i < this.chromeMats.length; i++) { const m = this.chromeMats[i]; if (m.__base) m.color.copy(m.__base).multiplyScalar(chromeColor); else m.color.setScalar(chromeColor); }

        // Ambient armadrillo crowd — only once the clone-source (rigA) has loaded.
        if (this.rigA.modelReady) this.updateAmbient(dt, now, clk);
        // Giant "presenter" — runs after the crowd so it paints last.
        this.updateGiant(dt, now, clk);
      }
      if (this.ambientEnabled || this.ambientNeedsClear) {
        this.ambientRenderer.render(this.ambientScene, this.ambientCamera);
        this.ambientNeedsClear = false;
        if (!this.ambientLive) { this.ambientLive = true; this.ambientCanvas.classList.add('is-live'); }   // CSS fades it in
      }
    }

    this.raf = requestAnimationFrame(this.frame);
  }

  start() {
    if (this.running && this.raf) return;
    if (this.dead) return;
    this.running = true; this.last = 0; this.raf = requestAnimationFrame(this.frame);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); this.raf = 0; }

  // ── boot the engine (build the context, wire lifecycle, expose diagnostics) ──
  run() {
    try {
      this.build();
    } catch (e) {
      // teardown anything half-built and bail (no context left running)
      try { for (const g of this.disposables) g.dispose(); } catch (_) {}
      try { this.disposeAmbient(); } catch (_) {}
      this.dead = true;
      return;
    }

    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else this.start(); });

    const self = this;
    appState.dancer = {
      start: this.start, stop: this.stop,
      // live diagnostics: current locked BPM + on-beat pulse (shared clock)
      get bpm() { const a = appState.music && appState.music.audio; const i = a && self.trackInfo[a._trackName]; return i ? Math.round(i.bpm) : 0; },
      get beatAccent() { return +self.beatAccent.toFixed(2); },
      get locked() { const m = appState.music, a = m && m.audio; return !!(a && !m.paused && !a.paused && a.currentTime > 0.05 && self.trackInfo[a._trackName]); },
      // geometry diagnostics (loaded glTF budget for the featured rigs)
      get tris() { return self.rigA.triCount + self.rigB.triCount; },
      get verts() { return self.rigA.vertCount + self.rigB.vertCount; },
      get ready() { return self.rigA.modelReady && (!SHOW_FAIRY_PUNK || self.rigB.modelReady); },
      get phase() { return +self.phase.toFixed(2); },
      get energy() { return +self.energy.toFixed(2); },
      // current choreography move per dancer (`move` = back-compat name for dancer A)
      get move() { return self.rigA.currentMoveName; },
      get moveB() { return self.rigB.currentMoveName; },
      get moveGiant() { return self.giant ? self.giant.currentMoveName : null; },   // the Way Big presenter
      get readyA() { return self.rigA.modelReady; },
      get readyB() { return self.rigB.modelReady; },
      get readyGiant() { return !!self.giant; },   // Way Big glTF loaded + rigged
      get retargetReport() { return { a: self.rigA.retargetReport, b: self.rigB.retargetReport, giant: self.giant ? self.giant.retargetReport : null }; },
    };

    this.raf = requestAnimationFrame(this.frame);
  }
}

export function initKineticDancer() {
  if (REDUCED) return;                 // static path — CSS keeps the canvas hidden
  if (!window.THREE) return;           // no three.js → nothing to draw
  if (!$('#k-ambient-dancers')) return;
  const THREE = window.THREE;
  if (!THREE.GLTFLoader) return;       // loader not present → nothing to draw (fail safe)
  new KineticDancer(THREE, $('#k-ambient-dancers')).run();
}
