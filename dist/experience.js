/* Small browser-local interactions shared by both galleries. */
(() => {
  'use strict';
  const favoriteKey = 'otome-gallery-favorites-v1';
  const motionKey = 'otome-gallery-motion-v1';
  const callbacks = new Set();
  let favorites = readFavorites();

  function readFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
      return new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string' && id.length < 120) : []);
    } catch { return new Set(); }
  }
  function updateButtons() {
    document.querySelectorAll('[data-favorite-id]').forEach(button => {
      const active = favorites.has(button.dataset.favoriteId);
      const label = button.dataset.favoriteLabel || '这张图片';
      button.classList.toggle('is-favorite', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', (active ? '取消收藏 ' : '收藏 ') + label);
      button.title = active ? '取消收藏' : '收藏图片';
      button.textContent = button.classList.contains('favorite-text') ? (active ? '♥ 已收藏' : '♡ 收藏') : (active ? '♥' : '♡');
    });
  }
  function notify(persisted = true) { updateButtons(); callbacks.forEach(callback => callback(persisted)); }
  window.GalleryFavorites = {
    has: id => favorites.has(id),
    count: records => favorites.size ? records.reduce((sum, record) => sum + Number(favorites.has(record.id)), 0) : 0,
    make(id, label, text = false) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = text ? 'favorite-button favorite-text' : 'favorite-button';
      button.dataset.favoriteId = id; button.dataset.favoriteLabel = label;
      button.addEventListener('click', () => {
        favorites.has(id) ? favorites.delete(id) : favorites.add(id);
        let persisted = true;
        try { localStorage.setItem(favoriteKey, JSON.stringify([...favorites])); } catch { persisted = false; }
        notify(persisted);
      });
      const active = favorites.has(id);
      button.classList.toggle('is-favorite', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', (active ? '取消收藏 ' : '收藏 ') + label);
      button.title = active ? '取消收藏' : '收藏图片';
      button.textContent = text ? (active ? '♥ 已收藏' : '♡ 收藏') : (active ? '♥' : '♡');
      return button;
    },
    refresh: updateButtons,
    subscribe(callback) { callbacks.add(callback); },
  };
  window.addEventListener('storage', event => {
    if (event.key === favoriteKey || event.key === null) { favorites = readFavorites(); notify(); }
  });

  const toggle = document.getElementById('motion-toggle');
  if (!toggle) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let stored = null;
  try { stored = localStorage.getItem(motionKey); } catch { /* Optional preference. */ }
  let motion = stored === null ? !reducedMotion.matches : stored === 'on';
  function updateMotion() {
    toggle.setAttribute('aria-pressed', String(motion));
    toggle.setAttribute('aria-label', motion ? '关闭动态背景' : '开启动态背景');
    toggle.title = motion ? '关闭动态背景' : '开启动态背景';
    toggle.innerHTML = motion ? '<span aria-hidden="true">✦</span> 动态背景 <b>开</b>' : '<span aria-hidden="true">✦</span> 动态背景 <b>关</b>';
    document.body.classList.toggle('motion-off', !motion);

  }
  toggle.addEventListener('click', () => {
    motion = !motion;
    try { localStorage.setItem(motionKey, motion ? 'on' : 'off'); } catch { /* Works for this page. */ }
    updateMotion();
  });
  reducedMotion.addEventListener('change',()=>{
    try { if(localStorage.getItem(motionKey)!==null)return; } catch (_) {}
    motion=!reducedMotion.matches;updateMotion();
  });
  updateMotion();
})();
