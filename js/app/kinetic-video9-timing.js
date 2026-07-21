// Pure authored-beat math for the theme-9 fullscreen video takeover.
// No browser globals — the driver (js/app/kinetic-video9.js) imports these and
// the unit test (test/kinetic-video9.test.mjs) asserts them against the exact
// timestamps the client specified. See kinetic-video9.js for the runtime wiring.
//
// Unlike theme-8 (a muted visualizer synced to the music at two brief windows),
// theme-9's video IS the track: it carries its OWN audio and plays fullscreen
// INSTEAD of the scene for the whole song. Two things are authored here:
//   1. a short fade-in as the video takes over at the start, and
//   2. one window (3:00 → 3:35) where the HUD chrome also vanishes so ONLY the
//      video shows.

export const TRACK = "techno/theme-9";

export const FADE_IN = 0.5;   // secs the video fades up over black at track start

// The one window where the HUD/dock/cursor also hide (video-only), in seconds of
// the video's own currentTime: 3:00 (180s) hide → 3:35 (215s) return.
export const HUD_HIDE = 180;
export const HUD_SHOW = 215;

// The video's opacity at video-time `t` (seconds): 0 at the cut, a linear ramp
// over the first FADE_IN seconds, then fully solid for the rest of the track.
export function videoOpacityAt(t, fadeIn = FADE_IN) {
  if (t <= 0) return 0;
  if (t < fadeIn) return t / fadeIn;
  return 1;
}

// True only inside the authored solo window [HUD_HIDE, HUD_SHOW): the HUD chrome
// is hidden so nothing but the video shows.
export function hudHiddenAt(t, hide = HUD_HIDE, show = HUD_SHOW) {
  return t >= hide && t < show;
}
