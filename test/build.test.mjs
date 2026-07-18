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
  renderFamilySide,
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
    hashtag: '#a', role: 'groom', parents: 'P & Q',
    paternalGrandparents: 'G <one>', maternalGrandparents: 'G <mat-a>',
  },
  bride: {
    first: 'B', full: 'B Full', initial: 'B', surname: 'BS',
    hashtag: '#b', role: 'bride', parents: 'R & S',
    paternalGrandparents: "G'two", maternalGrandparents: "G'mat-b",
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

// ---- renderFamilySide -------------------------------------------------
test('renderFamilySide: primary side shows both grandparent sets + parents', () => {
  const html = renderFamilySide(
    { role: 'groom', parents: 'P & Q', paternalGrandparents: 'G <one>', maternalGrandparents: 'G two' },
    { primary: true },
  );
  assert.match(html, /Grand Parents of the groom/);
  assert.match(html, /Parents of the groom/);
  assert.match(html, /P &amp; Q/);
  assert.match(html, /G &lt;one&gt;/); // paternal, escaped
  assert.match(html, /G two/); // maternal
  assert.match(html, /class="family-side fade-up"/);
});
test('renderFamilySide: secondary side is parents-only (no grandparents)', () => {
  const html = renderFamilySide({
    role: 'bride', parents: 'R & S', paternalGrandparents: 'GP', maternalGrandparents: 'GM',
  });
  assert.match(html, /Parents of the bride/);
  assert.match(html, /R &amp; S/);
  assert.doesNotMatch(html, /Grand Parents of the bride/);
  assert.doesNotMatch(html, /GP|GM/);
});
test('renderFamilySide: placeholder grandparent set is skipped', () => {
  const html = renderFamilySide(
    { role: 'groom', parents: 'P & Q', paternalGrandparents: 'Real GP', maternalGrandparents: 'Names to be added' },
    { primary: true },
  );
  assert.match(html, /Real GP/);
  assert.doesNotMatch(html, /Names to be added/);
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
  const fields = ['first', 'full', 'initial', 'surname', 'hashtag', 'role', 'parents', 'paternalGrandparents'];
  for (const side of [groom, bride]) {
    for (const k of fields) {
      assert.ok(side[k] && String(side[k]).trim().length > 0, `${side.role}.${k} missing`);
    }
    // paternal set must be real; maternal may still be the "Names to be added"
    // placeholder (skipped at render time) until supplied.
    assert.doesNotMatch(side.paternalGrandparents, /to be (updated|added)/i, `${side.role} paternal grandparents still placeholder`);
  }
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
