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
  let running = true, raf = 0, floored = false;

  function buildScene() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(TIERS[tier].dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    scene = new THREE.Scene();
    fog = new THREE.FogExp2(0x05060a, 0.072); // denser haze → motes funnel out of black
    scene.fog = fog;
    camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 120);
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

    // Dancers: a few luminous figures at depth, silhouetted against the glow.
    // Count scales with the device tier (0 on the weakest). They stay invisible
    // until ignition (the tap), then fade in and dance.
    dancers = [];
    const DANCE_N = tier === 2 ? 3 : tier === 1 ? 2 : 0;
    // close enough to survive the exp fog (they should read as figures IN the
    // haze, not be erased by it), low and to the sides so they frame the names.
    const spread = [-9.5, 9, -5.5];
    const zs = [-17, -19, -27];
    for (let i = 0; i < DANCE_N; i++) {
      const f = makeFigure();
      const s = 1.0 + (i % 2) * 0.22;
      f.group.scale.set(s, s, s);
      f.baseY = -3.6 * s;
      f.group.position.set(spread[i], f.baseY, zs[i]);
      f.phase = i * 2.1;
      scene.add(f.group);
      dancers.push(f);
    }
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
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.3, 'rgba(120,230,255,0.6)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  // A stylized luminous dancer — a light-FIGURE in the haze (Anyma register),
  // built procedurally from primitives (no rigged glTF). Additive so it reads as
  // a glowing silhouette, not a solid mannequin. Joints are animatable; the
  // figure sways/dances to the beat. Swap in a license-clear rigged glTF later
  // for a photoreal figure without touching the rest of the show.
  function makeFigure() {
    // fog:false so the figures read clearly as dancers instead of being erased
    // by the tunnel's exp fog at depth.
    const mat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const limb = (len, r0, r1) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 7, 1, true), mat);
    const g = new THREE.Group();
    const torso = limb(2.2, 0.26, 0.42); torso.position.y = 2.3; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat); head.position.y = 3.85; g.add(head);
    const arm = (side) => {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.5, 3.3, 0);
      const upper = limb(1.5, 0.14, 0.12); upper.position.y = -0.75; pivot.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -1.5; pivot.add(elbow);
      const fore = limb(1.3, 0.11, 0.09); fore.position.y = -0.65; elbow.add(fore);
      g.add(pivot); return { pivot, elbow };
    };
    const leg = (side) => {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.22, 1.2, 0);
      const thigh = limb(1.5, 0.17, 0.14); thigh.position.y = -0.75; pivot.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -1.5; pivot.add(knee);
      const shin = limb(1.4, 0.13, 0.1); shin.position.y = -0.7; knee.add(shin);
      g.add(pivot); return { pivot, knee };
    };
    return { group: g, mat, torso, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
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
    disposeGL();
    const amb = $('#ambient'); if (amb) amb.style.display = '';   // CSS fog stands in
    canvas.style.display = 'none';
  }
  function disposeGL() {
    if (motes) { motes.geometry.dispose(); motes.material.dispose(); }
    if (bokeh) { bokeh.geometry.dispose(); bokeh.material.dispose(); }
    if (glow) glow.material.dispose();
    if (glowCore) glowCore.material.dispose();
    for (const f of dancers) { f.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); f.mat.dispose(); }
    dancers = [];
    if (renderer) { renderer.dispose(); }
    scene = motes = bokeh = glow = glowCore = null;
  }

  // ---- main loop ----
  let smoothE = 0.3, glowBright = 0.4, ignite = 0, beat = 0;
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

    // advance motes toward camera; recycle past the near plane
    const depth = motes.userData.depth;
    const spd = (5 + e * 30 + beat * 16) * dt;
    for (let i = 0; i < speeds.length; i++) {
      positions[i * 3 + 2] += speeds[i] * spd;
      if (positions[i * 3 + 2] > 2) resetMote(i, depth, false);
    }
    motes.geometry.attributes.position.needsUpdate = true;
    motes.material.size = 0.4 + e * 0.5;
    motes.material.opacity = 0.4 + e * 0.5;

    // accent glow: rate-limit brightness change (flash safety backstop)
    const targetGlow = 0.2 + e * 0.6 + beat * 0.12;
    glowBright += Math.max(-0.05, Math.min(0.05, targetGlow - glowBright)); // ≤0.05/frame
    glow.material.opacity = glowBright * 0.7 * (0.35 + 0.65 * ignite);
    glowCore.material.opacity = (0.3 + glowBright * 0.5) * (0.3 + 0.7 * ignite);
    glow.position.z = glowCore.position.z = -72 + Math.sin(now * 0.2) * 6;
    glow.material.rotation += 0.002;

    // dancers: invisible until ignition, then fade in and dance harder on drops
    for (const f of dancers) {
      f.mat.opacity = Math.min(0.85, ignite * (0.5 + e * 0.4));
      const t2 = now * (1.05 + e * 0.7) + f.phase;
      const amp = 0.25 + e * 0.9 + beat * 0.5;
      f.group.rotation.z = Math.sin(t2 * 0.9) * 0.12 * ignite;
      f.group.position.y = f.baseY + Math.abs(Math.sin(t2)) * 0.4 * ignite;
      f.armL.pivot.rotation.z = 0.5 + Math.sin(t2) * amp;
      f.armR.pivot.rotation.z = -0.5 - Math.sin(t2 + 0.6) * amp;
      f.armL.elbow.rotation.z = -0.4 - Math.max(0, Math.sin(t2)) * 0.6;
      f.armR.elbow.rotation.z = 0.4 + Math.max(0, Math.sin(t2 + 0.6)) * 0.6;
      f.legL.pivot.rotation.x = Math.sin(t2) * 0.16 * amp;
      f.legR.pivot.rotation.x = -Math.sin(t2) * 0.16 * amp;
    }

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
