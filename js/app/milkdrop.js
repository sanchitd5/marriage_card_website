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

const PRESET_SECONDS = 14;   // change preset every N seconds (while visible)
const BLEND = 5.5;           // preset crossfade seconds
const MAX_OPACITY = 0.6;     // opacity at a full drop
const EPS = 0.02;            // below this the layer is effectively hidden

// The visualizer as an object: it owns its own AudioContext + butterchurn viz +
// preset carousel + RAF, and exposes a start/stop lifecycle the page toggles on
// tab-visibility. The butterchurn (BC) + presets (BP) libraries are resolved and
// gated by initMilkdrop() below and handed in, so the class body assumes them
// present — everything that can decline (reduced-motion, wrong skin, weak GPU,
// missing CDN lib) is a guard in the factory, not a branch in here.
class Milkdrop {
  constructor(canvas, BC, BP) {
    this.canvas = canvas;
    this.BC = BC;
    this.BP = BP;
    this.ctx = null;
    this.viz = null;
    this.presets = [];
    this.pi = 0;
    this.running = false;
    this.raf = 0;
    this.cycleTimer = 0;
    this.lastOp = -1;
  }

  setup() {
    if (this.viz) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    let sink; // silent node — butterchurn needs an audio input, but we never
    try { sink = this.ctx.createGain(); sink.gain.value = 0; } catch (e) {} // route the music
    const dpr = Math.min(1.0, window.devicePixelRatio || 1); // cap DPR (perf)
    try {
      this.viz = this.BC.createVisualizer(this.ctx, this.canvas, { width: innerWidth, height: innerHeight, pixelRatio: dpr, textureRatio: 1 });
      if (sink) this.viz.connectAudio(sink);
    } catch (e) { this.viz = null; if (this.ctx.close) this.ctx.close().catch(() => {}); return false; }
    try {
      const all = this.BP.getPresets();
      this.presets = Object.keys(all).map((k) => all[k]);
      for (let i = this.presets.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [this.presets[i], this.presets[j]] = [this.presets[j], this.presets[i]]; }
      if (this.presets.length) this.viz.loadPreset(this.presets[0], 0);
    } catch (e) { /* presets optional */ }
    return true;
  }

  start() {
    if (this.running) return;
    if (!this.viz && !this.setup()) return;
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
      const op = d < EPS ? 0 : +(MAX_OPACITY * d).toFixed(3);
      if (op !== this.lastOp) { this.canvas.style.opacity = op; this.lastOp = op; } // write only on change
      if (op > 0) { try { this.viz.render(); } catch (e) {} } // render only when it shows pixels
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.cycleTimer) { clearInterval(this.cycleTimer); this.cycleTimer = 0; } // don't leak the preset-cycle interval on hidden tabs / after a floor
  }

  resize() {
    if (this.viz) { try { this.viz.setRendererSize(innerWidth, innerHeight); } catch (e) {} }
  }
}

export function initMilkdrop() {
  if (REDUCED) return;
  if (document.documentElement.dataset.skin !== 'techno') return;
  const canvas = $('#milkdrop');
  if (!canvas) return;
  // Skip the weakest devices — butterchurn is a second full-screen WebGL context.
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (cores < 4 || mem < 4) return;
  const BC = window.butterchurn && (window.butterchurn.createVisualizer ? window.butterchurn : window.butterchurn.default);
  const BP = window.butterchurnPresets && (window.butterchurnPresets.getPresets ? window.butterchurnPresets : window.butterchurnPresets.default);
  if (!BC || !BP || typeof BC.createVisualizer !== 'function') return;

  const milkdrop = new Milkdrop(canvas, BC, BP);
  milkdrop.start();
  document.addEventListener('visibilitychange', () => { if (document.hidden) milkdrop.stop(); else milkdrop.start(); });
  window.addEventListener('resize', () => milkdrop.resize(), { passive: true });
}
