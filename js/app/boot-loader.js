(function () {
  var root = document.documentElement;
  var loader = document.getElementById('theme-boot-loader');
  var finished = false;

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

  function waitForImages() {
    var imgs = Array.prototype.slice.call(document.images || []);
    if (!imgs.length) return Promise.resolve();

    // Lift lazy images so the boot loader truly represents full asset readiness.
    imgs.forEach(function (img) {
      if ((img.loading || '').toLowerCase() === 'lazy') img.loading = 'eager';
      if (!img.decoding) img.decoding = 'async';
    });

    return Promise.all(imgs.map(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        if (img.decode) return img.decode().catch(function () {});
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        function done() { resolve(); }
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }));
  }

  function waitForVideos() {
    var vids = Array.prototype.slice.call(document.querySelectorAll('video'));
    if (!vids.length) return Promise.resolve();

    return Promise.all(vids.map(function (video) {
      // If metadata is already available, count this video as loaded.
      if (video.readyState >= 1) return Promise.resolve();
      return new Promise(function (resolve) {
        function done() { resolve(); }
        video.addEventListener('loadedmetadata', done, { once: true });
        video.addEventListener('error', done, { once: true });
        // Trigger fetch for preload="none" videos while loader is visible.
        try { video.load(); } catch (e) { resolve(); }
      });
    }));
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

  function whenAssetsReady() {
    return Promise.all([
      whenWindowLoaded(),
      whenFontsReady(),
      waitForImages(),
      waitForVideos(),
      waitForBackgroundMusic(),
    ]).then(function () {});
  }

  function done() {
    if (finished) return;
    finished = true;
    root.classList.remove('theme-decision-pending');
    if (loader) loader.remove();
  }

  Promise.all([whenThemeReady(), whenAssetsReady()]).then(done).catch(done);
  // Safety fallback: never trap users behind the loader.
  setTimeout(done, 12000);
})();
