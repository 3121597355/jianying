/**
 * 简历 → Word（.docx）：留一份还能继续改的文件。
 * 排版按数据重建，不依赖屏幕上某一套模板，所以换模板不影响 Word 的结构。
 * 依赖 vendor/docx.browser.js（点「Word」时才下载）。
 */

import {loadVendor} from './vendor-loader.js';
import {track} from './analytics.js';
import {getResume} from './store.js';
import {getModuleOrder} from './module-order.js';
import {SEX, MARRIAGE, POLITICS, WORK_YEARS, optionalLabel, degreeLabel} from './dict.js';
import {normalizeProjectDetails, projectFieldShown, safeProjectUrl} from './project-fields.js';
import {visibleBasicFields} from './basic-fields.js';

const FONT = '微软雅黑';
const BRAND = '284967';
const CONTENT_WIDTH = 9638; // A4 去掉左右各 2cm 页边距后的宽度（twips）
const PHOTO_CELL = 1700;
const MONTH = /^(\d{4})-(\d{2})/;

const month = value => (MONTH.test(value || '') ? String(value).slice(0, 7).replace('-', '.') : String(value || ''));
const dates = item => [month(item.timeStart), item.today ? '至今' : month(item.timeEnd)].filter(Boolean).join(' - ');
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const baseName = name => (String(name || '').trim() ? `${String(name).trim()}-` : '');

function age(birth) {
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(birth || '')) return '';
  const [year, mon, day = 1] = birth.split('-').map(Number), now = new Date();
  const years = now.getFullYear() - year - Number(now.getMonth() + 1 < mon || (now.getMonth() + 1 === mon && now.getDate() < day));
  return years > 0 ? `${years}岁` : '';
}

const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

/** 富文本 → 段落模型：{runs:[{text,bold,italics}], bullet, blank} */
function blocksFromHtml(html) {
  const source = String(html || '').trim();
  if (!source) return [];
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const blocks = [];
  const blockTags = new Set([
    'P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'BLOCKQUOTE', 'PRE',
    'OL', 'UL', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
  ]);

  const runsOf = node => {
    const runs = [];
    const walk = (el, style) => {
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.nodeValue;
          if (text) runs.push({text, ...style});
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName;
        if (tag === 'BR') {
          runs.push({break: true});
          continue;
        }
        const next = {
          bold: style.bold || tag === 'STRONG' || tag === 'B',
          italics: style.italics || tag === 'EM' || tag === 'I',
        };
        walk(child, next);
      }
    };
    walk(node, {bold: false, italics: false});
    const merged = [];
    for (const run of runs) {
      const last = merged[merged.length - 1];
      if (!run.break && last && !last.break && last.bold === run.bold && last.italics === run.italics) last.text += run.text;
      else merged.push({...run});
    }
    return merged.filter(run => run.break || run.text.trim() !== '' || run.text === ' ');
  };

  const collect = el => {
    const children = [...el.children];
    if (!children.length || !children.some(child => blockTags.has(child.tagName))) {
      const runs = runsOf(el);
      if (!runs.length) return;
      blocks.push({runs, bullet: Boolean(el.closest('li'))});
      return;
    }
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue.trim();
        if (text) blocks.push({runs: [{text}], bullet: false});
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      collect(child);
    }
  };

  collect(parsed.body);
  return blocks.filter(block => block.runs.some(run => run.break || run.text.trim()));
}

/** 图片 dataURL → 可嵌入的字节 + 尺寸（webp 之类先转成 PNG）。 */
async function photoPayload(dataUrl) {
  if (!/^data:image\//i.test(dataUrl || '')) return null;
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('照片读取失败'));
    img.src = dataUrl;
  });
  const isPng = /^data:image\/png/i.test(dataUrl);
  let bytes;
  let type = 'png';
  if (isPng) {
    bytes = Uint8Array.from(atob(dataUrl.split(',')[1] || ''), char => char.charCodeAt(0));
    type = 'png';
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const png = canvas.toDataURL('image/png');
    bytes = Uint8Array.from(atob(png.split(',')[1] || ''), char => char.charCodeAt(0));
    type = 'png';
  }
  const maxWidth = 96;
  const scale = Math.min(1, maxWidth / (image.naturalWidth || maxWidth));
  return {
    data: bytes,
    type,
    width: Math.round((image.naturalWidth || 96) * scale),
    height: Math.round((image.naturalHeight || 128) * scale),
  };
}

/** 生成 .docx 文件本身，导出与本地检查共用同一份逻辑。 */
export async function buildResumeWordBlob(opts = {}) {
  await loadVendor('/assets/vendor/docx.browser.js', () => Boolean(window.docx));
  const docx = window.docx;
  if (!docx?.Packer) throw new Error('Word 组件加载失败，请重试');

  const {
    Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, TabStopType, HeadingLevel, VerticalAlign,
  } = docx;

  const resume = getResume();
  const settings = resume.setData || {};
  const basic = resume.basicInfo || {};
  const modules = new Map((resume.moduleData || []).map(mod => [mod.moduleName, mod]));
  const title = clean(settings.title) || '个人简历';

  const run = (text, options = {}) => new TextRun({
    text: String(text ?? ''),
    font: {ascii: FONT, eastAsia: FONT, hAnsi: FONT},
    ...options,
  });

  const paragraph = (content, options = {}) => new Paragraph({
    children: Array.isArray(content) ? content : [content],
    ...options,
  });

  const spaced = (children, options = {}) => paragraph(children, {
    spacing: {after: 40, line: 300},
    ...options,
  });

  const heading = label => paragraph(run(label, {bold: true, size: 24, color: BRAND}), {
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: {before: 200, after: 90},
    border: {bottom: {style: BorderStyle.SINGLE, size: 6, color: BRAND, space: 2}},
  });

  const richBlocks = (html, {bulletFallback = false} = {}) => {
    const blocks = blocksFromHtml(html);
    return blocks.map(block => paragraph(
      block.runs.map(r => (r.break ? new TextRun({break: 1}) : run(r.text, {bold: r.bold, italics: r.italics}))),
      block.bullet || bulletFallback
        ? {bullet: {level: 0}, spacing: {after: 40, line: 288}}
        : {spacing: {after: 40, line: 288}},
    ));
  };

  const dateLine = (left, right) => paragraph(
    [...left, ...(right ? [run('\t'), run(right, {color: '555555'})] : [])],
    {
      tabStops: [{type: TabStopType.RIGHT, position: CONTENT_WIDTH}],
      keepNext: true,
      spacing: {before: 80, after: 20, line: 288},
    },
  );

  // ---- 页眉：姓名、标题、资料、联系方式，右侧照片 ----
  const profile = [
    basic.isAge === false ? basic.birthday : age(basic.birthday),
    optionalLabel(SEX, basic.sex),
    clean(basic.minzu),
    optionalLabel(MARRIAGE, basic.hunyin),
    basic.height ? `${basic.height}cm` : '',
    basic.weight ? `${basic.weight}kg` : '',
    optionalLabel(POLITICS, basic.zhengzhi),
    clean(basic.jiguan),
    Number(basic.workYears) >= 0 ? WORK_YEARS[Number(basic.workYears) + 1] : '',
    ...visibleBasicFields(basic.make).map(item => `${clean(item.keyValue)}${clean(item.keyValue) ? '：' : ''}${clean(item.value)}`),
  ].map(clean).filter(Boolean);

  const headLeft = [
    paragraph(run(clean(basic.name) || '你的姓名', {bold: true, size: 40}), {spacing: {after: 60}}),
    [clean(settings.slogan), title].filter(Boolean).length
      ? paragraph(run([title, clean(settings.slogan)].filter(Boolean).join(' · '), {size: 18, color: '666666'}), {spacing: {after: 80}})
      : null,
    profile.length ? paragraph(run(profile.join(' ｜ '), {size: 19}), {spacing: {after: 40}, line: 280}) : null,
    [clean(basic.mobile), clean(basic.email)].filter(Boolean).length
      ? paragraph(run([clean(basic.mobile), clean(basic.email)].filter(Boolean).join(' ｜ '), {size: 19}), {spacing: {after: 0}, line: 280})
      : null,
  ].filter(Boolean);

  const photo = basic.photoShow ? await photoPayload(basic.photo).catch(() => null) : null;
  const headerBlock = photo
    ? new Table({
      width: {size: CONTENT_WIDTH, type: WidthType.DXA},
      columnWidths: [CONTENT_WIDTH - PHOTO_CELL, PHOTO_CELL],
      borders: {
        top: {style: BorderStyle.NONE}, bottom: {style: BorderStyle.NONE},
        left: {style: BorderStyle.NONE}, right: {style: BorderStyle.NONE},
        insideHorizontal: {style: BorderStyle.NONE}, insideVertical: {style: BorderStyle.NONE},
      },
      rows: [new TableRow({
        children: [
          new TableCell({
            width: {size: CONTENT_WIDTH - PHOTO_CELL, type: WidthType.DXA},
            verticalAlign: VerticalAlign.CENTER,
            children: headLeft,
          }),
          new TableCell({
            width: {size: PHOTO_CELL, type: WidthType.DXA},
            verticalAlign: VerticalAlign.TOP,
            children: [paragraph(new ImageRun({data: photo.data, type: photo.type, transformation: {width: photo.width, height: photo.height}}), {alignment: AlignmentType.RIGHT, spacing: {after: 0}})],
          }),
        ],
      })],
    })
    : headLeft;

  const children = Array.isArray(headerBlock) ? [...headerBlock] : [headerBlock];

  // ---- 各模块 ----
  const timelineSection = mod => {
    const items = (Array.isArray(mod.data) ? mod.data : []).filter(Boolean);
    const rendered = items.map(item => {
      const lines = [];
      const isEdu = mod.moduleName === 'jiaoyu';
      const degree = isEdu ? degreeLabel(item.xueli) : '';
      const labels = [clean(item.name), isEdu ? clean(item.major) : clean(item.job), degree === '不填' ? '' : clean(degree)].filter(Boolean);
      const website = mod.moduleName === 'project' && projectFieldShown(item, 'website') ? safeProjectUrl(item.projectDetails?.website) : '';
      if (!labels.length && !dates(item) && !item.content) return null;
      const left = labels.length ? [run(labels[0], {bold: true, size: 21})] : [];
      if (labels.length > 1) left.push(run('  ·  ' + labels.slice(1).join('  ·  '), {size: 20}));
      if (website) left.push(run(`  ·  项目地址：${website.replace(/^https?:\/\//, '')}`, {size: 18, color: '555555'}));
      lines.push(dateLine(left, dates(item)));
      if (mod.moduleName === 'project' && item.projectDetails) {
        const detail = normalizeProjectDetails(item.projectDetails);
        const body = [];
        const field = (key, label) => {
          const value = clean(detail[key]);
          if (!projectFieldShown(item, key) || !value) return;
          body.push(paragraph([run(`${label}：`, {bold: true}), run(value)], {spacing: {after: 40}, bullet: {level: 0}}));
        };
        field('summary', '项目简介');
        if (projectFieldShown(item, 'content')) {
          // 标签直接放在第一段开头，避免 Word 里出现孤零零一行「个人贡献：」。
          const contribution = blocksFromHtml(item.content);
          contribution.forEach((block, index) => {
            const runs = block.runs.map(r => (r.break ? new TextRun({break: 1}) : run(r.text, {bold: r.bold, italics: r.italics})));
            if (index === 0) runs.unshift(run('个人贡献：', {bold: true}));
            body.push(paragraph(runs, block.bullet ? {bullet: {level: 0}, spacing: {after: 40, line: 288}} : {spacing: {after: 40, line: 288}}));
          });
        }
        field('outcome', '项目成果');
        field('techStack', '技术栈');
        const repo = projectFieldShown(item, 'repository') ? safeProjectUrl(detail.repository) : '';
        if (repo) body.push(paragraph([run('源码地址：', {bold: true}), run(repo)], {spacing: {after: 40}, bullet: {level: 0}}));
        lines.push(...body);
      } else {
        lines.push(...richBlocks(item.content));
      }
      return lines;
    }).filter(Boolean);
    if (!rendered.length) return null;
    return [heading(mod.moduleValue || ''), ...rendered.flat()];
  };

  const plainSection = (mod, label, childrenOfSection) => {
    if (!childrenOfSection.length) return null;
    return [heading(label), ...childrenOfSection];
  };

  const sectionFor = name => {
    const mod = modules.get(name);
    if (!mod?.visible) return null;
    const label = clean(mod.moduleValue) || '';
    if (['jiaoyu', 'work', 'project', 'shixi', 'xiaoyuan'].includes(name)) return timelineSection(mod);
    if (name === 'yixiang') {
      const goal = mod.data || {};
      const parts = [
        goal.job ? `求职意向：${clean(goal.job)}` : '',
        clean(goal.city), clean(goal.money), clean(goal.joinTime),
      ].filter(Boolean);
      return parts.length ? plainSection(mod, label, [spaced(run(parts.join(' ｜ '), {size: 20}))]) : null;
    }
    if (name === 'baokao') {
      const rows = [];
      const head = [clean(mod.title), clean(mod.name), clean(mod.major)].filter(Boolean);
      if (head.length) rows.push(spaced(run(head.join(' ｜ '), {size: 20})));
      (Array.isArray(mod.data) ? mod.data : []).forEach(item => {
        const line = [clean(item?.name), clean(item?.score)].filter(Boolean).join('：');
        if (line) rows.push(spaced(run(line), {bullet: {level: 0}}));
      });
      return plainSection(mod, label, rows);
    }
    if (name === 'jineng') {
      const skills = (Array.isArray(mod.data) ? mod.data : [])
        .map(item => clean(typeof item === 'string' ? item : item?.name))
        .filter(Boolean);
      const rows = [...richBlocks(mod.content)];
      if (skills.length) rows.push(spaced(run(skills.join('  ·  ')), {bullet: {level: 0}}));
      return plainSection(mod, label, rows);
    }
    if (name === 'aihao') {
      const tags = (Array.isArray(mod.data) ? mod.data : []).map(tag => clean(tag)).filter(Boolean);
      const rows = [...richBlocks(mod.content)];
      if (tags.length) rows.push(spaced(run(tags.join('  ·  '))));
      return plainSection(mod, label, rows);
    }
    return plainSection(mod, label, richBlocks(mod.content));
  };

  for (const name of getModuleOrder(resume)) {
    if (name === 'basic') continue;
    const section = sectionFor(name);
    if (section) children.push(...section);
  }

  const wordDoc = new Document({
    creator: '一纸简历',
    title: `${clean(basic.name) || ''}${title}`,
    styles: {
      default: {
        document: {run: {font: {ascii: FONT, eastAsia: FONT, hAnsi: FONT}, size: 21}},
        heading2: {run: {font: {ascii: FONT, eastAsia: FONT, hAnsi: FONT}}},
      },
    },
    sections: [{
      properties: {
        page: {size: {width: 11906, height: 16838}, margin: {top: 1134, right: 1134, bottom: 1134, left: 1134}},
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(wordDoc);
  const fileName = `${baseName(opts.name)}个人简历.docx`;
  return {blob, fileName};
}

export async function downloadResumeWord(opts = {}) {
  const {blob, fileName} = await buildResumeWordBlob(opts);
  saveBlob(blob, fileName);
  track('resume_export');
  window.dispatchEvent(new Event('resume-file-generated'));
  return {pages: 1, fileName};
}
