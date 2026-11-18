import { moveBasicKey } from './basic-fields.js';

/**
 * 基本信息排序：按住左侧圆点拖动，或聚焦圆点后按 ↑ ↓。
 * 与模块卡片共用同一套手感：拖动中实时换位、其它行做位移动画、靠近边缘自动滚动。
 * 表单始终挂载，只有放开时才把顺序写回去，输入内容不会丢。
 */
export function bindBasicFieldDrag(list, onDrop) {
  if (!list) return;
  let gesture = null, frame = 0, suppressUntil = 0;
  const animations = new Map();
  const rows = () => [...list.querySelectorAll(':scope > [data-basic-key]')];
  const order = () => rows().map(row => row.dataset.basicKey);
  const reduceMotion = () => document.documentElement.dataset.motion === 'reduce'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const layoutRect = row => {
    const base = list.getBoundingClientRect(), scale = base.width / (list.offsetWidth || base.width || 1);
    return {
      left: base.left + (list.clientLeft + row.offsetLeft - list.scrollLeft) * scale,
      top: base.top + (list.clientTop + row.offsetTop - list.scrollTop) * scale,
      width: row.offsetWidth * scale, height: row.offsetHeight * scale
    };
  };

  // 拖动时把「更多信息」展开，否则被折叠的字段无法参与排序。
  const expand = () => {
    if (!list.classList.contains('hide_more')) return;
    list.classList.remove('hide_more');
    const toggle = document.querySelector('#formHost [data-act="toggleMore"]');
    if (toggle) toggle.innerHTML = '收起更多信息 <i class="webfont webicon-jiantouup"></i>';
  };

  const scroller = () => {
    let node = list.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
      node = node.parentElement;
    }
    return null;
  };

  // FLIP：先记录旧位置，改 DOM 顺序后用 transform 补齐位移再动画回 0。
  const reorder = next => {
    const elements = rows(), before = new Map(elements.map(row => [row, row.getBoundingClientRect()]));
    animations.forEach(animation => animation.cancel()); animations.clear();
    const nodes = new Map(elements.map(row => [row.dataset.basicKey, row]));
    next.forEach(key => { const node = nodes.get(key); if (node) list.appendChild(node); });
    if (reduceMotion()) return;
    for (const row of elements) {
      if (row === gesture?.row) continue;
      const old = before.get(row), rect = row.getBoundingClientRect();
      const dx = old.left - rect.left, dy = old.top - rect.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      const animation = row.animate(
        [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
        { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
      animations.set(row, animation);
      animation.onfinish = () => { if (animations.get(row) === animation) animations.delete(row); };
    }
  };

  const nearestIndex = (x, y) => {
    let best = -1, distance = Infinity;
    rows().forEach((row, index) => {
      const r = layoutRect(row);
      const d = Math.hypot(x - r.left - r.width / 2, y - r.top - r.height / 2);
      if (d < distance) { distance = d; best = index; }
    });
    return best;
  };

  const update = () => {
    const g = gesture;
    if (!g?.active) return;
    g.ghost.style.transform = `translate3d(${g.x - g.startX}px,${g.y - g.startY}px,0)`;
    const index = nearestIndex(g.x, g.y);
    if (index < 0) return;
    const current = order();
    if (current[index] === g.key) return;
    const next = moveBasicKey(current, g.key, index);
    if (next.join() !== current.join()) reorder(next);
  };

  const tick = time => {
    const g = gesture;
    if (!g?.active) return;
    const dt = Math.min(32, time - (g.lastTime || time)); g.lastTime = time;
    const box = scroller();
    if (box) {
      const rect = box.getBoundingClientRect(), edge = 46;
      const speed = g.y < rect.top + edge ? -Math.min(1, (rect.top + edge - g.y) / edge)
        : g.y > rect.bottom - edge ? Math.min(1, (g.y - rect.bottom + edge) / edge) : 0;
      if (speed) box.scrollTop += speed * dt * .55;
    }
    update(); frame = requestAnimationFrame(tick);
  };

  const finish = (cancel = false) => {
    const g = gesture;
    if (!g) return;
    cancelAnimationFrame(frame); frame = 0;
    const next = order();
    const moved = g.active && !cancel && next.some((key, index) => key !== g.original[index]);
    if (g.active) {
      suppressUntil = performance.now() + 350;
      if (cancel) reorder(g.original);
      animations.forEach(animation => animation.cancel()); animations.clear();
      g.row.classList.remove('is-basic-source');
      g.ghost.remove();
      document.documentElement.classList.remove('basic-dragging');
    }
    gesture = null;
    if (list.hasPointerCapture(g.id)) list.releasePointerCapture(g.id);
    if (moved) onDrop(g.key, cancel ? g.original : next);
  };

  list.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || gesture) return;
    const grip = event.target.closest('[data-basic-grip]');
    if (!grip) return;
    const row = grip.closest('[data-basic-key]');
    if (!row || row.parentElement !== list) return;
    gesture = {
      row, key: row.dataset.basicKey, id: event.pointerId, original: order(),
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false
    };
  });

  window.addEventListener('pointermove', event => {
    const g = gesture;
    if (!g || event.pointerId !== g.id) return;
    g.x = event.clientX; g.y = event.clientY;
    if (!g.active && Math.hypot(g.x - g.startX, g.y - g.startY) < 5) return;
    if (!g.active) {
      g.active = true;
      expand();
      const rect = g.row.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'basic-drag-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = g.row.querySelector('b')?.textContent?.trim() || g.key;
      Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      document.body.appendChild(ghost);
      g.ghost = ghost;
      g.row.classList.add('is-basic-source');
      document.documentElement.classList.add('basic-dragging');
      try { list.setPointerCapture(g.id); } catch {}
      frame = requestAnimationFrame(tick);
    }
    event.preventDefault();
    update();
  }, { passive: false });

  window.addEventListener('pointerup', event => {
    if (event.pointerId !== gesture?.id) return;
    gesture.x = event.clientX; gesture.y = event.clientY;
    update(); finish();
  });
  window.addEventListener('pointercancel', event => { if (event.pointerId === gesture?.id) finish(true); });
  list.addEventListener('lostpointercapture', event => { if (event.target === list && event.pointerId === gesture?.id) finish(true); });
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('pagehide', () => finish(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') finish(true); });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopPropagation(); finish(true); }
  }, true);

  // 键盘排序：聚焦手柄后按 ↑ ↓，直接换到相邻位置。
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

  // 拖动结束后浏览器仍会补一次 click，吞掉它避免误触发。
  list.addEventListener('click', event => {
    if (performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
}
