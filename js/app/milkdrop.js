import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';

// ── MilkDrop visualizer (butterchurn) ──────────────────────────────────
// A classic Winamp-style MilkDrop viz as a tinted background layer, reacting to
// the music and cycling presets every PRESET_SECONDS. Butterchurn needs a Web
// Audio graph, so each <audio> element ui.js plays is routed through a shared
// master gain → destination (and tapped for analysis). Degrades to nothing if
// the CDN lib is absent or WebGL/AudioContext is unavailable.
//
// Note: routing HTMLAudio through Web Audio means output follows the AudioContext
// (on iOS the ring/silent switch can mute it) — a known trade-off for live viz.

const PRESET_SECONDS = 14;   // change preset every N seconds
const BLEND = 5.5;           // preset crossfade seconds
const MAX_OPACITY = 0.6;     // opacity at a full drop (it only shows on hard drops)

export function initMilkdrop() {
  if (REDUCED) return;
  if (document.documentElement.dataset.skin !== 'techno') return;
  const canvas = $('#milkdrop');
  if (!canvas) return;

  const BC = window.butterchurn && (window.butterchurn.createVisualizer ? window.butterchurn : window.butterchurn.default);
  const BP = window.butterchurnPresets && (window.butterchurnPresets.getPresets ? window.butterchurnPresets : window.butterchurnPresets.default);
  if (!BC || !BP || typeof BC.createVisualizer !== 'function') return;

  let ctx, masterGain, viz, presets = [], pi = 0, running = false, raf = 0, cycleTimer = 0;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function setup() {
    if (viz || !ensureCtx()) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    try {
      viz = BC.createVisualizer(ctx, canvas, { width: innerWidth, height: innerHeight, pixelRatio: dpr, textureRatio: 1 });
      viz.connectAudio(masterGain);
    } catch (e) { viz = null; return; }
    try {
      const all = BP.getPresets();
      presets = Object.keys(all).map((k) => all[k]);
      for (let i = presets.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [presets[i], presets[j]] = [presets[j], presets[i]]; }
      if (presets.length) viz.loadPreset(presets[0], 0);
    } catch (e) { /* presets optional */ }
    cycleTimer = setInterval(() => {
      if (!running || !presets.length) return;
      pi = (pi + 1) % presets.length;
      try { viz.loadPreset(presets[pi], BLEND); } catch (e) {}
    }, PRESET_SECONDS * 1000);
    startLoop();
  }

  function startLoop() {
    if (running || !viz) return;
    running = true;
    (function loop() {
      if (!running) return;
      try { viz.render(); } catch (e) {}
      // appear only on hard drops: opacity follows the light show's drop level
      const d = (appState.lightshow && appState.lightshow.drop) || 0;
      canvas.style.opacity = (MAX_OPACITY * d).toFixed(3);
      raf = requestAnimationFrame(loop);
    })();
  }
  function stopLoop() { running = false; cancelAnimationFrame(raf); }

  // ui.js calls this for each audio element it plays (two during a crossfade).
  // Route each element once into the shared graph so the viz reacts to the mix.
  appState.vizConnect = (audioEl) => {
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!viz) setup();
    if (!audioEl || audioEl._vizSrc) return;
    try { const s = ctx.createMediaElementSource(audioEl); audioEl._vizSrc = s; s.connect(masterGain); } catch (e) {}
  };

  window.addEventListener('resize', () => { if (viz) { try { viz.setRendererSize(innerWidth, innerHeight); } catch (e) {} } }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopLoop(); else if (viz) startLoop(); });
}
