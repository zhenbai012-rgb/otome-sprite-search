/* Static sprite search. No account, backend, or runtime API is required. */
(() => {
  'use strict';
  const data = window.CATALOG_DATA;
  const $ = id => document.getElementById(id);
  if (!data) { $('error').hidden = false; $('error').textContent = '索引未能载入，请刷新页面重试。'; return; }
  const params = new URLSearchParams(location.search);
  const state = { tab: params.get('tab') === 'characters' ? 'characters' : 'search', query: params.get('q') || '', character: params.get('role') || '', source: params.get('source') || '', costume: params.get('costume') || '', scale: params.get('scale') || '', kind: params.get('type') || '', work: params.get('work') || '', frame: params.get('frame') || '', limit: 48 };
  const typeNames = { game: '游戏立绘', cg: '剧情 CG', title: '标题 / Logo', single_png: '单人全身', group: '组合图', composite: '带背景图' };
  const roles = new Map(data.characters.map(c => [c.id, c]));
  const works = new Map((data.works || []).map(w => [w.id,w]));
  const isArtwork = r => ['cg','title'].includes(r.kind);
  const isGameSource = r => ['game','cg','title'].includes(r.kind);
  const workName = id => works.get(id)?.label || id;
  const packs = data.costumePacks || [];
  const packKey = r => JSON.stringify([r.character, r.variant || r.character, r.costume]);
  const packIndex = new Map(packs.map(p => [packKey(p), p]));
  const records = new Map();
  let all = [...data.official], filtered = [], ready = false, toastTimer;
  let gameRecords = [], artworkRecords = [], artworkPacks = [], selectedOpened = false, displayedAsset='';
  const loaded = {game:false,cg:!data.cg};
  let imageTicket = 0;
  const name = id => roles.get(id)?.display || id;
  const safeUrl = value => { try { const u = new URL(value, location.href); return ['https:', 'http:', 'file:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const imagePath = value => {
    if (value.startsWith('cg-assets/')) {
      const local = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) && location.pathname.includes('/dist/');
      value = local ? new URL('../'+value,location.href).href : new URL(value,data.cg.assetBase).href;
    }
    return encodeURI(value).replace(/#/g, '%23');
  };
  const titleCast = r => (r.characters || []).filter(c => c!=='作品素材').map(name).join(' / ');
  const recordLabel = r => r.kind === 'game' ? name(r.character)+' · '+r.outfit : r.kind === 'title' ? workName(state.work && r.gameIds.includes(state.work) ? state.work : r.gameIds[0])+' · '+r.titleType+(titleCast(r)?' · '+titleCast(r):'') : r.label;
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
  function loadImage(img, path, fallback) {
    const ticket = String(++imageTicket); img.dataset.request = ticket;
    let failures = 0;
    img.onerror = () => {
      failures += 1;
      if (failures > 3) { img.dataset.failed = 'true'; return; }
      const next = failures === 3 && fallback ? fallback : path;
      setTimeout(() => {
        if (img.isConnected && img.dataset.request === ticket && img.getAttribute('src')) img.src = imagePath(next) + (next.includes('?') ? '&' : '?') + 'retry=' + failures;
      }, failures * 900);
    };
    img.onload = () => { delete img.dataset.failed; };
    img.src = imagePath(path);
  }
  function link(text, href, downloadName) {
    const a = node('a', text); a.href = safeUrl(href);
    if (downloadName) a.download = downloadName;
    else { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function indexRecord(r) {
    r.gameIds ||= [...works.values()].filter(w => (r.sourceLabel || '').split(' / ').includes(w.legacyLabel)).map(w => w.id);
    r.orientation ||= r.height >= r.width*1.5 ? 'long' : r.height > r.width ? 'portrait' : 'landscape';
    r._search = [r.label, recordLabel(r), r.name, r.variant, data.variantLabels?.[r.variant], r.sourceLabel, r.costume, r.expression, ...(r.tags || []), ...r.gameIds.map(workName), ...(r.characters || [r.character]).flatMap(c => [c, name(c), ...(roles.get(c)?.aliases || [])])].filter(Boolean).join(' ').toLowerCase();
    const labels=[r.outfit,...(r.tags || [])].filter(Boolean), aliases=(r.characters || [r.character]).flatMap(c => [name(c),...(roles.get(c)?.aliases || [])]);
    r._search+=' '+aliases.flatMap(a => labels.map(t => a+t)).join(' ').toLowerCase();
    if(r.kind==='title')r._search+=' 日文标题 日文logo 原版标题 游戏标题 标题logo';
    records.set(r.id, r); return r;
  }
  all.forEach(indexRecord);
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000); }
  function updateUrl(asset) {
    const p = new URLSearchParams();
    asset ||= $('image-dialog').open ? displayedAsset : '';
    for (const [key, value] of [['q', state.query.trim()], ['role', state.character], ['source', state.source], ['costume', state.costume], ['scale', state.scale], ['type', state.kind], ['work',state.work], ['frame',state.frame], ['tab', state.tab === 'characters' ? 'characters' : ''], ['asset', asset || '']]) if (value) p.set(key, value);
    history.replaceState(null, '', location.pathname + (p.size ? '?' + p.toString() : '') + location.hash);
  }
  function hasRole(r) { return !state.character || (r.characters || [r.character]).includes(state.character); }
  function artworkButton(text,action) {
    const el = node('button',text); el.type = 'button'; el.dataset.artworkDownload = 'true'; el.disabled = window.ArtworkDownloads.isBusy(); el.addEventListener('click',action); return el;
  }
  function packsFor(r) { return artworkPacks.filter(p => r.packIds.includes(p.id) && (!state.work || p.game === state.work)); }
  function showArtworkPacks(title,selected) {
    $('download-title').textContent = title+' · 完整原图分包'; $('download-summary').textContent = '按作品和场景分别下载，保留完整画布、表情差分与原始图层。';
    const root = $('download-list'); root.replaceChildren();
    for (const game of [...new Set(selected.map(p => p.game))]) {
      const section = node('section',null,'download-group'), list = node('div',null,'download-grid'); section.append(node('h3',workName(game)));
      selected.filter(p => p.game === game).forEach(p => { const b = artworkButton('',() => window.ArtworkDownloads.pack(p)); b.className = 'download-pack'; b.append(node('strong',p.title+' ↓'),node('span',`${p.count} 张 PNG · ${(p.bytes/1_000_000).toFixed(1)} MB`)); list.append(b); });
      section.append(list); root.append(section);
    }
    const status = node('p',null,'inline-download-status'); status.hidden=true; status.setAttribute('role','status'); root.append(status);
    if (!$('download-dialog').open) $('download-dialog').showModal();
  }
  function saveScene(r) { const selected = packsFor(r); if (selected.length === 1) window.ArtworkDownloads.pack(selected[0]); else showArtworkPacks(recordLabel(r),selected); }
  function renderCard(r) {
    const card = node('article', null, 'asset-card'+(isArtwork(r)?' artwork-card':''));
    const preview = node('button', null, 'asset-image'); preview.type = 'button'; preview.setAttribute('aria-label', '预览 ' + recordLabel(r) + ' ' + r.name);
    const badge = node('span', typeNames[r.kind], 'badge' + (isArtwork(r)?' cg':r.kind === 'game' ? '' : ' official'));
    const img = new Image(); img.alt = recordLabel(r); img.loading = 'lazy'; img.decoding = 'async'; loadImage(img, r.thumb, r.file);
    preview.append(badge, img); preview.addEventListener('click', () => showImage(r));
    const detail = node('div', null, 'asset-detail');
    const title = node('h3', r.kind === 'title' ? r.titleType+(titleCast(r)?' · '+titleCast(r):'') : (r.characters || [r.character]).map(name).join(' / ')); title.title = title.textContent;
    const subtitle = node('p', r.kind === 'game' ? r.outfit : isArtwork(r) ? r.kind === 'title' ? r.gameIds.map(workName).join(' / ') : '剧情CG · '+r.name : r.label, 'asset-subtitle'); subtitle.title = subtitle.textContent;
    const meta = node('div', null, 'asset-meta');
    if (r.kind === 'game') { meta.append(node('span', `姿态 ${r.pose} · ${r.scale}`), node('span', `表情 ${r.expression}`)); }
    else { meta.append(node('span', `${r.width} × ${r.height}`), node('span', isArtwork(r) ? r.orientation === 'long' ? '完整长图' : '完整画布' : r.alpha ? '透明背景' : '含背景')); }
    const actions = node('div', null, 'asset-actions'); const open = node('button', isArtwork(r) ? '查看原图 ↗' : '查看立绘 ↗'); open.type = 'button'; open.addEventListener('click', () => showImage(r));
    const pack = packIndex.get(packKey(r));
    const action = r.kind === 'game' ? link('服装包 ↓', pack.url) : isArtwork(r) ? artworkButton('PNG 原图 ↓',() => window.ArtworkDownloads.png(r)) : link('官网出处 ↗', r.sourcePage);
    actions.append(open, action); detail.append(title, subtitle, meta, actions); card.append(preview, detail); return card;
  }
  function showImage(r, update = true) {
    displayedAsset=r.id;
    $('image-dialog').classList.toggle('artwork-dialog',isArtwork(r));
    $('dialog-title').textContent = recordLabel(r); loadImage($('dialog-image'), r.file); $('dialog-image').alt = recordLabel(r);
    const info = $('dialog-info'); info.replaceChildren(); info.append(node('p',typeNames[r.kind],'eyebrow'), node('h3', r.kind === 'title' ? r.titleType : (r.characters || [r.character]).map(name).join(' / ')), node('p', r.kind === 'game' ? r.outfit : recordLabel(r)));
    const dl = node('dl'); const item = (k, v, cls) => { dl.append(node('dt', k), node('dd', v, cls)); };
    item('文件', r.name, 'filename'); item('原始尺寸', `${r.width} × ${r.height} px`);
    if (r.kind === 'game') { item('服装', r.costume); item('姿态', `${r.pose} / ${r.scale}`); item('表情', r.expression); item('作品', r.sourceLabel); }
    else { item('类型', typeNames[r.kind]); item('背景', r.alpha ? '透明' : '含背景'); item('来源', isArtwork(r) ? r.gameIds.map(workName).join(' / ') : r.sourceLabel); if (isArtwork(r)) item('场景',r.scene); }
    info.append(dl);
    const actions = node('div', null, 'dialog-links');
    if (r.kind === 'game') {
      const pack = packIndex.get(packKey(r));
      info.append(node('p', `网页显示透明 WebP 预览。此包包含「${data.variantLabels?.[r.variant] || name(r.character)} · ${pack.label}」的 ${pack.count} 张原尺寸 PNG，保留姿态与表情差分。`));
      actions.append(link(`下载该服装 PNG 包 ↓ · ${(pack.size / 1_000_000).toFixed(1)} MB`, pack.url), link('保存 WebP 预览 ↓', r.file, r.name + '.webp'));
    } else if (isArtwork(r)) {
      info.append(node('p',r.kind === 'cg' ? '保留完整原始画布，长图和差分均未裁切。场景包包含此场景的已收录差分。' : '保留日文原版标题资源的完整画布。标题包同时提供原始背景、Logo与组成图层。'));
      actions.append(artworkButton(`下载完整 PNG ↓ · ${(r.originalBytes/1_000_000).toFixed(1)} MB`,() => window.ArtworkDownloads.png(r)),artworkButton(r.kind === 'title' ? '下载标题与Logo图层包 ↓' : '下载同场景 CG 包 ↓',() => saveScene(r)),link('打开完整原尺寸图片 ↗',window.ArtworkDownloads.urlFor(r.original)));
    } else {
      if (r.notes) info.append(node('p', r.notes));
      actions.append(link('保存原图 ↓', r.file, r.name), link('官方来源页面 ↗', r.sourcePage));
      if (r.sourceAsset) actions.append(link('官网图片地址 ↗', r.sourceAsset));
    }
    const share = node('button', '复制这张图片的链接 ↗', 'text-button'); share.type = 'button'; share.addEventListener('click', () => copyLink(r.id));
    info.append(actions, share);
    if(isArtwork(r)){const status=node('p',null,'inline-download-status');status.hidden=true;status.setAttribute('role','status');info.append(status);}
    if (update) updateUrl(r.id); if (!$('image-dialog').open) $('image-dialog').showModal();
  }
  function renderCharacter(c) {
    const card = node('article', null, 'character-card'); const img = new Image(); loadImage(img, c.thumbnail); img.alt = c.display; img.loading = 'lazy'; img.className = 'character-image';
    const detail = node('div', null, 'character-detail'); detail.append(node('h3', c.display), node('p', '版本、服装与剧情片段'), node('p', `${c.gameCount.toLocaleString()} 张立绘 · ${c.cgCount || 0} 张路线CG · ${c.officialCount} 张官方素材`, 'counts'));
    const actions = node('div', null, 'character-actions'); const browse = node('button', '浏览所有立绘 →'); browse.type = 'button'; browse.addEventListener('click', () => { state.character = c.id; state.source = ''; state.costume = ''; state.scale = ''; state.kind = ''; state.query = ''; syncInputs(); switchTab('search'); });
    const download = node('button', `按版本与服装下载 ↓ · ${packs.filter(p => p.character === c.id).length} 个包`); download.type = 'button'; download.addEventListener('click', () => showDownloads(c));
    actions.append(browse, download);
    if (c.cgCount) { const cg = node('button','查看路线CG →'); cg.type='button'; cg.addEventListener('click',() => { state.character=c.id; state.kind='cg'; state.source='game'; state.costume=''; state.scale=''; state.query=''; syncInputs(); switchTab('search'); }); actions.append(cg); }
    detail.append(actions); card.append(img, detail); return card;
  }
  function showDownloads(c) {
    const selected = packs.filter(p => p.character === c.id), root = $('download-list'); root.replaceChildren();
    $('download-title').textContent = c.display + ' · PNG 分包下载';
    $('download-summary').textContent = `按版本与服装分为 ${selected.length} 个包，共 ${selected.reduce((sum, p) => sum + p.count, 0).toLocaleString()} 张原尺寸 PNG。同款服装的姿态与表情差分放在一起。`;
    const variants = [...new Set(selected.map(p => p.variant))];
    for (const variant of variants) {
      const section = node('section', null, 'download-group');
      section.append(node('h3', data.variantLabels?.[variant] || c.display));
      const list = node('div', null, 'download-grid');
      selected.filter(p => p.variant === variant).forEach(p => {
        const a = link('', p.url); a.className = 'download-pack';
        a.append(node('strong', p.label + ' ↓'), node('span', `${p.count} 张 PNG · ${(p.size / 1_000_000).toFixed(1)} MB`)); list.append(a);
      });
      section.append(list); root.append(section);
    }
    $('download-dialog').showModal();
  }
  function applyFilters() {
    const words = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (state.tab === 'characters') {
      filtered = data.characters.filter(c => !c.resourceGroup && (!state.character || c.id === state.character) && words.every(w => [c.id, c.display, ...c.aliases].join(' ').toLowerCase().includes(w)));
    } else {
      filtered = all.filter(r => hasRole(r) && (!state.source || (state.source === 'game' ? isGameSource(r) : !isGameSource(r))) && (!state.kind || r.kind === state.kind) && (!state.work || r.gameIds.includes(state.work)) && (!state.frame || (state.frame === 'portrait' ? r.height > r.width : r.orientation === state.frame)) && (!state.costume || r.kind === 'game' && r.costume === state.costume) && (!state.scale || r.kind === 'game' && r.scale === state.scale) && words.every(w => r._search.includes(w)));
    }
    render(); updateUrl();
  }
  function render() {
    const isCharacters = state.tab === 'characters';
    $('search-panel').hidden = isCharacters; $('characters').hidden = !isCharacters;
    document.querySelectorAll('.image-filter').forEach(el => { el.hidden = isCharacters; });
    const noStanding = state.source === 'official' || ['cg','title'].includes(state.kind);
    $('costume').disabled = noStanding; $('scale').disabled = noStanding; $('work').disabled = state.source === 'official'; $('frame').disabled = state.kind === 'game';
    $('type-note').hidden=isCharacters || !['cg','title'].includes(state.kind);
    $('type-note').textContent=state.kind==='cg'?'普通剧情 CG 按路线角色整理，长图和差分保留完整画布。':'标题资源包含画面、Logo与人物图层，原始组成图层可按作品下载。';
    $('result-count').textContent = isCharacters ? `${filtered.length} 位角色` : `${ready ? '' : '正在载入… · '}找到 ${filtered.length.toLocaleString()} 张 · 已显示 ${Math.min(state.limit, filtered.length)}`;
    $('empty').hidden = filtered.length > 0 || !ready; $('load-more').hidden = isCharacters || filtered.length <= state.limit;
    const root = isCharacters ? $('characters') : $('gallery'); root.replaceChildren();
    const fragment = document.createDocumentFragment(); filtered.slice(0, isCharacters ? filtered.length : state.limit).forEach(r => fragment.append(isCharacters ? renderCharacter(r) : renderCard(r))); root.append(fragment);
    document.querySelectorAll('.quick-role').forEach(b => { b.classList.toggle('active', b.dataset.role === state.character); b.setAttribute('aria-pressed', String(b.dataset.role === state.character)); });
    document.querySelectorAll('.quick-types button').forEach(b => { b.classList.toggle('active',b.dataset.kind === state.kind); b.setAttribute('aria-pressed',String(b.dataset.kind === state.kind)); });
  }
  function costumeOptions() {
    const codes = new Map();
    all.filter(r => r.kind === 'game' && hasRole(r)).forEach(r => { if (!codes.has(r.costume)) codes.set(r.costume, state.character ? r.outfit : '服装代码 ' + r.costume); });
    $('costume').replaceChildren(new Option('全部服装', ''));
    [...codes].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).forEach(([code, title]) => $('costume').add(new Option(title, code)));
    if (ready && state.costume && !codes.has(state.costume)) state.costume = '';
    $('costume').value = state.costume;
  }
  function syncInputs() { for (const id of ['search', 'character', 'source', 'costume', 'scale', 'kind','work','frame']) $(id).value = state[id === 'search' ? 'query' : id]; costumeOptions(); }
  function switchTab(tab) {
    state.tab = tab; state.limit = 48;
    document.querySelectorAll('.tab').forEach(el => { const active = el.dataset.tab === tab; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; });
    applyFilters();
  }
  function reset() { Object.assign(state, { query: '', character: '', source: '', costume: '', scale: '', kind: '',work:'',frame:'', limit: 48 }); syncInputs(); applyFilters(); }
  async function copyLink(asset) {
    updateUrl(asset); const url = location.href;
    try { await navigator.clipboard.writeText(url); toast('链接已复制'); }
    catch { const input = node('input'); input.value = url; document.body.append(input); input.select(); const copied = document.execCommand('copy'); input.remove(); toast(copied ? '链接已复制' : '请复制浏览器地址栏中的链接'); }
  }
  data.characters.filter(c => !c.resourceGroup).forEach(c => $('character').add(new Option(c.display, c.id)));
  data.characters.filter(c => c.resourceGroup).forEach(c => $('character').add(new Option(c.display + '（资源组）', c.id)));
  [...works.values()].forEach(w => $('work').add(new Option(w.label,w.id)));
  if (!works.has(state.work)) state.work='';
  if (!roles.has(state.character)) state.character = '';
  [['source', ['', 'game', 'official']], ['scale', ['', 's', 'm', 'l']], ['kind', ['', ...Object.keys(typeNames)]],['frame',['','landscape','portrait','long']]].forEach(([k, values]) => { if (!values.includes(state[k])) state[k] = ''; });
  if (['cg','title'].includes(state.kind)) { state.costume=''; state.scale=''; }
  $('updated').textContent = data.updated.replaceAll('-', '.'); $('updated').dateTime = data.updated;
  $('total-count').textContent = (data.stats.gamePngs + data.official.length + (data.stats.cgImages || 0) + (data.stats.titleImages || 0)).toLocaleString(); $('tab-total').textContent = $('total-count').textContent;
  $('cg-count').textContent = data.stats.cgImages || 0; $('title-count').textContent = data.stats.titleImages || 0;
  $('character-count').textContent = data.stats.characterCount; $('tab-characters-count').textContent = data.stats.characterCount;
  const hero = [data.official.find(r => r.character === 'ルナ' && r.kind === 'single_png' && r.sourcePage.includes('2026')), data.official.find(r => r.character === '朝日' && r.kind === 'single_png')];
  hero.forEach((r, i) => { if (r) loadImage($(i ? 'hero-right' : 'hero-left'), r.file); });
  for (const id of ['ルナ', '桜小路才華', '朝日', '大蔵りそな', 'エスト']) {
    if (!roles.has(id)) continue;
    const button = node('button', name(id).replace(/^樱小路/, '').replace(/^大藏/, ''), 'quick-role'); button.type = 'button'; button.dataset.role = id; button.addEventListener('click', () => { state.character = state.character === id ? '' : id; state.costume = ''; state.limit = 48; syncInputs(); applyFilters(); }); $('quick-roles').append(button);
  }
  $('filters').addEventListener('submit', e => e.preventDefault());
  $('search').addEventListener('input', e => { state.query = e.target.value; state.limit = 48; applyFilters(); });
  $('character').addEventListener('change', e => { state.character = e.target.value; state.costume = ''; state.limit = 48; costumeOptions(); applyFilters(); });
  for (const id of ['source', 'costume', 'scale', 'kind','work','frame']) $(id).addEventListener('change', e => {
    state[id] = e.target.value; state.limit = 48;
    if (id === 'source' && state.source === 'official') { state.costume=''; state.scale=''; state.work=''; if (['game','cg','title'].includes(state.kind)) state.kind=''; }
    if (id === 'source' && state.source === 'game' && !['game','cg','title'].includes(state.kind)) state.kind='';
    if (id === 'kind' && state.kind) { state.source=['game','cg','title'].includes(state.kind)?'game':'official'; if (state.kind!=='game') {state.costume='';state.scale='';} if(state.kind==='game')state.frame=''; if(state.kind==='title')state.character=''; if(state.source==='official')state.work=''; }
    if ((id==='costume' || id==='scale') && state[id]) {state.kind='game';state.source='game';state.frame='';}
    syncInputs(); applyFilters();
  });
  document.querySelectorAll('.quick-types button').forEach(b => b.addEventListener('click',() => { state.kind=state.kind===b.dataset.kind?'':b.dataset.kind; state.source=state.kind?'game':''; state.costume='';state.scale='';state.frame='';state.limit=48;if(state.kind==='title')state.character='';syncInputs();switchTab('search'); }));
  document.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
    el.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'search' : e.key === 'End' ? 'characters' : state.tab === 'search' ? 'characters' : 'search'; switchTab(next); $('tab-' + next).focus(); } });
  });
  $('nav-characters').addEventListener('click', () => switchTab('characters'));
  $('reset').addEventListener('click', reset); $('empty-reset').addEventListener('click', reset);
  $('load-more').addEventListener('click', () => { state.limit += 48; render(); });
  $('share-search').addEventListener('click', () => copyLink());
  $('close-dialog').addEventListener('click', () => $('image-dialog').close());
  $('close-downloads').addEventListener('click', () => $('download-dialog').close());
  $('download-dialog').addEventListener('click', e => { if (e.target === $('download-dialog')) { const rect = e.target.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) e.target.close(); } });
  $('image-dialog').addEventListener('close', () => { displayedAsset='';updateUrl(); $('dialog-image').removeAttribute('src'); });
  $('image-dialog').addEventListener('click', e => { if (e.target === $('image-dialog')) { const rect = e.target.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) e.target.close(); } });
  syncInputs(); switchTab(state.tab);
  function mergeLoaded() {
    // Show one of every character before the long expression sequences.
    const featured = [], rest = [], seen = new Set();
    gameRecords.forEach(r => { if (!seen.has(r.character) && roles.get(r.character)?.resourceGroup !== true) { featured.push(r); seen.add(r.character); } else rest.push(r); });
    const cgFeatured=[],cgRest=[],cgSeen=new Set();
    artworkRecords.filter(r => r.kind==='cg').forEach(r => { if(!cgSeen.has(r.character)){cgSeen.add(r.character);cgFeatured.push(r);}else cgRest.push(r); });
    all = [...data.official,...featured,...cgFeatured,...rest,...cgRest,...artworkRecords.filter(r => r.kind==='title')];
    ready=loaded.game && loaded.cg; costumeOptions();applyFilters();
    const selected=params.get('asset'); if(!selectedOpened && selected && records.has(selected)){selectedOpened=true;showImage(records.get(selected));}
  }
  function loadChunk(key,path,attempt=0) {
    const script = document.createElement('script');
    script.src=path+(attempt?(path.includes('?')?'&':'?')+'retry='+attempt:'');
    script.onload=() => {
      if(key==='game'){gameRecords=window.CATALOG_GAME_DATA||[];window.CATALOG_GAME_DATA=null;gameRecords.forEach(indexRecord);}
      else {const payload=window.CATALOG_CG_DATA||{images:[],packs:[]};window.CATALOG_CG_DATA=null;artworkRecords=payload.images;artworkPacks=payload.packs;artworkRecords.forEach(indexRecord);}
      loaded[key]=true;mergeLoaded();
    };
    script.onerror = () => {
      script.remove();
      if(attempt<2){setTimeout(() => loadChunk(key,path,attempt+1),(attempt+1)*1200);return;}
      loaded[key]=true;$('error').hidden=false;$('error').textContent=(key==='cg'?'CG与标题':'游戏立绘')+'索引载入失败，请刷新重试。';mergeLoaded();
    };
    document.body.append(script);
  }
  loadChunk('game',data.gameScript);
  if(data.cg)loadChunk('cg',data.cg.script);
})();
