import { REDUCED, $, $$ } from './dom.js';
import { appState } from './state.js';

export function initGsap() {
  if (!window.gsap) {
    document.documentElement.classList.add('reduce-motion');
    return;
  }
  // Each scroll/text plugin ships from its own CDN script. If any failed to
  // load, bail to reduced-motion instead of throwing on a bare global below
  // (which would also abort initPetals/initTilt in the same DOMContentLoaded).
  if (!window.ScrollTrigger || !window.ScrollSmoother || !window.SplitText || !window.Flip) {
    document.documentElement.classList.add('reduce-motion');
    return;
  }

  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText, Flip);
  gsap.config({ nullTargetWarn: false });
  // luxury ease from the reference sites: cubic-bezier(.25,1,.5,1)
  gsap.registerEase('luxe', p => 1 - Math.pow(1 - p, 2.6));

  if (REDUCED) {
    document.documentElement.classList.add('reduce-motion');
    return;
  }

  appState.smoother = ScrollSmoother.create({ smooth: 1.15, effects: true, smoothTouch: false, normalizeScroll: false });
  if (document.getElementById('gate')) appState.smoother.scrollTop(0);

  // one fade-up primitive everywhere (majestic/teatro numbers)
  ScrollTrigger.batch('.fade-up', {
    start: 'top 82%',
    once: true,
    onEnter: batch => gsap.fromTo(batch,
      { y: 48, autoAlpha: 0, scale: 0.97 },
      { y: 0, autoAlpha: 1, scale: 1, duration: 1.1, stagger: 0.12, ease: 'power3.out', overwrite: true }),
  });

  // interlude: portrait eases in and the quote follows, one choreography
  gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: '.interlude-art', start: 'top 80%', once: true },
  })
    .fromTo('.interlude-art', { autoAlpha: 0, y: 60, scale: .96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.6 })
    .fromTo('.interlude-line', { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 1.1 }, '-=.8');

  // scrolling in does the scratching: fully swept once half the section is in
  let scratched = 0;
  function sweepTo(p) {
    if (document.getElementById('gate')) return; // no pre-scratching behind the gate
    if (!appState.scratchAPI.eraseNorm || appState.scratchAPI.revealed() || p <= scratched) return;
    for (let t = scratched; t <= p; t += 0.008) {
      const row = Math.min(3, Math.floor(t * 4));
      const u = (t * 4) % 1;
      appState.scratchAPI.eraseNorm(row % 2 ? 1 - u : u, 0.14 + row * 0.24);
    }
    scratched = p;
    if (p > 0.96) appState.scratchAPI.check();
  }

  let sweepPlayed = false;
  function playSweep() {
    if (sweepPlayed || document.getElementById('gate') || appState.scratchAPI.revealed()) return;
    sweepPlayed = true;
    const state = { p: 0 };
    gsap.to(state, {
      p: 1,
      duration: 1.8,
      ease: 'power1.inOut',
      delay: 0.35,
      onUpdate: () => sweepTo(state.p),
    });
  }

  ScrollTrigger.create({
    trigger: '#countdown',
    start: 'top 60%',
    onEnter: playSweep,
    onEnterBack: playSweep,
  });

  // a repaint (resize) wipes the canvas; redo the sweep up to where we were
  appState.scratchAPI.onRepaint = () => {
    const p = scratched;
    scratched = 0;
    sweepTo(p);
  };

  // gentle section snapping, mobile/tablet only
  const snapSections = $$('.hero, .band, .footer');
  let snapTimer = null;
  let pointerBusy = false;
  let lastScrollY = window.scrollY;
  let scrollDir = 0; // +1 = down, -1 = up

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    scrollDir = y > lastScrollY ? 1 : -1;
    lastScrollY = y;
  }, { passive: true });

  window.addEventListener('pointerdown', () => { pointerBusy = true; }, { capture: true });
  window.addEventListener('pointerup', () => { pointerBusy = false; }, { capture: true });
  window.addEventListener('pointercancel', () => { pointerBusy = false; }, { capture: true });

  function trySnap() {
    if (pointerBusy || scrollDir > 0 || !matchMedia('(max-width: 899px)').matches) return;
    const max = ScrollTrigger.maxScroll(window);
    const y = window.scrollY; // native position: the smoothed value lags behind
    let best = null;
    for (const s of snapSections) {
      const top = Math.min(s.offsetTop, max);
      if (best === null || Math.abs(top - y) < Math.abs(best - y)) best = top;
    }
    if (best === null || Math.abs(best - y) < 2 || Math.abs(best - y) > innerHeight * 0.35) return;
    gsap.to(appState.smoother, { scrollTop: best, duration: 0.55, ease: 'power2.out', overwrite: 'auto' });
  }

  ScrollTrigger.addEventListener('scrollEnd', () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(trySnap, 250);
  });

  // countdown digits get a slow settle
  gsap.fromTo('.count-num', { scale: .88, autoAlpha: 0 }, {
    scale: 1,
    autoAlpha: 1,
    duration: 1.4,
    ease: 'luxe',
    stagger: .14,
    scrollTrigger: { trigger: '.count-grid', start: 'top 80%', once: true },
  });

  // One-time golden sparkle reveal and order swap
  appState.doSparkleReveal = function doSparkleReveal() {
    const el = $('.hero-names');
    if (!el || el.dataset.sparkled) return;
    el.dataset.sparkled = '1';

    // Lock container height to prevent layout shift while names are invisible
    el.style.minHeight = el.offsetHeight + 'px';
    el.style.position = 'relative';

    const cvs = document.createElement('canvas');
    cvs.width = el.offsetWidth || 360;
    cvs.height = el.offsetHeight || 130;
    cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    el.appendChild(cvs);
    const ctx = cvs.getContext('2d');

    const GOLDS = ['#f5c518', '#ffd700', '#ffe080', '#e8950a', '#c88a10', '#fff0a0'];
    const pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * cvs.width,
      y: Math.random() * cvs.height,
      r: Math.random() * 2.8 + 0.7,
      vx: (Math.random() - 0.5) * 1.8,
      vy: (Math.random() - 0.5) * 1.8 - 0.6,
      col: GOLDS[Math.floor(Math.random() * GOLDS.length)],
      delay: Math.random() * 0.5,
    }));

    // Names are captured in their template (FROM_GROOM_SIDE) order. The reveal
    // flashes the reverse order as a nod to both families, then settles back to
    // the flag order so the resting hero matches the static/no-JS fallback and
    // the README "appears first" contract. Reorder targets are explicit (not a
    // blind reverse) so we always resolve to the FROM_GROOM_SIDE order.
    const amp = $('.hero-amp', el);
    const [nameA, nameB] = $$('.hero-name', el); // A = flag-primary side
    const nameEls = [nameA, amp, nameB].filter(Boolean);
    const flagOrder = [nameA, amp, nameB].filter(Boolean);
    const reverseOrder = [nameB, amp, nameA].filter(Boolean);
    const setOrder = (order) => order.forEach((node) => el.insertBefore(node, cvs));
    // Re-query current DOM order so the stagger reads left-to-right either way.
    const revealNames = () => gsap.fromTo($$('.hero-name, .hero-amp', el),
      { autoAlpha: 0, y: 10 },
      { autoAlpha: 1, y: 0, duration: 0.85, ease: 'power2.out', stagger: 0.13 });

    const tl = gsap.timeline({
      onComplete() {
        cvs.remove();
        el.style.position = '';
        el.style.minHeight = '';
      }
    });

    tl.add(() => {
      let f = 0;
      const TOTAL = 75;
      (function tick() {
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        const prog = f / TOTAL;
        pts.forEach(p => {
          const lp = Math.max(0, (prog - p.delay) / (1 - p.delay + 0.001));
          if (!lp) return;
          const a = lp < 0.5 ? lp * 2 : 2 - lp * 2;
          const px = p.x + p.vx * f * 0.55;
          const py = p.y + p.vy * f * 0.55;
          ctx.save();
          ctx.globalAlpha = a * 0.9;
          ctx.fillStyle = p.col;
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4 - Math.PI / 2;
            const rad = i % 2 === 0 ? p.r : p.r * 0.38;
            if (i === 0) ctx.moveTo(px + rad * Math.cos(angle), py + rad * Math.sin(angle));
            else ctx.lineTo(px + rad * Math.cos(angle), py + rad * Math.sin(angle));
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });
        f++;
        if (f <= TOTAL) requestAnimationFrame(tick);
        else ctx.clearRect(0, 0, cvs.width, cvs.height);
      })();
    });

    // 1) fade out the flag order while the sparkle peaks
    tl.to(nameEls, { autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=0.5');
    // 2) flash the reverse order (both families acknowledged)
    tl.add(() => setOrder(reverseOrder), '+=0.05');
    tl.add(revealNames);
    // 3) settle back to the FROM_GROOM_SIDE order after a brief hold
    tl.to(nameEls, { autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=2.0');
    tl.add(() => setOrder(flagOrder), '+=0.05');
    tl.add(revealNames);
  };

  // ── Seal heartbeat + ripple ring ──────────────────────────────────
  const sealEl = $('#seal');
  if (sealEl) {
    appState.sealPulse = gsap.to(sealEl, {
      scale: 1.06, duration: 1.2, repeat: -1, yoyo: true, ease: 'sine.inOut',
    });
    const rippleEl = sealEl.querySelector('.seal-ripple');
    if (rippleEl) {
      appState.sealRipple = gsap.timeline({ repeat: -1 })
        .fromTo(rippleEl,
          { scale: 0.92, opacity: 0.9 },
          { scale: 1.45, opacity: 0, duration: 2.4, ease: 'power1.out' }
        );
    }
    sealEl.addEventListener('mouseenter', () => {
      if (!sealEl.classList.contains('opened'))
        gsap.to(sealEl, { scale: 1.1, duration: 0.25, overwrite: 'auto' });
    });
    sealEl.addEventListener('mouseleave', () => {
      if (!sealEl.classList.contains('opened'))
        gsap.to(sealEl, { scale: 1, duration: 0.25, overwrite: 'auto' });
    });
  }

  // ── Scroll cue: mouse dot drop ────────────────────────────────────
  const mouseDot = $('.cue-mouse span');
  if (mouseDot) {
    gsap.timeline({ repeat: -1 })
      .fromTo(mouseDot, { y: 0, opacity: 1 }, { y: 14, opacity: 0, duration: 1.32, ease: 'power1.inOut' })
      .set(mouseDot, { y: 0, opacity: 0 })
      .to(mouseDot, { opacity: 1, duration: 1.056, ease: 'power1.inOut' });
  }

  // ── Scroll cue: chevron drift (all cue-chevrons groups) ──────────
  $$('.cue-chevrons').forEach(group => {
    [...group.querySelectorAll('i')].forEach((ch, i) => {
      const delay = i * 0.35;
      gsap.timeline({ repeat: -1, delay })
        .fromTo(ch, { y: -8 }, { y: 10, duration: 2.2, ease: 'none' });
      gsap.timeline({ repeat: -1, delay })
        .fromTo(ch, { opacity: 0 }, { opacity: 0.9, duration: 2.2 * 0.35, ease: 'none' })
        .to(ch, { opacity: 0, duration: 2.2 * 0.65, ease: 'none' });
    });
  });

  // ── Ambient petals (GSAP-driven; hidden automatically when tsParticles loads) ──
  const petalDurs = [13, 17, 15, 19, 14, 18, 16, 12, 20];
  const petalDelays = [-2, -9, -5, -12, -7, -3, -10, -6, -14];
  $$('.petal').forEach((p, i) => {
    const dur = petalDurs[i] ?? 15;
    const delay = petalDelays[i] ?? 0;
    gsap.timeline({ repeat: -1, delay })
      .set(p, { y: '-10vh', x: 0, rotation: 0, opacity: 0 })
      .to(p, { opacity: 0.9, duration: dur * 0.1, ease: 'none' })
      .to(p, { y: '55vh', x: 30, rotation: 180, opacity: 0.75, duration: dur * 0.4, ease: 'sine.inOut' }, '<')
      .to(p, { y: '115vh', x: -20, rotation: 360, opacity: 0, duration: dur * 0.5, ease: 'sine.in' });
  });

  // ── Ambient fireflies ─────────────────────────────────────────────
  const driftDelays = [0, -2, -4];
  const pulseDelays = [-1, -3, -2];
  $$('.firefly').forEach((ff, i) => {
    gsap.timeline({ repeat: -1, delay: driftDelays[i] })
      .to(ff, { x: 40, y: -30, duration: 1.5, ease: 'sine.inOut' })
      .to(ff, { x: -20, y: -60, duration: 1.5, ease: 'sine.inOut' })
      .to(ff, { x: 30, y: -30, duration: 1.5, ease: 'sine.inOut' })
      .to(ff, { x: 0, y: 0, duration: 1.5, ease: 'sine.inOut' });
    gsap.set(ff, { filter: 'drop-shadow(0 0 4px hsl(42deg 50% 72%))' });
    gsap.to(ff, {
      opacity: 1,
      filter: 'drop-shadow(0 0 10px hsl(40deg 45% 52%)) drop-shadow(0 0 22px hsl(42deg 50% 72%))',
      duration: 2.25, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: pulseDelays[i],
    });
  });
}
