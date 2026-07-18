// Unit tests for build.js pure helpers. Zero deps — Node's built-in runner.
//   npm test   (== node --test test/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseFromGroomSide,
  composeNames,
  htmlEscape,
  joinFamilies,
  buildFamilyBlessing,
  buildHtmlTokens,
  buildManifestTokens,
  applyTokens,
  computeCoupleRevealTs,
  COUPLE_REVEAL_OFFSET_MS,
} from '../build.js';
import { groom, bride } from '../site.config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// Fixture couple with tricky characters ($, &, <, ') to exercise escaping.
const fx = {
  groom: {
    first: 'A$1', full: 'A Full', initial: 'A', surname: 'AS',
    hashtag: '#a', role: 'groom', families: ['Fam <one>', 'Fam Two'],
  },
  bride: {
    first: 'B', full: 'B Full', initial: 'B', surname: 'BS',
    hashtag: '#b', role: 'bride', families: [],
  },
};

// ---- parseFromGroomSide -----------------------------------------------
test('parseFromGroomSide: undefined defaults to true', () => {
  assert.equal(parseFromGroomSide(undefined), true);
});
test('parseFromGroomSide: only literal "false" flips to false', () => {
  assert.equal(parseFromGroomSide('false'), false);
});
test('parseFromGroomSide: "true" and any other string stay true', () => {
  assert.equal(parseFromGroomSide('true'), true);
  assert.equal(parseFromGroomSide('0'), true);
  assert.equal(parseFromGroomSide('no'), true);
  assert.equal(parseFromGroomSide(''), true);
});

// ---- composeNames -----------------------------------------------------
test('composeNames: groom-first keeps groom as side A', () => {
  const n = composeNames(true, fx);
  assert.equal(n.firstA, 'A$1');
  assert.equal(n.firstB, 'B');
  assert.equal(n.initialA, 'A');
  assert.equal(n.initialB, 'B');
  assert.equal(n.pairTitle, 'A$1 & B');
  assert.equal(n.tagPrimary, '#a');
  assert.equal(n.tagSecondary, '#b');
  assert.equal(n.sideA.role, 'groom');
  assert.equal(n.sideB.role, 'bride');
  assert.equal(n.fromGroomSide, true);
});
test('composeNames: bride-first flips every A/B slot', () => {
  const n = composeNames(false, fx);
  assert.equal(n.firstA, 'B');
  assert.equal(n.firstB, 'A$1');
  assert.equal(n.initialA, 'B');
  assert.equal(n.initialB, 'A');
  assert.equal(n.pairTitle, 'B & A$1');
  assert.equal(n.tagPrimary, '#b');
  assert.equal(n.sideA.role, 'bride');
  assert.equal(n.fromGroomSide, false);
});

// ---- htmlEscape -------------------------------------------------------
test('htmlEscape: escapes all five entities', () => {
  assert.equal(htmlEscape(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(htmlEscape('A & B'), 'A &amp; B');
});
test('htmlEscape: coerces non-strings', () => {
  assert.equal(htmlEscape(42), '42');
});
test('htmlEscape: escapes & first so it does not double-encode', () => {
  // '<' becomes '&lt;' — the '&' introduced must not be re-escaped.
  assert.equal(htmlEscape('<'), '&lt;');
});

// ---- joinFamilies / buildFamilyBlessing -------------------------------
test('joinFamilies: single surname → "the X family" (singular)', () => {
  assert.equal(joinFamilies(['Verma']), 'the <span class="fq-fam">Verma</span> family');
});
test('joinFamilies: n surnames → comma list + "&" before last, plural, no Oxford comma', () => {
  const out = joinFamilies(['Dang', 'Bhalla', 'Arora', 'Batra']);
  assert.match(out, /Dang, Bhalla, Arora &amp; Batra/);
  assert.doesNotMatch(out, /Arora, &amp;/); // no serial comma before the ampersand
  assert.match(out, /<\/span> families$/); // plural noun
});
test('joinFamilies: two surnames → "X & Y families" (no comma)', () => {
  assert.match(joinFamilies(['Dang', 'Bhalla']), /Dang &amp; Bhalla<\/span> families/);
});
test('joinFamilies: skips tbd/empty, escapes, respects limit', () => {
  assert.equal(joinFamilies([]), null);
  assert.equal(joinFamilies([{ tbd: true }]), null);
  assert.match(joinFamilies(['A <x>', { tbd: true }]), /A &lt;x&gt;/);
  assert.match(joinFamilies(['Verma', 'Extra'], { limit: 1 }), /Verma<\/span> family$/);
});
test('buildFamilyBlessing: embeds primary (all) + other (first only), leading cap, no numeral', () => {
  const q = buildFamilyBlessing(
    { role: 'groom', families: ['Dang', 'Bhalla', 'Arora', 'Batra'] },
    { role: 'bride', families: ['Verma', { tbd: true }] },
  );
  // \s tolerates the nbsp that binds each article to its surname group
  assert.match(q, /^The\s<span class="fq-fam">Dang, Bhalla, Arora &amp; Batra<\/span> families and the\s<span class="fq-fam">Verma<\/span> family, united in love$/);
  assert.doesNotMatch(q, /To be announced/);
  assert.doesNotMatch(q, /\btwo\b|houses/i); // no count that could contradict the list
});
test('buildFamilyBlessing: falls back when a side has no names', () => {
  const q = buildFamilyBlessing({ role: 'groom', families: [] }, { role: 'bride', families: ['Verma'] });
  assert.equal(q, 'Two families, united in love');
});
test('buildHtmlTokens: FAMILY_BLESSING_NAMES carries the woven quotation', () => {
  const t = buildHtmlTokens(composeNames(true, {
    groom: { ...fx.groom, families: ['Dang', 'Bhalla'] },
    bride: { ...fx.bride, families: ['Verma', { tbd: true }] },
  }));
  assert.match(t.FAMILY_BLESSING_NAMES, /Dang &amp; Bhalla/);
  assert.match(t.FAMILY_BLESSING_NAMES, /Verma/);
  assert.doesNotMatch(t.FAMILY_BLESSING_NAMES, /To be announced/);
});

// ---- applyTokens ------------------------------------------------------
test('applyTokens: inserts $-sequences literally (regression for replacer fix)', () => {
  const out = applyTokens('x {{K}} y', { K: 'A$1$&B' });
  assert.equal(out, 'x A$1$&B y');
});
test('applyTokens: replaces every occurrence', () => {
  assert.equal(applyTokens('{{K}}-{{K}}', { K: 'z' }), 'z-z');
});
test('applyTokens: {{PAIR_TITLE}} does not clobber {{PAIR_TITLE_RAW}}', () => {
  const out = applyTokens('{{PAIR_TITLE}} | {{PAIR_TITLE_RAW}}', {
    PAIR_TITLE: 'esc',
    PAIR_TITLE_RAW: 'raw',
  });
  assert.equal(out, 'esc | raw');
});
test('applyTokens: leaves unknown tokens intact', () => {
  assert.equal(applyTokens('{{NOPE}}', { K: 'z' }), '{{NOPE}}');
});

// ---- buildHtmlTokens / buildManifestTokens ----------------------------
test('buildHtmlTokens: escapes PAIR_TITLE but keeps PAIR_TITLE_RAW raw', () => {
  const t = buildHtmlTokens(composeNames(true, fx));
  assert.equal(t.PAIR_TITLE, 'A$1 &amp; B');
  assert.equal(t.PAIR_TITLE_RAW, 'A$1 & B');
  assert.equal(t.HASHTAG, t.TAG_PRIMARY);
});
test('buildHtmlTokens: FAMILY_BLESSING_NAMES uses fallback when a side has no names', () => {
  const t = buildHtmlTokens(composeNames(true, fx)); // fx bride families = []
  assert.equal(t.FAMILY_BLESSING_NAMES, 'Two families, united in love');
});
test('buildManifestTokens: raw pair title only', () => {
  assert.deepEqual(buildManifestTokens(composeNames(true, fx)), { PAIR_TITLE: 'A$1 & B' });
});

// ---- Template integration (read-only, no writes) ----------------------
const template = fs.readFileSync(path.join(here, '../src/index.template.html'), 'utf8');

test('template: seal + footer monogram use INITIAL tokens (no hardcoded R&S)', () => {
  assert.match(template, /seal-monogram">\{\{INITIAL_A\}\}<em>&amp;<\/em>\{\{INITIAL_B\}\}/);
  assert.match(template, /footer-monogram">\{\{INITIAL_A\}\}<em>&amp;<\/em>\{\{INITIAL_B\}\}/);
  assert.doesNotMatch(template, /seal-monogram">R<em>/);
});
test('template: fully rendered output has no leftover {{TOKENS}}', () => {
  const rendered = applyTokens(template, buildHtmlTokens(composeNames(true)));
  assert.doesNotMatch(rendered, /\{\{[A-Z_]+\}\}/);
});

// ---- Real config sanity (guards against placeholder grandparents) ------
test('site.config: both sides fully populated, no placeholder text', () => {
  const fields = ['first', 'full', 'initial', 'surname', 'hashtag', 'role'];
  for (const side of [groom, bride]) {
    for (const k of fields) {
      assert.ok(side[k] && String(side[k]).trim().length > 0, `${side.role}.${k} missing`);
    }
    assert.ok(Array.isArray(side.families), `${side.role}.families must be an array`);
  }
  // Groom families are set; bride's are pending ([] → "To be announced").
  assert.ok(groom.families.length > 0, 'groom families should be populated');
});

// ---- Couple-photo reveal gate (runtime; build emits the reveal timestamp) --
const WTS = [2026, 11, 12, 13, 30, 0];                    // 12 Dec 2026 13:30 UTC
const REVEAL_AT = Date.UTC(...WTS) + COUPLE_REVEAL_OFFSET_MS;

test('computeCoupleRevealTs: default = weddingTs + offset', () => {
  assert.equal(computeCoupleRevealTs(WTS, undefined), REVEAL_AT);
  assert.equal(COUPLE_REVEAL_OFFSET_MS, 5 * 3600 * 1000);
});

test('computeCoupleRevealTs: REVEAL_COUPLE=true → 0 (reveal now)', () => {
  assert.equal(computeCoupleRevealTs(WTS, 'true'), 0);
});

test('computeCoupleRevealTs: REVEAL_COUPLE=false → null (stay hidden)', () => {
  assert.equal(computeCoupleRevealTs(WTS, 'false'), null);
});

test('computeCoupleRevealTs: invalid timestamp → null (fail safe)', () => {
  assert.equal(computeCoupleRevealTs(undefined, undefined), null);
  assert.equal(computeCoupleRevealTs([2026, 11], undefined), null);
});
