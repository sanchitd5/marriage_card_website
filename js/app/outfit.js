import { OUTFIT_REVEAL_TS } from './config.js';
import { fetchTrustedNowMs } from './time.js';

// Outfit veil: the couple illustration ships recoloured (art-couple-veiled.jpg)
// and swaps to the true colours once authoritative server time (not the device
// clock) passes OUTFIT_REVEAL_TS. 0 = reveal now, null/no trusted time = stay veiled.
// Trade-off (same as the gallery photos): NOT leak-proof, the true image ships in
// dist and is reachable by direct URL.
function reveal(img) {
  const next = new Image();
  next.onload = () => { img.src = next.src; };
  next.src = img.dataset.true;
}

export function initOutfitReveal() {
  const img = document.getElementById('couple-art');
  if (!img || !img.dataset.true || OUTFIT_REVEAL_TS == null) return;
  if (OUTFIT_REVEAL_TS === 0) { reveal(img); return; }
  fetchTrustedNowMs().then(now => {
    if (now != null && now >= OUTFIT_REVEAL_TS) reveal(img);
  });
}
