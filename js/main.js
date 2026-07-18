/* Riya & Sanchit · Shubh Vivah — site engine (modular) */

import { buildGallery } from './app/gallery.js';
import { initGsap } from './app/animations.js';
import { initGate } from './app/gate.js';
import { initScratch } from './app/scratch.js';
import { initLightshow } from './app/lightshow.js';
import {
  initCountdown,
  initCalendarButtons,
  initPetals,
  initTheme,
  initTilt,
  initScrollCue,
  initMusicToggle,
  initFullscreenToggle,
} from './app/ui.js';

// DOM-ready execution order preserved from the original single-file script.
buildGallery();
initMusicToggle();
initFullscreenToggle();
initCountdown();
initScratch();
initCalendarButtons();
initScrollCue();
initGate();
initTheme();

window.addEventListener('DOMContentLoaded', () => {
  initGsap();
  initPetals();      // no-ops on the techno skin (no tsParticles / #tsparticles)
  initLightshow();   // no-ops off the techno skin (guards on data-skin + #lightshow)
  initTilt();
});
