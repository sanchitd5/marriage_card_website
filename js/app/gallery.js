import { GALLERY, COUPLE_REVEAL_TS } from './config.js';
import { $ } from './dom.js';
import { fetchTrustedNowMs } from './time.js';

const escAttr = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function photosHTML() {
  return GALLERY.map((p, i) =>
    `<figure class="gframe ${p.cls || ''} fade-up">
       <img src="assets/photos/${p.src}.jpg" alt="${escAttr(p.alt)}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">
     </figure>`).join('');
}

const VEILED_HTML =
  `<figure class="gframe gframe--veiled fade-up">
     <span class="veil-motif" aria-hidden="true">&#10022;</span>
     <p class="veil-note">Their story is kept close, to be unveiled after the celebration</p>
   </figure>`;

function renderVeiled(grid) {
  grid.classList.add('gallery-grid--veiled');
  grid.innerHTML = VEILED_HTML;
}

// Swap the veiled panel for the real masonry. Because this can run AFTER the
// ScrollTrigger.batch('.fade-up') snapshot (the reveal check is async), the new
// figures aren't in that batch — reveal them directly so they don't stay at
// opacity:0, and refresh ScrollTrigger for the new layout.
function renderPhotos(grid) {
  grid.classList.remove('gallery-grid--veiled');
  grid.innerHTML = photosHTML();
  const frames = grid.querySelectorAll('.gframe');
  if (window.gsap) {
    gsap.fromTo(frames, { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: .6, ease: 'power2.out', stagger: .06, clearProps: 'transform' });
  } else {
    frames.forEach(f => f.classList.remove('fade-up')); // ensure visible without JS anim
  }
  if (window.ScrollTrigger) ScrollTrigger.refresh();
}

export function buildGallery() {
  const grid = $('#gallery-grid');
  if (!grid) return;

  if (COUPLE_REVEAL_TS === 0) { renderPhotos(grid); return; }   // forced reveal
  if (COUPLE_REVEAL_TS == null) { renderVeiled(grid); return; } // forced / fail-safe hidden

  // Default: keep the photos veiled until authoritative (server) time reaches
  // the reveal moment — checked at runtime so the gallery unlocks with no
  // redeploy, and can't be forced early by changing the device clock.
  renderVeiled(grid);
  fetchTrustedNowMs().then(now => {
    if (now != null && now >= COUPLE_REVEAL_TS) renderPhotos(grid);
    // now == null (no trusted time) or before reveal → stay veiled (fail-safe)
  });
}
