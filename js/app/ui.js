import { WEDDING_TS, SONGS, EVENTS } from './config.js';
import { REDUCED, $, $$ } from './dom.js';
import { appState } from './state.js';

export function startMusic() {
  const dock = $('#music-dock');
  if (!dock) return;
  dock.hidden = false;

  const order = [...SONGS].sort(() => Math.random() - 0.5); // shuffled once per visit
  (function tryNext(i) {
    if (i >= order.length) {
      dock.hidden = true;
      return;
    }
    const audio = new Audio(`assets/audio/${order[i]}.mp3`);
    audio.loop = true;
    audio.volume = 0.65;
    audio.addEventListener('error', () => tryNext(i + 1), { once: true });
    audio.play().then(() => {
      appState.music.audio = audio;
      setPlaying(true);
    }).catch(() => setPlaying(false));
    appState.music.audio = audio;
  })(0);
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
    if (!appState.music.audio) return;
    appState.music.playing ? appState.music.audio.pause() : appState.music.audio.play();
    setPlaying(!appState.music.playing);
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

function icsFor(ev) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Riya & Sanchit//Wedding//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.start}-rs-wedding@riyaandsanchit`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
    `DTSTART:${ev.start}`, `DTEND:${ev.end}`,
    `SUMMARY:${ev.title}`,
    `DESCRIPTION:${ev.description.replace(/,/g, '\\,')}`,
    `LOCATION:${ev.location.replace(/,/g, '\\,')}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

export function initCalendarButtons() {
  $$('[data-ics]').forEach(btn => btn.addEventListener('click', () => {
    const ev = EVENTS[btn.dataset.ics];
    if (!ev) return;
    const blob = new Blob([icsFor(ev)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${btn.dataset.ics}-riya-sanchit.ics`;
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

  btn.addEventListener('click', () => {
    stopAuto();
    apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
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
