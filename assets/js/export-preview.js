import { renderResumePages, downloadResumePDF, downloadResumeImage, downloadResumeText, PAGE_HEIGHT_CSS } from './pdf.js';
import { track } from './analytics.js';

const FOCUSABLE = 'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/**
 * 导出面板：先看清整份简历，再选择 PDF、长图或纯文本。
 * 预览与 PDF 使用同一套 A4 分页规则，所见即所得。
 */
export function setupExportPreview({ getFileName, toast } = {}) {
  const modal = document.querySelector('#exportModal');
  if (!modal) return { open() {}, close() {} };

  const pagesEl = modal.querySelector('#exportPages');
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
  // 1 = 适应宽度；其它值按适应宽度的倍数放大缩小。
  const ZOOM_STEPS = [0.75, 0.9, 1, 1.25, 1.5, 1.75, 2];
  let zoomIndex = ZOOM_STEPS.indexOf(1);
  let resizeTimer = 0;

  const setMeta = text => { if (metaEl) metaEl.textContent = text; };
  const setBusy = busy => { working = busy; buttons.forEach(button => { button.disabled = busy; }); };

  /** 适应宽度下的页面宽度（px），放大缩小时以它为基准。 */
  function fitWidth() {
    const styles = getComputedStyle(pagesEl);
    const padding = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    return Math.max(160, Math.min(620, pagesEl.clientWidth - padding));
  }

  function applyZoom() {
    const pages = [...pagesEl.querySelectorAll('.export-page')];
    const zoom = ZOOM_STEPS[zoomIndex];
    const fitted = zoom === 1;
    const width = fitted ? 0 : Math.round(fitWidth() * zoom);
    for (const page of pages) page.style.width = fitted ? '' : `${width}px`;
    pagesEl.classList.toggle('is-zoomed', !fitted);
    if (zoomValueButton) {
      zoomValueButton.textContent = fitted ? '适应' : `${Math.round(zoom * 100)}%`;
      zoomValueButton.setAttribute('aria-label', fitted ? '适应宽度（当前）' : `当前 ${Math.round(zoom * 100)}%，点击恢复适应宽度`);
    }
    if (zoomOutButton) zoomOutButton.disabled = zoomIndex === 0;
    if (zoomInButton) zoomInButton.disabled = zoomIndex === ZOOM_STEPS.length - 1;
  }

  function setZoom(nextIndex) {
    zoomIndex = Math.min(ZOOM_STEPS.length - 1, Math.max(0, nextIndex));
    applyZoom();
  }

  const isFullscreen = () => modal.classList.contains('is-fullscreen');

  function setFullscreen(on) {
    modal.classList.toggle('is-fullscreen', on);
    fullscreenButton?.setAttribute('aria-pressed', String(on));
    fullscreenButton?.setAttribute('aria-label', on ? '退出全屏预览' : '全屏预览');
    fullscreenButton?.setAttribute('title', on ? '退出全屏预览' : '全屏预览');
    applyZoom();
    if (on) pagesEl.scrollTop = 0;
    closeButton?.focus({ preventScroll: true });
  }
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
      applyZoom();
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
      if (format === 'text') {
        const result = downloadResumeText({ name });
        toast?.(`已下载「${result.fileName}」`);
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
    zoomIndex = ZOOM_STEPS.indexOf(1);
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
    lastFocus?.focus?.({ preventScroll: true });
    lastFocus = null;
  }

  modal.addEventListener('click', event => {
    const zoomButton = event.target.closest('[data-zoom]');
    if (zoomButton) {
      const action = zoomButton.dataset.zoom;
      setZoom(action === 'in' ? zoomIndex + 1 : action === 'out' ? zoomIndex - 1 : ZOOM_STEPS.indexOf(1));
      return;
    }
    if (event.target.closest('[data-fullscreen]')) {
      setFullscreen(!isFullscreen());
      return;
    }
    if (event.target.closest('[data-close]')) close();
  });

  window.addEventListener('resize', () => {
    if (modal.hidden) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (pagesEl.classList.contains('is-zoomed') || isFullscreen()) applyZoom(); }, 140);
  });

  buttons.forEach(button => {
    button.addEventListener('click', () => void exportAs(button.dataset.format));
  });

  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); if (isFullscreen()) setFullscreen(false); else close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...modal.querySelectorAll(FOCUSABLE)].filter(item => item.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  return { open, close };
}
