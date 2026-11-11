/**
 * 主控：真实外壳 DOM（.edit_tab / .set_list / #resumeHost）+ 数据驱动
 */
import {
  getResume, getUi, set, commit, flushSave, onChange, onSaveState,
  getModule, reset, blankItem,
} from './store.js';
import { renderByTpl, TEMPLATES, getTemplate, applyTemplate } from './templates.js';
import { renderForm, setQuillFactory, disposeEditors, setActiveItem } from './forms.js';
import { downloadResumePDF } from './pdf.js';
import { MODULES, FONTS } from './dict.js';
import { buildSettingsPanel } from './settings.js';
import { getModuleOrder } from './module-order.js';
import { listPersonalTemplates, savePersonalTemplate, removePersonalTemplate, templateMatches } from './personal-templates.js';
import { captureElement, capturePaper, moveElement, movePaper, slideSidebar } from './motion.js';
import { WORKSPACE_NAV } from './workspace-nav.js';
import {availableTemplates} from './site-settings.js';
import {track} from './analytics.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 编辑器样式使用作用域选择器（[data-v-xxxx]），动态插入的节点必须补上对应作用域属性才能命中。
 *  编辑区涉及 4 个组件作用域：主页面 236d5b80、经历布局 271b76ba、73ef5012、AI 面板 bc933204。 */
const SCOPES = [
  'data-v-236d5b80', 'data-v-271b76ba', 'data-v-73ef5012', 'data-v-bc933204',
  'data-v-2bb184da', 'data-v-51d5463a', 'data-v-6297c57e', 'data-v-6dae58fd', 'data-v-d5ea9138',
];
const markScope = root => {
  if (!root || root.nodeType !== 1) return root;
  const nodes = [root, ...root.querySelectorAll('*')];
  for (const el of nodes) for (const s of SCOPES) el.setAttribute(s, '');
  return root;
};
window.__markScope = markScope;

/* ------------------------------ Quill ------------------------------ */

let quillReady = false;
function initQuill() {
  if (!window.Quill) return false;
  setQuillFactory((host, html) => {
    const box = document.createElement('div');
    box.className = 'ql-container ql-snow';
    const inner = document.createElement('div');
    inner.className = 'ql-editor';
    inner.innerHTML = html || '';
    box.appendChild(inner);
    host.appendChild(box);

    const q = new window.Quill(inner, {
      theme: 'snow',
      placeholder: '所修课程、成绩排名、在校的职务、参赛获奖情况等有利于突出个人优势的信息。尽量简洁，突出重点。',
      modules: {
        toolbar: { container: [
          [{ undo: true }, { redo: true }],
          [{ size: ['small', false, 'large', 'huge'] }],
          [{ color: [] }],
          ['bold', 'italic', 'underline', 'link'],
          [{ list: 'ordered' }, { list: 'bullet' }, { align: [] }],
          ['image', 'clean'],
        ], handlers: { undo() { this.quill.history.undo(); }, redo() { this.quill.history.redo(); } } },
        history: { delay: 500, maxStack: 100, userOnly: true },
      },
    });
    // Quill 会把 toolbar 插到 container 前面
    const tb = host.querySelector('.ql-toolbar');
    q.root.setAttribute('role', 'textbox');
    q.root.setAttribute('aria-label', '详细内容');
    q.root.setAttribute('aria-multiline', 'true');
    if (tb) {
      tb.classList.add('ql-snow');
      const labels = { undo: '撤销', redo: '恢复', bold: '加粗', italic: '斜体', underline: '下划线', link: '插入链接', image: '插入图片', clean: '清除格式' };
      for (const [format, label] of Object.entries(labels)) {
        const button = tb.querySelector(`.ql-${format}`);
        if (button) { button.setAttribute('aria-label', label); button.title = label; }
      }
    }
    quillReady = true;
    return q;
  });
  return true;
}

/* ------------------------------ 预览 ------------------------------ */

let previewFrame = 0;
let previewHTML = '';
let fitPreviewLayout = () => {};
function queuePreview() {
  if (previewFrame) return;
  previewFrame = requestAnimationFrame(() => { previewFrame = 0; renderPreview(); });
}

function renderPreview() {
  const r = getResume();
  const host = $('#resumeHost');
  if (!host) return;
  const html = renderByTpl(r);
  if (html !== previewHTML) { host.innerHTML = html; previewHTML = html; }

  const box = host.querySelector('.resume_box');
  const h = box ? box.offsetHeight : 0;
  const pages = Math.max(1, Math.ceil(h / 1160));
  const tplBox = $('#resume_tpl_box');
  if (tplBox) tplBox.style.height = `${pages * 1160}px`;
  const pn = $('#pageNum');
  if (pn) pn.innerHTML = `第1页 (共<b class="orange">${pages}</b>页)`;
  // 分页虚线与角标
  host.querySelectorAll('.pagebreak-tag').forEach(n => n.remove());
  for (let i = 1; i < pages; i++) {
    const d = document.createElement('div');
    d.className = 'pagebreak-tag';
    d.style.top = `${i * 1160}px`;
    d.dataset.page = `第${i + 1}页`;
    host.appendChild(d);
  }
}

/* ------------------------------ 照片 ------------------------------ */

let photoInput = null;
/** 统一的照片选择入口：表单按钮与简历上的照片位都走这里 */
function pickPhoto() {
  if (!photoInput) {
    photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.style.display = 'none';
    document.body.appendChild(photoInput);
    photoInput.addEventListener('change', () => {
      const f = photoInput.files && photoInput.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        set(rr => { rr.basicInfo.photo = fr.result; rr.basicInfo.photoShow = true; });
        commit({ structural: true });
      };
      fr.readAsDataURL(f);
      photoInput.value = '';
    });
  }
  photoInput.click();
}
window.__pickPhoto = pickPhoto;

function bindPhotoSlot() {
  // 用事件委托，简历重新渲染也不会丢
  const host = $('#resumeHost');
  host?.addEventListener('click', e => {
    if (e.target.closest('[data-photo-slot]')) pickPhoto();
  });
  host?.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-photo-slot]')) { e.preventDefault(); pickPhoto(); }
  });
}

/* ------------------------------ 页签 ------------------------------ */

/** 常驻编辑侧栏：预览和表单各自滚动，编辑时始终能看见简历。 */
function setupWorkspace() {
  const main = $('.edit_main');
  const panel = $('.edit_all');
  const paper = $('#tpl_box');
  if (!main || !panel || !paper) return;
  main.classList.add('resume-workspace');
  main.dataset.view = 'edit';
  panel.classList.add('editor-panel');
  panel.id = 'resumeEditorPanel';
  panel.setAttribute('aria-label', '简历编辑');

  const preview = document.createElement('section');
  preview.className = 'preview-pane';
  preview.setAttribute('aria-label', '简历实时预览');
  preview.innerHTML = `<div class="preview-heading"><div><strong>简历预览</strong><span class="live-indicator save-status" id="saveStatus" role="status" aria-live="polite">自动保存已开启</span></div><span id="pageNum"></span></div>
    <div class="preview-scroll"><div class="preview-paper"></div></div>`;
  preview.querySelector('.preview-paper').appendChild(paper);
  const previewHeading = preview.querySelector('.preview-heading');
  const editorHeading = document.createElement('div');
  editorHeading.className = 'editor-heading';
  editorHeading.innerHTML = '<strong>简历编辑</strong>';
  main.append(previewHeading, editorHeading, preview, panel);

  const foot = document.createElement('div');
  foot.className = 'editor-footer';
  foot.appendChild($('.save_tip'));
  $('.edit_box').appendChild(foot);
  // 把手独立于可滑出的内容，收起后仍可点击和用键盘展开。
  const collapseHandle = panel.querySelector('.close');
  if (collapseHandle) panel.appendChild(collapseHandle);
  $('.save_tip span').textContent = '修改后自动保存在本机';
  previewHeading.querySelector(':scope > div').appendChild($('.privacy-trigger'));
  setEditorOpen(getUi().editOpen !== false,{animate:false});

  const views = document.createElement('div');
  views.className = 'workspace-views';
  views.innerHTML = `<button type="button" data-view="edit" aria-pressed="${main.dataset.view === 'edit'}">编辑内容</button><button type="button" data-view="preview" aria-pressed="${main.dataset.view === 'preview'}">查看预览</button>`;
  main.prepend(views);
  views.addEventListener('click', e => {
    const button = e.target.closest('[data-view]');
    if (!button) return;
    setEditorOpen(button.dataset.view === 'edit');
    commit();
  });

  // zoom 只作用于预览外壳；导出的离屏简历继续使用原始 820px 宽度。
  const scroller = preview.querySelector('.preview-scroll');
  const fit = () => {
    paper.style.zoom = String(Math.min(1, Math.max(.2, (scroller.clientWidth - 40) / 820)));
    alignToolbarWithPaper();
  };
  new ResizeObserver(fit).observe(scroller);
  fitPreviewLayout = fit;
  fit();
}

/** 收起时直接对齐纸张的实际中心；展开时保持收起后的中心位置。 */
function alignToolbarWithPaper() {
  const header = $('.edit_header_main');
  const tools = $('.set_list');
  const workspace = $('.resume-workspace');
  const scroller = $('.preview-scroll');
  const paper = $('.preview-paper');
  if (!header || !tools || !workspace || !scroller || !paper) return;
  let offset = 0;
  if (window.matchMedia('(min-width: 861px)').matches) {
    const style = getComputedStyle(workspace);
    const bounds = workspace.getBoundingClientRect();
    const left = parseFloat(style.paddingLeft) || 0;
    const right = parseFloat(style.paddingRight) || 0;
    const gap = parseFloat(style.columnGap) || 0;
    const gutter = scroller.getBoundingClientRect().width - paper.getBoundingClientRect().width;
    const rail = parseFloat(style.getPropertyValue('--collapsed-editor-width')) || 32;
    // Use the final layout instead of the paper's animated bounds; ResizeObserver
    // can run while the paper is still moving during a fold.
    const center = bounds.left + left + (bounds.width - left - right - gap - rail - gutter) / 2;
    const first = tools.firstElementChild?.getBoundingClientRect();
    const last = tools.lastElementChild?.getBoundingClientRect();
    if (first && last) {
      const previousOffset = parseFloat(header.style.getPropertyValue('--toolbar-offset')) || 0;
      const baseCenter = (first.left + last.right) / 2 - previousOffset;
      offset = center - baseCenter;
    }
  }
  header.style.setProperty('--toolbar-offset', `${offset}px`);
}

function setEditorOpen(open,{animate=true}={}) {
  const panel = $('#resumeEditorPanel');
  const workspaceBefore = $('.resume-workspace');
  const changed = workspaceBefore && workspaceBefore.classList.contains('editor-collapsed') === open;
  const paper = $('#tpl_box');
  const editor = panel?.querySelector('.edit_box');
  const toggle = panel?.querySelector(':scope > .close');
  const heading=$('.editor-heading');
  const pageNum=$('#pageNum');
  const desktop=window.matchMedia('(min-width: 861px)').matches;
  const moving=animate&&changed&&desktop;
  const before = moving ? capturePaper(paper) : null;
  const editorBefore=moving?captureElement(editor):null;
  const handleBefore=moving?capturePaper(toggle):null;
  const headingBefore=moving?captureElement(heading):null;
  const pageBefore=moving?capturePaper(pageNum):null;
  if (!open && panel?.classList.contains('edit_show')) {
    const width=`${panel.clientWidth}px`;
    panel.style.setProperty('--editor-expanded-width',width);
    workspaceBefore?.style.setProperty('--editor-expanded-width',width);
  }
  if (!open && editor?.contains(document.activeElement)) toggle?.focus({preventScroll:true});
  if (editor) editor.inert = !open;
  $('.edit_all')?.classList.toggle('edit_show', open);
  const workspace = $('.resume-workspace');
  workspace?.classList.toggle('editor-collapsed', !open);
  if (workspace) {
    workspace.dataset.view = open ? 'edit' : 'preview';
    workspace.querySelectorAll('.workspace-views button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === workspace.dataset.view));
    });
  }
  getUi().editOpen = open;
  if (toggle) {
    toggle.title = open ? '收起编辑区' : '展开编辑区';
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', '0');
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-controls','resumeEditorContent');
    toggle.classList.remove('webfont','webicon-jiantoudown','webicon-jiantouup','webicon-sliderright','webicon-sliderleft');
    toggle.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${open ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'}"/></svg>`;
  }
  if(editor)editor.id='resumeEditorContent';
  fitPreviewLayout();
  if (moving) {
    movePaper(paper,before);
    slideSidebar(editor,editorBefore,open);
    slideSidebar(heading,headingBefore,open);
    moveElement(toggle,handleBefore);
    moveElement(pageNum,pageBefore);
  }
}

function focusPreview(name = window.__tab, onlyIfOutside = false) {
  const scroller = $('.preview-scroll');
  const host = $('#resumeHost');
  if (!scroller || !host) return;
  if (name === 'basic') { scroller.scrollTo({ top: 0, behavior: document.documentElement.dataset.motion==='reduce' ? 'instant' : 'smooth' }); return; }
  const target = host.querySelector(`#${name}`) || (name === 'basic' || name === 'yixiang' ? host.querySelector('#basicInfo, .basic_info, .resumeHead') : null);
  if (!target) return;
  const outer = scroller.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  if (onlyIfOutside && rect.top >= outer.top && rect.top < outer.bottom - 80) return;
  scroller.scrollTo({ top: scroller.scrollTop + rect.top - outer.top - 20, behavior: document.documentElement.dataset.motion==='reduce' ? 'instant' : 'smooth' });
}

function renderTabs() {
  const r = getResume();
  const tab = window.__tab || 'basic';
  const ul = $('.edit_tab');
  if (!ul) return;

  const defs = getModuleOrder(r).map(name => MODULES.find(def => def.name === name)).filter(Boolean);
  ul.setAttribute('aria-label', '简历模块');
  ul.innerHTML = defs.map((def, index) => {
    const arrows = (index > 0
      ? `<div class="el-tooltip btn_prev webfont webicon-sliderleft" data-prev="${def.name}" title="前移模块" role="button" aria-label="前移${esc(def.label)}" tabindex="0"></div>` : '')
      + (index < defs.length - 1
        ? `<div class="el-tooltip btn_next webfont webicon-sliderright" data-next="${def.name}" title="后移模块" role="button" aria-label="后移${esc(def.label)}" tabindex="0"></div>` : '');
    if (def.kind === 'basic') return `<li class="${tab === 'basic' ? 'active' : ''}" data-tab="basic" role="button" tabindex="0"><b>基本信息</b>${arrows}</li>`;
    const m = getModule(def.name);
    const visible = !!m?.visible;
    return `<li class="${tab === def.name ? 'active' : ''} ${visible ? '' : 'module_hide'}" data-tab="${def.name}" role="button" tabindex="0">
      <b class="el-tooltip" title="点击切换模块">${esc(m?.moduleValue || def.label)}</b>
      <div class="el-switch el-tooltip tab_switch ${visible ? 'is-checked' : ''}" data-switch="${def.name}" role="switch" aria-checked="${visible}" aria-label="显示${esc(m?.moduleValue || def.label)}" title="点击${visible ? '关闭' : '启用'}模块" tabindex="0">
        <input type="checkbox" class="el-switch__input" ${visible ? 'checked' : ''}>
        <span class="el-switch__core" style="width:40px;"></span>
      </div>${arrows}
      <div class="el-tooltip btn_edit webfont webicon-edit1" data-edit="${def.name}" title="修改模块名称" role="button" aria-label="重命名${esc(m?.moduleValue || def.label)}" tabindex="0"></div>
    </li>`;
  }).join('');
  markScope(ul);
}

function bindTabs() {
  $('.edit_tab')?.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-prev], [data-next], [data-edit], [data-switch], [data-tab]')) {
      e.preventDefault(); e.target.click();
    }
  });
  $('.edit_box')?.addEventListener('click', e => {
    const sw = e.target.closest('[data-switch]');
    if (sw) {
      e.stopPropagation();
      const name = sw.dataset.switch;
      set(rr => { const m = rr.moduleData.find(x => x.moduleName === name); if (m) m.visible = !m.visible; }, { tabs: true });
      if (getModule(name)?.visible) requestAnimationFrame(() => focusPreview(name));
      return;
    }
    const prev = e.target.closest('[data-prev]');
    const next = e.target.closest('[data-next]');
    if (prev || next) {
      e.stopPropagation();
      const name = (prev || next).dataset[prev ? 'prev' : 'next'];
      moveModule(name, prev ? -1 : 1);
      requestAnimationFrame(() => focusPreview(name));
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      e.stopPropagation();
      renameModule(edit.dataset.edit);
      return;
    }
    const li = e.target.closest('[data-tab]');
    if (!li) return;
    window.__tab = li.dataset.tab;
    getUi().tab = window.__tab;
    setEditorOpen(true);
    commit({ structural: true });
    requestAnimationFrame(() => focusPreview(window.__tab));
  });
}

function moveModule(name, dir) {
  set(rr => {
    const arr = getModuleOrder(rr);
    const i = arr.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    rr.setData.moduleSort = arr;
  }, { tabs: true });
}

function renameModule(name) {
  const m = getModule(name);
  const v = prompt('修改模块名称', m?.moduleValue || '');
  if (v && v.trim()) {
    set(rr => { const x = rr.moduleData.find(mm => mm.moduleName === name); if (x) x.moduleValue = v.trim(); }, { tabs: true });
  }
}

/* ------------------------------ 顶栏设置 ------------------------------ */

function bindSetList() {
  $('.set_list')?.addEventListener('click', event => {
    const button = event.target.closest('.click_btn');
    if (button && /更换模板/.test(button.textContent)) openTplDialog();
  });
}

/* ------------------------------ 弹窗 ------------------------------ */

function modal(title, bodyHtml, onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'el-dialog__wrapper qm-modal';
  const previousFocus = document.activeElement;
  wrap.innerHTML = `<div role="dialog" aria-modal="true" tabindex="-1" aria-label="${esc(title)}" class="el-dialog" style="margin-top:12vh;width:560px">
    <div class="el-dialog__header"><span class="el-dialog__title">${esc(title)}</span>
      <button type="button" class="el-dialog__headerbtn" data-close aria-label="关闭弹窗"><i class="el-dialog__close el-icon el-icon-close"></i></button></div>
    <div class="el-dialog__body">${bodyHtml}</div>
  </div>`;
  document.body.appendChild(wrap);
  const close = () => { flushSave(); wrap.remove(); previousFocus?.focus({ preventScroll: true }); };
  wrap.addEventListener('click', e => {
    if (e.target.closest('[data-close]') || e.target === wrap) close();
  });
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const controls = [...wrap.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
  markScope(wrap);
  onMount && onMount(wrap, close);
  requestAnimationFrame(() => { if (wrap.isConnected) (wrap.querySelector('input:not([type="checkbox"]), select, textarea') || wrap.querySelector('.el-dialog')).focus({ preventScroll: true }); });
  return wrap;
}

function openTplDialog() {
  const cur = getResume().setData.tplId;
  const personal=listPersonalTemplates(),activePersonal=personal.find(t=>t.id===getUi().customTemplateId&&templateMatches(t,getResume().setData));
  const choices = availableTemplates(TEMPLATES);
  const cards = choices.map(t => `
    <button type="button" class="tpl_card ${!activePersonal&&t.id === Number(cur) ? 'active' : ''}" data-tpl="${t.id}" aria-label="选择${esc(t.name)}模板" aria-pressed="${!activePersonal&&t.id === Number(cur)}">
      <div class="tpl_thumb"><img src="${esc(t.thumbnail)}" alt="${esc(t.name)}模板预览" loading="lazy"></div>
      <strong>${esc(t.code)}</strong>
      <span>${esc(t.name)}</span>
      <em>${esc(t.desc)}</em>
    </button>`).join('');

  const customCards=personal.map(t=>{const base=getTemplate(t.style.tplId),active=t===activePersonal;return `<article class="personal-template-card${active?' active':''}"><button type="button" class="personal-template-select" data-personal="${esc(t.id)}" aria-label="使用自定义模板${esc(t.name)}" aria-pressed="${active}"><div class="tpl_thumb"><img src="${esc(base.thumbnail)}" alt="${esc(base.name)}基础版式预览" loading="lazy"><small class="template-base-label">${esc(base.name)}</small></div><strong>${esc(t.name)}</strong><span class="personal-style-summary"><i style="background:${t.style.skin}"></i>${t.style.fontSize}px · ${t.style.lineHeight}倍行距</span></button><div class="personal-template-actions"><button type="button" data-rename-personal="${esc(t.id)}" aria-label="重命名${esc(t.name)}">重命名</button><button type="button" data-remove-personal="${esc(t.id)}" aria-label="移除${esc(t.name)}">移除</button></div></article>`;}).join('');
  modal('更换模板', `
    <div class="template-topline"><p class="info_tip">${choices.length}套基础版式${personal.length?` · ${personal.length}套自定义模板`:''}，切换保留简历内容。</p><button type="button" class="create-template-top" data-create-personal aria-label="创建自定义模板">＋ 自定义模板</button></div>
    <div class="tpl_pick">${cards}</div>${personal.length?`<div class="personal-template-heading"><h3>我的模板</h3><span>保存在当前浏览器</span></div><div class="tpl_pick personal-template-grid">${customCards}</div>`:''}`, (w, close) => {
    w.classList.add('qm-template-dialog');
    w.querySelectorAll('[data-tpl]').forEach(card => {
      card.onclick = () => {
        const id = Number(card.dataset.tpl);
        track('template_select',id);
        set(rr => {
          applyTemplate(rr, id);
          getUi().tplChosen = true;
          getUi().customTemplateId = null;
          // 切到带标题版式时补一个默认标题
          if (id === 2001 && !rr.setData.title) rr.setData.title = '个人简历';
        });
        w.querySelectorAll('[data-tpl]').forEach(c => {
          c.classList.toggle('active', c === card);
          c.setAttribute('aria-pressed', String(c === card));
        });
        close();
      };
    });
    w.querySelectorAll('[data-create-personal]').forEach(button=>button.onclick=()=>{close();openCustomTemplateEditor();});
    w.querySelectorAll('[data-personal]').forEach(button=>button.onclick=()=>{const template=personal.find(t=>t.id===button.dataset.personal);if(!template)return;set(resume=>{Object.assign(resume.setData,template.style);getUi().tplChosen=true;getUi().customTemplateId=template.id;});close();toast(`已套用「${template.name}」`);});
    w.querySelectorAll('[data-rename-personal]').forEach(button=>button.onclick=()=>{const template=personal.find(t=>t.id===button.dataset.renamePersonal);close();openSavePersonalTemplate(template,{renameOnly:true});});
    w.querySelectorAll('[data-remove-personal]').forEach(button=>button.onclick=()=>{const template=personal.find(t=>t.id===button.dataset.removePersonal);close();modal('移除自定义模板',`<p class="personal-template-note">移除「${esc(template.name)}」？当前简历内容和样式会保留。</p><div class="personal-dialog-actions"><button type="button" data-close>取消</button><button type="button" data-confirm-remove>移除模板</button></div>`,(dialog,closeConfirm)=>{dialog.querySelector('[data-confirm-remove]').onclick=()=>{try{removePersonalTemplate(template.id);if(getUi().customTemplateId===template.id){getUi().customTemplateId=null;commit();}closeConfirm();openTplDialog();}catch{toast('模板未能移除，请检查浏览器存储设置。');}};});});
  });
}

function openCustomTemplateEditor(){
  getUi().customTemplateId=null;
  getUi().settingsTab='layout';
  const button=$('.set_list > li .set_btn'),panel=$('.grouped-settings');
  if(button?.getAttribute('aria-expanded')!=='true')button?.click();
  panel?.querySelector('[data-settings-tab="layout"]')?.click();
  panel?.querySelector('.save-personal-template')?.classList.add('highlight');
  toast('调整到喜欢的样式后，点击「保存为自定义模板」');
}

function openSavePersonalTemplate(existing=null,{renameOnly=false}={}){
  const style=renameOnly&&existing?existing.style:getResume().setData,base=getTemplate(style.tplId),font=FONTS.find(f=>Number(f.value)===Number(style.font));
  modal(renameOnly?'重命名模板':existing?'更新自定义模板':'保存自定义模板',`<form class="personal-template-form"><label for="personal-template-name">模板名称</label><input id="personal-template-name" name="templateName" maxlength="24" required value="${esc(existing?.name||'')}" placeholder="例如：我的清爽简历" autocomplete="off"><p class="personal-template-note">${esc(base.name)} · ${esc(font?.label||'微软雅黑')} · ${style.fontSize}px<br>仅保存样式，套用时保留简历内容。</p><div class="personal-dialog-actions"><button type="button" data-close>取消</button><button type="submit">${renameOnly?'保存名称':existing?'更新模板':'保存模板'}</button></div><p class="personal-template-error" role="status" hidden></p></form>`,(w,close)=>{
    w.querySelector('form').onsubmit=event=>{event.preventDefault();try{const template=savePersonalTemplate(w.querySelector('input').value,style,{id:existing?.id});if(!renameOnly){getUi().customTemplateId=template.id;getUi().tplChosen=true;commit();}close();toast(renameOnly?'模板名称已更新':`「${template.name}」已保存到我的模板`);}catch(error){const note=w.querySelector('.personal-template-error');note.textContent=error.name==='QuotaExceededError'?'浏览器存储空间不足，请清理不用的模板后重试。':error.message;note.hidden=false;}};
  });
}
document.addEventListener('qm-save-personal-template',()=>{const existing=listPersonalTemplates().find(t=>t.id===getUi().customTemplateId);openSavePersonalTemplate(existing);});

/* ------------------------------ 顶栏其它 ------------------------------ */

/* ------------------------------ 提示 ------------------------------ */

let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('qmToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'qmToast';
    el.className = 'qm-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

/* ------------------------------ 下载 PDF ------------------------------ */

let downloading = false;

async function handleDownload() {
  if (downloading) return;
  downloading = true;

  const label = $('#dlLabel');
  const oldText = label ? label.textContent : '下载 PDF';
  const btn = $('.qm-download');
  const setText = t => { if (label) label.textContent = t; if (btn) btn.style.opacity = t === oldText ? '' : '.7'; };

  try {
    renderPreview();
    flushSave();
    setText('生成中…');
    const r = await downloadResumePDF({
      name: getResume().basicInfo?.name || '',
      onProgress: p => {
        if (p < 0.7) setText('排版中…');
        else if (p < 1) setText('写入 PDF…');
      },
    });
    setText(oldText);
    toast(r ? `已下载「${r.fileName}」· ${r.pages} 页 A4` : '已取消');
  } catch (e) {
    track('resume_export_error');
    console.error(e);
    setText(oldText);
    toast('PDF 生成失败：' + (e?.message || e));
  } finally {
    downloading = false;
  }
}

/* ------------------------------ 顶栏 ------------------------------ */

function bindHeader() {
  $('.qm-download')?.addEventListener('click', handleDownload);
  $('.qm-download')?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDownload(); } });
  enhanceHeader();
  setupHeaderControls();
  $('.portrait-link')?.addEventListener('click', flushSave);
  setupTheme();
  $('.home-button')?.addEventListener('click', () => {
    flushSave();
    location.assign('/');
  });
}

function setupTheme() {
  const actions = $('.get_list');
  if (!actions || actions.querySelector('.theme-toggle')) return;
  const item = document.createElement('li');
  item.className = 'theme-action';
  item.innerHTML = '<button type="button" class="theme-toggle"></button>';
  actions.prepend(item);
  markScope(item);
  const button = item.querySelector('button');
  const paint = () => {
    const dark = getUi().theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#15171c' : '#ffffff');
    button.title = dark ? '切换到浅色模式' : '切换到深色模式';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(dark));
    button.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13a8.6 8.6 0 0 1-9.5-9.5A8.6 8.6 0 1 0 20.5 13Z"/></svg>';
  };
  paint();
  button.addEventListener('click', () => {
    getUi().theme = getUi().theme === 'dark' ? 'light' : 'dark';
    paint();
    // 主题立即保存，切换后立刻刷新也不会丢失选择。
    try { localStorage.setItem('qmj-clone:ui', JSON.stringify(getUi())); }
    catch (error) { console.warn('theme preference save failed', error); }
    commit();
  });
}

/** 外观选项集中在简历设置中，模板和证件照保留独立入口。 */
function enhanceHeader() {
  const list = $('.set_list');
  if (!list) return;
  const template = [...list.children].find(item => /更换模板/.test(item.textContent));
  if (template) template.dataset.set='templates';
  const profile=document.createElement('li');
  profile.dataset.set='profile';
  profile.innerHTML='<a class="click_btn profile-link" href="/resume/" aria-current="page"><i aria-hidden="true"></i><b>个人简介</b></a>';
  profile.querySelector('a').addEventListener('click',event=>{event.preventDefault();flushSave();});
  const settings = document.createElement('li');
  settings.dataset.set = 'settings';
  settings.innerHTML = '<div class="set_btn"><i class="webfont webicon-page"></i><b>简历设置</b></div>';
  settings.appendChild(buildSettingsPanel());
  const portrait = document.createElement('li');
  portrait.dataset.set = 'portrait';
  portrait.innerHTML = '<a class="click_btn portrait-link" href="/portrait/" title="制作证件照"><i aria-hidden="true"></i><b>证件照</b></a>';
  list.replaceChildren(profile, settings, ...(template ? [template] : []), portrait);
  markScope(list);
  alignToolbarWithPaper();
}

function setupHeaderControls() {
  const panels = [];
  const closePanels = except => panels.forEach(({ li, button, panel }) => {
    if (li === except) return;
    li.classList.remove('show_set'); li.dataset.pinned = '';
    button.setAttribute('aria-expanded', 'false'); panel.setAttribute('aria-hidden', 'true');
  });
  $$('.set_list > li').forEach((li, index) => {
    const button = li.querySelector(':scope > .set_btn, :scope > .click_btn');
    if (!button) return;
    if (button.tagName !== 'A') {
      button.setAttribute('role', 'button'); button.tabIndex = 0;
      button.setAttribute('aria-label', button.querySelector('b')?.textContent.trim() || '设置');
      button.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); button.click(); } });
    }
    const panel = li.querySelector(':scope > .set_box');
    if (!panel) { button.addEventListener('click', () => closePanels()); return; }
    panel.id = `header-panel-${index}`;
    button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
    panels.push({ li, button, panel });
    const open = () => { closePanels(li); li.classList.add('show_set'); button.setAttribute('aria-expanded', 'true'); panel.setAttribute('aria-hidden', 'false'); };
    li.addEventListener('pointerenter', () => { if (window.matchMedia('(hover: hover)').matches) open(); });
    li.addEventListener('pointerleave', () => { if (!li.dataset.pinned && !li.contains(document.activeElement)) closePanels(); });
    button.addEventListener('click', () => {
      if (li.dataset.pinned) { closePanels(); return; }
      open(); li.dataset.pinned = 'true';
    });
    li.addEventListener('focusout', e => { if (!li.contains(e.relatedTarget) && !li.dataset.pinned) closePanels(); });
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.set_list')) closePanels(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const active = panels.find(({ li }) => li.classList.contains('show_set'));
    if (active) { closePanels(); active.button.focus({ preventScroll: true }); }
  });
}

function bindPrivacy() {
  // 隐私模式
  $('.privacy-trigger')?.addEventListener('click', () => {
    document.body.classList.toggle('privacy-masked');
    $('.privacy-trigger')?.classList.toggle('active');
  });
  const toggle = $('.edit_all .close');
  toggle?.addEventListener('click', () => { setEditorOpen(!$('.edit_all').classList.contains('edit_show')); commit(); });
  toggle?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); } });

  // 数据操作与保存状态放在侧栏底部。
  if (!document.querySelector('.qm-custom-actions')) {
    const box = document.createElement('div');
    box.className = 'qm-custom-actions';
    box.innerHTML = `<button class="el-button el-button--default el-button--mini" data-reset>恢复示例</button>
      <button class="el-button el-button--default el-button--mini" data-blank>清空</button>`;
    $('.editor-footer').appendChild(box);
    box.querySelector('[data-reset]').onclick = () => { reset('demo'); setActiveItem('jiaoyu', 0); commit({ structural: true }); };
    box.querySelector('[data-blank]').onclick = () => { reset('blank'); setActiveItem('jiaoyu', 0); commit({ structural: true }); };
  }
}

/* ------------------------------ 启动 ------------------------------ */

export function bootEditor() {
  initQuill();
  window.__tab = getUi().tab || 'basic';
  setupWorkspace();

  renderTabs();
  bindTabs();
  bindSetList();
  bindHeader();
  bindPrivacy();
  bindPhotoSlot();
  const home = $('.home-button');
  if (home) { home.classList.add('brand-home'); home.setAttribute('aria-label','返回首页'); home.title='返回首页'; home.innerHTML = '<img src="/assets/img/brand/mark-mono.svg" alt="" width="34" height="34"><span>简影</span>'; }
  const entryParams = new URL(location.href).searchParams;
  const entryTemplate = Number(entryParams.get('template'));
  if (availableTemplates(TEMPLATES).some(template=>template.id===entryTemplate)) {
    set(resume=>{applyTemplate(resume,entryTemplate);getUi().tplChosen=true;getUi().customTemplateId=null;});
    track('template_select',entryTemplate);
    toast('已应用所选模板，简历内容继续保留');
    history.replaceState(null,'',location.pathname);
  }
  if (entryParams.get('templates')==='1') {
    openTplDialog();
    history.replaceState(null,'',location.pathname);
  }
  if (entryParams.get('settings')==='1') {
    $('.set_list > li .set_btn')?.click();
    history.replaceState(null,'',location.pathname);
  }
  $$('.set_list > li').forEach(item=>{const nav=WORKSPACE_NAV.find(nav=>nav.id===item.dataset.set),icon=item.querySelector('.set_btn > i,.click_btn > i');if(icon&&nav) {icon.className='';icon.innerHTML=`<svg ${nav.id==='portrait'?'class="portrait-icon"':''} viewBox="0 0 24 24" aria-hidden="true">${nav.icon}</svg>`;}});
  renderForm($('#formHost'));
  renderPreview();

  onChange(opts => {
    queuePreview();
    if (opts && opts.structural) {
      renderTabs();
      const host = $('#formHost');
      if (host) { disposeEditors(); renderForm(host); }
    } else if (opts && opts.tabs) {
      renderTabs();
    }
  });

  onSaveState(({ status, savedAt }) => {
    const tip = $('.save_tip span');
    const badge = $('#saveStatus');
    const label = { ready: '自动保存已开启', restored: '已恢复上次编辑', saving: '保存中…', saved: '已自动保存', error: '保存失败' }[status];
    const time = savedAt ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(savedAt) : '';
    if (tip) tip.textContent = status === 'error' ? '本机保存失败，请勿关闭页面' : `${label}${time && status === 'saved' ? ` ${time}` : ''}`;
    if (badge) { badge.textContent = label; badge.dataset.state = status; badge.title = status === 'error' ? '本机存储写入失败，请先保留当前页面' : `内容保存在当前浏览器，再次打开可继续编辑${time ? `。上次保存 ${time}` : ''}`; }
  });
  if (new URL(location.href).searchParams.get('portrait') === 'applied') {
    toast('证件照已添加到简历');
    history.replaceState(null, '', location.pathname);
  }

  // 快捷键
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave(); }
  });
}
