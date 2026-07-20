/* Riya & Sanchit · Shubh Vivah — kinetic entry (saifullah "precision console") */

// Kinetic is a TECHNO-based skin: the heavy engines (light show, milkdrop,
// scratch foil, gallery veil, audio) are the shared techno modules, reached via
// data-skin="techno". Only the console layer (gate + scramble + cursor + HUD)
// is kinetic-specific. This entry mirrors main.js's structure with that swap:
// no initGate/initGsap (kinetic owns its own), no initTheme (dark-only), no
// initPetals (no petals).

import { buildGallery } from './app/gallery.js';
import { initScratch } from './app/scratch.js';
import { initLightshow } from './app/lightshow.js';
import { initMilkdrop } from './app/milkdrop.js';
import { initKinetic, initKineticGate } from './app/kinetic.js';
import { initKineticDancer } from './app/kinetic-dancer.js';
import { initKineticVideo } from './app/kinetic-video.js';
import {
  initCountdown,
  initCalendarButtons,
  initScrollCue,
  initMusicToggle,
  initMusicSwitcher,
  initFullscreenToggle,
  initTilt,
} from './app/ui.js';

// DOM-ready execution order preserved from main.js (kinetic init set).
buildGallery();
initMusicToggle();
initMusicSwitcher();
initFullscreenToggle();
initCountdown();
initScratch();
initCalendarButtons();
initScrollCue();
initKineticGate();   // console gate: scroll-lock + boot sequence + reveal

window.addEventListener('DOMContentLoaded', () => {
  initKinetic();     // ScrollSmoother + fade-up + scramble + cursor + HUD + magnetic
  initLightshow();   // techno light show (data-skin==='techno' → runs)
  initMilkdrop();    // no-ops if butterchurn CDN absent
  initTilt();        // vanilla-tilt on the event cards ([data-tilt])
  initKineticDancer(); // persistent side wireframe humanoid, dances to the music (own canvas)
  initKineticVideo();  // theme-8 (Taratata) fullscreen visualizer takeover at authored beats
});
