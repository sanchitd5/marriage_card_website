// Authored-beat math for the theme-8 (Taratata) fullscreen video takeover.
// The client specified exact instants; these lock them so a refactor can't drift
// the hide / fade-in / full / return moments.
//   Window A: 0:20 hide-all · 0:22 fade-in · 0:25 full · 0:30 gone, UI back
//   Window B: 2:15 hide-all · 2:17 fade-in · 2:20 full · 2:25 gone, UI back
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, WINDOWS, takeoverStateAt } from '../js/app/kinetic-video-timing.js';

test('it is the Taratata track with two windows', () => {
  assert.equal(TRACK, 'techno/theme-8');
  assert.deepEqual(WINDOWS, [[20, 22, 25, 30], [135, 137, 140, 145]]);
});

test('quiescent outside the windows (and their preroll)', () => {
  for (const t of [0, 10, 16.9, 35, 100, 131.9, 150, 200]) {
    assert.deepEqual(takeoverStateAt(t), { play: false, occlude: false, opacity: 0 }, `t=${t}`);
  }
});

test('preroll: video plays hidden ~3s early, UI still visible (no occlusion, opacity 0)', () => {
  for (const t of [17, 19.9, 132, 134.9]) {
    const s = takeoverStateAt(t);
    assert.equal(s.play, true, `t=${t} plays`);
    assert.equal(s.occlude, false, `t=${t} UI still shown`);
    assert.equal(s.opacity, 0, `t=${t} video hidden`);
  }
});

for (const [label, hide, fade, full, end] of [['A', 20, 22, 25, 30], ['B', 135, 137, 140, 145]]) {
  test(`window ${label}: hide→ everything occluded, video still black`, () => {
    for (const t of [hide, hide + 1, fade - 0.001]) {
      const s = takeoverStateAt(t);
      assert.equal(s.occlude, true, `t=${t} occludes`);
      assert.equal(s.opacity, 0, `t=${t} video not yet faded in`);
    }
  });

  test(`window ${label}: fade→full is a linear 0→1 ramp, UI stays hidden`, () => {
    assert.equal(takeoverStateAt(fade).opacity, 0);
    assert.ok(Math.abs(takeoverStateAt((fade + full) / 2).opacity - 0.5) < 1e-9);
    assert.ok(takeoverStateAt(full - 0.001).opacity > 0.99);
    for (const t of [fade, (fade + full) / 2, full - 0.001]) {
      assert.equal(takeoverStateAt(t).occlude, true, `t=${t} UI hidden during fade`);
    }
  });

  test(`window ${label}: full→end video solid, everything else still hidden`, () => {
    for (const t of [full, full + 1, end - 0.001]) {
      const s = takeoverStateAt(t);
      assert.equal(s.opacity, 1, `t=${t} fully visible`);
      assert.equal(s.occlude, true, `t=${t} UI still hidden`);
    }
  });

  test(`window ${label}: at end the takeover is fully gone (UI back)`, () => {
    assert.deepEqual(takeoverStateAt(end), { play: false, occlude: false, opacity: 0 });
  });
}
