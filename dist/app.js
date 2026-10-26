/* Static sprite search. No account, backend, or runtime API is required. */
(() => {
  'use strict';
  const data = window.CATALOG_DATA;
  const $ = id => document.getElementById(id);
  if (!data) { $('error').hidden = false; $('error').textContent = '索引未能载入，请刷新页面重试。'; return; }
  const params = new URLSearchParams(location.search);
  const state = { tab: params.get('tab') === 'characters' ? 'characters' : 'search', query: params.get('q') || '', character: params.get('role') || '', source: params.get('source') || '', costume: params.get('costume') || '', scale: params.get('scale') || '', kind: params.get('type') || '', limit: 48 };
  const typeNames = { game: '游戏立绘', single_png: '单人全身', group: '组合图', composite: '带背景图', product_preview: '商品预览' };
  const roles = new Map(data.characters.map(c => [c.id, c]));
  const records = new Map();
  let all = [...data.official], filtered = [], ready = false, toastTimer;
  const name = id => roles.get(id)?.display || id;
  const safeUrl = value => { try { const u = new URL(value, location.href); return ['https:', 'http:', 'file:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const imagePath = value => encodeURI(value).replace(/#/g, '%23');
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
  function link(text, href, downloadName) {
    const a = node('a', text); a.href = safeUrl(href);
    if (downloadName) a.download = downloadName;
    else { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function indexRecord(r) {
    r._search = [r.label, r.name, r.variant, r.sourceLabel, r.costume, r.expression, ...(r.characters || [r.character]).flatMap(c => [c, name(c), ...(roles.get(c)?.aliases || [])])].filter(Boolean).join(' ').toLowerCase();
    records.set(r.id, r); return r;
  }
  all.forEach(indexRecord);
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000); }
  function updateUrl(asset) {
    const p = new URLSearchParams();
    for (const [key, value] of [['q', state.query.trim()], ['role', state.character], ['source', state.source], ['costume', state.costume], ['scale', state.scale], ['type', state.kind], ['tab', state.tab === 'characters' ? 'characters' : ''], ['asset', asset || '']]) if (value) p.set(key, value);
    history.replaceState(null, '', location.pathname + (p.size ? '?' + p.toString() : '') + location.hash);
  }
  function hasRole(r) { return !state.character || (r.characters || [r.character]).includes(state.character); }
  function renderCard(r) {
    const card = node('article', null, 'asset-card');
    const preview = node('button', null, 'asset-image'); preview.type = 'button'; preview.setAttribute('aria-label', '预览 ' + r.label + ' ' + r.name);
    const badge = node('span', typeNames[r.kind], 'badge' + (r.kind === 'game' ? '' : ' official'));
    const img = new Image(); img.src = imagePath(r.thumb); img.alt = r.label; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => { if (!img.dataset.fallback) { img.dataset.fallback = '1'; img.src = imagePath(r.file); } });
    preview.append(badge, img); preview.addEventListener('click', () => showImage(r));
    const detail = node('div', null, 'asset-detail');
    const title = node('h3', (r.characters || [r.character]).map(name).join(' / ')); title.title = title.textContent;
    const subtitle = node('p', r.kind === 'game' ? r.outfit : r.label, 'asset-subtitle'); subtitle.title = subtitle.textContent;
    const meta = node('div', null, 'asset-meta');
    if (r.kind === 'game') { meta.append(node('span', `姿态 ${r.pose} · ${r.scale}`), node('span', `表情 ${r.expression}`)); }
    else { meta.append(node('span', `${r.width} × ${r.height}`), node('span', r.alpha ? '透明背景' : '含背景')); }
    const actions = node('div', null, 'asset-actions'); const open = node('button', '查看立绘 ↗'); open.type = 'button'; open.addEventListener('click', () => showImage(r));
    const action = r.kind === 'game' ? link('PNG 下载 ↓', roles.get(r.character).archiveUrl) : link('官网出处 ↗', r.sourcePage);
    actions.append(open, action); detail.append(title, subtitle, meta, actions); card.append(preview, detail); return card;
  }
  function showImage(r, update = true) {
    $('dialog-title').textContent = r.label; $('dialog-image').src = imagePath(r.file); $('dialog-image').alt = r.label;
    const info = $('dialog-info'); info.replaceChildren(); info.append(node('p', r.kind === 'game' ? 'GAME SPRITE' : 'OFFICIAL MATERIAL', 'eyebrow'), node('h3', (r.characters || [r.character]).map(name).join(' / ')), node('p', r.kind === 'game' ? r.outfit : r.label));
    const dl = node('dl'); const item = (k, v, cls) => { dl.append(node('dt', k), node('dd', v, cls)); };
    item('文件', r.name, 'filename'); item('原始尺寸', `${r.width} × ${r.height} px`);
    if (r.kind === 'game') { item('服装', r.costume); item('姿态', `${r.pose} / ${r.scale}`); item('表情', r.expression); item('作品', r.sourceLabel); }
    else { item('类型', typeNames[r.kind]); item('背景', r.alpha ? '透明' : '含背景'); item('来源', r.sourceLabel); }
    info.append(dl);
    const actions = node('div', null, 'dialog-links');
    if (r.kind === 'game') {
      info.append(node('p', '网页显示透明 WebP 预览。该角色的 PNG 原图与全部差分收录在下载包中。'));
      actions.append(link('下载该角色 PNG 包 ↓', roles.get(r.character).archiveUrl), link('保存 WebP 预览 ↓', r.file, r.name + '.webp'));
    } else {
      if (r.notes) info.append(node('p', r.notes));
      actions.append(link('保存原图 ↓', r.file, r.name), link('官方来源页面 ↗', r.sourcePage));
      if (r.sourceAsset) actions.append(link('官网图片地址 ↗', r.sourceAsset));
    }
    const share = node('button', '复制这张立绘的链接 ↗', 'text-button'); share.type = 'button'; share.addEventListener('click', () => copyLink(r.id));
    info.append(actions, share); if (update) updateUrl(r.id); if (!$('image-dialog').open) $('image-dialog').showModal();
  }
  function renderCharacter(c) {
    const card = node('article', null, 'character-card'); const img = new Image(); img.src = imagePath(c.thumbnail); img.alt = c.display; img.loading = 'lazy'; img.className = 'character-image';
    const detail = node('div', null, 'character-detail'); detail.append(node('h3', c.display), node('p', c.id === c.display ? (c.aliases.filter(a => a !== c.id).join(' / ') || '角色立绘') : c.id), node('p', `${c.gameCount.toLocaleString()} 张游戏立绘 · ${c.officialCount} 张官方素材`, 'counts'));
    const actions = node('div', null, 'character-actions'); const browse = node('button', '浏览所有立绘 →'); browse.type = 'button'; browse.addEventListener('click', () => { state.character = c.id; state.source = ''; state.costume = ''; state.scale = ''; state.kind = ''; state.query = ''; syncInputs(); switchTab('search'); });
    actions.append(browse, link(`PNG 原图包 ↓ · ${c.archiveSize}`, c.archiveUrl)); detail.append(actions); card.append(img, detail); return card;
  }
  function applyFilters() {
    const words = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (state.tab === 'characters') {
      filtered = data.characters.filter(c => !c.resourceGroup && (!state.character || c.id === state.character) && words.every(w => [c.id, c.display, ...c.aliases].join(' ').toLowerCase().includes(w)));
    } else {
      filtered = all.filter(r => hasRole(r) && (!state.source || (state.source === 'game' ? r.kind === 'game' : r.kind !== 'game')) && (!state.kind || r.kind === state.kind) && (!state.costume || r.kind === 'game' && r.costume === state.costume) && (!state.scale || r.kind === 'game' && r.scale === state.scale) && words.every(w => r._search.includes(w)));
    }
    render(); updateUrl();
  }
  function render() {
    const isCharacters = state.tab === 'characters';
    $('search-panel').hidden = isCharacters; $('characters').hidden = !isCharacters;
    document.querySelectorAll('.image-filter').forEach(el => { el.hidden = isCharacters; });
    $('costume').disabled = state.source === 'official'; $('scale').disabled = state.source === 'official';
    $('result-count').textContent = isCharacters ? `${filtered.length} 位角色` : `${ready ? '' : '正在载入… · '}找到 ${filtered.length.toLocaleString()} 张 · 已显示 ${Math.min(state.limit, filtered.length)}`;
    $('empty').hidden = filtered.length > 0 || !ready; $('load-more').hidden = isCharacters || filtered.length <= state.limit;
    const root = isCharacters ? $('characters') : $('gallery'); root.replaceChildren();
    const fragment = document.createDocumentFragment(); filtered.slice(0, isCharacters ? filtered.length : state.limit).forEach(r => fragment.append(isCharacters ? renderCharacter(r) : renderCard(r))); root.append(fragment);
    document.querySelectorAll('.quick-role').forEach(b => { b.classList.toggle('active', b.dataset.role === state.character); b.setAttribute('aria-pressed', String(b.dataset.role === state.character)); });
  }
  function costumeOptions() {
    const codes = new Map();
    all.filter(r => r.kind === 'game' && hasRole(r)).forEach(r => { if (!codes.has(r.costume)) codes.set(r.costume, state.character ? r.outfit : '服装代码 ' + r.costume); });
    $('costume').replaceChildren(new Option('全部服装', ''));
    [...codes].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).forEach(([code, title]) => $('costume').add(new Option(title, code)));
    if (ready && state.costume && !codes.has(state.costume)) state.costume = '';
    $('costume').value = state.costume;
  }
  function syncInputs() { for (const id of ['search', 'character', 'source', 'costume', 'scale', 'kind']) $(id).value = state[id === 'search' ? 'query' : id]; costumeOptions(); }
  function switchTab(tab) {
    state.tab = tab; state.limit = 48;
    document.querySelectorAll('.tab').forEach(el => { const active = el.dataset.tab === tab; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; });
    applyFilters();
  }
  function reset() { Object.assign(state, { query: '', character: '', source: '', costume: '', scale: '', kind: '', limit: 48 }); syncInputs(); applyFilters(); }
  async function copyLink(asset) {
    updateUrl(asset); const url = location.href;
    try { await navigator.clipboard.writeText(url); toast('链接已复制'); }
    catch { const input = node('input'); input.value = url; document.body.append(input); input.select(); const copied = document.execCommand('copy'); input.remove(); toast(copied ? '链接已复制' : '请复制浏览器地址栏中的链接'); }
  }
  data.characters.filter(c => !c.resourceGroup).forEach(c => $('character').add(new Option(c.display, c.id)));
  data.characters.filter(c => c.resourceGroup).forEach(c => $('character').add(new Option(c.display + '（资源组）', c.id)));
  if (!roles.has(state.character)) state.character = '';
  [['source', ['', 'game', 'official']], ['scale', ['', 's', 'm', 'l']], ['kind', ['', ...Object.keys(typeNames)]]].forEach(([k, values]) => { if (!values.includes(state[k])) state[k] = ''; });
  $('updated').textContent = data.updated.replaceAll('-', '.'); $('updated').dateTime = data.updated;
  $('total-count').textContent = (data.stats.gamePngs + data.official.length).toLocaleString(); $('tab-total').textContent = $('total-count').textContent;
  $('character-count').textContent = data.stats.characterCount; $('tab-characters-count').textContent = data.stats.characterCount;
  const hero = [data.official.find(r => r.character === 'ルナ' && r.kind === 'single_png' && r.sourcePage.includes('2026')), data.official.find(r => r.character === '朝日' && r.kind === 'single_png')];
  hero.forEach((r, i) => { if (r) $(i ? 'hero-right' : 'hero-left').src = imagePath(r.file); });
  for (const id of ['ルナ', '桜小路才華', '朝日', '大蔵りそな', 'エスト']) {
    if (!roles.has(id)) continue;
    const button = node('button', name(id).replace(/^樱小路/, '').replace(/^大藏/, ''), 'quick-role'); button.type = 'button'; button.dataset.role = id; button.addEventListener('click', () => { state.character = state.character === id ? '' : id; state.costume = ''; state.limit = 48; syncInputs(); applyFilters(); }); $('quick-roles').append(button);
  }
  $('filters').addEventListener('submit', e => e.preventDefault());
  $('search').addEventListener('input', e => { state.query = e.target.value; state.limit = 48; applyFilters(); });
  $('character').addEventListener('change', e => { state.character = e.target.value; state.costume = ''; state.limit = 48; costumeOptions(); applyFilters(); });
  for (const id of ['source', 'costume', 'scale', 'kind']) $(id).addEventListener('change', e => {
    state[id] = e.target.value; state.limit = 48;
    if (id === 'source' && state.source === 'official') { state.costume = ''; state.scale = ''; if (state.kind === 'game') state.kind = ''; }
    if (id === 'source' && state.source === 'game' && state.kind !== 'game') state.kind = '';
    if (id === 'kind' && state.kind) { state.source = state.kind === 'game' ? 'game' : 'official'; if (state.source === 'official') { state.costume = ''; state.scale = ''; } }
    syncInputs(); applyFilters();
  });
  document.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
    el.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'search' : e.key === 'End' ? 'characters' : state.tab === 'search' ? 'characters' : 'search'; switchTab(next); $('tab-' + next).focus(); } });
  });
  $('nav-characters').addEventListener('click', () => switchTab('characters'));
  $('reset').addEventListener('click', reset); $('empty-reset').addEventListener('click', reset);
  $('load-more').addEventListener('click', () => { state.limit += 48; render(); });
  $('share-search').addEventListener('click', () => copyLink());
  $('close-dialog').addEventListener('click', () => $('image-dialog').close());
  $('image-dialog').addEventListener('close', () => { updateUrl(); $('dialog-image').removeAttribute('src'); });
  $('image-dialog').addEventListener('click', e => { if (e.target === $('image-dialog')) { const rect = e.target.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) e.target.close(); } });
  syncInputs(); switchTab(state.tab);
  const script = document.createElement('script'); script.src = data.gameScript;
  script.onload = () => {
    const games = window.CATALOG_GAME_DATA || []; window.CATALOG_GAME_DATA = null;
    // Show one of every character before the long expression sequences.
    const featured = [], rest = [], seen = new Set();
    games.forEach(r => { indexRecord(r); if (!seen.has(r.character) && roles.get(r.character)?.resourceGroup !== true) { featured.push(r); seen.add(r.character); } else rest.push(r); });
    all = [...data.official, ...featured, ...rest]; ready = true; costumeOptions(); applyFilters();
    const selected = params.get('asset'); if (selected && records.has(selected)) showImage(records.get(selected));
  };
  script.onerror = () => { ready = true; $('error').hidden = false; $('error').textContent = '游戏立绘索引载入失败。请刷新重试，或先浏览官方素材。'; applyFilters(); };
  document.body.append(script);
})();
