import { NAMES, SONGS, WEDDING_TS, REVEAL_DATE, EVENT_DATES, EVENT_VENUES } from './couple.mjs';

// SONGS is auto-discovered from assets/audio/theme-N.mp3 at build time.
// WEDDING_TS / EVENT_DATES / EVENT_VENUES are build-gated: null while
// site.config revealDate is false, so NO date- or venue-identifying value
// ships in this (verbatim-copied) module until the reveal.
export { NAMES, SONGS, WEDDING_TS, REVEAL_DATE };

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

export const GALLERY = [
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
