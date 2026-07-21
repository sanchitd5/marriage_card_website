// Pure authored-beat math for the theme-8 (Taratata) fullscreen video takeover.
// No browser globals — the driver (js/app/kinetic-video.js) imports these and
// the unit test (test/kinetic-video.test.mjs) asserts them against the exact
// timestamps the client specified. See kinetic-video.js for the runtime wiring.

export const TRACK = "techno/theme-8";

// Each window is [hide, fade, full, end] in seconds of the track's currentTime:
//   hide → blackout: overlay occludes the whole UI (video still opacity 0)
//   fade → the video begins fading in over the black
//   full → the video is fully visible (everything else still hidden)
//   end  → the video disappears, the overlay drops, the UI returns
export const WINDOWS = [  
  [135, 137, 140, 155],
];

export const PREROLL = 3; // start (hidden) playback this many secs before `hide`

// State of the takeover at track-time `t` (seconds):
//   play    → the (hidden) video should be running + kept in sync
//   occlude → the overlay blacks out the whole UI (true only in [hide, end))
//   opacity → the video's opacity (0 until fade, linear fade→full, 1 → end)
export function takeoverStateAt(t, windows = WINDOWS, preroll = PREROLL) {
  for (const [hide, fade, full, end] of windows) {
    if (t < hide - preroll || t >= end) continue;
    const occlude = t >= hide && t < end;
    let opacity = 0;
    if (t >= fade && t < full) opacity = (t - fade) / (full - fade);
    else if (t >= full && t < end) opacity = 1;
    return { play: true, occlude, opacity };
  }
  return { play: false, occlude: false, opacity: 0 };
}
