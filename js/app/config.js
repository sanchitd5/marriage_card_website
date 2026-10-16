import { NAMES, SONGS, WEDDING_TS, REVEAL_DATE, EVENT_DATES, EVENT_VENUES, EVENT_COPY, COUPLE_REVEAL_TS, OUTFIT_REVEAL_TS, GALLERY } from './couple.mjs';

// SONGS is auto-discovered from assets/audio/theme-N.mp3 at build time.
// WEDDING_TS / EVENT_DATES / EVENT_VENUES are build-gated: null while
// site.config revealDate is false, so NO date- or venue-identifying value
// ships in this (verbatim-copied) module until the reveal.
// COUPLE_REVEAL_TS is the epoch-ms when the couple's gallery photos unlock
// (weddingTs + offset); gallery.js reveals them at RUNTIME against authoritative
// server time (0 = reveal now, null = stay hidden). No redeploy needed.
export { NAMES, SONGS, WEDDING_TS, REVEAL_DATE, COUPLE_REVEAL_TS, OUTFIT_REVEAL_TS, GALLERY };

const D = EVENT_DATES || {};
const V = EVENT_VENUES || {};
// Side-specific copy (side-hosted events) is emitted by the build only
// on the side that hosts it, so the other side's dist never names it.
const C = EVENT_COPY || {};

// Only non-identifying copy (title + blurb + dress code) lives here; venue
// name, map link and dates come from the generated module and are absent
// while hidden. This module ships verbatim and must NOT import
// events.config.mjs (leak-proofing), so the copy is duplicated by hand —
// test/events.test.mjs fails when an EVENT_DEFS id is missing from TITLES,
// because that event's "Add to calendar" button could never activate.
const TITLES = {
  mehndi: `Mehndi — ${NAMES.pairTitle}`,
  haldi: `Haldi — ${NAMES.pairTitle}`,
  cocktail: `Cocktail — ${NAMES.pairTitle}`,
  baraat: `Baraat — ${NAMES.pairTitle}`,
  wedding: `Wedding of ${NAMES.pairTitle}`,
};
const BLURB = {
  mehndi: 'Henna, dholki and a late start to the week. Dress code: colour, and plenty of it.',
  haldi: 'The first affair of the celebrations. Dress code: shades of yellow.',
  cocktail: 'An evening of toasts and dancing. Dress code: dazzling as you dare.',
  baraat: 'The procession. Bring noise. Dress code: dancing shoes, no exceptions.',
  wedding: 'The grand affair: baraat, pheras and forever. Dress code: traditional grandeur.',
};
const mkEvent = (key) => ({
  title: TITLES[key] || (C[key] && C[key].title) || `${NAMES.pairTitle} — Wedding`,
  description: BLURB[key] || (C[key] && C[key].description) || '',
  ...(D[key] || {}),
  ...(V[key]
    ? { location: [V[key].location, V[key].address].filter(Boolean).join(', '), description: [BLURB[key] || (C[key] && C[key].description), V[key].note, `Directions: ${V[key].map}`].filter(Boolean).join(' ') }
    : {}),
});
// One entry per event we have copy for, PLUS any id the build revealed dates
// or venues for: a newly revealed event must never render a dead
// "Add to calendar" button just because this map went stale.
export const EVENTS = Object.fromEntries(
  [...new Set([...Object.keys(TITLES), ...Object.keys(C), ...Object.keys(D), ...Object.keys(V)])]
    .map((key) => [key, mkEvent(key)]),
);

