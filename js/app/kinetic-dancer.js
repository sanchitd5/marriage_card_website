import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';

// ── Kinetic dancer (persistent side wireframe humanoid) ─────────────────
// A procedural "Iron-Man-suit" figure — built from primitive wireframe boxes
// (NO glTF model), rendered as a cyan ADDITIVE wireframe on its own small
// WebGL canvas (#k-dancer-canvas, fixed on the right, CSS-positioned/sized).
// It DANCES to the background music across every panel: ambient decoration,
// no user interaction, no audio node of its own.
//
// This is a sibling to lightshow.js (same renderer posture, same
// context-loss / resize / visibility handling) but a completely separate,
// tiny context. It reads the OFFLINE music energy the lightshow already
// computes (appState.lightshow.energy) rather than opening a new AnalyserNode,
// so the two stay in lockstep and there is no extra audio cost.
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

  // ── shared materials (2 line mats + 1 chest-core mat) ────────────────
  // WebGL linewidth is always 1px, so "bloom" is faked with an additive halo
  // pass at 1.04× scale over a brighter additive core.
  const coreMat = new THREE.LineBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreCoreMat = new THREE.LineBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }); // icy cyan (no warm cast)

  const disposables = [];   // WireframeGeometry instances to dispose on teardown

  // A bone is a THREE.Group whose ORIGIN is the proximal joint: its box
  // geometry is translated DOWN by len/2 so it hangs from the joint, and child
  // bones attach at the distal end (position.y = -parentLen). Rotating the group
  // therefore pivots about the joint like a real limb.
  function makeBone(len, w, d) {
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(w, len, d);
    box.translate(0, -len / 2, 0);
    const wire = new THREE.WireframeGeometry(box); box.dispose();
    g.add(new THREE.LineSegments(wire, coreMat));
    const halo = new THREE.LineSegments(wire, haloMat); halo.scale.setScalar(1.04); g.add(halo);
    g.userData.len = len; disposables.push(wire); return g;
  }
  function attach(parent, child) { child.position.set(0, -parent.userData.len, 0); parent.add(child); }

  // Same as makeBone, but the segment RISES from the joint (box translated UP).
  // The limbs (arms/legs) genuinely hang down, so they use makeBone; the torso
  // (spine→chest→neck→head) genuinely rises from the waist, so it uses this —
  // otherwise a down-hanging torso box would overlap the pelvis. Children of an
  // up-bone are seated at +parentLen.
  function makeBoneUp(len, w, d) {
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(w, len, d);
    box.translate(0, len / 2, 0);
    const wire = new THREE.WireframeGeometry(box); box.dispose();
    g.add(new THREE.LineSegments(wire, coreMat));
    const halo = new THREE.LineSegments(wire, haloMat); halo.scale.setScalar(1.04); g.add(halo);
    g.userData.len = len; disposables.push(wire); return g;
  }
  function attachUp(parent, child) { child.position.set(0, parent.userData.len, 0); parent.add(child); }

  // ── runtime state ────────────────────────────────────────────────────
  let renderer, scene, camera, root;
  let bones = null;                         // the named rig (built in build())
  let running = true, raf = 0, live = false, dead = false;

  // dance/energy state (reused across frames; nothing allocated in the loop)
  let energy = 0.18, prevFast = 0, energySlow = 0.18, beat = 0, phase = 0;
  let coreOpacity = 0.55, headTrail = 0; // secondary-motion memory for the head

  // The rig, once built (~15 bones):
  //  root → pelvis → spine → chest → neck → head
  //  chest → shoulderL/R (offset) → upperArmL/R → forearmL/R → handL/R
  //  pelvis → hipL/R (offset) → thighL/R → shinL/R → footL/R
  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    // A lost GL context (iOS backgrounding etc.) must not freeze a dead frame:
    // stop cleanly and leave the canvas transparent.
    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); stop(); dead = true; }, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();

    // ── build the skeleton ──
    // Convention: the PELVIS is the base. Its origin sits at the WAIST; its box
    // hangs DOWN to the hip line. The torso RISES from the waist (makeBoneUp);
    // the arms and legs HANG from their joints (makeBone). Root faces +Z toward
    // the camera. ~15 primary bones.
    root = new THREE.Group();

    const pelvis = makeBone(0.35, 0.85, 0.5);     // waist(origin) → hips (hangs down)
    const spine = makeBoneUp(0.45, 0.7, 0.45);    // torso rises …
    const chest = makeBoneUp(0.55, 1.0, 0.55);    // broad plate → Iron-Man read
    const neck = makeBoneUp(0.12, 0.25, 0.25);
    const head = makeBoneUp(0.55, 0.55, 0.6);     // cube helmet

    const upperArmL = makeBone(0.55, 0.34, 0.34);
    const forearmL = makeBone(0.5, 0.3, 0.3);
    const handL = makeBone(0.22, 0.28, 0.18);     // slab hands
    const upperArmR = makeBone(0.55, 0.34, 0.34);
    const forearmR = makeBone(0.5, 0.3, 0.3);
    const handR = makeBone(0.22, 0.28, 0.18);

    const thighL = makeBone(0.7, 0.42, 0.42);
    const shinL = makeBone(0.68, 0.36, 0.36);
    const footL = makeBone(0.28, 0.34, 0.6);      // slab feet
    const thighR = makeBone(0.7, 0.42, 0.42);
    const shinR = makeBone(0.68, 0.36, 0.36);
    const footR = makeBone(0.28, 0.34, 0.6);

    // torso chain: spine origin sits AT the waist (pelvis origin), then rises
    root.add(pelvis);
    pelvis.add(spine); spine.position.set(0, 0, 0);   // spine pivots at the waist
    attachUp(spine, chest);                            // chest above spine
    attachUp(chest, neck);                             // neck above chest
    attachUp(neck, head);                              // head above neck

    // shoulders: tiny offset groups near the top of the chest; arms hang OUT/down
    const shoulderL = new THREE.Group(); shoulderL.position.set(0.62, chest.userData.len * 0.9, 0);
    const shoulderR = new THREE.Group(); shoulderR.position.set(-0.62, chest.userData.len * 0.9, 0);
    chest.add(shoulderL); chest.add(shoulderR);
    attach(shoulderL, upperArmL); attach(upperArmL, forearmL); attach(forearmL, handL);
    attach(shoulderR, upperArmR); attach(upperArmR, forearmR); attach(forearmR, handR);
    // (shoulder groups have no bone length; seat the upper arm at the group origin)
    upperArmL.position.set(0, 0, 0); upperArmR.position.set(0, 0, 0);

    // hips: tiny offset groups at the bottom of the pelvis; legs hang DOWN
    const hipL = new THREE.Group(); hipL.position.set(0.28, -pelvis.userData.len, 0);
    const hipR = new THREE.Group(); hipR.position.set(-0.28, -pelvis.userData.len, 0);
    pelvis.add(hipL); pelvis.add(hipR);
    attach(hipL, thighL); attach(thighL, shinL); attach(shinL, footL);
    attach(hipR, thighR); attach(thighR, shinR); attach(shinR, footR);
    thighL.position.set(0, 0, 0); thighR.position.set(0, 0, 0);   // seat at hip-group origin

    // CHEST CORE (arc reactor): the brightest element, mid-plate, toward camera.
    const coreGeo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.14, 0));
    disposables.push(coreGeo);
    const chestCore = new THREE.LineSegments(coreGeo, coreCoreMat);
    chestCore.position.set(0, chest.userData.len * 0.5, 0.33);
    chest.add(chestCore);

    // Seat the rig so head↔feet centre on the origin. Waist is at root y; the
    // head top rises ~1.67 above and the feet drop ~1.7 below the waist, so a
    // tiny lift keeps the figure vertically centred for the tall canvas.
    root.position.y = 0.05;
    root.scale.setScalar(0.82); // shrink so wide/T-pose arm-span stays clear of the frame edge
    scene.add(root);

    bones = {
      root, pelvis, spine, chest, neck, head,
      shoulderL, shoulderR, upperArmL, forearmL, handL, upperArmR, forearmR, handR,
      hipL, hipR, thighL, shinL, footL, thighR, shinR, footR, chestCore,
    };

    // ── camera: the canvas is TALL and NARROW, so frame the FULL figure
    // vertically. The rig spans ~3.1 units head→feet; pull the camera back on
    // +Z (the root faces +Z toward us) and aim slightly below centre so the
    // helmet and feet both sit inside the frame with a little headroom. ──
    camera = new THREE.PerspectiveCamera(38, 0.5, 0.1, 100);
    camera.position.set(0, 0.05, 8.4); // pulled back so even wide/T-pose hands stay clear of the frame edge
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
    return 0.18 + 0.06 * Math.sin(t * 0.5);   // idle breath when the lightshow is absent
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

  // ── the dance ────────────────────────────────────────────────────────
  // Everything is DAMPED toward a target each frame (factor k, framerate-aware)
  // so the figure grooves smoothly and never snaps or seizures. Ranges are kept
  // inside safe limits so no bone clips through another.
  function dance(dt, t) {
    const b = bones;
    const k = 1 - Math.pow(0.001, dt);         // framerate-independent damping
    const bpmHz = 0.7 + energy * 1.6;          // faster groove with more energy
    phase += dt * bpmHz * 2 * Math.PI;
    const amp = 0.35 + energy * 0.65;          // bigger moves with more energy
    const hit = beat * (0.4 + energy * 0.6);   // beat accent magnitude

    // damping helpers (operate in place on Euler / Vector3)
    const tgt = (euler, axis, target) => { euler[axis] += (target - euler[axis]) * k; };
    const set = (vec, axis, target) => { vec[axis] += (target - vec[axis]) * k; };
    const add = (obj, axis, extra) => { obj[axis] += extra * k * 3; };

    // pelvis LEADS the groove (hip bounce + weight shift + a little twist)
    set(b.pelvis.position, 'y', 0.15 + Math.abs(Math.sin(2 * phase)) * 0.08 * amp); // gentler bob — stable anchor across panels
    set(b.pelvis.position, 'x', Math.sin(phase) * 0.12 * amp);
    tgt(b.pelvis.rotation, 'z', -Math.sin(phase) * 0.12 * amp);
    tgt(b.pelvis.rotation, 'y', Math.sin(phase) * 0.25 * amp);

    // torso COUNTER-rotates against the pelvis (contrapposto)
    tgt(b.spine.rotation, 'y', -Math.sin(phase) * 0.18 * amp);
    tgt(b.chest.rotation, 'z', Math.sin(phase) * 0.10 * amp);
    tgt(b.chest.rotation, 'x', 0);   // baseline so the beat "pop" (below) eases back

    // arms groove, phase-offset and ANTI-PHASE L↔R (right uses phase+PI). Break
    // symmetry slightly (different amps/offsets) so it never reads as a mirror.
    const armRaiseL = (0.25 + energy * 0.7) + Math.sin(phase + 0.6) * 0.35 * amp;
    const armRaiseR = (0.25 + energy * 0.7) + Math.sin(phase + Math.PI + 0.72) * 0.33 * amp;
    tgt(b.upperArmL.rotation, 'z', armRaiseL);          // raise out to the side
    tgt(b.upperArmR.rotation, 'z', -armRaiseR);         // negate (mirror side)
    tgt(b.upperArmL.rotation, 'x', Math.sin(phase + 1.1) * 0.5 * amp);
    tgt(b.upperArmR.rotation, 'x', Math.sin(phase + Math.PI + 1.02) * 0.47 * amp);
    // elbow: ALWAYS negative so it never hyperextends
    tgt(b.forearmL.rotation, 'x', -0.5 - (0.5 + 0.5 * Math.sin(phase + 2)) * 0.7 * amp);
    tgt(b.forearmR.rotation, 'x', -0.5 - (0.5 + 0.5 * Math.sin(phase + Math.PI + 2)) * 0.66 * amp);

    // legs: subtle. Knee ONLY bends one way (max(0,...) → never inverts).
    tgt(b.thighL.rotation, 'x', Math.sin(phase) * 0.25 * amp);
    tgt(b.thighR.rotation, 'x', Math.sin(phase + Math.PI) * 0.25 * amp);
    tgt(b.shinL.rotation, 'x', Math.max(0, -Math.sin(phase)) * 0.5 * amp);
    tgt(b.shinR.rotation, 'x', Math.max(0, -Math.sin(phase + Math.PI)) * 0.5 * amp);

    // head: slow yaw drift + secondary motion (trails the chest's twist)
    headTrail += (b.chest.rotation.y - headTrail) * 0.08;   // delayed chest yaw
    tgt(b.head.rotation, 'y', Math.sin(t * 0.13) * 0.08 + headTrail * 0.6);
    tgt(b.head.rotation, 'x', 0);   // baseline; beat nod added below
    tgt(b.head.rotation, 'z', Math.sin(phase + 0.4) * 0.05 * amp);

    // BEAT ACCENTS — MOTION only (add on top of the groove; a moving side
    // element is not a flash). These fade out with `beat`.
    add(b.head.rotation, 'x', hit * 0.30);          // head nod
    add(b.chest.rotation, 'x', -hit * 0.10);        // chest pop
    add(b.upperArmL.rotation, 'z', hit * 0.5);      // arms flare
    add(b.upperArmR.rotation, 'z', -hit * 0.5);
    add(b.pelvis.position, 'y', hit * 0.06);        // little jump

    // 3/4 view: rock the whole root gently with the groove (not flat-on)
    tgt(b.root.rotation, 'y', Math.sin(phase) * 0.08);
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

    dance(dt, now);

    // FLASH SAFETY: brightness (opacity) tracks SLOW energy only, eased at a
    // capped rate. NEVER pulse opacity from `beat` — beats move the body, they
    // do not flash the light. The arc reactor is the brightest element.
    coreOpacity += ((0.55 + energy * 0.35) - coreOpacity) * 0.05;
    coreCoreMat.opacity = coreOpacity;
    coreMat.opacity = 0.6 + energy * 0.3;       // slow, bounded
    haloMat.opacity = 0.18 + energy * 0.14;     // slow, bounded

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

  appState.dancer = { start, stop };

  raf = requestAnimationFrame(frame);
}
