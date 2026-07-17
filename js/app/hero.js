import { REDUCED, $, $$ } from './dom.js';
import { appState } from './state.js';

export function startHeroVideo() {
  const v = $('#hero-video');
  const poster = $('.hero-poster');
  if (!v || !poster) return;
  if (REDUCED) {
    poster.classList.add('is-visible');
    return; // poster only, no autoplaying video
  }

  const reveal = () => {
    poster.classList.remove('is-visible', 'kenburns');
    if (window.gsap) window.gsap.to(v, { opacity: 1, duration: 1.2 });
    else v.style.opacity = '1';
  };

  const armInteractionRetry = () => {
    const retry = () => {
      const rp = v.play();
      if (rp && rp.then) rp.then(reveal).catch(() => {});
      else reveal();
    };
    window.addEventListener('pointerdown', retry, { once: true, passive: true });
    window.addEventListener('keydown', retry, { once: true });
  };

  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  const p = v.play();
  if (p && p.then) {
    p.then(reveal)
      .catch(() => {
        poster.classList.add('is-visible');
        poster.classList.add('kenburns');
        armInteractionRetry();
      });
  } else {
    reveal();
  }
}

export function heroEntrance(instant) {
  if (instant || REDUCED || !window.gsap) {
    $$('.hero-seq').forEach(el => { el.style.opacity = 1; });
    return;
  }

  gsap.set('.hero-seq', { opacity: 1 }); // hand control from CSS to the timeline
  // script names animate as whole words: per-letter splitting breaks cursive joins
  gsap.timeline({ defaults: { ease: 'luxe' } })
    .from('.hero .kicker', { y: 26, autoAlpha: 0, duration: 1.3 }, 0.6)
    .from('.hero-name', { y: 50, autoAlpha: 0, scale: .96, duration: 1.7, stagger: 0.25 }, 0.8)
    .from('.hero-amp', { scale: 0, autoAlpha: 0, duration: 1.2, ease: 'back.out(1.4)' }, 1.4)
    .from('.hero-date', { y: 22, autoAlpha: 0, duration: 1.4 }, 1.7)
    .from('.hero-tag', { y: 16, autoAlpha: 0, duration: 1.2 }, 1.95)
    .from('.scroll-cue', { autoAlpha: 0, duration: 1.1 }, 2.4)
    .call(() => { if (appState.doSparkleReveal) gsap.delayedCall(0.5, appState.doSparkleReveal); });
}
