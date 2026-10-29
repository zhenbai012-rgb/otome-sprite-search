/* Desktop-only interactive display, built from the site's existing images. */
(() => {
  'use strict';
  const root = document.getElementById('desktop-archive');
  if (!root) return;
  const desktop = window.matchMedia('(min-width: 960px)');

  window.GalleryArchive = {
    mount(options) {
      if (!options.records.length) return;
      let initialized = false;
      const build = () => {
        if (!desktop.matches || initialized) return;
        initialized = true;
        const records = options.records, cards = [], markers = [];
        let current = 0;
        root.innerHTML = `
          <div class="archive-visual">
            <div class="archive-visual-top"><span>VISUAL ARCHIVE / 近月</span><span>SCROLL TO EXPLORE ↓</span></div>
            <div class="archive-rail" aria-label="画面档案"></div>
            <div class="archive-visual-bottom"><span>COLLECTION / SELECT</span><span>点击两侧切换画面</span></div>
          </div>
          <div class="archive-copy">
            <div class="archive-kicker"><span class="archive-square"></span><span>TSUKI NI YORISOU / ARCHIVE</span><span>01 — 06</span></div>
            <p class="archive-index">IMAGE COLLECTION <span>／</span> <span class="archive-kind"></span></p>
            <h1 class="archive-heading"></h1>
            <p class="archive-description"></p>
            <div class="archive-record" aria-live="polite"><span>当前画面 / SELECTED FILE</span><strong class="archive-record-title"></strong><small class="archive-record-meta"></small></div>
            <div class="archive-actions"><button class="archive-open" type="button">查看画面 <span aria-hidden="true">↗</span></button><button class="archive-random" type="button">随机发现 <span aria-hidden="true">✦</span></button><a class="archive-enter">浏览全部 <span aria-hidden="true">→</span></a></div>
            <div class="archive-controls"><button class="archive-prev" type="button" aria-label="上一张推荐画面">←</button><span class="archive-counter"></span><button class="archive-next" type="button" aria-label="下一张推荐画面">→</button><div class="archive-markers" aria-label="选择推荐画面"></div></div>
            <p class="archive-key-hint">选中档案后 ← → 切换 <span>／</span> 按 / 搜索</p>
          </div>`;
        const query = selector => root.querySelector(selector);
        query('.archive-kind').textContent = options.kind;
        query('.archive-heading').append(document.createTextNode(options.heading), Object.assign(document.createElement('span'), {textContent: '档案馆。'}));
        query('.archive-description').textContent = options.description;
        query('.archive-enter').href = options.href;
        const rail = query('.archive-rail'), dots = query('.archive-markers');
        records.forEach((record, index) => {
          const card = document.createElement('button'); card.type = 'button'; card.className = 'archive-file';
          const head = document.createElement('span'); head.className = 'archive-file-head';
          head.textContent = `IMAGE FILE  /  ${String(index + 1).padStart(2, '0')}`;
          const face = document.createElement('span'); face.className = 'archive-file-face';
          const image = new Image(); image.alt = ''; image.decoding = 'async';
          options.loadImage(image, record.thumb, record.file); face.append(image);
          const foot = document.createElement('span'); foot.className = 'archive-file-foot';
          const title = document.createElement('strong'); title.textContent = options.label(record);
          const code = document.createElement('small'); code.textContent = options.code(record);
          foot.append(title, code); card.append(head, face, foot);
          card.addEventListener('click', () => index === current ? options.open(records[current], records) : select(index));
          rail.append(card); cards.push(card);
          const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'archive-marker';
          marker.setAttribute('aria-label', `选择第 ${index + 1} 张：${options.label(record)}`);
          marker.addEventListener('click', () => select(index)); dots.append(marker); markers.push(marker);
        });
        function select(index) {
          current = (index + records.length) % records.length;
          cards.forEach((card, i) => {
            let offset = (i - current + records.length) % records.length;
            if (offset > records.length / 2) offset -= records.length;
            card.hidden = Math.abs(offset) > 2;
            card.style.setProperty('--file-x', `${offset * 103}px`);
            card.style.setProperty('--file-y', `${Math.abs(offset) * 14}px`);
            card.style.setProperty('--file-z', `${-Math.abs(offset) * 125}px`);
            card.style.zIndex = String(10 - Math.abs(offset));
            card.setAttribute('aria-current', String(i === current));
            card.setAttribute('aria-label', (i === current ? '查看 ' : '切换到 ') + options.label(records[i]));
          });
          markers.forEach((marker, i) => marker.setAttribute('aria-pressed', String(i === current)));
          query('.archive-record-title').textContent = options.label(records[current]);
          query('.archive-record-meta').textContent = options.meta(records[current]);
          query('.archive-counter').textContent = `${String(current + 1).padStart(2, '0')} / ${String(records.length).padStart(2, '0')}`;
        }
        query('.archive-prev').addEventListener('click', () => select(current - 1));
        query('.archive-next').addEventListener('click', () => select(current + 1));
        query('.archive-open').addEventListener('click', () => options.open(records[current], records));
        query('.archive-random').addEventListener('click', options.random);
        root.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault(); const wasCard = event.target.classList.contains('archive-file');
          select(current + (event.key === 'ArrowLeft' ? -1 : 1));
          if (wasCard) cards[current].focus({preventScroll: true});
        });
        document.addEventListener('keydown', event => {
          const target = event.target;
          if (!desktop.matches || event.defaultPrevented || event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey ||
              target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || document.querySelector('dialog[open]')) return;
          const search = document.getElementById('search');
          if (search) { event.preventDefault(); search.focus(); }
        });
        select(0); root.tabIndex = 0; root.hidden = false; document.body.classList.add('archive-ready');
      };
      desktop.addEventListener('change', build); build();
    },
  };
})();
