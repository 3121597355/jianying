/**
 * 简历 → PDF：把 820px 宽的 A4 页面按页切片，输出真正的 A4 PDF 文件。
 * 依赖 vendor/html2canvas（DOM 栅格化）+ vendor/jspdf（PDF 组装）。
 */

import { loadVendor } from './vendor-loader.js';

const PAGE_W_PT = 595.28;   // A4 宽（pt）
const PAGE_H_PT = 841.89;   // A4 高（pt）
const PAGE_H_PX = 1160;     // 每页内容高度（px），与预览分页一致
const BASE_W_PX = 820;      // 简历宽度（px）

let busy = false;

export function isBusy() { return busy; }

/** @param {{name?: string, onProgress?: (p:number)=>void}} opts */
export async function downloadResumePDF(opts = {}) {
  if (busy) return null;
  const source = document.querySelector('#resumeHost .resume_all');
  if (!source) throw new Error('未找到简历内容');
  // Export-only dependencies should not hold up the first editor paint.
  await Promise.all([
    loadVendor('/assets/vendor/html2canvas.min.js', () => Boolean(window.html2canvas)),
    loadVendor('/assets/vendor/jspdf.umd.min.js', () => Boolean(window.jspdf?.jsPDF)),
  ]);
  if (busy) return null;

  busy = true;
  const onProgress = opts.onProgress || (() => {});

  // 离屏克隆：脱离 .tpl_box 的高度裁剪与分页虚线，保证整份内容完整渲染
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
    // An editor upload hint is not resume content.
    if (!image) n.style.visibility = 'hidden';
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
    onProgress(0.15);
    const scale = 3;                       // 3x 栅格化 ≈ 247 DPI，印刷级
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

    onProgress(0.7);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });

    const pxPerPage = PAGE_H_PX * scale;
    const pages = Math.max(1, Math.ceil(canvas.height / pxPerPage));

    for (let i = 0; i < pages; i++) {
      const sy = i * pxPerPage;
      const sh = Math.min(pxPerPage, canvas.height - sy);
      if (sh <= 0) break;

      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sh;
      const ctx = slice.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);

      const data = slice.toDataURL('image/jpeg', 0.94);
      if (i > 0) pdf.addPage();
      // 按宽度等比放置：820px 内容对应 A4 宽，高度自然换算
      const hPt = (sh / scale) * (PAGE_W_PT / BASE_W_PX);
      pdf.addImage(data, 'JPEG', 0, 0, PAGE_W_PT, hPt, undefined, 'FAST');
    }

    onProgress(0.92);

    const name = (opts.name || '').trim();
    const fileName = `${name ? name + '-' : ''}个人简历.pdf`;
    pdf.save(fileName);

    onProgress(1);
    return { pages, fileName };
  } finally {
    stage.remove();
    busy = false;
  }
}
