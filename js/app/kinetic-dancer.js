import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';

// ── Kinetic dancer (persistent side wireframe humanoid) ─────────────────
// A LOADED, rigged glTF humanoid — the Sketchfab "Armadrillo" (CC-BY-4.0,
// kimni88) — rendered as a cyan ADDITIVE WIREFRAME on its own small WebGL
// canvas (#k-dancer-canvas, fixed on the right, CSS-positioned/sized) and
// driven by the SAME beat-locked choreography as before (dance() below).
// It DANCES to the background music across every panel: ambient decoration,
// no user interaction, no audio node of its own.
//
// This is a sibling to lightshow.js (same renderer posture, same
// context-loss / resize / visibility handling) but a completely separate,
// tiny context. It reads the OFFLINE music energy the lightshow already
// computes (appState.lightshow.energy) rather than opening a new AnalyserNode,
// so the two stay in lockstep and there is no extra audio cost.
//
// ── LOADED MODEL, not procedural geometry (this rewrite) ────────────────
// Earlier this file built a procedural skinned "Anyma alien" from merged
// tapered tubes. It now LOADS assets/scene/armadrillo/scene.gltf (a 50-bone
// humanoid SkinnedMesh, no clips, bind pose = T-pose). The beat-locked
// choreography in dance()/musicClock()/analyzeEnv() is UNCHANGED — only how
// its per-bone targets are APPLIED to this rig changed (see "retargeting").
//
// ── Retargeting the dance to a different rig (the important part) ────────
// dance() was authored for a procedural rig whose bones sat at IDENTITY bind
// (arms hanging down, +Z = front, +Y = up, +X = left). This model is
// DIFFERENT: it RENDERS upright Y-up (mesh space: +Y up, +X = the figure's
// left/arm-span, +Z ≈ front — the same convention the dance assumes), its
// arms rest in a T-pose along ±X, and each bone's LOCAL axes are its own.
// (Note: the bone FORWARD-KINEMATIC frame is authored Z-up, but the skin's
// inverse-bind matrices decouple that from the rendered mesh, so the figure
// renders Y-up and NO uprighting rotation is applied.) The per-bone axis maps
// below were derived from each bone's bind orientation IN RENDER SPACE
// (= inverse of its inverseBindMatrix). Two layers bridge proc → model:
//   1. A static rig wrapper (a Group) that scales the model to fit the tall/
//      narrow canvas by HEIGHT, centres it, and spins it to face the camera.
//   2. A per-bone ADAPTER. dance() keeps writing to lightweight PROXY joints
//      (Euler + Vector3, identical API) whose values START at 0 and DAMP
//      across frames exactly as the old rig did — so the gesture math and its
//      smoothing are byte-identical. Each frame, after dance(), the adapter
//      converts every proxy into a real bone transform:
//         bone.quaternion = bindQuat · Δ    (Δ = a small local-axis rotation)
//      where Δ is built from the proxy's rotations with a per-bone AXIS REMAP
//      + SIGN + a static REST offset (e.g. arms brought DOWN/IN out of the
//      T-pose so the "hands drawn up to the face" vocabulary reads). The
//      torso/head/legs are ~identity-aligned in the render frame so they map
//      1:1; the arm bones point along their local +Y, so their proxy axes are
//      remapped. Because Δ multiplies the captured bind quaternion, the rest
//      pose is preserved and the dance eases away from it.
//
// Safety & performance:
//  • reduced-motion → never runs (no WebGL init at all); CSS hides the canvas.
//  • FLASH SAFETY (WCAG 2.3.1): element BRIGHTNESS (opacity) is driven only by
//    SLOW-smoothed energy, rate-limited — never pulsed from `beat`. Beats drive
//    MOTION (a small side element moving is not a flash), never a light pulse.
//  • RAF pauses on hidden tab; dt clamped so a long pause can't lurch the pose.
//  • Async load: renderer/scene/camera/RAF start immediately (empty scene);
//    dance()/frame() no-op safely until the model + bones arrive. A failed load
//    fails safe (transparent canvas, no throw).

export function initKineticDancer() {
  if (REDUCED) return;                 // static path — CSS keeps the canvas hidden
  if (!window.THREE) return;           // no three.js → nothing to draw
  const canvas = $('#k-dancer-canvas');
  if (!canvas) return;

  const THREE = window.THREE;
  if (!THREE.GLTFLoader) return;       // loader not present → nothing to draw (fail safe)

  const MODEL_URL = 'assets/scene/armadrillo/scene.gltf';

  // ── shared wireframe material ────────────────────────────────────────
  // The theme cyan additive wireframe applied to every loaded mesh. `skinning`
  // is REQUIRED in r128 for the material to inject the skinning shader chunks
  // so the wireframe DEFORMS with the skeleton. Low-ish opacity, driven by the
  // slow (flash-safe) energy in frame(); additive + no depth-write for glow.
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff, wireframe: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, skinning: true });
  const disposables = [coreMat];   // materials/geometries to dispose on teardown

  // ── runtime state ────────────────────────────────────────────────────
  let renderer, scene, camera, rig, turnGroup, model;
  let skinnedMeshes = [];                   // for per-frame skeleton.update()
  let bones = null;                         // dance-facing rig: role → proxy (or turnGroup for root)
  const proxies = {};                       // role → { rotation:Euler, position:Vector3 } (persist across frames → damping works)
  const adapters = [];                      // role → { bone, proxy, bindQ, rest, mx/my/mz } (proxy → real bone each frame)
  let pelvisBone = null, pelvisBind = null; // for the pelvis TRANSLATION sway
  let modelReady = false;
  let triCount = 0, vertCount = 0;
  let running = true, raf = 0, live = false, dead = false;

  // dance/energy state (reused across frames; nothing allocated in the loop)
  // Idle-energy baseline lifted to ~0.28 so the groove amplitude reads even
  // without music (the figure still visibly dances when silent).
  let energy = 0.28, prevFast = 0, energySlow = 0.28, beat = 0, phase = 0;
  let beatAccent = 0;                 // on-beat pulse (0..1), music-locked
  let ENV = null;                     // the offline envelope JSON (fetched once)
  const trackInfo = {};               // per-track { beatPeriod, bpm, t0 } (cached)
  const N_BEATS = 2;                  // a full sway/gesture spans this many beats (groovier)
  let headTrail = 0; // secondary-motion memory for the head

  // ── glTF bone name → our rig role ────────────────────────────────────
  // Exact node names in scene.gltf. Only the joints dance() actually drives get
  // a proxy + adapter; the rest (shoulders, hands, feet, fingers, drills, tail)
  // stay at their bind pose. `pelvis` (Hips) is the skeleton root — it also
  // carries the whole-figure sway (translation + tilt).
  const NAME_OF = {
    pelvis: 'Hips_01', spine: 'Spine_08', chest: 'Chest_09',
    neck: 'Armadrillo Neck_010', head: 'Armadrillo Head_00',
    shoulderL: 'Left shoulder_028', upperArmL: 'Left arm_029', forearmL: 'Left elbow_030', handL: 'Left wrist_031',
    shoulderR: 'Right shoulder_011', upperArmR: 'Right arm_012', forearmR: 'Right elbow_013', handR: 'Right wrist_014',
    thighL: 'Left leg_02', shinL: 'Left_ShortKnee_03', footL: 'Left_ShortAnkle_04',
    thighR: 'Right leg_05', shinR: 'Right_ShortKnee_06', footR: 'Right_ShortAnkle_07',
  };

  // ── tuning constants (kept together so screenshot-iteration is one place) ──
  const POS_SCALE = 0.55;   // proxy pelvis translation (procedural units ~4.8 tall) → model units (~1.07 tall)
  const ARM_DOWN = -1.15;   // static rest offset that lowers the T-pose arms toward "hanging" (rad, about the frontal axis)
  const FORE_REST = 0.15;   // slight resting elbow bend so forearms aren't ramrod-straight
  const FACE_SPIN = 0;      // rotation about the (Z-up) vertical to face the camera (flip to Math.PI if it faces away)

  // reusable scratch (no per-frame allocation)
  const _e = new THREE.Euler(0, 0, 0, 'XYZ');
  const _q = new THREE.Quaternion();

  // ── build (synchronous scaffold + async model load) ──────────────────────
  // Create renderer/scene/camera/rig/turnGroup NOW and start the RAF (it renders
  // an empty transparent scene until the model arrives). Then kick off the glTF
  // load; on success, add the model, populate proxies/adapters/bones, frame it,
  // and flip modelReady so dance()/adapter/skeleton.update run.
  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    // A lost GL context (iOS backgrounding etc.) must not freeze a dead frame:
    // stop cleanly and leave the canvas transparent.
    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); stop(); dead = true; }, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));   // DPR capped

    scene = new THREE.Scene();

    // static placement group (scale/position/facing tuned after load).
    // GLTFLoader already imports this Sketchfab asset UPRIGHT (Y-up standing),
    // so no uprighting rotation is applied here — only a facing spin about Y.
    rig = new THREE.Group();
    rig.rotation.y = FACE_SPIN;   // face the camera (flip to Math.PI if it faces away)
    scene.add(rig);

    // whole-figure sway pivot (dance's b.root.rotation.y — the slow 3/4 turn)
    turnGroup = new THREE.Group();
    rig.add(turnGroup);

    // camera: TALL/NARROW canvas → frame the full figure vertically. Reuse the
    // previously-tuned framing (fov 38, z 8.4); the model is scaled to fit.
    camera = new THREE.PerspectiveCamera(38, 0.5, 0.1, 100);
    camera.position.set(0, 0.05, 8.4);
    camera.lookAt(0, -0.05, 0);

    sizeToCanvas();

    // ── async model load ────────────────────────────────────────────────
    const loader = new THREE.GLTFLoader();
    try {
      if (THREE.DRACOLoader) {
        const draco = new THREE.DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        loader.setDRACOLoader(draco);
      }
    } catch (_) { /* DRACO optional — this asset is not draco-compressed */ }

    loader.load(MODEL_URL, onModelLoaded, undefined, () => { /* load error → stay empty, fail safe */ });
  }

  // ── on model load: wire the rig, retarget the dance ──────────────────────
  function onModelLoaded(gltf) {
    if (dead) return;
    model = gltf.scene;

    // theme wireframe on every mesh; collect skinned meshes for skeleton.update
    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.material = coreMat;
        o.frustumCulled = false;   // skinned bounds move; don't let it cull out
        if (o.isSkinnedMesh) skinnedMeshes.push(o);
        const g = o.geometry;
        if (g && g.attributes && g.attributes.position) {
          vertCount += g.attributes.position.count;
          triCount += (g.index ? g.index.count : g.attributes.position.count) / 3;
        }
      }
    });

    // find the mapped bones by exact name
    // GLTFLoader SANITIZES node names (spaces + dots → underscores), so match on
    // the normalized form — otherwise every bone with a space ("Left arm_029",
    // "Armadrillo Neck_010", …) fails to map and never animates (which left only
    // the torso/shins moving). Normalize both sides.
    const norm = (s) => s.replace(/[\s.]/g, '_');
    const boneByRole = {};
    model.traverse((o) => {
      if (!o.isBone) return;
      for (const role in NAME_OF) if (norm(NAME_OF[role]) === o.name) boneByRole[role] = o;
    });

    // ── frame: fit the figure to the canvas by PROJECTED height, centred ──
    // The model loads UPRIGHT (Y-up): height along Y, arm-span along X. It is a
    // stocky, WIDE creature with a long tail, so a naive bbox-height fit
    // over-zooms — perspective magnifies the near face at this camera distance.
    // Instead iterate a PROJECTED fit (project the 8 bbox corners to NDC, scale
    // to a target on-screen height) and centre the TOP-LEVEL rig in world space.
    turnGroup.add(model);
    frameModel();

    // ── proxies + adapters (the retarget) ────────────────────────────────
    // A proxy per animated role: dance() writes to these (persist → damping).
    const ROLES = ['pelvis', 'spine', 'chest', 'neck', 'head',
      'upperArmL', 'forearmL', 'upperArmR', 'forearmR',
      'thighL', 'shinL', 'thighR', 'shinR'];
    for (const role of ROLES) proxies[role] = { rotation: new THREE.Euler(0, 0, 0, 'XYZ'), position: new THREE.Vector3() };

    // adapter helper: how a proxy's (x,y,z) rotations map onto a bone's LOCAL
    // axes. mx/my/mz = [proxySource, sign] → the bone's local X/Y/Z value.
    // rest = static local offset (folded before the dance delta).
    const A = (role, opts) => {
      const bone = boneByRole[role]; if (!bone) return;
      adapters.push({
        role, bone, proxy: proxies[role],
        bindQ: bone.quaternion.clone(),
        rest: opts.rest || { x: 0, y: 0, z: 0 },
        mx: opts.mx || ['x', 1], my: opts.my || ['y', 1], mz: opts.mz || ['z', 1],
      });
    };

    // Torso + head: ~identity-aligned in the render frame (local X = side,
    // local Y ≈ up, local Z ≈ front) → proxy axes map 1:1.
    A('pelvis', {});
    A('spine', {});
    A('chest', {});
    A('neck', {});
    A('head', {});

    // Arms: T-pose, bone points along local +Y (the arm). Local X ≈ the
    // frontal (raise/lower) axis, local Z ≈ up (forward/in swing). Bring the
    // arms DOWN out of the T with ARM_DOWN, then dance's proxy.x raises them.
    //   proxy.x (proc "swing forward+up" / raise)  → local X (frontal raise)
    //   proxy.z (proc "close to body")             → local Z (forward / in)
    //   proxy.y (unused for arms)                  → local Y (twist)
    A('upperArmL', { rest: { x: ARM_DOWN, y: 0, z: 0 }, mx: ['x', 1], my: ['y', 1], mz: ['z', 1] });
    A('upperArmR', { rest: { x: ARM_DOWN, y: 0, z: 0 }, mx: ['x', 1], my: ['y', 1], mz: ['z', 1] });
    // Forearms share the arm frame; proc forearm.x is the elbow (deep, negative)
    // → local X curls the forearm up toward the face. Small resting bend.
    A('forearmL', { rest: { x: FORE_REST, y: 0, z: 0 }, mx: ['x', 1], my: ['y', 1], mz: ['z', 1] });
    A('forearmR', { rest: { x: FORE_REST, y: 0, z: 0 }, mx: ['x', 1], my: ['y', 1], mz: ['z', 1] });

    // Legs: identity-aligned (local X = side = the sagittal swing axis proc uses).
    A('thighL', {});
    A('shinL', {});
    A('thighR', {});
    A('shinR', {});

    // pelvis translation sway: parent frame is Z-up → side = local X, up = local Z.
    pelvisBone = boneByRole.pelvis || null;
    if (pelvisBone) pelvisBind = pelvisBone.position.clone();

    // dance-facing rig: proxies for joints, the real turnGroup for `root`.
    bones = { root: turnGroup };
    for (const role of ROLES) bones[role] = proxies[role];

    modelReady = true;
  }

  // ── fit + centre the model to the canvas (projected, perspective-aware) ──
  // This is a stocky, WIDE creature with a long tail, so projecting the BBOX
  // CORNERS gives garbage (the arm/tail corners at extreme x/z dominate). Fit
  // instead on the projected positions of the actual BONES — they trace the real
  // figure. Iterate: measure the bones' projected vertical span, scale to fill
  // ~FIT_H of the canvas, and shift the top-level rig so the span is centred.
  const FIT_H = 0.5;                     // fraction of canvas height the figure fills (margin for raised arms)
  const _corner = new THREE.Vector3(), _c = new THREE.Vector3();
  let _frameBones = null;
  function frameModel() {
    if (!model || !camera) return;
    if (!_frameBones) { _frameBones = []; model.traverse(o => { if (o.isBone) _frameBones.push(o); }); }
    if (!_frameBones.length) return;
    camera.updateMatrixWorld(true);
    const fovR = THREE.MathUtils.degToRad(camera.fov);
    const worldPerNDC = Math.tan(fovR / 2) * Math.abs(camera.position.z);   // ≈ world units per NDC half-height
    let s = rig.scale.x || 1;
    for (let iter = 0; iter < 8; iter++) {
      // centre X + depth(Z) in world from the bones' world positions
      rig.updateMatrixWorld(true);
      let cx = 0, cz = 0, ymin = Infinity, ymax = -Infinity;
      for (const bn of _frameBones) { bn.getWorldPosition(_c); cx += _c.x; cz += _c.z; }
      cx /= _frameBones.length; cz /= _frameBones.length;
      rig.position.x -= cx; rig.position.z -= cz;
      rig.updateMatrixWorld(true);
      for (const bn of _frameBones) {
        bn.getWorldPosition(_corner).project(camera);
        if (_corner.y < ymin) ymin = _corner.y;
        if (_corner.y > ymax) ymax = _corner.y;
      }
      const frac = (ymax - ymin) / 2;                  // NDC span (0..2) → fraction of canvas height
      const yc = (ymax + ymin) / 2;                    // projected vertical centre (NDC)
      if (frac < 1e-3) break;
      rig.position.y -= yc * worldPerNDC;              // bring the on-screen centre to the middle
      const k = FIT_H / frac;
      s *= k;
      rig.scale.setScalar(s);
      if (Math.abs(k - 1) < 0.01 && Math.abs(yc) < 0.01) break;
    }
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
    // NOTE: Number.isFinite, NOT typeof === 'number' — typeof NaN is 'number',
    // and a NaN energy (lightshow floored / music paused) would propagate into
    // phase + opacity and make the whole figure VANISH. Clamp to [0,1].
    if (ls && Number.isFinite(ls.energy)) return Math.max(0, Math.min(1, ls.energy));
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
    if (info && Number.isFinite(info.beatPeriod) && info.beatPeriod > 0.05) {
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
  // inside safe limits so no bone clips through another. dance() writes to the
  // PROXY joints (persistent Euler/Vector3 — same `.rotation.x/y/z` /
  // `.position` API as a THREE.Bone) so the gesture math + damping are
  // UNCHANGED; the adapter (applyRig) converts proxy → real bone each frame.
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
    const A = 0.9 + energy * 0.4;              // gesture reach (floored → lively even at 0 energy)
    const hit = beatAccent * (0.5 + energy * 0.5);   // music-locked on-beat accent
    const p = phase;
    const s = Math.sin(p);                     // the master sway (left↔right)

    const tgt = (euler, axis, target) => { euler[axis] += (target - euler[axis]) * k; };
    const set = (vec, axis, target) => { vec[axis] += (target - vec[axis]) * k; };
    const add = (obj, axis, extra) => { obj[axis] += extra * k * 3; };

    // arms rise/fall out of phase so they ALTERNATE (one up as the other drops)
    const reachL = 0.5 - 0.5 * Math.cos(p);
    const reachR = 0.5 - 0.5 * Math.cos(p + 2.4);

    // WHOLE-FIGURE SWAY — the big readable move. The pelvis (base of the whole
    // skeleton) translates side-to-side + bobs, so the entire silhouette grooves,
    // not just the thin limbs.
    set(b.pelvis.position, 'x', s * 0.17 * A);                       // sway L↔R (graceful, still visible)
    set(b.pelvis.position, 'y', 0.12 + Math.abs(s) * 0.08 * A);      // gentle bob
    tgt(b.pelvis.rotation, 'z', s * 0.16 * A);                       // hip drop into the sway
    tgt(b.pelvis.rotation, 'y', s * 0.20 * A);

    // torso COUNTER-sways over the hips (contrapposto S-curve) + a breathing curl
    tgt(b.spine.rotation, 'x', 0.08 + (0.5 - 0.5 * Math.cos(p)) * 0.14 * A);
    tgt(b.spine.rotation, 'z', -s * 0.14 * A);
    tgt(b.chest.rotation, 'z', s * 0.14 * A);
    tgt(b.chest.rotation, 'y', -s * 0.14 * A);

    // ARMS — Anyma "Syren" vocabulary: hands drawn UP toward the FACE/CHEST with
    // deep bent elbows (contemplative / self-embrace), alternating, then released.
    // Less sideways spread (hands stay IN FRONT, toward the face), more forward
    // reach + deeper elbow so the hands actually arrive at the head/chest.
    tgt(b.upperArmL.rotation, 'z', 0.12 + reachL * 0.50 * A);   // stays close to the body
    tgt(b.upperArmL.rotation, 'x', 0.25 + reachL * 1.30 * A);   // swing forward + up
    tgt(b.forearmL.rotation, 'x', -0.6 - reachL * 1.55 * A);    // deep elbow → hand to face
    tgt(b.upperArmR.rotation, 'z', -(0.12 + reachR * 0.50 * A));
    tgt(b.upperArmR.rotation, 'x', 0.25 + reachR * 1.30 * A);
    tgt(b.forearmR.rotation, 'x', -0.6 - reachR * 1.55 * A);

    // legs WEIGHT-SHIFT with the sway — the un-weighted knee bends up (steps in
    // place). Knees only bend one way (max(0,…)).
    tgt(b.thighL.rotation, 'x', 0.05 + Math.max(0, s) * 0.22 * A);
    tgt(b.thighR.rotation, 'x', 0.05 + Math.max(0, -s) * 0.22 * A);
    tgt(b.shinL.rotation, 'x', 0.05 + Math.max(0, s) * 0.40 * A);
    tgt(b.shinR.rotation, 'x', 0.05 + Math.max(0, -s) * 0.40 * A);

    // EXPRESSIVE HEAD/NECK — the figure is FACELESS, so it "expresses" through
    // motion: it BOWS into the hands as the arms draw up (contemplative), LIFTS +
    // gazes up as they release/open, slowly SEARCHES side to side, and tilts with
    // the sway. Split across neck + head for a graceful, longer emote; the head
    // TRAILS the chest (secondary motion) so it feels alive, not mechanical.
    const reach = Math.max(reachL, reachR);
    const look = Math.sin(p * 0.5 + 0.7);            // slow "looking around"
    headTrail += (b.chest.rotation.z - headTrail) * 0.08;
    tgt(b.neck.rotation, 'x', 0.03 + reach * 0.20 * A);      // neck leads the bow
    tgt(b.neck.rotation, 'z', s * 0.08 * A);
    tgt(b.neck.rotation, 'y', look * 0.10 * A);
    // head pitch: gazes UP when open (reach≈0 → −0.12), BOWS down into the hands
    // when reaching (reach≈1 → +0.42) — the emotive core of the expression.
    tgt(b.head.rotation, 'x', -0.12 + reach * 0.54 * A);
    tgt(b.head.rotation, 'z', s * 0.16 * A - headTrail * 0.4);   // tilt with the sway
    tgt(b.head.rotation, 'y', look * 0.22 * A);                  // search / look around

    // ON-BEAT accent — MUSIC-LOCKED dip (knees + body sink) so the TEMPO is felt.
    add(b.pelvis.position, 'y', -hit * 0.06);
    add(b.thighL.rotation, 'x', hit * 0.12);
    add(b.thighR.rotation, 'x', hit * 0.12);
    add(b.spine.rotation, 'x', hit * 0.06);

    // slow 3/4 turn of the whole figure (never flat-on)
    tgt(b.root.rotation, 'y', Math.sin(p * 0.5) * 0.16);
  }

  // ── adapter: proxy joints → real bone transforms ─────────────────────────
  // For every mapped bone: build a small LOCAL delta Euler from its proxy's
  // rotations (remapped axis/sign + static rest offset), then
  //   bone.quaternion = bindQ · Δ
  // so the captured bind pose is preserved and the dance eases away from it.
  // The pelvis also takes the translation sway (side = local X, up = local Z in
  // its Z-up parent frame).
  function applyRig() {
    for (let i = 0; i < adapters.length; i++) {
      const a = adapters[i];
      const r = a.proxy.rotation;
      const lx = a.rest.x + a.mx[1] * r[a.mx[0]];
      const ly = a.rest.y + a.my[1] * r[a.my[0]];
      const lz = a.rest.z + a.mz[1] * r[a.mz[0]];
      _e.set(lx, ly, lz, 'XYZ');
      _q.setFromEuler(_e);
      a.bone.quaternion.copy(a.bindQ).multiply(_q);
    }
    if (pelvisBone) {
      const p = proxies.pelvis.position;
      pelvisBone.position.set(
        pelvisBind.x + p.x * POS_SCALE,   // side sway
        pelvisBind.y,                     // depth unchanged
        pelvisBind.z + p.y * POS_SCALE,   // vertical bob (up = local Z)
      );
    }
  }

  // ── main loop ──────────────────────────────────────────────────────────
  let last = 0;
  function frame(ts) {
    if (!running || dead) return;
    const now = ts / 1000;
    let dt = last ? now - last : 0.016;
    dt = Math.min(dt, 1 / 30);      // clamp so a background pause can't lurch the pose
    last = now;

    if (modelReady && bones) {
      // energy: read raw (music envelope or idle), smooth, derive beat
      const rawE = readRawEnergy(now);
      energy += (rawE - energy) * 0.12;
      if (!Number.isFinite(energy)) energy = 0.28;          // never let NaN corrupt the figure

      // Advance the gesture phase at the BPM-locked rate (a full gesture spans
      // N_BEATS beats), and capture the on-beat accent — so movement matches BPM.
      const clk = musicClock();
      const rate = Number.isFinite(clk.rateHz) ? clk.rateHz : 0.42;
      phase += rate * dt * 2 * Math.PI;
      if (!Number.isFinite(phase)) phase = 0;               // guard against any NaN creep
      beatAccent = Number.isFinite(clk.accent) ? clk.accent : 0;

      dance(dt, now);
      applyRig();   // proxy joints → real bones (retarget)

      // Refresh bone world matrices → skeleton bone matrices BEFORE render. GPU
      // skinning does the per-vertex work.
      rig.updateMatrixWorld(true);
      for (let i = 0; i < skinnedMeshes.length; i++) {
        const sk = skinnedMeshes[i].skeleton;
        if (sk) sk.update();
      }

      // FLASH SAFETY: brightness (opacity) tracks SLOW energy only, eased at a
      // capped rate. NEVER pulse opacity from `beat` — beats move the body, they
      // do not flash the light.
      coreMat.opacity = 0.5 + energy * 0.3;
    }

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
    // geometry diagnostics (loaded glTF budget)
    get tris() { return triCount; },
    get verts() { return vertCount; },
    get ready() { return modelReady; },
    get phase() { return +phase.toFixed(2); },
    get energy() { return +energy.toFixed(2); },
  };

  raf = requestAnimationFrame(frame);
}
