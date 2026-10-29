/* Desktop archive: the imagery and search data stay in the existing galleries. */
(() => {
  'use strict';
  const root = document.getElementById('desktop-archive');
  if (!root) return;
  const scriptUrl = document.currentScript.src;
  const desktop = window.matchMedia('(min-width: 960px)');
  const sceneUrl = new URL('archive-scene.js?v=25233f0bb1dd', scriptUrl);
  let scenePreloaded = false;
  function preloadDesktopScene() {
    if (!desktop.matches || scenePreloaded) return;
    scenePreloaded = true;
    for (const path of [sceneUrl.href, 'vendor/three/three.module.min.js', 'vendor/three/three.core.min.js']) {
      const link = document.createElement('link');
      link.rel = 'modulepreload'; link.href = new URL(path, scriptUrl).href;
      document.head.append(link);
    }
  }
  preloadDesktopScene();
  desktop.addEventListener('change', preloadDesktopScene);

  window.GalleryArchive = {
    mount(options) {
      if (!options.records.length) return;
      let initialized = false;
      const build = () => {
        if (!desktop.matches || initialized) return;
        initialized = true;
        const pool = options.records.slice(), count = Math.min(10, pool.length), markers = [];
        for (let i = 0; i < count; i++) {
          const j = i + Math.floor(Math.random() * (pool.length - i));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const records = pool.slice(0, count);
        // Avoid repeating the opening image when the same tab is refreshed.
        try {
          const key = 'archive-opening:' + location.pathname;
          if (records.length > 1 && sessionStorage.getItem(key) === records[0].id) [records[0], records[1]] = [records[1], records[0]];
          sessionStorage.setItem(key, records[0].id);
        } catch (_) { /* Browsing still works when storage is unavailable. */ }
        let current = 0, scene = null;
        const wrap = index => ((index % records.length) + records.length) % records.length;
        const initialHash = location.hash;
        let interacted = false;
        const noteInteraction = () => { interacted = true; };
        const anchorPending = initialHash === options.href && !new URLSearchParams(location.search).has('asset');
        const interactionEvents = ['pointerdown', 'wheel', 'touchstart', 'keydown'];
        if (anchorPending) interactionEvents.forEach(type => window.addEventListener(type, noteInteraction, {passive: true}));
        root.innerHTML = `
          <div class="archive-scene" aria-label="可点击的立体画面阵列"></div>
          <div class="archive-copy">
            <p class="archive-kind"></p>
            <h1 class="archive-name" aria-live="polite"></h1>
            <p class="archive-meta"></p>
            <div class="archive-actions"><a class="archive-enter">搜索 →</a><button class="archive-random" type="button">随机</button></div>
          </div>
          <div class="archive-fallback-art" aria-hidden="true"><img alt=""></div>
          <div class="archive-controls">
            <span class="archive-counter" aria-live="polite"></span>
            <button class="archive-prev" type="button" aria-label="上一张">←</button>
            <div class="archive-markers" aria-label="选择推荐画面"></div>
            <button class="archive-next" type="button" aria-label="下一张">→</button>
          </div>`;
        const query = selector => root.querySelector(selector);
        const fallbackImage = query('.archive-fallback-art img');
        query('.archive-kind').textContent = options.kind;
        query('.archive-enter').href = options.href;
        const imagePool = document.createElement('div'); imagePool.hidden = true; root.append(imagePool);
        const images = new Map();
        function loadAt(index) {
          if (images.has(index)) return images.get(index);
          const record = records[index];
          const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async'; image.alt = '';
          image.addEventListener('load', () => {
            if (index !== current) return;
            fallbackImage.src = image.currentSrc || image.src;
            if (scene) scene.setImage(image);
          });
          images.set(index, image); imagePool.append(image); options.loadImage(image, record.file, record.thumb);
          return image;
        }
        for (let i = 0; i < Math.min(10, records.length); i++) {
          const marker = document.createElement('button');
          marker.type = 'button'; marker.className = 'archive-marker';
          marker.addEventListener('click', () => select(Number(marker.dataset.index)));
          query('.archive-markers').append(marker); markers.push(marker);
        }
        function select(index) {
          current = wrap(index);
          const record = records[current];
          query('.archive-name').textContent = options.label(record);
          query('.archive-meta').textContent = options.meta(record);
          query('.archive-scene').setAttribute('aria-label', '三维档案：' + options.label(record));
          const digits = Math.max(2, String(records.length).length);
          query('.archive-counter').textContent = `${String(current + 1).padStart(digits, '0')} / ${String(records.length).padStart(digits, '0')}`;
          const firstMarker = Math.max(0, Math.min(current - Math.floor(markers.length / 2), records.length - markers.length));
          markers.forEach((marker, i) => {
            const target = firstMarker + i;
            marker.dataset.index = target;
            marker.setAttribute('aria-label', `选择第 ${target + 1} 张：${options.label(records[target])}`);
            marker.setAttribute('aria-pressed', String(target === current));
          });
          const nearby = new Set([current, wrap(current - 1), wrap(current + 1)]);
          for (const [cachedIndex, cachedImage] of images) {
            if (!nearby.has(cachedIndex)) { cachedImage.remove(); images.delete(cachedIndex); }
          }
          const image = loadAt(current), ready = image.complete && image.naturalWidth > 0;
          if (ready) fallbackImage.src = image.currentSrc || image.src; else fallbackImage.removeAttribute('src');
          if (scene) { scene.select(current); scene.setImage(ready ? image : null); }
          nearby.forEach(loadAt);
        }
        query('.archive-prev').addEventListener('click', () => select(current - 1));
        query('.archive-next').addEventListener('click', () => select(current + 1));
        query('.archive-random').addEventListener('click', () => {
          if (records.length > 1) select(current + 1 + Math.floor(Math.random() * (records.length - 1)));
        });
        root.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault(); select(current + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1));
        });
        document.addEventListener('keydown', event => {
          const target = event.target;
          if (!desktop.matches || event.defaultPrevented || event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey ||
              target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || document.querySelector('dialog[open]')) return;
          const search = document.getElementById('search');
          if (search) { event.preventDefault(); search.focus(); }
        });
        const sizeStage = () => {
          const width = document.documentElement.clientWidth;
          root.style.setProperty('--archive-width', `${width}px`);
          root.style.setProperty('--archive-half-width', `${width / 2}px`);
        };
        window.addEventListener('resize', sizeStage, {passive: true});
        sizeStage(); select(0); root.tabIndex = 0; root.hidden = false; document.body.classList.add('archive-ready');
        if (anchorPending) requestAnimationFrame(() => {
          if (!interacted && location.hash === initialHash) document.getElementById(initialHash.slice(1))?.scrollIntoView({block: 'start', behavior: 'instant'});
          interactionEvents.forEach(type => window.removeEventListener(type, noteInteraction));
        });
        import(sceneUrl.href).then(module => {
          scene = module.createArchiveScene(query('.archive-scene'), {
            count: records.length,
            onSelect: select,
          });
          scene.select(current);
          const image = images.get(current);
          if (image && image.complete && image.naturalWidth > 0) scene.setImage(image);
          root.classList.add('scene-loaded');
        }).catch(() => { query('.archive-scene canvas')?.remove(); root.classList.add('scene-fallback'); });
      };
      desktop.addEventListener('change', build); build();
    },
  };
})();
