/**
 * 编辑区表单 —— 模块化表单结构：
 *   .edit_b_list → .info_tip / ul.info_list / .jingli_layout(.jingli_nav + .jingli_main)
 *   富文本 → section.qm_editor（Quill 2 snow）
 */
import { getResume, getUi, getModule, set, commit, blankItem } from './store.js';
import { animateIn, animateDisclosure } from './motion.js';
import {PROJECT_FIELDS,PROJECT_SPACING,projectSpacing,normalizeProjectDetails,projectFieldShown,safeProjectUrl} from './project-fields.js';
import {bulletProjectContributions,setupProjectEditor} from './project-layout.js';
import {normalizeBasicFields,MAX_BASIC_FIELDS,BASIC_FIELD_NAME_LIMIT,BASIC_FIELD_VALUE_LIMIT} from './basic-fields.js';
import {
  SEX, MARRIAGE, POLITICS, DEGREE, WORK_YEARS, MODULES,
  HOT_CITIES, JOB_LIST, MONTH_OPTIONS, optionalLabel, degreeLabel,
} from './dict.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Quill 实例登记，切 tab 时统一销毁 */
export const editors = [];
let quillFactory = null;
export function setQuillFactory(fn) { quillFactory = fn; }

function makeEditor(host, html, onChange) {
  if (!quillFactory || !host) return null;
  const holder = host.querySelector('.ql-editor-slot') || host;
  holder.innerHTML = '';
  const q = quillFactory(holder, html || '');
  // Quill 2 的编辑 DOM 用 ol + data-list 表示项目符号，存储语义 HTML 以兼容各模板和 PDF。
  q.on('text-change', () => onChange(typeof q.getSemanticHTML === 'function' ? q.getSemanticHTML() : q.root.innerHTML));
  editors.push(q);
  return q;
}
export function disposeEditors() {
  while (editors.length) {
    const q = editors.pop();
    try { q.off && q.off('text-change'); } catch { }
  }
}

const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;

/* ------------------------------- 基本信息 ------------------------------- */

function basicCustomFields(input){
  const rows=normalizeBasicFields(input);
  return `<section class="basic-custom-fields" aria-label="自定义基本信息">
    <div class="basic-custom-heading"><strong>自定义信息</strong><span>${rows.length} / ${MAX_BASIC_FIELDS}</span></div>
    <p class="basic-custom-note">如：个人网站、微信、作品集。内容留空或关闭展示后不会出现在简历里。</p>
    <div class="basic-custom-list">${rows.map((item,index)=>`<div class="basic-custom-row" data-basic-index="${index}">
      <div class="basic-custom-row-heading"><span>信息 ${index+1}</span><label><input type="checkbox" data-basic-field="visible" aria-label="展示第${index+1}项自定义信息" ${item.visible?'checked':''}>展示在简历</label><button type="button" data-basic-remove="${index}" aria-label="删除第${index+1}项自定义信息" title="删除此项"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>
      <div class="basic-custom-inputs"><label><span>名称</span><input class="input" data-basic-field="keyValue" aria-label="第${index+1}项自定义名称" maxlength="${BASIC_FIELD_NAME_LIMIT}" placeholder="如：个人网站" value="${esc(item.keyValue)}"></label><label><span>内容</span><input class="input" data-basic-field="value" aria-label="第${index+1}项自定义内容" maxlength="${BASIC_FIELD_VALUE_LIMIT}" placeholder="填写对应内容" value="${esc(item.value)}"></label></div>
    </div>`).join('')}</div>
    <button type="button" class="basic-custom-add" data-basic-add ${rows.length>=MAX_BASIC_FIELDS?'disabled':''}>＋ 添加自定义信息</button>
  </section>`;
}

function formBasic(r) {
  const b = r.basicInfo;
  const yrs = WORK_YEARS.map((t, i) => opt(i - 1, t, b.workYears)).join('');
  return `<div class="edit_b_list active_full">
  <p class="info_tip"><i class="el-icon-info"></i>填写的信息会自动排版在简历上，不需要的信息可以选择不填或删除内容。</p>
  <ul class="info_list clearfix hide_more">
    <li><b>姓　名</b><input class="input" data-k="basicInfo.name" maxlength="49" placeholder="输入你的姓名" value="${esc(b.name)}"></li>
    <li><b>性　别</b><select class="input" data-k="basicInfo.sex">${SEX.map((t, i) => opt(i, t, b.sex)).join('')}</select></li>
    <li><b>出生年月</b><input class="input" type="month" data-k="basicInfo.birthday" value="${esc(b.birthday)}"></li>
    <li class="photo-settings"><b>照片设置</b>
      <div class="photo-controls">
        <div class="photo-actions">
          <button type="button" class="photo_upload" data-act="pickPhoto">${b.photo ? '更换照片' : '上传照片'}</button>
          ${b.photo ? '<button type="button" class="photo_remove" data-act="removePhoto">移除</button>' : ''}
        </div>
        <label class="el-checkbox photo_set ${b.photoShow ? 'is-checked' : ''}">
          <span class="el-checkbox__input ${b.photoShow ? 'is-checked' : ''}"><span class="el-checkbox__inner"></span><input type="checkbox" class="el-checkbox__original" data-k="basicInfo.photoShow" ${b.photoShow ? 'checked' : ''}></span>
          <span class="el-checkbox__label">展示照片</span>
        </label>
      </div>
      <input type="file" accept="image/*" id="photoFile" style="display:none">
    </li>
    <li><b>工作年限</b><select class="input" data-k="basicInfo.workYears">${yrs}</select></li>
    <li><b>联系电话</b><input class="input" data-k="basicInfo.mobile" maxlength="49" placeholder="输入联系电话" value="${esc(b.mobile)}"></li>
    <li><b>联系邮箱</b><input class="input" data-k="basicInfo.email" maxlength="49" placeholder="输入联系邮箱" value="${esc(b.email)}"></li>
    <li><b>婚姻状况</b><select class="input" data-k="basicInfo.hunyin">${MARRIAGE.map((t, i) => opt(i, t, b.hunyin)).join('')}</select></li>
    <li class="more-item"><b>身高/体重</b>
      <input class="input w60" type="number" data-k="basicInfo.height" placeholder="身高" value="${esc(b.height)}"> cm
      <input class="input w60 ml20" type="number" data-k="basicInfo.weight" placeholder="体重" value="${esc(b.weight)}"> kg
    </li>
    <li class="more-item"><b>民　族</b><input class="input" data-k="basicInfo.minzu" maxlength="49" placeholder="如：汉族" value="${esc(b.minzu)}"></li>
    <li class="more-item"><b>籍　贯</b><input class="input" data-k="basicInfo.jiguan" maxlength="49" placeholder="如：浙江杭州" value="${esc(b.jiguan)}"></li>
    <li class="more-item"><b>政治面貌</b><select class="input" data-k="basicInfo.zhengzhi">${POLITICS.map((t, i) => opt(i, t, Math.max(0, POLITICS.indexOf(optionalLabel(POLITICS, b.zhengzhi))))).join('')}</select></li>
  </ul>
  <div class="line_box mb10"><span class="btn_more" data-act="toggleMore">展开更多信息 <i class="webfont webicon-jiantoudown"></i></span></div>
  ${basicCustomFields(b.make)}
</div>`;
}

/* ------------------------------- 求职意向 ------------------------------- */

function formYixiang(r) {
  const m = getModule('yixiang');
  const d = m.data || {};
  return `<div class="edit_b_list active_full yixiang-form">
  <p class="info_tip">填写意向职位和城市，方便招聘方快速了解你的求职目标。</p>
  <ul class="info_list yixiang-fields">
    <li class="pr mb0"><label for="intention-job">求职意向</label><input id="intention-job" class="input" list="jobList" data-k="yixiang.job" placeholder="请输入意向职位" value="${esc(d.job)}">
      <datalist id="jobList">${JOB_LIST.map(j => `<option value="${esc(j)}">`).join('')}</datalist></li>
    <li class="pr mb0"><label for="intention-city">意向城市</label><input id="intention-city" class="input" list="cityList" data-k="yixiang.city" placeholder="请输入意向城市" value="${esc(d.city)}">
      <datalist id="cityList">${HOT_CITIES.map(c => `<option value="${esc(c)}">`).join('')}</datalist></li>
    <li class="mb0"><label for="intention-money">期望薪资</label><input id="intention-money" class="input" data-k="yixiang.money" placeholder="如：20-30K" value="${esc(d.money)}"></li>
    <li class="pr mb0"><label for="intention-join-time">到岗时间</label><input id="intention-join-time" class="input" data-k="yixiang.joinTime" placeholder="如：一个月内" value="${esc(d.joinTime)}"></li>
  </ul>
</div>`;
}

/* ------------------------------- 报考信息 ------------------------------- */

function formBaokao(r) {
  const m = getModule('baokao');
  const rows = m.data || [];
  return `<div class="edit_b_list active_full">
  <p class="info_tip"><i class="el-icon-info"></i>报考信息用于公务员 / 事业单位等考试类简历，会以两列表格展示。</p>
  <ul class="info_list clearfix">
    <li><b>模块标题</b><input class="input" data-k="baokao.title" placeholder="如：报考岗位" value="${esc(m.title || '')}"></li>
    <li><b>报考院校</b><input class="input" data-k="baokao.name" placeholder="如：XX大学" value="${esc(m.name || '')}"></li>
    <li><b>报考专业</b><input class="input" data-k="baokao.major" placeholder="如：计算机科学与技术" value="${esc(m.major || '')}"></li>
  </ul>
  <div class="baokao_rows">
    ${rows.map((row, i) => `<ul class="info_list clearfix" style="margin-top:10px">
      <li><b>名称</b><input class="input" data-k="baokao.row.${i}.name" value="${esc(row.name)}"></li>
      <li><b>成绩</b><input class="input" data-k="baokao.row.${i}.score" value="${esc(row.score)}"></li>
      <li style="width:auto"><button class="el-button el-button--default el-button--mini" data-del-baokao="${i}">删除</button></li>
    </ul>`).join('')}
  </div>
  <button class="el-button el-button--default el-button--mini" data-add-baokao style="margin-top:12px"><i class="el-icon-plus"></i><span>添加一行</span></button>
</div>`;
}

/* --------------------------- 时间线类模块 --------------------------- */

const TIME_LABEL = {
  jiaoyu: { list: '教育背景列表', add: '新增教育背景', f1: '学校名称', f2: '所学专业', ph1: '请输入学校名称', ph2: '请输入所学专业' },
  work: { list: '工作经历列表', add: '新增工作经历', f1: '公司名称', f2: '职位名称', ph1: '请输入公司名称', ph2: '请输入职位名称' },
  project: { list: '项目经验列表', add: '新增项目经验', f1: '项目名称', f2: '担任角色', ph1: '请输入项目名称', ph2: '请输入担任角色' },
  shixi: { list: '实习经历列表', add: '新增实习经历', f1: '公司名称', f2: '职位名称', ph1: '请输入公司名称', ph2: '请输入职位名称' },
  xiaoyuan: { list: '校园经历列表', add: '新增校园经历', f1: '组织名称', f2: '担任职务', ph1: '请输入组织名称', ph2: '请输入担任职务' },
};

function fmtYM(v) { return v ? String(v) : ''; }

function projectField(item,key,body){
  const field=PROJECT_FIELDS.find(f=>f.key===key),shown=projectFieldShown(item,key);
  return `<section class="project-field" data-project-field="${key}"><div class="project-field-heading"><strong>${field.label}</strong><label><input type="checkbox" data-project-visible="${key}" aria-label="展示${field.label}" ${shown?'checked':''}>展示在简历</label></div><div class="project-field-body" ${shown?'':'hidden'}>${body}</div></section>`;
}
function projectFields(item){
  const detail=normalizeProjectDetails(item.projectDetails);
  const textarea=key=>{const field=PROJECT_FIELDS.find(f=>f.key===key);return `<textarea class="input project-textarea" data-k="project.${key}" aria-label="${field.label}" maxlength="${field.max}" rows="3" placeholder="${field.placeholder}">${esc(detail[key])}</textarea>`;};
  const extra=['techStack','website','repository'].map(key=>{
    const field=PROJECT_FIELDS.find(f=>f.key===key),isUrl=key!=='techStack';
    return projectField(item,key,`<input class="input project-extra-input" type="${isUrl?'url':'text'}" data-k="project.${key}" aria-label="${field.label}" maxlength="${field.max}" placeholder="${field.placeholder}" value="${esc(detail[key])}">${isUrl?`<small class="project-url-error" ${!detail[key].trim()||safeProjectUrl(detail[key])?'hidden':''}>请填写 http 或 https 地址；无效链接不会展示。</small>`:''}`);
  }).join('');
  return `<div class="project-details-form"><p class="project-writing-note">留空或关闭展示的内容不会出现在简历里。建议简介 1～2 句，贡献 2～4 点，成果写实际交付或真实数据。</p>
    <details class="project-layout"><summary>内容排版 <span data-project-spacing-label>${projectSpacing(detail).label}间距</span></summary><div class="project-layout-body">
      <fieldset class="project-spacing"><legend>段落与分点间距</legend><div>${PROJECT_SPACING.map(option=>`<label><input type="radio" name="project-spacing" data-project-spacing="${option.value}" ${detail.layout.spacing===option.value?'checked':''}><span>${option.label}</span></label>`).join('')}</div></fieldset>
      <button type="button" class="project-bullet-action" data-project-bullets ${projectFieldShown(item,'content')?'':'disabled'}>将个人贡献一键分点</button><p>每个段落作为一点，保留原文和加粗；可用工具栏撤销。舒展间距会增加简历篇幅。</p><span class="project-layout-status" role="status" aria-live="polite"></span>
    </div></details>
    ${projectField(item,'summary',textarea('summary'))}
    ${projectField(item,'content','<div class="jingli_editor"><section class="qm_editor"><div class="ql-editor-slot"></div></section></div>')}
    ${projectField(item,'outcome',textarea('outcome'))}
    <details class="project-extras" ${getUi().projectExtrasOpen?'open':''}><summary>补充信息 <span>技术栈、网站与源码链接 · 可选</span></summary><div class="project-extras-body">${extra}</div></details>
    <details class="project-writing-example"><summary>查看填写示例</summary><div><p><strong>项目简介：</strong>面向团队的任务协作工具，整合任务管理、消息通知和团队空间。</p><p><strong>个人贡献：</strong>负责需求拆解与交互设计，协同研发完成实现、上线验证和用户反馈跟进。</p><p><strong>项目成果：</strong>完成核心流程交付，建立反馈记录与后续迭代机制。</p><p>以上为虚构示例，请按你的真实职责与成果填写。</p></div></details>
  </div>`;
}

function formTimeline(r, mod) {
  const L = TIME_LABEL[mod.moduleName] || TIME_LABEL.work;
  const items = mod.data || [];
  const state = getActiveItem(mod.moduleName, items.length);
  const it = items[state] || blankItem(mod.moduleName);
  const isEdu = mod.moduleName === 'jiaoyu';
  const isProject = mod.moduleName === 'project';

  const nav = items.map((x, i) => {
    const sub = [isEdu ? x.major : x.job, [fmtYM(x.timeStart), x.today ? '至今' : fmtYM(x.timeEnd)].filter(Boolean).join('-')]
      .filter(Boolean).join(' · ');
    return `<li class="${i === state ? 'active' : ''}" data-item="${i}">
      <div class="jingli_nav_main">
        <div class="jingli_nav_tit" title="${esc(x.name || '')}"><span class="jingli_nav_tit_text">${esc(x.name || '未命名')}</span></div>
        <div class="jingli_nav_sub" title="${esc(sub)}">${esc(sub)}</div>
      </div>
      <div class="jingli_nav_ops">
        <button type="button" class="jingli_nav_op_row" data-move="${i}:-1" title="前移" aria-label="前移第${i+1}条${esc(mod.moduleValue)}" ${i===0?'disabled':''}><i class="el-icon-top" aria-hidden="true"></i></button>
        <button type="button" class="jingli_nav_op_row" data-move="${i}:1" title="后移" aria-label="后移第${i+1}条${esc(mod.moduleValue)}" ${i===items.length-1?'disabled':''}><i class="el-icon-bottom" aria-hidden="true"></i></button>
      </div>
    </li>`;
  }).join('');

  return `<div class="edit_b_list active_full">
  <div class="jingli_layout">
    <div class="jingli_nav">
      <div class="jingli_nav_hd"><span>${L.list}</span></div>
      <ul class="jingli_nav_list">${nav}</ul>
      <div class="jingli_nav_add">
        <button class="el-button el-button--primary el-button--mini" data-add><i class="el-icon-plus"></i><span>${L.add}</span></button>
      </div>
    </div>
    <div class="jingli_main">
      <div class="jingli_fields">
        <ul class="info_list info_hastime clearfix">
          <li><b>${L.f1}</b><input class="input" data-k="item.name" placeholder="${L.ph1}" value="${esc(it.name)}"></li>
          <li><b>${L.f2}</b><input class="input" data-k="item.${isEdu ? 'major' : 'job'}" ${isProject?'list="projectRoleList"':''} placeholder="${isProject?'如：项目负责人 / 全栈开发 / 产品负责人':L.ph2}" value="${esc(isEdu ? it.major : it.job)}">${isProject?'<datalist id="projectRoleList"><option value="项目负责人"><option value="全栈开发"><option value="产品负责人"><option value="前端开发"><option value="后端开发"><option value="增长与运营"></datalist>':''}</li>
          ${isEdu ? `<li><b>学　历</b><select class="input w122" data-k="item.xueli">${DEGREE.map(t => opt(t, t, degreeLabel(it.xueli))).join('')}</select></li>` : ''}
          <li class="ml0 timeline-dates"><b>${isEdu ? '就读时间' : '起止时间'}</b>
            <input class="input input_time" type="month" data-k="item.timeStart" value="${esc(it.timeStart)}">
            <span> - </span>
            <input class="input input_time" type="month" data-k="item.timeEnd" value="${esc(it.timeEnd)}" ${it.today ? 'disabled' : ''}>
            <label class="el-checkbox"><span class="el-checkbox__input ${it.today ? 'is-checked' : ''}"><span class="el-checkbox__inner"></span><input type="checkbox" class="el-checkbox__original" data-k="item.today" ${it.today ? 'checked' : ''}></span><span class="el-checkbox__label">至今</span></label>
          </li>
        </ul>
      </div>
      ${isProject?projectFields(it):`<div class="jingli_editor">
        <section class="qm_editor"><div class="ql-editor-slot"></div></section>
      </div>`}
      <div class="jingli_actions">
        <button class="el-button el-button--danger el-button--mini" data-del-current>
          <i class="el-icon-delete"></i><span>${items.length > 1 ? `删除这条${esc(mod.moduleValue || '记录')}` : '清空这条记录'}</span>
        </button>
        <span class="jingli_actions_hint">${items.length > 1 ? '删除后不可恢复' : '仅一条，清空后可新增'}</span>
      </div>
    </div>
  </div>
</div>`;
}

/* ------------------------------- 技能特长 ------------------------------- */

function formJineng(r, mod) {
  const list = mod.data || [];
  return `<div class="edit_b_list active_full">
  <div class="edit_b_content mb15">
    <section class="qm_editor"><div class="ql-editor-slot"></div></section>
  </div>
  <p class="info_tip"><i class="el-icon-info"></i>也可以在下方添加技能名称，简历中会以简洁列表展示。</p>
  <ul class="skill_rows">
    ${list.map((s, i) => {
    const name = typeof s === 'string' ? s : s.name;
    return `<li class="skill_row">
        <input class="input skill_name" data-k="skill.${i}.name" placeholder="技能名称" value="${esc(name)}">
        <i class="webfont webicon-cha" data-del-skill="${i}" title="删除"></i>
      </li>`;
  }).join('')}
  </ul>
  <button class="el-button el-button--default el-button--mini" data-add-skill style="margin-top:12px"><i class="el-icon-plus"></i><span>添加技能</span></button>
</div>`;
}

/* ------------------------------- 标签类 ------------------------------- */

function formTags(r, mod) {
  return `<div class="edit_b_list active_full">
  <p class="info_tip"><i class="el-icon-info"></i>输入后按回车添加，简历中会以文字列表展示。</p>
  <div class="tag_editor">
    ${(mod.data || []).map((t, i) => `<span class="el-tag">${esc(t)}<i class="el-tag__close el-icon-close" data-del-tag="${i}"></i></span>`).join('')}
    <input class="input tag_input" id="tagInput" placeholder="添加标签，回车确认">
  </div>
</div>`;
}

/* ------------------------------- 富文本类 ------------------------------- */

function formRich(r, mod, def) {
  return `<div class="edit_b_list active_full">
  ${def.customTitle ? `<ul class="info_list clearfix" style="margin-bottom:12px"><li><b>模块标题</b><input class="input" data-k="make.moduleValue" value="${esc(mod.moduleValue)}"></li></ul>` : ''}
  <div class="edit_b_content mb15">
    <section class="qm_editor"><div class="ql-editor-slot"></div></section>
  </div>
</div>`;
}

/* ------------------------------- 入口 ------------------------------- */

const getActiveItem = (name, len) => {
  const i = getUi().activeItems?.[name];
  return Number.isInteger(i) && i >= 0 && i < len ? i : 0;
};
export function setActiveItem(name, i) { (getUi().activeItems ||= {})[name] = i; }

export function renderForm(host) {
  const r = getResume();
  const tab = (window.__tab || 'basic');
  const def = MODULES.find(m => m.name === tab);
  if (!def) { host.innerHTML = ''; return; }

  let html = '';
  let rich = null;

  if (def.kind === 'basic') html = formBasic(r);
  else if (def.kind === 'yixiang') html = formYixiang(r);
  else if (def.kind === 'baokao') html = formBaokao(r);
  else if (def.kind === 'timeline') {
    const mod = getModule(def.name);
    html = formTimeline(r, mod);
    rich = mod.data?.[getActiveItem(def.name, mod.data.length)]?.content || '';
  } else if (def.kind === 'jineng') {
    const mod = getModule(def.name);
    html = formJineng(r, mod);
    rich = mod.content || '';
  } else if (def.kind === 'tags') {
    html = formTags(r, getModule(def.name));
  } else {
    const mod = getModule(def.name);
    html = formRich(r, mod, def);
    rich = mod.content || '';
  }

  host.innerHTML = html;
  // 侧栏使用统一的标签布局，并为所有字段提供可访问的名称。
  host.querySelectorAll('input[data-k], select[data-k]').forEach(node => {
    if (node.id || node.type === 'checkbox') return;
    node.id = `field-${node.dataset.k.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const title = node.closest('li')?.querySelector('b');
    const label = title?.textContent.trim().replace(/\s+/g, '');
    if (label) node.setAttribute('aria-label', node.dataset.k === 'item.timeStart' ? '开始时间' : node.dataset.k === 'item.timeEnd' ? '结束时间' : node.dataset.k === 'basicInfo.height' ? '身高' : node.dataset.k === 'basicInfo.weight' ? '体重' : label);
  });
  // 编辑器样式以 [data-v-236d5b80] / [data-v-271b76ba] 等作用域选择器书写，动态节点需补属性
  if (window.__markScope) window.__markScope(host);
  else host.querySelectorAll('*').forEach(el => el.setAttribute('data-v-236d5b80', ''));

  const slot = host.querySelector('.ql-editor-slot');
  if (slot) {
    const editor=makeEditor(slot.parentElement, rich, value => {
      const m = getModule(def.name);
      set(rr => {
        const mm = rr.moduleData.find(x => x.moduleName === def.name);
        if (!mm) return;
        if (def.kind === 'timeline') {
          const idx = getActiveItem(def.name, mm.data.length);
          if (mm.data[idx]) mm.data[idx].content = value;
        } else {
          mm.content = value;
        }
      });
    });
    if(def.name==='project'){
      setupProjectEditor(editor);
      host.querySelector('[data-project-bullets]')?.addEventListener('click',()=>{
        const applied=bulletProjectContributions(editor);
        host.querySelector('.project-layout-status').textContent=applied?'已分点，文字和加粗已保留。':'先填写个人贡献，再进行分点。';
      });
    }
  }
  bind(host, def);
  animateIn(host);
  return def;
}

/* ------------------------------- 绑定 ------------------------------- */

/** 删除条目；只剩一条时改为清空（保留一条空白记录和操作入口） */
function delCurrent(def, index) {
  const m = getModule(def.name);
  const list = (m && m.data) || [];
  const i = Number.isInteger(index) && index >= 0 && index < list.length ? index : 0;

  if (list.length <= 1) {
    if (!confirm('这是最后一条，清空后该模块将为空。确定吗？')) return;
    set(rr => {
      const mod = rr.moduleData.find(x => x.moduleName === def.name);
      if (mod) mod.data = [blankItem(def.name)];
    });
    setActiveItem(def.name, 0);
    commit({ structural: true });
    return;
  }

  set(rr => { rr.moduleData.find(x => x.moduleName === def.name).data.splice(i, 1); });
  setActiveItem(def.name, Math.max(0, i - 1));
  commit({ structural: true });
}

function bindBasicCustomFields(host){
    const section=host.querySelector('.basic-custom-fields');
    const refreshCustomFields=focusIndex=>{
      host.querySelector('.basic-custom-fields').outerHTML=basicCustomFields(getResume().basicInfo.make);
      const section=host.querySelector('.basic-custom-fields');
      window.__markScope?.(section);
      bindBasicCustomFields(host);
      const target=section.querySelector(`[data-basic-index="${focusIndex}"] [data-basic-field="keyValue"]`)||section.querySelector('[data-basic-add]');
      target.focus({preventScroll:true});
      target.scrollIntoView({block:'nearest'});
    };
    const updateField=event=>{
      const input=event.target.closest('[data-basic-field]');
      if(!input||!section.contains(input))return;
      if((input.type==='checkbox')!==(event.type==='change'))return;
      const index=Number(input.closest('[data-basic-index]').dataset.basicIndex),key=input.dataset.basicField;
      set(rr=>{rr.basicInfo.make=normalizeBasicFields(rr.basicInfo.make);if(rr.basicInfo.make[index])rr.basicInfo.make[index][key]=input.type==='checkbox'?input.checked:input.value;});
    };
    section.addEventListener('input',updateField);
    section.addEventListener('change',updateField);
    section.addEventListener('click',event=>{
      const add=event.target.closest('[data-basic-add]'),remove=event.target.closest('[data-basic-remove]');
      if(add){
        const rows=normalizeBasicFields(getResume().basicInfo.make);
        if(rows.length>=MAX_BASIC_FIELDS)return;
        set(rr=>{rr.basicInfo.make=[...rows,{keyValue:'',value:'',visible:true}];});
        refreshCustomFields(rows.length);
      }else if(remove){
        const index=Number(remove.dataset.basicRemove);
        set(rr=>{rr.basicInfo.make=normalizeBasicFields(rr.basicInfo.make);rr.basicInfo.make.splice(index,1);});
        refreshCustomFields(Math.min(index,getResume().basicInfo.make.length-1));
      }
    });
}

function bind(host, def) {
  const r = getResume();
  if(def.kind==='basic')bindBasicCustomFields(host);

  // 通用输入
  host.querySelectorAll('[data-k]').forEach(node => {
    const k = node.dataset.k;
    const h = () => {
      const val = node.type === 'checkbox' ? node.checked
        : node.type === 'range' ? Number(node.value)
          : node.value;

      set(rr => {
        if (k.startsWith('basicInfo.')) {
          const f = k.split('.')[1];
          rr.basicInfo[f] = ['sex', 'hunyin', 'zhengzhi', 'workYears'].includes(f) ? Number(val) : val;
        } else if (k.startsWith('yixiang.')) {
          rr.moduleData.find(m => m.moduleName === 'yixiang').data[k.split('.')[1]] = val;
        } else if (k.startsWith('baokao.')) {
          const m = rr.moduleData.find(x => x.moduleName === 'baokao');
          const p = k.split('.');
          if (p[1] === 'row') m.data[+p[2]][p[3]] = val;
          else m[p[1]] = val;
        } else if (k === 'make.moduleValue') {
          rr.moduleData.find(x => x.moduleName === 'make').moduleValue = val;
        } else if (k.startsWith('project.')) {
          const m=rr.moduleData.find(x=>x.moduleName===def.name),item=m.data[getActiveItem(def.name,m.data.length)];
          if(item){item.projectDetails=normalizeProjectDetails(item.projectDetails);item.projectDetails[k.split('.')[1]]=val;}
        } else if (k.startsWith('item.')) {
          const m = rr.moduleData.find(x => x.moduleName === def.name);
          const idx = getActiveItem(def.name, m.data.length);
          if (!m.data[idx]) m.data[idx] = {};
          m.data[idx][k.split('.')[1]] = val;
        } else if (k.startsWith('skill.')) {
          const m = rr.moduleData.find(x => x.moduleName === 'jineng');
          const [, i, f] = k.split('.');
          if (typeof m.data[+i] === 'string') m.data[+i] = { name: m.data[+i], percent: 100 };
          m.data[+i][f] = f === 'percent' ? Number(val) : val;
        }
      }, { tabs: k === 'make.moduleValue' });

      if (node.type === 'range') {
        const v = node.parentElement.querySelector('.skill_val');
        if (v) v.textContent = node.value + '%';
      }
      if (k === 'item.today') {
        commit({ structural: true });
      }
      if (k === 'basicInfo.photoShow') {
        node.closest('.el-checkbox')?.classList.toggle('is-checked', !!val);
      }
      if(k==='project.website'||k==='project.repository'){
        const invalid=Boolean(String(val).trim()&&!safeProjectUrl(val));
        node.setAttribute('aria-invalid',String(invalid));
        node.closest('.project-field-body').querySelector('.project-url-error').hidden=!invalid;
      }
    };
    node.addEventListener(node.tagName === 'SELECT' || node.type === 'checkbox' || node.type === 'month' ? 'change' : 'input', h);
  });

  host.querySelectorAll('[data-project-visible]').forEach(node=>node.addEventListener('change',()=>{
    set(rr=>{const m=rr.moduleData.find(x=>x.moduleName===def.name),item=m.data[getActiveItem(def.name,m.data.length)];if(item){item.projectDetails=normalizeProjectDetails(item.projectDetails);item.projectDetails.visible[node.dataset.projectVisible]=node.checked;}});
    node.closest('.project-field').querySelector('.project-field-body').hidden=!node.checked;
    if(node.dataset.projectVisible==='content')host.querySelector('[data-project-bullets]').disabled=!node.checked;
  }));
  host.querySelectorAll('[data-project-spacing]').forEach(node=>node.addEventListener('change',()=>{
    if(!node.checked)return;
    set(rr=>{const m=rr.moduleData.find(x=>x.moduleName===def.name),item=m.data[getActiveItem(def.name,m.data.length)];if(item){item.projectDetails=normalizeProjectDetails(item.projectDetails);item.projectDetails.layout.spacing=node.dataset.projectSpacing;}});
    host.querySelector('[data-project-spacing-label]').textContent=PROJECT_SPACING.find(option=>option.value===node.dataset.projectSpacing).label+'间距';
  }));
  host.querySelector('.project-extras')?.addEventListener('toggle',event=>{getUi().projectExtrasOpen=event.currentTarget.open;commit({uiOnly:true});});

  // 展开更多
  host.querySelector('[data-act="toggleMore"]')?.addEventListener('click', e => {
    const ul = host.querySelector('.info_list');
    let on;
    animateDisclosure(ul, () => { on = ul.classList.toggle('hide_more'); });
    e.currentTarget.innerHTML = on ? '展开更多信息 <i class="webfont webicon-jiantoudown"></i>' : '收起更多信息 <i class="webfont webicon-jiantouup"></i>';
  });

  // 照片：上传走统一入口（app.js 的 pickPhoto），并支持移除
  host.querySelector('[data-act="pickPhoto"]')?.addEventListener('click', () => {
    if (window.__pickPhoto) window.__pickPhoto();
    else host.querySelector('#photoFile')?.click();
  });
  host.querySelector('[data-act="removePhoto"]')?.addEventListener('click', () => {
    set(rr => { rr.basicInfo.photo = ''; });
    commit({ structural: true });
  });
  host.querySelector('#photoFile')?.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      set(rr => { rr.basicInfo.photo = fr.result; rr.basicInfo.photoShow = true; });
      commit({ structural: true });
    };
    fr.readAsDataURL(f);
  });

  // 条目：选中 / 新增 / 删除 / 排序
  host.querySelectorAll('[data-item]').forEach(li => li.addEventListener('click', e => {
    if (e.target.closest('[data-move]') || e.target.closest('[data-del]')) return;
    setActiveItem(def.name, +li.dataset.item);
    commit({ structural: true });
  }));

  host.querySelector('[data-add]')?.addEventListener('click', () => {
    set(rr => {
      const m = rr.moduleData.find(x => x.moduleName === def.name);
      m.data.push(blankItem(def.name));
      setActiveItem(def.name, m.data.length - 1);
    });
    commit({ structural: true });
  });

  host.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    delCurrent(def, +b.dataset.del);
  }));

  // 表单底部的删除按钮（始终可见，避免找不到入口）
  host.querySelector('[data-del-current]')?.addEventListener('click', () => {
    const m = getModule(def.name);
    delCurrent(def, getActiveItem(def.name, (m.data || []).length));
  });

  host.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const [i, d] = b.dataset.move.split(':').map(Number);
    set(rr => {
      const arr = rr.moduleData.find(x => x.moduleName === def.name).data;
      const j = i + d;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    });
    setActiveItem(def.name, Math.max(0, Math.min(9, i + d)));
    commit({ structural: true });
  }));

  // 技能
  host.querySelector('[data-add-skill]')?.addEventListener('click', () => {
    set(rr => { rr.moduleData.find(x => x.moduleName === 'jineng').data.push({ name: '', percent: 80 }); });
    commit({ structural: true });
  });
  host.querySelectorAll('[data-del-skill]').forEach(b => b.addEventListener('click', () => {
    set(rr => { rr.moduleData.find(x => x.moduleName === 'jineng').data.splice(+b.dataset.delSkill, 1); });
    commit({ structural: true });
  }));

  // 标签
  host.querySelectorAll('[data-del-tag]').forEach(b => b.addEventListener('click', () => {
    set(rr => { rr.moduleData.find(x => x.moduleName === 'aihao').data.splice(+b.dataset.delTag, 1); });
    commit({ structural: true });
  }));
  const ti = host.querySelector('#tagInput');
  if (ti) {
    ti.addEventListener('keydown', e => {
      if (e.key === 'Enter' && ti.value.trim()) {
        const v = ti.value.trim();
        set(rr => {
          const m = rr.moduleData.find(x => x.moduleName === 'aihao');
          m.data = m.data || []; m.data.push(v);
        });
        commit({ structural: true });
        setTimeout(() => host.querySelector('#tagInput')?.focus(), 30);
      }
    });
  }

  host.querySelectorAll('[data-add-baokao]').forEach(b => b.addEventListener('click', () => {
    set(rr => { rr.moduleData.find(x => x.moduleName === 'baokao').data.push({ name: '', score: '' }); });
    commit({ structural: true });
  }));
  host.querySelectorAll('[data-del-baokao]').forEach(b => b.addEventListener('click', () => {
    set(rr => { rr.moduleData.find(x => x.moduleName === 'baokao').data.splice(+b.dataset.delBaokao, 1); });
    commit({ structural: true });
  }));
}
