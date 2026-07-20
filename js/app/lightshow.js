import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import { MAX_FLASHES_PER_SEC, MIN_FLASH_INTERVAL_S, FlashGovernor } from './flash-cap.js';

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
//    full-field glow's brightness change is rate-limited — no >50/sec high-
//    contrast full-viewport flash for anyone (build-time lint is the primary
//    guard; this is the backstop).
//  • RAF pauses on hidden tab.
//
// This module is the LightShow class below; initLightshow() is a thin factory
// that evaluates the decline guards (reduced-motion / wrong skin / no canvas)
// and then constructs + runs ONE instance. All engine state (renderer, scene,
// motes, governor, flash) is encapsulated on the instance.

// ── FULL-SCREEN WHITE FLASH (beat strobe on the drop) — flash-safety constants ─
// A real full-viewport, pure-white flash fired on the drop's onsets. Because a
// full-field white flash is the maximum-risk photosensitive stimulus, its rate
// is HARD-CAPPED. The cap value, the rationale, and the "do not raise it above
// 50" rule live in ONE place — js/app/flash-cap.js (WCAG 3.0 internal, ≤50/sec) — which
// both this file (via the FlashGovernor rate limiter) and test/flash-cap.test.mjs
// use, so the shipped cap and the tested cap can never drift apart. The governor
// enforces MIN_FLASH_INTERVAL_S as the hard floor between flash starts; an onset
// arriving sooner is DROPPED (never queued), so no BPM / onset density can exceed
// the cap. reduced-motion never reaches this: initLightshow() returns at the top
// when REDUCED, so the overlay below is never even created.
// See docs/techno-variant.md → "Full-screen white flash".
const FLASH_DECAY_PER_S = 6.5;   // visual fade rate only (1→0 in ~150ms); NOT the rate cap
const FLASH_ENERGY_GATE = 0.55;  // only strobe in high-energy/drop sections ("high BPM")
const FLASH_PEAK = 1;            // full white at peak

// Flash TINT (not the rate — that's capped): standard drops flash white; the
// HEAVIEST upbeats flash cyan, from the same family as the wireframe cluster
// (0x8fe9ff). The colour is blended white→cyan by how far the energy sits above
// the gate, so across a track the strobe reads as a WHITE/CYAN MIXTURE — going
// full cyan only on the biggest hits. Blue channel is 255 at both ends, so only
// R/G drop as it cools toward cyan.
const FLASH_HEAVY_E = 0.82;         // energy at/above which the flash is fully cyan
const FLASH_CYAN = [42, 217, 255];  // #2ad9ff — punchy cyan that still reads at opacity 1

// device-seeded tier table (NOT net.js — that's network). 2=high 1=mid 0=low
const TIERS = {
  2: { dpr: 1.5, motes: 1300 },
  1: { dpr: 1.0, motes: 800 },
  0: { dpr: 0.75, motes: 420 },
};

// Dancer placement — see the DANCER config comment below.
const DANCER = { size: 0.12, z: -450, y: 0, xDesktop: 9, xMobile: 0 };

class LightShow {
  constructor(canvas) {
    this.canvas = canvas;

    // Envelope data (loaded once; the show runs on idle energy until it arrives).
    this.ENV = null;
    fetch('assets/audio/techno/envelopes.json').then(r => r.ok ? r.json() : null).then(j => { this.ENV = j; }).catch(() => {});

    this.state = { energy: 0.3 };
    appState.lightshow = this.state;

    // The overlay: a fixed, pointer-transparent, pure-white sheet whose opacity is
    // pulsed. Created ONLY here (past the REDUCED guard) so it never exists on the
    // reduced-motion path. z-index 90 → above content + controls so the flash is
    // genuinely full-screen; harmless (pointer-events:none, aria-hidden).
    const flashEl = document.createElement('div');
    flashEl.id = 'lightshow-flash';
    flashEl.setAttribute('aria-hidden', 'true');
    Object.assign(flashEl.style, {
      position: 'fixed', inset: '0', background: '#ffffff', opacity: '0',
      pointerEvents: 'none', zIndex: '90', willChange: 'opacity',
    });
    document.body.appendChild(flashEl);
    this.flashEl = flashEl;
    this.flashOpacity = 0;
    this.flashGov = new FlashGovernor();   // ≤50/sec hard floor between flash starts (flash-cap.js)
    this.lastFlashWritten = 0;
    this.lastFlashColor = '#ffffff';

    // energy source bookkeeping
    this.idleT = 0;
    this.lastOnsetIdx = -1;
    this.lastTrack = '';

    this.THREE = window.THREE;

    // device-seeded starting tier
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    this.tier = (cores >= 8 && mem >= 8) ? 2 : (cores >= 4 && mem >= 4) ? 1 : 0;

    // scene / render state
    this.renderer = null; this.scene = null; this.camera = null;
    this.motes = null; this.glow = null; this.glowCore = null; this.bokeh = null;
    this.positions = null; this.speeds = null; this.fog = null;
    this.dancers = [];
    this.sceneTextures = [];        // textures created per build, disposed on rebuild
    this.running = true; this.raf = 0; this.floored = false;

    // mecha dancer state
    this.mechaTemplate = null; this.mechaLoading = false;
    this.mechaRawH = 1;            // model's un-scaled height (for the fit)
    this.mechaCenter = null;       // model's raw bounding-box centre

    // flash-cut geometric accent
    this.flashGrp = null; this.flashPolys = []; this.flashSpiral = null; this.flashSpiralMat = null;
    this.flashPulse = 0; this.flashDominant = 0;

    // FPS governor
    this.sampleStart = 0; this.sampleFrames = 0; this.sampleAcc = 0; this.measuring = true;

    // main loop
    this.smoothE = 0.3; this.glowBright = 0.4; this.ignite = 0; this.beat = 0; this.dropLevel = 0;
    this.rootStyle = document.documentElement.style;
    this.lastEQ = ''; this.lastBQ = ''; this.lastDQ = ''; // last :root values written (skip no-op writes)
    this.last = 0;

    this.frame = this.frame.bind(this);
  }

  // white on normal drops, cyan on the heaviest upbeats
  flashTint(energy) {
    const t = Math.max(0, Math.min(1, (energy - FLASH_ENERGY_GATE) / (FLASH_HEAVY_E - FLASH_ENERGY_GATE)));
    const r = Math.round(255 + (FLASH_CYAN[0] - 255) * t);
    const g = Math.round(255 + (FLASH_CYAN[1] - 255) * t);
    return `rgb(${r},${g},255)`;
  }

  // ---- energy source: music envelope, or an autonomous idle breath ----
  envAt(name, t) {
    const ENV = this.ENV;
    if (!ENV || !ENV.tracks[name]) return null;
    const tr = ENV.tracks[name];
    const x = t * ENV.fps, i = Math.floor(x), f = x - i;
    const a = tr.env[i] ?? 0, b = tr.env[i + 1] ?? a;
    return a + (b - a) * f;
  }

  readEnergy(dt) {
    const m = appState.music;
    if (m && m.audio && !m.paused && this.ENV) {
      const cur = this.envAt(m.audio._trackName, m.audio.currentTime || 0);
      if (m.outgoing && m.outgoing._trackName) {
        const p = m.crossP == null ? 1 : m.crossP;
        const out = this.envAt(m.outgoing._trackName, m.outgoing.currentTime || 0);
        if (cur != null && out != null) return (1 - p) * out + p * cur;
      }
      if (cur != null) return cur;
    }
    this.idleT += dt;
    return 0.28 + 0.09 * Math.sin(this.idleT * 0.5); // calm idle breath
  }

  // discrete onset cue: fire when we cross an onset time in the current track
  onsetHit(name, t) {
    const ENV = this.ENV;
    if (!ENV || !ENV.tracks[name]) return false;
    if (name !== this.lastTrack) { this.lastTrack = name; this.lastOnsetIdx = -1; }
    const on = ENV.tracks[name].onsets;
    let hit = false;
    while (this.lastOnsetIdx + 1 < on.length && on[this.lastOnsetIdx + 1] <= t) { this.lastOnsetIdx++; hit = true; }
    return hit;
  }

  buildScene() {
    const THREE = this.THREE;
    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
    // A lost GL context (common after iOS backgrounding) would otherwise freeze a
    // dead/black backdrop; drop to the CSS fog fallback instead.
    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); this.floor(); }, false);
    this.renderer.setPixelRatio(TIERS[this.tier].dpr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    // correct colour + tone mapping so the mecha's PBR chrome reads (without
    // these it renders near-black); mild exposure keeps the haze/glow intact.
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.sceneTextures = [];
    this.fog = new THREE.FogExp2(0x05060a, 0.072); // denser haze → motes funnel out of black
    this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 600); // far covers a deep DANCER.z
    this.camera.position.set(0, 0, 0);

    const N = TIERS[this.tier].motes;
    this.positions = new Float32Array(N * 3);
    this.speeds = new Float32Array(N);
    const colors = new Float32Array(N * 3);
    const DEPTH = 90;
    for (let i = 0; i < N; i++) {
      this.resetMote(i, DEPTH, true);
      // "Light is rare": the field is cool near-white dust; only ~10% carries a
      // faint cyan tint. The one earned light is the central glow, not confetti.
      const cyan = Math.random() < 0.1;
      colors[i * 3] = cyan ? 0.35 : 0.80;
      colors[i * 3 + 1] = cyan ? 0.80 : 0.85;
      colors[i * 3 + 2] = cyan ? 0.92 : 0.92;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.85,
      map: this.moteTexture(), alphaTest: 0.01,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.userData.depth = DEPTH;
    this.scene.add(this.motes);

    // Near-plane BOKEH: a handful of big, very soft, low-opacity discs give a
    // focal plane so depth reads as size+blur variance (not a flat starfield).
    const BN = Math.round(TIERS[this.tier].motes / 90) + 8;
    const bpos = new Float32Array(BN * 3);
    for (let i = 0; i < BN; i++) {
      bpos[i * 3] = (Math.random() - 0.5) * 24;
      bpos[i * 3 + 1] = (Math.random() - 0.5) * 44;
      bpos[i * 3 + 2] = -3 - Math.random() * 16;
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    this.bokeh = new THREE.Points(bgeo, new THREE.PointsMaterial({
      size: 8, map: this.moteTexture(), color: 0xbfe9ff, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.scene.add(this.bokeh);

    // The single accent glow, the convergence point the tunnel funnels toward:
    // a wide soft cyan bloom + a tight hot white core (clearly the brightest,
    // most saturated event in the frame).
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: 0x22d3ee, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.scale.set(46, 46, 1);
    this.glow.position.set(0, 0, -74);
    this.scene.add(this.glow);
    this.glowCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: 0xd8fbff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glowCore.scale.set(12, 12, 1);
    this.glowCore.position.set(0, 0, -70);
    this.scene.add(this.glowCore);

    this.buildFlashCluster();

    // The drop dancer (mecha glTF) is instanced once loaded; on a governor
    // rebuild its lights/env and instances are recreated for the new scene.
    this.dancers = [];
    if (this.mechaLoading || this.mechaTemplate) this.setupMechaScene();
    if (this.mechaTemplate) this.fitAndAddDancers();
  }

  // Lights + a studio env for the mecha's PBR chrome. Recreated per build (a
  // PMREM env texture is bound to the renderer/context, so it can't be cached
  // across a rebuild). Guarded to run once per scene.
  setupMechaScene() {
    const THREE = this.THREE;
    if (!this.scene || !this.renderer || this.scene.userData.lit) return;
    this.scene.userData.lit = true;
    const dir = new THREE.DirectionalLight(0xbfe9ff, 3.2); dir.position.set(3, 6, 4); this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0x88b0ff, 1.4); fill.position.set(-4, 1, 3); this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0x33445a, 0.8));
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const src = this.makeEnvTexture();
      const env = pmrem.fromEquirectangular(src).texture;
      this.scene.environment = env;
      this.sceneTextures.push(env);
      src.dispose();
      pmrem.dispose();
    } catch (e) { /* env optional */ }
  }

  // place a mote on a tunnel ring at a given depth
  resetMote(i, depth, anywhere) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 6 + Math.random() * 7;                 // tunnel radius band
    this.positions[i * 3] = Math.cos(ang) * rad;
    this.positions[i * 3 + 1] = Math.sin(ang) * rad;
    this.positions[i * 3 + 2] = anywhere ? -Math.random() * depth : -depth;
    this.speeds[i] = 0.5 + Math.random() * 0.9;
  }

  // soft round bokeh dot so motes read as light haze, not hard squares
  moteTexture() {
    const THREE = this.THREE;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; this.sceneTextures.push(t); return t;
  }

  // A self-contained studio environment (no external RoomEnvironment script):
  // a vertical gradient — cool light from above, cyan mid, dark floor — so the
  // mecha's chrome reflects in-palette light and never renders black.
  makeEnvTexture() {
    const THREE = this.THREE;
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

  glowTexture() {
    const THREE = this.THREE;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.3, 'rgba(120,230,255,0.6)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; this.sceneTextures.push(t); return t;
  }

  // ── Flash-cut geometric accent (user-directed reference-reel inspiration) ──
  // A rotating cyan wireframe polyhedron cluster + a logarithmic spiral, hard-
  // cutting which one is dominant on every music onset — inspired by a reel
  // the user shared (rotating low-poly cluster, spiral motif, flash-cut edit
  // rhythm), recolored to this skin's obsidian+cyan palette only (no
  // synthwave/multi-hue import — see docs/techno-variant.md Aesthetic Lane).
  //
  // FLASH-SAFETY EXCEPTION, scoped to this element ONLY: unlike the accent
  // glow/motes/haze above (all rate-limited to ≤50 full-viewport brightness
  // changes/sec, docs/techno-variant.md "Flash safety"), this cluster's onset
  // pulse is intentionally uncapped — the user explicitly asked for true
  // flash-cut intensity here after being warned twice about the
  // photosensitive-seizure tradeoff, and confirmed the decision. Nothing else
  // in this file's rate-limiting changed. reduced-motion still fully disables
  // this (initLightshow returns before any of this instance is created).
  buildFlashCluster() {
    const THREE = this.THREE;
    if (this.tier === 0) return; // perf ladder: skip entirely on the lowest device tier
    this.flashGrp = new THREE.Group();
    this.flashGrp.position.set(0, 0, -30); // close enough to camera to read as a real focal shape,
    // not just haze — the accent glow already owns -70..-74, so this sits well in front of it
    const RADII = this.tier === 2 ? [4.6, 3.4, 2.4] : [3.9, 2.7];
    this.flashPolys = RADII.map((r, i) => {
      const geo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(r, 1)); // detail 1: more edges read as a "cluster", not a single diamond
      const mat = new THREE.LineBasicMaterial({
        color: 0x8fe9ff, transparent: true, opacity: 0.16, fog: false,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.LineSegments(geo, mat);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      mesh.userData.spin = 0.15 + i * 0.07;
      this.flashGrp.add(mesh);
      return mesh;
    });
    // logarithmic spiral, a single open polyline, cyan, additive
    const SPIRAL_PTS = 160, TURNS = 3.2;
    const spts = [];
    for (let i = 0; i <= SPIRAL_PTS; i++) {
      const t = i / SPIRAL_PTS, ang = t * TURNS * Math.PI * 2, rad = 0.4 + t * 4.6;
      spts.push(new THREE.Vector3(Math.cos(ang) * rad, Math.sin(ang) * rad, 0));
    }
    const sgeo = new THREE.BufferGeometry().setFromPoints(spts);
    this.flashSpiralMat = new THREE.LineBasicMaterial({
      color: 0x8fe9ff, transparent: true, opacity: 0.85, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.flashSpiral = new THREE.Line(sgeo, this.flashSpiralMat);
    this.flashGrp.add(this.flashSpiral);
    this.scene.add(this.flashGrp);
  }

  // ── The cyber mecha dancer (glTF/Draco) ─────────────────────────────
  // Lazy-loaded after ignition. Lights + a studio env (in setupMechaScene, per
  // build) make its chrome read. Placed on the side (desktop) / centre (mobile)
  // via the DANCER config, sized to real screen pixels by fitToPixels. Currently
  // visible whenever ignited (target = ignite); it fades in on the tap and spins.
  // ── Dancer placement — tweak DANCER (module const) ──
  // size = on-screen height as a fraction of the real screen pixels (bigger = closer).
  // z = depth into the tunnel (more negative = deeper/farther). y = vertical
  // offset in world units (+up/-down). x is the horizontal offset in world units:
  // xDesktop puts it out to the side on wide screens, xMobile on phones (0 = centre).
  ensureMecha() {
    const THREE = this.THREE;
    // The kinetic skin ships its OWN procedural wireframe dancer (kinetic-dancer.js)
    // as the side figure, so suppress the Regency/techno solid mecha there.
    if (document.documentElement.dataset.variant === 'kinetic') return;
    if (this.mechaLoading || this.mechaTemplate || !THREE.GLTFLoader || !this.renderer) return; // load on all tiers
    this.mechaLoading = true;
    this.setupMechaScene(); // lights + env on the current scene (idempotent)
    try {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      const loader = new THREE.GLTFLoader(); loader.setDRACOLoader(draco);
      loader.load('assets/scene/mecha.glb', (g) => {
        const o = g.scene;
        o.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(o);
        const size = box.getSize(new THREE.Vector3());
        this.mechaRawH = size.y || 1;
        this.mechaCenter = box.getCenter(new THREE.Vector3()); // recenter per-instance after scaling
        this.mechaTemplate = o;
        this.fitAndAddDancers();
        this.state.mechaReady = true;
      }, undefined, () => { this.mechaLoading = false; });
    } catch (e) { this.mechaLoading = false; }
  }

  // Measure the model's ACTUAL projected pixel height on screen and scale it to
  // a target pixel size (fraction of the real innerHeight). Iterates so it lands
  // exactly, regardless of the model's internal glTF transform or its depth.
  fitToPixels(grp, pivot, targetPxH) {
    const corner = new this.THREE.Vector3();
    for (let iter = 0; iter < 4; iter++) {
      grp.updateMatrixWorld(true);
      const box = new this.THREE.Box3().setFromObject(pivot);
      if (box.isEmpty()) break;
      let ymin = Infinity, ymax = -Infinity;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        corner.project(this.camera);
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
  fitAndAddDancers() {
    const THREE = this.THREE;
    if (!this.mechaTemplate || !this.scene || !this.camera) return;
    this.dancers = [];
    const vh = 2 * Math.abs(DANCER.z) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const portrait = this.camera.aspect < 1;                    // phone → centre; desktop → side
    const xMag = portrait ? DANCER.xMobile : DANCER.xDesktop;   // horizontal offset (world units)
    const targetPxH = DANCER.size * window.innerHeight;         // paint to real screen pixels
    const sides = portrait ? [1] : (this.tier === 2 ? [-1, 1] : [1]);
    for (const sd of sides) {
      const inner = this.mechaTemplate.clone(true);
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
      this.fitToPixels(grp, pivot, targetPxH);                 // refine to exact target screen pixels
      grp.visible = false;
      this.scene.add(grp);
      this.dancers.push({ grp, inst: inner, spin: pivot, mats, side: sd, k: 0, baseY: DANCER.y });
    }
  }

  // ---- FPS governor: measure real frame times, degrade or floor ----
  govern(dt) {
    if (!this.measuring) return;
    this.sampleAcc += dt; this.sampleFrames++;
    if (this.sampleAcc < 2) return;               // measure ~2s per scene
    const fps = this.sampleFrames / this.sampleAcc;
    if (fps < 40 && this.tier > 0) { this.tier--; this.rebuild(); }
    else if (fps < 24) { this.floor(); }
    else { this.measuring = false; }              // headroom is fine, stop measuring
    this.sampleAcc = 0; this.sampleFrames = 0;
  }

  rebuild() {
    this.disposeGL();
    this.buildScene();
    this.measuring = true; this.sampleAcc = 0; this.sampleFrames = 0;
  }

  floor() {
    this.floored = true; this.measuring = false;
    this.state.drop = 0;              // don't strand the MilkDrop viz visible
    // the RAF is about to stop — clear the white flash so a mid-flash frame
    // can't freeze a full-white sheet over the CSS-fog fallback
    this.flashOpacity = 0; this.lastFlashWritten = 0; this.flashEl.style.opacity = '0';
    // reset the beat-reactive CSS vars to their calm defaults — the RAF that
    // drives them is about to stop, so otherwise a frozen beat glow + lifted
    // vignette would persist over the CSS fog
    // Write the calm defaults AND sync the quantize trackers, so the skip-no-op
    // guard in frame() can never later suppress a needed write back to these.
    const rs = document.documentElement.style;
    rs.setProperty('--beat', '0.00'); this.lastBQ = '0.00';
    rs.setProperty('--energy', '0.30'); this.lastEQ = '0.30';
    rs.setProperty('--drop', '0.00'); this.lastDQ = '0.00';
    this.disposeGL();
    const amb = $('#ambient'); if (amb) amb.style.display = '';   // CSS fog stands in
    this.canvas.style.display = 'none';
  }

  disposeGL() {
    if (this.motes) { this.motes.geometry.dispose(); this.motes.material.dispose(); }
    if (this.bokeh) { this.bokeh.geometry.dispose(); this.bokeh.material.dispose(); }
    if (this.glow) this.glow.material.dispose();
    if (this.glowCore) this.glowCore.material.dispose();
    for (const mesh of this.flashPolys) { mesh.geometry.dispose(); mesh.material.dispose(); }
    if (this.flashSpiral) { this.flashSpiral.geometry.dispose(); this.flashSpiralMat.dispose(); }
    this.flashGrp = null; this.flashPolys = []; this.flashSpiral = null; this.flashSpiralMat = null;
    // dancers share the template's GEOMETRY (clone(true) copies geometry by
    // reference) — dispose only the per-instance cloned materials, never the
    // shared geometry (that would break the template on the next rebuild).
    for (const d of this.dancers) { for (const mm of d.mats) mm.dispose(); }
    this.dancers = [];
    for (const t of this.sceneTextures) { try { t.dispose(); } catch (e) {} }
    this.sceneTextures = [];
    if (this.renderer) { this.renderer.dispose(); }
    this.scene = this.motes = this.bokeh = this.glow = this.glowCore = null;
  }

  // ---- main loop ----
  frame(ts) {
    if (!this.running || this.floored) return;
    const now = ts / 1000;
    const dt = this.last ? Math.min(0.05, now - this.last) : 0.016;
    this.last = now;
    this.govern(dt);
    if (this.floored) return;

    // ignition: dormant before the tap (a quiet tease), surging to full over
    // ~1.5s when appState.ignited flips — the tap IS the drop / the surprise.
    this.ignite += ((appState.ignited ? 1 : 0) - this.ignite) * 0.03;
    const ignite = this.ignite;

    // energy → smoothed drive, then damped by ignition so pre-tap stays quiet
    const eRaw = this.readEnergy(dt);
    this.smoothE += (eRaw - this.smoothE) * 0.15;
    const e = this.smoothE * (0.13 + 0.87 * ignite);
    this.state.energy = e;

    // onset burst → beat spike (decays); only meaningful once ignited
    let burst = 0;
    const m = appState.music;
    if (m && m.audio && !m.paused) burst = this.onsetHit(m.audio._trackName, m.audio.currentTime || 0) ? 1 : 0;
    this.beat = Math.max(this.beat * 0.9, burst * ignite); // linger a little so the shimmer reads
    const beat = this.beat;

    // expose to the DOM for beat-reactive UI (small-area glow only → flash-safe)
    // Quantize + skip no-op writes: each :root custom-prop write forces a
    // document-wide style recalc (plus the text-shadow repaints those vars
    // drive), so only touch the DOM when the bucketed value actually changes.
    // 0.02 steps are imperceptible in the glow/shimmer.
    const eq = (Math.round(e * 50) / 50).toFixed(2);
    const bq = (Math.round(beat * 50) / 50).toFixed(2);
    if (eq !== this.lastEQ) { this.rootStyle.setProperty('--energy', eq); this.lastEQ = eq; }
    if (bq !== this.lastBQ) { this.rootStyle.setProperty('--beat', bq); this.lastBQ = bq; }

    // drop level: rises in SUSTAINED loud/high-energy sections, eases out in the
    // quiet — drives the MilkDrop viz (only on drops). Hysteresis avoids
    // threshold dithering; NO per-beat spike (that strobed the full-field layer,
    // a flash risk), so both edges stay smoothly rate-limited like the glow.
    const dropTarget = e > (this.dropLevel > 0.5 ? 0.46 : 0.62) ? 1 : 0; // Schmitt trigger
    this.dropLevel += (dropTarget - this.dropLevel) * (dropTarget > this.dropLevel ? 0.06 : 0.03); // ≤ ~0.06/frame
    this.state.drop = this.dropLevel;

    // advance motes toward camera; recycle past the near plane
    const depth = this.motes.userData.depth;
    const spd = (5 + e * 30 + beat * 16) * dt;
    for (let i = 0; i < this.speeds.length; i++) {
      this.positions[i * 3 + 2] += this.speeds[i] * spd;
      if (this.positions[i * 3 + 2] > 2) this.resetMote(i, depth, false);
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.motes.material.size = 0.4 + e * 0.5;

    // ── DROP DANCER: the mecha appears ONLY on a big drop, on the side ──
    if (appState.ignited) this.ensureMecha();
    let dancerK = 0;
    if (this.dancers.length) {
      for (const d of this.dancers) {
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
    const dq = (Math.round(dancerK * 50) / 50).toFixed(2);
    if (dq !== this.lastDQ) { this.rootStyle.setProperty('--drop', dq); this.lastDQ = dq; }
    const haze = 1 - 0.3 * dancerK; // milder dim since the dancer is always up for now
    this.motes.material.opacity = (0.4 + e * 0.5) * haze;

    // accent glow: rate-limit brightness change (flash safety backstop)
    const targetGlow = 0.2 + e * 0.6 + beat * 0.12;
    this.glowBright += Math.max(-0.05, Math.min(0.05, targetGlow - this.glowBright)); // ≤0.05/frame
    this.glow.material.opacity = this.glowBright * 0.7 * (0.35 + 0.65 * ignite) * haze;
    this.glowCore.material.opacity = (0.3 + this.glowBright * 0.5) * (0.3 + 0.7 * ignite);
    this.glow.position.z = this.glowCore.position.z = -72 + Math.sin(now * 0.2) * 6;
    this.glow.material.rotation += 0.002;

    // flash-cut cluster: continuous rotation, hard-cut dominance swap on onset
    // (uncapped pulse — see the flash-safety exception at buildFlashCluster).
    if (this.flashGrp) {
      for (const mesh of this.flashPolys) {
        mesh.rotation.x += mesh.userData.spin * dt * (0.6 + e);
        mesh.rotation.y += mesh.userData.spin * 0.7 * dt * (0.6 + e);
      }
      this.flashSpiral.rotation.z += 0.12 * dt * (0.6 + e);
      if (burst && appState.ignited) {
        this.flashDominant = 1 - this.flashDominant;         // HARD CUT, no ease
        this.flashPulse = 1;
        for (const mesh of this.flashPolys) mesh.rotation.x += (Math.random() - 0.5) * 2.4; // jump, not a tween
      }
      this.flashPulse *= 0.80; // fast, uncapped decay (flash-safety exception)
      const polyOp = (this.flashDominant === 0 ? 0.85 : 0.12) + this.flashPulse * 0.6;
      const spiralOp = (this.flashDominant === 1 ? 0.85 : 0.12) + this.flashPulse * 0.5;
      for (const mesh of this.flashPolys) mesh.material.opacity = Math.min(1, polyOp);
      this.flashSpiralMat.opacity = Math.min(1, spiralOp);
      this.flashGrp.visible = ignite > 0.02; // dormant pre-tap, like the drop dancer
    }

    // ── FULL-SCREEN WHITE FLASH ── fire on a drop onset, HARD-CAPPED ≤50/sec ──
    // Cap enforced by the FlashGovernor (flash-cap.js MIN_FLASH_INTERVAL_S floor).
    // An onset that arrives inside the floor is dropped, so no BPM can push the
    // rate past the cap.
    if (burst && appState.ignited && e >= FLASH_ENERGY_GATE && this.flashGov.allow(now)) {
      const tint = this.flashTint(e);   // white on normal drops, cyan on the heaviest upbeats
      if (tint !== this.lastFlashColor) { this.flashEl.style.background = tint; this.lastFlashColor = tint; }
      this.flashOpacity = FLASH_PEAK;   // full peak
      this.flashGov.fire(now);          // opens the rate-cap window
    }
    this.flashOpacity = Math.max(0, this.flashOpacity - FLASH_DECAY_PER_S * dt); // visual fade only
    const fq = this.flashOpacity < 0.01 ? 0 : this.flashOpacity;
    if (fq !== this.lastFlashWritten) { this.flashEl.style.opacity = fq.toFixed(3); this.lastFlashWritten = fq; }

    // subtle camera parallax + fog breathing
    this.camera.position.x = Math.sin(now * 0.13) * 0.7;
    this.camera.position.y = Math.cos(now * 0.11) * 0.5;
    this.camera.lookAt(0, 0, -60);
    this.fog.density = 0.058 + (1 - e) * 0.02;

    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  }

  onResize() {
    if (this.floored || !this.renderer) return;
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
  }

  start() { if (!this.running && !this.floored) { this.running = true; this.last = 0; this.raf = requestAnimationFrame(this.frame); } }
  stop() {
    this.running = false; cancelAnimationFrame(this.raf);
    // clear any in-progress flash so a hidden/paused tab can't freeze a white
    // sheet, and returning to the tab never shows a stale flash
    this.flashOpacity = 0; this.lastFlashWritten = 0; this.flashEl.style.opacity = '0';
  }

  // ---- boot the show (build the scene, wire listeners, retire the CSS fog) ----
  run() {
    if (!this.THREE) return; // CSS #ambient fog stays visible as the static fallback
    try {
      this.buildScene();
    } catch (e) { this.floor(); return; }
    window.addEventListener('resize', () => this.onResize(), { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else this.start(); });

    const amb = $('#ambient'); if (amb) amb.style.display = 'none'; // JS show live → retire CSS fog
    this.raf = requestAnimationFrame(this.frame);
  }
}

export function initLightshow() {
  if (REDUCED) return;                                   // static poster path
  if (document.documentElement.dataset.skin !== 'techno') return;
  const canvas = $('#lightshow');
  if (!canvas) return;
  // NB: the window.THREE guard lives inside run() (not here) so the instance's
  // constructor still sets appState.lightshow + creates the flash overlay +
  // kicks the envelope fetch even when three.js is absent — matching the
  // original ordering, where those side effects preceded the THREE bail-out.
  new LightShow(canvas).run();
}
