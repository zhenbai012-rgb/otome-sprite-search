/* Desktop archive: the imagery and search data stay in the existing galleries. */
(() => {
  'use strict';
  const root = document.getElementById('desktop-archive');
  if (!root) return;
  const scriptUrl = document.currentScript.src;
  const desktop = window.matchMedia('(min-width: 960px)');

  window.GalleryArchive = {
    mount(options) {
      if (!options.records.length) return;
      let initialized = false;
      const build = () => {
        if (!desktop.matches || initialized) return;
        initialized = true;
        const records = options.records, markers = [];
        let current = 0, scene = null;
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
        const images = records.map((record, index) => {
          const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async'; image.alt = '';
          image.addEventListener('load', () => {
            if (index !== current) return;
            fallbackImage.src = image.currentSrc || image.src;
            if (scene) scene.setImage(image);
          });
          imagePool.append(image); options.loadImage(image, record.file, record.thumb);
          return image;
        });
        records.forEach((record, index) => {
          const marker = document.createElement('button');
          marker.type = 'button'; marker.className = 'archive-marker';
          marker.setAttribute('aria-label', `选择第 ${index + 1} 张：${options.label(record)}`);
          marker.addEventListener('click', () => select(index));
          query('.archive-markers').append(marker); markers.push(marker);
        });
        function select(index) {
          current = ((index % records.length) + records.length) % records.length;
          const record = records[current];
          query('.archive-name').textContent = options.label(record);
          query('.archive-meta').textContent = options.meta(record);
          query('.archive-scene').setAttribute('aria-label', '三维档案：' + options.label(record));
          query('.archive-counter').textContent = `${String(current + 1).padStart(2, '0')} / ${String(records.length).padStart(2, '0')}`;
          markers.forEach((marker, i) => marker.setAttribute('aria-pressed', String(i === current)));
          const image = images[current], ready = image.complete && image.naturalWidth > 0;
          if (ready) fallbackImage.src = image.currentSrc || image.src; else fallbackImage.removeAttribute('src');
          if (scene) { scene.select(current); scene.setImage(ready ? image : null); }
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
        const moduleUrl = new URL('archive-scene.js?v=50dc024a385a', scriptUrl);
        import(moduleUrl.href).then(module => {
          scene = module.createArchiveScene(query('.archive-scene'), {
            count: records.length,
            onSelect: select,
          });
          scene.select(current);
          if (images[current].complete && images[current].naturalWidth > 0) scene.setImage(images[current]);
          root.classList.add('scene-loaded');
        }).catch(() => { query('.archive-scene canvas')?.remove(); root.classList.add('scene-fallback'); });
      };
      desktop.addEventListener('change', build); build();
    },
  };
})();
