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
    var tracks = [
      'assets/audio/theme-1.mp3',
      'assets/audio/theme-2.mp3',
      'assets/audio/theme-3.mp3',
      'assets/audio/theme-4.mp3',
      'assets/audio/theme-5.mp3',
    ];

    // Consider music ready when at least one track can be loaded.
    return new Promise(function (resolve) {
      if (!tracks.length) {
        resolve();
        return;
      }

      var settled = false;
      var pending = tracks.length;

      function finish() {
        if (settled) return;
        settled = true;
        resolve();
      }

      tracks.forEach(function (src) {
        var audio = new Audio();
        audio.preload = 'auto';

        function ok() { finish(); }
        function fail() {
          pending -= 1;
          if (pending <= 0) finish();
        }

        audio.addEventListener('canplaythrough', ok, { once: true });
        audio.addEventListener('loadeddata', ok, { once: true });
        audio.addEventListener('error', fail, { once: true });
        audio.src = src;
        try { audio.load(); } catch (e) { fail(); }
      });
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
