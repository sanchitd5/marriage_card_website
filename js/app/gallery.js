import { GALLERY } from './config.js';
import { $ } from './dom.js';

const escAttr = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export function buildGallery() {
  const grid = $('#gallery-grid');
  if (!grid) return;

  // Couple gate closed: build.js stripped every src/alt (and excluded the photo
  // files from dist), so there is nothing to reveal. Show a single veiled panel
  // instead of the masonry, keeping the couple's photos secret.
  if (GALLERY.every(p => !p.src)) {
    grid.classList.add('gallery-grid--veiled');
    grid.innerHTML =
      `<figure class="gframe gframe--veiled fade-up">
         <span class="veil-motif" aria-hidden="true">&#10022;</span>
         <p class="veil-note">Their story is kept close, to be unveiled after the celebration</p>
       </figure>`;
    return;
  }

  grid.innerHTML = GALLERY.map((p, i) =>
    `<figure class="gframe ${p.cls || ''} fade-up">
       <img src="assets/photos/${p.src}.jpg" alt="${escAttr(p.alt)}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">
     </figure>`).join('');
}
