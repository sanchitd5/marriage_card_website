import { REDUCED, $, $$ } from './dom.js';
import { appState } from './state.js';
import { videoSuffix } from './net.js';

// Start the hero video playing (muted, looping) and mark it visible. It runs in
// the background BEHIND the still-opaque gate from page load, so when the gate
// reveal fades out it uncovers an already-live, warm clip — no decode handoff,
// no poster flash, no lag at the transition. Idempotent: safe to call again on
// the seal gesture to satisfy gesture-gated autoplay.
export function startHeroVideo() {
  const v = $('#hero-video');
  const poster = $('.hero-poster');
  if (!v || !poster) return;
  if (REDUCED) {
    poster.classList.add('is-visible');
    return; // poster only, no autoplaying video
  }

  const show = () => {
    poster.classList.remove('is-visible', 'kenburns');
    if (window.gsap) window.gsap.set(v, { opacity: 1 }); else v.style.opacity = '1';
  };

  // pick the connection-appropriate rendition before loading
  const src = v.querySelector('source');
  if (src) {
    const want = `assets/videos/hero-loop-boomerang${videoSuffix()}.mp4`;
    if (!(src.getAttribute('src') || '').endsWith(want)) {
      src.setAttribute('src', want);
      v.load();
    }
  }

  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';

  // The hero asset is a baked boomerang (forward + reversed frames), so a plain
  // native loop gives the ping-pong effect with zero runtime reverse-seeking.
  // The old approach stepped currentTime backwards frame-by-frame; the clip has
  // a single keyframe, so every step re-decoded the whole GOP — smooth on
  // desktop, badly janky on phones. Native loop plays forward only: no seeks.
  v.loop = true;

  if (!v.paused && v.currentTime > 0) { show(); return; } // already running

  const p = v.play();
  if (p && p.then) {
    p.then(show).catch(() => {
      // Autoplay blocked (e.g. no gesture yet): show the poster and retry on the
      // first interaction — the seal tap also re-invokes this to recover.
      poster.classList.add('is-visible');
      const retry = () => {
        const rp = v.play();
        if (rp && rp.then) rp.then(show).catch(() => {});
        else show();
      };
      window.addEventListener('pointerdown', retry, { once: true, passive: true });
      window.addEventListener('keydown', retry, { once: true });
    });
  } else {
    show();
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
    .call(() => {
      if (appState.doSparkleReveal) gsap.delayedCall(0.5, appState.doSparkleReveal);
      startHashtagCycle();
    });
}

function startHashtagCycle() {
  const el = document.querySelector('.hero-tag-text');
  if (!el || !window.gsap) return;
  const tags = el.dataset.tags ? el.dataset.tags.split(',') : [];
  if (tags.length < 2) return;
  let index = 0;
  let busy = false;

  const GOLDS = document.documentElement.dataset.skin === 'techno'
    ? ['#22d3ee', '#38bdf8', '#67e8f9', '#f4f6fb', '#a5f3fc', '#cffafe']
    : ['#f5c518', '#ffd700', '#ffe080', '#e8950a', '#c88a10', '#fff0a0'];

  function sparkleSwap(nextTag) {
    if (busy) return;
    busy = true;

    const parent = el.parentElement;
    parent.style.position = 'relative';

    const cvs = document.createElement('canvas');
    const rect = el.getBoundingClientRect();
    cvs.width = Math.max(rect.width * 2.2, 200);
    cvs.height = Math.max(rect.height * 4, 60);
    cvs.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:5;width:${cvs.width / window.devicePixelRatio || cvs.width}px;height:${cvs.height / window.devicePixelRatio || cvs.height}px;`;
    parent.appendChild(cvs);
    const ctx = cvs.getContext('2d');

    const pts = Array.from({ length: 28 }, () => ({
      x: cvs.width * (0.2 + Math.random() * 0.6),
      y: cvs.height * (0.2 + Math.random() * 0.6),
      r: Math.random() * 2.2 + 0.6,
      vx: (Math.random() - 0.5) * 2.2,
      vy: (Math.random() - 0.5) * 2.2 - 0.5,
      col: GOLDS[Math.floor(Math.random() * GOLDS.length)],
      delay: Math.random() * 0.4,
    }));

    // fade out text
    gsap.to(el, { autoAlpha: 0, scale: 0.88, duration: 0.3, ease: 'power2.in', onComplete() {
      el.textContent = nextTag;
    }});

    // run sparkle canvas for ~1.2s (72 frames)
    let f = 0;
    const TOTAL = 72;
    (function tick() {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      const prog = f / TOTAL;
      pts.forEach(p => {
        const lp = Math.max(0, (prog - p.delay) / (1 - p.delay + 0.001));
        if (!lp) return;
        const a = lp < 0.5 ? lp * 2 : 2 - lp * 2;
        const px = p.x + p.vx * f * 0.7;
        const py = p.y + p.vy * f * 0.7;
        ctx.save();
        ctx.globalAlpha = a * 0.92;
        ctx.fillStyle = p.col;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 7;
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
      else {
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        cvs.remove();
        parent.style.position = '';
      }
    })();

    // fade new text in after sparkle peak (~frame 36 ≈ 0.6s)
    gsap.delayedCall(0.55, () => {
      gsap.fromTo(el,
        { autoAlpha: 0, scale: 0.92 },
        { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'power3.out', onComplete() { busy = false; } }
      );
    });
  }

  setInterval(() => {
    index = (index + 1) % tags.length;
    sparkleSwap(tags[index]);
  }, 4000);
}
