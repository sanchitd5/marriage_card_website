import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';

// ── MilkDrop visualizer (butterchurn) ──────────────────────────────────
// A classic Winamp-style MilkDrop viz as a tinted background layer that surfaces
// ONLY on hard musical drops (opacity follows appState.lightshow.drop) and
// cycles presets. It does NOT tap the live music: routing HTMLAudio through Web
// Audio risked silencing playback (suspended context, iOS silent switch) and
// leaking source nodes, so butterchurn gets a silent analyser feed instead — its
// presets animate on their own time, and the drop-gating provides the "reacts to
// the music" feel. Degrades to nothing if the CDN lib / WebGL / AudioContext is
// unavailable. Off on reduced-motion, off the techno skin, off the weakest GPUs.
//
// Engine: @webamp/butterchurn (the maintained MIT fork — upstream butterchurn@2.6.7
// was last published 2019; the fork compiles preset EEL to WebAssembly, which is
// where its rendering win comes from). NOT projectM: libprojectM has no maintained
// WASM build (upstream closed both web-build requests as "not planned"), needs a
// local Emscripten cross-compile, and is LGPL-2.1 — and Emscripten can only link
// statically, so shipping it would drag a relink obligation onto a static site.
//
// Both libraries are LAZY — imported here after the guards in initMilkdrop() pass,
// not via <script> tags in the template. They are ~1.1 MB combined and the viz is
// declined outright on reduced-motion, off-skin, and weak GPUs, so eager tags were
// paying full freight for visitors who never see a pixel of it.
const BUTTERCHURN_URL = 'https://cdn.jsdelivr.net/npm/@webamp/butterchurn@3.0.0-beta.5/dist/butterchurn.min.js';
// `base` = the curated pack (~115 Flexi/Martin/Geiss/Rovastar presets). UMD, so it
// is loaded as a classic script and read off the global, not `import`ed.
const PRESETS_URL = 'https://cdn.jsdelivr.net/npm/butterchurn-presets@3.0.0-beta.4/dist/base.min.js';
const PRESETS_GLOBAL = 'base';

const PRESET_SECONDS = 14;   // change preset every N seconds (while visible)
const BLEND = 5.5;           // preset crossfade seconds
const MAX_OPACITY = 0.6;     // opacity at a full drop
const EPS = 0.02;            // below this the layer is effectively hidden

// The visualizer as an object: it owns its own AudioContext + butterchurn viz +
// preset carousel + RAF, and exposes a start/stop lifecycle the page toggles on
// tab-visibility. The butterchurn factory (BC) + the shuffled preset list are
// resolved and gated by initMilkdrop() below and handed in, so the class body
// assumes them present — everything that can decline (reduced-motion, wrong skin,
// weak GPU, no WebGL2, CDN unreachable) is a guard in the factory, not in here.
class Milkdrop {
  constructor(canvas, BC, presets) {
    this.canvas = canvas;
    this.BC = BC;
    this.ctx = null;
    this.viz = null;
    this.feedGain = null;
    this.presets = presets;
    this.pi = 0;
    this.running = false;
    this.raf = 0;
    this.cycleTimer = 0;
    this.lastOp = -1;
    this.resizeTimeoutId = 0;
    this.failedInit = false;
  }

  setup() {
    if (this.viz) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    // Synthetic feed: band-limited noise + sine. Real audio risked iOS silence.
    let feedGain;
    try {
      feedGain = this.ctx.createGain();
      feedGain.gain.value = 0;
      // 2s of noise, one-pole low-passed (a=0.1 → knee near 800 Hz at 48k) so the
      // presets' waveform reads as body rather than white-noise hiss.
      const sr = this.ctx.sampleRate || 48000, len = sr * 2;
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      let y = 0; const a = 0.1;
      for (let i = 0; i < len; i++) {
        const x = Math.random() * 2 - 1;
        y += (x - y) * a;
        data[i] = y;
      }
      // Loop the noise through feedGain.
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      noise.connect(feedGain);
      noise.start(0);
      // Mix in sub-bass sine (~55 Hz) at quieter gain.
      const sine = this.ctx.createOscillator();
      sine.frequency.value = 55;
      sine.type = 'sine';
      const sineGain = this.ctx.createGain();
      sineGain.gain.value = 0.2;
      sine.connect(sineGain);
      sineGain.connect(feedGain);
      sine.start(0);
      this.feedGain = feedGain;
    } catch (e) {} // synthetics optional, silent gain fallback OK
    const dpr = Math.min(1.0, window.devicePixelRatio || 1); // cap DPR (perf)
    try {
      this.viz = this.BC.createVisualizer(this.ctx, this.canvas, { width: innerWidth, height: innerHeight, pixelRatio: dpr, textureRatio: 1 });
      if (feedGain) this.viz.connectAudio(feedGain);
    } catch (e) { this.viz = null; if (this.ctx.close) this.ctx.close().catch(() => {}); this.ctx = null; this.failedInit = true; return false; }
    try { if (this.presets.length) this.viz.loadPreset(this.presets[0], 0); } catch (e) { /* presets optional */ }
    return true;
  }

  start() {
    if (this.running || this.failedInit) return;
    if (!this.viz && !this.setup()) return;
    try { const r = this.ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch (e) {} // suspended until a gesture; rejection is fine
    this.running = true;
    // (Re)arm the preset-cycle timer here rather than in setup() — stop() clears
    // it, and setup() only runs once, so this is what restores cycling on resume.
    // Only advances presets while the viz is actually visible (a drop is up).
    if (!this.cycleTimer) {
      this.cycleTimer = setInterval(() => {
        const d = (appState.lightshow && appState.lightshow.drop) || 0;
        if (!this.running || d < EPS || !this.presets.length) return;
        this.pi = (this.pi + 1) % this.presets.length;
        try { this.viz.loadPreset(this.presets[this.pi], BLEND); } catch (e) {}
      }, PRESET_SECONDS * 1000);
    }
    const loop = () => {
      if (!this.running) return;
      const d = Math.min(1, (appState.lightshow && appState.lightshow.drop) || 0);
      const level = (appState.lightshow && appState.lightshow.energy) || d; // energy drives feed, else drop
      const op = d < EPS ? 0 : +(MAX_OPACITY * d).toFixed(3);
      if (op !== this.lastOp) { this.canvas.style.opacity = op; this.lastOp = op; } // write only on change
      if (op > 0) {
        try { this.viz.render(); } catch (e) {} // render only when visible
        if (this.feedGain) this.feedGain.gain.value = Math.min(1, 0.15 + 0.85 * level); // feed energy level
      }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.cycleTimer) { clearInterval(this.cycleTimer); this.cycleTimer = 0; } // don't leak the preset-cycle interval on hidden tabs / after a floor
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); this.resizeTimeoutId = 0; }
  }

  resize() {
    if (this.resizeTimeoutId) clearTimeout(this.resizeTimeoutId);
    this.resizeTimeoutId = setTimeout(() => {
      this.resizeTimeoutId = 0;
      if (this.viz) { try { this.viz.setRendererSize(innerWidth, innerHeight); } catch (e) {} }
    }, 150);
  }
}

// Load a classic (non-module) script once. Used for the UMD preset pack, which
// has no ESM entry — importing it as a module would leave an empty namespace and
// only work by side effect, so ask for the script semantics it was built for.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { existing.dataset.loaded ? resolve() : existing.addEventListener('load', () => resolve(), { once: true }); return; }
    const s = document.createElement('script');
    s.src = src;
    s.addEventListener('load', () => { s.dataset.loaded = '1'; resolve(); }, { once: true });
    s.addEventListener('error', () => reject(new Error(`failed to load ${src}`)), { once: true });
    document.head.appendChild(s);
  });
}

// Flatten whatever the preset pack global turned out to be into a shuffled array.
// `base` is bundled from `export default presets`, so the UMD global is the webpack
// namespace ({default, __esModule}); the older packs exposed getPresets(). Accept
// all three shapes so a pack swap doesn't need a code change.
function collectPresets(g) {
  const map = (g && typeof g.getPresets === 'function' && g.getPresets()) || (g && g.default) || g;
  if (!map || typeof map !== 'object') return [];
  const list = Object.keys(map).map((k) => map[k]).filter(Boolean);
  for (let i = list.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

export async function initMilkdrop() {
  if (REDUCED) return;
  if (document.documentElement.dataset.skin !== 'techno') return;
  const canvas = $('#milkdrop');
  if (!canvas) return;
  // Skip the weakest devices — butterchurn is a second full-screen WebGL context.
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (cores < 4 || mem < 4) return;
  // butterchurn 3 is WebGL2-only. Probe before pulling ~1.1 MB over the wire.
  try { if (!document.createElement('canvas').getContext('webgl2')) return; } catch (e) { return; }
  if (!(window.AudioContext || window.webkitAudioContext)) return;

  let BC, presets;
  try {
    const [mod] = await Promise.all([import(BUTTERCHURN_URL), loadScript(PRESETS_URL)]);
    BC = mod.default && mod.default.createVisualizer ? mod.default : mod;
    presets = collectPresets(window[PRESETS_GLOBAL]);
  } catch (e) { return; } // CDN blocked / offline → no viz, page unaffected
  if (!BC || typeof BC.createVisualizer !== 'function' || !presets.length) return;

  const milkdrop = new Milkdrop(canvas, BC, presets);
  milkdrop.start();
  document.addEventListener('visibilitychange', () => { if (document.hidden) milkdrop.stop(); else milkdrop.start(); });
  window.addEventListener('resize', () => milkdrop.resize(), { passive: true });
}
