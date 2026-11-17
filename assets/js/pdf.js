/**
 * 简历 → PDF / 长图 / 纯文本。
 * PDF 与长图依赖 vendor/html2canvas（DOM 栅格化），PDF 另需 vendor/jspdf。
 */

import { loadVendor } from './vendor-loader.js';
import {track} from './analytics.js';
import {safeProjectUrl} from './project-fields.js';

const PAGE_W_PT = 595.28;   // A4 宽（pt）
const PAGE_H_PT = 841.89;   // A4 高（pt）
const PAGE_H_PX = 1160;     // 每页内容高度（px），与预览分页一致
const BASE_W_PX = 820;      // 简历宽度（px）

/** 单页内容高度（CSS px），导出预览用它判断最后一页是否几乎空白。 */
export const PAGE_HEIGHT_CSS = PAGE_H_PX;

let busy = false;

export function isBusy() { return busy; }

const loadRasterizer = () => loadVendor('/assets/vendor/html2canvas.min.js', () => Boolean(window.html2canvas));
const loadPdfWriter = () => loadVendor('/assets/vendor/jspdf.umd.min.js', () => Boolean(window.jspdf?.jsPDF));

/** 离屏克隆：脱离 .tpl_box 的高度裁剪与分页虚线，保证整份内容完整渲染。 */
function prepareClone(source) {
  const clone = source.cloneNode(true);
  clone.querySelectorAll('.pagebreak-tag').forEach(n => n.remove());
  const sourcePhotos = [...source.querySelectorAll('[data-photo-slot]')];
  clone.querySelectorAll('[data-photo-slot]').forEach((n, index) => {
    n.removeAttribute('title');
    n.classList.remove('is-default');
    // 离屏克隆不在 #resumeHost 内；保留预览的照片尺寸与裁剪规则。
    const original = sourcePhotos[index];
    if (!original) return;
    const computed = getComputedStyle(original);
    for (const key of ['width', 'height', 'borderRadius', 'display', 'alignItems', 'justifyContent', 'overflow']) n.style[key] = computed[key];
    const image = n.querySelector('img');
    const originalImage = original.querySelector('img');
    if (image && originalImage?.naturalWidth && originalImage?.naturalHeight) {
      const width = parseFloat(computed.width), height = parseFloat(computed.height);
      const ratio = Math.max(width / originalImage.naturalWidth, height / originalImage.naturalHeight);
      const imageWidth = originalImage.naturalWidth * ratio, imageHeight = originalImage.naturalHeight * ratio;
      // html2canvas 不支持 object-fit：用实际等比尺寸及居中裁剪替代。
      Object.assign(image.style, { width: `${imageWidth}px`, height: `${imageHeight}px`, maxWidth: 'none', position: 'absolute', left: `${(width - imageWidth) / 2}px`, top: `${(height - imageHeight) / 2}px`, margin: '0', transform: 'none', display: 'block' });
    }
    // 先把居中位移换算为固定 top，避免栅格化时重复应用百分比位移。
    if (computed.transform !== 'none' && computed.top !== 'auto') {
      const transform = new DOMMatrix(computed.transform);
      if (transform.a === 1 && transform.b === 0 && transform.c === 0 && transform.d === 1 && transform.e === 0) {
        n.style.top = `${parseFloat(computed.top) + transform.f}px`;
        n.style.transform = 'none';
      }
    }
  });
  return clone;
}

async function rasterize({ scale = 3, onProgress = () => {} } = {}) {
  const source = document.querySelector('#resumeHost .resume_all');
  if (!source) throw new Error('未找到简历内容');
  const clone = prepareClone(source);

  const stage = document.createElement('div');
  stage.setAttribute('data-resume-export','');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = [
    'position:fixed', 'left:-10000px', 'top:0', 'width:820px',
    'background:#ffffff', 'color:#333333', 'color-scheme:light', 'z-index:-1', 'pointer-events:none',
  ].join(';');
  stage.appendChild(clone);
  document.body.appendChild(stage);

  try {
    const canvas = await window.html2canvas(clone, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: BASE_W_PX,
      height: Math.max(clone.scrollHeight, PAGE_H_PX),
      windowWidth: BASE_W_PX,
      scrollX: 0,
      scrollY: 0,
    });
    onProgress(0.75);
    // Raster images lose anchors. Preserve each displayed line of project links as an annotation later.
    const bounds = clone.getBoundingClientRect();
    const links = [...clone.querySelectorAll('.resume-project-link a[href],.resume-project-heading-link a[href]')].flatMap(anchor => {
      const url = safeProjectUrl(anchor.getAttribute('href'));
      if (!url) return [];
      return [...anchor.getClientRects()].map(rect => ({ url, x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }));
    });
    return { canvas, links };
  } finally {
    stage.remove();
  }
}

function paginate(canvas, scale) {
  const pxPerPage = PAGE_H_PX * scale;
  const count = Math.max(1, Math.ceil(canvas.height / pxPerPage));
  const slices = [];
  for (let i = 0; i < count; i++) {
    const sy = i * pxPerPage, sh = Math.min(pxPerPage, canvas.height - sy);
    if (sh <= 0) break;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sh;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
    slices.push(slice);
  }
  return slices;
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const baseName = name => (name || '').trim() ? `${(name || '').trim()}-` : '';

/** 导出前预览：按与 PDF 相同的分页规则生成每页图片。 */
export async function renderResumePages({ scale = 2, onProgress = () => {} } = {}) {
  if (busy) return null;
  busy = true;
  try {
    onProgress(0.08);
    await loadRasterizer();
    onProgress(0.2);
    const { canvas } = await rasterize({ scale, onProgress });
    const slices = paginate(canvas, scale);
    onProgress(0.95);
    return {
      count: slices.length,
      pages: slices.map(slice => slice.toDataURL('image/jpeg', 0.9)),
      heightCss: canvas.height / scale,
      lastPageCss: slices[slices.length - 1].height / scale,
    };
  } finally {
    busy = false;
  }
}

/** @param {{name?: string, onProgress?: (p:number)=>void}} opts */
export async function downloadResumePDF(opts = {}) {
  if (busy) return null;
  const onProgress = opts.onProgress || (() => {});
  busy = true;
  try {
    onProgress(0.08);
    await Promise.all([loadRasterizer(), loadPdfWriter()]);
    const { canvas, links } = await rasterize({ scale: 3, onProgress });
    onProgress(0.8);

    const scale = 3;
    const slices = paginate(canvas, scale);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
    const pointsPerPixel = PAGE_W_PT / BASE_W_PX;

    slices.forEach((slice, i) => {
      const data = slice.toDataURL('image/jpeg', 0.94);
      if (i > 0) pdf.addPage();
      // 按宽度等比放置：820px 内容对应 A4 宽，高度自然换算
      const shCss = slice.height / scale;
      pdf.addImage(data, 'JPEG', 0, 0, PAGE_W_PT, shCss * pointsPerPixel, undefined, 'FAST');
      for (const link of links) {
        const left = Math.max(0, link.x), right = Math.min(BASE_W_PX, link.x + link.width);
        const top = Math.max(i * PAGE_H_PX, link.y), bottom = Math.min(i * PAGE_H_PX + shCss, link.y + link.height);
        const topPt = (top - i * PAGE_H_PX) * pointsPerPixel;
        const bottomPt = Math.min(PAGE_H_PT, (bottom - i * PAGE_H_PX) * pointsPerPixel);
        if (right > left && bottomPt > topPt) pdf.link(left * pointsPerPixel, topPt, (right - left) * pointsPerPixel, bottomPt - topPt, { url: link.url });
      }
    });

    onProgress(0.94);
    const fileName = `${baseName(opts.name)}个人简历.pdf`;
    pdf.save(fileName);
    track('resume_export');
    window.dispatchEvent(new Event('resume-file-generated'));
    onProgress(1);
    return { pages: slices.length, fileName };
  } finally {
    busy = false;
  }
}

/** 长图：整份简历一张 PNG，适合微信、邮件和聊天窗口发送。 */
export async function downloadResumeImage(opts = {}) {
  if (busy) return null;
  const onProgress = opts.onProgress || (() => {});
  busy = true;
  try {
    onProgress(0.1);
    await loadRasterizer();
    const { canvas } = await rasterize({ scale: 2, onProgress });
    onProgress(0.85);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('图片生成失败');
    const fileName = `${baseName(opts.name)}个人简历.png`;
    saveBlob(blob, fileName);
    track('resume_export');
    window.dispatchEvent(new Event('resume-file-generated'));
    onProgress(1);
    return { pages: 1, fileName };
  } finally {
    busy = false;
  }
}

/** 纯文本：给网申表单、邮件正文和 ATS 文本框粘贴用。 */
export function resumePlainText() {
  const host = document.querySelector('#resumeHost .resume_all');
  if (!host) throw new Error('未找到简历内容');
  const lines = (host.innerText || '').split('\n').map(line => line.replace(/[ \t]+$/, '').replace(/^[ \t]+/, ''));
  const out = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (/^·+$/.test(line.trim())) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function downloadResumeText(opts = {}) {
  const text = resumePlainText();
  const fileName = `${baseName(opts.name)}个人简历.txt`;
  saveBlob(new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' }), fileName);
  track('resume_export');
  window.dispatchEvent(new Event('resume-file-generated'));
  return { pages: 1, fileName };
}
