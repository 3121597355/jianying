import { renderResumePages, downloadResumePDF, downloadResumeImage, PAGE_HEIGHT_CSS } from './pdf.js';
import { downloadResumeWord } from './word.js';
import { track } from './analytics.js';

const FOCUSABLE = 'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/**
 * 导出面板：先看清整份简历，再选择 PDF、Word 或长图。
 * 预览与 PDF 使用同一套 A4 分页规则，所见即所得。
 */
export function setupExportPreview({ getFileName, toast } = {}) {
  const modal = document.querySelector('#exportModal');
  if (!modal) return { open() {}, close() {} };

  const pagesEl = modal.querySelector('#exportPages');
  const dialogEl = modal.querySelector('.export-dialog');
  // 底栏左侧常驻一句滚轮说明，不消失、也不占预览高度。
  const actionsEl = dialogEl?.querySelector('.export-actions');
  const hintEl = actionsEl?.querySelector('.export-hint');
  if (actionsEl) {
    const tipEl = document.createElement('p');
    tipEl.className = 'export-wheel-tip';
    const tipFull = document.createElement('span');
    tipFull.className = 'export-wheel-tip-full';
    tipFull.textContent = '滚轮：简历上缩放 · 空白处滚动';
    const tipShort = document.createElement('span');
    tipShort.className = 'export-wheel-tip-short';
    tipShort.textContent = '滚轮缩放 · 空白滚动';
    tipEl.append(tipFull, tipShort);
    if (hintEl) {
      const stack = document.createElement('div');
      stack.className = 'export-hint-stack';
      actionsEl.insertBefore(stack, hintEl);
      stack.append(hintEl, tipEl);
    } else {
      actionsEl.insertBefore(tipEl, actionsEl.firstChild);
    }
  }
  const metaEl = modal.querySelector('#exportMeta');
  const buttons = [...modal.querySelectorAll('[data-format]')];
  const closeButton = modal.querySelector('.export-close');
  const zoomValueButton = modal.querySelector('#exportZoomValue');
  const zoomOutButton = modal.querySelector('[data-zoom="out"]');
  const zoomInButton = modal.querySelector('[data-zoom="in"]');
  const fullscreenButton = modal.querySelector('[data-fullscreen]');
  let generated = false;
  let working = false;
  let runId = 0;
  let lastFocus = null;
  let lastPageCss = null;
  // 「整页」和「适应」各自独立缩放：整页的 100% = 一屏放下整页，适应的 100% = 适应宽度。
  const ZOOM_LADDER = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
  const MIN_ZOOM = ZOOM_LADDER[0], MAX_ZOOM = ZOOM_LADDER.at(-1);
  let zoomMode = 'page'; // 'page' 整页 | 'width' 适应宽度
  let pageZoom = 1;      // 整页尺寸的倍数
  let widthZoom = 1;     // 适应宽度的倍数
  let lastWidth = 0;
  let resizeTimer = 0;
  let pinch = null;

  const setMeta = text => { if (metaEl) metaEl.textContent = text; };
  const setBusy = busy => { working = busy; buttons.forEach(button => { button.disabled = busy; }); };

  const portrait = () => window.innerHeight >= window.innerWidth || window.innerWidth <= 720;

  /** 适应宽度下的页面宽度（px），自由缩放以它为基准。 */
  function fitWidth() {
    const styles = getComputedStyle(pagesEl);
    const padding = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    return Math.max(160, Math.min(620, pagesEl.clientWidth - padding));
  }

  /** 一屏放下整页时的页面宽度：只按可用高度算，弹窗宽度是跟着它走的。 */
  function pageBaseWidth() {
    const styles = getComputedStyle(pagesEl);
    const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    const image = pagesEl.querySelector('.export-page img');
    const aspect = image?.naturalWidth ? image.naturalHeight / image.naturalWidth : 1160 / 820;
    const captionEl = pagesEl.querySelector('.export-page figcaption');
    const caption = (captionEl?.offsetHeight || 20) + 12; // 页码说明 + 上下间距
    const availableH = Math.max(140, pagesEl.clientHeight - padY - caption);
    const cap = 920 - padX - 22; // 弹窗最宽 920，留出内边距和滚动条
    return Math.max(120, Math.min(availableH / aspect, cap));
  }

  const zoomFactor = () => (zoomMode === 'page' ? pageZoom : widthZoom);
  const setZoomFactor = value => { if (zoomMode === 'page') pageZoom = value; else widthZoom = value; };
  const zoomWidth = () => (zoomMode === 'page' ? pageBaseWidth() * pageZoom : fitWidth() * widthZoom);

  /**
   * 「整页」时弹窗跟着简历变成竖屏比例：A4 是纵向的，横着的宽弹窗只会把页面挤得很小。
   * 宽度 = 页面宽 + 左右内边距 + 滚动条余量，高度由 CSS 给到接近满屏。
   */
  function fitFrameToPage(pageWidth) {
    const styles = getComputedStyle(pagesEl);
    const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const wanted = Math.round(pageWidth + padX + 22); // 22 ≈ 滚动条余量 + 边框
    return Math.max(340, Math.min(920, wanted));
  }

  /** 缩放直接切换尺寸，不做过渡：预览是文档，动画反而显得拖沓。 */
  function applyZoom() {
    const pages = [...pagesEl.querySelectorAll('.export-page')];
    const pageFit = zoomMode === 'page' && !isFullscreen() && window.innerWidth > 720;
    modal.classList.toggle('is-page', pageFit);
    const setPageWidth = value => { for (const page of pages) page.style.width = `${value}px`; };
    let width = Math.round(zoomWidth());
    setPageWidth(width);
    if (dialogEl) dialogEl.style.width = pageFit ? `${fitFrameToPage(width)}px` : '';
    // 弹窗宽度刚变过（变竖屏或变回宽屏），可用尺寸跟着变了，重新量一次让它一次到位。
    const settled = Math.round(zoomWidth());
    if (Math.abs(settled - width) > 2) {
      width = settled;
      setPageWidth(width);
      if (pageFit && dialogEl) dialogEl.style.width = `${fitFrameToPage(width)}px`;
    }
    lastWidth = width;
    pagesEl.classList.toggle('can-pan', pagesEl.scrollHeight > pagesEl.clientHeight + 1 || pagesEl.scrollWidth > pagesEl.clientWidth + 1);
    const factor = zoomFactor();
    const label = Math.abs(factor - 1) < 1e-3
      ? (zoomMode === 'page' ? '整页' : '适应')
      : `${Math.round(factor * 100)}%`;
    if (zoomValueButton) {
      zoomValueButton.textContent = label;
      zoomValueButton.setAttribute('aria-label', `${label}（点击切换整页 / 适应宽度）`);
      zoomValueButton.title = '点击切换：整页看全貌 / 适应宽度看细节；滚轮或 Ctrl/⌘ + 滚轮可缩放';
    }
    if (zoomOutButton) zoomOutButton.disabled = zoomMode === 'page' ? pageZoom <= 1 + 1e-6 : widthZoom <= MIN_ZOOM + 1e-6;
    if (zoomInButton) zoomInButton.disabled = factor >= MAX_ZOOM - 1e-6;
  }

  /** 点「＋ / －」按档位缩放：整页、适应各用各自的基准，不会互相跳。 */
  function stepZoom(direction) {
    const current = zoomFactor();
    const next = direction > 0
      ? ZOOM_LADDER.find(value => value > current + 1e-3)
      : [...ZOOM_LADDER].reverse().find(value => value < current - 1e-3);
    if (!next) return;
    if (zoomMode === 'page' && next < 1 - 1e-3) return; // 整页已经是最小
    setZoomFactor(next);
    applyZoom();
  }

  /** 滚轮 / 双指缩放：直接按目标宽度连续缩放，并尽量保持当前滚动位置。 */
  function setFreeZoom(width) {
    if (!Number.isFinite(width) || width <= 0) return;
    const ratioY = pagesEl.scrollHeight ? pagesEl.scrollTop / pagesEl.scrollHeight : 0;
    const ratioX = pagesEl.scrollWidth ? pagesEl.scrollLeft / pagesEl.scrollWidth : 0;
    const base = zoomMode === 'page' ? pageBaseWidth() : fitWidth();
    const min = zoomMode === 'page' ? 1 : MIN_ZOOM; // 整页已经是最小，再缩没意义
    setZoomFactor(Math.min(MAX_ZOOM, Math.max(min, width / base)));
    // 滚轮 / 捏合是连续输入，直接跟手，不再补动画。
    applyZoom();
    pagesEl.scrollTop = ratioY * pagesEl.scrollHeight;
    pagesEl.scrollLeft = ratioX * pagesEl.scrollWidth;
  }

  function toggleZoomMode() {
    zoomMode = zoomMode === 'page' ? 'width' : 'page';
    // 切换模式一律回到该模式的自然尺寸：整页＝看全貌，适应＝贴满宽度，
    // 不把上一个模式的放大（或滚到一半的位置）带过来。
    if (zoomMode === 'page') pageZoom = 1;
    else widthZoom = 1;
    applyZoom();
    pagesEl.scrollTop = 0;
    pagesEl.scrollLeft = 0;
  }

  const isFullscreen = () => modal.classList.contains('is-fullscreen');

  const nativeFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);

  function setFullscreen(on) {
    modal.classList.toggle('is-fullscreen', on);
    fullscreenButton?.setAttribute('aria-pressed', String(on));
    fullscreenButton?.setAttribute('aria-label', on ? '退出全屏预览' : '全屏预览');
    fullscreenButton?.setAttribute('title', on ? '退出全屏预览' : '全屏预览');
    zoomMode = 'page';
    applyZoom();
    if (on) pagesEl.scrollTop = 0;
    closeButton?.focus({ preventScroll: true });
  }

  /** 真的让网页进全屏（浏览器 F11 那种）；不支持或被拒绝时退回弹窗铺满。 */
  async function toggleFullscreen() {
    if (nativeFullscreen()) { await document.exitFullscreen?.().catch(() => {}); return; }
    const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
    if (typeof request !== 'function') { setFullscreen(!isFullscreen()); return; }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      setFullscreen(!isFullscreen());
    }
  }

  const syncFullscreen = () => { if (!modal.hidden) setFullscreen(nativeFullscreen()); };
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
  /** 末页内容少于三成时提示取舍，避免用户导出后只剩一行字的第二页。 */
  const idleMeta = (count, lastPageCss) => {
    if (count > 1 && Number.isFinite(lastPageCss) && lastPageCss < PAGE_HEIGHT_CSS * 0.3) {
      const ratio = Math.max(1, Math.round((lastPageCss / PAGE_HEIGHT_CSS) * 100));
      const tip = ratio < 10 ? `第 ${count} 页几乎是空的，删掉一两条就能压到一页` : `第 ${count} 页只有约 ${ratio}% 内容，精简一下可以压到一页`;
      return `${count} 页 A4 · 与下载的文件一致 · ${tip}`;
    }
    return `${count} 页 A4 · 与下载的文件一致`;
  };

  function renderPages(pages) {
    pagesEl.replaceChildren(...pages.map((src, index) => {
      const figure = document.createElement('figure');
      figure.className = 'export-page';
      const image = document.createElement('img');
      image.src = src;
      image.alt = `第 ${index + 1} 页预览`;
      image.decoding = 'async';
      const caption = document.createElement('figcaption');
      caption.textContent = `第 ${index + 1} / ${pages.length} 页`;
      figure.append(image, caption);
      return figure;
    }));
  }

  async function generate() {
    if (working) return;
    const id = ++runId;
    setBusy(true);
    if (!generated) pagesEl.innerHTML = '<div class="export-loading"><span class="export-spinner" aria-hidden="true"></span><p>正在生成预览…</p></div>';
    setMeta('正在按 A4 分页生成预览…');
    try {
      const result = await renderResumePages({ scale: 2, onProgress: progress => { if (id === runId) setMeta(`正在生成预览… ${Math.round(progress * 100)}%`); } });
      if (id !== runId) return;
      if (!result) throw new Error('已有导出任务在进行，请稍候重试');
      renderPages(result.pages);
      generated = true;
      lastPageCss = result.lastPageCss;
      // 等一帧让页头和页脚排好版，再按真实可用高度算「整页」宽度。
      requestAnimationFrame(() => { if (id === runId) applyZoom(); });
      setMeta(idleMeta(result.count, lastPageCss));
    } catch (error) {
      if (id !== runId) return;
      pagesEl.innerHTML = `<div class="export-loading"><p>预览生成失败：${escapeHtml(error?.message || error)}</p><p class="export-note">仍可直接下载，或用浏览器打印检查排版。</p></div>`;
      setMeta('预览未生成');
    } finally {
      if (id === runId) setBusy(false);
    }
  }

  async function exportAs(format) {
    if (working) return;
    const name = getFileName?.() || '';
    setBusy(true);
    try {
      if (format === 'word') {
        setMeta('正在生成 Word…');
        const result = await downloadResumeWord({ name });
        toast?.(`已下载「${result.fileName}」· 可在 Word 里继续修改`);
      } else if (format === 'image') {
        setMeta('正在生成长图…');
        const result = await downloadResumeImage({ name, onProgress: progress => setMeta(progress < 0.8 ? '正在生成长图…' : '正在导出长图…') });
        if (result) toast?.(`已下载「${result.fileName}」`);
      } else {
        setMeta('正在排版 PDF…');
        const result = await downloadResumePDF({ name, onProgress: progress => setMeta(progress < 0.7 ? '正在排版…' : '正在写入 PDF…') });
        if (result) toast?.(`已下载「${result.fileName}」· ${result.pages} 页 A4`);
      }
      if (generated) setMeta(idleMeta(pagesEl.querySelectorAll('.export-page').length, lastPageCss));
    } catch (error) {
      track('resume_export_error');
      console.error(error);
      toast?.('导出失败：' + (error?.message || error));
      setMeta('导出失败，可直接重试');
    } finally {
      setBusy(false);
    }
  }

  function open() {
    if (!modal.hidden) return;
    lastFocus = document.activeElement;
    zoomMode = portrait() ? 'page' : 'width';
    pageZoom = 1;
    widthZoom = 1;
    modal.classList.remove('is-fullscreen');
    fullscreenButton?.setAttribute('aria-pressed', 'false');
    fullscreenButton?.setAttribute('aria-label', '全屏预览');
    fullscreenButton?.setAttribute('title', '全屏预览');
    modal.hidden = false;
    document.body.classList.add('export-open');
    closeButton?.focus({ preventScroll: true });
    void generate();
  }

  function close() {
    if (modal.hidden) return;
    runId++;
    modal.hidden = true;
    modal.classList.remove('is-fullscreen');
    pagesEl.classList.remove('is-zoomed');
    document.body.classList.remove('export-open');
    if (nativeFullscreen()) document.exitFullscreen?.().catch(() => {});
    lastFocus?.focus?.({ preventScroll: true });
    lastFocus = null;
  }

  modal.addEventListener('click', event => {
    const zoomButton = event.target.closest('[data-zoom]');
    if (zoomButton) {
      const action = zoomButton.dataset.zoom;
      if (action === 'in') stepZoom(1);
      else if (action === 'out') stepZoom(-1);
      else toggleZoomMode();
      return;
    }
    if (event.target.closest('[data-fullscreen]')) {
      void toggleFullscreen();
      return;
    }
    if (event.target.closest('[data-close]')) close();
  });

  window.addEventListener('resize', () => {
    if (modal.hidden) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => applyZoom(), 140);
  });

  // 弹窗尺寸变化（全屏切换、地址栏收放、键盘弹出）时重新适配整页。
  if (typeof ResizeObserver === 'function') {
    let observerTimer = 0;
    const observer = new ResizeObserver(() => {
      if (modal.hidden || zoomMode !== 'page') return;
      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => { if (!modal.hidden && zoomMode === 'page') applyZoom(); }, 80);
    });
    observer.observe(pagesEl);
  }

  // 滚轮：鼠标在简历上 = 缩放；在灰底（页面外的空白）= 滚动。
  // 缩放到极限时把滚轮交回滚动，保证放大后还能上下翻看。Ctrl / ⌘ + 滚轮任何时候都缩放。
  pagesEl.addEventListener('wheel', event => {
    if (modal.hidden) return;
    const zoomMod = event.ctrlKey || event.metaKey;
    if (!zoomMod) {
      const overPage = Boolean(event.target?.closest?.('.export-page'));
      if (!overPage) return; // 灰底：交给浏览器原生滚动
      // 跟手：一格滚轮（±100）约 ±16%，太猛的一次滚动限幅，避免一下冲到极限。
      const delta = Math.max(-150, Math.min(150, event.deltaY || 0));
      const ratio = Math.exp(-delta * 0.0015);
      const base = zoomMode === 'page' ? pageBaseWidth() : fitWidth();
      const min = zoomMode === 'page' ? 1 : MIN_ZOOM;
      const next = Math.min(MAX_ZOOM, Math.max(min, (zoomFactor() * ratio)));
      if (Math.abs(next - zoomFactor()) < 1e-3) return; // 已经到极限，滚轮让给滚动
      event.preventDefault();
      setFreeZoom(base * next);
      return;
    }
    event.preventDefault();
    const delta = Math.max(-150, Math.min(150, event.deltaY || 0));
    setFreeZoom((lastWidth || fitWidth()) * Math.exp(-delta * 0.0015));
  }, { passive: false });

  // 按住拖动平移：放大之后除了滚灰底，也能直接抓住简历拖。
  let pan = null;
  pagesEl.addEventListener('pointerdown', event => {
    if (modal.hidden || event.button !== 0 || event.pointerType !== 'mouse') return;
    if (!(pagesEl.scrollHeight > pagesEl.clientHeight + 1 || pagesEl.scrollWidth > pagesEl.clientWidth + 1)) return;
    pan = { x: event.clientX, y: event.clientY, left: pagesEl.scrollLeft, top: pagesEl.scrollTop };
    pagesEl.classList.add('is-panning');
    pagesEl.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  pagesEl.addEventListener('pointermove', event => {
    if (!pan) return;
    pagesEl.scrollLeft = pan.left - (event.clientX - pan.x);
    pagesEl.scrollTop = pan.top - (event.clientY - pan.y);
  });
  const endPan = event => {
    if (!pan) return;
    pan = null;
    pagesEl.classList.remove('is-panning');
    try { pagesEl.releasePointerCapture?.(event.pointerId); } catch { /* 指针已经释放 */ }
  };
  pagesEl.addEventListener('pointerup', endPan);
  pagesEl.addEventListener('pointercancel', endPan);

  // 手机双指捏合缩放。
  const pinchDistance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  pagesEl.addEventListener('touchstart', event => {
    if (event.touches.length !== 2) return;
    pinch = { start: pinchDistance(event.touches) || 1, width: lastWidth || fitWidth() };
  }, { passive: true });
  pagesEl.addEventListener('touchmove', event => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    setFreeZoom(pinch.width * (pinchDistance(event.touches) / pinch.start));
  }, { passive: false });
  pagesEl.addEventListener('touchend', event => { if (event.touches.length < 2) pinch = null; }, { passive: true });

  buttons.forEach(button => {
    button.addEventListener('click', () => void exportAs(button.dataset.format));
  });

  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (nativeFullscreen()) { document.exitFullscreen?.().catch(() => {}); return; }
      if (isFullscreen()) setFullscreen(false); else close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...modal.querySelectorAll(FOCUSABLE)].filter(item => item.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  return { open, close };
}
