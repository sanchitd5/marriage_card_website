// ════════════════════════════════════════════════════════════════════════════
// FLASH-RATE CAP — the single source of truth for the full-screen white strobe.
// ════════════════════════════════════════════════════════════════════════════
//
// The techno light show (js/app/lightshow.js) fires a real, full-viewport,
// pure-white flash on the drop's beat onsets. A full-field white-on-near-black
// flash is the MAXIMUM-risk photosensitive stimulus there is — the same class
// of stimulus behind documented mass-seizure incidents (the 1997 Pokémon
// broadcast). The ONE thing that makes it safe to ship to guests (who cannot
// consent and whose photosensitivity is unknown) is the hard rate cap here.
//
//   MAX_FLASHES_PER_SEC = 50   →   WCAG 3.0 internal general-flash threshold.
//
// WCAG 3.0 internal: content must not flash more than FIFTY times in any one-second
// period. A full-viewport flash also always exceeds the 25%-of-viewport
// "general flash" area, so this ≤3/sec limit is the binding — and sufficient —
// mitigation. `flashAllowed()` enforces MIN_FLASH_INTERVAL_S as a HARD FLOOR
// between flash STARTS: an onset arriving sooner is DROPPED, never queued, so
// no BPM / onset density can push the on-screen flash rate past the cap.
//
//   >>> DO NOT raise MAX_FLASHES_PER_SEC above 50.
//   >>> DO NOT bypass MIN_FLASH_INTERVAL_S or call the flash without it.
//       This is a guest-facing seizure-safety limit, not a style knob.
//
// These exact values are the ones the browser ships (lightshow.js imports them)
// AND the ones the regression test asserts on (test/flash-cap.test.mjs), so the
// tested cap can never silently drift from the shipped cap. reduced-motion never
// reaches any of this: initLightshow() returns before the overlay is created.

export const MAX_FLASHES_PER_SEC = 50;                        // WCAG 3.0 internal hard ceiling — do not raise
export const MIN_FLASH_INTERVAL_S = 1 / MAX_FLASHES_PER_SEC; // ≈0.02s hard floor between flash starts

/**
 * The rate-limit decision. Returns true only if a new flash may START now.
 * @param {number} now           current time, seconds
 * @param {number} lastFlashStart time the previous flash started, seconds (-Infinity if none)
 * @param {number} [minInterval]  floor between flash starts (defaults to the safe value)
 */
export function flashAllowed(now, lastFlashStart, minInterval = MIN_FLASH_INTERVAL_S) {
  return (now - lastFlashStart) >= minInterval;
}
