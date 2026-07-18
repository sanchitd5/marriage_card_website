// Single source of truth for couple identifiers used by build.js.
// Node + browser friendly ESM (no imports).
//
// FROM_GROOM_SIDE flips which side renders first everywhere on the page.
// See build.js for how these fields fan out into HTML/manifest/JS tokens.

export const groom = {
  first: 'Sanchit',
  last: 'Dang',
  full: 'Sanchit Dang',
  initial: 'S',
  surname: 'Dang',
  hashtag: '#SanchitKiRiya',
  role: 'groom',
  parents: 'Ajay & Geeta Dang',
  grandparents: 'Late Shri Subhash Chander & Mrs. Raj Rani Dang',
};

export const bride = {
  first: 'Riya',
  last: 'Verma',
  full: 'Riya Verma',
  initial: 'R',
  surname: 'Verma',
  hashtag: '#RiyaKaSanchit',
  role: 'bride', 
  parents: 'Vishal & Renu Verma',
  grandparents: 'Late Shri Vijay Prakash & Mrs. Sushma Verma',
};

// Absolute site origins, no trailing slash. Used to build absolute OG/Twitter
// share URLs and the canonical link (WhatsApp/Facebook require an absolute URL).
// Each side deploys to its own domain; build.js picks by FROM_GROOM_SIDE.
export const siteUrls = {
  groom: 'https://sanchitkiriya.netlify.app', // FROM_GROOM_SIDE=true  (default)
  bride: 'https://riyakasanchit.netlify.app', // FROM_GROOM_SIDE=false
};

// Back-compat single export (groom origin).
export const siteUrl = siteUrls.groom;

// ── Date reveal gate ─────────────────────────────────────────────────
// Flip to `true` only when you are ready to publish the wedding dates.
// While `false`, NO date (hero line, countdown, scratch reveal, event
// times, meta/OG copy, ICS files) is emitted into the built site — the
// date cannot leak from page source before you choose to reveal it.
export const revealDate = false; // false → hide all date info, true → show real date info

// Real date data. Emitted into the build ONLY when revealDate is true.
export const wedding = {
  weddingTsUTC: [2026, 11, 12, 13, 30, 0], // Date.UTC args → 12 Dec 2026, 19:00 IST
  heroDate: '11 <span class="hero-amp">&amp;</span> 12 December 2026',
  heroLocation: 'Chandigarh &amp; Ambala',
  titleDate: ' · 12 December 2026',
  monthYear: 'December 2026',
  metaLocation: ', Chandigarh & Ambala', // leading comma; joins the meta sentence
  dateRange: '11–12 December 2026',
  scratchDate: '12·12·2026',
  scratchSub: "seven o'clock in the evening",
  events: {
    haldi:    { when: "Friday, 11 December 2026 · 11 o'clock in the morning", datetime: '2026-12-11T11:00+05:30', start: '20261211T053000Z', end: '20261211T083000Z', venue: 'Radisson Hotel Chandigarh Zirakpur', map: 'https://maps.app.goo.gl/fQhBFytYAZKu4qBB7' },
    cocktail: { when: "Friday, 11 December 2026 · 8 o'clock in the evening",  datetime: '2026-12-11T20:00+05:30', start: '20261211T143000Z', end: '20261211T183000Z', venue: 'Radisson Hotel Chandigarh Zirakpur', map: 'https://maps.app.goo.gl/fQhBFytYAZKu4qBB7' },
    wedding:  { when: "Saturday, 12 December 2026 · 7 o'clock in the evening", datetime: '2026-12-12T19:00+05:30', start: '20261212T133000Z', end: '20261212T183000Z', venue: "De'vansh Resort, Ambala Cantt", map: 'https://maps.app.goo.gl/RdueUZ2XfNiAnbD18' },
  },
};

// Placeholder copy used wherever a date/venue would appear while hidden.
// heroLine replaces the whole date+location line with a suspense quote so no
// date OR place is hinted on the hero.
export const weddingHidden = {
  heroLine: '“Some love stories are worth the wait…”',
  titleDate: '',
  monthYear: 'coming soon',
  metaLocation: '',
  dateRange: 'coming soon',
  scratchDate: 'Coming soon',
  scratchSub: 'stay tuned',
  eventWhen: 'Date &amp; time to be announced',
  eventVenue: 'Venue to be announced',
};
