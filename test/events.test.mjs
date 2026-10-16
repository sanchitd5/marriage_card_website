import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIDE, EVENT_DEFS, INVITE_VARIANTS, DEFAULT_VARIANT,
  isEventForSide, resolveVariant, eventsForInvite,
} from '../events.config.mjs';

const ids = (list) => list.map((e) => e.id);

test('side filter: joint events appear on both builds', () => {
  const haldi = EVENT_DEFS.find((e) => e.id === 'haldi');
  assert.equal(isEventForSide(haldi, true), true);
  assert.equal(isEventForSide(haldi, false), true);
});

test('side filter: a groom-side function is hidden from the bride-first build', () => {
  // The Mehndi is at the groom's home and the Baraat is his procession; a
  // bride-first card must not advertise either as if the guest were invited.
  for (const id of ['mehndi', 'baraat']) {
    const ev = EVENT_DEFS.find((e) => e.id === id);
    assert.equal(ev.side, SIDE.GROOM, `${id} should be groom-side`);
    assert.equal(isEventForSide(ev, true), true, `${id} shows groom-first`);
    assert.equal(isEventForSide(ev, false), false, `${id} must not show bride-first`);
  }
});

test('run of show is chronological, and the confirmed events are present', () => {
  const order = ids(EVENT_DEFS);
  assert.deepEqual(order, ['chowki', 'mehndi', 'haldi', 'cocktail', 'baraat', 'wedding']);
  // Haldi in the morning, then the engagement, then the wedding — confirmed.
  assert.ok(order.indexOf('haldi') < order.indexOf('cocktail'));
  assert.ok(order.indexOf('cocktail') < order.indexOf('wedding'));
  // the Baraat leads into the wedding on the same day
  assert.ok(order.indexOf('baraat') < order.indexOf('wedding'));
  assert.equal(EVENT_DEFS.find((e) => e.id === 'baraat').date, '2026-12-12');
});

test('variant "full" means every event valid for the side, not a frozen list', () => {
  assert.equal(INVITE_VARIANTS.full.events, null);
  assert.deepEqual(ids(eventsForInvite('full', true)), ['chowki', 'mehndi', 'haldi', 'cocktail', 'baraat', 'wedding']);
  assert.deepEqual(ids(eventsForInvite('full', false)), ['haldi', 'cocktail', 'wedding']);
});

test('variant narrows the programme, and side filtering still applies', () => {
  assert.deepEqual(ids(eventsForInvite('wedding', true)), ['wedding']);
  assert.deepEqual(ids(eventsForInvite('friends', true)), ['haldi', 'cocktail', 'baraat', 'wedding']);
  // friends variant lists the Baraat, but only the groom's side hosts it
  assert.deepEqual(ids(eventsForInvite('friends', false)), ['haldi', 'cocktail', 'wedding']);
});

test('an unknown variant falls back rather than throwing', () => {
  // a bad ?invite= in a forwarded link must still render a card
  assert.equal(resolveVariant('nonsense').id, DEFAULT_VARIANT);
  assert.deepEqual(ids(eventsForInvite(undefined, true)), ids(eventsForInvite(DEFAULT_VARIANT, true)));
});

test('selectors are pure: the definitions are never mutated', () => {
  const before = JSON.stringify(EVENT_DEFS);
  eventsForInvite('friends', true);
  eventsForInvite('wedding', false);
  assert.equal(JSON.stringify(EVENT_DEFS), before);
});

// ---- buildEventCards (the rendered run of show) -----------------------
import { buildEventCards, composeNames } from '../build.js';

test('buildEventCards: renders one card per event, numbered in order', () => {
  const html = buildEventCards(composeNames(true), false, true, 'full');
  const names = [...html.matchAll(/event-name">([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(names, ['Mata ki Chowki', 'Mehndi', 'Haldi', 'Cocktail', 'Baraat', 'The Wedding']);
  // the "Track NN" label was dropped: the DJ noun sat oddly on sacred functions,
  // and the number alone carries the running order
  assert.deepEqual([...html.matchAll(/event-no">(\d+)</g)].map((m) => m[1]), ['01', '02', '03', '04', '05']);
  assert.ok(!/Track \d/.test(html), 'no DJ noun on the run of show');
});

test('buildEventCards: the bride-first build drops the groom-side functions', () => {
  const html = buildEventCards(composeNames(false), false, false, 'full');
  assert.ok(!/Mehndi/.test(html), 'Mehndi is hosted at the groom\'s home');
  assert.ok(!/Baraat/.test(html), 'the Baraat is the groom\'s procession');
  assert.ok(/Haldi/.test(html) && /The Wedding/.test(html));
});

test('buildEventCards: a variant narrows the card to that guest\'s events', () => {
  const html = buildEventCards(composeNames(true), false, true, 'wedding');
  // count card elements, not the "event-card" substring — the headliner card's
  // class list ("event-card event-card--main") contains it twice
  assert.equal((html.match(/<article class="event-card/g) || []).length, 1);
  assert.ok(/The Wedding/.test(html));
});

test('buildEventCards: leaks no date or venue while hidden', () => {
  const html = buildEventCards(composeNames(true), false, true, 'full');
  // no real venue names, no map links, no datetime values, no directions button
  assert.ok(!/maps\.app\.goo\.gl/.test(html), 'no map links while gated');
  assert.ok(!/Radisson|De'vansh|Ambala|Zirakpur/.test(html), 'no venue names while gated');
  assert.ok(!/datetime="20\d\d/.test(html), 'no real datetimes while gated');
  assert.ok(!/Get directions/.test(html), 'directions hidden while gated');
});

test('buildEventCards: reveals the gated fields once revealDate flips', () => {
  const html = buildEventCards(composeNames(true), true, true, 'full');
  assert.ok(/Get directions/.test(html), 'directions appear on reveal');
  assert.ok(/datetime="20\d\d/.test(html), 'real datetimes appear on reveal');
});

test('buildEventCards: while gated, cards carry no per-card placeholder lines', () => {
  const html = buildEventCards(composeNames(true), false, true, 'full');
  // the programme states the gate ONCE above the list, not once per card
  assert.ok(!/to be announced/i.test(html), 'no repeated placeholder lines');
  assert.ok(!/<time/.test(html), 'no empty time elements while gated');
  // what IS known still shows
  assert.ok(/At the groom&#39;s home/.test(html), 'a standing venue note survives the gate');
  assert.ok(/Shades of yellow/.test(html), 'dress codes are not gated');
});

test('buildEventCards: exactly one headliner card, and it is the wedding', () => {
  const html = buildEventCards(composeNames(true), false, true, 'full');
  const main = [...html.matchAll(/event-card event-card--main[\s\S]*?event-name">([^<]*)</g)];
  assert.equal(main.length, 1, 'exactly one .event-card--main');
  assert.equal(main[0][1], 'The Wedding');
});

// ---- runtime calendar wiring (js/app/config.js) ------------------------
// The shipped config cannot import this file (leak-proofing), so its TITLES
// copy can drift when events are added — which is exactly how the Mehndi and
// Baraat cards shipped with "Add to calendar" buttons that could never
// activate. This is the guard: every event on the card must have a runtime
// EVENTS entry, or its button stays dead even after the reveal.
import { EVENTS } from '../js/app/config.js';

test('every EVENT_DEFS id has a runtime EVENTS entry for its calendar button', () => {
  for (const def of EVENT_DEFS) {
    assert.ok(EVENTS[def.id], `EVENTS['${def.id}'] missing — dead "Add to calendar" button`);
    assert.ok(EVENTS[def.id].title.includes('—') || EVENTS[def.id].title.length > 0, 'entry carries a calendar title');
  }
});

// ---- eventCalendar (Add to calendar data) -------------------------------
import { eventCalendar } from '../build.js';

test('eventCalendar: timed event passes start/end through', () => {
  assert.deepEqual(
    eventCalendar({ id: 'haldi' }, { start: '20261211T053000Z', end: '20261211T083000Z' }),
    { start: '20261211T053000Z', end: '20261211T083000Z' },
  );
});

test('eventCalendar: date-only event becomes all-day with exclusive next-day end', () => {
  assert.deepEqual(eventCalendar({ date: '2026-12-12' }, undefined),
    { start: '20261212', end: '20261213', allDay: true });
  assert.equal(eventCalendar({ date: '2026-12-31' }).end, '20270101');
});

test('eventCalendar: no date at all gives null (no button)', () => {
  assert.equal(eventCalendar({ id: 'mehndi' }, undefined), null);
});

test('buildEventCards: Mehndi renders no calendar button, Baraat does when revealed', () => {
  const html = buildEventCards(composeNames(true), true, true, 'full');
  assert.ok(!html.includes('data-ics="mehndi"'));
  assert.ok(html.includes('data-ics="baraat"'));
  assert.ok(html.includes('data-ics="haldi"'));
});

// ---- Mata ki Chowki prelude ---------------------------------------------
import { splitProgramme } from '../events.config.mjs';
import { buildHtmlTokens } from '../build.js';
import { wedding } from '../site.config.mjs';

test('splitProgramme: chowki is the prelude, programme numbering unchanged', () => {
  const { prelude, main } = splitProgramme(eventsForInvite('full', true));
  assert.deepEqual(ids(prelude), ['chowki']);
  assert.deepEqual(ids(main), ['mehndi', 'haldi', 'cocktail', 'baraat', 'wedding']);
});

test('chowki: groom build only, full variant only, unnumbered and first', () => {
  const g = buildEventCards(composeNames(true), true, true, 'full');
  assert.ok(g.indexOf('Mata ki Chowki') < g.indexOf('Mehndi'));
  assert.ok(/event-card--prelude/.test(g) && /Dinner at 9/.test(g) && /Khukhrain/.test(g));
  assert.deepEqual([...g.matchAll(/event-no">(\d+)</g)].map((m) => m[1]), ['01', '02', '03', '04', '05']);
  assert.ok(!/Chowki/.test(buildEventCards(composeNames(false), true, false, 'full')));
  for (const v of ['friends', 'wedding']) assert.ok(!/Chowki/.test(buildEventCards(composeNames(true), true, true, v)));
});

test('chowki: hidden build leaks no venue/dinner; calendar entry is 18:00-22:00 IST', () => {
  const h = buildEventCards(composeNames(true), false, true, 'full');
  assert.ok(!/Khukhrain|Dinner|Subhash/.test(h));
  assert.deepEqual(eventCalendar(EVENT_DEFS[0], wedding.events.chowki), { start: '20261207T123000Z', end: '20261207T163000Z' });
});

test('chowki: hero date range stays 11-12 December', () => {
  const t = buildHtmlTokens(composeNames(true), true, 'regency', true, 'full');
  assert.equal(t.DATE_RANGE, '11–12 December 2026');
  assert.ok(!/7 December|Chowki/.test(t.TITLE_DATE + t.DATE_RANGE + t.HERO_LINE));
});

test('chowki: runtime calendar entry carries venue, address, map and dinner', () => {
  const e = EVENTS.chowki;
  assert.equal(e.start, '20261207T123000Z'); assert.equal(e.end, '20261207T163000Z');
  assert.ok(/Khukhrain Bhawan.*Subhash Park Rd/.test(e.location));
  assert.equal(e.title, 'Mata ki Chowki');
  assert.ok(!/wedding|Sanchit|Riya/i.test(e.title + e.description), 'stands alone');
  assert.ok(/Dinner at 9/.test(e.description) && /google\.com\/maps/.test(e.description));
});
