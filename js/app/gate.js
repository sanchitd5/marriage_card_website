import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import { startMusic } from './ui.js';
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

  // night mode gets its own candlelit gate art and reveal video
  appState.setGateTheme = theme => {
    if (opened) return;
    const n = theme === 'dark' ? '-night' : '';
    $('.gate-still--closed').src = `assets/images/art-gate-closed${n}.jpg`;
    $('.gate-still--open').src = `assets/images/art-gate-open${n}.jpg`;
    video.poster = `assets/images/art-gate-closed${n}.jpg`;
    const src = video.querySelector('source');
    const want = `assets/videos/gate-reveal${n || '-day'}.mp4`;
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
        gsap.to(video, { opacity: 1, duration: .3 });
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
