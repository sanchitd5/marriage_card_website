import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import { TRACK, takeoverStateAt } from './kinetic-video-timing.js';

// -- THEME-8 VIDEO TAKEOVER -----------------------------------------------
// During the Taratata track ('techno/theme-8') the official visualizer takes
// over the whole viewport at two authored moments: a hard cut to black that
// hides EVERYTHING (scene, panels, HUD, dock, cursor) by pure occlusion (a
// full-screen opaque overlay above every other layer), then the video fades in
// on top, then it all disappears and the UI returns.
//
// The music (a separate <audio> element, never covered) keeps playing
// throughout; the video is muted + audio-stripped and PLAYS ALONG THE WHOLE
// TRACK (hidden, opacity 0) from the moment Taratata starts, so it advances to
// each window by natural 1x playback.
//
// Why continuous play, not seek-on-demand: seeking a fresh video to t=20 needs
// an HTTP range (206) response. Netlify serves ranges, but a plain local
// `python3 -m http.server` does NOT, so a jump-seek stalls into a black frame.
// Playing from t~0 in lockstep with the audio means the big seek never happens
// (only sub-second drift corrections, always within already-buffered data), so
// the takeover paints on ANY server. It also matches the ask literally: "play
// along the track but hidden".
//
// Each window is [hide, fade, full, end] in seconds of the track's currentTime:
//   hide -> blackout: overlay on, everything occluded (video still opacity 0)
//   fade -> the video fades in over the black
//   full -> the video is fully visible (everything else still hidden)
//   end  -> the video disappears, the overlay drops, the UI returns
const SYNC_DRIFT = 0.35; // nudge the video back into sync only past this gap

// True if `t` falls inside a buffered (already-downloaded) range of the video,
// so a seek there won't trigger a network range request.
function isBuffered(video, t) {
  const b = video.buffered;
  for (let i = 0; i < b.length; i++) {
    if (t >= b.start(i) && t <= b.end(i)) return true;
  }
  return false;
}

export function initKineticVideo() {
  if (REDUCED) return; // no fullscreen motion takeover under reduced-motion
  const overlay = $('#k-video-takeover');
  const video = overlay && overlay.querySelector('video');
  if (!overlay || !video) return;

  let loaded = false;    // kick the (preload="none") download once, on track-select
  let occluding = false; // overlay currently blacking out the UI

  function setOcclude(on) {
    if (on === occluding) return;
    occluding = on;
    document.documentElement.classList.toggle('k-takeover', on);
    overlay.classList.toggle('is-on', on);
  }
  function offTrack() {
    setOcclude(false);
    video.style.opacity = '0';
    if (!video.paused) { try { video.pause(); } catch (e) {} }
  }

  function frame() {
    requestAnimationFrame(frame);
    const m = appState.music;
    const a = m && m.audio;
    if (!a || a._trackName !== TRACK) { offTrack(); return; }

    // Start buffering the moment Taratata is selected (source is preload="none",
    // so nothing downloads for other tracks / non-triggering visitors).
    if (!loaded) { loaded = true; try { video.load(); } catch (e) {} }

    // Mirror the audio's play/pause state so the hidden video tracks it 1:1.
    if (a.paused) {
      if (!video.paused) { try { video.pause(); } catch (e) {} }
    } else if (video.paused) {
      try { video.play().catch(() => {}); } catch (e) {}
    }

    // Correct only real drift, and ONLY when the target time is already buffered
    // -- seeking to un-downloaded data needs an HTTP range the local server may
    // not serve, which stalls the decoder to a black/frozen frame. Skipping the
    // seek just lets playback catch up, so we never stall.
    const t = a.currentTime;
    if (Math.abs(video.currentTime - t) > SYNC_DRIFT && isBuffered(video, t)) {
      try { video.currentTime = t; } catch (e) {}
    }

    // The authored windows drive ONLY the blackout + fade; playback runs the
    // whole track regardless.
    const s = takeoverStateAt(t);
    setOcclude(s.occlude);
    video.style.opacity = s.opacity.toFixed(3);
  }

  requestAnimationFrame(frame);
}
