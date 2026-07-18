import { NAMES, SONGS, WEDDING_TS, REVEAL_DATE, EVENT_DATES, EVENT_VENUES, COUPLE_REVEAL_TS, GALLERY } from './couple.mjs';

// SONGS is auto-discovered from assets/audio/theme-N.mp3 at build time.
// WEDDING_TS / EVENT_DATES / EVENT_VENUES are build-gated: null while
// site.config revealDate is false, so NO date- or venue-identifying value
// ships in this (verbatim-copied) module until the reveal.
// COUPLE_REVEAL_TS is the epoch-ms when the couple's gallery photos unlock
// (weddingTs + offset); gallery.js reveals them at RUNTIME against authoritative
// server time (0 = reveal now, null = stay hidden). No redeploy needed.
export { NAMES, SONGS, WEDDING_TS, REVEAL_DATE, COUPLE_REVEAL_TS, GALLERY };

const D = EVENT_DATES || {};
const V = EVENT_VENUES || {};

// Only non-identifying copy (blurb + dress code) lives here; venue name, map
// link and dates come from the generated module and are absent while hidden.
const BLURB = {
  haldi: 'The first affair of the celebrations. Dress code: shades of yellow.',
  cocktail: 'An evening of toasts and rings. Dress code: dazzling as you dare.',
  wedding: 'The grand affair: baraat, pheras and forever. Dress code: traditional grandeur.',
};
const mkEvent = (key, title) => ({
  title,
  ...(D[key] || {}),
  ...(V[key]
    ? { location: V[key].location, description: `${BLURB[key]} Directions: ${V[key].map}` }
    : {}),
});
export const EVENTS = {
  haldi: mkEvent('haldi', `Haldi — ${NAMES.pairTitle}`),
  cocktail: mkEvent('cocktail', `Cocktail & Engagement — ${NAMES.pairTitle}`),
  wedding: mkEvent('wedding', `Wedding of ${NAMES.pairTitle}`),
};

