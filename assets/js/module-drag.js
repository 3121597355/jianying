import { moveModuleToIndex } from './module-order.js?v=20261112-drag';

/** Pointer sorting keeps the form mounted; only a successful drop saves the order. */
export function bindModuleDrag(list, onDrop) {
  if (!list) return;
  let gesture = null, frame = 0, suppressUntil = 0;
  let viewportWidth = window.innerWidth;
  const animations = new Map();
  const cards = () => [...list.querySelectorAll(':scope > [data-tab]')];
  const order = () => cards().map(card => card.dataset.tab);
  const reduceMotion = () => document.documentElement.dataset.motion === 'reduce'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layoutRect = card => {
    const base = list.getBoundingClientRect(), scale = base.width / list.offsetWidth;
    return { left: base.left + (list.clientLeft + card.offsetLeft - list.scrollLeft) * scale,
      top: base.top + (list.clientTop + card.offsetTop - list.scrollTop) * scale,
      width: card.offsetWidth * scale, height: card.offsetHeight * scale };
  };
  const reorder = next => {
    const elements = cards(), before = new Map(elements.map(card => [card, card.getBoundingClientRect()]));
    animations.forEach(animation => animation.cancel()); animations.clear();
    const nodes = new Map(elements.map(card => [card.dataset.tab, card]));
    next.forEach(name => list.appendChild(nodes.get(name)));
    if (reduceMotion()) return;
    for (const card of elements) {
      if (card === gesture?.card) continue;
      const old = before.get(card), rect = card.getBoundingClientRect();
      const scale = rect.width / card.offsetWidth;
      const dx = (old.left - rect.left) / scale, dy = (old.top - rect.top) / scale;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      const animation = card.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
        { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
      animations.set(card, animation);
      animation.onfinish = () => { if (animations.get(card) === animation) animations.delete(card); };
    }
  };
  const insideList = (x, y) => {
    const rect = list.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= Math.max(0, rect.top)
      && y <= Math.min(window.innerHeight, rect.bottom);
  };
  const update = () => {
    const g = gesture;
    if (!g?.active) return;
    g.ghost.style.transform = `translate3d(${g.x - g.startX}px,${g.y - g.startY}px,0)`;
    if (!insideList(g.x, g.y)) return;
    const elements = cards();
    let nearest = -1, distance = Infinity;
    elements.forEach((card, index) => {
      const r = layoutRect(card);
      const d = Math.hypot(g.x - r.left - r.width / 2, g.y - r.top - r.height / 2);
      if (d < distance) { distance = d; nearest = index; }
    });
    const current = order();
    if (nearest >= 0 && current[nearest] !== g.name) reorder(moveModuleToIndex(current, g.name, nearest));
  };
  const tick = time => {
    const g = gesture;
    if (!g?.active) return;
    const dt = Math.min(32, time - (g.lastTime || time)); g.lastTime = time;
    const rect = list.getBoundingClientRect();
    if (g.x >= rect.left && g.x <= rect.right) {
      const internal = list.scrollHeight > list.clientHeight + 1;
      const toolbar = document.querySelector('.mobile-module-bar')?.getBoundingClientRect();
      const top = internal ? Math.max(0, rect.top) : Math.max(0, toolbar?.bottom || 0);
      const bottom = internal ? Math.min(window.innerHeight, rect.bottom) : window.innerHeight;
      const edge = 44;
      const speed = g.y < top + edge ? -Math.min(1, (top + edge - g.y) / edge)
        : g.y > bottom - edge ? Math.min(1, (g.y - bottom + edge) / edge) : 0;
      if (speed && g.y >= top - edge && g.y <= bottom + edge) {
        if (internal) list.scrollTop += speed * dt * .55;
        else window.scrollBy({ top: speed * dt * .55, behavior: 'instant' });
      }
    }
    update(); frame = requestAnimationFrame(tick);
  };
  const finish = (cancel = false) => {
    const g = gesture;
    if (!g) return;
    cancelAnimationFrame(frame); frame = 0;
    const next = order(), valid = g.active && !cancel && insideList(g.x, g.y);
    if (g.active) {
      suppressUntil = performance.now() + 350;
      if (!valid) reorder(g.original);
      animations.forEach(animation => animation.cancel()); animations.clear();
      g.card.classList.remove('module-drag-source');
      g.ghost.remove(); document.documentElement.classList.remove('module-dragging');
    }
    gesture = null;
    if (list.hasPointerCapture(g.id)) list.releasePointerCapture(g.id);
    if (valid && next.some((name, index) => name !== g.original[index])) onDrop(g.name, next);
  };
  list.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || gesture) return;
    const card = event.target.closest('[data-tab]');
    if (!card || card.parentElement !== list) return;
    if (event.target.closest('[data-prev],[data-next],[data-edit],[data-switch],input')) return;
    // Touch scrolling remains native everywhere except the explicit grip.
    if (event.pointerType !== 'mouse' && !event.target.closest('[data-drag]')) return;
    gesture = { card, name: card.dataset.tab, id: event.pointerId, original: order(),
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
  });
  window.addEventListener('pointermove', event => {
    const g = gesture;
    if (!g || event.pointerId !== g.id) return;
    g.x = event.clientX; g.y = event.clientY;
    if (!g.active && Math.hypot(g.x - g.startX, g.y - g.startY) < 6) return;
    if (!g.active) {
      g.active = true;
      const rect = g.card.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'module-drag-ghost'; ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = g.card.querySelector('b').textContent;
      Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      document.body.appendChild(ghost); g.ghost = ghost;
      g.card.classList.add('module-drag-source'); document.documentElement.classList.add('module-dragging');
      list.setPointerCapture(g.id); frame = requestAnimationFrame(tick);
    }
    event.preventDefault(); update();
  }, { passive: false });
  window.addEventListener('pointerup', event => {
    if (event.pointerId !== gesture?.id) return;
    gesture.x = event.clientX; gesture.y = event.clientY; update(); finish();
  });
  window.addEventListener('pointercancel', event => { if (event.pointerId === gesture?.id) finish(true); });
  // Touch starts with implicit capture on the grip. Its loss bubbles when
  // capture moves here; only losing this list's own capture is cancellation.
  list.addEventListener('lostpointercapture', event => {
    if (event.target === list && event.pointerId === gesture?.id) finish(true);
  });
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('pagehide', () => finish(true));
  window.addEventListener('resize', () => {
    // Mobile address bars change the height while scrolling the drag area.
    // Only a width change invalidates the card grid and cancels the gesture.
    const width = window.innerWidth;
    if (width !== viewportWidth) finish(true);
    viewportWidth = width;
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') finish(true); });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopPropagation(); finish(true); }
  }, true);
  list.addEventListener('click', event => {
    if (performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
}
