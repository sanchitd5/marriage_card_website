import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import { startMusic, attemptAutoFullscreen } from './ui.js';
import { startHeroVideo, heroEntrance } from './hero.js';
import { videoSuffix } from './net.js';

export function initGate() {
  const gateEl = $('#gate');
  if (!gateEl) return;

  const dayVideo = $('#gate-video-day');
  const nightVideo = $('#gate-video-night');
  const gateCard = $('.gate-card');
  const seal = $('#seal');
  if (!gateCard || !seal) return;
  // The techno skin ships no reveal video — the gate is a CSS/canvas stage. When
  // the video elements are absent we run a lighter, video-free reveal; the
  // Regency path (both videos present) is unchanged.
  const hasVideo = !!(dayVideo && nightVideo);

  const gateVideos = hasVideo ? [dayVideo, nightVideo] : [];
  const themeVideo = theme => (theme === 'dark' ? nightVideo : dayVideo);

  document.body.style.overflow = 'hidden';
  // the invitation always opens from the top of the story
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  let opened = false;

  // wide (≥768px) breakpoint: serve 16:9 landscape assets for tablet/desktop
  const isWide = () => window.matchMedia('(min-width: 768px)').matches;

  if (hasVideo) {
    // Point each stacked reveal video at the right tier/wide variant, ONCE. The
    // day↔night switch is a crossfade between the two elements, never a reload.
    (function loadVideoSources() {
      const w = isWide() ? '-wide' : '';
      const suffix = videoSuffix();
      [['-day', dayVideo], ['-night', nightVideo]].forEach(([n, v]) => {
        const src = v.querySelector('source');
        if (!src) return;
        const want = `assets/videos/gate-reveal${n}${w}${suffix}.mp4`;
        if ((src.getAttribute('src') || '') !== want) {
          src.setAttribute('src', want);
          v.load();
        }
      });
    })();

    // Crossfade which reveal video is visible (works before AND during the reveal,
    // so toggling mode mid-open is a smooth dissolve). Night mode also gets its own
    // candlelit closed/open stills, but only until the reveal starts.
    appState.setGateTheme = theme => {
      const active = themeVideo(theme);
      gateVideos.forEach(v => v.classList.toggle('is-active', v === active));
      if (opened) return; // stills no longer matter once the drapes are opening
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
    };
    appState.setGateTheme(document.documentElement.dataset.theme);

    // Start the hero video playing in the background immediately, behind the still
    // opaque gate. When the gate reveal fades out it uncovers an already-live clip
    // (no decode handoff at the transition = no end lag).
    startHeroVideo();
  }

  // If the seal goes untapped, the invitation opens itself 30s AFTER the boot
  // loader has cleared (so the countdown starts when the gate is actually on
  // screen, not while the loading screen is still up). boot-loader.js sets
  // window.__weddingBootDone + fires 'wedding-boot-done' when it removes itself.
  // (auto-open is not a user gesture, so music will wait for the toggle.)
  const AUTO_OPEN_MS = 30000;
  let autoOpen = null;
  const startAutoOpen = () => { if (!opened && autoOpen == null) autoOpen = setTimeout(() => gateCard.click(), AUTO_OPEN_MS); };
  if (window.__weddingBootDone) startAutoOpen();
  else window.addEventListener('wedding-boot-done', startAutoOpen, { once: true });

  gateCard.addEventListener('click', () => {
    if (opened) return;
    opened = true;
    appState.ignited = true; // the tap is the drop: the light show ignites here
    clearTimeout(autoOpen);
    window.removeEventListener('wedding-boot-done', startAutoOpen);
    seal.classList.add('opened'); // stop the pulse so the crack animation owns the transform
    if (appState.sealPulse) { appState.sealPulse.kill(); appState.sealPulse = null; }
    if (appState.sealRipple) { appState.sealRipple.kill(); appState.sealRipple = null; }
    window.scrollTo(0, 0);
    if (appState.smoother) appState.smoother.scrollTop(0);
    attemptAutoFullscreen();
    startMusic(); // inside the user gesture: unlocks audio autoplay policy
    if (hasVideo) startHeroVideo(); // gesture-backed retry in case background autoplay was blocked

    if (REDUCED || !window.gsap) {
      finish(true);
      return;
    }

    // Techno skin: no drape video to decode. Break the glyph seal, flash the
    // stage's light burst (#gate.revealing in CSS), then dissolve the gate onto
    // the hero backdrop already painted underneath.
    if (!hasVideo) {
      gateEl.classList.add('revealing');
      finish.fadeDur = 1.1;
      gsap.timeline()
        .to('.seal', { scale: 1.14, duration: .16, ease: 'power2.in' })
        .to('.seal', { scale: 0, rotate: 26, autoAlpha: 0, duration: .5, ease: 'back.in(1.7)' })
        .to('.gate-card', { autoAlpha: 0, y: -20, duration: .5, ease: 'power2.inOut' }, '-=.25')
        .add(() => finish(false), '+=.12');
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

    // Play BOTH clips from the top so they stay frame-synced; the reveal and the
    // end-fade timing key off the ACTIVE one (guaranteed to run), so a mode
    // toggle mid-reveal crossfades cleanly and an unbuffered inactive clip can
    // never abort the sequence.
    const active = themeVideo(document.documentElement.dataset.theme);
    let activePlay = null;
    gateVideos.forEach(v => {
      try { v.currentTime = 0; } catch (e) { /* not seekable yet */ }
      const p = v.play();
      if (v === active) { activePlay = p; return; }
      if (p && p.catch) p.catch(() => {}); // inactive clip: best-effort, ignore
    });

    // Fade the WHOLE gate out a bit before the reveal clip ends, so it dissolves
    // onto the already-playing hero underneath (never shows a frozen final frame).
    const beginEnd = () => {
      if (ending) return;
      ending = true;
      finish(false);
    };
    const armFade = () => {
      const dur = active.duration;
      if (isFinite(dur) && dur > 0) {
        const onTime = () => {
          if (active.currentTime >= dur - LEAD) {
            active.removeEventListener('timeupdate', onTime);
            beginEnd();
          }
        };
        active.addEventListener('timeupdate', onTime);
      }
    };
    // CSS crossfades .is-active in once #gate.revealing is set.
    const reveal = () => {
      gsap.set('.gate-still--closed', { opacity: 1 });
      gateEl.classList.add('revealing');
      if (isFinite(active.duration) && active.duration > 0) armFade();
      else active.addEventListener('loadedmetadata', armFade, { once: true });
    };

    if (activePlay && activePlay.then) {
      activePlay.then(reveal).catch(beginEnd);
    } else if (active.error) {
      beginEnd();
    } else {
      reveal();
    }

    // fallbacks: natural end, and missing/unplayable file
    active.addEventListener('ended', beginEnd, { once: true });
    setTimeout(() => { if (!ending && active.readyState < 2) beginEnd(); }, 1500);

    // expose fade duration to finish()
    finish.fadeDur = FADE;
  }

  function finish(instant) {
    if (appState.smoother) appState.smoother.scrollTop(0); else window.scrollTo(0, 0);
    startHeroVideo(); // ensure the background hero is live (idempotent)
    heroEntrance(instant);

    // keep the page locked until the gate is fully gone, so the reveal can't be
    // scrolled past while it is still playing/dissolving
    const unblock = () => { document.body.style.overflow = ''; };

    if (!window.gsap || instant) {
      gateEl.remove();
      unblock();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
      return;
    }

    // Pure fade: the gate dissolves out over the hero video already playing
    // behind it. No second video starts here, so nothing to stutter.
    gsap.to(gateEl, {
      autoAlpha: 0, duration: finish.fadeDur || 1.3, ease: 'power2.inOut',
      onComplete: () => {
        gateEl.remove();
        unblock();
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      },
    });
  }
}
