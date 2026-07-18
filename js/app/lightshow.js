import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';

// ── Techno light show (Phase 2, Path A: procedural WebGL) ──────────────
// A haze-filled tunnel of receding light motes with a single cyan accent glow —
// the "Anyma abstract" primitive research rated cheapest-to-run yet most
// premium. ONE WebGL context on #lightshow (outside the ScrollSmoother wrapper),
// ONE RAF. Driven by the OFFLINE music envelope (assets/audio/techno/
// envelopes.json) indexed by audio.currentTime, blended across crossfades by the
// same ramp ui.js already computes. With no audio it runs a slow autonomous idle
// loop so the show still reads finished (30s auto-open / dock-paused / etc.).
//
// Safety & performance:
//  • reduced-motion → this never runs (no WebGL init at all); CSS fog stands in.
//  • runtime FPS governor: conservative start seeded from device, measures real
//    frame times, degrades DPR → mote count → floor (drop WebGL, show CSS fog).
//  • flash safety: background stays black, motes are small-area, and the
//    full-field glow's brightness change is rate-limited — no >3/sec high-
//    contrast full-viewport flash for anyone (build-time lint is the primary
//    guard; this is the backstop).
//  • RAF pauses on hidden tab.

export function initLightshow() {
  if (REDUCED) return;                                   // static poster path
  if (document.documentElement.dataset.skin !== 'techno') return;
  const canvas = $('#lightshow');
  if (!canvas) return;

  // Envelope data (loaded once; the show runs on idle energy until it arrives).
  let ENV = null;
  fetch('assets/audio/techno/envelopes.json').then(r => r.ok ? r.json() : null).then(j => { ENV = j; }).catch(() => {});

  const state = { energy: 0.3 };
  appState.lightshow = state;

  // ---- energy source: music envelope, or an autonomous idle breath ----
  function envAt(name, t) {
    if (!ENV || !ENV.tracks[name]) return null;
    const tr = ENV.tracks[name];
    const x = t * ENV.fps, i = Math.floor(x), f = x - i;
    const a = tr.env[i] ?? 0, b = tr.env[i + 1] ?? a;
    return a + (b - a) * f;
  }
  let idleT = 0;
  function readEnergy(dt) {
    const m = appState.music;
    if (m && m.audio && !m.paused && ENV) {
      const cur = envAt(m.audio._trackName, m.audio.currentTime || 0);
      if (m.outgoing && m.outgoing._trackName) {
        const p = m.crossP == null ? 1 : m.crossP;
        const out = envAt(m.outgoing._trackName, m.outgoing.currentTime || 0);
        if (cur != null && out != null) return (1 - p) * out + p * cur;
      }
      if (cur != null) return cur;
    }
    idleT += dt;
    return 0.28 + 0.09 * Math.sin(idleT * 0.5); // calm idle breath
  }

  // discrete onset cue: fire when we cross an onset time in the current track
  let lastOnsetIdx = -1, lastTrack = '';
  function onsetHit(name, t) {
    if (!ENV || !ENV.tracks[name]) return false;
    if (name !== lastTrack) { lastTrack = name; lastOnsetIdx = -1; }
    const on = ENV.tracks[name].onsets;
    let hit = false;
    while (lastOnsetIdx + 1 < on.length && on[lastOnsetIdx + 1] <= t) { lastOnsetIdx++; hit = true; }
    return hit;
  }

  // ---- try WebGL; fall back to the CSS fog on failure ----
  const THREE = window.THREE;
  if (!THREE) return; // CSS #ambient fog stays visible as the static fallback

  // device-seeded starting tier (NOT net.js — that's network). 2=high 1=mid 0=low
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  let tier = (cores >= 8 && mem >= 8) ? 2 : (cores >= 4 && mem >= 4) ? 1 : 0;
  const TIERS = {
    2: { dpr: 1.5, motes: 1300 },
    1: { dpr: 1.0, motes: 800 },
    0: { dpr: 0.75, motes: 420 },
  };

  let renderer, scene, camera, motes, glow, glowCore, bokeh, positions, speeds, fog;
  let dancers = [];
  let sceneTextures = [];        // textures created per build, disposed on rebuild
  let running = true, raf = 0, floored = false;

  function buildScene() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(TIERS[tier].dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    // correct colour + tone mapping so the mecha's PBR chrome reads (without
    // these it renders near-black); mild exposure keeps the haze/glow intact.
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    scene = new THREE.Scene();
    sceneTextures = [];
    fog = new THREE.FogExp2(0x05060a, 0.072); // denser haze → motes funnel out of black
    scene.fog = fog;
    camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 600); // far covers a deep DANCER.z
    camera.position.set(0, 0, 0);

    const N = TIERS[tier].motes;
    positions = new Float32Array(N * 3);
    speeds = new Float32Array(N);
    const colors = new Float32Array(N * 3);
    const DEPTH = 90;
    for (let i = 0; i < N; i++) {
      resetMote(i, DEPTH, true);
      // "Light is rare": the field is cool near-white dust; only ~10% carries a
      // faint cyan tint. The one earned light is the central glow, not confetti.
      const cyan = Math.random() < 0.1;
      colors[i * 3] = cyan ? 0.35 : 0.80;
      colors[i * 3 + 1] = cyan ? 0.80 : 0.85;
      colors[i * 3 + 2] = cyan ? 0.92 : 0.92;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.85,
      map: moteTexture(), alphaTest: 0.01,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    motes = new THREE.Points(geo, mat);
    motes.userData.depth = DEPTH;
    scene.add(motes);

    // Near-plane BOKEH: a handful of big, very soft, low-opacity discs give a
    // focal plane so depth reads as size+blur variance (not a flat starfield).
    const BN = Math.round(TIERS[tier].motes / 90) + 8;
    const bpos = new Float32Array(BN * 3);
    for (let i = 0; i < BN; i++) {
      bpos[i * 3] = (Math.random() - 0.5) * 24;
      bpos[i * 3 + 1] = (Math.random() - 0.5) * 44;
      bpos[i * 3 + 2] = -3 - Math.random() * 16;
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    bokeh = new THREE.Points(bgeo, new THREE.PointsMaterial({
      size: 8, map: moteTexture(), color: 0xbfe9ff, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(bokeh);

    // The single accent glow, the convergence point the tunnel funnels toward:
    // a wide soft cyan bloom + a tight hot white core (clearly the brightest,
    // most saturated event in the frame).
    glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x22d3ee, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(46, 46, 1);
    glow.position.set(0, 0, -74);
    scene.add(glow);
    glowCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xd8fbff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowCore.scale.set(12, 12, 1);
    glowCore.position.set(0, 0, -70);
    scene.add(glowCore);

    // The drop dancer (mecha glTF) is instanced once loaded; on a governor
    // rebuild its lights/env and instances are recreated for the new scene.
    dancers = [];
    if (mechaLoading || mechaTemplate) setupMechaScene();
    if (mechaTemplate) fitAndAddDancers();
  }

  // Lights + a studio env for the mecha's PBR chrome. Recreated per build (a
  // PMREM env texture is bound to the renderer/context, so it can't be cached
  // across a rebuild). Guarded to run once per scene.
  function setupMechaScene() {
    if (!scene || !renderer || scene.userData.lit) return;
    scene.userData.lit = true;
    const dir = new THREE.DirectionalLight(0xbfe9ff, 3.2); dir.position.set(3, 6, 4); scene.add(dir);
    const fill = new THREE.DirectionalLight(0x88b0ff, 1.4); fill.position.set(-4, 1, 3); scene.add(fill);
    scene.add(new THREE.AmbientLight(0x33445a, 0.8));
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const src = makeEnvTexture();
      const env = pmrem.fromEquirectangular(src).texture;
      scene.environment = env;
      sceneTextures.push(env);
      src.dispose();
      pmrem.dispose();
    } catch (e) { /* env optional */ }
  }

  // place a mote on a tunnel ring at a given depth
  function resetMote(i, depth, anywhere) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 6 + Math.random() * 7;                 // tunnel radius band
    positions[i * 3] = Math.cos(ang) * rad;
    positions[i * 3 + 1] = Math.sin(ang) * rad;
    positions[i * 3 + 2] = anywhere ? -Math.random() * depth : -depth;
    speeds[i] = 0.5 + Math.random() * 0.9;
  }

  // soft round bokeh dot so motes read as light haze, not hard squares
  function moteTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; sceneTextures.push(t); return t;
  }

  // A self-contained studio environment (no external RoomEnvironment script):
  // a vertical gradient — cool light from above, cyan mid, dark floor — so the
  // mecha's chrome reflects in-palette light and never renders black.
  function makeEnvTexture() {
    const c = document.createElement('canvas'); c.width = 32; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#e6f7ff');
    grad.addColorStop(0.34, '#3aa8c8');
    grad.addColorStop(0.62, '#12303c');
    grad.addColorStop(1, '#050608');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 128);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.needsUpdate = true;
    return t;
  }

  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.3, 'rgba(120,230,255,0.6)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; sceneTextures.push(t); return t;
  }

  // ── The cyber mecha dancer (glTF/Draco) ─────────────────────────────
  // Lazy-loaded after ignition. Lights + a studio env (in setupMechaScene, per
  // build) make its chrome read. Placed on the side (desktop) / centre (mobile)
  // via the DANCER config, sized to real screen pixels by fitToPixels. Currently
  // visible whenever ignited (target = ignite); it fades in on the tap and spins.
  let mechaTemplate = null, mechaLoading = false;
  // ── Dancer placement — tweak these ──────────────────────────────────
  // size = on-screen height as a fraction of the real screen pixels (bigger = closer).
  // z = depth into the tunnel (more negative = deeper/farther). y = vertical
  // offset in world units (+up/-down). x is the horizontal offset in world units:
  // xDesktop puts it out to the side on wide screens, xMobile on phones (0 = centre).
  const DANCER = { size: 0.12, z: -450, y: 0, xDesktop: 9, xMobile: 0 };
  let mechaRawH = 1;            // model's un-scaled height (for the fit)
  let mechaCenter = null;       // model's raw bounding-box centre
  function ensureMecha() {
    if (mechaLoading || mechaTemplate || !THREE.GLTFLoader || !renderer) return; // load on all tiers
    mechaLoading = true;
    setupMechaScene(); // lights + env on the current scene (idempotent)
    try {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      const loader = new THREE.GLTFLoader(); loader.setDRACOLoader(draco);
      loader.load('assets/scene/mecha.glb', (g) => {
        const o = g.scene;
        o.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(o);
        const size = box.getSize(new THREE.Vector3());
        mechaRawH = size.y || 1;
        mechaCenter = box.getCenter(new THREE.Vector3()); // recenter per-instance after scaling
        mechaTemplate = o;
        fitAndAddDancers();
        state.mechaReady = true;
      }, undefined, () => { mechaLoading = false; });
    } catch (e) { mechaLoading = false; }
  }
  // Measure the model's ACTUAL projected pixel height on screen and scale it to
  // a target pixel size (fraction of the real innerHeight). Iterates so it lands
  // exactly, regardless of the model's internal glTF transform or its depth.
  function fitToPixels(grp, pivot, targetPxH) {
    const corner = new THREE.Vector3();
    for (let iter = 0; iter < 4; iter++) {
      grp.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(pivot);
      if (box.isEmpty()) break;
      let ymin = Infinity, ymax = -Infinity;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        corner.project(camera);
        ymin = Math.min(ymin, corner.y); ymax = Math.max(ymax, corner.y);
      }
      const pxH = (ymax - ymin) * 0.5 * window.innerHeight; // NDC span → screen pixels
      if (pxH < 0.5) break;
      const k = targetPxH / pxH;
      if (Math.abs(k - 1) < 0.02) break;
      pivot.scale.multiplyScalar(k);
    }
  }

  // Instance the mecha on the side(s), sized to real pixels and vertically
  // centred so the FULL body shows. Centre stays clear for content.
  function fitAndAddDancers() {
    if (!mechaTemplate || !scene || !camera) return;
    dancers = [];
    const vh = 2 * Math.abs(DANCER.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const portrait = camera.aspect < 1;                        // phone → centre; desktop → side
    const xMag = portrait ? DANCER.xMobile : DANCER.xDesktop;  // horizontal offset (world units)
    const targetPxH = DANCER.size * window.innerHeight;        // paint to real screen pixels
    const sides = portrait ? [1] : (tier === 2 ? [-1, 1] : [1]);
    for (const sd of sides) {
      const inner = mechaTemplate.clone(true);
      const mats = [];
      inner.traverse((m) => {
        if (m.isMesh && m.material) {
          m.material = m.material.clone();
          m.material.transparent = true; m.material.opacity = 0; m.material.fog = false;
          if ('envMapIntensity' in m.material) m.material.envMapIntensity = 2.0;
          if ('emissiveIntensity' in m.material) m.material.emissiveIntensity = 2.2; // self-lit so it reads on the dark bg
          mats.push(m.material);
        }
      });
      // centre the geometry inside an identity pivot (transform-agnostic)
      const pivot = new THREE.Group(); pivot.add(inner); pivot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner);
      const rawH = box.getSize(new THREE.Vector3()).y || 1;
      inner.position.sub(box.getCenter(new THREE.Vector3()));
      pivot.scale.setScalar((DANCER.size * vh) / rawH);       // initial guess (world units) so pixel-fit can measure
      pivot.rotation.y = sd < 0 ? 0.4 : -0.4;                  // spin around the model centre
      const grp = new THREE.Group(); grp.add(pivot);
      grp.position.set(sd * xMag, DANCER.y, DANCER.z);        // XYZ from the DANCER config
      fitToPixels(grp, pivot, targetPxH);                      // refine to exact target screen pixels
      grp.visible = false;
      scene.add(grp);
      dancers.push({ grp, inst: inner, spin: pivot, mats, side: sd, k: 0, baseY: DANCER.y });
    }
  }

  // ---- FPS governor: measure real frame times, degrade or floor ----
  let sampleStart = 0, sampleFrames = 0, sampleAcc = 0, measuring = true;
  function govern(dt) {
    if (!measuring) return;
    sampleAcc += dt; sampleFrames++;
    if (sampleAcc < 2) return;               // measure ~2s per scene
    const fps = sampleFrames / sampleAcc;
    if (fps < 40 && tier > 0) { tier--; rebuild(); }
    else if (fps < 24) { floor(); }
    else { measuring = false; }              // headroom is fine, stop measuring
    sampleAcc = 0; sampleFrames = 0;
  }
  function rebuild() {
    disposeGL();
    buildScene();
    measuring = true; sampleAcc = 0; sampleFrames = 0;
  }
  function floor() {
    floored = true; measuring = false;
    state.drop = 0;              // don't strand the MilkDrop viz visible
    disposeGL();
    const amb = $('#ambient'); if (amb) amb.style.display = '';   // CSS fog stands in
    canvas.style.display = 'none';
  }
  function disposeGL() {
    if (motes) { motes.geometry.dispose(); motes.material.dispose(); }
    if (bokeh) { bokeh.geometry.dispose(); bokeh.material.dispose(); }
    if (glow) glow.material.dispose();
    if (glowCore) glowCore.material.dispose();
    // dancers share the template's GEOMETRY (clone(true) copies geometry by
    // reference) — dispose only the per-instance cloned materials, never the
    // shared geometry (that would break the template on the next rebuild).
    for (const d of dancers) { for (const mm of d.mats) mm.dispose(); }
    dancers = [];
    for (const t of sceneTextures) { try { t.dispose(); } catch (e) {} }
    sceneTextures = [];
    if (renderer) { renderer.dispose(); }
    scene = motes = bokeh = glow = glowCore = null;
  }

  // ---- main loop ----
  let smoothE = 0.3, glowBright = 0.4, ignite = 0, beat = 0, dropLevel = 0;
  const rootStyle = document.documentElement.style;
  let last = 0;
  function frame(ts) {
    if (!running || floored) return;
    const now = ts / 1000;
    const dt = last ? Math.min(0.05, now - last) : 0.016;
    last = now;
    govern(dt);
    if (floored) return;

    // ignition: dormant before the tap (a quiet tease), surging to full over
    // ~1.5s when appState.ignited flips — the tap IS the drop / the surprise.
    ignite += ((appState.ignited ? 1 : 0) - ignite) * 0.03;

    // energy → smoothed drive, then damped by ignition so pre-tap stays quiet
    const eRaw = readEnergy(dt);
    smoothE += (eRaw - smoothE) * 0.15;
    const e = smoothE * (0.13 + 0.87 * ignite);
    state.energy = e;

    // onset burst → beat spike (decays); only meaningful once ignited
    let burst = 0;
    const m = appState.music;
    if (m && m.audio && !m.paused) burst = onsetHit(m.audio._trackName, m.audio.currentTime || 0) ? 1 : 0;
    beat = Math.max(beat * 0.9, burst * ignite); // linger a little so the shimmer reads

    // expose to the DOM for beat-reactive UI (small-area glow only → flash-safe)
    rootStyle.setProperty('--energy', e.toFixed(3));
    rootStyle.setProperty('--beat', beat.toFixed(3));

    // drop level: rises in SUSTAINED loud/high-energy sections, eases out in the
    // quiet — drives the MilkDrop viz (only on drops). Hysteresis avoids
    // threshold dithering; NO per-beat spike (that strobed the full-field layer,
    // a flash risk), so both edges stay smoothly rate-limited like the glow.
    const dropTarget = e > (dropLevel > 0.5 ? 0.46 : 0.62) ? 1 : 0; // Schmitt trigger
    dropLevel += (dropTarget - dropLevel) * (dropTarget > dropLevel ? 0.06 : 0.03); // ≤ ~0.06/frame
    state.drop = dropLevel;

    // advance motes toward camera; recycle past the near plane
    const depth = motes.userData.depth;
    const spd = (5 + e * 30 + beat * 16) * dt;
    for (let i = 0; i < speeds.length; i++) {
      positions[i * 3 + 2] += speeds[i] * spd;
      if (positions[i * 3 + 2] > 2) resetMote(i, depth, false);
    }
    motes.geometry.attributes.position.needsUpdate = true;
    motes.material.size = 0.4 + e * 0.5;

    // ── DROP DANCER: the mecha appears ONLY on a big drop, on the side ──
    if (appState.ignited) ensureMecha();
    let dancerK = 0;
    if (dancers.length) {
      for (const d of dancers) {
        // TEMP: always visible once ignited (was drop-gated). Fades in on the tap.
        const target = ignite;
        d.k += (target - d.k) * 0.14;
        d.grp.visible = d.k > 0.01;
        for (const mm of d.mats) mm.opacity = Math.min(1, d.k);
        if (d.grp.visible) {
          d.spin.rotation.y += 0.02 + e * 0.05;                            // turn/show off (spins in place)
          d.grp.position.y = d.baseY + Math.sin(now * 3 + d.side) * 0.35 * d.k; // bob
          d.grp.rotation.z = Math.sin(now * 2 + d.side) * 0.05 * d.k;           // sway
        }
        dancerK = Math.max(dancerK, d.k);
      }
    }
    rootStyle.setProperty('--drop', dancerK.toFixed(3));
    const haze = 1 - 0.3 * dancerK; // milder dim since the dancer is always up for now
    motes.material.opacity = (0.4 + e * 0.5) * haze;

    // accent glow: rate-limit brightness change (flash safety backstop)
    const targetGlow = 0.2 + e * 0.6 + beat * 0.12;
    glowBright += Math.max(-0.05, Math.min(0.05, targetGlow - glowBright)); // ≤0.05/frame
    glow.material.opacity = glowBright * 0.7 * (0.35 + 0.65 * ignite) * haze;
    glowCore.material.opacity = (0.3 + glowBright * 0.5) * (0.3 + 0.7 * ignite);
    glow.position.z = glowCore.position.z = -72 + Math.sin(now * 0.2) * 6;
    glow.material.rotation += 0.002;

    // subtle camera parallax + fog breathing
    camera.position.x = Math.sin(now * 0.13) * 0.7;
    camera.position.y = Math.cos(now * 0.11) * 0.5;
    camera.lookAt(0, 0, -60);
    fog.density = 0.058 + (1 - e) * 0.02;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function onResize() {
    if (floored || !renderer) return;
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  }

  function start() { if (!running && !floored) { running = true; last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  try {
    buildScene();
  } catch (e) { floor(); return; }
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });

  const amb = $('#ambient'); if (amb) amb.style.display = 'none'; // JS show live → retire CSS fog
  raf = requestAnimationFrame(frame);
}
