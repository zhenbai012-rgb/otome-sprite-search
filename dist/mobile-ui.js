/* Touch controls shared by both collections; desktop layout uses display: contents. */
(() => {
  'use strict';
  const mobile = window.matchMedia('(max-width: 959px)');
  const form = document.querySelector('form[role="search"]');
  if (form) {
    const options = document.createElement('div');
    options.className = 'filter-options'; options.id = 'filter-options';
    [...form.children].filter(el => !el.classList.contains('search')).forEach(el => options.append(el));
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'mobile-filter-toggle';
    button.setAttribute('aria-controls', options.id); button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg><span>筛选</span>';
    form.dataset.expanded = 'false'; form.append(button, options);
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded)); form.dataset.expanded = String(expanded);
    });
    function updateCount() {
      const count = [...options.querySelectorAll('select')].filter(el => !el.closest('[hidden]') && el.value && !(el.id === 'kind' && el.value === 'background')).length;
      button.querySelector('span').textContent = count ? `筛选 ${count}` : '筛选';
      button.setAttribute('aria-label', count ? `筛选，已选 ${count} 项` : '筛选');
    }
    // Quick filters and URL restoration also change selections outside this form.
    const result = document.getElementById('result-count') || document.getElementById('result');
    if (result) new MutationObserver(updateCount).observe(result, {childList: true, characterData: true, subtree: true});
    form.addEventListener('change', updateCount); updateCount();
  }
  const dialog = document.getElementById('image-dialog');
  const surface = dialog?.querySelector('.dialog-image');
  if (surface) {
    let touch = null;
    surface.addEventListener('pointerdown', event => {
      if (!mobile.matches || event.pointerType === 'mouse') return;
      touch = {id: event.pointerId, x: event.clientX, y: event.clientY};
    }, {passive: true});
    surface.addEventListener('pointerup', event => {
      if (!touch || touch.id !== event.pointerId) return;
      const dx = event.clientX - touch.x, dy = event.clientY - touch.y; touch = null;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) document.getElementById(dx < 0 ? 'dialog-next' : 'dialog-prev')?.click();
    }, {passive: true});
    surface.addEventListener('pointercancel', () => { touch = null; }, {passive: true});
  }
})();
