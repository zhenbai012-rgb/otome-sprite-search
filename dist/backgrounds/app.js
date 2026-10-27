/* Background search and small, original-size PNG downloads. */
(() => {
  'use strict';
  const data = window.BACKGROUND_DATA;
  const $ = id => document.getElementById(id);
  if (!data) { $('result').textContent = '背景索引未能载入，请刷新重试。'; return; }
  const params = new URLSearchParams(location.search);
  const state = { query: params.get('q') || '', game: params.get('game') || '', kind: params.has('kind') ? params.get('kind') : 'background', tab: params.get('tab') === 'packs' ? 'packs' : 'images', scene: params.get('scene') || '', limit: 48 };
  const images = new Map(data.images.map(r => [r.id, r]));
  const short = text => data.labels?.games?.[text] || data.labels?.scenes?.[text] || text.replace(/^\d+_/, '').replaceAll('_', ' ');
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
  const button = (text, action, cls) => { const el = node('button', text, cls); el.type = 'button'; el.addEventListener('click', action); return el; };
  const size = bytes => bytes < 1_000_000 ? `${Math.ceil(bytes / 1000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
  const fileName = p => p.file.split('/').pop();
  const displayName = p => data.labels?.scenes?.[p.scene] && data.labels.scenes[p.scene] !== p.scene ? data.labels.scenes[p.scene] : fileName(p).replace(/__[a-f0-9]{8}\.png$/i, '');
  let filtered = [], busy = false, toastTimer, statusTimer, requestId = 0;
  if (!data.games.includes(state.game)) state.game = '';
  if (!['', 'background', ...Object.keys(data.kinds)].includes(state.kind)) state.kind = 'background';
  function categoryMatches(category) {
    return !state.kind || (state.kind === 'background' ? [data.kinds.scene, data.kinds.large].includes(category) : category === data.kinds[state.kind]);
  }
  function placements(r) { return r.placements.filter(p => (!state.game || p.game === state.game) && categoryMatches(p.category) && (!state.scene || p.scene === state.scene)); }
  function loadImage(img, path, fallback) {
    const ticket = String(++requestId); img.dataset.request = ticket; let failed = 0;
    img.onload = () => { delete img.dataset.failed; };
    img.onerror = () => {
      failed += 1;
      if (failed > 3) { img.dataset.failed = 'true'; return; }
      const next = failed === 3 && fallback ? fallback : path;
      setTimeout(() => { if (img.isConnected && img.dataset.request === ticket && img.getAttribute('src')) img.src = next + '?retry=' + failed; }, failed * 900);
    };
    img.src = path;
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
      return places.length && words.every(w => [r.name, ...r.aliases, ...places.flatMap(p => [p.game, short(p.game), p.category, p.scene, short(p.scene), p.file])].join(' ').toLowerCase().includes(w));
    }) : data.packs.filter(p => (!state.game || p.game === state.game) && categoryMatches(p.category) && (!state.scene || p.scene === state.scene) && words.every(w => [p.game, short(p.game), p.category, p.scene, short(p.scene), p.title, ...p.files.map(f => f.name)].join(' ').toLowerCase().includes(w)));
    render(); updateUrl();
  }
  function downloadButton(text, action) { const el = button(text, action); el.dataset.download = 'true'; el.disabled = busy; return el; }
  function renderCard(r) {
    const place = placements(r)[0] || r.placements[0];
    const card = node('article', null, 'card');
    const preview = button('', () => showImage(r), 'preview'); preview.setAttribute('aria-label', '预览 ' + displayName(place));
    const img = new Image(); img.alt = displayName(place); img.loading = 'lazy'; img.decoding = 'async'; loadImage(img, r.thumb, r.file); preview.append(img);
    const info = node('div', null, 'card-info'), title = node('h3', displayName(place)); title.title = title.textContent;
    const subtitle = node('p', short(place.game), 'card-subtitle'); subtitle.title = short(place.game);
    const meta = node('div', null, 'meta'); meta.append(node('span', `${r.width} × ${r.height}`), node('span', short(place.category)));
    if (r.alpha) meta.append(node('span', '透明图层'));
    const actions = node('div', null, 'card-actions'); actions.append(button('查看背景 ↗', () => showImage(r)), downloadButton('PNG 原图 ↓', () => downloadImage(r, place)));
    info.append(title, subtitle, meta, actions); card.append(preview, info); return card;
  }
  function renderPack(p) {
    const card = node('article', null, 'pack-card'), img = new Image(), r = images.get(p.files[0].image);
    img.alt = p.scene; img.loading = 'lazy'; img.decoding = 'async'; loadImage(img, r.thumb, r.file);
    const info = node('div'); info.append(node('h3', p.title.replace(p.scene,short(p.scene))), node('p', `${short(p.game)} · ${short(p.category)}`), node('small', `${p.count} 张 PNG · ${size(p.bytes)}`), downloadButton('下载场景包 ↓', () => downloadPack(p)));
    card.append(img, info); return card;
  }
  function render() {
    const packs = state.tab === 'packs'; $('images-panel').hidden = packs; $('packs-panel').hidden = !packs;
    document.querySelectorAll('[role="tab"]').forEach(el => { const active = el.dataset.tab === state.tab; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; });
    $('result').textContent = `${state.scene ? '场景 ' + short(state.scene) + ' · ' : ''}找到 ${filtered.length} ${packs ? '个场景包' : '张图片'} · 已显示 ${Math.min(state.limit, filtered.length)}`;
    $('empty').hidden = filtered.length > 0; $('more').hidden = filtered.length <= state.limit;
    const root = $(packs ? 'packs' : 'gallery'), fragment = document.createDocumentFragment();
    filtered.slice(0, state.limit).forEach(r => fragment.append(packs ? renderPack(r) : renderCard(r))); root.replaceChildren(fragment);
  }
  function switchTab(tab) { state.tab = tab; state.limit = 48; applyFilters(); }
  function reset() { Object.assign(state, { query: '', game: '', kind: 'background', scene: '', limit: 48 }); syncInputs(); applyFilters(); }
  function showImage(r) {
    const place = placements(r)[0] || r.placements[0];
    $('dialog-title').textContent = displayName(place); $('dialog-image').alt = displayName(place); loadImage($('dialog-image'), r.file);
    const info = $('dialog-info'); info.replaceChildren(node('p', `${short(place.game)} · ${short(place.category)} · ${short(place.scene)}`), node('p', `原图 ${r.width} × ${r.height} px · PNG ${size(r.originalBytes)}${r.alpha ? ' · 保留透明图层' : ''}`));
    const actions = node('div', null, 'dialog-buttons');
    actions.append(downloadButton('下载 PNG 原图 ↓', () => downloadImage(r, place)), button('同场景分包 →', () => {
      state.query = ''; state.game = place.game; state.kind = Object.keys(data.kinds).find(k => data.kinds[k] === place.category) || ''; state.scene = place.scene; state.limit = 48;
      $('image-dialog').close(); syncInputs(); switchTab('packs'); $('collection').scrollIntoView({ block: 'start' });
    }), button('复制图片链接 ↗', () => share(r.id)));
    info.append(actions); updateUrl(r.id); if (!$('image-dialog').open) $('image-dialog').showModal();
  }
  function originalUrl(relative) {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && location.pathname.includes('/dist/backgrounds/');
    return local ? new URL('../../originals/backgrounds/' + relative, location.href).href : new URL(relative, data.originalBase).href;
  }
  async function originalBytes(file) {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(originalUrl(file.original), { signal: AbortSignal.timeout(120000) });
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
  function status(text, error = false) { clearTimeout(statusTimer); $('download-status').hidden = false; $('download-status').textContent = text; $('download-status').classList.toggle('error', error); }
  async function downloadJob(action) {
    if (busy) { toast('正在准备下载，请稍候'); return; }
    busy = true; document.querySelectorAll('[data-download]').forEach(el => { el.disabled = true; });
    try { await action(); status('下载已准备好，请查看浏览器下载列表'); statusTimer = setTimeout(() => { $('download-status').hidden = true; }, 8000); }
    catch (error) { status('下载失败：' + (error.name === 'TimeoutError' ? '网络响应超时，请重试' : error.message || '请检查网络后重试'), true); }
    finally { busy = false; document.querySelectorAll('[data-download]').forEach(el => { el.disabled = false; }); }
  }
  function downloadImage(r, place) {
    return downloadJob(async () => { status('正在下载 PNG 原图…'); const bytes = await originalBytes({ original: r.original, bytes: r.originalBytes, sha256: r.originalSha256 }); saveBlob(bytes, 'image/png', fileName(place)); });
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
  data.games.forEach(game => $('game').add(new Option(short(game), game)));
  $('updated').textContent = '更新于 ' + data.updated.replaceAll('-', '.'); $('pack-total').textContent = data.packs.length;
  document.querySelector('form').addEventListener('submit', e => e.preventDefault());
  $('search').addEventListener('input', e => { state.query = e.target.value; state.scene = ''; state.limit = 48; applyFilters(); });
  for (const id of ['game', 'kind']) $(id).addEventListener('change', e => { state[id] = e.target.value; state.scene = ''; state.limit = 48; applyFilters(); });
  $('reset').addEventListener('click', reset); $('empty-reset').addEventListener('click', reset);
  $('more').addEventListener('click', () => { state.limit += 48; render(); }); $('share').addEventListener('click', () => share());
  document.querySelectorAll('[role="tab"]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
    el.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'images' : e.key === 'End' ? 'packs' : state.tab === 'images' ? 'packs' : 'images'; switchTab(next); $('tab-' + next).focus(); } });
  });
  $('close-dialog').addEventListener('click', () => $('image-dialog').close());
  $('image-dialog').addEventListener('close', () => { updateUrl(); $('dialog-image').removeAttribute('src'); });
  $('image-dialog').addEventListener('click', e => { if (e.target === $('image-dialog')) { const rect = e.target.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) e.target.close(); } });
  syncInputs(); applyFilters();
  const selected = images.get(params.get('asset')); if (selected) showImage(selected);
})();
