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

  const canvas = document.getElementById('ambient-canvas');
  const toggle = document.getElementById('motion-toggle');
  const context = canvas?.getContext('2d');
  if (!canvas || !context || !toggle) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let stored = null;
  try { stored = localStorage.getItem(motionKey); } catch { /* Optional preference. */ }
  let motion = stored === null ? !reducedMotion.matches : stored === 'on';
  let frame = 0, width = 0, height = 0, petals = [], sparkles = [], lastSparkle = 0;
  let pointer = { x: -1000, y: -1000 };
  const desktopArchive = () => window.innerWidth >= 960 && document.body.classList.contains('archive-ready');

  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = width < 650 ? 13 : 24;
    petals = Array.from({length: count}, (_, i) => ({
      x: Math.random() * width, y: Math.random() * height, size: 2 + Math.random() * 4,
      speed: .15 + Math.random() * .28, phase: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI, tint: i % 3 === 0 ? '178, 157, 203' : '222, 170, 188',
    }));
  }
  function render(now) {
    frame = 0;
    if (!motion || document.hidden || desktopArchive()) return;
    context.clearRect(0, 0, width, height);
    if (pointer.x >= 0) {
      const glow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 130);
      glow.addColorStop(0, 'rgba(208, 167, 197, .13)'); glow.addColorStop(1, 'rgba(208, 167, 197, 0)');
      context.fillStyle = glow; context.fillRect(pointer.x - 130, pointer.y - 130, 260, 260);
    }
    for (const petal of petals) {
      petal.y += petal.speed; petal.x += Math.sin(now / 1800 + petal.phase) * .22;
      if (petal.y > height + 12) { petal.y = -12; petal.x = Math.random() * width; }
      if (petal.x > width + 12) petal.x = -12; if (petal.x < -12) petal.x = width + 12;
      context.save(); context.translate(petal.x, petal.y); context.rotate(petal.rotation + now / 6000);
      context.fillStyle = `rgba(${petal.tint}, .34)`; context.beginPath();
      context.ellipse(0, 0, petal.size * .56, petal.size, .35, 0, Math.PI * 2); context.fill(); context.restore();
    }
    sparkles = sparkles.filter(s => now - s.started < 900);
    for (const sparkle of sparkles) {
      const age = (now - sparkle.started) / 900, size = sparkle.size * (1 - age);
      context.save(); context.translate(sparkle.x, sparkle.y - age * 18); context.rotate(Math.PI / 4);
      context.fillStyle = `rgba(165, 132, 184, ${.5 * (1 - age)})`;
      context.fillRect(-size / 2, -size / 2, size, size); context.restore();
    }
    frame = requestAnimationFrame(render);
  }
  function start() { if (motion && !document.hidden && !frame && !desktopArchive()) frame = requestAnimationFrame(render); }
  function updateMotion() {
    toggle.setAttribute('aria-pressed', String(motion));
    toggle.setAttribute('aria-label', motion ? '关闭动态背景' : '开启动态背景');
    toggle.title = motion ? '关闭动态背景' : '开启动态背景';
    toggle.innerHTML = motion ? '<span aria-hidden="true">✦</span> 动态背景 <b>开</b>' : '<span aria-hidden="true">✦</span> 动态背景 <b>关</b>';
    document.body.classList.toggle('motion-off', !motion);
    if (!motion) { cancelAnimationFrame(frame); frame = 0; context.clearRect(0, 0, width, height); sparkles = []; }
    else start();
  }
  toggle.addEventListener('click', () => {
    motion = !motion;
    try { localStorage.setItem(motionKey, motion ? 'on' : 'off'); } catch { /* Works for this page. */ }
    updateMotion();
  });
  window.addEventListener('resize', () => { resize(); start(); }, { passive: true });
  window.addEventListener('pointermove', event => {
    if (!motion || desktopArchive() || event.pointerType !== 'mouse') return;
    pointer = { x: event.clientX, y: event.clientY };
    const now = performance.now();
    if (now - lastSparkle > 95) { sparkles.push({ x: pointer.x, y: pointer.y, started: now, size: 3 + Math.random() * 3 }); lastSparkle = now; }
    if (sparkles.length > 18) sparkles.shift();
  }, { passive: true });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) pointer = { x: -1000, y: -1000 }; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else start(); });
  document.querySelectorAll('[data-parallax]').forEach(surface => {
    if (surface.id === 'desktop-archive') return;
    surface.addEventListener('pointermove', event => {
      if (!motion || event.pointerType !== 'mouse') return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty('--shift-x', (((event.clientX - rect.left) / rect.width - .5) * -12).toFixed(1) + 'px');
      surface.style.setProperty('--shift-y', (((event.clientY - rect.top) / rect.height - .5) * -10).toFixed(1) + 'px');
      surface.classList.add('is-tracking');
    }, { passive: true });
    surface.addEventListener('pointerleave', () => surface.classList.remove('is-tracking'));
  });
  resize(); updateMotion();
})();
