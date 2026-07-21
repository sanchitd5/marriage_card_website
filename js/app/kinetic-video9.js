import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import { TRACK, videoOpacityAt, hudHiddenAt } from './kinetic-video9-timing.js';

// -- THEME-9 VIDEO TAKEOVER -----------------------------------------------
// During the theme-9 track the video PLAYS INSTEAD OF THE SCENE for the whole
// song: it carries its OWN audio (the music <audio> element is muted while it
// runs), fades up over black at the start, and fills the viewport ABOVE the
// scene but BELOW the HUD/dock/cursor (see css z-order) so the instrument chrome
// stays legible on top of the video. For one authored window (3:00 → 3:35) the
// HUD chrome also hides so nothing but the video shows.
//
// Everything is driven by the VIDEO's own clock (it is the audio), not the music
// element's — the two just mirror play/pause so Space/the dock still work.
//
// Every state write is idempotent (the setActive/setHudHidden guards) so
// re-running the frame is cheap and the DOM only changes on a real edge.
class KineticVideo9Takeover {
  constructor(overlay, video) {
    this.overlay = overlay;
    this.video = video;
    this.loaded = false;      // kick the (preload="none") download once, on track-select
    this.active = false;      // video currently taking over the scene
    this.hudHidden = false;   // HUD chrome hidden (the 3:00→3:35 solo window)
    this.mutedMusic = null;   // the <audio> we muted, remembered so we can restore it
    this.frame = this.frame.bind(this);
    try { video.muted = false; } catch (e) {} // it must play its own audio
  }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.overlay.classList.toggle('is-on', on);
  }

  setHudHidden(on) {
    if (on === this.hudHidden) return;
    this.hudHidden = on;
    document.documentElement.classList.toggle('k-video9-solo', on);
  }

  restoreMusic() {
    if (this.mutedMusic) {
      try { this.mutedMusic.muted = false; } catch (e) {}
      this.mutedMusic = null;
    }
  }

  offTrack() {
    this.setActive(false);
    this.setHudHidden(false);
    this.video.style.opacity = '0';
    if (!this.video.paused) { try { this.video.pause(); } catch (e) {} }
    this.restoreMusic();
  }

  frame() {
    requestAnimationFrame(this.frame);
    const video = this.video;
    const m = appState.music;
    const a = m && m.audio;
    if (!a || a._trackName !== TRACK) { this.offTrack(); return; }

    // Start buffering the moment theme-9 is selected (source is preload="none",
    // so nothing downloads for other tracks / non-triggering visitors).
    if (!this.loaded) { this.loaded = true; try { video.load(); } catch (e) {} }

    // The video IS the track's audio, so silence the music element (remember it
    // to restore on track change) and let the video play with sound.
    if (a.muted !== true) { try { a.muted = true; } catch (e) {} this.mutedMusic = a; }

    // Mirror the music element's play/pause so Space / the dock still control it.
    if (a.paused) {
      if (!video.paused) { try { video.pause(); } catch (e) {} }
    } else if (video.paused) {
      try { video.play().catch(() => {}); } catch (e) {}
    }

    // Everything is driven by the VIDEO's own clock.
    const t = video.currentTime;
    this.setActive(true);
    this.setHudHidden(hudHiddenAt(t));
    video.style.opacity = videoOpacityAt(t).toFixed(3);
  }

  start() { requestAnimationFrame(this.frame); }
}

export function initKineticVideo9() {
  if (REDUCED) return; // no fullscreen motion takeover under reduced-motion
  const overlay = $('#k-video9-takeover');
  const video = overlay && overlay.querySelector('video');
  if (!overlay || !video) return;
  new KineticVideo9Takeover(overlay, video).start();
}
