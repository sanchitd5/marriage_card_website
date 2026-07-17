import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import { startMusic, attemptAutoFullscreen } from './ui.js';
import { startHeroVideo, heroEntrance } from './hero.js';

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
    closedImg.src = `assets/images/art-gate-closed${n}${w}.jpg`;
    openImg.src   = `assets/images/art-gate-open${n}${w}.jpg`;
    // also update the <source> inside the <picture> wrappers
    const closedSrc = closedImg.closest('picture')?.querySelector('source');
    const openSrc   = openImg.closest('picture')?.querySelector('source');
    if (closedSrc) closedSrc.srcset = `assets/images/art-gate-closed${n}-wide.jpg`;
    if (openSrc)   openSrc.srcset   = `assets/images/art-gate-open${n}-wide.jpg`;
    video.poster = `assets/images/art-gate-closed${n}${w}.jpg`;
    const src = video.querySelector('source');
    const want = `assets/videos/gate-reveal${n || '-day'}${w}.mp4`;
    if (!src.getAttribute('src').endsWith(want)) {
      src.setAttribute('src', want);
      video.load();
    }
  };
  appState.setGateTheme(document.documentElement.dataset.theme);

  // if the seal goes untapped, the invitation opens itself
  // (auto-open is not a user gesture, so music will wait for the toggle)
  const autoOpen = setTimeout(() => gateCard.click(), 8000);

  gateCard.addEventListener('click', () => {
    if (opened) return;
    opened = true;
    clearTimeout(autoOpen);
    seal.classList.add('opened'); // stop the pulse so the crack animation owns the transform
    window.scrollTo(0, 0);
    if (appState.smoother) appState.smoother.scrollTop(0);
    attemptAutoFullscreen();
    startMusic(); // inside the user gesture: unlocks audio autoplay policy

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
    let usingVideo = false;
    const tryPlay = video.play();
    video.addEventListener('ended', () => crossToOpen(.8), { once: true });

    if (tryPlay && tryPlay.then) {
      tryPlay.then(() => {
        usingVideo = true;
        // Keep the closed-gate still fully visible as an underlay while the
        // video plays — this masks any first-frame mismatch completely.
        // We only fade the still out near the very end of the video.
        gsap.set('.gate-still--closed', { opacity: 1 });
        gsap.to(video, { opacity: 1, duration: .3 });
        // Fade out the closed still ~0.8s before the video ends so the
        // open-still crossfade takes over cleanly.
        const fadeDur = 0.8;
        const delay = Math.max(0, (video.duration || 8) - fadeDur - 0.2);
        gsap.to('.gate-still--closed', { opacity: 0, duration: fadeDur, delay });
      }).catch(() => stillsFallback());
    } else if (video.error) {
      stillsFallback();
    }

    // safety: if metadata never arrives (missing file), fall back
    setTimeout(() => {
      if (!usingVideo && (video.readyState < 2)) stillsFallback();
    }, 1200);

    function stillsFallback() {
      if (usingVideo) return;
      usingVideo = true; // guard double-entry
      crossToOpen(1.4);
    }
  }

  function crossToOpen(dur) {
    gsap.timeline()
      .to('.gate-still--open', { opacity: 1, duration: dur, ease: 'power2.inOut' })
      .add(() => finish(false), `-=${dur * 0.55}`);
  }

  function finish(instant) {
    document.body.style.overflow = '';
    if (appState.smoother) appState.smoother.scrollTop(0); else window.scrollTo(0, 0);
    startHeroVideo();
    heroEntrance(instant);
    if (!window.gsap || instant) {
      gateEl.remove();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
      return;
    }
    // dissolve through the drapes: gate drifts closer while the hero settles back
    gsap.fromTo('#hero-video, .hero-poster', { scale: 1.07 }, { scale: 1, duration: 2.6, ease: 'luxe' });
    gsap.to(gateEl, {
      autoAlpha: 0, scale: 1.05, transformOrigin: '50% 42%', duration: 1.5, ease: 'power2.inOut',
      onComplete: () => {
        gateEl.remove();
        ScrollTrigger.refresh();
      },
    });
  }
}
