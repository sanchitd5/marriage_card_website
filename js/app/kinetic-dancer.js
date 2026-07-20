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
//  • BEAT ILLUMINATION: brightness (opacity) pulses on the beat via the same
//    smooth, decaying `beatAccent` curve that drives the motion accent (not a
//    hard on/off flash). Checked against WCAG 2.3.1 (owner's call to proceed
//    regardless): this project's tracks run 125-150 BPM = 2.08-2.5 beats/sec,
//    under the 3-flashes/sec G19 ceiling at every tempo used here, independent
//    of amplitude — so a beat-locked glow is compliant by the simplest
//    sufficient technique, not just a stylistic risk.
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
  let energy = 0.28, phase = 0;
  let beatAccent = 0;                 // on-beat pulse (0..1), music-locked
  let ENV = null;                     // the offline envelope JSON (fetched once)
  const trackInfo = {};               // per-track { beatPeriod, bpm, t0 } (cached)
  const N_BEATS = 2;                  // grooveSway's master sway spans this many beats
  let headTrail = 0; // secondary-motion memory for the head (grooveSway only)

  // ── move-selection clock state ────────────────────────────────────────
  // A separate BAR-GRID clock (beats elapsed, not radians) drives WHICH move
  // is active — independent of `phase` (grooveSway's own sine oscillator).
  const BAR_WEIGHT = [1.0, 0.35, 0.6, 0.35];   // beat-in-bar accent weighting (downbeat strongest)
  const IDLE_BEAT_PERIOD = 0.6;                // synthetic ~100bpm grid while no track is locked
  let idleBeatAccum = 0;
  let currentMoveName = 'grooveSway', currentMove = null, moveStartBeat = 0, moveMirror = 1;
  let lastBar8 = -1, prevDrop = false;

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
  const FIT_H = 0.86;                    // fraction of canvas HEIGHT the figure may fill
  const FIT_W = 0.62;                    // fraction of canvas WIDTH (this creature is wide → usually binds)
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
      let xmin = Infinity, xmax = -Infinity;
      for (const bn of _frameBones) {
        bn.getWorldPosition(_corner).project(camera);
        if (_corner.y < ymin) ymin = _corner.y;
        if (_corner.y > ymax) ymax = _corner.y;
        if (_corner.x < xmin) xmin = _corner.x;
        if (_corner.x > xmax) xmax = _corner.x;
      }
      const fracY = (ymax - ymin) / 2;                 // NDC vertical span → fraction of canvas height
      const fracX = (xmax - xmin) / 2;                 // NDC horizontal span → fraction of canvas width
      const yc = (ymax + ymin) / 2;                    // projected vertical centre (NDC)
      const aspect = camera.aspect || 1;
      if (fracY < 1e-3) break;
      rig.position.y -= yc * worldPerNDC;              // bring the on-screen centre to the middle
      // fit BOTH dimensions — this creature is WIDE, so width usually binds and
      // must not crop off the narrow canvas sides. worldPerNDC is the height
      // scale; horizontal world-per-NDC = worldPerNDC * aspect.
      const kY = FIT_H / fracY;
      const kX = fracX > 1e-3 ? FIT_W / fracX : Infinity;
      const k = Math.min(kY, kX);
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

  // Returns the gesture-phase RATE (Hz) + the on-beat accent for `now`, PLUS a
  // bar-grid `beatPos` (beats elapsed, monotonic float) that drives WHICH move
  // is active (see MOVE_TABLE/updateMoveSelection below). When the music is
  // playing and its track is analysed: `phase`'s rate is BPM-locked (a full
  // grooveSway sway spans N_BEATS beats, halved again at high BPM via
  // `tempoScale` so fast tracks read as bigger/slower rather than flailing),
  // `beatPos` derives directly + driftlessly from `audio.currentTime`, and the
  // accent spikes on each beat, weighted so the downbeat (beat 0 of the bar)
  // reads stronger than the off-beats. Otherwise a slow free-run idle clock
  // with no phantom beat/accent. Rate-based (not absolute) so play/pause never
  // snaps the phase.
  function musicClock(dt) {
    const m = appState.music, a = m && m.audio;
    const playing = !!(a && !m.paused && !a.paused && a.currentTime > 0.05);
    const info = playing && a._trackName && trackInfo[a._trackName];
    if (info && Number.isFinite(info.beatPeriod) && info.beatPeriod > 0.05) {
      const tempoScale = info.bpm >= 140 ? 2 : 1;   // half-time at high BPM (bigger, slower per beat)
      const beatPos = (a.currentTime - info.t0) / info.beatPeriod;
      const beatIndex = Math.floor(beatPos);
      const beatPhase = beatPos - beatIndex;          // 0 = on the beat
      const barWeight = BAR_WEIGHT[beatIndex & 3];
      return {
        rateHz: 1 / (N_BEATS * info.beatPeriod * tempoScale),
        accent: Math.pow(1 - beatPhase, 4) * barWeight,
        beatPos, tempoScale, bpm: info.bpm, locked: true,
      };
    }
    // idle free-run (no music yet): keep it LIVELY so it visibly dances even
    // before any track plays (~one gesture every ~2.4s), no beat accent. Still
    // advance a synthetic beatPos so move-selection has a grid to work with.
    idleBeatAccum += (Number.isFinite(dt) ? dt : 0.016) / IDLE_BEAT_PERIOD;
    return { rateHz: 0.42 + energy * 0.15, accent: 0, beatPos: idleBeatAccum, tempoScale: 1, bpm: 0, locked: false };
  }

  // ── move library ─────────────────────────────────────────────────────
  // Seven move phrases replace the old single always-on sine loop (which
  // repeated the same ~1s gesture unchanged for the length of an entire
  // track). Every move is a pure function of a shared context — `b` (proxy
  // joints), the damping helpers, amplitude `A`/beat accent `hit`, the
  // grooveSway oscillator `p`/`s`, this move's own `elapsedBeats` (beats since
  // it was selected, tempo-scaled), and `mirror` (±1, for L/R-picking moves).
  // EVERY move sets a target for EVERY proxy axis another move might drive —
  // otherwise an axis a move doesn't touch just freezes at whatever the
  // PREVIOUS move left it at instead of easing back to rest, breaking the
  // "moves crossfade for free through the shared damping" property.
  const REST_ARM_X = 0.20, REST_FORE_X = 0.12, REST_LEG_X = 0.06;
  // Ease-in-out for every move's draw/hold/release-style envelope (0..1 in,
  // 0 slope at both ends) instead of a raw linear ramp — a linear ramp has a
  // velocity CORNER where it meets a hold or another ramp, which the shared
  // damping softens but doesn't fully round out. smoothstep gives the pose a
  // continuous velocity through every phase handoff, which is what reads as
  // fluid weight transfer rather than a mechanical step.
  const smoothstep = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

  // A. Groove sway — the retuned workhorse (was the only move). Whole-figure
  // sway + alternating hands-to-face reach, on grooveSway's own `p` oscillator.
  function grooveSway(c) {
    const { b, tgt, set, A, p, s } = c;
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

    // head trails the chest (secondary motion) — kept local to this move only
    headTrail += (b.chest.rotation.z - headTrail) * (1 - Math.pow(0.92, (c.dt || 0.016) * 60));
    tgt(b.neck.rotation, 'x', 0.03 + reach * 0.20 * A);
    tgt(b.neck.rotation, 'z', s * 0.08 * A);
    tgt(b.neck.rotation, 'y', look * 0.10 * A);
    tgt(b.head.rotation, 'x', -0.12 + reach * 0.54 * A);
    tgt(b.head.rotation, 'z', s * 0.16 * A - headTrail * 0.4);
    tgt(b.head.rotation, 'y', look * 0.22 * A);
  }

  // B. Hands-to-face hold — draw up over 3 beats, HOLD near the face for 3
  // (only a soft breath moving), release over 2. Stillness itself is
  // choreography (Anyma Syren's held, contemplative poses).
  function handsFace(c) {
    const { b, tgt, set, A, elapsedBeats } = c;
    const eb = elapsedBeats % 8;
    const drawAmt = eb < 3 ? smoothstep(eb / 3) : eb < 6 ? 1 : 1 - smoothstep(Math.min(1, (eb - 6) / 2));
    const breathe = Math.sin(eb * 1.3) * 0.03;

    set(b.pelvis.position, 'x', 0);
    set(b.pelvis.position, 'y', 0.11 + breathe * A);
    tgt(b.pelvis.rotation, 'z', 0); tgt(b.pelvis.rotation, 'y', 0);
    tgt(b.spine.rotation, 'x', 0.08 + drawAmt * 0.12 * A); tgt(b.spine.rotation, 'z', 0);
    tgt(b.chest.rotation, 'z', 0); tgt(b.chest.rotation, 'y', drawAmt * 0.08 * A);

    tgt(b.upperArmL.rotation, 'z', 0.10 + drawAmt * 0.30 * A);
    tgt(b.upperArmL.rotation, 'x', 0.25 + drawAmt * 1.35 * A);
    tgt(b.forearmL.rotation, 'x', -0.6 - drawAmt * 1.6 * A);
    tgt(b.upperArmR.rotation, 'z', -(0.10 + drawAmt * 0.30 * A));
    tgt(b.upperArmR.rotation, 'x', 0.25 + drawAmt * 1.35 * A);
    tgt(b.forearmR.rotation, 'x', -0.6 - drawAmt * 1.6 * A);

    tgt(b.thighL.rotation, 'x', REST_LEG_X); tgt(b.thighR.rotation, 'x', REST_LEG_X);
    tgt(b.shinL.rotation, 'x', REST_LEG_X); tgt(b.shinR.rotation, 'x', REST_LEG_X);

    tgt(b.neck.rotation, 'x', 0.03 + drawAmt * 0.28 * A); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', 0);
    tgt(b.head.rotation, 'x', -0.12 + drawAmt * 0.66 * A); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', 0);
  }

  // C. Barrier strike — the Anyma signature accent. Triggered on the RISING
  // edge of a sustained-loud ("drop") section: 2-beat wind-up (coil back),
  // then an eased 6-beat recoil out of the strike. Motion-only (no opacity).
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

  // D. Breakdown gaze — long near-stillness for quiet sections/idle: one slow
  // 16-beat weight shift, a full head turn toward the viewer, breath only.
  // Giving the figure permission to STOP is the cheapest anti-monotony move.
  function breakdown(c) {
    const { b, tgt, set, A, elapsedBeats } = c;
    const eb = elapsedBeats % 16;
    const breathe = Math.sin(eb * 0.4) * 0.03 * A;
    const shift = (eb < 8 ? smoothstep(eb / 8) : 1 - smoothstep((eb - 8) / 8)) - 0.5;
    const gaze = Math.sin((eb / 16) * Math.PI * 2 + 0.3) * 0.26 * A;

    set(b.pelvis.position, 'x', shift * 0.10 * A);
    set(b.pelvis.position, 'y', 0.10 + breathe);
    tgt(b.pelvis.rotation, 'z', 0); tgt(b.pelvis.rotation, 'y', shift * 0.10 * A);
    tgt(b.spine.rotation, 'x', 0.06 + breathe * 0.5); tgt(b.spine.rotation, 'z', 0);
    tgt(b.chest.rotation, 'z', 0); tgt(b.chest.rotation, 'y', gaze * 0.3);

    tgt(b.upperArmL.rotation, 'z', 0.10); tgt(b.upperArmL.rotation, 'x', REST_ARM_X);
    tgt(b.upperArmR.rotation, 'z', -0.10); tgt(b.upperArmR.rotation, 'x', REST_ARM_X);
    tgt(b.forearmL.rotation, 'x', REST_FORE_X); tgt(b.forearmR.rotation, 'x', REST_FORE_X);

    tgt(b.thighL.rotation, 'x', REST_LEG_X); tgt(b.thighR.rotation, 'x', REST_LEG_X);
    tgt(b.shinL.rotation, 'x', REST_LEG_X); tgt(b.shinR.rotation, 'x', REST_LEG_X);

    tgt(b.neck.rotation, 'x', 0.03); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', gaze * 0.4);
    tgt(b.head.rotation, 'x', -0.10); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', gaze);
  }

  // E. Step-touch — a 4-beat weight-shifting step with elbow pumps ON the
  // beat. High-energy pool only; the one move where the accent reads in the
  // arms as much as the knees.
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

  // F. Body wave — a traveling wave up the pelvis→spine→chest→neck→head
  // chain (each link phase-delayed). Cheap, reads as skilled/fluid.
  function bodyWave(c) {
    const { b, tgt, set, A, elapsedBeats } = c;
    const w = (delay) => Math.sin(((elapsedBeats - delay) / 4) * Math.PI * 2);
    const w0 = w(0), w1 = w(0.4), w2 = w(0.8), w3 = w(1.2), w4 = w(1.6);

    set(b.pelvis.position, 'x', 0); set(b.pelvis.position, 'y', 0.12 + Math.abs(w0) * 0.05 * A);
    tgt(b.pelvis.rotation, 'z', w0 * 0.12 * A); tgt(b.pelvis.rotation, 'y', 0);
    tgt(b.spine.rotation, 'x', 0.08); tgt(b.spine.rotation, 'z', w1 * 0.14 * A);
    tgt(b.chest.rotation, 'z', w2 * 0.16 * A); tgt(b.chest.rotation, 'y', 0);

    tgt(b.upperArmL.rotation, 'z', 0.10 + w2 * 0.15 * A); tgt(b.upperArmL.rotation, 'x', REST_ARM_X + Math.max(0, w1) * 0.3 * A);
    tgt(b.upperArmR.rotation, 'z', -(0.10 + w2 * 0.15 * A)); tgt(b.upperArmR.rotation, 'x', REST_ARM_X + Math.max(0, -w1) * 0.3 * A);
    tgt(b.forearmL.rotation, 'x', REST_FORE_X); tgt(b.forearmR.rotation, 'x', REST_FORE_X);

    tgt(b.thighL.rotation, 'x', REST_LEG_X); tgt(b.thighR.rotation, 'x', REST_LEG_X);
    tgt(b.shinL.rotation, 'x', REST_LEG_X); tgt(b.shinR.rotation, 'x', REST_LEG_X);

    tgt(b.neck.rotation, 'x', 0.03); tgt(b.neck.rotation, 'z', w3 * 0.12 * A); tgt(b.neck.rotation, 'y', 0);
    tgt(b.head.rotation, 'x', -0.10); tgt(b.head.rotation, 'z', w4 * 0.10 * A); tgt(b.head.rotation, 'y', 0);
  }

  // G. Reach and open — one-armed reach, mirrored L/R at selection time
  // (doubles perceived variety for free). The featured arm opens/extends
  // rather than bending to the face, so it reads distinct from handsFace.
  function reachOpen(c) {
    const { b, tgt, set, A, elapsedBeats, mirror } = c;
    const eb = elapsedBeats % 8;
    const amt = eb < 4 ? smoothstep(eb / 4) : 1 - smoothstep(Math.min(1, (eb - 4) / 4));
    const L = mirror > 0, featUp = L ? b.upperArmR : b.upperArmL, featFore = L ? b.forearmR : b.forearmL;
    const restUp = L ? b.upperArmL : b.upperArmR, restFore = L ? b.forearmL : b.forearmR;

    set(b.pelvis.position, 'x', 0); set(b.pelvis.position, 'y', 0.11 + amt * 0.03 * A);
    tgt(b.pelvis.rotation, 'z', 0); tgt(b.pelvis.rotation, 'y', mirror * amt * 0.12 * A);
    tgt(b.spine.rotation, 'x', 0.08); tgt(b.spine.rotation, 'z', 0);
    tgt(b.chest.rotation, 'z', 0); tgt(b.chest.rotation, 'y', mirror * amt * 0.22 * A);

    tgt(featUp.rotation, 'x', 0.25 + amt * 1.4 * A); tgt(featUp.rotation, 'z', mirror * (0.12 + amt * 0.55 * A));
    tgt(featFore.rotation, 'x', REST_FORE_X - 0.2 * amt);
    tgt(restUp.rotation, 'x', REST_ARM_X); tgt(restUp.rotation, 'z', 0.10 * -mirror);
    tgt(restFore.rotation, 'x', REST_FORE_X);

    tgt(b.thighL.rotation, 'x', REST_LEG_X); tgt(b.thighR.rotation, 'x', REST_LEG_X);
    tgt(b.shinL.rotation, 'x', REST_LEG_X); tgt(b.shinR.rotation, 'x', REST_LEG_X);

    tgt(b.neck.rotation, 'x', 0.03); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', -mirror * amt * 0.14 * A);
    tgt(b.head.rotation, 'x', -0.14 - amt * 0.10 * A); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', -mirror * amt * 0.20 * A);
  }

  const MOVE_TABLE = {
    grooveSway: { beats: 8, pool: ['idle', 'low', 'high'], run: grooveSway },
    handsFace: { beats: 8, pool: ['idle', 'low'], run: handsFace },
    strike: { beats: 8, pool: ['high'], run: strike },
    breakdown: { beats: 16, pool: ['idle', 'low'], run: breakdown },
    stepTouch: { beats: 4, pool: ['high'], run: stepTouch },
    bodyWave: { beats: 4, pool: ['idle', 'low', 'high'], run: bodyWave },
    reachOpen: { beats: 8, pool: ['low', 'high'], mirrored: true, run: reachOpen },
  };
  currentMove = MOVE_TABLE.grooveSway;

  // Re-selects the active move every 8 beats, AND immediately on a drop's
  // rising edge (so the strike accent lands right when the section changes,
  // not up to 8 beats late — it may then run short if the next 8-beat
  // boundary falls soon after; that's fine, every move crossfades out
  // cleanly via the shared damping). Context gates the eligible pool: idle
  // (no track locked yet) / low (playing, not in a sustained-loud section) /
  // high (`appState.lightshow.drop` — the repo's existing Schmitt-triggered,
  // slow-eased sustained-loud-section flag).
  function updateMoveSelection(clk) {
    const drop = !!(appState.lightshow && appState.lightshow.drop);
    const ctx = !clk.locked ? 'idle' : (drop ? 'high' : 'low');

    if (drop && !prevDrop) {
      currentMoveName = 'strike'; currentMove = MOVE_TABLE.strike;
      moveStartBeat = clk.beatPos; moveMirror = 1;
      lastBar8 = Math.floor(clk.beatPos / 8);   // don't immediately re-roll this same window
      prevDrop = drop;
      return;
    }
    prevDrop = drop;

    const bar8 = Math.floor(clk.beatPos / 8);
    if (bar8 !== lastBar8) {
      lastBar8 = bar8;
      const pool = Object.keys(MOVE_TABLE).filter((n) => n !== 'strike' && MOVE_TABLE[n].pool.includes(ctx));
      const name = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'grooveSway';
      currentMoveName = name; currentMove = MOVE_TABLE[name];
      moveStartBeat = clk.beatPos;
      moveMirror = (currentMove.mirrored && Math.random() < 0.5) ? -1 : 1;
    }
  }

  // ── the dance ────────────────────────────────────────────────────────
  // Everything is DAMPED toward a target each frame (factor k, framerate-aware)
  // so the figure grooves smoothly and never snaps or seizures. Ranges are kept
  // inside safe limits so no bone clips through another. dance() writes to the
  // PROXY joints (persistent Euler/Vector3 — same `.rotation.x/y/z` /
  // `.position` API as a THREE.Bone) so the gesture math + damping stay
  // consistent; the adapter (applyRig) converts proxy → real bone each frame.
  // WHICH move runs is decided by updateMoveSelection (an 8/16-beat grid,
  // weighted-random within a context-gated pool); switching moves needs no
  // special-case crossfade because every move writes every proxy and the
  // shared `tgt`/`set` damping eases between whatever two targets differ.
  function dance(dt, t, clk) {
    const b = bones;
    const k = 1 - Math.pow(0.001, dt);         // framerate-independent damping
    const A = 0.55 + energy * 0.9;             // wide gain: breakdowns visibly shrink, drops visibly grow
    const hit = beatAccent * (0.5 + energy * 0.5);   // music-locked on-beat accent
    const p = phase;
    const s = Math.sin(p);

    const tgt = (euler, axis, target) => { euler[axis] += (target - euler[axis]) * k; };
    const set = (vec, axis, target) => { vec[axis] += (target - vec[axis]) * k; };
    const add = (obj, axis, extra) => { obj[axis] += extra * k * 3; };

    updateMoveSelection(clk);
    const elapsedBeats = Math.max(0, (clk.beatPos - moveStartBeat) / (clk.tempoScale || 1));
    currentMove.run({ b, tgt, set, add, A, hit, p, s, dt, elapsedBeats, mirror: moveMirror });

    // shared, always-on accents regardless of the active move: the on-beat
    // knee/body dip so the tempo is always physically felt, and the slow 3/4
    // turn so the figure never sits flat-on for long.
    add(b.pelvis.position, 'y', -hit * 0.06);
    add(b.thighL.rotation, 'x', hit * 0.12);
    add(b.thighR.rotation, 'x', hit * 0.12);
    add(b.spine.rotation, 'x', hit * 0.06);
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
      // energy: read raw (music envelope or idle), smooth (dt-scaled so the
      // decay rate doesn't depend on display refresh rate), derive beat
      const rawE = readRawEnergy(now);
      const kEnergy = 1 - Math.pow(0.88, dt * 60);   // ≈ the old flat 0.12-per-frame-at-60fps factor
      energy += (rawE - energy) * kEnergy;
      if (!Number.isFinite(energy)) energy = 0.28;          // never let NaN corrupt the figure

      // Advance the gesture phase at the BPM-locked rate (grooveSway's own
      // oscillator spans N_BEATS beats), and capture the bar-weighted on-beat
      // accent + the bar-grid beatPos that drives WHICH move is active.
      const clk = musicClock(dt);
      const rate = Number.isFinite(clk.rateHz) ? clk.rateHz : 0.42;
      phase += rate * dt * 2 * Math.PI;
      if (!Number.isFinite(phase)) phase = 0;               // guard against any NaN creep
      beatAccent = Number.isFinite(clk.accent) ? clk.accent : 0;
      if (!Number.isFinite(clk.beatPos)) clk.beatPos = 0;   // guard: never let move-selection see NaN
      if (!Number.isFinite(clk.tempoScale) || clk.tempoScale <= 0) clk.tempoScale = 1;

      dance(dt, now, clk);
      applyRig();   // proxy joints → real bones (retarget)

      // Refresh bone world matrices → skeleton bone matrices BEFORE render. GPU
      // skinning does the per-vertex work.
      rig.updateMatrixWorld(true);
      for (let i = 0; i < skinnedMeshes.length; i++) {
        const sk = skinnedMeshes[i].skeleton;
        if (sk) sk.update();
      }

      // Beat illumination: energy sets the floor, beatAccent's smooth decay
      // curve blooms it on each beat (bar-weighted, so the downbeat reads
      // brightest). See the WCAG 2.3.1 note in the header comment.
      coreMat.opacity = Math.min(0.95, 0.5 + energy * 0.3 + beatAccent * 0.4);
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
    // current choreography move (for tuning/iteration)
    get move() { return currentMoveName; },
  };

  raf = requestAnimationFrame(frame);
}
