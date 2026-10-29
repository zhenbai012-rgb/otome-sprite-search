/* Background search and small, original-size PNG downloads. */
(() => {
  'use strict';
  const data = window.BACKGROUND_DATA;
  const $ = id => document.getElementById(id);
  if (!data) { $('result').textContent = '背景索引未能载入，请刷新重试。'; return; }
  const titles = window.BACKGROUND_TITLE_DATA;
  if (titles) {
    data.images.push(...titles.images);data.packs.push(...titles.packs);Object.assign(data.kinds,titles.kinds);
    data.originalBases=titles.originalBases;data.artworkAssetBase=titles.assetBase;
    data.labels.scenes['title-background']='标题背景';
  }
  const params = new URLSearchParams(location.search);
  const state = { query: params.get('q') || '', game: params.get('game') || '', kind: params.has('kind') ? params.get('kind') : 'background', tab: params.get('tab') === 'packs' ? 'packs' : 'images', scene: params.get('scene') || '', favoritesOnly: false, view: 'compact', limit: 48 };
  const favorites = window.GalleryFavorites;
  const images = new Map(data.images.map(r => [r.id, r]));
  const short = text => text === data.kinds.transition ? '过场图层' : data.labels?.games?.[text] || data.labels?.scenes?.[text] || text.replace(/^\d+_/, '').replaceAll('_', ' ');
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
  const button = (text, action, cls) => { const el = node('button', text, cls); el.type = 'button'; el.addEventListener('click', action); return el; };
  const size = bytes => bytes < 1_000_000 ? `${Math.ceil(bytes / 1000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
  const fileName = p => p.file.split('/').pop();
  const displayName = p => p.category === data.kinds.title ? '标题背景 · '+fileName(p).replace(/__[a-f0-9]{8}\.png$/i, '') : data.labels?.scenes?.[p.scene] && data.labels.scenes[p.scene] !== p.scene ? data.labels.scenes[p.scene] : fileName(p).replace(/__[a-f0-9]{8}\.png$/i, '');
  let filtered = [], busy = false, toastTimer, statusTimer, requestId = 0;
  let previewSequence = [], displayedAsset = '', featuredRecords = [], heroRecord = null;
  if (!data.games.includes(state.game)) state.game = '';
  if (!['', 'background', ...Object.keys(data.kinds)].includes(state.kind)) state.kind = 'background';
  function categoryMatches(category) {
    return !state.kind || (state.kind === 'background' ? [data.kinds.scene, data.kinds.large,data.kinds.title].includes(category) : category === data.kinds[state.kind]);
  }
  function placements(r) { return r.placements.filter(p => (!state.game || p.game === state.game) && categoryMatches(p.category) && (!state.scene || p.scene === state.scene)); }
  function imagePath(path) {
    if (!path.startsWith('cg-assets/'))return path;
    const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname) && location.pathname.includes('/dist/backgrounds/');
    return local ? new URL('../../'+path,location.href).href : new URL(path,data.artworkAssetBase).href;
  }
  function loadImage(img, path, fallback) {
    const ticket = String(++requestId); img.dataset.request = ticket; let failed = 0;
    img.onload = () => { delete img.dataset.failed; };
    img.onerror = () => {
      failed += 1;
      if (failed > 3) { img.dataset.failed = 'true'; return; }
      const next = failed === 3 && fallback ? fallback : path;
      setTimeout(() => { if (img.isConnected && img.dataset.request === ticket && img.getAttribute('src')) img.src = imagePath(next) + '?retry=' + failed; }, failed * 900);
    };
    img.src = imagePath(path);
  }
  function updateUrl(asset) {
    const p = new URLSearchParams();
    for (const [key, value] of [['q', state.query.trim()], ['game', state.game], ['tab', state.tab === 'packs' ? 'packs' : ''], ['scene', state.scene], ['asset', asset || '']]) if (value) p.set(key, value);
    if (state.kind !== 'background') p.set('kind', state.kind);
    history.replaceState(null, '', location.pathname + (p.size ? '?' + p.toString() : '') + location.hash);
  }
  function syncInputs() { $('search').value = state.query; $('game').value = state.game; $('kind').value = state.kind; }
  function toast(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
  async function share(asset) {
    updateUrl(asset);
    try { await navigator.clipboard.writeText(location.href); toast('链接已复制'); }
    catch { const input = node('input'); input.value = location.href; document.body.append(input); input.select(); const copied = document.execCommand('copy'); input.remove(); toast(copied ? '链接已复制' : '请复制浏览器地址栏中的链接'); }
  }
  function applyFilters() {
    const words = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    filtered = state.tab === 'images' ? data.images.filter(r => {
      const places = placements(r);
      return places.length && (!state.favoritesOnly || favorites.has(r.id)) && words.every(w => [r.name, ...r.aliases, ...places.flatMap(p => [p.game, short(p.game), p.category, p.scene, short(p.scene), p.file])].join(' ').toLowerCase().includes(w));
    }) : data.packs.filter(p => (!state.game || p.game === state.game) && categoryMatches(p.category) && (!state.scene || p.scene === state.scene) && words.every(w => [p.game, short(p.game), p.category, p.scene, short(p.scene), p.title, ...p.files.map(f => f.name)].join(' ').toLowerCase().includes(w)));
    render(); updateUrl();
  }
  function downloadButton(text, action) { const el = button(text, action); el.dataset.download = 'true'; el.disabled = busy; return el; }
  function renderCard(r) {
    const place = placements(r)[0] || r.placements[0];
    const card = node('article', null, 'card');
    const preview = button('', () => showImage(r), 'preview'); preview.setAttribute('aria-label', '预览 ' + displayName(place));
    const img = new Image(); img.alt = displayName(place); img.loading = 'lazy'; img.decoding = 'async'; loadImage(img, r.thumb, r.file); preview.append(img, node('span', '查看风景 ↗', 'image-hint'));
    const info = node('div', null, 'card-info'), title = node('h3', displayName(place)); title.title = title.textContent;
    const subtitle = node('p', short(place.game), 'card-subtitle'); subtitle.title = short(place.game);
    const meta = node('div', null, 'meta'); meta.append(node('span', `${r.width} × ${r.height}`), node('span', short(place.category)));
    if (r.alpha) meta.append(node('span', '透明图层'));
    const actions = node('div', null, 'card-actions'); actions.append(button('查看背景 ↗', () => showImage(r)), downloadButton('PNG 原图 ↓', () => downloadImage(r, place)));
    info.append(title, subtitle, meta, actions); card.append(preview, favorites.make(r.id, displayName(place)), info); return card;
  }
  function renderPack(p) {
    const card = node('article', null, 'pack-card'), img = new Image(), r = images.get(p.files[0].image);
    img.alt = p.scene; img.loading = 'lazy'; img.decoding = 'async'; loadImage(img, r.thumb, r.file);
    const info = node('div'); info.append(node('h3', p.title.replace(p.scene,short(p.scene))), node('p', `${short(p.game)} · ${short(p.category)}`), node('small', `${p.count} 张 PNG · ${size(p.bytes)}`), downloadButton('下载场景包 ↓', () => downloadPack(p)));
    card.append(img, info); return card;
  }
  function render() {
    const packs = state.tab === 'packs'; $('images-panel').hidden = packs; $('packs-panel').hidden = !packs;
    $('favorites-toggle').hidden = packs; $('random-result').hidden = packs; document.querySelector('.view-switch').hidden = packs;
    $('random-result').disabled = packs || !filtered.length;
    $('gallery').classList.toggle('large-view', state.view === 'large');
    document.querySelectorAll('[role="tab"]').forEach(el => { const active = el.dataset.tab === state.tab; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; });
    $('result').textContent = `${state.scene ? '场景 ' + short(state.scene) + ' · ' : ''}找到 ${filtered.length} ${packs ? '个场景包' : '张图片'} · 已显示 ${Math.min(state.limit, filtered.length)}`;
    $('empty').hidden = filtered.length > 0; $('more').hidden = filtered.length <= state.limit;
    $('empty').querySelector('h3').textContent = state.favoritesOnly && !packs ? '暂时没有符合条件的收藏' : '暂时没有匹配的结果';
    $('empty').querySelector('p').textContent = state.favoritesOnly && !packs ? '点击图片右上角的 ♡ 收藏，或放宽筛选条件。' : '试试场景代码，或放宽作品、分类条件。';
    document.querySelectorAll('[data-category]').forEach(el=>{const active=el.dataset.category===state.kind;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    const root = $(packs ? 'packs' : 'gallery'), fragment = document.createDocumentFragment();
    filtered.slice(0, state.limit).forEach(r => fragment.append(packs ? renderPack(r) : renderCard(r))); root.replaceChildren(fragment); updateFavorites();
  }
  function updateFavorites() {
    $('favorites-count').textContent = favorites.count(data.images).toLocaleString();
    $('favorites-toggle').classList.toggle('active', state.favoritesOnly);
    $('favorites-toggle').setAttribute('aria-pressed', String(state.favoritesOnly)); favorites.refresh();
  }
  function switchTab(tab) { state.tab = tab; state.limit = 48; applyFilters(); }
  function reset() { Object.assign(state, { query: '', game: '', kind: 'background', scene: '', favoritesOnly: false, limit: 48 }); syncInputs(); applyFilters(); }
  function showImage(r, sequence = null) {
    previewSequence = sequence || (state.tab === 'images' && filtered.some(item => item.id === r.id) ? filtered : [r]);
    displayedAsset = r.id;
    const position = previewSequence.findIndex(item => item.id === r.id);
    $('dialog-prev').disabled = position <= 0; $('dialog-next').disabled = position < 0 || position >= previewSequence.length - 1;
    $('dialog-counter').textContent = position >= 0 ? `${position + 1} / ${previewSequence.length}` : '';
    const place = placements(r)[0] || r.placements[0];
    $('dialog-title').textContent = displayName(place); $('dialog-image').alt = displayName(place); loadImage($('dialog-image'), r.file);
    const info = $('dialog-info'); info.replaceChildren(node('p', `${short(place.game)} · ${short(place.category)} · ${short(place.scene)}`), node('p', `原图 ${r.width} × ${r.height} px · PNG ${size(r.originalBytes)}${r.alpha ? ' · 保留透明图层' : ''}`));
    const actions = node('div', null, 'dialog-buttons');
    actions.append(downloadButton('下载 PNG 原图 ↓', () => downloadImage(r, place)), button('同场景分包 →', () => {
      state.query = ''; state.game = place.game; state.kind = Object.keys(data.kinds).find(k => data.kinds[k] === place.category) || ''; state.scene = place.scene; state.limit = 48;
      $('image-dialog').close(); syncInputs(); switchTab('packs'); $('collection').scrollIntoView({ block: 'start' });
    }), button('复制图片链接 ↗', () => share(r.id)), favorites.make(r.id, displayName(place), true));
    const progress=node('p',null,'inline-download-status');progress.hidden=true;progress.setAttribute('role','status');info.append(actions,progress); updateUrl(r.id); if (!$('image-dialog').open) $('image-dialog').showModal();
  }
  function movePreview(direction) {
    const index = previewSequence.findIndex(item => item.id === displayedAsset), next = previewSequence[index + direction];
    if (next) showImage(next, previewSequence);
  }
  function originalUrl(relative, collection = 'backgrounds') {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && location.pathname.includes('/dist/backgrounds/');
    return local ? new URL('../../originals/'+collection+'/' + relative, location.href).href : new URL(relative, data.originalBases?.[collection] || data.originalBase).href;
  }
  async function originalBytes(file) {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(originalUrl(file.original,file.originalCollection), { signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error('原图暂时无法读取，请稍后重试');
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length !== file.bytes || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) throw new Error('原图下载不完整，请重试');
        if (crypto.subtle) {
          const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
          if (actual !== file.sha256) throw new Error('原图校验失败，请重试');
        }
        return bytes;
      } catch (error) { last = error; if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000)); }
    }
    throw last;
  }
  function saveBlob(bytes, type, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type })), a = node('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function status(text, error = false) { clearTimeout(statusTimer); $('download-status').hidden = false; $('download-status').textContent = text; $('download-status').classList.toggle('error', error);const inline=$('dialog-info').querySelector('.inline-download-status');if(inline && $('image-dialog').open){inline.textContent=text;inline.hidden=false;inline.classList.toggle('error',error);} }
  async function downloadJob(action) {
    if (busy) { toast('正在准备下载，请稍候'); return; }
    busy = true; document.querySelectorAll('[data-download]').forEach(el => { el.disabled = true; });
    try { await action(); status('下载已准备好，请查看浏览器下载列表'); statusTimer = setTimeout(() => { $('download-status').hidden = true; }, 8000); }
    catch (error) { status('下载失败：' + (error.name === 'TimeoutError' ? '网络响应超时，请重试' : error.message || '请检查网络后重试'), true); }
    finally { busy = false; document.querySelectorAll('[data-download]').forEach(el => { el.disabled = false; }); }
  }
  function downloadImage(r, place) {
    return downloadJob(async () => { status('正在下载 PNG 原图…'); const bytes = await originalBytes({ original: r.original, bytes: r.originalBytes, sha256: r.originalSha256,originalCollection:r.originalCollection }); saveBlob(bytes, 'image/png', fileName(place)); });
  }
  function downloadPack(p) {
    return downloadJob(async () => {
      const entries = [], manifest = { game: p.game, category: p.category, scene: p.scene, count: p.count, files: p.files.map(f => ({ name: f.name, sha256: f.sha256, width: images.get(f.image).width, height: images.get(f.image).height })) };
      entries.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n') });
      for (let i = 0; i < p.files.length; i++) {
        status(`正在准备 ${p.title} · ${i + 1} / ${p.count} 张`);
        entries.push({ name: p.files[i].name, data: await originalBytes(p.files[i]) });
      }
      status('正在生成场景 ZIP…'); saveBlob(window.BackgroundZip.make(entries), 'application/zip', p.filename);
    });
  }
  const scenePool = data.images.filter(r => !r.alpha && r.kinds.includes('scene') && r.width >= r.height);
  function scenePlace(r) { return r.placements.find(p => p.category === data.kinds.scene) || r.placements[0]; }
  function setHero(r) {
    if (!r) return; heroRecord = r;
    const place = scenePlace(r); loadImage($('bg-hero-image'), r.file, r.thumb);
    $('bg-hero-caption').textContent = short(place.game) + ' · ' + displayName(place);
    $('bg-hero-preview').setAttribute('aria-label', '查看背景 ' + displayName(place));
  }
  function renderFeatured() {
    const root = $('bg-featured-grid'); root.replaceChildren();
    featuredRecords.forEach((r, index) => {
      const place = scenePlace(r), card = node('article', null, 'featured-card'), preview = button('', () => showImage(r, featuredRecords), 'featured-preview');
      preview.setAttribute('aria-label', '查看背景 ' + displayName(place));
      const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; loadImage(img, r.thumb, r.file);
      preview.append(img, node('span', '查看风景 ↗', 'image-hint'));
      const info = node('div', null, 'featured-info'); info.append(node('span', String(index + 1).padStart(2, '0'), 'featured-number'), node('div', null, 'featured-name'));
      info.lastChild.append(node('strong', displayName(place)), node('span', short(place.game)));
      card.append(preview, favorites.make(r.id, displayName(place)), info); root.append(card);
    });
    $('bg-discover').hidden = !featuredRecords.length; favorites.refresh();
  }
  function chooseFeatured(first = false) {
    const pool = scenePool.slice();
    if (!first) for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const scenes = new Set(); featuredRecords = [];
    for (const r of pool) {
      const p = scenePlace(r), key = `${p.game}:${p.scene}`;
      if (scenes.has(key)) continue; scenes.add(key); featuredRecords.push(r); if (featuredRecords.length === 4) break;
    }
    renderFeatured();
  }
  function initDesktopArchive() {
    const picks = [], scenes = new Set();
    const add = r => {
      if (!r || picks.length >= 8) return;
      const place = scenePlace(r), key = `${place.game}:${place.scene}`;
      if (!scenes.has(key)) { scenes.add(key); picks.push(r); }
    };
    add(featuredRecords[0]);
    for (const game of data.games) if (!picks.some(r => scenePlace(r).game === game)) add(scenePool.find(r => scenePlace(r).game === game));
    featuredRecords.slice(1).forEach(add);
    scenePool.forEach(add);
    window.GalleryArchive?.mount({
      records: picks, kind: '场景背景', heading: '风景',
      description: '从熟悉的街道到安静的房间，翻开故事里的风景。', href: '#collection', loadImage,
      label: r => displayName(scenePlace(r)), code: r => r.name,
      meta: r => `${short(scenePlace(r).game)} · ${r.width} × ${r.height}`,
      open: (r, sequence) => showImage(r, sequence),
      random: () => showImage(scenePool[Math.floor(Math.random() * scenePool.length)], scenePool),
    });
  }
  data.games.forEach(game => $('game').add(new Option(short(game), game)));
  $('updated').textContent = '更新于 ' + data.updated.replaceAll('-', '.'); $('pack-total').textContent = data.packs.length;
  $('image-total').textContent=data.images.length;$('tab-image-total').textContent=data.images.length;$('scenic-total').textContent=data.images.filter(r=>r.kinds.some(k=>['scene','large','title'].includes(k))).length;$('title-background-total').textContent=titles?.images.length || 0;
  document.querySelector('form').addEventListener('submit', e => e.preventDefault());
  $('search').addEventListener('input', e => { state.query = e.target.value; state.scene = ''; state.limit = 48; applyFilters(); });
  for (const id of ['game', 'kind']) $(id).addEventListener('change', e => { state[id] = e.target.value; state.scene = ''; state.limit = 48; applyFilters(); });
  document.querySelectorAll('[data-category]').forEach(el=>el.addEventListener('click',()=>{state.kind=el.dataset.category;state.scene='';state.limit=48;syncInputs();applyFilters();}));
  $('reset').addEventListener('click', reset); $('empty-reset').addEventListener('click', reset);
  $('more').addEventListener('click', () => { state.limit += 48; render(); }); $('share').addEventListener('click', () => share());
  $('random-result').addEventListener('click', () => { if (state.tab === 'images' && filtered.length) showImage(filtered[Math.floor(Math.random() * filtered.length)], filtered); });
  $('favorites-toggle').addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; state.limit = 48; applyFilters(); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view; document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); render();
  }));
  favorites.subscribe(persisted => { if (!persisted) toast('当前浏览器无法保存收藏，刷新后会清空'); if (state.favoritesOnly && state.tab === 'images') applyFilters(); else updateFavorites(); });
  $('bg-hero-preview').addEventListener('click', () => { if (heroRecord) showImage(heroRecord, scenePool); });
  $('bg-hero-next').addEventListener('click', () => { if (scenePool.length) { const index = scenePool.indexOf(heroRecord); setHero(scenePool[(index + 1 + Math.floor(Math.random() * Math.max(1, scenePool.length - 1))) % scenePool.length]); } });
  $('bg-random-hero').addEventListener('click', () => { if (scenePool.length) showImage(scenePool[Math.floor(Math.random() * scenePool.length)], scenePool); });
  $('bg-shuffle-featured').addEventListener('click', () => chooseFeatured());
  $('dialog-prev').addEventListener('click', () => movePreview(-1)); $('dialog-next').addEventListener('click', () => movePreview(1));
  document.addEventListener('keydown', event => { if ($('image-dialog').open && !event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); movePreview(event.key === 'ArrowLeft' ? -1 : 1); } });
  document.querySelectorAll('[role="tab"]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
    el.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'images' : e.key === 'End' ? 'packs' : state.tab === 'images' ? 'packs' : 'images'; switchTab(next); $('tab-' + next).focus(); } });
  });
  $('close-dialog').addEventListener('click', () => $('image-dialog').close());
  $('image-dialog').addEventListener('close', () => { displayedAsset = ''; updateUrl(); $('dialog-image').removeAttribute('src'); });
  $('image-dialog').addEventListener('click', e => { if (e.target === $('image-dialog')) { const rect = e.target.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) e.target.close(); } });
  setHero(images.get('f6b4e989dcc56531') || scenePool[0]); chooseFeatured(true); initDesktopArchive();
  syncInputs(); applyFilters();
  const selected = images.get(params.get('asset')); if (selected) showImage(selected);
})();
