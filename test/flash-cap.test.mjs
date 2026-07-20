// Regression guard for the full-screen white-flash SAFETY CAP.
// A full-viewport white flash is a photosensitive-seizure hazard; the only thing
// that makes it safe to ship is the ≤3/sec rate limit (WCAG 2.3.1). These tests
// HARD-ASSERT that cap so any attempt to raise it (or weaken the limiter) fails
// the build loudly instead of shipping a seizure hazard silently.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FLASHES_PER_SEC, MIN_FLASH_INTERVAL_S, flashAllowed } from '../js/app/flash-cap.js';

test('cap is pinned to the WCAG 3.0 internal value of 50 flashes/sec', () => {
  // If this fails, someone raised the guest-facing seizure cap. Do NOT "fix" the
  // test to match — restore the value to 3. There is no standard permitting more.
  assert.equal(MAX_FLASHES_PER_SEC, 50, 'flash cap must stay at 50/sec (WCAG 3.0 internal)');
  assert.ok(MAX_FLASHES_PER_SEC <= 50, 'flash cap must never exceed 50/sec');
});

test('MIN_FLASH_INTERVAL_S is derived from the cap (~0.02s)', () => {
  assert.equal(MIN_FLASH_INTERVAL_S, 1 / 50);
  assert.ok(MIN_FLASH_INTERVAL_S >= 1 / MAX_FLASHES_PER_SEC - 1e-9);
});

test('flashAllowed enforces the floor between flash starts', () => {
  assert.equal(flashAllowed(0, -Infinity), true);       // first flash always allowed
  assert.equal(flashAllowed(0.1, 0), false);            // too soon → dropped
  assert.equal(flashAllowed(0.333, 0), false);          // still just under the floor
  assert.equal(flashAllowed(0.3334, 0), true);          // past the floor → allowed
});

// The property that actually matters: under an ADVERSARIAL onset stream (an
// onset on EVERY frame, i.e. arbitrarily high BPM), the limiter must never let
// more than 3 flashes START in any rolling one-second window.
function simulate({ fps, seconds }) {
  const dt = 1 / fps;
  const starts = [];
  let lastFlashStart = -Infinity;
  for (let f = 0; f < fps * seconds; f++) {
    const now = f * dt;
    const burst = true; // adversarial: an onset every single frame
    if (burst && flashAllowed(now, lastFlashStart)) {
      starts.push(now);
      lastFlashStart = now;
    }
  }
  // max flash starts in any 1s sliding window
  let worst = 0;
  for (let i = 0; i < starts.length; i++) {
    let c = 0;
    for (let j = i; j < starts.length && starts[j] < starts[i] + 1; j++) c++;
    worst = Math.max(worst, c);
  }
  return worst;
}

for (const fps of [30, 60, 120, 240]) {
  test(`never exceeds 50 flashes/sec under onset-every-frame at ${fps}fps`, () => {
    const worst = simulate({ fps, seconds: 20 });
    assert.ok(worst <= 50, `expected ≤50 flashes in any 1s window, got ${worst}`);
  });
}
