// ── Event management — the single source of truth, shared by BOTH skins ──
//
// Previously the run-of-show lived inline in `wedding.events` (site.config.mjs)
// as exactly three events, hardcoded, identical for everyone. Three things broke
// that model:
//
//  1. THE SIDES DO NOT SHARE A PROGRAMME. Haldi, the Cocktail/Engagement and the
//     Wedding are joint, but each family also hosts its own functions — the
//     groom's Mehndi is at his home, and the Baraat is a groom-side procession.
//     A bride-first build must not advertise the groom's Mehndi as if the guest
//     were invited to it.
//  2. NOT EVERY GUEST IS INVITED TO EVERY EVENT, so one card cannot serve
//     everyone. The invitation needs variants that show a guest only the events
//     they are actually invited to — an "all functions" card for close family, a
//     wedding-only card for wider circles, and so on.
//  3. Both the Regency and the kinetic skins render the same programme, so the
//     data cannot live in either skin's template.
//
// LEAK-PROOFING. This file follows the same rule as `wedding` in
// site.config.mjs: real dates and venues live ONLY here and are injected at
// build time behind `revealDate`. Nothing here may be imported directly by
// anything under js/ that ships to the browser — the build reads it, gates it,
// and emits only what is allowed to be public. See CLAUDE.md.

// Which side hosts an event. 'both' = a joint function that appears on every
// build; 'groom' / 'bride' = a side-specific function that appears only on that
// side's build (FROM_GROOM_SIDE), because the other side's guests are not
// hosting it.
export const SIDE = { BOTH: 'both', GROOM: 'groom', BRIDE: 'bride' };

// The canonical programme. Order here is the RUN OF SHOW order and is
// chronological: Haldi in the morning, then the Cocktail/Engagement, then the
// Baraat and the Wedding on the 12th. Confirmed with the couple.
//
// `date` / `time` / `venue` / `map` are the gated fields — they are only ever
// emitted when revealDate is true. `blurb` and `dress` are non-identifying and
// safe to ship while the dates are still hidden.
export const EVENT_DEFS = [
  {
    id: 'mehndi',
    name: 'Mehndi',
    side: SIDE.GROOM,          // hosted at the groom's home
    dress: 'Colour, and plenty of it',
    blurb: 'Henna, dholki and a late start to the week.',
    venueNote: "At the groom's home",
  },
  {
    id: 'haldi',
    name: 'Haldi',
    side: SIDE.BOTH,
    dress: 'Shades of yellow',
    blurb: 'Turmeric, laughter, and clothes you will never get clean again.',
  },
  {
    id: 'cocktail',
    name: 'Cocktail & Engagement',
    side: SIDE.BOTH,
    dress: 'Dazzling as you dare',
    blurb: 'Rings exchanged, then the floor opens.',
  },
  {
    id: 'baraat',
    name: 'Baraat',
    side: SIDE.GROOM,          // the groom's procession
    date: '2026-12-12',        // confirmed
    dress: 'Dancing shoes, no exceptions',
    blurb: "The procession. Bring noise.",
  },
  {
    id: 'wedding',
    name: 'The Wedding',
    side: SIDE.BOTH,
    dress: 'Traditional grandeur',
    blurb: 'The vows, the fire, the seven steps.',
  },
];

// ── Invite variants ──────────────────────────────────────────────────
// A guest is sent one variant, and the card renders only that variant's events.
// `events: null` is deliberate shorthand for "every event valid for this build's
// side" so the default card never has to be kept in sync by hand as the
// programme grows.
export const INVITE_VARIANTS = {
  // close family and the wedding party: everything their side hosts
  full:    { id: 'full',    label: 'All functions', events: null },
  // friends invited to the celebration functions but not the home Mehndi
  friends: { id: 'friends', label: 'Celebrations', events: ['haldi', 'cocktail', 'baraat', 'wedding'] },
  // the widest circle: the ceremony itself
  wedding: { id: 'wedding', label: 'Wedding only',  events: ['wedding'] },
};

export const DEFAULT_VARIANT = 'full';

// ── Pure selectors (unit-tested; no filesystem, no side effects) ──────

// Is this event hosted on the side the current build speaks for?
export function isEventForSide(event, fromGroomSide) {
  if (!event || !event.side || event.side === SIDE.BOTH) return true;
  return event.side === (fromGroomSide ? SIDE.GROOM : SIDE.BRIDE);
}

// Resolve a variant name to its definition, falling back to the default rather
// than throwing: a bad ?invite= value in a shared link must still render a card.
export function resolveVariant(name) {
  return INVITE_VARIANTS[name] || INVITE_VARIANTS[DEFAULT_VARIANT];
}

// The programme for one build: this side's events, filtered to the variant, in
// run-of-show order. Returns event definitions untouched — gating the date and
// venue fields is the build's job, not this module's.
export function eventsForInvite(variantName, fromGroomSide, defs = EVENT_DEFS) {
  const variant = resolveVariant(variantName);
  return defs
    .filter((e) => isEventForSide(e, fromGroomSide))
    .filter((e) => (variant.events ? variant.events.includes(e.id) : true));
}
