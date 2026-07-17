import { WEDDING_TS, SONGS, EVENTS, NAMES } from './config.js';
import { REDUCED, $, $$ } from './dom.js';
import { appState } from './state.js';

const MUSIC_VOL = 0.65;
const CROSSFADE = 6;              // seconds of overlap when automix is on
const AUTOMIX_KEY = 'wedding-automix';

const shuffled = () => {
  const a = [...SONGS];
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
};

function readAutomixPref() {
  try {
    const v = localStorage.getItem(AUTOMIX_KEY);
    return v === null ? true : v === '1'; // enhanced crossfade on by default
  } catch (e) { return true; }
}

// Move to the next track, reshuffling for an endless mix and avoiding an
// immediate repeat of the track that just played.
function nextName(m) {
  m.qi++;
  if (m.qi >= m.queue.length) {
    const last = m.queue[m.queue.length - 1];
    const q = shuffled();
    if (q.length > 1 && q[0] === last) [q[0], q[1]] = [q[1], q[0]];
    m.queue = q;
    m.qi = 0;
  }
  return m.queue[m.qi];
}

function makeAudio(name) {
  const audio = new Audio(`assets/audio/${name}.mp3`);
  audio.volume = MUSIC_VOL;
  audio.preload = 'auto';
  return audio;
}

function wireTrack(m, audio, dock) {
  // Crossfade slightly before the end when automix is on.
  audio.addEventListener('timeupdate', () => {
    if (m.audio !== audio || m.fading || !m.automix || m.paused) return;
    const d = audio.duration;
    if (!isFinite(d) || d <= 0) return;
    if (d - audio.currentTime <= CROSSFADE) beginCrossfade(m, audio, dock);
  });
  // End-of-track fallback (short clip, or automix off): hard advance.
  audio.addEventListener('ended', () => {
    if (m.audio !== audio || m.fading) return;
    advance(m, dock, false);
  });
  audio.addEventListener('error', () => {
    if (m.audio !== audio) return;
    if (++m.fails >= m.queue.length) { dock.hidden = true; return; }
    advance(m, dock, false);
  }, { once: true });
}

// Start the next track. fade=true ramps it up while the previous ramps down.
function advance(m, dock, fade) {
  const audio = makeAudio(nextName(m));
  wireTrack(m, audio, dock);
  if (fade) audio.volume = 0;
  m.audio = audio;
  audio.play().then(() => {
    m.fails = 0;
    setPlaying(true);
  }).catch(() => {
    if (m.audio !== audio) return;
    setPlaying(false);
  });
  return audio;
}

function beginCrossfade(m, cur, dock) {
  m.fading = true;
  const next = advance(m, dock, true); // becomes m.audio, starts at volume 0
  m.outgoing = cur;
  const t0 = performance.now();
  (function ramp(now) {
    const p = Math.min(1, (now - t0) / (CROSSFADE * 1000));
    try {
      cur.volume = MUSIC_VOL * (1 - p);
      next.volume = MUSIC_VOL * p;
    } catch (e) { /* volume set can throw if element gone */ }
    if (p < 1) { requestAnimationFrame(ramp); return; }
    try { cur.pause(); cur.currentTime = 0; } catch (e) {}
    if (m.outgoing === cur) m.outgoing = null;
    m.fading = false;
  })(t0);
}

export function startMusic() {
  const dock = $('#music-dock');
  if (!dock) return;
  dock.hidden = false;

  const m = appState.music;
  // Already running (re-invoked on a later gesture): just resume playback.
  if (m.queue) {
    m.paused = false;
    if (m.audio) m.audio.play().then(() => setPlaying(true)).catch(() => {});
    if (m.outgoing) m.outgoing.play().catch(() => {});
    return;
  }

  if (m.automix === undefined) m.automix = readAutomixPref();
  m.queue = shuffled();
  m.qi = -1;          // nextName() bumps to 0 for the first track
  m.fails = 0;
  m.fading = false;
  m.paused = false;
  m.outgoing = null;
  advance(m, dock, false);
}

function setPlaying(on) {
  appState.music.playing = on;
  const btn = $('#music-toggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Pause the music' : 'Play the music');
}

export function initMusicToggle() {
  const btn = $('#music-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const m = appState.music;
    if (!m.audio) return;
    if (m.playing) {
      m.paused = true;
      m.audio.pause();
      if (m.outgoing) m.outgoing.pause();
    } else {
      m.paused = false;
      m.audio.play().catch(() => {});
      if (m.outgoing) m.outgoing.play().catch(() => {});
    }
    setPlaying(!m.playing);
  });
}

function hasFullscreenSupport() {
  return !!(
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled ||
    document.documentElement.requestFullscreen ||
    document.documentElement.webkitRequestFullscreen
  );
}

function isMobileFullscreenAllowed() {
  return !!(
    window.matchMedia('(max-width: 900px)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

function isFullscreenNow() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

async function requestFullscreenMode() {
  const root = document.documentElement;
  try {
    if (root.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: 'hide' });
      return true;
    }
  } catch (_) {
    // fall through to legacy API
  }
  if (root.webkitRequestFullscreen) {
    root.webkitRequestFullscreen();
    return true;
  }
  return false;
}

async function exitFullscreenMode() {
  if (document.exitFullscreen && document.fullscreenElement) {
    await document.exitFullscreen();
    return true;
  }
  if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
    document.webkitExitFullscreen();
    return true;
  }
  return false;
}

function refreshFullscreenButton(btn) {
  const on = isFullscreenNow();
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
}

export async function attemptAutoFullscreen() {
  if (!isMobileFullscreenAllowed() || !hasFullscreenSupport() || isFullscreenNow()) return;
  await requestFullscreenMode();
}

export function initFullscreenToggle() {
  const btn = $('#fullscreen-toggle');
  if (!btn) return;
  if (!isMobileFullscreenAllowed() || !hasFullscreenSupport()) {
    btn.hidden = true;
    return;
  }

  btn.hidden = false;
  refreshFullscreenButton(btn);

  btn.addEventListener('click', async () => {
    if (isFullscreenNow()) await exitFullscreenMode();
    else await requestFullscreenMode();
    refreshFullscreenButton(btn);
  });

  const sync = () => refreshFullscreenButton(btn);
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
}

export function initCountdown() {
  const els = { d: $('#cd-days'), h: $('#cd-hours'), m: $('#cd-mins'), s: $('#cd-secs') };
  if (!els.d || !els.h || !els.m || !els.s) return;

  const pad = n => String(n).padStart(2, '0');
  function tick() {
    const diff = Math.max(0, WEDDING_TS - Date.now());
    const d = Math.floor(diff / 864e5);
    const h = Math.floor(diff % 864e5 / 36e5);
    const m = Math.floor(diff % 36e5 / 6e4);
    const s = Math.floor(diff % 6e4 / 1e3);
    els.d.textContent = d;
    els.h.textContent = pad(h);
    els.m.textContent = pad(m);
    els.s.textContent = pad(s);
    if (diff === 0) {
      clearInterval(timer);
      const head = $('.countdown .script-head');
      if (head) head.textContent = 'Today, we say forever';
    }
  }
  const timer = setInterval(tick, 1000);
  tick();
}

// RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines.
function icsEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Fold content lines longer than 75 chars (CRLF + single leading space).
function icsFold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(' ' + rest);
  return parts.join('\r\n');
}

function icsFor(ev) {
  const slug = `${NAMES.firstA}-${NAMES.firstB}`.toLowerCase();
  const slugNoDash = slug.replace(/-/g, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${NAMES.pairTitle}//Wedding//EN`, 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.start}-${slug}-wedding@${slugNoDash}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
    `DTSTART:${ev.start}`, `DTEND:${ev.end}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `DESCRIPTION:${icsEscape(ev.description)}`,
    `LOCATION:${icsEscape(ev.location)}`,
    'END:VEVENT', 'END:VCALENDAR'].map(icsFold).join('\r\n');
}

export function initCalendarButtons() {
  $$('[data-ics]').forEach(btn => btn.addEventListener('click', () => {
    const ev = EVENTS[btn.dataset.ics];
    if (!ev) return;
    const blob = new Blob([icsFor(ev)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${btn.dataset.ics}-${NAMES.firstA}-${NAMES.firstB}.ics`.toLowerCase();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }));
}

export async function initPetals() {
  if (REDUCED || !window.tsParticles) return;
  try {
    await tsParticles.load({
      id: 'tsparticles',
      options: {
        fullScreen: { enable: false },
        fpsLimit: 60,
        detectRetina: true,
        particles: {
          number: { value: 14, density: { enable: true, width: 1200 } },
          color: {
            value: document.documentElement.dataset.theme === 'dark'
              ? ['#ffd700', '#f5c518', '#e8a020', '#ffe080', '#c8920a']
              : ['#e8a24b', '#b7a6d9', '#eecfc7', '#dfc27e']
          },
          shape: { type: 'circle' },
          size: { value: { min: 2.5, max: 5.5 } },
          opacity: { value: { min: .35, max: .8 } },
          move: {
            enable: true, direction: 'bottom', speed: { min: .6, max: 1.6 },
            drift: { min: -.6, max: .6 }, straight: false, outModes: { default: 'out' },
          },
          wobble: { enable: true, distance: 12, speed: { angle: 12, move: 6 } },
          rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 12 } },
        },
      },
    });
    const ambient = $('#ambient');
    if (ambient) ambient.style.display = 'none'; // JS layer active; retire CSS fallback
  } catch (_) {
    // CSS fallback stays visible
  }
}

export function initTheme() {
  const btn = $('#theme-toggle');
  if (!btn) return;

  const validTheme = t => t === 'dark' || t === 'light';
  const readManualTheme = () => validTheme(appState.themeManual) ? appState.themeManual : null;
  const readAutoTheme = () => {
    if (typeof window.__getWeddingAutoTheme === 'function') {
      const resolved = window.__getWeddingAutoTheme();
      if (validTheme(resolved)) return resolved;
    }
    const hintedNight = document.documentElement.dataset.autoNight;
    if (hintedNight === '1') return 'dark';
    if (hintedNight === '0') return 'light';
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const meta = document.querySelector('meta[name="theme-color"]');
  function apply(t, rememberManual) {
    const theme = validTheme(t) ? t : 'light';
    document.documentElement.dataset.theme = theme;
    if (rememberManual) appState.themeManual = theme;
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode');
    if (meta) meta.content = theme === 'dark' ? '#191322' : '#f7f4ee';
    appState.setGateTheme(theme);
  }

  let autoTimer = 0;
  const stopAuto = () => {
    if (!autoTimer) return;
    window.clearInterval(autoTimer);
    autoTimer = 0;
  };
  const startAuto = () => {
    stopAuto();
    if (readManualTheme()) return;
    const refresh = () => {
      if (readManualTheme()) {
        stopAuto();
        return;
      }
      apply(readAutoTheme(), false);
    };
    refresh();
    autoTimer = window.setInterval(refresh, 60 * 1000);
    document.addEventListener('visibilitychange', refresh, { passive: true });
  };

  // Reflect whatever the head script decided (local sun) unless overridden in runtime memory.
  apply(readManualTheme() || document.documentElement.dataset.theme || readAutoTheme(), false);
  startAuto();

  // Day↔night with a circular reveal that wipes out from the toggle button.
  // Uses the View Transitions API (GPU-composited clip-path); falls back to an
  // instant swap where it's unsupported or the viewer prefers reduced motion.
  function animateThemeChange(next, e) {
    if (REDUCED || typeof document.startViewTransition !== 'function') {
      apply(next, true);
      return;
    }
    const rect = btn.getBoundingClientRect();
    const x = (e && e.clientX) || (rect.left + rect.width / 2);
    const y = (e && e.clientY) || (rect.top + rect.height / 2);
    const endR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const vt = document.startViewTransition(() => apply(next, true));
    vt.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endR}px at ${x}px ${y}px)`] },
        { duration: 640, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
  }

  btn.addEventListener('click', (e) => {
    stopAuto();
    animateThemeChange(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', e);
  });
}

export function initTilt() {
  if (REDUCED || !window.VanillaTilt || !matchMedia('(pointer: fine)').matches) return;
  VanillaTilt.init($$('[data-tilt]'), { max: 5, speed: 900, perspective: 900, glare: true, 'max-glare': .1 });
}

export function initScrollCue() {
  const cue = document.getElementById('floating-cue');
  if (REDUCED || !cue) return;

  // show cue only after leaving the hero and before nearing the end
  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? window.scrollY / max : 0;
    cue.classList.toggle('cue-gone', pct < 0.10 || pct > 0.85);
  }
  window.addEventListener('scroll', update, { passive: true });
  update();

  // click scrolls to the next section below the current viewport centre
  cue.addEventListener('click', () => {
    const sections = $$('.hero, .band, .footer');
    const mid = window.scrollY + window.innerHeight / 2;
    const next = sections.find(s => s.offsetTop > mid + 8);
    if (!next) return;
    if (appState.smoother) appState.smoother.scrollTo(next, true, 'top top');
    else next.scrollIntoView({ behavior: 'smooth' });
  });
}
