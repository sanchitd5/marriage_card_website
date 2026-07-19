import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';

// ── Kinetic dancer (persistent side wireframe humanoid) ─────────────────
// A procedural tall/slender "Anyma alien" figure — built from smooth tapered
// wireframe primitives (NO glTF model), rendered as a cyan ADDITIVE wireframe on its own small
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

  // ── shared materials (2 line mats: additive core + halo) ─────────────
  // WebGL linewidth is always 1px, so "bloom" is faked with an additive halo
  // pass at 1.04× scale over a brighter additive core.
  // NOTE: this figure is HIGH-POLY (~10k wire segments). Additive blending
  // accumulates where lines overlap, so in compact poses (arms/legs together)
  // the dense mesh blows out into a soft glowing blob. Keep per-line alpha LOW
  // so the wireframe stays crisp at every pose; the density supplies presence.
  const coreMat = new THREE.LineBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });

  const disposables = [];   // WireframeGeometry instances to dispose on teardown

  // ── high-poly wireframe helpers ("Anyma alien" silhouette) ──────────────
  // The figure is a tall, slender, smooth, featureless humanoid (à la Anyma's
  // Genesys/Eva & Syren stage visuals): elongated tapered limbs, a long neck and
  // an elongated ovoid head — rendered as a DENSE cyan holographic wireframe
  // (many small facets on curved surfaces), not a low-poly box mannequin.
  //
  // Segment density on the curved surfaces (keeps the wireframe reading as a
  // fine mesh while staying well within a sane vertex budget for a tiny canvas).
  const RSEG = 16, HSEG = 6;

  // Shared render path for every bone: a core LineSegments + an additive halo
  // copy at 1.04× (identical to the old boxes, just on smooth geometry). The
  // base geometry is disposed immediately; the WireframeGeometry is tracked for
  // teardown. `len` is stored so attach()/attachUp() can seat children.
  function boneFromGeo(geo, len) {
    const g = new THREE.Group();
    const wire = new THREE.WireframeGeometry(geo); geo.dispose();
    g.add(new THREE.LineSegments(wire, coreMat));
    const halo = new THREE.LineSegments(wire, haloMat); halo.scale.setScalar(1.04); g.add(halo);
    g.userData.len = len; disposables.push(wire); return g;
  }

  // A bone is a THREE.Group whose ORIGIN is the proximal joint. Its SMOOTH,
  // tapered geometry (a high-poly open cone/cylinder, rProx at the joint tapering
  // to rDist at the distal end) is translated DOWN by len/2 so it hangs from the
  // joint, exactly like the old box; child bones attach at the distal end
  // (position.y = -parentLen). Rotating the group pivots about the joint.
  function makeBone(len, rProx, rDist) {
    // CylinderGeometry(radiusTop, radiusBottom, height, radialSeg, heightSeg, openEnded)
    // top (+Y) = proximal (joint) end → put rProx on top so the joint end is thicker.
    const geo = new THREE.CylinderGeometry(rProx, rDist, len, RSEG, HSEG, true);
    geo.translate(0, -len / 2, 0);
    return boneFromGeo(geo, len);
  }
  function attach(parent, child) { child.position.set(0, -parent.userData.len, 0); parent.add(child); }

  // Same as makeBone, but the segment RISES from the joint (geometry translated
  // UP). The limbs (arms/legs) hang down → makeBone; the torso (spine→chest→neck)
  // rises from the waist → this. Children of an up-bone are seated at +parentLen.
  function makeBoneUp(len, rProx, rDist) {
    // translated up: bottom (−Y) = proximal (joint) end → rProx on the bottom.
    const geo = new THREE.CylinderGeometry(rDist, rProx, len, RSEG, HSEG, true);
    geo.translate(0, len / 2, 0);
    return boneFromGeo(geo, len);
  }
  function attachUp(parent, child) { child.position.set(0, parent.userData.len, 0); parent.add(child); }

  // Elongated, featureless ovoid head. A geodesic icosphere (even faceting →
  // dense holographic mesh) scaled taller on Y for the alien skull, then
  // translated up so it RISES from the neck-top joint like an up-bone. Kept a
  // touch smaller / sleeker than before so the now-taller body doesn't read as
  // a bobble-head.
  function makeHead(r, yScale) {
    const geo = new THREE.IcosahedronGeometry(r, 2);   // 320 faces — smooth, no face
    geo.scale(0.88, yScale, 0.88);
    geo.translate(0, r * yScale, 0);                   // bottom of the ovoid sits at the joint
    return boneFromGeo(geo, r * yScale * 2);
  }

  // Hands & feet: NO spheres. A tiny slim tapered tip that continues the
  // forearm/shin taper smoothly to a fine point (a very short, near-needle
  // cone). Keeps the hand/foot nodes in the rig graph without any ball-joint
  // read. `makeBone` already tapers rProx → rDist and hangs from the joint.
  function makeTip(len, rProx) {
    return makeBone(len, rProx, rProx * 0.12);   // taper to a near-point
  }

  // ── runtime state ────────────────────────────────────────────────────
  let renderer, scene, camera, root;
  let bones = null;                         // the named rig (built in build())
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

    // Lithe, MUCH more elongated proportions → tall smooth alien silhouette.
    // All radii cut ~30–40% vs. the old stocky figure (thin, tubular limbs) and
    // every segment lengthened, so the height-to-width ratio reads as a slender
    // dancer, not a mannequin. Limbs taper (rProx → rDist), each distal segment
    // thinner than the one before it; forearms/shins taper to a fine point that
    // a tiny tip continues (no sphere hands/feet).
    const pelvis = makeBone(0.30, 0.155, 0.185);  // waist(origin) → hips (slim, hangs down)
    const spine = makeBoneUp(0.70, 0.165, 0.140); // long slender torso rises …
    const chest = makeBoneUp(0.78, 0.150, 0.190); // narrow ribcage widening toward the shoulders
    const neck = makeBoneUp(0.44, 0.082, 0.072);  // long swan neck
    const head = makeHead(0.225, 1.7);            // sleeker elongated ovoid (alien skull)

    const upperArmL = makeBone(0.84, 0.086, 0.066);
    const forearmL = makeBone(0.80, 0.062, 0.012);      // tapers to a fine point (no hand blob)
    const handL = makeTip(0.07, 0.014);                 // tiny slim tapered tip
    const upperArmR = makeBone(0.84, 0.086, 0.066);
    const forearmR = makeBone(0.80, 0.062, 0.012);
    const handR = makeTip(0.07, 0.014);

    const thighL = makeBone(1.08, 0.120, 0.084);
    const shinL = makeBone(1.04, 0.080, 0.013);         // tapers to a fine point (no foot blob)
    const footL = makeTip(0.10, 0.016);                 // tiny slim tapered tip (pointed toe)
    const thighR = makeBone(1.08, 0.120, 0.084);
    const shinR = makeBone(1.04, 0.080, 0.013);
    const footR = makeTip(0.10, 0.016);

    // torso chain: spine origin sits AT the waist (pelvis origin), then rises
    root.add(pelvis);
    pelvis.add(spine); spine.position.set(0, 0, 0);   // spine pivots at the waist
    attachUp(spine, chest);                            // chest above spine
    attachUp(chest, neck);                             // neck above chest
    attachUp(neck, head);                              // head above neck

    // shoulders: tiny offset groups near the top of the chest; arms hang OUT/down
    const shoulderL = new THREE.Group(); shoulderL.position.set(0.27, chest.userData.len * 0.94, 0);
    const shoulderR = new THREE.Group(); shoulderR.position.set(-0.27, chest.userData.len * 0.94, 0);
    chest.add(shoulderL); chest.add(shoulderR);
    attach(shoulderL, upperArmL); attach(upperArmL, forearmL); attach(forearmL, handL);
    attach(shoulderR, upperArmR); attach(upperArmR, forearmR); attach(forearmR, handR);
    // (shoulder groups have no bone length; seat the upper arm at the group origin)
    upperArmL.position.set(0, 0, 0); upperArmR.position.set(0, 0, 0);

    // hips: tiny offset groups at the bottom of the pelvis; legs hang DOWN
    const hipL = new THREE.Group(); hipL.position.set(0.155, -pelvis.userData.len, 0);
    const hipR = new THREE.Group(); hipR.position.set(-0.155, -pelvis.userData.len, 0);
    pelvis.add(hipL); pelvis.add(hipR);
    attach(hipL, thighL); attach(thighL, shinL); attach(shinL, footL);
    attach(hipR, thighR); attach(thighR, shinR); attach(shinR, footR);
    thighL.position.set(0, 0, 0); thighR.position.set(0, 0, 0);   // seat at hip-group origin

    // (No chest "reactor" node — removed. It read as Iron-Man armour, off
    // register for an elegant alien. The body is just the two additive line
    // materials now.)

    // Seat the rig so head↔feet centre on the origin. Waist is at root y; the
    // ovoid head top now rises ~2.6 above and the feet drop ~2.5 below the waist
    // (markedly taller, slimmer figure), so a tiny lift keeps it centred.
    root.position.y = 0.05;
    root.scale.setScalar(0.60); // taller alien → scaled down so head→feet + arm-span still frame with ~6% inset
    scene.add(root);

    bones = {
      root, pelvis, spine, chest, neck, head,
      shoulderL, shoulderR, upperArmL, forearmL, handL, upperArmR, forearmR, handR,
      hipL, hipR, thighL, shinL, footL, thighR, shinR, footR,
    };

    // ── camera: the canvas is TALL and NARROW, so frame the FULL figure
    // vertically. The rig spans ~4.5 units head→feet (scaled by root.scale);
    // pull the camera back on +Z (the root faces +Z toward us) and aim slightly
    // below centre so the ovoid head and feet both sit inside the frame. ──
    camera = new THREE.PerspectiveCamera(38, 0.5, 0.1, 100);
    camera.position.set(0, 0.05, 8.4); // pulled back so even an energetic arm flare stays clear of the frame edge
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
    return { rateHz: 0.12 + energy * 0.10, accent: 0 };   // idle free-run, no beat
  }

  // ── the dance ────────────────────────────────────────────────────────
  // Everything is DAMPED toward a target each frame (factor k, framerate-aware)
  // so the figure grooves smoothly and never snaps or seizures. Ranges are kept
  // inside safe limits so no bone clips through another.
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

    // slow 3/4 sway of the whole figure (never flat-on)
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

    // FLASH SAFETY: brightness (opacity) tracks SLOW energy only, eased at a
    // capped rate. NEVER pulse opacity from `beat` — beats move the body, they
    // do not flash the light.
    // LOW per-line alpha (dense high-poly mesh) so additive overlap never blows
    // out to a soft blob in compact poses — crisp wireframe at every pose.
    // Still slow energy-driven only (flash-safe), never beat.
    coreMat.opacity = 0.3 + energy * 0.16;      // slow, bounded
    haloMat.opacity = 0.06 + energy * 0.06;     // slow, bounded

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
  };

  raf = requestAnimationFrame(frame);
}
