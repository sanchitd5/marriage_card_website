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

  let ctx, viz, presets = [], pi = 0, running = false, raf = 0, cycleTimer = 0, lastOp = -1;

  function setup() {
    if (viz) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    let sink; // silent node — butterchurn needs an audio input, but we never
    try { sink = ctx.createGain(); sink.gain.value = 0; } catch (e) {} // route the music
    const dpr = Math.min(1.0, window.devicePixelRatio || 1); // cap DPR (perf)
    try {
      viz = BC.createVisualizer(ctx, canvas, { width: innerWidth, height: innerHeight, pixelRatio: dpr, textureRatio: 1 });
      if (sink) viz.connectAudio(sink);
    } catch (e) { viz = null; if (ctx.close) ctx.close().catch(() => {}); return false; }
    try {
      const all = BP.getPresets();
      presets = Object.keys(all).map((k) => all[k]);
      for (let i = presets.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [presets[i], presets[j]] = [presets[j], presets[i]]; }
      if (presets.length) viz.loadPreset(presets[0], 0);
    } catch (e) { /* presets optional */ }
    // only advance presets while the viz is actually visible (a drop is up)
    cycleTimer = setInterval(() => {
      const d = (appState.lightshow && appState.lightshow.drop) || 0;
      if (!running || d < EPS || !presets.length) return;
      pi = (pi + 1) % presets.length;
      try { viz.loadPreset(presets[pi], BLEND); } catch (e) {}
    }, PRESET_SECONDS * 1000);
    return true;
  }

  function start() {
    if (running) return;
    if (!viz && !setup()) return;
    running = true;
    (function loop() {
      if (!running) return;
      const d = Math.min(1, (appState.lightshow && appState.lightshow.drop) || 0);
      const op = d < EPS ? 0 : +(MAX_OPACITY * d).toFixed(3);
      if (op !== lastOp) { canvas.style.opacity = op; lastOp = op; } // write only on change
      if (op > 0) { try { viz.render(); } catch (e) {} } // render only when it shows pixels
      raf = requestAnimationFrame(loop);
    })();
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  start();
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  window.addEventListener('resize', () => { if (viz) { try { viz.setRendererSize(innerWidth, innerHeight); } catch (e) {} } }, { passive: true });
}
