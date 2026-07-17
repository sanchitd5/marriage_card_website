/* Riya & Sanchit · Shubh Vivah — site engine
   Vanilla JS + GSAP. Everything degrades: no video → still crossfade,
   no mp3 → YouTube stream, reduced motion → calm static page. */
'use strict';

/* ── constants ──────────────────────────────────────────────── */
const WEDDING_TS = Date.UTC(2026, 11, 12, 13, 30, 0); // 12 Dec 2026, 19:00 IST (edit here)
// couple's approved pool (assets/audio/*.mp3); one is drawn at random each visit
const SONGS = ['theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5'];
const MAPS = {
  radisson: 'https://maps.app.goo.gl/fQhBFytYAZKu4qBB7',
  devansh: 'https://maps.app.goo.gl/RdueUZ2XfNiAnbD18',
};
const EVENTS = {
  haldi: {
    title: 'Haldi — Riya & Sanchit',
    start: '20261211T053000Z', end: '20261211T083000Z',
    location: 'Radisson Hotel Chandigarh Zirakpur',
    description: 'The first affair of the celebrations. Dress code: shades of yellow. Directions: ' + MAPS.radisson,
  },
  cocktail: {
    title: 'Cocktail & Engagement — Riya & Sanchit',
    start: '20261211T143000Z', end: '20261211T183000Z',
    location: 'Radisson Hotel Chandigarh Zirakpur',
    description: 'An evening of toasts and rings. Dress code: dazzling as you dare. Directions: ' + MAPS.radisson,
  },
  wedding: {
    title: 'Wedding of Riya & Sanchit',
    start: '20261212T133000Z', end: '20261212T183000Z',
    location: "De'vansh Resort, Ambala Cantt",
    description: 'The grand affair: baraat, pheras and forever. Directions: ' + MAPS.devansh,
  },
};
const GALLERY = [
  { src: 'photo-01', alt: 'A quiet forehead kiss before the floral arch', cls: 'gframe--tall' },
  { src: 'photo-02', alt: 'A twirl beneath the spiral staircase' },
  { src: 'photo-04', alt: 'Sanchit on one knee, asking the question' },
  { src: 'photo-05', alt: 'Laughing together at the engagement' },
  { src: 'photo-06', alt: 'A playful moment with the groom’s stole' },
  { src: 'photo-08', alt: 'Poolside, in ivory and gold', cls: 'gframe--tall' },
  { src: 'photo-10', alt: 'A rooftop embrace at golden hour' },
  { src: 'photo-12', alt: 'Nose to nose, mid-laugh' },
  { src: 'photo-14', alt: 'Dancing at the engagement celebration', cls: 'gframe--wide' },
  { src: 'photo-16', alt: 'Beneath the grand ceiling, holding close' },
  { src: 'photo-17', alt: 'Roses in hand, on the morning walk' },
];

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

// Assigned inside initGsap once GSAP is ready; called from heroEntrance
let doSparkleReveal = null;

/* ── gallery DOM (before GSAP batch setup) ──────────────────── */
(function buildGallery() {
  const grid = $('#gallery-grid');
  grid.innerHTML = GALLERY.map((p, i) =>
    `<figure class="gframe ${p.cls || ''} fade-up">
       <img src="assets/photos/${p.src}.jpg" alt="${p.alt}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">
     </figure>`).join('');
})();

/* ── GSAP setup ─────────────────────────────────────────────── */
let smoother = null;
function initGsap() {
  if (!window.gsap) { document.documentElement.classList.add('reduce-motion'); return; }
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText, Flip);
  gsap.config({ nullTargetWarn: false });
  // luxury ease from the reference sites: cubic-bezier(.25,1,.5,1)
  gsap.registerEase('luxe', p => 1 - Math.pow(1 - p, 2.6));

  if (REDUCED) {
    document.documentElement.classList.add('reduce-motion');
    return;
  }

  smoother = ScrollSmoother.create({ smooth: 1.15, effects: true, smoothTouch: false, normalizeScroll: false });
  if (document.getElementById('gate')) smoother.scrollTop(0);

  // one fade-up primitive everywhere (majestic/teatro numbers)
  ScrollTrigger.batch('.fade-up', {
    start: 'top 88%',
    once: true,
    onEnter: batch => gsap.fromTo(batch,
      { y: 26, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08, ease: 'luxe', overwrite: true }),
  });

  // interlude: portrait eases in and the quote follows, one choreography
  gsap.timeline({
    defaults: { ease: 'luxe' },
    scrollTrigger: { trigger: '.interlude-art', start: 'top 85%', once: true },
  })
    .fromTo('.interlude-art', { autoAlpha: 0, y: 44, scale: .97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.5 })
    .fromTo('.interlude-line', { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 1 }, '-=.7');

  // scrolling in does the scratching: fully swept once half the section is in
  let scratched = 0;
  function sweepTo(p) {
    if (document.getElementById('gate')) return; // no pre-scratching behind the gate
    if (!scratchAPI.eraseNorm || scratchAPI.revealed() || p <= scratched) return;
    for (let t = scratched; t <= p; t += 0.008) {
      const row = Math.min(3, Math.floor(t * 4));
      const u = (t * 4) % 1;
      scratchAPI.eraseNorm(row % 2 ? 1 - u : u, 0.14 + row * 0.24);
    }
    scratched = p;
    if (p > 0.96) scratchAPI.check();
  }
  // the sweep plays as a visible moment once the card scrolls into view
  // (scroll-scrubbed erasing always finished mid-snap, before it could be seen)
  let sweepPlayed = false;
  function playSweep() {
    if (sweepPlayed || document.getElementById('gate') || scratchAPI.revealed()) return;
    sweepPlayed = true;
    const state = { p: 0 };
    gsap.to(state, { p: 1, duration: 1.8, ease: 'power1.inOut', delay: 0.35,
      onUpdate: () => sweepTo(state.p) });
  }
  ScrollTrigger.create({
    trigger: '#countdown',
    start: 'top 60%',
    onEnter: playSweep,
    onEnterBack: playSweep,
  });
  // a repaint (resize) wipes the canvas; redo the sweep up to where we were
  scratchAPI.onRepaint = () => {
    const p = scratched;
    scratched = 0;
    sweepTo(p);
  };

  // gentle section snapping, mobile/tablet only (where sections are full-screen);
  // waits for a real pause and never fights an active touch or scratch
  // disabled while the user is scrolling downward — only snaps on the way back up
  const snapSections = $$('.hero, .band, .footer');
  let snapTimer = null;
  let pointerBusy = false;
  let _lastScrollY = window.scrollY;
  let _scrollDir = 0; // +1 = down, -1 = up
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    _scrollDir = y > _lastScrollY ? 1 : -1;
    _lastScrollY = y;
  }, { passive: true });
  window.addEventListener('pointerdown', () => { pointerBusy = true; }, { capture: true });
  window.addEventListener('pointerup', () => { pointerBusy = false; }, { capture: true });
  window.addEventListener('pointercancel', () => { pointerBusy = false; }, { capture: true });
  function trySnap() {
    if (pointerBusy || _scrollDir > 0 || !matchMedia('(max-width: 899px)').matches) return;
    const max = ScrollTrigger.maxScroll(window);
    const y = window.scrollY; // native position: the smoothed value lags behind
    let best = null;
    for (const s of snapSections) {
      const top = Math.min(s.offsetTop, max);
      if (best === null || Math.abs(top - y) < Math.abs(best - y)) best = top;
    }
    if (best === null || Math.abs(best - y) < 2 || Math.abs(best - y) > innerHeight * 0.35) return;
    gsap.to(smoother, { scrollTop: best, duration: 0.55, ease: 'power2.out', overwrite: 'auto' });
  }
  ScrollTrigger.addEventListener('scrollEnd', () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(trySnap, 250);
  });

  // countdown digits get a slow settle
  gsap.fromTo('.count-num', { scale: .92 }, {
    scale: 1, duration: 1.6, ease: 'luxe', stagger: .1,
    scrollTrigger: { trigger: '.count-grid', start: 'top 85%', once: true },
  });

  // One-time golden sparkle reveal: fades "Riya & Sanchit" out with a sparkle burst,
  // then fades in "Sanchit & Riya" as the final, definitive name order.
  // A min-height placeholder is set before animation so surrounding content never shifts.
  doSparkleReveal = function() {
    const el = $('.hero-names');
    if (!el || el.dataset.sparkled) return;
    el.dataset.sparkled = '1';

    // Lock container height to prevent layout shift while names are invisible
    el.style.minHeight = el.offsetHeight + 'px';
    el.style.position = 'relative';

    // Canvas for the golden sparkle burst
    const cvs = document.createElement('canvas');
    cvs.width = el.offsetWidth || 360;
    cvs.height = el.offsetHeight || 130;
    cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    el.appendChild(cvs);
    const ctx = cvs.getContext('2d');

    const GOLDS = ['#f5c518','#ffd700','#ffe080','#e8950a','#c88a10','#fff0a0'];
    const pts = Array.from({length: 60}, () => ({
      x: Math.random() * cvs.width,
      y: Math.random() * cvs.height,
      r: Math.random() * 2.8 + 0.7,
      vx: (Math.random() - 0.5) * 1.8,
      vy: (Math.random() - 0.5) * 1.8 - 0.6,
      col: GOLDS[Math.floor(Math.random() * GOLDS.length)],
      delay: Math.random() * 0.5,
    }));

    const nameEls = $$('.hero-name, .hero-amp', el);

    const tl = gsap.timeline({
      onComplete() {
        cvs.remove();
        el.style.position = '';
        el.style.minHeight = '';
      }
    });

    // 1. Sparkle burst fires immediately, overlaying the text while it is still visible
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
            i === 0
              ? ctx.moveTo(px + rad * Math.cos(angle), py + rad * Math.sin(angle))
              : ctx.lineTo(px + rad * Math.cos(angle), py + rad * Math.sin(angle));
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

    // 2. Fade names out at sparkle peak (~0.5 s in)
    tl.to(nameEls, { autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=0.5');

    // 3. Swap DOM order to "Sanchit & Riya"
    tl.add(() => {
      const kids = [...el.children].filter(c => c !== cvs);
      kids.reverse().forEach(c => el.insertBefore(c, cvs));
    }, '+=0.05');

    // 4. Fade in the final names (sparkles are fading out in the background)
    tl.add(() => {
      gsap.fromTo($$('.hero-name, .hero-amp', el),
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.85, ease: 'power2.out', stagger: 0.13 });
    });
  };
}

/* ── intro gate ─────────────────────────────────────────────── */
let setGateTheme = () => {};
(function gate() {
  const gateEl = $('#gate');
  const video = $('#gate-video');
  document.body.style.overflow = 'hidden';
  // the invitation always opens from the top of the story
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  let opened = false;

  // night mode gets its own candlelit gate art and reveal video
  setGateTheme = theme => {
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
  setGateTheme(document.documentElement.dataset.theme);

  // the whole card opens the invitation; the seal is the visual button
  // if the seal goes untapped, the invitation opens itself
  // (auto-open is not a user gesture, so music will wait for the toggle)
  const autoOpen = setTimeout(() => $('.gate-card').click(), 8000);

  $('.gate-card').addEventListener('click', () => {
    if (opened) return;
    opened = true;
    clearTimeout(autoOpen);
    $('#seal').classList.add('opened'); // stop the pulse so the crack animation owns the transform
    window.scrollTo(0, 0);
    if (smoother) smoother.scrollTop(0);
    startMusic(); // inside the user gesture: unlocks audio autoplay policy

    if (REDUCED || !window.gsap) { finish(true); return; }

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
    setTimeout(() => { if (!usingVideo && (video.readyState < 2)) stillsFallback(); }, 1200);

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
    if (smoother) smoother.scrollTop(0); else window.scrollTo(0, 0);
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
      onComplete: () => { gateEl.remove(); ScrollTrigger.refresh(); },
    });
  }
})();

/* ── hero ───────────────────────────────────────────────────── */
function startHeroVideo() {
  const v = $('#hero-video');
  const poster = $('.hero-poster');
  if (REDUCED) return; // poster only, no autoplaying video
  v.preload = 'auto';
  const p = v.play();
  if (p && p.then) {
    p.then(() => gsap && gsap.to(v, { opacity: 1, duration: 1.2 }))
     .catch(() => poster.classList.add('kenburns'));
  } else {
    poster.classList.add('kenburns');
  }
}

function heroEntrance(instant) {
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
    .call(() => { if (doSparkleReveal) gsap.delayedCall(0.5, doSparkleReveal); });
}

/* ── music: local mp3 preferred, else visible YouTube mini-player ── */
const music = { audio: null, playing: false };
function startMusic() {
  $('#music-dock').hidden = false;
  const order = [...SONGS].sort(() => Math.random() - 0.5); // shuffled once per visit
  (function tryNext(i) {
    if (i >= order.length) { $('#music-dock').hidden = true; return; }
    const audio = new Audio(`assets/audio/${order[i]}.mp3`);
    audio.loop = true;
    audio.volume = 0.65;
    audio.addEventListener('error', () => tryNext(i + 1), { once: true });
    audio.play().then(() => { music.audio = audio; setPlaying(true); })
      .catch(() => setPlaying(false));
    music.audio = audio;
  })(0);
}
function setPlaying(on) {
  music.playing = on;
  const btn = $('#music-toggle');
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Pause the music' : 'Play the music');
}
$('#music-toggle').addEventListener('click', () => {
  if (!music.audio) return;
  music.playing ? music.audio.pause() : music.audio.play();
  setPlaying(!music.playing);
});

/* ── countdown (plain 1s interval vs UTC target; shows in viewer's local time implicitly) ── */
(function countdown() {
  const els = { d: $('#cd-days'), h: $('#cd-hours'), m: $('#cd-mins'), s: $('#cd-secs') };
  const pad = n => String(n).padStart(2, '0');
  function tick() {
    let diff = Math.max(0, WEDDING_TS - Date.now());
    const d = Math.floor(diff / 864e5);
    const h = Math.floor(diff % 864e5 / 36e5);
    const m = Math.floor(diff % 36e5 / 6e4);
    const s = Math.floor(diff % 6e4 / 1e3);
    els.d.textContent = d;
    els.h.textContent = pad(h);
    els.m.textContent = pad(m);
    els.s.textContent = pad(s);
    if (diff === 0) {
      clearInterval(timer);
      $('.countdown .script-head').textContent = 'Today, we say forever';
    }
  }
  const timer = setInterval(tick, 1000);
  tick();
})();

/* ── scratch-card date reveal (teatro pattern: destination-out, r30, 50%) ── */
const scratchAPI = {};
(function scratch() {
  const canvas = $('#scratch-canvas');
  const frame = $('.scratch-frame');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let revealed = false, painted = false;

  let lastW = 0, lastH = 0;
  function paintFoil() {
    const r = frame.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w === lastW && h === lastH) return; // same size: keep the scratches
    lastW = w; lastH = h;
    canvas.width = w;
    canvas.height = h;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#c9a03e'); g.addColorStop(.25, '#e8cf8a');
    g.addColorStop(.5, '#b8923a'); g.addColorStop(.75, '#f0dda6'); g.addColorStop(1, '#c9a03e');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // foil speckle
    for (let i = 0; i < w * h / 900; i++) {
      ctx.fillStyle = Math.random() > .5 ? 'rgba(255,244,214,.28)' : 'rgba(122,90,26,.18)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    ctx.font = `500 ${Math.round(h * .09)}px Lora, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(94,70,20,.55)';
    ctx.letterSpacing = '4px';
    ctx.fillText('SCRATCH TO REVEAL', w / 2, h / 2 + h * .03);
    painted = true;
    if (scratchAPI.onRepaint) scratchAPI.onRepaint();
  }

  function erase(x, y) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000'; // must be opaque: destination-out erases by source alpha
    ctx.beginPath();
    ctx.arc((x - r.left) * sx, (y - r.top) * sy, 30 * sx, 0, Math.PI * 2);
    ctx.fill();
  }

  function progress() {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0, total = 0;
    for (let i = 3; i < data.length; i += 64) { total++; if (data[i] === 0) clear++; }
    return clear / total * 100;
  }

  function reveal() {
    revealed = true;
    canvas.style.pointerEvents = 'none';
    if (window.gsap && !REDUCED) gsap.to(canvas, { autoAlpha: 0, duration: .9, ease: 'power2.out' });
    else canvas.style.opacity = 0;
    if (window.confetti && !REDUCED) petalRain();
  }

  let down = false;
  canvas.addEventListener('pointerdown', e => { down = true; erase(e.clientX, e.clientY); });
  window.addEventListener('pointermove', e => { if (down && !revealed) erase(e.clientX, e.clientY); });
  window.addEventListener('pointerup', () => {
    if (!down || revealed) { down = false; return; }
    down = false;
    if (progress() > 50) reveal();
  });
  new ResizeObserver(() => { if (!revealed) paintFoil(); }).observe(frame);
  paintFoil();

  // hooks for the scroll-driven auto-scratch in initGsap
  scratchAPI.eraseNorm = (nx, ny) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000'; // must be opaque: destination-out erases by source alpha
    ctx.beginPath();
    ctx.arc(nx * canvas.width, ny * canvas.height, canvas.height * 0.16, 0, Math.PI * 2);
    ctx.fill();
  };
  scratchAPI.check = () => { if (!revealed && progress() > 50) reveal(); };
  scratchAPI.revealed = () => revealed;
})();

/* ── celebration: rose petals (or golden in dark mode) falling from the top ── */
let petalShape = null;
function petalRain() {
  petalShape = petalShape || confetti.shapeFromPath({ path: 'M5 0C8.5 2 9.5 7 5 13C.5 7 1.5 2 5 0' });
  const isDark = document.documentElement.dataset.theme === 'dark';
  const colors = isDark
    ? ['#ffd700', '#f5c518', '#e8a020', '#ffe080', '#c88a10']
    : ['#b3273e', '#d94b60', '#b7a6d9', '#cfc3e6'];
  for (let wave = 0; wave < 3; wave++) {
    setTimeout(() => {
      for (const x of [0.12, 0.38, 0.62, 0.88]) {
        confetti({
          particleCount: 12, angle: 270, spread: 55, startVelocity: 10,
          gravity: 0.5, drift: (Math.random() - 0.5) * 1.4, ticks: 500, scalar: 1.6,
          shapes: [petalShape], colors, origin: { x, y: -0.08 },
          disableForReducedMotion: true,
        });
      }
    }, wave * 380);
  }
}

/* ── add-to-calendar: client-side ICS (majestic pattern) ────── */
function icsFor(ev) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Riya & Sanchit//Wedding//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.start}-rs-wedding@riyaandsanchit`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
    `DTSTART:${ev.start}`, `DTEND:${ev.end}`,
    `SUMMARY:${ev.title}`,
    `DESCRIPTION:${ev.description.replace(/,/g, '\\,')}`,
    `LOCATION:${ev.location.replace(/,/g, '\\,')}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
$$('[data-ics]').forEach(btn => btn.addEventListener('click', () => {
  const ev = EVENTS[btn.dataset.ics];
  const blob = new Blob([icsFor(ev)], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${btn.dataset.ics}-riya-sanchit.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}));

/* ── ambience: tsParticles petals over CSS fallback ─────────── */
async function initPetals() {
  if (REDUCED || !window.tsParticles) return;
  try {
    await tsParticles.load({
      id: 'tsparticles',
      options: {
        fullScreen: { enable: false },
        fpsLimit: 60,
        detectRetina: true,
        particles: {
          number: { value: 14, density: { enable: true, width: 1200 } },
          color: { value: document.documentElement.dataset.theme === 'dark'
            ? ['#ffd700', '#f5c518', '#e8a020', '#ffe080', '#c8920a']
            : ['#e8a24b', '#b7a6d9', '#eecfc7', '#dfc27e'] },
          shape: { type: 'circle' },
          size: { value: { min: 2.5, max: 5.5 } },
          opacity: { value: { min: .35, max: .8 } },
          move: {
            enable: true, direction: 'bottom', speed: { min: .6, max: 1.6 },
            drift: { min: -.6, max: .6 }, straight: false, outModes: { default: 'out' },
          },
          wobble: { enable: true, distance: 12, speed: { angle: 12, move: 6 } },
          rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 12 } },
        },
      },
    });
    $('#ambient').style.display = 'none'; // JS layer active; retire CSS fallback
  } catch (_) { /* CSS fallback stays visible */ }
}

/* ── day / night mode ───────────────────────────────────────── */
(function theme() {
  const btn = $('#theme-toggle');
  const meta = document.querySelector('meta[name="theme-color"]');
  function apply(t, persist) {
    document.documentElement.dataset.theme = t;
    if (persist) localStorage.setItem('theme', t);
    btn.setAttribute('aria-pressed', String(t === 'dark'));
    btn.setAttribute('aria-label', t === 'dark' ? 'Switch to day mode' : 'Switch to night mode');
    if (meta) meta.content = t === 'dark' ? '#191322' : '#f7f4ee';
    setGateTheme(t);
  }
  // reflect whatever the head script decided (stored choice or local sun)
  apply(document.documentElement.dataset.theme || 'light', false);
  btn.addEventListener('click', () =>
    apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
})();

/* ── tilt (pointer-fine only) ───────────────────────────────── */
function initTilt() {
  if (REDUCED || !window.VanillaTilt || !matchMedia('(pointer: fine)').matches) return;
  VanillaTilt.init($$('[data-tilt]'), { max: 5, speed: 900, perspective: 900, glare: true, 'max-glare': .1 });
}

/* ── floating cue: visibility + click-to-next-section ────────────── */
(function scrollProgress() {
  const cue = document.getElementById('floating-cue');
  if (REDUCED || !cue) return;

  // show cue only after leaving the hero and before nearing the end
  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? window.scrollY / max : 0;
    cue.classList.toggle('cue-gone', pct < 0.10 || pct > 0.85);
  }
  window.addEventListener('scroll', update, { passive: true });
  update();

  // click scrolls to the next section below the current viewport centre
  cue.addEventListener('click', () => {
    const sections = $$('.hero, .band, .footer');
    const mid = window.scrollY + window.innerHeight / 2;
    const next = sections.find(s => s.offsetTop > mid + 8);
    if (!next) return;
    if (smoother) smoother.scrollTo(next, true, 'top top');
    else next.scrollIntoView({ behavior: 'smooth' });
  });
})();

/* ── boot ───────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  initGsap();
  initPetals();
  initTilt();
});
