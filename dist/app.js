/* Static sprite search. No account, backend, or runtime API is required. */
(() => {
  'use strict';
  const data = window.CATALOG_DATA;
  const $ = id => document.getElementById(id);
  if (!data) { $('error').hidden = false; $('error').textContent = '索引未能载入，请刷新页面重试。'; return; }
  const params = new URLSearchParams(location.search);
  const state = { tab: params.get('tab') === 'characters' ? 'characters' : 'search', query: params.get('q') || '', character: params.get('role') || '', source: params.get('source') || '', costume: params.get('costume') || '', scale: params.get('scale') || '', kind: params.get('type') || '', work: params.get('work') || '', frame: params.get('frame') || '', favoritesOnly: false, view: 'compact', limit: 48 };
  const favorites = window.GalleryFavorites;
  const typeNames = { game: '游戏立绘', cg: '剧情 CG', title: '日文标题 / Logo', title_character: '标题人物图层', single_png: '官方单人立绘', group: '官方组合图', composite: '官方带背景图' };
  const roles = new Map(data.characters.map(c => [c.id, c]));
  const works = new Map((data.works || []).map(w => [w.id,w]));
  const isTitleArt = r => ['title','title_character'].includes(r.kind);
  const isArtwork = r => r.kind === 'cg' || isTitleArt(r);
  const isGameSource = r => r.kind === 'game' || isArtwork(r);
  const gameKinds = ['game','cg','title','title_character'];
  const workName = id => works.get(id)?.label || id;
  const packs = data.costumePacks || [];
  const packKey = r => JSON.stringify([r.character, r.variant || r.character, r.costume]);
  const packIndex = new Map(packs.map(p => [packKey(p), p]));
  const records = new Map();
  let all = [...data.official], filtered = [], ready = false, toastTimer;
  let gameRecords = [], artworkRecords = [], artworkPacks = [], selectedOpened = false, displayedAsset='';
  let previewSequence = [], featuredRecords = [], featuredInitialized = false;
  const loaded = {game:false,cg:!data.cg};
  let imageTicket = 0, availableRoles = new Set(roles.keys());
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
  const recordLabel = r => r.kind === 'game' ? name(r.character)+' · '+r.outfit : isTitleArt(r) ? workName(state.work && r.gameIds.includes(state.work) ? state.work : r.gameIds[0])+' · '+r.titleType+(titleCast(r)?' · '+titleCast(r):'') : r.label;
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
    const visibleWidth=r.kind==='game' ? r.webWidth || r.width : r.width, visibleHeight=r.kind==='game' ? r.webHeight || r.height : r.height;
    r.orientation ||= visibleHeight >= visibleWidth*1.5 ? 'long' : visibleHeight > visibleWidth ? 'portrait' : 'landscape';
    r._search = [r.label, recordLabel(r), r.name, r.variant, data.variantLabels?.[r.variant], r.sourceLabel, r.costume, r.expression, ...(r.tags || []), ...r.gameIds.map(workName), ...(r.characters || [r.character]).flatMap(c => [c, name(c), ...(roles.get(c)?.aliases || [])])].filter(Boolean).join(' ').toLowerCase();
    const labels=[r.outfit,...(r.tags || [])].filter(Boolean), aliases=(r.characters || [r.character]).flatMap(c => [name(c),...(roles.get(c)?.aliases || [])]);
    r._search+=' '+aliases.flatMap(a => labels.map(t => a+t)).join(' ').toLowerCase();
    if(r.kind==='title')r._search+=' 日文标题 日文logo 原版标题 游戏标题 标题logo';
    if(r.kind==='title_character')r._search+=' 标题人物 人物图层 标题立绘';
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
  function hasCostume(r, value = state.costume) { return !value || (value.startsWith('outfit:') ? r.outfit === value.slice(7) : r.costume === value); }
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
    preview.append(badge, img, node('span', '查看画面 ↗', 'image-hint')); preview.addEventListener('click', () => showImage(r));
    const detail = node('div', null, 'asset-detail');
    const title = node('h3', isTitleArt(r) ? r.titleType+(titleCast(r)?' · '+titleCast(r):'') : (r.characters || [r.character]).map(name).join(' / ')); title.title = title.textContent;
    const subtitle = node('p', r.kind === 'game' ? r.outfit : isArtwork(r) ? isTitleArt(r) ? r.gameIds.map(workName).join(' / ') : '剧情CG · '+r.name : r.label, 'asset-subtitle'); subtitle.title = subtitle.textContent;
    const meta = node('div', null, 'asset-meta');
    if (r.kind === 'game') { meta.append(node('span', `姿态 ${r.pose} · ${r.scale}`), node('span', `表情 ${r.expression}`)); }
    else { meta.append(node('span', `${r.width} × ${r.height}`), node('span', isArtwork(r) ? r.orientation === 'long' ? '完整长图' : '完整画布' : r.alpha ? '透明背景' : '含背景')); }
    const actions = node('div', null, 'asset-actions'); const open = node('button', isArtwork(r) ? '查看原图 ↗' : '查看立绘 ↗'); open.type = 'button'; open.addEventListener('click', () => showImage(r));
    const pack = packIndex.get(packKey(r));
    const action = r.kind === 'game' ? link('服装包 ↓', pack.url) : isArtwork(r) ? artworkButton('PNG 原图 ↓',() => window.ArtworkDownloads.png(r)) : link('官网出处 ↗', r.sourcePage);
    actions.append(open, action); detail.append(title, subtitle, meta, actions); card.append(preview, favorites.make(r.id, recordLabel(r)), detail); return card;
  }
  function showImage(r, update = true, sequence = null) {
    previewSequence = sequence || (state.tab === 'search' && filtered.some(item => item.id === r.id) ? filtered : [r]);
    displayedAsset=r.id;
    const position = previewSequence.findIndex(item => item.id === r.id);
    $('dialog-prev').disabled = position <= 0;
    $('dialog-next').disabled = position < 0 || position >= previewSequence.length - 1;
    $('dialog-counter').textContent = position >= 0 ? `${position + 1} / ${previewSequence.length}` : '';
    $('image-dialog').classList.toggle('artwork-dialog',isArtwork(r));
    $('dialog-title').textContent = recordLabel(r); loadImage($('dialog-image'), r.file); $('dialog-image').alt = recordLabel(r);
    const info = $('dialog-info'); info.replaceChildren(); info.append(node('p',typeNames[r.kind],'eyebrow'), node('h3', isTitleArt(r) ? r.titleType : (r.characters || [r.character]).map(name).join(' / ')), node('p', r.kind === 'game' ? r.outfit : recordLabel(r)));
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
      actions.append(artworkButton(`下载完整 PNG ↓ · ${(r.originalBytes/1_000_000).toFixed(1)} MB`,() => window.ArtworkDownloads.png(r)),artworkButton(isTitleArt(r) ? '下载标题与Logo图层包 ↓' : '下载同场景 CG 包 ↓',() => saveScene(r)),link('打开完整原尺寸图片 ↗',window.ArtworkDownloads.urlFor(r.original)));
    } else {
      if (r.notes) info.append(node('p', r.notes));
      actions.append(link('保存原图 ↓', r.file, r.name), link('官方来源页面 ↗', r.sourcePage));
      if (r.sourceAsset) actions.append(link('官网图片地址 ↗', r.sourceAsset));
    }
    const share = node('button', '复制这张图片的链接 ↗', 'text-button'); share.type = 'button'; share.addEventListener('click', () => copyLink(r.id));
    const secondary = node('div', null, 'dialog-secondary'); secondary.append(favorites.make(r.id, recordLabel(r), true), share);
    info.append(actions, secondary);
    if(isArtwork(r)){const status=node('p',null,'inline-download-status');status.hidden=true;status.setAttribute('role','status');info.append(status);}
    if (update) updateUrl(r.id); if (!$('image-dialog').open) $('image-dialog').showModal();
  }
  function movePreview(direction) {
    const index = previewSequence.findIndex(item => item.id === displayedAsset), next = previewSequence[index + direction];
    if (next) showImage(next, true, previewSequence);
  }
  function renderCharacter(c) {
    const card = node('article', null, 'character-card'); const img = new Image(); loadImage(img, c.thumbnail); img.alt = c.display; img.loading = 'lazy'; img.className = 'character-image';
    const detail = node('div', null, 'character-detail'); detail.append(node('h3', c.display), node('p', '版本、服装与剧情片段'), node('p', `${c.gameCount.toLocaleString()} 张立绘 · ${c.cgCount || 0} 张路线CG · ${c.officialCount} 张官方素材`, 'counts'));
    const actions = node('div', null, 'character-actions'); const browse = node('button', '浏览所有立绘 →'); browse.type = 'button'; browse.addEventListener('click', () => { state.character = c.id; state.source = ''; state.costume = ''; state.scale = ''; state.kind = ''; state.query = '';state.work='';state.frame=''; syncInputs(); switchTab('search'); });
    const download = node('button', `按版本与服装下载 ↓ · ${packs.filter(p => p.character === c.id).length} 个包`); download.type = 'button'; download.addEventListener('click', () => showDownloads(c));
    actions.append(browse, download);
    if (c.cgCount) { const cg = node('button','查看路线CG →'); cg.type='button'; cg.addEventListener('click',() => { state.character=c.id; state.kind='cg'; state.source='game'; state.costume=''; state.scale=''; state.query='';state.work='';state.frame=''; syncInputs(); switchTab('search'); }); actions.append(cg); }
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
      filtered = all.filter(r => (!state.favoritesOnly || favorites.has(r.id)) && hasRole(r) && (!state.source || (state.source === 'game' ? isGameSource(r) : !isGameSource(r))) && (!state.kind || r.kind === state.kind) && (!state.work || r.gameIds.includes(state.work)) && (!state.frame || (state.frame === 'portrait' ? ['portrait','long'].includes(r.orientation) : r.orientation === state.frame)) && (!state.costume || r.kind === 'game' && hasCostume(r)) && (!state.scale || r.kind === 'game' && r.scale === state.scale) && words.every(w => r._search.includes(w)));
    }
    render(); updateUrl();
  }
  function render() {
    const isCharacters = state.tab === 'characters';
    $('search-panel').hidden = isCharacters; $('characters').hidden = !isCharacters;
    $('favorites-toggle').hidden = isCharacters; $('random-result').hidden = isCharacters; document.querySelector('.view-switch').hidden = isCharacters;
    $('random-result').disabled = !ready || isCharacters || !filtered.length;
    $('gallery').classList.toggle('large-view', state.view === 'large');
    document.querySelectorAll('.image-filter').forEach(el => { el.hidden = isCharacters; });
    $('role-filter').hidden = !isCharacters && state.kind === 'title';
    $('standing-note').hidden = isCharacters || !(state.source === 'official' || (state.kind && state.kind !== 'game'));
    $('quick-roles').hidden = !isCharacters && state.kind === 'title';
    document.querySelector('.quick-types').hidden = isCharacters;
    $('type-note').hidden = isCharacters || !['cg','title','title_character'].includes(state.kind);
    $('type-note').textContent = state.kind === 'cg' ? '剧情 CG 按路线角色整理，长图和差分保留完整画布。' : state.kind === 'title_character' ? '从标题画面导出的人物图层，与游戏立绘分开检索。' : '这里只显示日文 Logo 和完整标题画面；人物图层单独分类，标题背景请到背景图库查看。';
    const backgroundLink = new URL('backgrounds/', location.href); backgroundLink.searchParams.set('kind','title');backgroundLink.hash='collection';if(state.work)backgroundLink.searchParams.set('game',state.work); $('title-backgrounds-link').href=backgroundLink.href;
    $('result-count').textContent = isCharacters ? `${filtered.length} 位角色` : `${ready ? '' : '正在载入… · '}找到 ${filtered.length.toLocaleString()} 张 · 已显示 ${Math.min(state.limit, filtered.length)}`;
    $('empty').hidden = filtered.length > 0 || !ready; $('load-more').hidden = isCharacters || filtered.length <= state.limit;
    $('empty').querySelector('h3').textContent = state.favoritesOnly && !isCharacters ? '暂时没有符合条件的收藏' : '暂时没有匹配的结果';
    $('empty').querySelector('p').textContent = state.favoritesOnly && !isCharacters ? '点击图片右上角的 ♡ 收藏，或放宽筛选条件。' : '试试角色简称，或放宽服装、镜头条件。';
    const root = isCharacters ? $('characters') : $('gallery'); root.replaceChildren();
    const fragment = document.createDocumentFragment(); filtered.slice(0, isCharacters ? filtered.length : state.limit).forEach(r => fragment.append(isCharacters ? renderCharacter(r) : renderCard(r))); root.append(fragment);
    document.querySelectorAll('.quick-role').forEach(b => { b.hidden = !availableRoles.has(b.dataset.role); b.classList.toggle('active', b.dataset.role === state.character); b.setAttribute('aria-pressed', String(b.dataset.role === state.character)); });
    document.querySelectorAll('.quick-types button').forEach(b => { b.classList.toggle('active',b.dataset.kind === state.kind); b.setAttribute('aria-pressed',String(b.dataset.kind === state.kind)); });
    updateFavorites();
  }
  function updateFavorites() {
    $('favorites-count').textContent = favorites.count(all).toLocaleString();
    $('favorites-toggle').classList.toggle('active', state.favoritesOnly);
    $('favorites-toggle').setAttribute('aria-pressed', String(state.favoritesOnly));
    favorites.refresh();
  }
  function roleOptions() {
    if (state.kind === 'title' && state.tab !== 'characters') state.character = '';
    const candidates = state.tab === 'characters' || !ready ? data.characters : all.filter(r => (!state.kind || r.kind === state.kind) && (!state.work || r.gameIds.includes(state.work)) && (!state.source || (state.source === 'game' ? isGameSource(r) : !isGameSource(r))));
    availableRoles = new Set(candidates.flatMap(r => r.characters || [r.character || r.id]));
    if (ready && state.character && !availableRoles.has(state.character)) { state.character='';state.costume='';state.scale=''; }
    $('character').replaceChildren(new Option('全部角色', ''));
    data.characters.filter(c => availableRoles.has(c.id)).forEach(c => $('character').add(new Option(c.display+(c.resourceGroup?'（资源组）':''),c.id)));
  }
  function costumeOptions() {
    const standing = all.filter(r => r.kind === 'game' && hasRole(r) && (!state.work || r.gameIds.includes(state.work)));
    const outfits = new Map();
    standing.forEach(r => {
      const value = state.character ? r.costume : 'outfit:' + r.outfit;
      if (!outfits.has(value)) outfits.set(value,{labels:new Set(),count:0});
      const item=outfits.get(value);item.labels.add(r.outfit);item.count++;
    });
    $('costume').replaceChildren(new Option('全部服装', ''));
    [...outfits].sort(([,a],[,b]) => {const x=[...a.labels].join(' / '),y=[...b.labels].join(' / ');return Number(x.startsWith('服装代码'))-Number(y.startsWith('服装代码')) || x.localeCompare(y,'zh-CN',{numeric:true});}).forEach(([value,item]) => $('costume').add(new Option([...item.labels].join(' / ')+' · '+item.count+' 张',value)));
    // Old shared links may use a numeric costume before a role was selected.
    if (state.costume && !outfits.has(state.costume) && !state.character && !state.costume.startsWith('outfit:') && standing.some(r=>r.costume===state.costume)) $('costume').add(new Option('服装代码 '+state.costume,state.costume));
    else if (loaded.game && state.costume && !outfits.has(state.costume)) state.costume = '';
    const scales = new Set(standing.filter(r=>hasCostume(r)).map(r=>r.scale));
    $('scale').replaceChildren(new Option('全部镜头',''));
    for(const [value,label] of [['s','远景'],['m','中景'],['l','近景']]) if(!loaded.game || scales.has(value)) $('scale').add(new Option(label,value));
    if(loaded.game && state.scale && !scales.has(state.scale))state.scale='';
  }
  function syncInputs() { roleOptions();costumeOptions();for (const id of ['search', 'character', 'source', 'costume', 'scale', 'kind','work','frame']) $(id).value = state[id === 'search' ? 'query' : id]; }
  function switchTab(tab) {
    state.tab = tab; state.limit = 48;
    document.querySelectorAll('.tab').forEach(el => { const active = el.dataset.tab === tab; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; });
    syncInputs();applyFilters();
  }
  function reset() { Object.assign(state, { query: '', character: '', source: '', costume: '', scale: '', kind: '',work:'',frame:'', favoritesOnly:false, limit: 48 }); syncInputs(); applyFilters(); }
  async function copyLink(asset) {
    updateUrl(asset); const url = location.href;
    try { await navigator.clipboard.writeText(url); toast('链接已复制'); }
    catch { const input = node('input'); input.value = url; document.body.append(input); input.select(); const copied = document.execCommand('copy'); input.remove(); toast(copied ? '链接已复制' : '请复制浏览器地址栏中的链接'); }
  }
  function renderFeatured() {
    const root = $('featured-grid'); root.replaceChildren();
    featuredRecords.forEach((r, index) => {
      const card = node('article', null, 'featured-card'), preview = node('button', null, 'featured-preview');
      preview.type = 'button'; preview.setAttribute('aria-label', '查看 ' + recordLabel(r));
      const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; loadImage(img, r.thumb, r.file);
      preview.append(img, node('span', '查看画面 ↗', 'image-hint'));
      preview.addEventListener('click', () => showImage(r, true, featuredRecords));
      const details = node('div', null, 'featured-info');
      details.append(node('span', String(index + 1).padStart(2, '0'), 'featured-number'), node('div', null, 'featured-name'));
      details.lastChild.append(node('strong', (r.characters || [r.character]).map(name).join(' / ')), node('span', r.gameIds.map(workName).join(' / ')));
      card.append(preview, favorites.make(r.id, recordLabel(r)), details); root.append(card);
    });
    $('discover').hidden = !featuredRecords.length; favorites.refresh();
  }
  function chooseFeatured(first = false) {
    const pool = artworkRecords.filter(r => r.kind === 'cg');
    if (!pool.length) return;
    if (first) {
      const ids = ['cg-2b03c3c22af2a5ce', 'cg-b60333aaa927fa00', 'cg-eaf24ad112bc8605', 'cg-8a6abc537247be82'];
      featuredRecords = ids.map(id => pool.find(r => r.id === id)).filter(Boolean);
    } else {
      const shuffled = pool.slice();
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
      const scenes = new Set(); featuredRecords = [];
      for (const r of shuffled) {
        const key = `${r.gameIds[0]}:${r.scene}`;
        if (scenes.has(key)) continue;
        scenes.add(key); featuredRecords.push(r); if (featuredRecords.length === 4) break;
      }
    }
    renderFeatured();
  }
  function initDesktopArchive() {
    const pool = artworkRecords.filter(r => r.kind === 'cg'), picks = [], scenes = new Set();
    const add = r => {
      if (!r || picks.length >= 8) return;
      const key = `${r.gameIds[0]}:${r.scene}`;
      if (!scenes.has(key)) { scenes.add(key); picks.push(r); }
    };
    add(featuredRecords[0]);
    for (const work of works.keys()) if (!picks.some(r => r.gameIds.includes(work))) add(pool.find(r => r.gameIds.includes(work)));
    featuredRecords.slice(1).forEach(add);
    pool.forEach(add);
    window.GalleryArchive?.mount({
      records: picks, kind: '剧情 CG', heading: '画面',
      description: '翻阅角色与故事中的瞬间，找到喜欢的一张。', href: '#archive', loadImage,
      label: r => (r.characters || [r.character]).map(name).join(' / '),
      code: r => r.name, meta: r => `${workName(r.gameIds[0])} · 剧情 CG · ${r.name}`,
      open: (r, sequence) => showImage(r, true, sequence),
      random: () => showImage(pool[Math.floor(Math.random() * pool.length)], true, pool),
    });
  }
  data.characters.filter(c => !c.resourceGroup).forEach(c => $('character').add(new Option(c.display, c.id)));
  data.characters.filter(c => c.resourceGroup).forEach(c => $('character').add(new Option(c.display + '（资源组）', c.id)));
  [...works.values()].forEach(w => $('work').add(new Option(w.label,w.id)));
  if (!works.has(state.work)) state.work='';
  if (!roles.has(state.character)) state.character = '';
  [['source', ['', 'game', 'official']], ['scale', ['', 's', 'm', 'l']], ['kind', ['', ...Object.keys(typeNames)]],['frame',['','landscape','portrait','long']]].forEach(([k, values]) => { if (!values.includes(state[k])) state[k] = ''; });
  if (['cg','title','title_character'].includes(state.kind)) { state.costume=''; state.scale=''; }
  if (state.kind === 'title') state.character='';
  $('updated').textContent = data.updated.replaceAll('-', '.'); $('updated').dateTime = data.updated;
  $('total-count').textContent = (data.stats.gamePngs + data.official.length + (data.stats.cgImages || 0) + (data.stats.titleImages || 0) + (data.stats.titleCharacterImages || 0)).toLocaleString(); $('tab-total').textContent = $('total-count').textContent;
  $('cg-count').textContent = data.stats.cgImages || 0; $('title-count').textContent = data.stats.titleImages || 0;
  $('character-count').textContent = data.stats.characterCount; $('tab-characters-count').textContent = data.stats.characterCount;
  const hero = [data.official.find(r => r.character === 'ルナ' && r.kind === 'single_png' && r.sourcePage.includes('2026')), data.official.find(r => r.character === '朝日' && r.kind === 'single_png')];
  hero.forEach((r, i) => {
    if (!r) return;
    loadImage($(i ? 'hero-right' : 'hero-left'), r.file);
    $(i ? 'hero-right-button' : 'hero-left-button').addEventListener('click', () => showImage(r, true, hero.filter(Boolean)));
  });
  for (const id of ['ルナ', '桜小路才華', '朝日', '大蔵りそな', 'エスト']) {
    if (!roles.has(id)) continue;
    const button = node('button', name(id).replace(/^樱小路/, '').replace(/^大藏/, ''), 'quick-role'); button.type = 'button'; button.dataset.role = id; button.addEventListener('click', () => { state.character = state.character === id ? '' : id; state.costume = ''; state.limit = 48; syncInputs(); applyFilters(); }); $('quick-roles').append(button);
  }
  $('filters').addEventListener('submit', e => e.preventDefault());
  $('search').addEventListener('input', e => { state.query = e.target.value; state.limit = 48; applyFilters(); });
  $('character').addEventListener('change', e => { state.character = e.target.value; state.costume = ''; state.scale = ''; state.limit = 48; syncInputs(); applyFilters(); });
  for (const id of ['source', 'costume', 'scale', 'kind','work','frame']) $(id).addEventListener('change', e => {
    const changingCollection = state.source === 'official' || (state.kind && state.kind !== 'game');
    state[id] = e.target.value; state.limit = 48;
    if (id === 'source' && state.source === 'official') { state.costume=''; state.scale=''; state.work=''; if (gameKinds.includes(state.kind)) state.kind=''; }
    if (id === 'source' && state.source === 'game' && !gameKinds.includes(state.kind)) state.kind='';
    if (id === 'kind' && state.kind) { state.source=gameKinds.includes(state.kind)?'game':'official'; if (state.kind!=='game') {state.costume='';state.scale='';} if(state.kind==='title')state.character=''; if(state.source==='official')state.work=''; }
    if ((id==='costume' || id==='scale') && state[id]) {state.kind='game';state.source='game';state.frame='';if(changingCollection){state.query='';toast('已切换到游戏立绘，可继续筛选服装和镜头');}}
    if (id==='work' && state.work && state.source==='official') {state.source='game';state.kind='game';state.query='';}
    syncInputs(); applyFilters();
  });
  document.querySelectorAll('.quick-types button').forEach(b => b.addEventListener('click',() => { state.kind=state.kind===b.dataset.kind?'':b.dataset.kind; state.source=state.kind?'game':''; state.costume='';state.scale='';state.frame='';state.limit=48;if(state.kind==='title')state.character='';syncInputs();switchTab('search'); }));
  document.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
    el.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'search' : e.key === 'End' ? 'characters' : state.tab === 'search' ? 'characters' : 'search'; switchTab(next); $('tab-' + next).focus(); } });
  });
  $('nav-characters').addEventListener('click', () => switchTab('characters'));
  $('collection-sprites').addEventListener('click', () => switchTab('search'));
  $('reset').addEventListener('click', reset); $('empty-reset').addEventListener('click', reset);
  $('load-more').addEventListener('click', () => { state.limit += 48; render(); });
  $('share-search').addEventListener('click', () => copyLink());
  $('shuffle-featured').addEventListener('click', () => chooseFeatured());
  $('hero-random').addEventListener('click', () => { const pool = artworkRecords.filter(r => r.kind === 'cg'); if (pool.length) showImage(pool[Math.floor(Math.random() * pool.length)], true, pool); });
  $('random-result').addEventListener('click', () => { if (state.tab === 'search' && filtered.length) showImage(filtered[Math.floor(Math.random() * filtered.length)], true, filtered); });
  $('favorites-toggle').addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; state.limit = 48; applyFilters(); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view; document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); render();
  }));
  favorites.subscribe(persisted => { if (!persisted) toast('当前浏览器无法保存收藏，刷新后会清空'); if (state.favoritesOnly && state.tab === 'search') applyFilters(); else updateFavorites(); });
  $('dialog-prev').addEventListener('click', () => movePreview(-1)); $('dialog-next').addEventListener('click', () => movePreview(1));
  document.addEventListener('keydown', event => { if ($('image-dialog').open && !event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); movePreview(event.key === 'ArrowLeft' ? -1 : 1); } });
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
    all = [...data.official,...featured,...cgFeatured,...rest,...cgRest,...artworkRecords.filter(isTitleArt)];
    ready=loaded.game && loaded.cg; syncInputs();applyFilters();
    $('hero-random').disabled = !artworkRecords.some(r => r.kind === 'cg');
    if (loaded.cg && !featuredInitialized && artworkRecords.length) { featuredInitialized = true; chooseFeatured(true); initDesktopArchive(); }
    const selected=params.get('asset'); if(!selectedOpened && selected && records.has(selected)){selectedOpened=true;showImage(records.get(selected));}
  }
  function loadChunk(key,path,attempt=0) {
    const script = document.createElement('script');
    script.src=path+(attempt?(path.includes('?')?'&':'?')+'retry='+attempt:'');
    script.onload=() => {
      if(key==='game'){gameRecords=window.CATALOG_GAME_DATA||[];window.CATALOG_GAME_DATA=null;gameRecords.forEach(indexRecord);}
      else {
        const payload=window.CATALOG_CG_DATA||{images:[],packs:[]};window.CATALOG_CG_DATA=null;
        const moved=payload.images.find(r=>r.id===params.get('asset') && r.kind==='title_background');
        if(moved){const url=new URL('backgrounds/',location.href);url.searchParams.set('kind','title');url.searchParams.set('asset',moved.id);if(state.work)url.searchParams.set('game',state.work);location.replace(url.href);return;}
        artworkRecords=payload.images.filter(r=>r.kind!=='title_background');artworkPacks=payload.packs;artworkRecords.forEach(indexRecord);
      }
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
