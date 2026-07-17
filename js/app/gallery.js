import { GALLERY } from './config.js';
import { $ } from './dom.js';

export function buildGallery() {
  const grid = $('#gallery-grid');
  if (!grid) return;

  grid.innerHTML = GALLERY.map((p, i) =>
    `<figure class="gframe ${p.cls || ''} fade-up">
       <img src="assets/photos/${p.src}.jpg" alt="${p.alt}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">
     </figure>`).join('');
}
