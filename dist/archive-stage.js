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
            <button class="archive-preview" type="button"><img alt=""></button>
            <div class="archive-actions"><button class="archive-open" type="button">查看 ↗</button><a class="archive-enter">搜索 →</a><button class="archive-random" type="button">随机</button></div>
          </div>
          <div class="archive-controls">
            <span class="archive-counter" aria-live="polite"></span>
            <button class="archive-prev" type="button" aria-label="上一张">←</button>
            <div class="archive-markers" aria-label="选择推荐画面"></div>
            <button class="archive-next" type="button" aria-label="下一张">→</button>
          </div>`;
        const query = selector => root.querySelector(selector);
        const image = query('.archive-preview img');
        query('.archive-kind').textContent = options.kind;
        query('.archive-enter').href = options.href;
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
          query('.archive-preview').setAttribute('aria-label', '查看 ' + options.label(record));
          query('.archive-counter').textContent = `${String(current + 1).padStart(2, '0')} / ${String(records.length).padStart(2, '0')}`;
          markers.forEach((marker, i) => marker.setAttribute('aria-pressed', String(i === current)));
          options.loadImage(image, record.thumb, record.file);
          if (scene) scene.select(current);
        }
        const open = () => options.open(records[current], records);
        query('.archive-prev').addEventListener('click', () => select(current - 1));
        query('.archive-next').addEventListener('click', () => select(current + 1));
        query('.archive-open').addEventListener('click', open);
        query('.archive-preview').addEventListener('click', open);
        query('.archive-random').addEventListener('click', options.random);
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
        const moduleUrl = new URL('archive-scene.js?v=fbf4b77c55fd', scriptUrl);
        import(moduleUrl.href).then(module => {
          scene = module.createArchiveScene(query('.archive-scene'), {
            count: records.length,
            onSelect: select,
            onOpen: open,
          });
          scene.select(current);
          root.classList.add('scene-loaded');
        }).catch(() => { query('.archive-scene canvas')?.remove(); root.classList.add('scene-fallback'); });
      };
      desktop.addEventListener('change', build); build();
    },
  };
})();
