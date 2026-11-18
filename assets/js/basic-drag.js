import { moveBasicKey } from './basic-fields.js';

/**
 * 基本信息字段排序：按住左侧圆点拖动，或聚焦圆点后按 ↑ ↓。
 * 列表本身保持挂载，只有成功放下时才写回 setData.basicOrder。
 */
export function bindBasicFieldDrag(list, onDrop) {
  if (!list) return;
  let gesture = null, frame = 0;
  const rows = () => [...list.querySelectorAll(':scope > [data-basic-key]')];
  const order = () => rows().map(row => row.dataset.basicKey);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 拖动时把「更多信息」展开，否则被折叠的字段无法参与排序。
  const expand = () => {
    if (!list.classList.contains('hide_more')) return;
    list.classList.remove('hide_more');
    const toggle = document.querySelector('#formHost [data-act="toggleMore"]');
    if (toggle) toggle.innerHTML = '收起更多信息 <i class="webfont webicon-jiantouup"></i>';
  };

  const targetIndex = (x, y) => {
    const listRect = list.getBoundingClientRect();
    const scale = listRect.width / (list.offsetWidth || listRect.width || 1);
    let best = -1, distance = Infinity;
    rows().forEach((row, index) => {
      const left = listRect.left + (list.clientLeft + row.offsetLeft) * scale;
      const top = listRect.top + (list.clientTop + row.offsetTop - list.scrollTop) * scale;
      const width = row.offsetWidth * scale, height = row.offsetHeight * scale;
      const d = Math.hypot(x - left - width / 2, y - top - height / 2);
      if (d < distance) { distance = d; best = index; }
    });
    return best;
  };

  const mark = index => {
    rows().forEach((row, i) => row.classList.toggle('is-basic-drop', i === index));
  };

  const finish = (cancel = false) => {
    const g = gesture;
    if (!g) return;
    cancelAnimationFrame(frame); frame = 0;
    g.ghost?.remove();
    list.classList.remove('is-basic-sorting');
    rows().forEach(row => row.classList.remove('is-basic-drop', 'is-basic-source'));
    if (list.hasPointerCapture(g.id)) list.releasePointerCapture(g.id);
    gesture = null;
    if (cancel || !g.active) return;
    const index = targetIndex(g.x, g.y);
    if (index < 0) return;
    const current = order();
    if (current[index] === g.key) return;
    const next = moveBasicKey(current, g.key, index);
    if (next.join() !== current.join()) onDrop(g.key, next);
  };

  const tick = () => {
    const g = gesture;
    if (!g?.active) return;
    g.ghost.style.transform = `translate3d(${g.x - g.startX}px,${g.y - g.startY}px,0)`;
    mark(targetIndex(g.x, g.y));
    frame = requestAnimationFrame(tick);
  };

  list.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || gesture) return;
    const grip = event.target.closest('[data-basic-grip]');
    if (!grip) return;
    const row = grip.closest('[data-basic-key]');
    if (!row || row.parentElement !== list) return;
    gesture = {
      row, key: row.dataset.basicKey, id: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false
    };
  });

  window.addEventListener('pointermove', event => {
    const g = gesture;
    if (!g || event.pointerId !== g.id) return;
    g.x = event.clientX; g.y = event.clientY;
    if (!g.active && Math.hypot(g.x - g.startX, g.y - g.startY) < 6) return;
    if (!g.active) {
      g.active = true;
      expand();
      const rect = g.row.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'basic-drag-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = g.row.querySelector('b')?.textContent?.trim() || g.key;
      Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
      document.body.appendChild(ghost);
      g.ghost = ghost;
      g.row.classList.add('is-basic-source');
      list.classList.add('is-basic-sorting');
      list.setPointerCapture(g.id);
      if (!reduceMotion()) frame = requestAnimationFrame(tick);
    }
    event.preventDefault();
    if (reduceMotion()) mark(targetIndex(g.x, g.y));
  }, { passive: false });

  window.addEventListener('pointerup', event => {
    if (event.pointerId !== gesture?.id) return;
    gesture.x = event.clientX; gesture.y = event.clientY;
    finish();
  });
  window.addEventListener('pointercancel', event => { if (event.pointerId === gesture?.id) finish(true); });
  list.addEventListener('lostpointercapture', event => { if (event.target === list && event.pointerId === gesture?.id) finish(true); });
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); finish(true); }
  }, true);

  list.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const grip = event.target.closest('[data-basic-grip]');
    if (!grip) return;
    const row = grip.closest('[data-basic-key]');
    const current = order(), index = current.indexOf(row?.dataset.basicKey);
    if (index < 0) return;
    event.preventDefault();
    expand();
    const next = moveBasicKey(current, row.dataset.basicKey, event.key === 'ArrowUp' ? index - 1 : index + 1);
    if (next.join() === current.join()) return;
    onDrop(row.dataset.basicKey, next);
  });
}
