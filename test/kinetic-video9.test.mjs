// Authored-beat math for the theme-9 fullscreen video takeover.
// The client specified exact instants; these lock them so a refactor can't drift
// the fade-in or the HUD solo window.
//   Video plays its own audio, fullscreen, for the whole track.
//   HUD solo window: 3:00 (180s) HUD hides · 3:35 (215s) HUD returns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK, FADE_IN, HUD_HIDE, HUD_SHOW, videoOpacityAt, hudHiddenAt,
} from '../js/app/kinetic-video9-timing.js';

test('it is the theme-9 track', () => {
  assert.equal(TRACK, 'techno/theme-9');
});

test('authored instants: fade-in and the 3:00→3:35 HUD window', () => {
  assert.equal(FADE_IN, 0.5);
  assert.equal(HUD_HIDE, 180); // 3:00
  assert.equal(HUD_SHOW, 215); // 3:35
});

test('video opacity: 0 at the cut, linear fade-in, then solid', () => {
  assert.equal(videoOpacityAt(0), 0);
  assert.equal(videoOpacityAt(-5), 0);
  assert.ok(Math.abs(videoOpacityAt(FADE_IN / 2) - 0.5) < 1e-9);
  assert.equal(videoOpacityAt(FADE_IN), 1);
  for (const t of [FADE_IN, 1, 60, 180, 215, 298]) {
    assert.equal(videoOpacityAt(t), 1, `t=${t} solid`);
  }
});

test('HUD hidden ONLY inside [3:00, 3:35)', () => {
  for (const t of [0, 60, 179.9, HUD_SHOW, 215.1, 300]) {
    assert.equal(hudHiddenAt(t), false, `t=${t} HUD shown`);
  }
  for (const t of [HUD_HIDE, 180.1, 200, 214.999]) {
    assert.equal(hudHiddenAt(t), true, `t=${t} HUD hidden`);
  }
});
