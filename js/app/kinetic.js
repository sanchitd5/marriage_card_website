import { REDUCED, $, $$ } from './dom.js';
import { appState } from './state.js';
import { startMusic, attemptAutoFullscreen } from './ui.js';

// ── Kinetic layer (saifullah.dev "precision console") ──────────────────
// A TECHNO-based skin: the heavy engines (lightshow, milkdrop, scratch foil,
// gallery veil, audio path) are the techno modules, reached via
// data-skin="techno". This file adds ONLY the console layer that data-variant=
// "kinetic" hooks: a boot-console gate, scramble-text reveals, scroll-triggered
// fade-ups, a magnetic crosshair cursor, and a live mono HUD. All vanilla GSAP;
// scramble is hand-rolled (ScrambleTextPlugin is not loaded).
//
// This module deliberately does NOT call the techno initGate / initGsap — it
// owns its own gate + its own reveal primitives (so we skip the techno video
// hero, sparkle reveal, seal pulse, petals and fireflies).

// ── Scramble text ──────────────────────────────────────────────────────
// Charset shown for un-resolved glyphs. Letters+digits scramble; spaces and
// punctuation resolve immediately so the shape reads while it settles.
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#*·';
const randGlyph = () => SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
const isScrambleable = ch => ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'Z' || ch >= 'a' && ch <= 'z';

// The gate (initKineticGate) fires the hero entrance on open; initKinetic
// assigns the real implementation here once GSAP is confirmed present.
let heroReveal = null;

// Collect the non-whitespace text nodes under an element, so scramble can run
// over markup ("Three sets,<br><em>two hearts</em>") without touching the tags.
function textNodesOf(el) {
  const out = [];
  (function walk(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { if (child.nodeValue.trim()) out.push(child); }
      else if (child.nodeType === 1) walk(child);
    }
  })(el);
  return out;
}

// Scramble every text node of `el` left-to-right over `duration` seconds. The
// resolved prefix shows final characters; the tail shows random glyphs (spaces
// and punctuation always show final). `.is-scrambling` is set while running so
// the CSS can swap to the mono face mid-scramble, then back.
function scramble(el, { duration = 1.1, delay = 0 } = {}) {
  if (!el) return;
  const nodes = textNodesOf(el);
  if (!nodes.length) return;
  // Capture each node's final string once (survives repeat calls).
  const finals = nodes.map(n => (n.__kFinal != null ? n.__kFinal : (n.__kFinal = n.nodeValue)));

  if (REDUCED || duration <= 0) {
    nodes.forEach((n, i) => { n.nodeValue = finals[i]; });
    el.classList.remove('is-scrambling');
    return;
  }

  const run = () => {
    el.classList.add('is-scrambling');
    const start = performance.now();
    const step = now => {
      const p = Math.min(1, (now - start) / (duration * 1000));
      nodes.forEach((n, i) => {
        const s = finals[i];
        const resolved = Math.floor(p * s.length);
        let out = '';
        for (let c = 0; c < s.length; c++) {
          const ch = s[c];
          out += (c < resolved || !isScrambleable(ch)) ? ch : randGlyph();
        }
        n.nodeValue = out;
      });
      if (p < 1) { requestAnimationFrame(step); return; }
      nodes.forEach((n, i) => { n.nodeValue = finals[i]; });
      el.classList.remove('is-scrambling');
    };
    requestAnimationFrame(step);
  };
  if (delay > 0) setTimeout(run, delay * 1000); else run();
}

// ── Fallback reveals (no GSAP / reduced-motion) ─────────────────────────
// techno.css hides .fade-up + the interlude pair under html.js. Adding
// reduce-motion reveals them via CSS; we also clear inline transforms in case a
// tween left something mid-flight.
function revealFadeUps() {
  $$('.fade-up, .interlude-art, .interlude-line').forEach(el => {
    el.style.opacity = '1';
    el.style.transform = 'none';
    el.style.visibility = 'visible';
  });
}

// Ensure every scramble target shows its final text (finals live in the DOM
// already; this just restores anything a partial run may have touched).
function setScrambleFinal() {
  $$('[data-scramble], [data-scramble-name]').forEach(el => {
    el.classList.remove('is-scrambling');
    textNodesOf(el).forEach(n => { if (n.__kFinal != null) n.nodeValue = n.__kFinal; });
  });
}

// ── HUD ─────────────────────────────────────────────────────────────────
// Local wall-clock, once a second. No GSAP needed → safe in every path.
function startHudClock() {
  const el = $('#k-hud-time');
  if (!el) return;
  const pad = n => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

// Static section marker for the fallback path (no ScrollTrigger to swap it).
function setHudSectionStatic() {
  const sec = $('#k-hud-sec');
  const first = $('[data-hud]');
  if (sec && first) sec.textContent = first.getAttribute('data-hud');
}

// ── Boot console (drives the gate's progress bar + status word) ─────────
function runBootConsole() {
  const fill = $('#k-boot-fill');
  const pct = $('#k-boot-pct');
  const status = $('#k-boot-status');
  if (!fill && !pct && !status) return;
  const STATUSES = ['STANDBY', 'SYNCING', 'CALIBRATING', 'ALIGNING HEARTS', 'LOCKED IN'];

  const setP = v => {
    const n = Math.round(v);
    if (fill) fill.style.width = n + '%';
    if (pct) pct.textContent = n + '%';
    if (status) status.textContent = STATUSES[Math.min(STATUSES.length - 1, Math.floor((v / 100) * STATUSES.length))];
  };

  if (REDUCED) { setP(100); return; }

  const DUR = 2200;
  if (window.gsap) {
    const o = { v: 0 };
    gsap.to(o, { v: 100, duration: DUR / 1000, ease: 'power1.inOut', onUpdate: () => setP(o.v) });
  } else {
    const start = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - start) / DUR);
      setP(p * 100);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// ── The console gate ────────────────────────────────────────────────────
// Adapts gate.js's scroll-lock + 30s auto-open, but reveals with a CSS/GSAP
// dissolve (no techno drape video). On open it ignites the light show, starts
// music, attempts fullscreen, then fires the hero scramble entrance.
export function initKineticGate() {
  const gateEl = $('#gate');
  if (!gateEl) return;
  const gateCard = $('.gate-card');
  const seal = $('#seal');

  document.body.style.overflow = 'hidden';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  runBootConsole();

  let opened = false;

  // Auto-open 30s AFTER the boot loader clears (boot-loader.js sets
  // window.__weddingBootDone + fires 'wedding-boot-done').
  const AUTO_OPEN_MS = 30000;
  let autoOpen = null;
  const startAutoOpen = () => { if (!opened && autoOpen == null) autoOpen = setTimeout(open, AUTO_OPEN_MS); };
  if (window.__weddingBootDone) startAutoOpen();
  else window.addEventListener('wedding-boot-done', startAutoOpen, { once: true });

  function open() {
    if (opened) return;
    opened = true;
    appState.ignited = true; // the tap is the drop: the light show ignites here
    clearTimeout(autoOpen);
    window.removeEventListener('wedding-boot-done', startAutoOpen);
    if (seal) seal.classList.add('opened');
    window.scrollTo(0, 0);
    if (appState.smoother) appState.smoother.scrollTop(0);
    attemptAutoFullscreen();
    startMusic(); // inside the user gesture: unlocks audio autoplay policy

    const done = () => {
      gateEl.remove();
      document.body.style.overflow = ''; // unlock only once the gate is fully gone
      if (window.ScrollTrigger) ScrollTrigger.refresh();
      if (typeof heroReveal === 'function') heroReveal();
    };

    if (REDUCED || !window.gsap) { done(); return; }

    // Break the glyph seal, flash the stage (#gate.revealing in CSS), dissolve.
    gateEl.classList.add('revealing');
    gsap.timeline({ onComplete: done })
      .to('.seal', { scale: 1.12, duration: 0.16, ease: 'power2.in' })
      .to('.seal', { scale: 0, rotate: 26, autoAlpha: 0, duration: 0.5, ease: 'back.in(1.7)' })
      .to('.gate-card', { autoAlpha: 0, y: -20, duration: 0.5, ease: 'power2.inOut' }, '-=.25')
      .to(gateEl, { autoAlpha: 0, duration: 0.6, ease: 'power2.inOut' }, '-=.1');
  }

  if (gateCard) gateCard.addEventListener('click', open);
  else if (seal) seal.addEventListener('click', open);
}

// ── Main kinetic choreography (on DOMContentLoaded) ─────────────────────
export function initKinetic() {
  // The mono clock is cheap and reads well in every path.
  startHudClock();

  const noGsap = !window.gsap || !window.ScrollTrigger || !window.ScrollSmoother || !window.SplitText || !window.Flip;
  if (noGsap) {
    document.documentElement.classList.add('reduce-motion');
    revealFadeUps();
    setScrambleFinal();
    setHudSectionStatic();
    return;
  }

  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText, Flip);
  gsap.config({ nullTargetWarn: false });
  // luxury ease from the reference sites: cubic-bezier(.25,1,.5,1)
  gsap.registerEase('luxe', p => 1 - Math.pow(1 - p, 2.6));

  if (REDUCED) {
    document.documentElement.classList.add('reduce-motion');
    revealFadeUps();
    setScrambleFinal();
    setHudSectionStatic();
    return;
  }

  // ── CONTROL PANEL / SETUP-WIZARD (no scrolling) ─────────────────────
  // The page never scrolls and has NO scroll effect: each act is a fixed
  // full-viewport "panel", and navigation is a control panel — a labelled side
  // menu (jump anywhere) plus Back / Next buttons and a step counter. Panels
  // crossfade (heading scramble-resolves); there is no wheel / swipe / arrow
  // navigation. (Reduced-motion + no-GSAP paths returned above and keep a plain
  // scrolling page with none of this chrome, so all content stays reachable.)
  document.documentElement.classList.add('k-deck');
  const acts = [$('#hero'), ...$$('#smooth-content .band'), $('.footer')].filter(Boolean);
  const hudSecEl = $('#k-hud-sec');
  const revealedActs = new WeakSet();
  revealedActs.add(acts[0]); // the hero copy is revealed by heroReveal(), not here

  // stack every act (CSS fixes them full-viewport); show only the first
  gsap.set(acts, { autoAlpha: 0 });
  gsap.set(acts[0], { autoAlpha: 1 });
  acts[0].classList.add('act-current');
  if (hudSecEl && acts[0].getAttribute('data-hud')) hudSecEl.textContent = acts[0].getAttribute('data-hud');

  function ringsActive(v) {
    const r = appState.rings;
    if (!r) return;
    if (r.setInView) r.setInView(v); else (v ? r.start : r.stop)?.();
  }
  function enterReveals(act) {
    if (hudSecEl && act.getAttribute('data-hud')) hudSecEl.textContent = act.getAttribute('data-hud');
    if (act.querySelector('#k-rings-stage')) ringsActive(true);
    if (revealedActs.has(act)) { gsap.set($$('.fade-up', act), { autoAlpha: 1, y: 0 }); return; }
    revealedActs.add(act);
    const ups = $$('.fade-up', act);
    if (ups.length) gsap.fromTo(ups, { y: 36, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.08, ease: 'expo.out', overwrite: true });
    $$('[data-scramble]', act).forEach(el => scramble(el, { duration: 1.0 }));
    if (act.querySelector('.interlude-art')) {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .fromTo('.interlude-art', { autoAlpha: 0, y: 60, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.4 })
        .fromTo('.interlude-line', { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 1.0 }, '-=.7');
    }
    const nums = $$('.count-num', act);
    if (nums.length) gsap.fromTo(nums, { scale: 0.88, autoAlpha: 0 },
      { scale: 1, autoAlpha: 1, duration: 1.2, ease: 'luxe', stagger: 0.12 });
  }
  function leaveAct(act) { if (act.querySelector('#k-rings-stage')) ringsActive(false); }

  let idx = 0, busy = false, entered = !$('#gate');
  function go(n) {
    n = Math.max(0, Math.min(acts.length - 1, n));
    if (n === idx || busy) return;
    busy = true;
    const cur = acts[idx], nxt = acts[n];
    leaveAct(cur);
    nxt.classList.add('act-current');
    // Quick console crossfade — no slide, no scroll. The incoming heading
    // scramble-resolves in enterReveals(): a panel switching channels.
    gsap.set(nxt, { autoAlpha: 0 });
    gsap.timeline({ onComplete() { cur.classList.remove('act-current'); busy = false; } })
      .to(cur, { autoAlpha: 0, duration: 0.28, ease: 'power1.inOut' })
      .to(nxt, { autoAlpha: 1, duration: 0.4, ease: 'power1.inOut' }, '-=0.08')
      .add(() => enterReveals(nxt), '<');
    idx = n;
    updateChrome();
  }

  // ── CONTROL-PANEL / WIZARD CHROME ───────────────────────────────────
  // A labelled side menu (jump to any panel), Back / Next buttons, and a step
  // counter. This is a wizard/console, NOT a scrolling page: there is no wheel,
  // swipe or keyboard-arrow navigation — every panel change is an explicit
  // click. (Buttons are real <button>s, so Tab + Enter still works.) The
  // reduced-motion / no-JS fallback returned above and keeps a scrolling page
  // with none of this chrome.
  const labelFor = (act, i) => (act.getAttribute('data-hud') || `Panel ${i}`).replace(/^\d+\s*[—-]\s*/, '');

  const menu = document.createElement('nav');
  menu.id = 'k-panel-menu';
  menu.setAttribute('aria-label', 'Sections');
  const menuBtns = acts.map((act, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'k-menu-item';
    b.innerHTML = `<span class="k-menu-idx">${String(i).padStart(2, '0')}</span><span class="k-menu-label"></span>`;
    b.querySelector('.k-menu-label').textContent = labelFor(act, i);
    b.addEventListener('click', () => { if (entered) go(i); });
    menu.appendChild(b);
    return b;
  });
  document.body.appendChild(menu);

  const controls = document.createElement('div');
  controls.id = 'k-panel-controls';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.id = 'k-prev'; prevBtn.className = 'k-wz-btn';
  prevBtn.textContent = '◀ Back';
  prevBtn.addEventListener('click', () => { if (entered) go(idx - 1); });
  const stepEl = document.createElement('span');
  stepEl.id = 'k-step'; stepEl.className = 'k-step'; stepEl.setAttribute('aria-live', 'polite');
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.id = 'k-next'; nextBtn.className = 'k-wz-btn';
  nextBtn.textContent = 'Next ▶';
  nextBtn.addEventListener('click', () => { if (entered) go(idx + 1); });
  controls.append(prevBtn, stepEl, nextBtn);
  document.body.appendChild(controls);

  const pad2 = n => String(n).padStart(2, '0');
  function updateChrome() {
    menuBtns.forEach((b, i) => b.classList.toggle('is-current', i === idx));
    stepEl.textContent = `${pad2(idx + 1)} / ${pad2(acts.length)}`;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === acts.length - 1;
  }
  updateChrome();

  // NOTE: no wheel / touch-swipe / arrow-key handlers by design — navigation is
  // buttons/clicks only. A panel taller than the viewport still scrolls its own
  // overflow natively (CSS overflow-y:auto), which never changes the panel.

  // ── Hero entrance (fired by the gate on open) ──
  const heroNames = $$('#hero [data-scramble-name]');
  const heroEyebrow = $('#hero .k-eyebrow');
  const heroDate = $('#hero .hero-date');
  const heroBits = [...heroNames, heroEyebrow, heroDate].filter(Boolean);
  const hasGate = !!$('#gate');
  // Hold the hero copy hidden until the gate opens; with no gate it reveals now.
  if (hasGate) gsap.set(heroBits, { autoAlpha: 0, y: 18 });

  heroReveal = function heroReveal() {
    entered = true;   // the gate is open → the deck accepts wheel / swipe / keys
    heroNames.forEach((el, i) => {
      const delay = i * 0.12;
      gsap.to(el, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out', delay });
      scramble(el, { duration: 0.9, delay });
    });
    [heroEyebrow, heroDate].filter(Boolean).forEach((el, i) => {
      const delay = 0.3 + i * 0.15;
      gsap.to(el, { autoAlpha: 1, y: 0, duration: 1, ease: 'expo.out', delay });
      scramble(el, { duration: 1.1, delay });
    });
  };
  if (!hasGate) heroReveal();

  // (Section-heading scramble + HUD section marker are driven per-act by the
  //  deck's enterReveals() above — no ScrollTriggers needed in deck mode.)

  const finePointer = matchMedia('(hover:hover) and (pointer:fine)').matches;

  // ── Magnetic buttons ──
  // Event cards carry BOTH data-tilt and data-magnetic; vanilla-tilt owns their
  // transform, so magnetism only claims the non-tilt targets (seal, cue, music).
  if (finePointer) {
    const MAX = 14;
    $$('[data-magnetic]:not([data-tilt])').forEach(el => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        xTo(Math.max(-MAX, Math.min(MAX, dx * 0.3)));
        yTo(Math.max(-MAX, Math.min(MAX, dy * 0.3)));
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  // ── Crosshair cursor ──
  const cursor = $('#k-cursor');
  if (cursor && finePointer) {
    const h = $('.k-cursor-h', cursor);
    const v = $('.k-cursor-v', cursor);
    const ring = $('.k-cursor-ring', cursor);
    const read = $('.k-cursor-read', cursor);
    let ringX = null, ringY = null;
    if (ring) {
      gsap.set(ring, { xPercent: -50, yPercent: -50 }); // centre on the pointer
      ringX = gsap.quickTo(ring, 'x', { duration: 0.35, ease: 'power3' });
      ringY = gsap.quickTo(ring, 'y', { duration: 0.35, ease: 'power3' });
    }
    const pad4 = n => String(Math.max(0, Math.round(n))).padStart(4, '0');
    window.addEventListener('pointermove', e => {
      const { clientX: x, clientY: y } = e;
      if (h) h.style.transform = `translateY(${y}px)`;
      if (v) v.style.transform = `translateX(${x}px)`;
      if (ringX) { ringX(x); ringY(y); }
      if (read) read.textContent = `${pad4(x)} ${pad4(y)}`;
    }, { passive: true });

    // Grow / recolour the ring over interactive targets (CSS reads .is-hot).
    const HOT = 'a, button, [data-magnetic]';
    document.addEventListener('pointerover', e => {
      if (e.target.closest && e.target.closest(HOT)) cursor.classList.add('is-hot');
    }, { passive: true });
    document.addEventListener('pointerout', e => {
      const from = e.target.closest && e.target.closest(HOT);
      const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(HOT);
      if (from && !to) cursor.classList.remove('is-hot');
    }, { passive: true });
  }
}
