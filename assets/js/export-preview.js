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
  let generated = false;
  let working = false;
  let runId = 0;
  let lastFocus = null;
  let lastPageCss = null;

  const setMeta = text => { if (metaEl) metaEl.textContent = text; };
  const setBusy = busy => { working = busy; buttons.forEach(button => { button.disabled = busy; }); };
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
    modal.hidden = false;
    document.body.classList.add('export-open');
    closeButton?.focus({ preventScroll: true });
    void generate();
  }

  function close() {
    if (modal.hidden) return;
    runId++;
    modal.hidden = true;
    document.body.classList.remove('export-open');
    lastFocus?.focus?.({ preventScroll: true });
    lastFocus = null;
  }

  modal.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) close();
  });

  buttons.forEach(button => {
    button.addEventListener('click', () => void exportAs(button.dataset.format));
  });

  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...modal.querySelectorAll(FOCUSABLE)].filter(item => item.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  return { open, close };
}
