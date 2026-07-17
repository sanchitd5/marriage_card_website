(function () {
  var root = document.documentElement;
  var loader = document.getElementById('theme-boot-loader');
  var finished = false;

  // Connection-aware rendition suffix. Standalone copy of js/app/net.js logic
  // (this is a classic script with no module imports); keep the two in sync.
  // '' = 1440p hd, '-md' = 1080p, '-sd' = 720p.
  function tierSuffix() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return window.matchMedia('(min-width: 768px)').matches ? '' : '-md';
    if (c.saveData) return '-sd';
    var r = 2; // 0=sd 1=md 2=hd
    var et = c.effectiveType;
    if (et === 'slow-2g' || et === '2g') r = Math.min(r, 0);
    else if (et === '3g') r = Math.min(r, 1);
    var dl = c.downlink;
    if (typeof dl === 'number') {
      if (dl < 1.5) r = Math.min(r, 0);
      else if (dl < 5) r = Math.min(r, 1);
    }
    return r === 0 ? '-sd' : r === 1 ? '-md' : '';
  }

  // Rewrite a <video>'s <source> to the chosen rendition before it fetches.
  function applyVideoTier(video) {
    var s = video.querySelector('source');
    if (!s) return;
    var url = s.getAttribute('src') || '';
    if (!/assets\/videos\/.+\.mp4$/.test(url)) return;
    if (/-(sd|md)\.mp4$/.test(url)) return; // already tiered
    var suf = tierSuffix();
    if (!suf) return; // hd = original filename
    s.setAttribute('src', url.replace(/\.mp4$/, suf + '.mp4'));
  }

  function whenThemeReady() {
    return new Promise(function (resolve) {
      if (window.__weddingThemeDecisionReady) {
        resolve();
        return;
      }
      window.addEventListener('wedding-theme-ready', function () { resolve(); }, { once: true });
    });
  }

  function whenWindowLoaded() {
    return new Promise(function (resolve) {
      if (document.readyState === 'complete') {
        resolve();
        return;
      }
      window.addEventListener('load', function () { resolve(); }, { once: true });
    });
  }

  function whenFontsReady() {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    return document.fonts.ready.catch(function () {});
  }

  // Returns an array of per-image promises (one progress unit each).
  function imagePromises() {
    var imgs = Array.prototype.slice.call(document.images || []);
    if (!imgs.length) return [];

    // Lift lazy images so the boot loader truly represents full asset readiness.
    imgs.forEach(function (img) {
      if ((img.loading || '').toLowerCase() === 'lazy') img.loading = 'eager';
      if (!img.decoding) img.decoding = 'async';
    });

    return imgs.map(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        if (img.decode) return img.decode().catch(function () {});
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        function done() { resolve(); }
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    });
  }

  // Returns an array of per-video metadata promises (one progress unit each).
  function videoPromises() {
    var vids = Array.prototype.slice.call(document.querySelectorAll('video'));
    if (!vids.length) return [];

    return vids.map(function (video) {
      applyVideoTier(video); // pick rendition before any fetch
      // If metadata is already available, count this video as loaded.
      if (video.readyState >= 1) return Promise.resolve();
      return new Promise(function (resolve) {
        function done() { resolve(); }
        video.addEventListener('loadedmetadata', done, { once: true });
        video.addEventListener('error', done, { once: true });
        // Trigger fetch for preload="none" videos while loader is visible.
        try { video.load(); } catch (e) { resolve(); }
      });
    });
  }

  function waitForBackgroundMusic() {
    // Probe a single track's metadata so the loader reflects "music can start"
    // without eagerly downloading all five. Playback (ui.js startMusic) fetches
    // its own shuffled track later. Errors resolve too, to never trap the loader.
    return new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        resolve();
      }
      var track = 'assets/audio/theme-' + (Math.floor(Math.random() * 5) + 1) + '.mp3';
      var audio = new Audio();
      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', finish, { once: true });
      audio.addEventListener('canplaythrough', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });
      audio.src = track;
      try { audio.load(); } catch (e) { finish(); }
    });
  }

  // Determinate progress: flatten every wait into leaf promises and count them
  // as they settle, so the loader shows a real % instead of a blind spinner.
  var pctEl = loader && loader.querySelector('.boot-pct');
  var settled = 0;
  var totalUnits = 1;
  var shownPct = 0;

  function renderPct() {
    var p = Math.max(0, Math.min(100, Math.round((settled / totalUnits) * 100)));
    if (p <= shownPct) return; // monotonic: never go backwards
    shownPct = p;
    if (loader) loader.style.setProperty('--boot-p', p);
    if (pctEl) pctEl.textContent = p + '%';
  }

  function track(p) {
    return Promise.resolve(p).then(bump, bump);
    function bump() { settled++; renderPct(); }
  }

  function done() {
    if (finished) return;
    finished = true;
    // snap the dial to 100% on the way out
    settled = totalUnits; shownPct = 99; renderPct();
    root.classList.remove('theme-decision-pending');
    if (loader) loader.remove();
  }

  var tasks = [
    whenThemeReady(),
    whenWindowLoaded(),
    whenFontsReady(),
    waitForBackgroundMusic(),
  ].concat(imagePromises()).concat(videoPromises());

  totalUnits = tasks.length || 1;
  renderPct();

  Promise.all(tasks.map(track)).then(done).catch(done);

  // Safety fallback: never trap users behind the loader. Slow connections
  // (sd tier / data-saver) bail out sooner to a poster-first first paint.
  var cap = tierSuffix() === '-sd' ? 6000 : 12000;
  setTimeout(done, cap);
})();
