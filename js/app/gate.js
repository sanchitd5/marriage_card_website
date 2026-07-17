import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import { startMusic, attemptAutoFullscreen } from './ui.js';
import { startHeroVideo, heroEntrance } from './hero.js';
import { videoSuffix } from './net.js';

export function initGate() {
  const gateEl = $('#gate');
  if (!gateEl) return;

  const video = $('#gate-video');
  const gateCard = $('.gate-card');
  const seal = $('#seal');
  if (!video || !gateCard || !seal) return;

  document.body.style.overflow = 'hidden';
  // the invitation always opens from the top of the story
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  let opened = false;

  // wide (≥768px) breakpoint: serve 16:9 landscape assets for tablet/desktop
  const isWide = () => window.matchMedia('(min-width: 768px)').matches;

  // night mode gets its own candlelit gate art and reveal video
  appState.setGateTheme = theme => {
    if (opened) return;
    const n  = theme === 'dark' ? '-night' : '';
    const w  = isWide() ? '-wide' : '';
    const closedImg = $('.gate-still--closed');
    const openImg   = $('.gate-still--open');
    if (!closedImg || !openImg) return;
    closedImg.src = `assets/images/art-gate-closed${n}${w}.jpg`;
    openImg.src   = `assets/images/art-gate-open${n}${w}.jpg`;
    // also update the <source> inside the <picture> wrappers
    const closedSrc = closedImg.closest('picture')?.querySelector('source');
    const openSrc   = openImg.closest('picture')?.querySelector('source');
    if (closedSrc) closedSrc.srcset = `assets/images/art-gate-closed${n}-wide.jpg`;
    if (openSrc)   openSrc.srcset   = `assets/images/art-gate-open${n}-wide.jpg`;
    video.poster = `assets/images/art-gate-closed${n}${w}.jpg`;
    const src = video.querySelector('source');
    if (!src) return;
    const want = `assets/videos/gate-reveal${n || '-day'}${w}${videoSuffix()}.mp4`;
    if (!(src.getAttribute('src') || '').endsWith(want)) {
      src.setAttribute('src', want);
      video.load();
    }
  };
  appState.setGateTheme(document.documentElement.dataset.theme);

  // Start the hero video playing in the background immediately, behind the still
  // opaque gate. When the gate reveal fades out it uncovers an already-live clip
  // (no decode handoff at the transition = no end lag).
  startHeroVideo();

  // if the seal goes untapped, the invitation opens itself
  // (auto-open is not a user gesture, so music will wait for the toggle)
  const autoOpen = setTimeout(() => gateCard.click(), 8000);

  gateCard.addEventListener('click', () => {
    if (opened) return;
    opened = true;
    clearTimeout(autoOpen);
    seal.classList.add('opened'); // stop the pulse so the crack animation owns the transform
    if (appState.sealPulse) { appState.sealPulse.kill(); appState.sealPulse = null; }
    if (appState.sealRipple) { appState.sealRipple.kill(); appState.sealRipple = null; }
    window.scrollTo(0, 0);
    if (appState.smoother) appState.smoother.scrollTop(0);
    attemptAutoFullscreen();
    startMusic(); // inside the user gesture: unlocks audio autoplay policy
    startHeroVideo(); // gesture-backed retry in case background autoplay was blocked

    if (REDUCED || !window.gsap) {
      finish(true);
      return;
    }

    gsap.timeline()
      .to('.seal', { rotate: -12, scale: 1.12, duration: .16, ease: 'power2.in' })
      .to('.seal', { scale: 0, rotate: 32, autoAlpha: 0, duration: .5, ease: 'back.in(1.7)' })
      .to('.gate-card', { autoAlpha: 0, y: -26, duration: .55, ease: 'power2.inOut' }, '-=.25')
      .add(playDrapes);
  });

  function playDrapes() {
    let ending = false;
    const FADE = 1.3;          // gate fade duration
    const LEAD = 1.6;          // begin fading this many seconds before the clip ends
    const tryPlay = video.play();

    // Fade the WHOLE gate out a bit before the reveal video actually ends, so it
    // dissolves onto the already-playing hero underneath (never shows the reveal
    // clip's frozen final frame).
    const beginEnd = () => {
      if (ending) return;
      ending = true;
      finish(false);
    };
    const armFade = () => {
      const dur = video.duration;
      if (isFinite(dur) && dur > 0) {
        const onTime = () => {
          if (video.currentTime >= dur - LEAD) {
            video.removeEventListener('timeupdate', onTime);
            beginEnd();
          }
        };
        video.addEventListener('timeupdate', onTime);
      }
    };

    if (tryPlay && tryPlay.then) {
      tryPlay.then(() => {
        gsap.set('.gate-still--closed', { opacity: 1 });
        gsap.to(video, { opacity: 1, duration: .3 });
        if (isFinite(video.duration) && video.duration > 0) armFade();
        else video.addEventListener('loadedmetadata', armFade, { once: true });
      }).catch(beginEnd);
    } else if (video.error) {
      beginEnd();
    }

    // fallbacks: natural end, and missing/unplayable file
    video.addEventListener('ended', beginEnd, { once: true });
    setTimeout(() => { if (!ending && video.readyState < 2) beginEnd(); }, 1500);

    // expose fade duration to finish()
    finish.fadeDur = FADE;
  }

  function finish(instant) {
    document.body.style.overflow = '';
    if (appState.smoother) appState.smoother.scrollTop(0); else window.scrollTo(0, 0);
    startHeroVideo(); // ensure the background hero is live (idempotent)
    heroEntrance(instant);

    if (!window.gsap || instant) {
      gateEl.remove();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
      return;
    }

    // Pure fade: the gate dissolves out over the hero video already playing
    // behind it. No second video starts here, so nothing to stutter.
    gsap.to(gateEl, {
      autoAlpha: 0, duration: finish.fadeDur || 1.3, ease: 'power2.inOut',
      onComplete: () => {
        gateEl.remove();
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      },
    });
  }
}
