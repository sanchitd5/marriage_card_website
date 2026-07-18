import { NAMES, SONGS, WEDDING_TS, REVEAL_DATE, EVENT_DATES, EVENT_VENUES, REVEAL_COUPLE, GALLERY } from './couple.mjs';

// SONGS is auto-discovered from assets/audio/theme-N.mp3 at build time.
// WEDDING_TS / EVENT_DATES / EVENT_VENUES are build-gated: null while
// site.config revealDate is false, so NO date- or venue-identifying value
// ships in this (verbatim-copied) module until the reveal.
// GALLERY is build-gated too: while REVEAL_COUPLE is false the couple's photo
// filenames and captions are stripped (only grid-sizing classes remain) and the
// photo files are excluded from dist — leak-proof, not merely hidden.
export { NAMES, SONGS, WEDDING_TS, REVEAL_DATE, REVEAL_COUPLE, GALLERY };

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

