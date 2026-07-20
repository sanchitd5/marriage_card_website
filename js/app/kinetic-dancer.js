import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import {
  CORE_ROLES, createProxyRig, buildRig, applyAdapters, applyPelvisSway, measureAutoVsManual,
} from './dance-retarget.js';

// ── Kinetic dancers (a persistent chrome DUET, cyan wireframe accent) ────
// TWO loaded, rigged glTF humanoids: the Sketchfab "Armadrillo" (CC-BY-4.0,
// kimni88, 50-bone, T-pose) and "DP Techno Fairy Punk Set" (CC-BY-4.0,
// BilloXD) — the latter shipped as a static unrigged character set and rigged
// for this project with an EXPANDED 21-bone biped skeleton (subdivided spine +
// clavicles + wrists + finger-curls, arms A-pose-matched so they actually
// deform; built by a deterministic pure-Python re-rig, see assets/scene/
// fairy-punk/license.txt). Both dance to the background music across every
// panel: ambient decoration, no user interaction, no audio node of its own —
// a wedding-invitation duet motif, not a literal depiction of either half of
// the couple.
//
// ── ONE full-viewport context, shared with the ambient crowd ─────────────
// The two featured "hero" dancers are the LARGEST figures in a full-viewport
// scene they SHARE with the ambient armadrillo crowd (see below): a single
// WebGL renderer/scene/camera on #k-ambient-dancers. They are placed at two
// spread full-screen NDC anchors (armadrillo left-of-centre, fairy-punk
// right-of-centre; see placeDuet/duetAnchor) so they read as two prominent
// performers standing among the scattered crowd — not confined to a strip.
// (History: they used to render on their own narrow right-strip canvas
// #k-dancer-canvas via a SECOND renderer/scene/camera + per-panel
// PANEL_LAYOUTS; that whole path is retired — one context now, one coordinate
// system, and the crowd's placeAtNDC screen→world placement works for the
// duet too. #k-dancer-canvas is left in the DOM but hidden by CSS.)
//
// This is a sibling to lightshow.js (same renderer posture, same context-loss
// / resize / visibility handling). It reads the OFFLINE music energy the
// lightshow already computes (appState.lightshow.energy) rather than opening a
// new AnalyserNode, so the two stay in lockstep and there is no extra audio cost.
//
// ── Two independent RIGS, one shared choreography engine ─────────────────
// Each rig gets its own Group (`rigGroup` → `turnGroup` → model), its own
// proxy/adapter set, and its own move-selection state (currentMove/
// moveStartBeat/moveMirror/prevDrop/headTrail) — see `createRigState`.
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
  // The shared full-viewport canvas (#k-ambient-dancers) is the ONLY render
  // target now — the old narrow-strip #k-dancer-canvas is retired (left in the
  // DOM but hidden by CSS). Bail if the render canvas is absent.
  if (!$('#k-ambient-dancers')) return;

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
  // Body tint for the map-less armadrillo (its material carries NO diffuse
  // texture — plain grey). Instead of neutral grey chrome, colour the body in
  // the site's CYAN theme: the matcap grey ramp still shades the sculpted form,
  // and this multiplies a cyan hue over it so the whole figure reads cyan-metal
  // on the obsidian bg (same family as the wireframe accent + flash cyan).
  // Mapped materials (e.g. a textured rig) keep white so their real texture
  // shows. Stored as `mat.__base` so the per-frame beat-illumination modulates
  // this hue's BRIGHTNESS instead of overwriting it to grey (see frame()).
  const ARMADRILLO_TINT = 0x22d3ee;   // site accent cyan
  const chromeMats = [];
  function getChromeMat(srcMat) {
    const map = srcMat && srcMat.map ? srcMat.map : null;
    const key = map ? map.uuid : 'none';
    for (const m of chromeMats) if (m.__key === key) return m;
    const opts = { matcap: chromeMatcapTex, color: map ? 0xffffff : ARMADRILLO_TINT, skinning: true };
    if (map) opts.map = map;
    // carry over transparency/alpha-cutout from the SOURCE material (e.g. a
    // hair card rendered with an alpha-masked texture) so restoring the real
    // texture doesn't also lose whatever cutout it needs to read correctly.
    if (srcMat && srcMat.transparent) opts.transparent = true;
    if (srcMat && srcMat.alphaTest) opts.alphaTest = srcMat.alphaTest;
    if (srcMat && srcMat.side !== undefined) opts.side = srcMat.side;
    const mat = new THREE.MeshMatcapMaterial(opts);
    mat.__key = key;
    mat.__base = new THREE.Color(opts.color);   // pristine hue; beat-illum modulates brightness off this
    chromeMats.push(mat);
    disposables.push(mat);
    return mat;
  }
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff, wireframe: true, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, skinning: true });
  const disposables = [wireMat, chromeMatcapTex];   // chromeMats are pushed in as they're created (see below)

  // ── lifecycle ────────────────────────────────────────────────────────
  let running = true, raf = 0, dead = false;

  // ── AMBIENT armadrillo crowd + the featured duet (tablet + desktop only) ──
  // A time-based (NOT tap-driven) effect: at random intervals lone armadrillo
  // dancers fade in at random spots across the WHOLE viewport, groove to the
  // same music clock as the duet, then fade out. This is the SHARED full-
  // viewport canvas / renderer / scene / camera (#k-ambient-dancers) — the two
  // featured hero dancers (rigA/rigB) render into it TOO (see setupDuet/
  // placeDuet), so there is ONE WebGL context total, one camera, one
  // coordinate system. Spawns REUSE the duet's dance() engine,
  // MOVE_TABLE, retarget adapters and the shared music clock, so they read as
  // the same performers; each gets its OWN rigState (move pick, phase, lean,
  // amp) so they never move in lockstep. Instances are POOLED (skinned-mesh
  // cloning is expensive) via THREE.SkeletonUtils.clone of the loaded
  // armadrillo — spawn = reactivate a pooled clone at a new position; despawn =
  // hide + return to pool (never per-spawn dispose). Only the armadrillo is
  // ever spawned (never the fairy-punk).
  const ambientCanvas = $('#k-ambient-dancers');
  let ambientRenderer = null, ambientScene = null, ambientCamera = null;
  let ambientInited = false, ambientEnabled = false, ambientLive = false, ambientNeedsClear = false;
  let ambientSpawnTimer = 0, spawnSeq = 0;
  const ambientPool = [];              // all built pooled instances (active or not)
  const ambientDisposables = [];       // per-instance cloned materials (disposed on teardown)
  const AMBIENT_MIN_WIDTH = 768;       // tablet + desktop only; phones skip entirely
  // Crowd size floor/ceiling. At least AMBIENT_MIN armadrillos are always in the
  // scene once enabled; the count climbs toward AMBIENT_MAX as a section builds
  // into a high upbeat (see updateAmbient's energy-driven target). MAX is tiered
  // by rough device capability (hardwareConcurrency/deviceMemory) so 20 skinned
  // clones can't stall a weak tablet — the MIN floor of 5 holds on every device.
  const _cores = navigator.hardwareConcurrency || 4;
  const _mem = navigator.deviceMemory || 4;
  const AMBIENT_MIN = 5;
  const AMBIENT_MAX = (_cores >= 8 && _mem >= 8) ? 20 : (_cores <= 4 || _mem <= 4) ? 12 : 16;
  const AMBIENT_SCALE_BASE = 0.34;     // fraction of the armadrillo's duet fit scale → scattered-crowd size
  const _ndc = new THREE.Vector3();    // scratch for screen→world unprojection (spawn-time only)

  // ── GIANT "presenter" armadrillo (welcome + drop takeover) ───────────────
  // ONE reserved, humongous armadrillo — NOT part of the spawn pool — that
  // takes the stage as a presenter in two moments: a WELCOME right after the
  // gate opens (dances a few seconds, then leaves), and a DROP TAKEOVER
  // whenever the live drop level crosses its threshold. While it is on screen
  // the console HUD is hidden together (html.hud-hidden — see css/kinetic.css)
  // so nothing competes with it; the HUD fades back in as the giant leaves. It
  // is built lazily from the SAME loaded armadrillo (SkeletonUtils.clone of
  // rigA.model) via buildAmbientInstance, then removed from ambientPool so the
  // crowd scheduler never reuses it, and driven by the SAME dance()/applyRig
  // engine into this SAME shared scene (no third WebGL context). Reduced-motion
  // never reaches here (initKineticDancer bails under REDUCED at the very top),
  // so the HUD can never vanish for those users.
  let giant = null;                    // the reserved presenter instance (lazy)
  let giantOpacity = 0;                // eased 0..1 fade (independent of the crowd)
  let giantDropHi = false;             // hysteretic threshold state of the live drop level
  let dropBurstTimer = 0;              // seconds left in a drop-triggered takeover BURST (capped, edge-armed)
  // The small crowd holds off until CROWD_START_DELAY after the HUD first appears
  // (= after the welcome giant leaves), so nothing spawns during the gate screen
  // or the welcome — then the crowd trickles in.
  let crowdReady = false, crowdArmed = false, crowdArmTimer = 0;
  const CROWD_START_DELAY = 2;         // seconds after the HUD appears before the first small armadrillo
  let presenterShown = false;          // is the giant currently claiming the stage (drives html.hud-hidden)
  let welcomeArmed = false;            // gate-open fired; welcome not yet started (may defer until the model loads)
  let welcomeStarted = false;          // one-shot latch: the welcome has already run
  let welcomeTimer = 0;                // seconds left in the welcome window
  const WELCOME_SECONDS = 5;           // how long the welcome dance holds before the HUD arrives
  const GIANT_FADE_SECONDS = 0.55;     // giant fade in/out duration (opacity ramp)
  const GIANT_SCALE_MULT = 1.6;        // × the duet fit → humongous (VISUAL-VERIFY / tune)
  // Centre stage, and low enough that the HEAD lands at screen centre (not the
  // body). frameModel anchors the model's BODY-centre at this NDC, and the giant
  // is ≈0.93 viewport tall (fit 0.58 × GIANT_SCALE_MULT 1.6), so its head sits
  // ≈+0.9 NDC above centre — drop the anchor ≈that much so the head reads centred
  // and the humongous body fills the lower + side stage. VISUAL-VERIFY: this is
  // the head-centring knob; nudge if the head sits high/low or clips the top.
  const GIANT_NDC_X = 0, GIANT_NDC_Y = -0.85;
  const DROP_ON = 0.55, DROP_OFF = 0.42;        // hysteresis band on appState.lightshow.drop (0..1)
  const DROP_BURST_SECONDS = 4.5;               // capped takeover per drop EDGE — HUD returns after this even on a sustained high upbeat

  // Arm the welcome on the gate-open signal kinetic.js dispatches once the gate
  // is fully removed + scroll unlocked. If the model has not loaded yet this
  // just stays armed and the welcome starts the frame the model becomes ready.
  window.addEventListener('kinetic-gate-open', () => { welcomeArmed = true; }, { once: true });

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
    // FULL-SCREEN featured framing: the two hero dancers now share the ambient
    // full-viewport scene/camera (not the retired narrow strip), so fitH is a
    // fraction of the WHOLE viewport height — sized clearly above the crowd's
    // typical bodies so the pair reads as the featured performers; they're
    // spread apart horizontally by duetAnchor (see placeDuet). This creature is
    // wide, so it keeps a touch more width budget than the slimmer fairy-punk.
    fitH: 0.58, fitW: 0.52,
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
    // Non-anatomical secondary-motion bones (gen-fairy-punk-rig.py) — no
    // choreography role, driven purely by updateDanglers()'s runtime physics.
    // Post-GLTFLoader-import names (loader drops dots: "WingTip.L" -> "WingTipL").
    danglers: ['HairMid', 'HairTip', 'WingTipL', 'WingTipR'],
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
    // fitH lower than the Armadrillo's: this rig's hair/headdress mesh extends
    // well above the Head bone itself, which frameModel() fits by (bone
    // positions only, not mesh extent), so it needs more headroom. Full-viewport
    // fraction now (see RIG_A note); still a featured figure, above crowd size.
    fitH: 0.5, fitW: 0.44,
  };

  // ── full-screen featured-duet placement ──────────────────────────────────
  // The featured pair render into the SAME full-viewport scene/renderer/camera
  // as the ambient crowd (ONE WebGL context — the old narrow-strip
  // #k-dancer-canvas renderer + per-panel PANEL_LAYOUTS/updateDuetSlot +
  // CALIBRATED_ASPECT scheme are all retired). placeDuet positions each hero at
  // its full-screen NDC anchor (see duetAnchor) with a slow drift, ON TOP of the
  // calibrated fit captured by frameModel (fitX/fitY/fitZ/baseScale). It maps
  // NDC→world against the LIVE camera aspect every frame, so the horizontal
  // spread stays correct at any window shape without the old aspect correction.
  // Deliberately panel-AGNOSTIC: the dancers are a full-screen backdrop behind
  // every panel now, so there is NO data-panel lookup that could go stale or
  // throw for an unknown panel value — it degrades to the same fixed anchors
  // regardless of what <html data-panel> says. Ownership split (unchanged from
  // the crowd's convention): placeDuet owns .x/.z/scale + baseY; dance() owns
  // .y (the weight bounce, written from baseY). Safe no-op until the fit runs.
  const FEATURED_SCALE_MULT = 0.32;   // featured dancer displayed small (tiny-in-back); giant sizes off the FULL baseScale, not this
  function placeDuet(rigState, t) {
    const cam = ambientCamera;
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
    // Displayed SMALL (FEATURED_SCALE_MULT) so the ONLY humongous armadrillo is
    // the presenter giant — the featured dancer is just another tiny figure in
    // the field. baseScale itself stays the FULL fit (the giant sizes off it:
    // rigA.baseScale × GIANT_SCALE_MULT), so shrinking the display here does NOT
    // shrink the giant. dance()'s figRatio = scale.y/baseScale = the mult, so the
    // weight bounce scales down proportionally too (no hop).
    rigState.rigGroup.scale.setScalar(rigState.baseScale * FEATURED_SCALE_MULT);
    // dance() writes rigGroup.position.y each frame from baseY (weight bounce).
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
      moveStartBeat: 0, moveMirror: 1, prevDrop: false,
      moveAmp: 1, movePhaseOfs: 0,   // per-move-instance jitter, rolled fresh on each pick (see updateMoveSelection)
      headTrail: 0,   // secondary-motion memory for the head (grooveSway only), per-rig
      // Persistent per-rig asymmetry so the two figures never read as one signal
      // mirrored (the research "kill L/R symmetry" fix): a dominant-side lean and
      // a de-phased idle sway, applied whole-figure on rigGroup each frame (§ dance).
      idlePhase: 0, leanSign: 1,
      // frameModel captures the calibrated FIT (centred, correctly scaled) into
      // fitX/fitY/fitZ + baseScale; placeDuet re-derives baseX/baseY/baseZ each
      // frame from that fit + this rig's full-screen NDC anchor (duetAnchor).
      // dance() reads baseY (bounce origin) + baseScale (figRatio) each frame.
      baseX: 0, baseY: 0, baseZ: 0, baseScale: 1,
      fitX: 0, fitY: 0, fitZ: 0,
      duetAnchor: null,
    };
  }
  const rigA = createRigState(RIG_A);
  const rigB = createRigState(RIG_B);
  // Opposite dominant side + a de-phased idle clock per rig: the pair leans and
  // breathes independently instead of moving as one mirrored unit.
  rigA.leanSign = 1;  rigA.idlePhase = 0;
  rigB.leanSign = -1; rigB.idlePhase = 1.7;

  // TEMPORARY (coordinator, "for now"): show ONLY the armadrillo (rigA) as the
  // featured full-screen dancer; suppress the fairy-punk (rigB) ENTIRELY. rigB
  // is never added to the scene, loaded, framed, danced, danglered, or rendered
  // because the `rigs` array below — the SINGLE iteration point for both setup
  // (setupDuet) and the per-frame update (frame()) — omits it. rigA stays the
  // crowd clone source (buildAmbientInstance → rigA.model), unaffected. Flip
  // this one flag back to true to restore the full duet with NO other changes.
  const SHOW_FAIRY_PUNK = false;

  // Full-screen anchors (NDC). Duet ON → spread the pair ACROSS the viewport
  // (armadrillo left-of-centre, fairy-punk right-of-centre) so they read as two
  // prominent dancers standing apart among the scattered crowd. Duet OFF (now)
  // → the lone armadrillo sits near centre so the single featured dancer reads
  // balanced, not stranded on one side. A slow independent drift keeps each
  // from reading as a static sticker; placeDuet maps these NDC anchors → world
  // against the live camera aspect every frame, so the spread holds across
  // window shapes.
  rigA.duetAnchor = SHOW_FAIRY_PUNK
    ? { x: -0.46, y: -0.03, driftX: 0.05, driftY: 0.03,  speed: 0.05, phase: 0.0 }
    : { x: -0.06, y: -0.02, driftX: 0.06, driftY: 0.035, speed: 0.05, phase: 0.0 };
  rigB.duetAnchor = { x: 0.47, y: 0.04, driftX: 0.05, driftY: 0.03, speed: 0.045, phase: 1.9 };
  const rigs = SHOW_FAIRY_PUNK ? [rigA, rigB] : [rigA];

  // ── build (evaluate the width gate; start the RAF elsewhere) ──────────────
  // The featured duet and the ambient crowd share ONE renderer/scene/camera
  // (the full-viewport ambient context). evalAmbientGate inits that context if
  // the viewport is wide enough, which ALSO sets up the duet (setupDuet, called
  // from within the gate). Below the width gate nothing is allocated — phones
  // stay a clean dancer-free page (the CSS reserves no stage there). The RAF is
  // started at the bottom of initKineticDancer; frame() no-ops rendering until
  // the context + models exist, and pauses for free when the tab hides.
  function build() {
    evalAmbientGate();
    window.addEventListener('resize', () => { sizeAmbient(); evalAmbientGate(); }, { passive: true });
  }

  // Create the featured duet's rig groups + kick off both glTF loads, adding
  // them to the SHARED ambient scene. Idempotent (guarded by duetSetup) and
  // only ever runs once the ambient renderer/scene/camera exist (≥768px), so
  // frameModel can fit against the real camera. On each load success: add the
  // model, populate proxies/adapters, frame it, flip modelReady (each rig
  // independent — one loading slower never blocks the other). A failed load on
  // either rig fails safe (that rig stays absent, no throw). rigA is ALSO the
  // clone source for the crowd (buildAmbientInstance → SkeletonUtils.clone(
  // rigA.model)); its model stays intact in the graph, so cloning still works.
  let duetSetup = false;
  function setupDuet() {
    if (duetSetup || !ambientScene || !ambientCamera || dead || !THREE.GLTFLoader) return;
    duetSetup = true;
    for (const rigState of rigs) {
      // static placement group (position/scale/facing set after load, per frame
      // by placeDuet). GLTFLoader imports these assets UPRIGHT (Y-up standing),
      // so no uprighting rotation here — only a facing spin about Y.
      rigState.rigGroup = new THREE.Group();
      rigState.rigGroup.rotation.y = (rigState.cfg.faceSpin != null) ? rigState.cfg.faceSpin : FACE_SPIN;
      ambientScene.add(rigState.rigGroup);

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

      loader.load(rigState.cfg.url, (gltf) => onModelLoaded(rigState, gltf), undefined, () => { /* load error → that rig stays absent, fail safe */ });
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

    // Non-anatomical dangle bones (fairy-punk only) — collect real THREE.Bone
    // refs directly by name; they have no retarget role/proxy, so they sit
    // outside the mapBones()/adapters system entirely (see updateDanglers).
    if (rigState.cfg.danglers) {
      rigState.danglerBones = {};
      model.traverse((o) => {
        if (o.isBone && rigState.cfg.danglers.includes(o.name)) rigState.danglerBones[o.name] = o;
      });
    }
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
  // fraction of the FULL VIEWPORT (fitH/fitW), and centre it. placeDuet then
  // shifts the centred, correctly-scaled figure to its full-screen NDC anchor
  // each frame — so this fit stays a pure pixel-fit and is never disturbed by
  // placement. Fits against the SHARED ambientCamera (the one context now).
  const _corner = new THREE.Vector3(), _c = new THREE.Vector3();
  function frameModel(rigState, boneByRole) {
    if (!rigState.model || !ambientCamera) return;
    if (!rigState.frameBonesCache) {
      // Fit to the driven roles only (see call site comment) — fall back to
      // every bone only if a role map wasn't supplied (shouldn't happen at
      // runtime, but keeps this function safe to call standalone).
      rigState.frameBonesCache = boneByRole ? Object.values(boneByRole) : [];
      if (!rigState.frameBonesCache.length) rigState.model.traverse(o => { if (o.isBone) rigState.frameBonesCache.push(o); });
    }
    const frameBones = rigState.frameBonesCache;
    if (!frameBones.length) return;
    ambientCamera.updateMatrixWorld(true);
    const fovR = THREE.MathUtils.degToRad(ambientCamera.fov);
    const worldPerNDC = Math.tan(fovR / 2) * Math.abs(ambientCamera.position.z);   // ≈ world units per NDC half-height
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
        bn.getWorldPosition(_corner).project(ambientCamera);
        if (_corner.y < ymin) ymin = _corner.y;
        if (_corner.y > ymax) ymax = _corner.y;
        if (_corner.x < xmin) xmin = _corner.x;
        if (_corner.x > xmax) xmax = _corner.x;
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
    // Capture the CALIBRATED fit (centred, correctly scaled) once — placeDuet
    // (in the render loop) then derives baseX/baseY/baseZ = this fit + the
    // full-screen anchor every frame, so the fit quality here is never
    // re-derived or disturbed by placement. baseScale is FIXED (the fit) so
    // dance()'s figRatio (= scale.y / baseScale) stays 1 for the featured pair.
    // fitZ is the depth placeDuet uses for its NDC→world mapping, so the
    // anchor sits at the same depth the fit was measured at (size preserved).
    rigState.fitX = rigState.rigGroup.position.x;
    rigState.fitY = rigState.rigGroup.position.y;
    rigState.fitZ = rigState.rigGroup.position.z;
    rigState.baseScale = rigState.rigGroup.scale.x;
    rigState.baseX = rigState.fitX; rigState.baseY = rigState.fitY; rigState.baseZ = rigState.fitZ;
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
  // Twenty-five move phrases: five surviving high-energy originals (grooveSway
  // the workhorse, strike the drop accent, stepTouch, tribalStomp, polyStep —
  // the calm/flowing wedding-vein moves were removed) plus twenty techno floor
  // moves M-AF (stomps/shuffles/hardstyle/rave, see the applyPose section
  // below). Every move is a pure
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
  // Peak whole-figure vertical drop (world units) of the always-on weight
  // bounce in dance() — lowest on the beat. Deliberately larger than the old
  // on-beat hip dip: the "body drops under its own weight on the kick" is the
  // single biggest thing separating a dancer from a wobbling mannequin. Tuned
  // against the framed on-screen figure height; adjust here, verify visually.
  const BOUNCE_MAX = 0.12;
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

  // ── techno floor moves (M–AF): 20 rave / hardstyle / shuffle phrases ─────
  // Same contract as A–L, but authored through applyPose() so each move stays a
  // compact pose object. CRITICAL: tgt()/set() INTEGRATE the spring on the call
  // (not just store a target), so every core axis must be written EXACTLY ONCE
  // per frame — applyPose enforces that: it drives the full core proxy set once,
  // taking whatever the move supplies and easing everything omitted to its
  // dance-neutral rest (so no axis a sibling move drives ever freezes). None of
  // these use the EXTRA joints (subdivided spine/clavicles/wrists/fingers), so
  // restExtras() relaxes those for them on the fairy-punk rig (free no-op on the
  // Armadrillo). Sign map (matches A–L): thigh.x + = knee drives forward/up,
  // shin.x + = knee folds; upperArm.x + = raise forward, upperArm.z +L/−R =
  // abduct out to the side, forearm.x − = elbow flexes (hand up); pelvis.y down
  // = squat, pelvis.position.x = lateral travel, pelvis.rotation.y = yaw pivot.
  // The always-on weight bounce + on-beat knee give (dance()) ride underneath
  // all of them, so each move only paints its own limb signature.
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

  // M. Italian stomp — high knee lifts driving forcefully into the floor,
  // alternating legs; the opposite arm marches to counterbalance.
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

  // N. Melbourne shuffle — rapid heel-toe gliding, feet flicking twice a beat
  // while the whole figure drifts laterally across the floor.
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

  // O. Running man — the continuous illusion of running in one spot: one knee
  // drives up while the other leg slides back straight; arms pump opposite.
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

  // P. T-step — sideways shuffle on sharp heel-and-toe pivots: a snappy yaw
  // twist at each lateral step, weight punched onto the leading foot.
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

  // Q. Hakken — the lightning-fast repetitive gabber step: tight, rapid
  // alternating stomps with small hops, torso upright, elbows tucked and pumping.
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

  // R. Jumpstyle — explosive forward-and-back leg kicks in mid-air: a hop, both
  // legs scissoring hard front/back while airborne, arms flung out for balance.
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

  // S. Industrial stomp — aggressive heavy marching paired with stiff, robotic
  // arm swings locked at the elbow, thighs punching up alternately.
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

  // T. Turbo arms — rapid, chaotic spinning of both arms in front of the chest,
  // forearms bent, each on a de-phased fast circle so they never mirror cleanly.
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

  // U. Double-time bounce — the entire body pulsing (squat dip) twice as fast
  // as the main beat, knees absorbing each pulse.
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

  // V. Bass drop jump — a wind-up crouch then an explosion straight up into a
  // high leap, arms thrown overhead, timed to the drop.
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

  // W. Floor slap — bending deep to physically strike the ground on the heavy
  // kick (mirrored: the striking arm reaches down in front), then recover.
  function floorSlap(c) {
    const { A, elapsedBeats: eb, mirror } = c;
    const bf = eb - Math.floor(eb);
    const down = bf < 0.5 ? smoothstep(bf / 0.5) : 1 - smoothstep((bf - 0.5) / 0.5);
    const L = mirror > 0;                              // L → strike with the right arm
    // deep committed fold: hips pitch well forward, both knees buckle, and the
    // striking arm drives DOWN in front (upperArm.x negative = swinging down
    // from the raise, forearm straightening toward the floor) so the reach to
    // the ground reads unambiguously rather than sitting near arm-rest.
    applyPose(c, {
      py: 0.11 - down * 0.09 * A, spx: 0.08 + down * 0.85 * A,
      thL: REST_LEG_X + down * 0.4 * A, thR: REST_LEG_X + down * 0.4 * A,
      shL: REST_LEG_X + down * 0.6 * A, shR: REST_LEG_X + down * 0.6 * A,
      uaLx: L ? REST_ARM_X + down * 0.15 : REST_ARM_X - down * 0.7 * A, uaRx: L ? REST_ARM_X - down * 0.7 * A : REST_ARM_X + down * 0.15,
      uaLz: 0.12, uaRz: -0.12, foLx: L ? REST_FORE_X : REST_FORE_X - down * 0.5, foRx: L ? REST_FORE_X - down * 0.5 : REST_FORE_X,
      hx: -0.10 - down * 0.25 * A,
    });
  }

  // X. Mosher chop — rhythmic overhead downward arm chops synced to the heavy
  // percussion: arms overhead on the beat, crunching down between.
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

  // Y. Windmill — large upright ARM windmills (both arms, opposite phase, big
  // vertical circles kept in front of / above the body) mirroring fast synth
  // arpeggios. Torso stays upright — arm.x is biased positive so an arm never
  // swings behind the back into a collapsed/faceplant silhouette (front camera).
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

  // Z. Kick-step — flicking one foot forward, then snapping it back into a
  // stomp (mirrored). Sharp, syncopated leg accent.
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

  // AA. Side-to-side sprint — a sprinting motion (fast opposite arm/leg drive,
  // forward lean) while shifting horizontally across the floor.
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

  // AB. Shoulder jacks — fast, violent up-and-down shaking of the upper frame:
  // torso jerks, shoulders alternately jacking, at triple time.
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

  // AC. Fist pump sprint — pounding the air (right fist driving up on the beat)
  // while rapidly jogging on the spot.
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

  // AD. Ceili step — high-energy, springy Irish-style skips adapted for fast
  // electronic beats: proud upright carriage, legs doing the light hop work.
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

  // AE. Rave low-ride — a deep, sustained squat held low while the feet keep a
  // rapid bounce and the torso sways.
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

  // AF. Body roll snap — whipping the torso back and forth (a fast forward
  // crunch, head following) to mimic sharp hi-hats.
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
  // dancer keeps its OWN moveStartBeat/prevDrop, so the two land on
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
      rigState.prevDrop = drop;
      return;
    }
    rigState.prevDrop = drop;

    // Re-select when the CURRENT move has run its full DECLARED length, measured
    // in the move's own tempo-scaled beat clock (the same `elapsedBeats` basis
    // dance() feeds the move), floored to 8 beats. The old fixed 8-beat window
    // both CHOPPED the longer moves (a 12/16-beat phrase was cut in half) and,
    // at high BPM (tempoScale=2), cut every move at half its internal cycle.
    // Keying off the
    // move's own `beats` fixes both; the 8-beat floor keeps the short loopers
    // (stepTouch/tribalStomp @4, polyStep @6) repeating at least once instead of
    // flickering move-to-move.
    const tempoScale = clk.tempoScale || 1;
    const period = Math.max(8, (rigState.currentMove && rigState.currentMove.beats) || 8);
    // `!currentMove` forces the very first pick: createRigState can't seed a
    // MOVE_TABLE entry (the table is defined further down), so the first frame
    // must select before dance() calls currentMove.run().
    if (!rigState.currentMove || (clk.beatPos - rigState.moveStartBeat) / tempoScale >= period) {
      // anti-repeat: drop the move that just finished so nothing plays twice in
      // a row (a cheap, research-backed variety win — real dancers don't repeat
      // a phrase identically). If that empties the eligible set (a ctx with a
      // single eligible move) fall back to the full set rather than freeze.
      const eligible = (extra) => Object.keys(MOVE_TABLE).filter((n) =>
        n !== 'strike' && n !== extra && MOVE_TABLE[n].pool.includes(ctx));
      let pool = eligible(rigState.currentMoveName);
      if (!pool.length) pool = eligible(null);
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

  // ── hair/cloth "dangle" bones (fairy-punk only, see gen-fairy-punk-rig.py) ─
  // HairMid/HairTip/WingTip.L/R carry no choreography role — they exist
  // purely for secondary motion beyond what riding Head/Chest already gives
  // (the spring-damper above). Each joint's rest offset direction (its own
  // `.position`, fixed since these bones never translate — only rotate) is
  // spring-eased toward a per-frame target that blends (a) that rest
  // direction with (b) "world down" re-expressed in the joint's PARENT-local
  // frame via the parent's current world quaternion — so a joint settles
  // toward gravity regardless of how the skeleton above it is oriented, not
  // just rigidly following the parent's spin. Simulating in normalized
  // DIRECTION space rather than tracking a world position + a distance
  // constraint is a cheaper cousin of a verlet chain — length is implicit
  // (always renormalized) — sufficient for a single dangle joint per region
  // and consistent with the rotation-only bone-driving convention used
  // everywhere else in this file (identity bind rotation, quaternion = delta).
  const SPRING_HAIR = { k1: 34, k2: 7 };    // omega≈5.8 rad/s, zeta≈0.60 — soft, trailing lag
  const SPRING_CLOTH = { k1: 70, k2: 12 };  // omega≈8.4 rad/s, zeta≈0.72 — stiffer plate, less droop
  const _dangleDown = new THREE.Vector3(0, -1, 0);
  const _dangleLocal = new THREE.Vector3();
  const _dangleTarget = new THREE.Vector3();
  const _dangleQ = new THREE.Quaternion();
  const _dangleDeltaQ = new THREE.Quaternion();
  function updateDangleBone(bone, dt, profile, gravityWeight) {
    if (!bone.parent) return;
    if (!bone._restDir) bone._restDir = bone.position.clone().normalize();
    if (!bone._dangleDir) {
      bone._dangleDir = { x: bone._restDir.x, y: bone._restDir.y, z: bone._restDir.z, _vx: 0, _vy: 0, _vz: 0 };
    }
    _dangleQ.setFromRotationMatrix(bone.parent.matrixWorld);
    _dangleLocal.copy(_dangleDown).applyQuaternion(_dangleQ.invert());
    _dangleTarget.copy(bone._restDir).lerp(_dangleLocal, gravityWeight).normalize();
    const d = bone._dangleDir;
    springStep(d, 'x', _dangleTarget.x, dt, profile);
    springStep(d, 'y', _dangleTarget.y, dt, profile);
    springStep(d, 'z', _dangleTarget.z, dt, profile);
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    _dangleTarget.set(d.x / len, d.y / len, d.z / len);
    _dangleDeltaQ.setFromUnitVectors(bone._restDir, _dangleTarget);
    bone.quaternion.copy(_dangleDeltaQ);
  }
  function updateDanglers(rigState, dt) {
    const d = rigState.danglerBones;
    if (!d) return;
    if (d.HairMid) updateDangleBone(d.HairMid, dt, SPRING_HAIR, 0.55);
    if (d.HairTip) updateDangleBone(d.HairTip, dt, SPRING_HAIR, 0.72);
    if (d.WingTipL) updateDangleBone(d.WingTipL, dt, SPRING_CLOTH, 0.35);
    if (d.WingTipR) updateDangleBone(d.WingTipR, dt, SPRING_CLOTH, 0.35);
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
    // Amplitude: a HIGH floor so every move is danced energetically even in a
    // quiet section (the brief was "every move should be energetic" — the old
    // 0.55 floor let low-energy stretches go sleepy), still scaled up by section
    // energy + this beat's strength so a hard beat moves bigger than a soft one.
    // Clamped so the raised floor doesn't push the high-energy poses (already
    // tuned around A≈1.3) into over-extension where limbs clip or hyper-bend.
    let A = 0.9 + energy * 0.55 + strength * 0.35;
    if (A > 1.35) A = 1.35;
    const hit = beatAccent * (0.6 + energy * 0.5);   // music-locked on-beat accent (beatAccent already carries per-beat strength + jitter via musicClock)
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

    // ── shared, always-on GROOVE — the weight engine every move rides on ──
    // Research's #1 anti-robot fix: the body must visibly DROP under its own
    // weight on the beat, knees absorbing it, or no amount of arm motion reads
    // as dancing. Two coupled layers:
    //  (1) a whole-figure vertical bounce on the outer rigGroup — an ABSOLUTE
    //      write each frame (placeDuet/placeAtNDC own .x/.z/scale, so .y is ours;
    //      no spring, no drift), lowest exactly ON the beat and deeper when the
    //      beat hits harder (per-beat `strength`) or the section is hotter
    //      (`energy`). beatFrac comes from the driftless beatPos so the bounce
    //      is locked to the music, not to the RAF clock.
    //  (2) the on-beat knee/hip give on the proxy bones — now folding the SHINS
    //      too, not just the thighs, so the drop reads as the knees giving
    //      rather than the whole figure teleporting down, and scaled by the same
    //      groove weight so a hard kick visibly buckles the knees more.
    // Plus the slow 3/4 root turn so the figure never sits flat-on for long.
    const beatFrac = clk.beatPos - Math.floor(clk.beatPos);
    const onBeat = 0.5 + 0.5 * Math.cos(beatFrac * Math.PI * 2);   // 1 on the beat → 0 mid-beat
    const grv = 0.7 + 0.4 * energy + 0.35 * (Number.isFinite(clk.strength) ? clk.strength : 0.6);   // high floor so the weight bounce is always felt (energetic brief)
    // BOUNCE_MAX is a WORLD-space drop tuned to the full-size duet figure; the
    // ambient crowd is scaled down (~0.34×), so scale the bounce by the figure's
    // size relative to its own fit (scale.y / baseScale) — otherwise a small
    // spawn's fixed-world drop reads proportionally 3× bigger and it HOPS. For
    // the featured duet this ratio is 1 (placeDuet sets scale == baseScale), so
    // the bounce is the full BOUNCE_MAX tuned to their size — unchanged.
    const figRatio = (rigState.rigGroup.scale.y || 1) / (rigState.baseScale || 1);
    rigState.rigGroup.position.y = rigState.baseY - BOUNCE_MAX * figRatio * onBeat * grv;

    add(b.pelvis.position, 'y', -hit * 0.06);
    add(b.thighL.rotation, 'x', hit * 0.16 * grv);
    add(b.thighR.rotation, 'x', hit * 0.16 * grv);
    add(b.shinL.rotation, 'x', hit * 0.20 * grv);   // knees fold to absorb the drop
    add(b.shinR.rotation, 'x', hit * 0.20 * grv);
    add(b.spine.rotation, 'x', hit * 0.06);
    tgt(b.root.rotation, 'y', Math.sin(p * 0.5) * 0.16);

    // Persistent per-rig asymmetry (research "kill L/R symmetry"): a dominant-
    // side lean + a slow, de-phased idle sway/breath, applied whole-figure on
    // rigGroup (again ABSOLUTE — .x/.z are unused by placement). Stops the two
    // figures reading as one mirrored signal and keeps the silhouette alive even
    // when the music sits idle, without phase-locking any joint into a loop.
    const idle = t * 0.6 + rigState.idlePhase;
    rigState.rigGroup.rotation.z = rigState.leanSign * (0.045 + 0.02 * Math.sin(idle));
    rigState.rigGroup.rotation.x = 0.015 * Math.sin(idle * 0.73 + 0.5);
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

  // ── ambient armadrillo crowd (the SHARED renderer/scene/camera) ──────────
  // Everything below clones the ALREADY loaded armadrillo (rigA.model) into a
  // pool, drives each pooled clone with the SAME dance()/applyRig/MOVE_TABLE +
  // shared music clock the featured duet uses, and renders it on the full-
  // viewport #k-ambient-dancers canvas. The featured duet (rigA/rigB) renders
  // into this SAME scene/renderer/camera (see setupDuet/placeDuet) — one WebGL
  // context total. Crowd instances are the ephemeral backdrop; the two duet
  // rigs are the always-present, larger foreground pair.

  // Lazily create the shared renderer the first time the viewport is wide
  // enough (so phones never even allocate a GL context — clean dancer-free page).
  function initAmbient() {
    if (ambientInited || !ambientCanvas || !window.THREE || !THREE.SkeletonUtils || dead) return;
    ambientInited = true;
    try {
      ambientRenderer = new THREE.WebGLRenderer({ canvas: ambientCanvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      ambientRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      // ONE shared context now: its loss is FATAL to the whole scene (duet +
      // crowd). Stop the loop, dispose the duet's shared materials, tear the
      // crowd down, and stay down (transparent canvas) rather than dead-framing.
      ambientCanvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault(); stop(); dead = true;
        try { for (const g of disposables) g.dispose(); } catch (_) {}
        try { disposeAmbient(); } catch (_) {}
      }, false);
      ambientScene = new THREE.Scene();
      // fov 38, z 8.4, full-viewport aspect. frameModel fits the featured pair
      // against THIS camera; placeAtNDC/placeDuet unproject through it.
      ambientCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      ambientCamera.position.set(0, 0.05, 8.4);
      ambientCamera.lookAt(0, -0.05, 0);
      sizeAmbient();
      ambientCamera.updateMatrixWorld(true);   // unproject() (placeAtNDC) needs a current world matrix
    } catch (_) { ambientRenderer = null; }
  }

  // Size the shared renderer/camera to the FULL viewport (its canvas is fixed
  // inset:0).
  function sizeAmbient() {
    if (!ambientRenderer || !ambientCamera) return;
    const w = window.innerWidth || 1280, h = window.innerHeight || 720;
    ambientRenderer.setSize(w, h, false);
    ambientCamera.aspect = w / h;
    ambientCamera.updateProjectionMatrix();
  }

  // Device gate: enable on tablet + desktop (≥768px) only; re-evaluated on
  // resize. Dropping below the threshold despawns the crowd, stops spawning,
  // and stops rendering the shared scene (so the featured duet pauses/hides too
  // — the CSS also hides #k-ambient-dancers < 768px). Above the threshold it
  // inits the shared context AND sets up the featured duet (both idempotent).
  function evalAmbientGate() {
    if (dead) return;
    const allow = (window.innerWidth || 0) >= AMBIENT_MIN_WIDTH;
    if (allow) {
      initAmbient();
      if (ambientRenderer) {
        setupDuet();   // add the featured pair to the shared scene + kick their loads (once)
        if (!ambientEnabled) { ambientEnabled = true; ambientSpawnTimer = 0.6; }
        if (welcomeStarted) crowdReady = true;   // re-enable after a resize once the welcome already ran → crowd resumes at once

      }
    } else if (ambientEnabled) {
      ambientEnabled = false;
      despawnAllAmbient();
      resetPresenter();           // never leave the HUD hidden behind a frozen giant
      ambientNeedsClear = true;   // one final render to clear the canvas to transparent
    }
  }

  // Build ONE pooled armadrillo clone (expensive: skinned-mesh + skeleton
  // clone + fresh adapters + per-instance material clones). Returns an
  // inactive, hidden instance already added to the ambient scene, or null.
  function buildAmbientInstance() {
    const src = rigA.model;
    if (!src || !ambientScene || !THREE.SkeletonUtils) return null;
    let clone;
    // THREE.SkeletonUtils.clone (r128 examples) — Object3D.clone(true) does NOT
    // rebind a skinned skeleton; this deep-clones the graph AND rebinds each
    // SkinnedMesh to a freshly cloned skeleton, so the clone deforms on its own.
    try { clone = THREE.SkeletonUtils.clone(src); } catch (_) { return null; }

    const rigGroup = new THREE.Group();
    const turnGroup = new THREE.Group();   // b.root — dance()'s slow 3/4 turn pivot
    rigGroup.add(turnGroup);
    turnGroup.add(clone);
    rigGroup.visible = false;

    // SkeletonUtils shares materials by reference, so the clone still points at
    // the duet's SHARED chrome/wire materials. Give this instance its OWN clones
    // so its opacity fade is independent (and disposable on teardown). The
    // matcap/map textures inside stay shared refs (cheap, disposed with the duet).
    const chromeMats = [], wireMats = [], skinnedMeshes = [];
    clone.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh)) return;
      o.frustumCulled = false;
      if (o.material === wireMat) {
        const w = wireMat.clone(); w.transparent = true; w.opacity = 0;
        o.material = w; wireMats.push(w); ambientDisposables.push(w);
      } else if (o.material) {
        const c = o.material.clone(); c.transparent = true; c.opacity = 0;
        c.__base = o.material.__base ? o.material.__base.clone() : (c.color ? c.color.clone() : null);   // carry the cyan body tint onto the clone (Material.clone drops custom props)
        o.material = c; chromeMats.push(c); ambientDisposables.push(c);
      }
      // base + wireframe-overlay skinned meshes get SEPARATE cloned skeletons
      // here (unlike the duet, where the overlay shares the base's skeleton), so
      // every skinned mesh must have ITS OWN skeleton.update() each frame.
      if (o.isSkinnedMesh) skinnedMeshes.push(o);
    });

    // Own proxy + adapter set (armadrillo drives the core roles only; RIG_A has
    // no extraRoles). Bit-identical explicit hints to the duet's armadrillo.
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
      // dance state (mirrors createRigState's animated fields)
      currentMove: MOVE_TABLE.grooveSway, currentMoveName: 'grooveSway',
      moveStartBeat: 0, moveMirror: 1, prevDrop: false, moveAmp: 1, movePhaseOfs: 0,
      headTrail: 0, idlePhase: 0, leanSign: 1,
      baseX: 0, baseY: 0, baseZ: 0, baseScale: 1,
    };
    ambientScene.add(rigGroup);
    ambientPool.push(inst);
    return inst;
  }

  // Screen(NDC)→world at a chosen distance from the camera: unproject the NDC
  // point to a ray, then walk `dist` along it. Varying `dist` gives parallax.
  function placeAtNDC(inst, ndcX, ndcY, dist) {
    _ndc.set(ndcX, ndcY, 0.5).unproject(ambientCamera);
    _ndc.sub(ambientCamera.position).normalize();
    const px = ambientCamera.position.x + _ndc.x * dist;
    const py = ambientCamera.position.y + _ndc.y * dist;
    const pz = ambientCamera.position.z + _ndc.z * dist;
    inst.rigGroup.position.set(px, py, pz);
    inst.baseX = px; inst.baseY = py; inst.baseZ = pz;   // dance() writes .y each frame from baseY
  }

  // Pick a screen-space (NDC) spot that gives other dancers SOME SPACE: try a
  // handful of random candidates and take the first that clears every active
  // crowd member AND the featured pair by MIN_NDC_SEP; if none clear (crowded),
  // keep the roomiest candidate. Screen-space separation (not world) is what
  // stops on-screen overlap regardless of depth.
  const MIN_NDC_SEP = 0.36;
  function pickSpacedNDC(self) {
    const others = [];
    for (let i = 0; i < ambientPool.length; i++) { const p = ambientPool[i]; if (p.active && p !== self && p.ndcX != null) others.push(p); }
    for (let i = 0; i < rigs.length; i++) { const r = rigs[i]; if (r.modelReady && r.duetAnchor) others.push({ ndcX: r.duetAnchor.x, ndcY: r.duetAnchor.y }); }
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

  // (Re)activate a pooled instance at a fresh spaced spot / facing / scale with
  // its own move-selection state, so the crowd never moves in lockstep.
  function activateInstance(inst) {
    const [ndcX, ndcY] = pickSpacedNDC(inst);
    inst.ndcX = ndcX; inst.ndcY = ndcY;                    // remembered so later spawns space off it
    const dist = 9.5 + Math.random() * 6.0;                // DEEP (9.5–15.5) — behind the giant (~8.4) so the crowd reads as tiny figures in the BACK
    placeAtNDC(inst, ndcX, ndcY, dist);
    inst.rigGroup.rotation.x = 0; inst.rigGroup.rotation.z = 0;
    inst.rigGroup.rotation.y = (Math.random() * 2 - 1) * 1.2;   // scattered facing (mostly toward camera)
    // TINY scattered-crowd size with per-spawn variation. Combined with the deep
    // placement above, the crowd reads as small figures in the BACK — the single
    // humongous armadrillo (the presenter giant) is the only large one on stage.
    const scl = (rigA.baseScale || 1) * AMBIENT_SCALE_BASE * (0.4 + Math.random() * 0.5);
    inst.rigGroup.scale.setScalar(scl);
    // baseScale = the armadrillo's OWN duet fit (not 1), so dance()'s weight
    // bounce (figRatio = scale.y / baseScale) scales with THIS spawn's size and
    // never hops. scale.y carries the size.
    inst.baseScale = rigA.baseScale || 1;
    // fresh, independent dance state
    inst.currentMove = MOVE_TABLE.grooveSway; inst.currentMoveName = 'grooveSway';
    inst.moveStartBeat = 0; inst.moveMirror = Math.random() < 0.5 ? -1 : 1; inst.prevDrop = false;
    inst.moveAmp = 1; inst.movePhaseOfs = 0; inst.headTrail = 0;
    inst.idlePhase = Math.random() * Math.PI * 2; inst.leanSign = Math.random() < 0.5 ? -1 : 1;
    // fresh lifecycle
    inst.life = 'in'; inst.age = 0; inst.opacity = 0;
    inst.lifeDur = 4 + Math.random() * 4;                   // live ~4–8s
    inst.active = true; inst.seq = ++spawnSeq;
    inst.rigGroup.visible = true;
  }

  function deactivate(inst) {
    inst.active = false; inst.opacity = 0;
    if (inst.rigGroup) inst.rigGroup.visible = false;
  }
  function despawnAllAmbient() { for (let i = 0; i < ambientPool.length; i++) if (ambientPool[i].active) deactivate(ambientPool[i]); }

  // One spawn request from the scheduler: reuse an idle pooled instance, else
  // build a new one under the cap, else recycle the OLDEST active one.
  function requestSpawn() {
    if (!rigA.modelReady || !ambientRenderer || dead) return;
    let inst = null;
    for (let i = 0; i < ambientPool.length; i++) if (!ambientPool[i].active) { inst = ambientPool[i]; break; }
    if (!inst) {
      if (ambientPool.length < AMBIENT_MAX) inst = buildAmbientInstance();
      else {
        // recycle the oldest active (lowest seq) — reactivateInstance resets it
        let oldest = null;
        for (let i = 0; i < ambientPool.length; i++) { const p = ambientPool[i]; if (p.active && (!oldest || p.seq < oldest.seq)) oldest = p; }
        inst = oldest;
      }
    }
    if (inst) activateInstance(inst);
  }

  // Per-frame ambient update: run the spawn scheduler, then advance each active
  // instance's fade + dance + retarget + skeleton. Each instance is wrapped in
  // try/catch so a single bad spawn can never kill the duet's RAF.
  function updateAmbient(dt, now, clk) {
    // Gate: no small armadrillo spawns until CROWD_START_DELAY after the HUD
    // first appears (crowdArmed at welcome-end, see updateGiant). Until then bail
    // — there are no active instances to animate yet, so nothing else is skipped.
    if (!crowdReady) {
      if (crowdArmed) { crowdArmTimer -= dt; if (crowdArmTimer <= 0) crowdReady = true; }
      if (!crowdReady) return;
    }
    // Crowd size TRACKS energy: hold the MIN floor when calm, climb toward MAX as
    // the section builds into a high upbeat. Only energy above ~0.3 pushes past
    // the floor, so quiet stretches stay at 5 and the drop fills the room to 20.
    const drive = Math.max(0, Math.min(1, (energy - 0.3) / 0.7));
    const target = Math.round(AMBIENT_MIN + (AMBIENT_MAX - AMBIENT_MIN) * drive);
    let activeCount = 0;
    for (let i = 0; i < ambientPool.length; i++) if (ambientPool[i].active) activeCount++;
    // Staggered controller (never all at once): fill FAST to reach the MIN floor
    // so a fresh scene populates quickly, then trickle so the climb into the drop
    // reads as a gathering crowd; when energy falls (over target) retire the
    // oldest live one early so the crowd eases back down. Natural lifetime expiry
    // keeps individuals cycling in/out; the floor is refilled as they leave.
    ambientSpawnTimer -= dt;
    if (ambientSpawnTimer <= 0) {
      if (activeCount < target) {
        requestSpawn();
        ambientSpawnTimer = activeCount < AMBIENT_MIN ? 0.12 : 0.45;
      } else if (activeCount > target) {
        let oldest = null;
        for (let i = 0; i < ambientPool.length; i++) { const p = ambientPool[i]; if (p.active && p.life !== 'out' && (!oldest || p.seq < oldest.seq)) oldest = p; }
        if (oldest) { oldest.life = 'out'; oldest.age = 0; }
        ambientSpawnTimer = 0.6;
      } else {
        ambientSpawnTimer = 0.5;   // at target — idle re-check
      }
    }
    // shared beat illumination (same formula as the duet's frame()) so spawns
    // glow on the beat too — computed once, applied to each instance's mats.
    const glow = Math.min(1, 0.15 + energy * 0.3 + beatAccent * 0.4);
    const wireOp = Math.min(0.5, 0.06 + glow * 0.28);
    const chromeCol = Math.min(1, 0.62 + glow * 0.38);

    for (let i = 0; i < ambientPool.length; i++) {
      const inst = ambientPool[i];
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
        if (inst.age >= inst.fadeOut) { deactivate(inst); continue; }
      }
      try {
        for (let j = 0; j < inst.chromeMats.length; j++) { const m = inst.chromeMats[j]; m.opacity = inst.opacity; if (m.__base) m.color.copy(m.__base).multiplyScalar(chromeCol); else m.color.setScalar(chromeCol); }
        for (let j = 0; j < inst.wireMats.length; j++) inst.wireMats[j].opacity = wireOp * inst.opacity;
        dance(inst, dt, now, clk);   // same engine, own rigState → own move/phase
        applyRig(inst);              // proxy joints → real bones (retarget)
        inst.rigGroup.updateMatrixWorld(true);
        for (let j = 0; j < inst.skinnedMeshes.length; j++) { const sk = inst.skinnedMeshes[j].skeleton; if (sk) sk.update(); }
      } catch (_) { /* a bad spawn must never take down the duet */ }
    }
  }

  // Dispose every pooled instance's cloned materials + the ambient renderer.
  // Geometry is SHARED with the duet's armadrillo (SkeletonUtils doesn't clone
  // it) so it is deliberately NOT disposed here. Called on ambient/duet context
  // loss and on the build-failure teardown.
  function disposeAmbient() {
    for (let i = 0; i < ambientPool.length; i++) {
      const inst = ambientPool[i];
      if (inst.rigGroup && ambientScene) { try { ambientScene.remove(inst.rigGroup); } catch (_) {} }
    }
    // the reserved giant is NOT in ambientPool (removed in buildGiant) — remove
    // it explicitly + restore the HUD (its cloned materials are in
    // ambientDisposables already, disposed by the loop below).
    if (giant && giant.rigGroup && ambientScene) { try { ambientScene.remove(giant.rigGroup); } catch (_) {} }
    giant = null;
    try { resetPresenter(); } catch (_) {}
    for (let i = 0; i < ambientDisposables.length; i++) { try { ambientDisposables[i].dispose(); } catch (_) {} }
    ambientDisposables.length = 0;
    ambientPool.length = 0;
    ambientEnabled = false;
    try { ambientRenderer && ambientRenderer.dispose(); } catch (_) {}
    ambientRenderer = null;
  }

  // ── GIANT presenter build + per-frame state machine ─────────────────────
  // Build the reserved giant once the clone-source armadrillo has loaded: reuse
  // buildAmbientInstance for IDENTICAL construction (own cloned materials in
  // ambientDisposables, own proxies/adapters, added to ambientScene), then
  // REMOVE it from ambientPool so the crowd scheduler never grabs it.
  function buildGiant() {
    if (giant || !rigA.modelReady) return giant;
    const inst = buildAmbientInstance();
    if (!inst) return null;
    const i = ambientPool.indexOf(inst);
    if (i >= 0) ambientPool.splice(i, 1);   // reserve it — the crowd must never reuse it
    inst.rigGroup.visible = false;
    giant = inst;
    return giant;
  }

  // Centre + size the giant against the LIVE camera each frame it shows (so a
  // resize keeps it centred). baseScale = rigA's duet fit so dance()'s figRatio
  // (= scale.y / baseScale = GIANT_SCALE_MULT) keeps the weight bounce
  // proportional at the giant's size instead of making it hop.
  function placeGiant() {
    if (!giant || !ambientCamera) return;
    const dist = Math.abs(ambientCamera.position.z - (rigA.fitZ || 0)) || 8.4;
    placeAtNDC(giant, GIANT_NDC_X, GIANT_NDC_Y, dist);   // sets position + baseX/Y/Z
    giant.baseScale = rigA.baseScale || 1;
    giant.rigGroup.scale.setScalar((rigA.baseScale || 1) * GIANT_SCALE_MULT);
    giant.rigGroup.rotation.y = 0;   // face camera (dance() owns the .z/.x lean each frame)
  }

  // Force the presenter off the stage + restore the HUD — called when the
  // shared context is disabled/torn down mid-show so the HUD can never get
  // stuck hidden behind a frozen giant.
  function resetPresenter() {
    giantOpacity = 0; giantDropHi = false; welcomeTimer = 0; dropBurstTimer = 0;
    if (giant && giant.rigGroup) giant.rigGroup.visible = false;
    if (presenterShown) { document.documentElement.classList.remove('hud-hidden'); presenterShown = false; }
  }

  // Presenter state machine (per frame, only while the shared context is live).
  // Shows the giant during (a) the welcome window and (b) a thresholded drop,
  // and toggles html.hud-hidden on the show/hide EDGE. `welcome || drop` keeps
  // `show` continuously true if a drop lands during / right after the welcome,
  // so the HUD never flickers in then straight back out between the two.
  function updateGiant(dt, now, clk) {
    if (dead || !ambientRenderer) return;
    if (!giant) buildGiant();

    // start the (one-shot) welcome once armed AND the model is ready — deferred
    // gracefully if the gate opened before the glTF finished loading.
    if (welcomeArmed && !welcomeStarted && giant) {
      welcomeStarted = true; welcomeArmed = false; welcomeTimer = WELCOME_SECONDS;
    }
    let welcomeActive = false;
    if (welcomeTimer > 0) { welcomeActive = true; welcomeTimer -= dt; }
    // Welcome finished (HUD is about to / has appeared) → arm the one-shot delay
    // after which the small crowd may begin (updateAmbient counts it down).
    if (welcomeStarted && welcomeTimer <= 0 && !crowdArmed) { crowdArmed = true; crowdArmTimer = CROWD_START_DELAY; }

    // thresholded live drop level (appState.lightshow.drop is 0..1, NOT boolean),
    // with hysteresis so a value hovering at the edge can't strobe the HUD.
    const lvl = (appState.lightshow && Number.isFinite(appState.lightshow.drop)) ? appState.lightshow.drop : 0;
    // Rising EDGE of the drop arms a CAPPED burst — the giant takes the stage
    // once, then leaves and the HUD returns EVEN IF energy stays high. On a
    // continuous high upbeat the level never dips below DROP_OFF, so no new edge
    // fires and the HUD stays put after the one burst; a fresh burst needs the
    // level to fall below DROP_OFF and spike above DROP_ON again.
    if (giantDropHi) { if (lvl < DROP_OFF) giantDropHi = false; }
    else if (lvl > DROP_ON) { giantDropHi = true; dropBurstTimer = DROP_BURST_SECONDS; }
    if (dropBurstTimer > 0) dropBurstTimer -= dt;

    const show = !!giant && (welcomeActive || dropBurstTimer > 0);
    if (show !== presenterShown) {
      document.documentElement.classList.toggle('hud-hidden', show);
      presenterShown = show;
    }
    if (!giant) return;

    // eased fade toward shown/hidden
    const stepAmt = dt / GIANT_FADE_SECONDS;
    const target = show ? 1 : 0;
    if (giantOpacity < target) giantOpacity = Math.min(target, giantOpacity + stepAmt);
    else if (giantOpacity > target) giantOpacity = Math.max(target, giantOpacity - stepAmt);

    const vis = giantOpacity > 0.001;
    giant.rigGroup.visible = vis;
    if (!vis) return;   // fully faded → skip the heavy skinning work

    placeGiant();
    // beat illumination (same formula as the duet/crowd), scaled by the fade
    const glow = Math.min(1, 0.15 + energy * 0.3 + beatAccent * 0.4);
    const wireOp = Math.min(0.5, 0.06 + glow * 0.28);
    const chromeCol = Math.min(1, 0.62 + glow * 0.38);
    try {
      for (let j = 0; j < giant.chromeMats.length; j++) { const m = giant.chromeMats[j]; m.opacity = giantOpacity; if (m.__base) m.color.copy(m.__base).multiplyScalar(chromeCol); else m.color.setScalar(chromeCol); }
      for (let j = 0; j < giant.wireMats.length; j++) giant.wireMats[j].opacity = wireOp * giantOpacity;
      dance(giant, dt, now, clk);       // same engine, own rigState → own move/phase
      applyRig(giant);                  // proxy joints → real bones (retarget)
      giant.rigGroup.updateMatrixWorld(true);
      for (let j = 0; j < giant.skinnedMeshes.length; j++) { const sk = giant.skinnedMeshes[j].skeleton; if (sk) sk.update(); }
    } catch (_) { /* a giant failure must never take down the RAF */ }
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

    // ── featured duet + ambient crowd: ONE shared renderer/scene/camera ──────
    // The two hero rigs (rigA/rigB) and the crowd render into the same context.
    // Only runs on tablet/desktop (ambientRenderer exists) and once a rig has
    // loaded. The RAF pauses for free when the tab hides (frame() stops).
    if (ambientRenderer && (rigA.modelReady || rigB.modelReady)) {
      if (ambientEnabled) {
        for (let i = 0; i < rigs.length; i++) {
          const rigState = rigs[i];
          if (!rigState.modelReady || !rigState.bones) continue;   // that rig's load hasn't landed yet

          placeDuet(rigState, now);       // full-screen anchor placement (see placeDuet)
          dance(rigState, dt, now, clk);
          applyRig(rigState);             // proxy joints → real bones (retarget)
          updateDanglers(rigState, dt);   // hair/cloth secondary motion (fairy-punk only)

          // Refresh bone world matrices → skeleton bone matrices BEFORE render.
          rigState.rigGroup.updateMatrixWorld(true);
          for (let j = 0; j < rigState.skinnedMeshes.length; j++) {
            const sk = rigState.skinnedMeshes[j].skeleton;
            if (sk) sk.update();
          }
        }

        // Beat illumination for the featured pair's SHARED materials: energy
        // sets the floor, beatAccent's smooth decay blooms it on each beat. The
        // wireframe accent's opacity (glowing "circuitry" pulse) + the chrome
        // pass's colour multiplier (subtler whole-body brighten on hard beats).
        // The crowd's per-instance cloned mats are lit with the SAME formula
        // inside updateAmbient. Keep chromeColor ≤ 1.0 — MeshMatcapMaterial
        // multiplies `.color` into both the matcap tone AND the real diffuse
        // `.map`, so >1.0 blows the texture out toward flat white. See the
        // WCAG 2.3.1 note in the header comment.
        const glow = Math.min(1, 0.15 + energy * 0.3 + beatAccent * 0.4);
        wireMat.opacity = Math.min(0.5, 0.06 + glow * 0.28);
        const chromeColor = Math.min(1, 0.62 + glow * 0.38);
        for (let i = 0; i < chromeMats.length; i++) { const m = chromeMats[i]; if (m.__base) m.color.copy(m.__base).multiplyScalar(chromeColor); else m.color.setScalar(chromeColor); }

        // Ambient armadrillo crowd — only once the clone-source armadrillo
        // (rigA) has loaded (we clone from it).
        if (rigA.modelReady) updateAmbient(dt, now, clk);
        // Giant "presenter" (welcome + drop takeover) — also clones rigA, hides
        // the HUD while it holds the stage. Runs after the crowd so it paints last.
        updateGiant(dt, now, clk);
      }
      if (ambientEnabled || ambientNeedsClear) {
        ambientRenderer.render(ambientScene, ambientCamera);
        ambientNeedsClear = false;
        if (!ambientLive) { ambientLive = true; ambientCanvas.classList.add('is-live'); }   // CSS fades it in
      }
    }

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
    try { disposeAmbient(); } catch (_) {}
    dead = true;
    return;
  }

  // Resize is handled by the shared-context path (build()'s window 'resize'
  // listener → sizeAmbient + evalAmbientGate). The featured pair need no
  // re-frame: their world scale is fixed and the camera's VERTICAL fov is
  // aspect-independent, so on-screen height holds; placeDuet re-derives the
  // horizontal anchor against the live aspect every frame.

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
    get ready() { return rigA.modelReady && (!SHOW_FAIRY_PUNK || rigB.modelReady); },
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
