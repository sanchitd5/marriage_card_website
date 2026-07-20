import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import {
  CORE_ROLES, createProxyRig, buildRig, applyAdapters, applyPelvisSway, measureAutoVsManual,
} from './dance-retarget.js';

// ── Kinetic dancers (a persistent chrome DUET, cyan wireframe accent) ────
// TWO loaded, rigged glTF humanoids share one canvas/renderer/camera, side
// by side: the Sketchfab "Armadrillo" (CC-BY-4.0, kimni88, 50-bone, T-pose)
// and "DP Techno Fairy Punk Set" (CC-BY-4.0, BilloXD) — the latter shipped
// as a static unrigged character set and rigged for this project with an
// EXPANDED 21-bone biped skeleton (subdivided spine + clavicles + wrists +
// finger-curls, arms A-pose-matched so they actually deform; built by a
// deterministic pure-Python re-rig, see assets/scene/fairy-punk/license.txt).
// Both dance to the background music
// across every panel: ambient decoration, no user interaction, no audio
// node of its own — a wedding-invitation duet motif, not a literal
// depiction of either half of the couple.
//
// This is a sibling to lightshow.js (same renderer posture, same
// context-loss / resize / visibility handling) but a completely separate,
// tiny context. It reads the OFFLINE music energy the lightshow already
// computes (appState.lightshow.energy) rather than opening a new AnalyserNode,
// so the two stay in lockstep and there is no extra audio cost.
//
// ── Two independent RIGS, one shared choreography engine ─────────────────
// Each rig gets its own Group (`rigGroup` → `turnGroup` → model), its own
// proxy/adapter set, and its own move-selection state (currentMove/
// moveStartBeat/moveMirror/lastBar8/prevDrop/headTrail) — see `createRigState`.
// Both rigs run the SAME `MOVE_TABLE`/move functions and the SAME beat/
// instrument-aware `updateMoveSelection`, driven by ONE shared music clock
// (energy/phase/beatAccent/ENV), so they read as two performers responding
// to the same track rather than one figure duplicated: each independently
// re-rolls its own weighted-random move pick on the same 8-beat grid (so
// they often lean toward the same move FAMILY when one instrument band
// dominates, but rarely land on the identical move/phase), and both
// independently trigger the `strike` accent on the same drop edge — the
// one moment they always hit together, like a rehearsed duet accent.
//
// ── Retargeting: a PORTABLE, joint-count-agnostic engine (dance-retarget.js) ──
// The choreography is authored once against a rig-agnostic PROXY layer (named
// joint ROLES, Unity-Humanoid / VRM-style), and a small retargeting engine maps
// those proxy rotations onto whatever bones a given model actually provides.
// Porting a NEW model needs only a role -> bone-name map: the engine derives the
// canonical->local axis mapping analytically from the captured bind pose (a
// quaternion change-of-basis), which is what replaces the old per-bone, per-rig
// trial-and-error axis-sign hunting. See dance-retarget.js for the full design
// and its honest limits (rest-pose normalization, bone roll, and leaf bones
// still take a small declared hint - the residual every retargeter carries).
//
// The two SHIPPING rigs are driven through that engine in EXPLICIT mode: each
// supplies the exact hand-tuned { rest, axis-map } it was verified with (built
// by makeExplicitHints from each rig's cfg), so the engine's explicit path is
// bit-identical to the original inline applyRig and both dancers look and move
// exactly as before - zero regression. The Armadrillo's arms rest in a T-pose
// along ±X so its hint folds an ARM_DOWN offset + a small FORE_REST elbow bend;
// the fairy-punk rig's bones are identity-rotation / world-aligned (arms follow
// the mesh A-pose) so its offsets are near-zero — no Z-sign flip needed, the
// A-pose IS a natural dance neutral. At load the engine ALSO measures,
// for the record, how close a purely-analytic derivation (no hints) gets to
// each hand-tuned bone (appState.dancer.retargetReport / console) - the honest
// evidence for how much of the manual tuning the auto path now recovers.
// GLTFLoader SANITIZES node names (spaces -> underscores, dots dropped); the
// engine's normalizeBoneName handles both source conventions.
//
// Safety & performance:
//  • reduced-motion → never runs (no WebGL init at all); CSS hides the canvas.
//  • RENDER STYLE: each mesh gets a SHADED chrome pass (MeshMatcapMaterial,
//    a procedurally generated matcap — no HDRI/network texture fetch, no
//    scene lights needed, matcap shading is a pure view-space normal lookup)
//    so sculpted form — including facial features — actually reads, plus a
//    thin additive cyan WIREFRAME pass on top as a "circuitry" accent (a
//    `.clone()` of the same mesh sharing the SAME Skeleton instance, so it
//    deforms for free with zero extra per-frame skinning cost). Wireframe
//    used to be the ONLY material; it's now an accent over sculpted chrome.
//  • BEAT ILLUMINATION: brightness (the wireframe accent's opacity + the
//    chrome pass's colour multiplier) pulses on the beat via the same
//    smooth, decaying `beatAccent` curve that drives the motion accent (not a
//    hard on/off flash). Checked against WCAG 2.3.1 (owner's call to proceed
//    regardless): this project's tracks run 125-150 BPM = 2.08-2.5 beats/sec,
//    under the 3-flashes/sec G19 ceiling at every tempo used here, independent
//    of amplitude — so a beat-locked glow is compliant by the simplest
//    sufficient technique, not just a stylistic risk.
//  • ORGANIC vs. ROBOTIC MOTION: procedural motion reads mechanical mainly
//    from PERFECT REPETITION and PERFECT SYMMETRY, not from a lack of
//    smoothing (that was already solved by the smoothstep fluidity pass).
//    Standard fix per character-animation practice is coherent noise (Perlin/
//    simplex is the canonical tool — Ken Perlin built it specifically to
//    escape "machine-like" CGI motion) layered onto otherwise-deterministic
//    motion, plus animation's "arcs" principle (curved, not symmetric,
//    paths read as alive). This file uses a cheap sine-hash in place of a
//    full noise function (bounded per-frame cost, same coherent-but-varied
//    property, sufficient for a handful of scalars): `musicClock()`'s
//    per-beat `beatJitter`, `dance()`'s per-move-instance `moveAmp`/
//    `movePhaseOfs` (rolled once per move pick — see updateMoveSelection),
//    and a second-harmonic asymmetry on the master `s` oscillator.
//  • SECONDARY-MOTION PHYSICS: `tgt`/`set` (inside dance()) are a spring-
//    mass-damper integrator, not a plain low-pass — see `springStep`/
//    SPRING_LIGHT/SPRING_HEAVY below dance()'s header comment for the full
//    rationale (short version: the user asked for PhysX/Euphoria; neither is
//    viable — Euphoria isn't licensable at all, PhysX-web is a multi-MB WASM
//    dependency this zero-runtime-dependency site can't take on — so this is
//    the from-scratch equivalent: real velocity/momentum/overshoot on the
//    proxy joints, tuned per-joint via a `__heavy` tag so head/neck/chest/
//    spine — which carry the skinned hair/wings/ornament — visibly follow
//    through a turn instead of moving rigidly with the bone).
//  • RAF pauses on hidden tab; dt clamped so a long pause can't lurch the pose.
//  • Async load: renderer/scene/camera/RAF start immediately (empty scene);
//    each rig's dance/adapter no-ops safely until ITS model arrives, so one
//    rig loading slower than the other never blocks the other's animation.
//    A failed load on either rig fails safe (that rig stays absent, no throw).

export function initKineticDancer() {
  if (REDUCED) return;                 // static path — CSS keeps the canvas hidden
  if (!window.THREE) return;           // no three.js → nothing to draw
  const canvas = $('#k-dancer-canvas');
  if (!canvas) return;

  const THREE = window.THREE;
  if (!THREE.GLTFLoader) return;       // loader not present → nothing to draw (fail safe)

  // ── procedural chrome matcap (no network fetch) ──────────────────────
  // MeshMatcapMaterial shades purely from a view-space-normal → texture
  // lookup — no scene lights required, so this stays a self-contained static
  // asset (drawn once to an offscreen canvas at load time) rather than an
  // HDRI/environment-map fetch. Dark obsidian rim, a cyan-white hot spot
  // offset toward a "key light" corner, cool blue-grey midtones, plus a
  // dim secondary rim-light in the opposite corner for a bit of wraparound —
  // reads as glossy chrome in the theme's own obsidian + electric-cyan palette.
  function makeChromeMatcap() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#141518';
    ctx.fillRect(0, 0, size, size);
    // NEUTRAL/GREY tonal ramp (not saturated cyan) — MeshMatcapMaterial
    // MULTIPLIES this into the real diffuse `.map` (see getChromeMat below),
    // so a strongly cyan-biased ramp here suppresses the red channel of
    // whatever the source texture actually is and desaturates/browns any
    // warm or magenta/purple colour underneath (confirmed: the fairy-punk
    // source is a vivid magenta-and-grey armour, per its Sketchfab listing —
    // an earlier, more saturated-cyan version of this ramp was muting that
    // down toward mud). A near-neutral grey ramp (hotspot -> midtone -> dark,
    // all channels close together) still reads as a metallic sheen/gradient
    // (that's what makes sculpted form/facial features visible) WITHOUT
    // fighting the source texture's own hue — the cyan "chrome" identity
    // comes from the separate wireframe accent pass + the beat-driven
    // colour multiplier, not from tinting the base shading itself.
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
    // a faint cyan rim-light accent (kept SMALL/subtle) — enough to still
    // read as a cool "instrument" sheen at the silhouette edge without
    // desaturating the broad diffuse-lit area the way a full-surface cyan
    // tint did.
    const rim = ctx.createRadialGradient(size * 0.75, size * 0.82, 0, size * 0.75, size * 0.82, size * 0.4);
    rim.addColorStop(0, 'rgba(120,220,255,0.22)');
    rim.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // ── shared materials (both rigs): chrome body + wireframe accent ─────
  // Every mesh gets a chrome BASE pass — one MeshMatcapMaterial instance PER
  // UNIQUE source diffuse texture (see getChromeMat below), so sculpted form
  // AND the real restored surface texture both read via matcap shading
  // multiplied by `.map`. `wireMat` is a SECOND, additive no-depth-write pass
  // rendered on a `.clone()` of each mesh (see onModelLoaded) — a thin
  // glowing "circuitry" accent over the chrome body, not the only material.
  // Both need `skinning: true` in r128 so the skinning shader chunks are
  // injected and each pass deforms with its rig's skeleton. Every chrome
  // instance's `.color` + `wireMat.opacity` are the two brightness knobs
  // driven per-frame for beat illumination (see frame()).
  const chromeMatcapTex = makeChromeMatcap();
  // One chrome material PER UNIQUE diffuse texture (both rigs' meshes share
  // an instance when they carry the same texture, or `null` for meshes with
  // no map — the Armadrillo's plain-grey material). Built lazily as meshes
  // load (see getChromeMat below); `chromeMats` is what the per-frame beat-
  // illumination loop iterates instead of one shared material's `.color`.
  const chromeMats = [];
  function getChromeMat(srcMat) {
    const map = srcMat && srcMat.map ? srcMat.map : null;
    const key = map ? map.uuid : 'none';
    for (const m of chromeMats) if (m.__key === key) return m;
    const opts = { matcap: chromeMatcapTex, color: 0xffffff, skinning: true };
    if (map) opts.map = map;
    // carry over transparency/alpha-cutout from the SOURCE material (e.g. a
    // hair card rendered with an alpha-masked texture) so restoring the real
    // texture doesn't also lose whatever cutout it needs to read correctly.
    if (srcMat && srcMat.transparent) opts.transparent = true;
    if (srcMat && srcMat.alphaTest) opts.alphaTest = srcMat.alphaTest;
    if (srcMat && srcMat.side !== undefined) opts.side = srcMat.side;
    const mat = new THREE.MeshMatcapMaterial(opts);
    mat.__key = key;
    chromeMats.push(mat);
    disposables.push(mat);
    return mat;
  }
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff, wireframe: true, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, skinning: true });
  const disposables = [wireMat, chromeMatcapTex];   // chromeMats are pushed in as they're created (see below)

  // ── shared renderer/scene/camera + lifecycle ─────────────────────────
  let renderer, scene, camera;
  let running = true, raf = 0, live = false, dead = false;

  // ── shared music-driven state (both rigs read the same beat/energy) ──
  // Idle-energy baseline lifted to ~0.28 so the groove amplitude reads even
  // without music (both figures still visibly dance when silent).
  let energy = 0.28, phase = 0;
  let beatAccent = 0;                 // on-beat pulse (0..1), music-locked
  let ENV = null;                     // the offline envelope JSON (fetched once)
  const trackInfo = {};               // per-track { beatPeriod, bpm, t0 } (cached)
  const N_BEATS = 2;                  // grooveSway's master sway spans this many beats
  const BAR_WEIGHT = [1.0, 0.35, 0.6, 0.35];   // beat-in-bar accent weighting (downbeat strongest)
  const IDLE_BEAT_PERIOD = 0.6;                // synthetic ~100bpm grid while no track is locked
  let idleBeatAccum = 0;

  const FACE_SPIN = 0;      // rotation about the (Z-up) vertical to face the camera (flip to Math.PI if it faces away)

  // reusable scratch (no per-frame allocation)
  const _e = new THREE.Euler(0, 0, 0, 'XYZ');
  const _q = new THREE.Quaternion();

  // ── per-rig config: model URL, bone-name map, rest offsets, framing ──
  const RIG_A = {
    url: 'assets/scene/armadrillo/scene.gltf',
    // Exact node names in scene.gltf. Only the joints dance() actually drives
    // get a proxy + adapter; the rest (shoulders, hands, feet, fingers,
    // drills, tail) stay at their bind pose. `pelvis` (Hips) is the skeleton
    // root — it also carries the whole-figure sway (translation + tilt).
    nameOf: {
      pelvis: 'Hips_01', spine: 'Spine_08', chest: 'Chest_09',
      neck: 'Armadrillo Neck_010', head: 'Armadrillo Head_00',
      shoulderL: 'Left shoulder_028', upperArmL: 'Left arm_029', forearmL: 'Left elbow_030', handL: 'Left wrist_031',
      shoulderR: 'Right shoulder_011', upperArmR: 'Right arm_012', forearmR: 'Right elbow_013', handR: 'Right wrist_014',
      thighL: 'Left leg_02', shinL: 'Left_ShortKnee_03', footL: 'Left_ShortAnkle_04',
      thighR: 'Right leg_05', shinR: 'Right_ShortKnee_06', footR: 'Right_ShortAnkle_07',
    },
    // proxy pelvis translation (procedural units ~4.8 tall) → model units (~1.07 tall)
    posScale: 0.55,
    // T-pose rest offsets: bring the arms DOWN out of the T toward "hanging",
    // slight resting elbow bend so forearms aren't ramrod-straight.
    armDown: -1.15, foreRest: 0.15,
    // duet framing: half-width slot, shifted LEFT (this creature is wide, so
    // it gets a touch more width budget than the slimmer fairy-punk rig)
    fitH: 0.82, fitW: 0.40, xOffset: -1.05,
  };
  const RIG_B = {
    url: 'assets/scene/fairy-punk/scene.gltf',
    // Bone names as authored by the Python re-rig (see assets/scene/fairy-punk/
    // license.txt) — GLTFLoader DROPS the dots on import ("UpperArm.L" →
    // "UpperArmL"), it does not underscore them like the Armadrillo's spaces;
    // the shared `norm()` below strips dots and underscores spaces to match.
    // This rig has an EXPANDED 21-bone skeleton (vs the earlier 13): the torso
    // is subdivided pelvis→spine→spine2→chest→upperChest→neck→head (a real
    // travelling spine wave, not one rigid rotation), the arms lead from
    // clavicle bones (Shoulder.L/R) and carry a wrist (Hand.L/R) + a combined
    // finger-curl (Fingers.L/R). The arm bones follow the mesh's actual A-pose
    // so the arms genuinely DEFORM (the previous rig had them dead-bound to
    // Chest — an arm raise moved ~8% of the intended geometry). Every bone is
    // identity-rotation / translation-only, so bindQ = identity and the
    // choreography's canonical axes map straight through (no armZSign hunt).
    nameOf: {
      pelvis: 'Pelvis', spine: 'Spine', spine2: 'Spine2', chest: 'Chest',
      upperChest: 'UpperChest', neck: 'Neck', head: 'Head',
      shoulderL: 'Shoulder.L', upperArmL: 'UpperArm.L', forearmL: 'Forearm.L',
      handL: 'Hand.L', fingersL: 'Fingers.L',
      shoulderR: 'Shoulder.R', upperArmR: 'UpperArm.R', forearmR: 'Forearm.R',
      handR: 'Hand.R', fingersR: 'Fingers.R',
      thighL: 'Thigh.L', shinL: 'Shin.L', thighR: 'Thigh.R', shinR: 'Shin.R',
    },
    // Roles this rig DRIVES (beyond the core 13): the new torso subdivisions,
    // clavicles, wrists and finger-curls. RIG_A stays core-only.
    extraRoles: ['spine2', 'upperChest', 'shoulderL', 'shoulderR', 'handL', 'handR', 'fingersL', 'fingersR'],
    posScale: 0.55,
    // A-pose bind: arms rest angled ~45° down-and-out (the character's own
    // modelled pose). Near-zero rest offsets — the A-pose IS a natural dance
    // neutral; a small elbow bend keeps forearms from reading ramrod-straight,
    // and a light resting finger curl keeps hands from reading as flat paddles.
    armDown: 0, foreRest: 0.12, fingerRest: 0.35,
    // Identity-rotation bones + world-aligned local axes → no upper-arm Z-sign
    // flip needed (the old mismatched hanging-bind rig required armZSign:-1).
    armZSign: 1,
    // Geometry orientation is unchanged from the prior asset (same POSITION
    // data, only the skeleton + weights were rebuilt), so the rig still faces
    // the opposite way from the camera at import and needs the same flip.
    faceSpin: Math.PI,
    // fitH lower than the Armadrillo's: this rig's hair/headdress mesh
    // extends well above the Head bone itself, which frameModel() fits by
    // (bone positions only, not mesh extent) -- at 0.82 that overhang
    // clipped the top of the canvas. Leave more headroom.
    fitH: 0.62, fitW: 0.34, xOffset: 1.0,
  };

  // ── per-panel duet placement ─────────────────────────────────────────
  // The duet shouldn't sit in the exact same spot on every panel — that reads
  // as a static sticker pasted in the corner. `updateDuetSlot()` (in the
  // render loop) reads the active panel (published on <html data-panel> by
  // kinetic.js) and damps each rig's position/scale toward a per-GROUP target
  // on top of its calibrated base transform (frameModel's fit, untouched).
  // Grouped (not one bespoke layout per panel) so the variety stays coherent:
  // 'display' is the baseline split (fairy-punk front-right, Armadrillo
  // back-left); 'displayAlt' swaps which figure is foreground/larger and
  // pushes them further apart for a genuinely different silhouette;
  // 'dense' (the content-heavy Run of Show/Archive panels, already a faint
  // background watermark per kinetic.css) tucks both figures smaller and
  // further to one side so they read as ambient corner presence, not a
  // repeat of the display-panel composition.
  const PANEL_LAYOUTS = {
    // fairy-punk pushed further right + a touch smaller than the initial
    // tuning — its corrected (post bone-fix) silhouette is taller/wider than
    // before and its reaching arm crossed into the "RIYA" hero name at the
    // original x:1.0/scale:1.
    // (post-merge fix) rig A's horns still crossed into "RIYA" at -1.05 on a
    // 1440x900/DPR1 desktop — pushed further right + slightly smaller.
    display:    { a: { x: -0.15, scaleMul: 0.8,  z: -0.6 }, b: { x: 1.0,   scaleMul: 0.85, z: 0    } },
    // RSVP: role-swap (Armadrillo foreground/larger) reads fine here — the
    // closing copy sits in the LEFT column, well clear of the right-side duet.
    displayAlt: { a: { x: 0.85,  scaleMul: 1.15, z: 0.9  }, b: { x: -1.15, scaleMul: 0.8,  z: -0.9 } },
    // Interlude is a different case from RSVP: its quote sits centre-right,
    // reaching further into the dancer's column than any other panel, so the
    // generic displayAlt slot crossed the quote text. Push both figures
    // further right and smaller, clear of the quote's line length.
    interludeAlt: { a: { x: 1.9, scaleMul: 0.7, z: 0.4 }, b: { x: 1.55, scaleMul: 0.45, z: -0.5 } },
    dense:      { a: { x: -1.5,  scaleMul: 0.68, z: -0.3 }, b: { x: -0.65, scaleMul: 0.6,  z: 0.3  } },
  };
  const PANEL_GROUP = {
    invocation: 'display', countdown: 'display',
    interlude: 'interludeAlt', rsvp: 'displayAlt',
    'run-of-show': 'dense', archive: 'dense',
  };
  const DEFAULT_LAYOUT_GROUP = 'display';
  // The canvas is `width: min(38vw, 560px); height: 100svh` (kinetic.css) —
  // width is capped/bounded but height tracks the full viewport, so on a
  // TALLER browser window (1920x1080, 2560x1329, or just a maximized window
  // on a tall monitor) camera.aspect (canvas w/h) drops well below the
  // ~0.608 this layout was tuned against at 1440x900. A PERSPECTIVE camera's
  // horizontal FOV scales with aspect at a FIXED vertical FOV, so a fixed
  // WORLD-UNIT x offset maps to a LARGER fraction of the (narrower) canvas
  // as aspect drops — both dancers drift toward, then past, the right edge
  // and can vanish off-canvas entirely (confirmed: fairy-punk fully
  // off-screen at 1920x1080, both dancers off-screen at 2000x1050). Scale
  // the authored x offset by (currentAspect / CALIBRATED_ASPECT) so it holds
  // its ON-SCREEN position — not its raw world distance — across window
  // shapes. z (depth) is a separate perspective cue, not an aspect artifact,
  // left unscaled.
  const CALIBRATED_ASPECT = 0.608;   // canvas aspect at the 1440x900 window PANEL_LAYOUTS was tuned against
  function updateDuetSlot(rigState, key, dt) {
    const groupName = PANEL_GROUP[document.documentElement.dataset.panel] || DEFAULT_LAYOUT_GROUP;
    const target = PANEL_LAYOUTS[groupName][key];
    const aspectScale = camera && camera.aspect > 0 ? camera.aspect / CALIBRATED_ASPECT : 1;
    const targetX = target.x * aspectScale;
    const k = 1 - Math.pow(0.02, dt);   // graceful glide (~1s to settle), not a snap
    rigState.slotX += (targetX - rigState.slotX) * k;
    rigState.slotScaleMul += (target.scaleMul - rigState.slotScaleMul) * k;
    rigState.slotZ += (target.z - rigState.slotZ) * k;
    rigState.rigGroup.position.x = rigState.baseX + rigState.slotX;
    rigState.rigGroup.position.z = rigState.baseZ + rigState.slotZ;
    rigState.rigGroup.scale.setScalar(rigState.baseScale * rigState.slotScaleMul);
  }

  function createRigState(cfg) {
    return {
      cfg,
      rigGroup: null, turnGroup: null, model: null,
      skinnedMeshes: [], bones: null,
      proxies: {}, adapters: [], retargetReport: null,
      pelvisBone: null, pelvisBind: null,
      modelReady: false, triCount: 0, vertCount: 0,
      frameBonesCache: null,
      currentMoveName: 'grooveSway', currentMove: null,
      moveStartBeat: 0, moveMirror: 1, lastBar8: -1, prevDrop: false,
      moveAmp: 1, movePhaseOfs: 0,   // per-move-instance jitter, rolled fresh on each pick (see updateMoveSelection)
      headTrail: 0,   // secondary-motion memory for the head (grooveSway only), per-rig
      // calibrated base transform (set once by frameModel) + the animated
      // per-panel "duet slot" offset applied on top each frame (updateDuetSlot)
      baseX: 0, baseY: 0, baseZ: 0, baseScale: 1,
      slotX: cfg.xOffset, slotScaleMul: 1, slotZ: 0,
    };
  }
  const rigA = createRigState(RIG_A);
  const rigB = createRigState(RIG_B);
  const rigs = [rigA, rigB];

  // ── build (synchronous scaffold + async model loads) ──────────────────────
  // Create renderer/scene/camera NOW and start the RAF (it renders an empty
  // transparent scene until the models arrive). Then kick off both glTF
  // loads; on each success, add that model, populate its proxies/adapters,
  // frame it into its duet slot, and flip its modelReady so its dance/
  // adapter/skeleton.update run (independently of the other rig's load state).
  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    // A lost GL context (iOS backgrounding etc.) must not freeze a dead frame:
    // stop cleanly and leave the canvas transparent.
    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); stop(); dead = true; }, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));   // DPR capped

    scene = new THREE.Scene();

    // camera: TALL/NARROW canvas → frame the full duet vertically. Reuse the
    // previously-tuned framing (fov 38, z 8.4); each rig is scaled to fit its
    // own half-width slot (see frameModel).
    camera = new THREE.PerspectiveCamera(38, 0.5, 0.1, 100);
    camera.position.set(0, 0.05, 8.4);
    camera.lookAt(0, -0.05, 0);

    sizeToCanvas();

    for (const rigState of rigs) {
      // static placement group (scale/position/facing tuned after load).
      // GLTFLoader already imports these assets UPRIGHT (Y-up standing), so
      // no uprighting rotation is applied here — only a facing spin about Y.
      rigState.rigGroup = new THREE.Group();
      rigState.rigGroup.rotation.y = (rigState.cfg.faceSpin != null) ? rigState.cfg.faceSpin : FACE_SPIN;
      scene.add(rigState.rigGroup);

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

      loader.load(rigState.cfg.url, (gltf) => onModelLoaded(rigState, gltf), undefined, () => { /* load error → that rig stays empty, fail safe */ });
    }
  }

  // ── on model load: wire the rig, retarget the dance ──────────────────────
  function onModelLoaded(rigState, gltf) {
    if (dead) return;
    const model = gltf.scene;
    rigState.model = model;

    // chrome base pass on every mesh (facial/body sculpt reads via matcap
    // shading) + a thin wireframe ACCENT pass on a clone of the same mesh.
    // Collect the mesh list first, THEN clone+append — mutating the scene
    // graph mid-traversal is unsafe (the new siblings could get re-visited).
    const meshList = [];
    model.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshList.push(o); });
    for (const o of meshList) {
      // capture whatever GLTFLoader already parsed (diffuse map + alpha
      // mode) BEFORE overwriting the material, so the real source texture
      // (restored in Blender — see assets/scene/*/license.txt) survives
      // underneath the chrome shading instead of being replaced by it.
      const srcMat = o.material;
      o.material = getChromeMat(srcMat);
      o.frustumCulled = false;   // skinned bounds move; don't let it cull out
      if (o.isSkinnedMesh) rigState.skinnedMeshes.push(o);
      const g = o.geometry;
      if (g && g.attributes && g.attributes.position) {
        rigState.vertCount += g.attributes.position.count;
        rigState.triCount += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
      // Hair geometry (thin, densely-packed strand triangles) reads WAY
      // brighter in wireframe than a broad body-surface mesh at the same
      // opacity — many more edges land in the same screen area, so it washes
      // out into a bright white tangle that swamps the chrome/texture read
      // right where the face is. Skip the circuitry-accent pass for it (the
      // chrome+texture base pass alone still shows real hair colour/shading);
      // every other mesh keeps the accent. Identified by the SOURCE
      // material's name (captured before the chrome material overwrites it
      // above) — Blender's own export names survive as material names even
      // though mesh/node names get renumbered on round-trip.
      const isHair = !!(srcMat && srcMat.name && /hair/i.test(srcMat.name));
      if (!isHair) {
        // `.clone()` on a SkinnedMesh rebinds to the SAME Skeleton instance
        // (THREE's SkinnedMesh.copy() calls bind() with the source skeleton),
        // so this overlay deforms identically with zero extra per-frame
        // skeleton work — the original's skeleton.update() already covers it.
        const wireOverlay = o.clone();
        wireOverlay.material = wireMat;
        wireOverlay.frustumCulled = false;
        wireOverlay.renderOrder = (o.renderOrder || 0) + 1;
        if (o.parent) o.parent.add(wireOverlay);
      }
    }

    // ── retarget via the portable engine (dance-retarget.js) ──────────────
    // A proxy per SCHEMA role (present in this model or not) so a move can write
    // to any role unconditionally; only DRIVEN roles that the rig actually
    // provides get an adapter. `nameOf` may map MORE bones than are driven (the
    // Armadrillo maps shoulders/hands/feet purely so framing measures the real
    // silhouette, see frameModel) - driveRoles limits animation to the core set.
    // Each rig passes the exact hand-tuned EXPLICIT hints it was verified with,
    // so the engine's explicit path is bit-identical to the original inline
    // applyRig (proxy euler -> bindQ · Δ) and both dancers look/move exactly as
    // before. The heavy-joint spring tags (head/neck/chest/spine carry the
    // skinned hair + wings, so they get momentum/overshoot) are set by the
    // engine from the role schema.
    rigState.proxies = createProxyRig(THREE);
    const hints = makeExplicitHints(rigState.cfg);
    // Drive the core 13 plus any rig-specific extra roles (fairy-punk's
    // subdivided spine, clavicles, wrists, finger-curls). RIG_A stays core-only.
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
    frameModel(rigState, rig.boneByRole);

    // Honest measurement (once, at load, diagnostics only - drives no motion):
    // how close does a purely-ANALYTIC derivation (NO hints, just the captured
    // bind pose) get to the hand-tuned result, per bone? Small angle = the auto
    // path recovered the human's axis choice; large = a residual the human still
    // supplies (rest-pose normalization / bone roll). See dance-retarget.js.
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
  }

  // Build the EXPLICIT (hand-tuned) retarget hints for a rig from its cfg,
  // reproducing exactly the original per-rig adapter setup so the engine's
  // explicit path is bit-identical to the old inline applyRig. Torso/head/legs
  // map identity; the arms fold this rig's T-pose-vs-hanging REST offset
  // (armDown/foreRest) and, for fairy-punk, the empirically-found upper-arm
  // Z-sign flip (armZSign). These are the residuals the analytic path does NOT
  // auto-derive (rest-pose normalization) - see RIG_A/RIG_B and dance-retarget.
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
    // Extra roles (fairy-punk's expanded skeleton): explicit identity maps too,
    // so the whole rig stays on the predictable bit-identical explicit path.
    // Its bones are identity-rotation / world-aligned, so an identity axis map
    // is exactly right; only fingers carry a small resting curl.
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

  // Probe proxy rotations for the auto-vs-manual measurement: a spread across
  // the axes and magnitudes the real moves use, so the reported error reflects
  // the choreography's actual range rather than only near-rest angles.
  const AUTO_PROBES = [
    { x: 0.5, y: 0, z: 0 }, { x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 0.5 },
    { x: 1.3, y: 0, z: 0.4 }, { x: -0.6, y: 0.3, z: -0.3 }, { x: 1.5, y: 0.2, z: 0.9 },
  ];

  // ── fit + centre + slot a rig into its duet position (projected, perspective-aware) ──
  // Both source creatures are wide relative to a single narrow canvas, so
  // projecting the BBOX CORNERS gives garbage (arm/tail corners at extreme
  // x/z dominate). Fit instead on the projected positions of the actual
  // BONES — they trace the real figure. Iterate: measure the bones'
  // projected vertical/horizontal span, scale to fill this rig's own
  // fraction of the canvas (fitH/fitW — each rig gets roughly HALF the
  // width, per RIG_A/RIG_B), centre it, THEN shift it left/right by its
  // fixed `xOffset` into its duet slot (applied once, after centering
  // converges, so it isn't undone by the centering math).
  const _corner = new THREE.Vector3(), _c = new THREE.Vector3();
  function frameModel(rigState, boneByRole) {
    if (!rigState.model || !camera) return;
    if (!rigState.frameBonesCache) {
      // Fit to the driven roles only (see call site comment) — fall back to
      // every bone only if a role map wasn't supplied (shouldn't happen at
      // runtime, but keeps this function safe to call standalone).
      rigState.frameBonesCache = boneByRole ? Object.values(boneByRole) : [];
      if (!rigState.frameBonesCache.length) rigState.model.traverse(o => { if (o.isBone) rigState.frameBonesCache.push(o); });
    }
    const frameBones = rigState.frameBonesCache;
    if (!frameBones.length) return;
    camera.updateMatrixWorld(true);
    const fovR = THREE.MathUtils.degToRad(camera.fov);
    const worldPerNDC = Math.tan(fovR / 2) * Math.abs(camera.position.z);   // ≈ world units per NDC half-height
    let s = rigState.rigGroup.scale.x || 1;
    const FIT_H = rigState.cfg.fitH, FIT_W = rigState.cfg.fitW;
    for (let iter = 0; iter < 8; iter++) {
      // centre X + depth(Z) in world from the bones' world positions
      rigState.rigGroup.updateMatrixWorld(true);
      let cx = 0, cz = 0, ymin = Infinity, ymax = -Infinity;
      for (const bn of frameBones) { bn.getWorldPosition(_c); cx += _c.x; cz += _c.z; }
      cx /= frameBones.length; cz /= frameBones.length;
      rigState.rigGroup.position.x -= cx; rigState.rigGroup.position.z -= cz;
      rigState.rigGroup.updateMatrixWorld(true);
      let xmin = Infinity, xmax = -Infinity;
      for (const bn of frameBones) {
        bn.getWorldPosition(_corner).project(camera);
        if (_corner.y < ymin) ymin = _corner.y;
        if (_corner.y > ymax) ymax = _corner.y;
        if (_corner.x < xmin) xmin = _corner.x;
        if (_corner.x > xmax) xmax = _corner.x;
      }
      const fracY = (ymax - ymin) / 2;                 // NDC vertical span → fraction of canvas height
      const fracX = (xmax - xmin) / 2;                 // NDC horizontal span → fraction of canvas width
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
    // Capture the CALIBRATED base transform (centred, correctly scaled) once —
    // per-panel duet placement (updateDuetSlot, in the render loop) then
    // varies position/scale on TOP of this base every frame, so the fit
    // quality here is never re-derived or disturbed by the panel-to-panel
    // composition changes.
    rigState.baseX = rigState.rigGroup.position.x;
    rigState.baseY = rigState.rigGroup.position.y;
    rigState.baseZ = rigState.rigGroup.position.z;
    rigState.baseScale = rigState.rigGroup.scale.x;
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
  // never ran, synthesize a calm idle breath so both figures still groove.
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

  // Real per-beat "how hard does THIS beat hit" signal, sampled directly from
  // the offline RMS envelope (ENV.tracks[name].env @ ENV.fps — the same data
  // gen-envelopes.mjs already computed via ffmpeg for the whole track) around
  // the beat's nominal time. Without this, the accent/amplitude would be a
  // pure function of beat-phase + bar position — IDENTICAL every beat
  // regardless of the actual mix, so a quiet breakdown beat and a hard drop
  // beat would produce the same shape. A small ±window (the analytic beat
  // grid can lead/lag the real transient slightly) takes the peak, not just
  // one frame.
  function beatStrength(trackName, beatCenterT) {
    const tr = ENV && ENV.tracks && ENV.tracks[trackName];
    const env = tr && tr.env;
    if (!env || !env.length) return 0.6;               // fail-safe neutral
    const fps = (ENV.fps && ENV.fps > 0) ? ENV.fps : 25;
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

  // Instrument-band mix at time `tSec`: which register (bass/kick, mid melodic/
  // vocal, hi-hat/cymbal/percussion) dominates RIGHT NOW, from the offline
  // envLow/envMid/envHigh (gen-envelopes.mjs ffmpeg band-pass decodes, same
  // fps-aligned technique as `env`). Returned normalized (sums to ~1) so it's a
  // MIX, not an absolute-loudness triple — move selection weights against the
  // mix, not against how loud the track is overall (that's already `energy`).
  function bandMix(trackName, tSec) {
    const tr = ENV && ENV.tracks && ENV.tracks[trackName];
    if (!tr || !tr.envLow || !tr.envMid || !tr.envHigh) return { low: 0.33, mid: 0.34, high: 0.33 };
    const fps = (ENV.fps && ENV.fps > 0) ? ENV.fps : 25;
    const sampleAt = (arr) => {
      const i = Math.round(tSec * fps);
      return (i >= 0 && i < arr.length && Number.isFinite(arr[i])) ? arr[i] : 0;
    };
    const low = sampleAt(tr.envLow), mid = sampleAt(tr.envMid), high = sampleAt(tr.envHigh);
    const sum = low + mid + high;
    if (sum < 1e-4) return { low: 0.33, mid: 0.34, high: 0.33 };
    return { low: low / sum, mid: mid / sum, high: high / sum };
  }

  fetch('assets/audio/techno/envelopes.json').then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !j.tracks) return;
    ENV = j;
    for (const name in j.tracks) {
      const tr = j.tracks[name];
      if (tr && tr.env && tr.env.length) trackInfo[name] = analyzeEnv(j.fps || 25, tr.env, tr.onsets || []);
    }
  }).catch(() => {});

  // ── authored choreography arc (offline, hand-read — not a runtime model) ──
  // assets/audio/techno/choreo-arcs.json is a per-track list of {t0,t1,type}
  // sections (intro/groove/build/drop/breakdown/outro), hand-authored by
  // reading each track's actual energy curve in envelopes.json (see that
  // file's `_authoring` note) rather than guessed live. The live per-frame
  // signals (appState.lightshow.drop, bandMix) are still reactive/real-time;
  // this ARC is deliberate STRUCTURE — it knows in advance where the real
  // breakdown and the real drop are, so move selection can commit to "calm"
  // or "big" ahead of the live Schmitt-trigger catching up, and both dancers
  // can hit the SAME authored drop moment together (see ARC_LAST_SECTION /
  // the synced-strike edge-trigger in updateMoveSelection). A missing/failed
  // fetch just means no arc bias — the live-only system (this file's
  // original behaviour) still runs exactly as before.
  let ARCS = null;
  fetch('assets/audio/techno/choreo-arcs.json').then(r => r.ok ? r.json() : null).then(j => {
    if (j && j.tracks) ARCS = j.tracks;
  }).catch(() => {});

  function currentSection(trackName, t) {
    const arc = ARCS && ARCS[trackName];
    if (!arc || !arc.sections) return null;
    const secs = arc.sections;
    for (let i = 0; i < secs.length; i++) if (t >= secs[i].t0 && t < secs[i].t1) return secs[i].type;
    return null;
  }
  // Edge-detect entering an authored 'drop' section (shared across both rigs,
  // keyed by track so a track change resets it) — fires the SAME synchronized
  // strike accent both rigs already do on the live drop signal, but from the
  // authored arc, so the "big moment" the track ACTUALLY has (not just
  // whatever crossed the live energy threshold) is guaranteed to land, in
  // unison, right on cue.
  let lastArcTrack = null, lastArcSection = null;

  // Returns the gesture-phase RATE (Hz) + the on-beat accent for `now`, PLUS a
  // bar-grid `beatPos` (beats elapsed, monotonic float) that drives WHICH move
  // is active per rig (see MOVE_TABLE/updateMoveSelection below) — shared by
  // BOTH dancers so they're locked to the same music. When the music is
  // playing and its track is analysed: `phase`'s rate is BPM-locked (a full
  // grooveSway sway spans N_BEATS beats, halved again at high BPM via
  // `tempoScale` so fast tracks read as bigger/slower rather than flailing),
  // `beatPos` derives directly + driftlessly from `audio.currentTime`, and the
  // accent spikes on each beat, weighted so the downbeat (beat 0 of the bar)
  // reads stronger than the off-beats, AND scaled by that beat's REAL
  // envelope strength (beatStrength) so a quiet section and a hard drop don't
  // produce the same accent. Otherwise a slow free-run idle clock with no
  // phantom beat/accent. Rate-based (not absolute) so play/pause never snaps
  // the phase.
  function musicClock(dt) {
    const m = appState.music, a = m && m.audio;
    const playing = !!(a && !m.paused && !a.paused && a.currentTime > 0.05);
    const info = playing && a._trackName && trackInfo[a._trackName];

    // Authored arc lookup + edge-detect entering a 'drop' section — computed
    // ONCE here (musicClock runs once per frame, shared by both rigs, unlike
    // updateMoveSelection which runs once PER rig) so the edge fires exactly
    // once per frame and both rigs see the SAME `arcDropEdge` on that frame,
    // rather than the first rig's read consuming the edge before the second
    // rig checks it.
    const arcTrackName = a && a._trackName;
    const arcSection = (playing && arcTrackName) ? currentSection(arcTrackName, a.currentTime) : null;
    if (arcTrackName !== lastArcTrack) { lastArcTrack = arcTrackName; lastArcSection = null; }
    const arcDropEdge = arcSection === 'drop' && lastArcSection !== 'drop';
    lastArcSection = arcSection;

    if (info && Number.isFinite(info.beatPeriod) && info.beatPeriod > 0.05) {
      const tempoScale = info.bpm >= 140 ? 2 : 1;   // half-time at high BPM (bigger, slower per beat)
      const beatPos = (a.currentTime - info.t0) / info.beatPeriod;
      const beatIndex = Math.floor(beatPos);
      const beatPhase = beatPos - beatIndex;          // 0 = on the beat
      const barWeight = BAR_WEIGHT[beatIndex & 3];
      const beatCenterT = info.t0 + beatIndex * info.beatPeriod;
      const strength = beatStrength(a._trackName, beatCenterT);   // 0..1, THIS beat's real loudness
      // Cheap per-beat "noise" (research: Perlin/coherent noise is the standard
      // fix for procedural motion reading robotic — it breaks perfectly
      // identical repetition without true randomness; a sine-hash of the
      // integer beat index gives the same coherent-but-varied property far
      // more cheaply than a full noise implementation for a single scalar per
      // beat). Without this, every beat at the same bar position and the same
      // envelope strength produces the EXACT same accent, forever — real
      // musicians/dancers vary attack beat-to-beat even within a steady groove.
      const hashN = Math.sin(beatIndex * 12.9898) * 43758.5453;
      const beatJitter = 0.78 + 0.44 * (hashN - Math.floor(hashN));   // ~0.78..1.22, deterministic per beat index
      return {
        rateHz: 1 / (N_BEATS * info.beatPeriod * tempoScale),
        accent: Math.pow(1 - beatPhase, 4) * barWeight * (0.4 + strength * 0.9) * beatJitter,
        beatPos, tempoScale, bpm: info.bpm, locked: true, strength, arcSection, arcDropEdge,
      };
    }
    // idle free-run (no music yet): keep it LIVELY so both figures visibly
    // dance even before any track plays (~one gesture every ~2.4s), no beat
    // accent. Still advance a synthetic beatPos so move-selection has a grid.
    idleBeatAccum += (Number.isFinite(dt) ? dt : 0.016) / IDLE_BEAT_PERIOD;
    return { rateHz: 0.42 + energy * 0.15, accent: 0, beatPos: idleBeatAccum, tempoScale: 1, bpm: 0, locked: false, strength: 0.6, arcSection, arcDropEdge };
  }

  // ── move library ─────────────────────────────────────────────────────
  // Twelve move phrases (the original seven A-G plus five more H-L, including
  // a tribal-house/tribal-fusion-grounded vein) — every move is a pure
  // function of a shared context — `b` (proxy joints), the damping helpers,
  // amplitude `A`/beat accent `hit`, the grooveSway oscillator `p`/`s`, this
  // move's own `elapsedBeats` (beats since it was selected, tempo-scaled),
  // `mirror` (±1, for L/R-picking moves), and `rig` (this move's OWN rig
  // state, so grooveSway's secondary-motion memory — `rig.headTrail` — stays
  // per-dancer rather than shared). EVERY move sets a target for EVERY proxy
  // axis another move might drive — otherwise an axis a move doesn't touch
  // just freezes at whatever the PREVIOUS move left it at instead of easing
  // back to rest, breaking the "moves crossfade for free through the shared
  // damping" property.
  const REST_ARM_X = 0.20, REST_FORE_X = 0.12, REST_LEG_X = 0.06;
  // Rest targets for fairy-punk's EXTRA joints (subdivided spine, clavicles,
  // wrists, finger-curls). These proxies exist on BOTH rigs (createProxyRig
  // allocates every schema role), but only fairy-punk has adapters for them —
  // on the Armadrillo the writes are free no-ops (the graceful-degradation
  // contract), so moves drive them unconditionally. spine2/upperChest carry a
  // slight forward lean matching the spine so the torso reads continuous.
  const REST_SPINE2_X = 0.05, REST_UCHEST_X = 0.04;
  // Ease every extra joint back to rest. Called for moves that don't drive the
  // extras themselves, so a finger curl / shoulder shrug from the previous move
  // relaxes instead of freezing (the same "every move writes every proxy" rule
  // the core joints already follow). `t` is the move context's `tgt`.
  function restExtras(b, t) {
    t(b.spine2.rotation, 'x', REST_SPINE2_X); t(b.spine2.rotation, 'z', 0); t(b.spine2.rotation, 'y', 0);
    t(b.upperChest.rotation, 'x', REST_UCHEST_X); t(b.upperChest.rotation, 'z', 0); t(b.upperChest.rotation, 'y', 0);
    t(b.shoulderL.rotation, 'x', 0); t(b.shoulderL.rotation, 'z', 0); t(b.shoulderL.rotation, 'y', 0);
    t(b.shoulderR.rotation, 'x', 0); t(b.shoulderR.rotation, 'z', 0); t(b.shoulderR.rotation, 'y', 0);
    t(b.handL.rotation, 'x', 0); t(b.handL.rotation, 'z', 0); t(b.handR.rotation, 'x', 0); t(b.handR.rotation, 'z', 0);
    t(b.fingersL.rotation, 'x', 0); t(b.fingersR.rotation, 'x', 0);
  }
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

  // B. Hands-to-face hold — draw up over 3 beats, HOLD near the face for 3
  // (only a soft breath moving), release over 2. Stillness itself is
  // choreography (Anyma Syren's held, contemplative poses).
  function handsFace(c) {
    const { b, tgt, set, A, elapsedBeats } = c;
    const eb = elapsedBeats % 8;
    const draw = (e) => e < 3 ? smoothstep(e / 3) : e < 6 ? 1 : 1 - smoothstep(Math.min(1, (e - 6) / 2));
    const drawAmt = draw(eb);
    // Clavicle LEADS the arm (scapulohumeral rhythm): the girdle initiates a
    // few frames ahead and carries ~a third of the raise. It stays near-zero
    // for the first slice of the raise (the first ~30° of elevation is almost
    // pure glenohumeral) then ramps in — hence the max(0, lead-0.15).
    const lead = draw(eb + 0.3);                       // ~0.3-beat anticipation
    const shrug = Math.max(0, lead - 0.15) * 0.30 * A; // ≤~0.26rad girdle elevation
    const breathe = Math.sin(eb * 1.3) * 0.03;

    set(b.pelvis.position, 'x', 0);
    set(b.pelvis.position, 'y', 0.11 + breathe * A);
    tgt(b.pelvis.rotation, 'z', 0); tgt(b.pelvis.rotation, 'y', 0);
    tgt(b.spine.rotation, 'x', 0.08 + drawAmt * 0.12 * A); tgt(b.spine.rotation, 'z', 0);
    tgt(b.spine2.rotation, 'x', REST_SPINE2_X + drawAmt * 0.06 * A); tgt(b.spine2.rotation, 'z', 0); tgt(b.spine2.rotation, 'y', 0);
    tgt(b.chest.rotation, 'z', 0); tgt(b.chest.rotation, 'y', drawAmt * 0.08 * A);
    tgt(b.upperChest.rotation, 'x', REST_UCHEST_X); tgt(b.upperChest.rotation, 'z', 0); tgt(b.upperChest.rotation, 'y', 0);

    tgt(b.shoulderL.rotation, 'z', shrug); tgt(b.shoulderL.rotation, 'x', 0); tgt(b.shoulderL.rotation, 'y', 0);
    tgt(b.shoulderR.rotation, 'z', -shrug); tgt(b.shoulderR.rotation, 'x', 0); tgt(b.shoulderR.rotation, 'y', 0);
    tgt(b.upperArmL.rotation, 'z', 0.10 + drawAmt * 0.30 * A);
    tgt(b.upperArmL.rotation, 'x', 0.25 + drawAmt * 1.35 * A);
    tgt(b.forearmL.rotation, 'x', -0.6 - drawAmt * 1.6 * A);
    tgt(b.upperArmR.rotation, 'z', -(0.10 + drawAmt * 0.30 * A));
    tgt(b.upperArmR.rotation, 'x', 0.25 + drawAmt * 1.35 * A);
    tgt(b.forearmR.rotation, 'x', -0.6 - drawAmt * 1.6 * A);
    // wrists break slightly toward the face; fingers CURL into a soft cradle as
    // the hands settle (peaks on the hold, relaxes on the release).
    tgt(b.handL.rotation, 'x', drawAmt * 0.25 * A); tgt(b.handL.rotation, 'z', 0);
    tgt(b.handR.rotation, 'x', drawAmt * 0.25 * A); tgt(b.handR.rotation, 'z', 0);
    tgt(b.fingersL.rotation, 'x', drawAmt * 0.55 * A); tgt(b.fingersR.rotation, 'x', drawAmt * 0.55 * A);

    tgt(b.thighL.rotation, 'x', REST_LEG_X); tgt(b.thighR.rotation, 'x', REST_LEG_X);
    tgt(b.shinL.rotation, 'x', REST_LEG_X); tgt(b.shinR.rotation, 'x', REST_LEG_X);

    tgt(b.neck.rotation, 'x', 0.03 + drawAmt * 0.28 * A); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', 0);
    tgt(b.head.rotation, 'x', -0.12 + drawAmt * 0.66 * A); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', 0);
  }

  // C. Barrier strike — the Anyma signature accent. Triggered on the RISING
  // edge of a sustained-loud ("drop") section: 2-beat wind-up (coil back),
  // then an eased 6-beat recoil out of the strike. Motion-only (no opacity).
  // Both dancers trigger this on the SAME drop edge (shared appState.
  // lightshow.drop signal) — the one moment they always hit together.
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

  // F. Body wave — a traveling wave that now runs the FULL subdivided torso
  // pelvis→spine→spine2→chest→upperChest→neck→head, each link phase-delayed
  // (overlapping action). Per the rigging research the bend is NOT uniform: it
  // concentrates at the two real hinges (lumbar base = spine, and the neck),
  // with the rib-cage bones (chest/upperChest) staying comparatively stiff — a
  // flat per-segment split reads robotic. Segment amplitudes below follow that
  // ~30/20/10/10/20/10 distribution; the ~0.34-beat lag per link (≈π/9 phase)
  // is the travelling-wave delay. On the 13-bone Armadrillo, spine2/upperChest
  // are free no-ops and the wave collapses to the original spine→chest→neck→head.
  function bodyWave(c) {
    const { b, tgt, set, A, elapsedBeats } = c;
    const w = (delay) => Math.sin(((elapsedBeats - delay) / 4) * Math.PI * 2);
    const wP = w(0), wS = w(0.34), wS2 = w(0.68), wC = w(1.02), wU = w(1.36), wN = w(1.70), wH = w(2.04);

    set(b.pelvis.position, 'x', 0); set(b.pelvis.position, 'y', 0.12 + Math.abs(wP) * 0.05 * A);
    tgt(b.pelvis.rotation, 'z', wP * 0.10 * A); tgt(b.pelvis.rotation, 'y', 0);
    tgt(b.spine.rotation, 'x', 0.08); tgt(b.spine.rotation, 'z', wS * 0.15 * A);          // lumbar hinge — biggest share
    tgt(b.spine2.rotation, 'x', REST_SPINE2_X); tgt(b.spine2.rotation, 'z', wS2 * 0.11 * A); tgt(b.spine2.rotation, 'y', 0);
    tgt(b.chest.rotation, 'z', wC * 0.06 * A); tgt(b.chest.rotation, 'y', 0);              // rib cage — stiff
    tgt(b.upperChest.rotation, 'x', REST_UCHEST_X); tgt(b.upperChest.rotation, 'z', wU * 0.06 * A); tgt(b.upperChest.rotation, 'y', 0);

    // shoulders/arms ride the wave loosely; wrists + fingers relax
    tgt(b.shoulderL.rotation, 'z', wU * 0.06 * A); tgt(b.shoulderL.rotation, 'x', 0); tgt(b.shoulderL.rotation, 'y', 0);
    tgt(b.shoulderR.rotation, 'z', wU * 0.06 * A); tgt(b.shoulderR.rotation, 'x', 0); tgt(b.shoulderR.rotation, 'y', 0);
    tgt(b.upperArmL.rotation, 'z', 0.10 + wC * 0.15 * A); tgt(b.upperArmL.rotation, 'x', REST_ARM_X + Math.max(0, wS) * 0.3 * A);
    tgt(b.upperArmR.rotation, 'z', -(0.10 + wC * 0.15 * A)); tgt(b.upperArmR.rotation, 'x', REST_ARM_X + Math.max(0, -wS) * 0.3 * A);
    tgt(b.forearmL.rotation, 'x', REST_FORE_X); tgt(b.forearmR.rotation, 'x', REST_FORE_X);
    tgt(b.handL.rotation, 'z', wN * 0.14 * A); tgt(b.handL.rotation, 'x', 0); tgt(b.handR.rotation, 'z', wN * 0.14 * A); tgt(b.handR.rotation, 'x', 0);
    tgt(b.fingersL.rotation, 'x', 0); tgt(b.fingersR.rotation, 'x', 0);

    tgt(b.thighL.rotation, 'x', REST_LEG_X); tgt(b.thighR.rotation, 'x', REST_LEG_X);
    tgt(b.shinL.rotation, 'x', REST_LEG_X); tgt(b.shinR.rotation, 'x', REST_LEG_X);

    tgt(b.neck.rotation, 'x', 0.03); tgt(b.neck.rotation, 'z', wN * 0.12 * A); tgt(b.neck.rotation, 'y', 0);   // second hinge
    tgt(b.head.rotation, 'x', -0.10); tgt(b.head.rotation, 'z', wH * 0.08 * A); tgt(b.head.rotation, 'y', 0);  // tip follow-through
  }

  // G. Reach and open — one-armed reach, mirrored L/R at selection time
  // (doubles perceived variety for free). The featured arm opens/extends
  // rather than bending to the face, so it reads distinct from handsFace.
  function reachOpen(c) {
    const { b, tgt, set, A, elapsedBeats, mirror } = c;
    const eb = elapsedBeats % 8;
    const env = (e) => e < 4 ? smoothstep(e / 4) : 1 - smoothstep(Math.min(1, (e - 4) / 4));
    const amt = env(eb);
    const lead = env(eb + 0.35);                         // featured clavicle anticipates the reach
    const shrug = Math.max(0, lead - 0.15) * 0.34 * A;
    const L = mirror > 0, featUp = L ? b.upperArmR : b.upperArmL, featFore = L ? b.forearmR : b.forearmL;
    const restUp = L ? b.upperArmL : b.upperArmR, restFore = L ? b.forearmL : b.forearmR;
    const featSh = L ? b.shoulderR : b.shoulderL, restSh = L ? b.shoulderL : b.shoulderR;
    const featHand = L ? b.handR : b.handL, restHand = L ? b.handL : b.handR;
    const featFing = L ? b.fingersR : b.fingersL, restFing = L ? b.fingersL : b.fingersR;
    // featured side is +z for R (mirror>0), -z for L → the clavicle protracts on
    // the SAME sign so it leads the arm out into the reach.
    const shSign = L ? -1 : 1;

    set(b.pelvis.position, 'x', 0); set(b.pelvis.position, 'y', 0.11 + amt * 0.03 * A);
    tgt(b.pelvis.rotation, 'z', 0); tgt(b.pelvis.rotation, 'y', mirror * amt * 0.12 * A);
    tgt(b.spine.rotation, 'x', 0.08); tgt(b.spine.rotation, 'z', 0);
    tgt(b.spine2.rotation, 'x', REST_SPINE2_X); tgt(b.spine2.rotation, 'z', 0); tgt(b.spine2.rotation, 'y', mirror * amt * 0.08 * A);
    tgt(b.chest.rotation, 'z', 0); tgt(b.chest.rotation, 'y', mirror * amt * 0.22 * A);
    tgt(b.upperChest.rotation, 'x', REST_UCHEST_X); tgt(b.upperChest.rotation, 'z', 0); tgt(b.upperChest.rotation, 'y', mirror * amt * 0.10 * A);

    tgt(featSh.rotation, 'z', shSign * shrug); tgt(featSh.rotation, 'x', 0); tgt(featSh.rotation, 'y', 0);
    tgt(restSh.rotation, 'z', 0); tgt(restSh.rotation, 'x', 0); tgt(restSh.rotation, 'y', 0);
    tgt(featUp.rotation, 'x', 0.25 + amt * 1.4 * A); tgt(featUp.rotation, 'z', mirror * (0.12 + amt * 0.55 * A));
    tgt(featFore.rotation, 'x', REST_FORE_X - 0.2 * amt);
    tgt(restUp.rotation, 'x', REST_ARM_X); tgt(restUp.rotation, 'z', 0.10 * -mirror);
    tgt(restFore.rotation, 'x', REST_FORE_X);
    // the reaching hand OPENS as it extends (fingers relax toward flat, wrist
    // leads back); the resting hand stays neutral.
    tgt(featHand.rotation, 'x', -amt * 0.28 * A); tgt(featHand.rotation, 'z', 0);
    tgt(featFing.rotation, 'x', -amt * 0.35 * A);
    tgt(restHand.rotation, 'x', 0); tgt(restHand.rotation, 'z', 0); tgt(restFing.rotation, 'x', 0);

    tgt(b.thighL.rotation, 'x', REST_LEG_X); tgt(b.thighR.rotation, 'x', REST_LEG_X);
    tgt(b.shinL.rotation, 'x', REST_LEG_X); tgt(b.shinR.rotation, 'x', REST_LEG_X);

    tgt(b.neck.rotation, 'x', 0.03); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', -mirror * amt * 0.14 * A);
    tgt(b.head.rotation, 'x', -0.14 - amt * 0.10 * A); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', -mirror * amt * 0.20 * A);
  }

  // H. Tribal stomp — grounded percussive stomping, alternating legs. A sharp
  // attack / quick eased release on a narrow window (still smoothstep-
  // continuous, so it stays fluid) reads as a percussive impact rather than
  // the sinuous flow of grooveSway — tribal-house/tribal-fusion's "low centre
  // of gravity, percussive accents on the beat" vocabulary.
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

  // I. Invocation — a ceremonial arms-raised offering: both arms rise wide
  // together and HOLD (symmetric, not a hands-to-face gesture), chest opens,
  // head tilts back. Reads at quiet contemplative moments as a ritual pose,
  // and doubles as the "arms in the air" gesture at a peak.
  function invocation(c) {
    const { b, tgt, set, A, elapsedBeats } = c;
    const eb = elapsedBeats % 12;
    const env = (e) => e < 4 ? smoothstep(e / 4) : e < 8 ? 1 : 1 - smoothstep(Math.min(1, (e - 8) / 4));
    const amt = env(eb);
    const lead = env(eb + 0.4);                          // girdle anticipates the raise
    const shrug = Math.max(0, lead - 0.15) * 0.32 * A;   // both clavicles elevate as the arms rise
    const breathe = Math.sin(eb * 1.1) * 0.025;

    set(b.pelvis.position, 'x', 0); set(b.pelvis.position, 'y', 0.12 + amt * 0.04 * A + breathe);
    tgt(b.pelvis.rotation, 'z', 0); tgt(b.pelvis.rotation, 'y', 0);
    tgt(b.spine.rotation, 'x', 0.08 - amt * 0.10 * A); tgt(b.spine.rotation, 'z', 0);
    tgt(b.spine2.rotation, 'x', REST_SPINE2_X - amt * 0.06 * A); tgt(b.spine2.rotation, 'z', 0); tgt(b.spine2.rotation, 'y', 0);
    tgt(b.chest.rotation, 'z', 0); tgt(b.chest.rotation, 'y', 0);
    tgt(b.upperChest.rotation, 'x', REST_UCHEST_X - amt * 0.05 * A); tgt(b.upperChest.rotation, 'z', 0); tgt(b.upperChest.rotation, 'y', 0);   // chest opens skyward

    tgt(b.shoulderL.rotation, 'z', shrug); tgt(b.shoulderL.rotation, 'x', 0); tgt(b.shoulderL.rotation, 'y', 0);
    tgt(b.shoulderR.rotation, 'z', -shrug); tgt(b.shoulderR.rotation, 'x', 0); tgt(b.shoulderR.rotation, 'y', 0);
    tgt(b.upperArmL.rotation, 'z', 0.14 + amt * 0.9 * A); tgt(b.upperArmL.rotation, 'x', 0.25 + amt * 1.5 * A);
    tgt(b.upperArmR.rotation, 'z', -(0.14 + amt * 0.9 * A)); tgt(b.upperArmR.rotation, 'x', 0.25 + amt * 1.5 * A);
    tgt(b.forearmL.rotation, 'x', REST_FORE_X - amt * 0.05); tgt(b.forearmR.rotation, 'x', REST_FORE_X - amt * 0.05);
    // open, upturned palms at the ceremonial peak: wrists extend back, fingers
    // spread OPEN (negative curl relaxes past the resting fingerRest toward flat).
    tgt(b.handL.rotation, 'x', -amt * 0.30 * A); tgt(b.handL.rotation, 'z', 0);
    tgt(b.handR.rotation, 'x', -amt * 0.30 * A); tgt(b.handR.rotation, 'z', 0);
    tgt(b.fingersL.rotation, 'x', -amt * 0.35 * A); tgt(b.fingersR.rotation, 'x', -amt * 0.35 * A);

    tgt(b.thighL.rotation, 'x', REST_LEG_X); tgt(b.thighR.rotation, 'x', REST_LEG_X);
    tgt(b.shinL.rotation, 'x', REST_LEG_X); tgt(b.shinR.rotation, 'x', REST_LEG_X);

    tgt(b.neck.rotation, 'x', 0.02 - amt * 0.10 * A); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', 0);
    tgt(b.head.rotation, 'x', -0.12 - amt * 0.22 * A); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', 0);
  }

  // J. Grounded isolation — a taxeem/maya-style torso figure-eight (chest and
  // hips counter-rotating in a serpentine wave) over a low, bent-knee stance.
  // Per tribal-fusion vocabulary the isolation reads in the torso; the arms
  // counter-sway with it (curation fix — a fixed arm pose read as barely
  // distinct from grooveSway/tribalStomp from the front camera).
  function groundedIsolation(c) {
    const { b, tgt, set, A, elapsedBeats } = c;
    const q = (elapsedBeats / 1.6) * Math.PI * 2;
    const iso = Math.sin(q), iso2 = Math.sin(q * 2) * 0.5;

    set(b.pelvis.position, 'x', -iso * 0.13 * A); set(b.pelvis.position, 'y', 0.06 + Math.abs(iso2) * 0.04 * A);
    tgt(b.pelvis.rotation, 'z', -iso * 0.18 * A); tgt(b.pelvis.rotation, 'y', iso2 * 0.14 * A);
    tgt(b.spine.rotation, 'x', 0.10); tgt(b.spine.rotation, 'z', iso * 0.14 * A);
    tgt(b.chest.rotation, 'z', iso * 0.30 * A); tgt(b.chest.rotation, 'y', -iso2 * 0.22 * A);

    tgt(b.upperArmL.rotation, 'z', 0.14 + iso * 0.20 * A); tgt(b.upperArmL.rotation, 'x', REST_ARM_X + 0.05 + Math.max(0, -iso) * 0.30 * A);
    tgt(b.upperArmR.rotation, 'z', -(0.14 + iso * 0.20 * A)); tgt(b.upperArmR.rotation, 'x', REST_ARM_X + 0.05 + Math.max(0, iso) * 0.30 * A);
    tgt(b.forearmL.rotation, 'x', REST_FORE_X + Math.max(0, -iso) * 0.25); tgt(b.forearmR.rotation, 'x', REST_FORE_X + Math.max(0, iso) * 0.25);

    tgt(b.thighL.rotation, 'x', REST_LEG_X + 0.14); tgt(b.thighR.rotation, 'x', REST_LEG_X + 0.14);
    tgt(b.shinL.rotation, 'x', REST_LEG_X + 0.10); tgt(b.shinR.rotation, 'x', REST_LEG_X + 0.10);

    tgt(b.neck.rotation, 'x', 0.03); tgt(b.neck.rotation, 'z', -iso * 0.08 * A); tgt(b.neck.rotation, 'y', iso2 * 0.06 * A);
    tgt(b.head.rotation, 'x', -0.08); tgt(b.head.rotation, 'z', -iso * 0.09 * A); tgt(b.head.rotation, 'y', iso2 * 0.08 * A);
  }

  // K. Crouch-prowl — a low, martial crouch stalking side to side: deep bent
  // knees, hunched spine, head low and forward. Grounded/predatory rather
  // than upright — tribal-fusion's "almost martial posture" read.
  function crouchProwl(c) {
    const { b, tgt, set, A, elapsedBeats } = c;
    const eb = elapsedBeats % 8;
    const shift = Math.sin((eb / 8) * Math.PI * 2);
    const settle = smoothstep(Math.min(1, elapsedBeats / 2));   // ease INTO the crouch on entry

    set(b.pelvis.position, 'x', shift * 0.12 * A); set(b.pelvis.position, 'y', 0.12 - settle * 0.10 * A);
    tgt(b.pelvis.rotation, 'z', shift * 0.08 * A); tgt(b.pelvis.rotation, 'y', shift * 0.10 * A);
    tgt(b.spine.rotation, 'x', 0.08 + settle * 0.24 * A); tgt(b.spine.rotation, 'z', -shift * 0.06 * A);
    tgt(b.chest.rotation, 'z', shift * 0.08 * A); tgt(b.chest.rotation, 'y', shift * 0.10 * A);

    tgt(b.upperArmL.rotation, 'z', 0.16); tgt(b.upperArmL.rotation, 'x', REST_ARM_X + settle * 0.12 * A);
    tgt(b.upperArmR.rotation, 'z', -0.16); tgt(b.upperArmR.rotation, 'x', REST_ARM_X + settle * 0.12 * A);
    tgt(b.forearmL.rotation, 'x', REST_FORE_X + settle * 0.15); tgt(b.forearmR.rotation, 'x', REST_FORE_X + settle * 0.15);

    tgt(b.thighL.rotation, 'x', REST_LEG_X + settle * 0.30 * A + Math.max(0, shift) * 0.08 * A);
    tgt(b.thighR.rotation, 'x', REST_LEG_X + settle * 0.30 * A + Math.max(0, -shift) * 0.08 * A);
    tgt(b.shinL.rotation, 'x', REST_LEG_X + settle * 0.34 * A); tgt(b.shinR.rotation, 'x', REST_LEG_X + settle * 0.34 * A);

    tgt(b.neck.rotation, 'x', 0.05 + settle * 0.14 * A); tgt(b.neck.rotation, 'z', 0); tgt(b.neck.rotation, 'y', shift * 0.08 * A);
    tgt(b.head.rotation, 'x', -0.05 + settle * 0.18 * A); tgt(b.head.rotation, 'z', 0); tgt(b.head.rotation, 'y', shift * 0.14 * A);
  }

  // L. Poly-step — a syncopated stepping pattern against a 6-beat cycle (a
  // polyrhythm across the underlying 4/4 grid, per tribal house's blend of
  // four-on-the-floor with polyrhythmic percussion): a heavier accent every
  // 3rd beat with a mirrored arm-pump call-and-response.
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

  // `affinity` tags which instrument register a move's vocabulary suits —
  // used to WEIGHT (not gate) the pick below, so each dancer leans into moves
  // that fit what's actually playing right now: LOW (bass/kick) → grounded/
  // percussive; HIGH (hi-hat/cymbal/perc) → sharp/snappy isolations; MID
  // (melodic/vocal) → flowing/held gestures. Moves with no `affinity` (the
  // original general-purpose workhorses) are untagged and get a flat baseline
  // weight regardless of the mix, so the vocabulary never narrows to ONLY
  // instrument-matched moves — it leans, it doesn't lock.
  const MOVE_TABLE = {
    grooveSway: { beats: 8, pool: ['idle', 'low', 'high'], run: grooveSway },
    handsFace: { beats: 8, pool: ['idle', 'low'], affinity: 'mid', extras: true, run: handsFace },
    strike: { beats: 8, pool: ['high'], run: strike },
    breakdown: { beats: 16, pool: ['idle', 'low'], run: breakdown },
    stepTouch: { beats: 4, pool: ['high'], affinity: 'low', run: stepTouch },
    bodyWave: { beats: 4, pool: ['idle', 'low', 'high'], affinity: 'mid', extras: true, run: bodyWave },
    reachOpen: { beats: 8, pool: ['low', 'high'], mirrored: true, affinity: 'mid', extras: true, run: reachOpen },
    tribalStomp: { beats: 4, pool: ['idle', 'low', 'high'], affinity: 'low', run: tribalStomp },
    invocation: { beats: 12, pool: ['idle', 'low', 'high'], affinity: 'mid', extras: true, run: invocation },
    groundedIsolation: { beats: 8, pool: ['idle', 'low', 'high'], affinity: 'high', run: groundedIsolation },
    crouchProwl: { beats: 8, pool: ['low', 'high'], affinity: 'low', run: crouchProwl },
    polyStep: { beats: 6, pool: ['low', 'high'], mirrored: true, affinity: 'high', run: polyStep },
  };

  // Weighted pick: `weights[i]` is the relative chance of `names[i]`. Used so
  // instrument-affinity BIASES the pick instead of gating it (every eligible
  // move stays reachable; the mix just tilts the odds).
  function weightedPick(names, weights) {
    let total = 0; for (let i = 0; i < weights.length; i++) total += weights[i];
    if (!(total > 0)) return names[Math.floor(Math.random() * names.length)];
    let r = Math.random() * total;
    for (let i = 0; i < names.length; i++) { r -= weights[i]; if (r <= 0) return names[i]; }
    return names[names.length - 1];
  }

  // Re-selects rigState's active move every 8 beats, AND immediately on a
  // drop's rising edge (so the strike accent lands right when the section
  // changes, not up to 8 beats late — it may then run short if the next
  // 8-beat boundary falls soon after; that's fine, every move crossfades out
  // cleanly via the shared damping). Context gates the eligible pool: idle
  // (no track locked yet) / low (playing, not in a sustained-loud section) /
  // high (`appState.lightshow.drop`). WITHIN that pool, the pick is weighted
  // toward whichever move's `affinity` matches the instrument mix dominating
  // the track right now (bandMix). Called independently per rig — each
  // dancer keeps its OWN moveStartBeat/lastBar8/prevDrop, so the two land on
  // independent weighted-random picks at the same structural moments rather
  // than a shared/duplicated choice (except `strike`, which both always
  // trigger together on the same drop edge — the one synced duet accent).
  function updateMoveSelection(rigState, clk) {
    const drop = !!(appState.lightshow && appState.lightshow.drop);
    // Authored arc overrides the pool context where it KNOWS the structure —
    // 'drop' commits to the high-energy pool, 'breakdown' commits to the calm
    // pool — ahead of (or in place of) the live Schmitt-trigger, which reacts
    // to the signal rather than knowing the track. Other section types
    // (intro/groove/build/outro/no-arc-loaded) fall back to the live-only
    // idle/low/high gate exactly as before.
    const arcCtx = clk.arcSection === 'drop' ? 'high' : clk.arcSection === 'breakdown' ? 'idle' : null;
    const ctx = arcCtx || (!clk.locked ? 'idle' : (drop ? 'high' : 'low'));

    // Strike fires in unison on EITHER trigger: the live reactive drop signal
    // (as before) OR the authored arc entering its known 'drop' section
    // (clk.arcDropEdge — computed once per frame in musicClock, shared by
    // both rigs, so this can't double-fire out of sync between them).
    if ((drop && !rigState.prevDrop) || clk.arcDropEdge) {
      rigState.currentMoveName = 'strike'; rigState.currentMove = MOVE_TABLE.strike;
      rigState.moveStartBeat = clk.beatPos; rigState.moveMirror = 1;
      rigState.moveAmp = 0.94 + Math.random() * 0.12; rigState.movePhaseOfs = 0;   // the drop accent stays tight/on-time, only a small amplitude variance
      rigState.lastBar8 = Math.floor(clk.beatPos / 8);   // don't immediately re-roll this same window
      rigState.prevDrop = drop;
      return;
    }
    rigState.prevDrop = drop;

    const bar8 = Math.floor(clk.beatPos / 8);
    if (bar8 !== rigState.lastBar8) {
      rigState.lastBar8 = bar8;
      const pool = Object.keys(MOVE_TABLE).filter((n) => n !== 'strike' && MOVE_TABLE[n].pool.includes(ctx));
      let name = 'grooveSway';
      if (pool.length) {
        const a = appState.music && appState.music.audio;
        const mix = (clk.locked && a && a._trackName) ? bandMix(a._trackName, a.currentTime) : { low: 0.33, mid: 0.34, high: 0.33 };
        const weights = pool.map((n) => {
          const aff = MOVE_TABLE[n].affinity;
          return aff ? 0.5 + mix[aff] * 3 : 1;   // untagged moves: flat baseline; tagged moves: lean toward their band
        });
        name = weightedPick(pool, weights);
      }
      rigState.currentMoveName = name; rigState.currentMove = MOVE_TABLE[name];
      rigState.moveStartBeat = clk.beatPos;
      rigState.moveMirror = (rigState.currentMove.mirrored && Math.random() < 0.5) ? -1 : 1;
      // Per-instance variation (see dance()): a small amplitude scale and a
      // small internal-clock nudge, rolled fresh each time this move is
      // picked, so neither back-to-back reps within the move's own cycle nor
      // separate pickings of the same move later in the track are identical.
      rigState.moveAmp = 0.88 + Math.random() * 0.24;          // 0.88..1.12
      rigState.movePhaseOfs = (Math.random() - 0.5) * 0.5;     // ±0.25 beat
    }
  }

  // ── secondary-motion PHYSICS (spring-damper, zero dependencies) ──────────
  // The user asked for PhysX/Euphoria. Neither is viable here: Euphoria was
  // NaturalMotion's proprietary tech, absorbed by Rockstar, never sold or
  // open-sourced as an SDK anyone can license; PhysX's web build is a
  // multi-MB WASM binary, and this project's CLAUDE.md states "zero runtime
  // dependencies" as a hard rule (no npm install, everything vendored). What
  // a physics engine would actually BUY here — hair/wings/fringe that swing
  // with real momentum and settle instead of moving rigidly with the bone —
  // is achievable with a proper spring-mass-damper integrator on the EXISTING
  // proxy joints, at zero extra dependency cost: neither rig has separate
  // hair/wing/cloth bones (hair is skinned to Head, wings/chest ornament to
  // Chest — see the recent attachment-fix commits), so giving Head/Chest (and
  // Neck/Spine, which drive them) real momentum makes the skinned hair/wing
  // geometry follow through for free, no new bones or Blender pass needed.
  //
  // The OLD `tgt`/`set` were a pure exponential low-pass (`x += (target-x)*k`)
  // — no velocity, no overshoot, ever. This is why nothing had physical
  // "weight": it eases directly onto the target and stops dead, the textbook
  // critically-overdamped response. A damped harmonic oscillator (semi-
  // implicit/symplectic Euler: integrate acceleration → velocity → position
  // each step, sub-stepped for stability) is the standard lightweight
  // technique for this in games ("spring bones") — same category of tool as
  // the coherent-noise/Markov-selection techniques already cited in this
  // file, deliberately NOT a physics-engine dependency.
  //
  // Two tuned profiles, chosen by damping ratio (zeta = k2 / (2*sqrt(k1))):
  // SPRING_LIGHT (limbs/pelvis, zeta≈0.90) stays close to the old snappy feel
  // — barely any overshoot, so legs/arms never read as loose or floppy.
  // SPRING_HEAVY (head/neck/chest/spine, zeta≈0.74) is deliberately more
  // underdamped — a visible settle/overshoot on quick direction changes is
  // the whole point, since that's what reads as hair/wing momentum. Both are
  // tuned to reach the target on a similar TIMESCALE to the old damping (a
  // few hundred ms), just with a different response SHAPE, not a slower one.
  const SPRING_LIGHT = { k1: 210, k2: 26 };   // omega≈14.5 rad/s, zeta≈0.90
  const SPRING_HEAVY = { k1: 90, k2: 14 };    // omega≈9.5 rad/s,  zeta≈0.74
  const SPRING_SUBSTEPS = 2;   // cheap stability margin at low framerates (dt is already clamped ≤1/30 in frame())
  function springStep(obj, axis, target, dt, profile) {
    const vKey = '_v' + axis;
    let v = obj[vKey] || 0;
    let x = obj[axis];
    if (!Number.isFinite(v)) v = 0;      // guard: a NaN velocity must never persist and corrupt every future frame
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

  // ── the dance (per rig) ────────────────────────────────────────────────
  // Everything is DAMPED toward a target each frame (factor k, framerate-aware)
  // so each figure grooves smoothly and never snaps or seizures. Ranges are
  // kept inside safe limits so no bone clips through another. dance() writes
  // to the rig's PROXY joints (persistent Euler/Vector3 — same `.rotation.
  // x/y/z` / `.position` API as a THREE.Bone) so the gesture math + damping
  // stay consistent; the adapter (applyRig) converts proxy → real bone each
  // frame. WHICH move runs is decided per-rig by updateMoveSelection (an
  // 8/16-beat grid, weighted-random within a context-gated pool); switching
  // moves needs no special-case crossfade because every move writes every
  // proxy and the shared `tgt`/`set` damping eases between whatever two
  // targets differ. `energy`/`beatAccent` are shared across both rigs (same
  // music), so amplitude/accent stay in lockstep even while each dancer's
  // chosen MOVE differs.
  function dance(rigState, dt, t, clk) {
    const b = rigState.bones;
    const k = 1 - Math.pow(0.001, dt);         // framerate-independent damping
    const strength = Number.isFinite(clk.strength) ? clk.strength : 0.6;   // THIS beat's real envelope loudness
    const A = 0.55 + energy * 0.7 + strength * 0.35;   // section energy + per-beat strength: a genuinely hard beat moves bigger than a soft one, not just a slow section-level ramp
    const hit = beatAccent * (0.5 + energy * 0.5);   // music-locked on-beat accent (beatAccent already carries per-beat strength + jitter via musicClock)
    const p = phase;
    // A pure Math.sin is perfectly symmetric attack/release, which is one of
    // the tells that reads as mechanical rather than a human weight transfer
    // (a body moves in arcs, not a metronome). Adding a small second harmonic
    // breaks that symmetry — still perfectly smooth/continuous (no velocity
    // discontinuity), just no longer a pure sinusoid — the cheapest way to
    // give the master oscillator an organic, slightly asymmetric silhouette
    // instead of a textbook wave.
    const s = Math.max(-1, Math.min(1, Math.sin(p) + 0.12 * Math.sin(2 * p + 0.6)));

    const tgt = (euler, axis, target) => springStep(euler, axis, target, dt, euler.__heavy ? SPRING_HEAVY : SPRING_LIGHT);
    const set = (vec, axis, target) => springStep(vec, axis, target, dt, vec.__heavy ? SPRING_HEAVY : SPRING_LIGHT);
    const add = (obj, axis, extra) => { obj[axis] += extra * k * 3; };

    updateMoveSelection(rigState, clk);
    // Per-instance amplitude/timing jitter (rolled once per move selection,
    // not per frame — see updateMoveSelection): the SAME move repeating its
    // internal cycle (e.g. tribalStomp's 4-beat stomp, twice inside its 8-beat
    // slot) would otherwise be pixel-identical rep to rep, and picking the
    // same move again later in the track would look identical to the last
    // time — both are the "looped animation" tell. Scaling amplitude and
    // nudging the move's internal clock per-instance (applied here, once, so
    // every move function gets it for free without touching all twelve) fixes
    // that without needing true per-frame randomness.
    const A_j = A * (rigState.moveAmp || 1);
    let elapsedBeats = Math.max(0, (clk.beatPos - rigState.moveStartBeat) / (clk.tempoScale || 1));
    elapsedBeats = Math.max(0, elapsedBeats + (rigState.movePhaseOfs || 0));
    rigState.currentMove.run({ b, tgt, set, add, A: A_j, hit, p, s, dt, elapsedBeats, mirror: rigState.moveMirror, rig: rigState });
    // Moves that don't drive the extra joints (subdivided spine / clavicles /
    // wrists / finger-curls) ease them back to rest so a curl or shrug from the
    // previous move relaxes instead of freezing. The four `extras` moves own
    // those joints themselves. On the 13-bone Armadrillo these are free no-ops.
    if (!rigState.currentMove.extras) restExtras(b, tgt);

    // shared, always-on accents regardless of the active move: the on-beat
    // knee/body dip so the tempo is always physically felt, and the slow 3/4
    // turn so the figure never sits flat-on for long.
    add(b.pelvis.position, 'y', -hit * 0.06);
    add(b.thighL.rotation, 'x', hit * 0.12);
    add(b.thighR.rotation, 'x', hit * 0.12);
    add(b.spine.rotation, 'x', hit * 0.06);
    tgt(b.root.rotation, 'y', Math.sin(p * 0.5) * 0.16);
  }

  // ── adapter: proxy joints → real bone transforms (per rig) ────────────────
  // Delegates to the portable engine (dance-retarget.js applyAdapters): for
  // every driven bone it builds a LOCAL delta from its proxy rotations - via
  // the EXPLICIT axis map for the two shipping rigs (bit-identical to the old
  // inline math: bone.quaternion = bindQ · Δ) or the analytic change-of-basis
  // for an un-hinted rig - so the captured bind pose is preserved and the dance
  // eases away from it. The pelvis also takes the translation sway (side = local
  // X, up = local Z in its Z-up parent frame), scaled by THIS rig's posScale.
  const _retargetScratch = { e: _e, q: _q, q2: new THREE.Quaternion() };
  function applyRig(rigState) {
    applyAdapters(rigState.adapters, _retargetScratch);
    applyPelvisSway(rigState.pelvisBone, rigState.pelvisBind, rigState.proxies.pelvis.position, rigState.cfg.posScale);
  }

  // ── main loop ──────────────────────────────────────────────────────────
  let last = 0;
  function frame(ts) {
    if (!running || dead) return;
    const now = ts / 1000;
    let dt = last ? now - last : 0.016;
    dt = Math.min(dt, 1 / 30);      // clamp so a background pause can't lurch the pose
    last = now;

    // shared music clock: advances even if one (or both) rigs haven't
    // finished loading yet, so neither rig's load time blocks the other.
    const rawE = readRawEnergy(now);
    const kEnergy = 1 - Math.pow(0.88, dt * 60);   // ≈ the old flat 0.12-per-frame-at-60fps factor
    energy += (rawE - energy) * kEnergy;
    if (!Number.isFinite(energy)) energy = 0.28;          // never let NaN corrupt either figure

    const clk = musicClock(dt);
    const rate = Number.isFinite(clk.rateHz) ? clk.rateHz : 0.42;
    phase += rate * dt * 2 * Math.PI;
    if (!Number.isFinite(phase)) phase = 0;               // guard against any NaN creep
    beatAccent = Number.isFinite(clk.accent) ? clk.accent : 0;
    if (!Number.isFinite(clk.beatPos)) clk.beatPos = 0;   // guard: never let move-selection see NaN
    if (!Number.isFinite(clk.tempoScale) || clk.tempoScale <= 0) clk.tempoScale = 1;
    if (!Number.isFinite(clk.strength)) clk.strength = 0.6;

    for (let i = 0; i < rigs.length; i++) {
      const rigState = rigs[i];
      if (!rigState.modelReady || !rigState.bones) continue;   // that rig's load hasn't landed yet

      updateDuetSlot(rigState, i === 0 ? 'a' : 'b', dt);   // per-panel placement (see PANEL_LAYOUTS)
      dance(rigState, dt, now, clk);
      applyRig(rigState);   // proxy joints → real bones (retarget)

      // Refresh bone world matrices → skeleton bone matrices BEFORE render.
      // GPU skinning does the per-vertex work.
      rigState.rigGroup.updateMatrixWorld(true);
      for (let j = 0; j < rigState.skinnedMeshes.length; j++) {
        const sk = rigState.skinnedMeshes[j].skeleton;
        if (sk) sk.update();
      }
    }

    // Beat illumination (shared across both rigs): energy sets the floor,
    // beatAccent's smooth decay curve blooms it on each beat (bar-weighted,
    // so the downbeat reads brightest). Two knobs carry this: the wireframe
    // accent's opacity (the glowing "circuitry" pulse, one shared material)
    // and the chrome pass's colour multiplier (a subtler whole-body
    // brightening on hard beats) — applied to EVERY chrome material instance
    // (one per unique diffuse texture now that real textures are restored,
    // not just the single flat-color instance this used to be). See the
    // WCAG 2.3.1 note in the header comment.
    const glow = Math.min(1, 0.15 + energy * 0.3 + beatAccent * 0.4);
    wireMat.opacity = Math.min(0.5, 0.06 + glow * 0.28);
    // Keep this at/below 1.0 — MeshMatcapMaterial multiplies `.color` into
    // BOTH the matcap tone and the real diffuse `.map`, so anything above 1.0
    // blows out the texture (and the matcap's own highlight) toward flat
    // white instead of brightening it, which is what was washing out the
    // real skin tone/texture detail under the chrome shading.
    const chromeColor = Math.min(1, 0.62 + glow * 0.38);
    for (let i = 0; i < chromeMats.length; i++) chromeMats[i].color.setScalar(chromeColor);

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
    // (shared — both dancers read the same clock)
    get bpm() { const a = appState.music && appState.music.audio; const i = a && trackInfo[a._trackName]; return i ? Math.round(i.bpm) : 0; },
    get beatAccent() { return +beatAccent.toFixed(2); },
    get locked() { const m = appState.music, a = m && m.audio; return !!(a && !m.paused && !a.paused && a.currentTime > 0.05 && trackInfo[a._trackName]); },
    // geometry diagnostics (loaded glTF budget, summed across both rigs)
    get tris() { return rigA.triCount + rigB.triCount; },
    get verts() { return rigA.vertCount + rigB.vertCount; },
    get ready() { return rigA.modelReady && rigB.modelReady; },
    get phase() { return +phase.toFixed(2); },
    get energy() { return +energy.toFixed(2); },
    // current choreography move per dancer (for tuning/iteration) — `move`
    // kept as the back-compat name for dancer A (the Armadrillo)
    get move() { return rigA.currentMoveName; },
    get moveB() { return rigB.currentMoveName; },
    get readyA() { return rigA.modelReady; },
    get readyB() { return rigB.modelReady; },
    // retarget diagnostics: driven roles + the honest auto-vs-manual measure
    // (how close a hint-free analytic derivation gets to each hand-tuned bone).
    get retargetReport() { return { a: rigA.retargetReport, b: rigB.retargetReport }; },
  };

  raf = requestAnimationFrame(frame);
}
