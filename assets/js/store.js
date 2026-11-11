import { DEFAULT_TPL } from './templates.js';
/** 浏览器草稿状态与自动保存。 */

import { normalizeEditorUi } from './editor-state.js';

const KEY = 'qmj-clone:resume';
const KEY_UI = 'qmj-clone:ui';

export const moduleTpl = () => ([
  { moduleName: 'yixiang', moduleValue: '求职意向', visible: true, data: { job: '', city: '', money: '', joinTime: '' } },
  { moduleName: 'baokao', moduleValue: '报考信息', visible: false, title: '', name: '', major: '', data: [] },
  { moduleName: 'jiaoyu', moduleValue: '教育背景', visible: true, data: [blankTimeline('school')] },
  { moduleName: 'work', moduleValue: '工作经历', visible: true, data: [blankTimeline('company')] },
  { moduleName: 'project', moduleValue: '项目经验', visible: false, data: [blankTimeline('project')] },
  { moduleName: 'shixi', moduleValue: '实习经历', visible: false, data: [blankTimeline('company')] },
  { moduleName: 'xiaoyuan', moduleValue: '校园经历', visible: false, data: [blankTimeline('org')] },
  { moduleName: 'jineng', moduleValue: '技能特长', visible: true, content: '', data: [] },
  { moduleName: 'zhengshu', moduleValue: '荣誉证书', visible: false, content: '', data: [] },
  { moduleName: 'pingjia', moduleValue: '自我评价', visible: true, content: '' },
  { moduleName: 'aihao', moduleValue: '兴趣爱好', visible: false, content: '', data: [] },
  { moduleName: 'make', moduleValue: '自定义模块', visible: false, content: '' },
]);

function blankTimeline(kind) {
  const base = { timeStart: '', timeEnd: '', today: false, content: '' };
  switch (kind) {
    case 'school': return { ...base, name: '', major: '', xueli: '' };
    case 'company': return { ...base, name: '', job: '' };
    case 'project': return { ...base, name: '', job: '' };
    case 'org': return { ...base, name: '', job: '' };
    default: return base;
  }
}

export function createDefault() {
  return {
    setData: {
      skin: '#284967', tplId: DEFAULT_TPL, coverId: '', coverShow: 0,
      mm: 24, pp: 52, font: 1, fontSize: 14, lineHeight: 1.7,
      title: '个人简历', slogan: 'PERSONAL PROFILE', visitType: 1, visitPass: '',
      language: 'cn', zpType: 0, moduleSort: [],
    },
    coverData: { name: '', job: '', school: '', mobile: '', email: '' },
    zijianData: { visible: 0, content: '' },
    basicInfo: {
      name: '', sex: 0, birthday: '', isAge: true, email: '', mobile: '',
      workYears: -1, photo: '', photoShow: true, minzu: '', zhengzhi: '',
      jiguan: '', hunyin: 0, height: '', weight: '', inShort: '', make: [],
    },
    moduleData: moduleTpl(),
  };
}

/** 演示数据：一份完整的、可直接改写的样例 */
export function createDemo() {
  const d = createDefault();
  // 演示数据控制在一页内（mm=24 → 内容约 1151px < 1160px），开箱即是干净的 1 页
  d.setData.mm = 16;
  d.setData.lineHeight = 1.6;
  d.basicInfo = {
    ...d.basicInfo,
    name: '张三', sex: 1, birthday: '1996-05', mobile: '13800138000',
    email: 'zhangsan@example.com', workYears: 5, minzu: '汉族', photoShow: true,
    zhengzhi: '群众', jiguan: '浙江杭州', hunyin: 1, height: '178', weight: '70',
  };
  d.zijianData.visible = 0;

  const m = n => d.moduleData.find(x => x.moduleName === n);
  m('yixiang').data = { job: '前端开发工程师', city: '杭州', money: '20-30K', joinTime: '一个月内' };
  m('jiaoyu').data = [
    { timeStart: '2018-09', timeEnd: '2021-06', today: false, name: '浙江大学', major: '软件工程', xueli: '硕士', content: '<ul><li>研究方向：前端性能优化</li></ul>' },
    { timeStart: '2014-09', timeEnd: '2018-06', today: false, name: '浙江大学', major: '计算机科学与技术', xueli: '本科', content: '<ul><li>GPA 3.8/4.0，专业前 5%</li><li>连续三年获校一等奖学金</li></ul>' },
  ];
  m('work').data = [
    { timeStart: '2023-09', timeEnd: '', today: true, name: '阿里巴巴', job: '高级前端工程师', content: '<ul><li>负责交易链路前端架构设计与性能治理</li><li>推动微前端方案落地，研发效率提升 30%</li></ul>' },
  ];
  m('project').visible = true;
  m('project').data = [
    { timeStart: '2022-03', timeEnd: '2022-09', today: false, name: '电商中台可视化搭建平台', job: '前端负责人', content: '<ul><li>基于 Vue3 + 低代码引擎实现拖拽搭建</li><li>支撑 200+ 运营页面，人效提升 5 倍</li></ul>' },
  ];
  m('jineng').content = '<ul><li>精通 Vue / React 及周边生态，熟悉工程化体系</li></ul>';
  m('jineng').data = [
    { name: 'Vue3', percent: 92 }, { name: 'TypeScript', percent: 88 },
    { name: '性能优化', percent: 85 },
  ];
  m('zhengshu').visible = true;
  m('zhengshu').content = '<ul><li>英语六级（CET-6 552 分）</li><li>全国计算机等级考试三级</li></ul>';
  m('pingjia').content = '<p>5 年前端开发经验，擅长复杂业务架构与性能优化，具备良好的工程化思维与团队协作能力。</p>';
  m('aihao').visible = true;
  m('aihao').data = ['摄影', '马拉松', '开源'];
  return d;
}

const savedDraft = load();
let state = savedDraft || { resumeData: createDefault(), ui: normalizeEditorUi() };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const resumeData = JSON.parse(raw);
    const ui = normalizeEditorUi(JSON.parse(localStorage.getItem(KEY_UI) || '{}'));
    // 已有草稿也更新旧默认副标题，用户自行填写的副标题继续保留。
    if (resumeData.setData?.slogan === '努力超越自己，每天进步一点点') resumeData.setData.slogan = 'PERSONAL PROFILE';
    // 一次性迁移：用户从未主动切换过模板时，采用当前默认版式（旧存档里是上一版默认值）
    if (!ui.tplChosen || ![2001,2002,2003,2004].includes(Number(resumeData.setData?.tplId))) {
      resumeData.setData.tplId = DEFAULT_TPL;
      if (!resumeData.setData.title) resumeData.setData.title = '个人简历';
    }
    return { resumeData, ui };
  } catch { return null; }
}

let saveTimer = null;
let savePending = false;
let resumePending = !savedDraft;
let saveState = { status: savedDraft ? 'restored' : 'ready', savedAt: state.ui.savedAt || 0 };
const subscribers = {};

function reportSave(status, savedAt = saveState.savedAt) {
  saveState = { status, savedAt };
  subscribers.saveState?.(saveState);
}

export function flushSave() {
  clearTimeout(saveTimer);
  try {
    const savedAt = Date.now();
    // UI-only changes must not serialize a large photo or rewrite the resume.
    if (resumePending || !savePending) localStorage.setItem(KEY, JSON.stringify(state.resumeData));
    localStorage.setItem(KEY_UI, JSON.stringify({ ...state.ui, savedAt }));
    state.ui.savedAt = savedAt;
    savePending = false;
    resumePending = false;
    reportSave('saved', savedAt);
    return true;
  } catch (error) {
    savePending = true;
    reportSave('error');
    console.warn('save failed', error);
    return false;
  }
}

function scheduleSave({uiOnly=false}={}) {
  clearTimeout(saveTimer);
  resumePending ||= !uiOnly;
  savePending = true;
  reportSave('saving');
  // Sidebar transitions take 480ms; write their small preference after settling.
  saveTimer = setTimeout(flushSave, uiOnly ? 550 : 300);
}

// 刷新、关闭和切到后台时同步写入，避免最后几个字留在防抖计时器里。
const saveBeforeLeaving = () => { if (savePending) flushSave(); };
window.addEventListener('pagehide', saveBeforeLeaving);
window.addEventListener('beforeunload', saveBeforeLeaving);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveBeforeLeaving(); });

export function onChange(fn) { subscribers.change = fn; }
export function onSaveState(fn) { subscribers.saveState = fn; fn(saveState); }

export function getResume() { return state.resumeData; }
export function getUi() { return state.ui; }

/** Save changes; uiOnly skips resume rendering and persists only preferences. */
export function commit(opts = {}) {
  scheduleSave(opts);
  if (!opts.uiOnly) subscribers.change?.(opts);
}

export function set(patchFn, opts = {}) {
  patchFn(state.resumeData, state.ui);
  commit(opts);
}

export function reset(kind = 'demo') {
  state.resumeData = kind === 'blank' ? createDefault() : createDemo();
  commit();
}

export function getModule(name) {
  return state.resumeData.moduleData.find(m => m.moduleName === name);
}

export function blankItem(moduleName) {
  if (['jiaoyu'].includes(moduleName)) return blankTimeline('school');
  if (['work', 'shixi'].includes(moduleName)) return blankTimeline('company');
  if (['project'].includes(moduleName)) return blankTimeline('project');
  if (['xiaoyuan'].includes(moduleName)) return blankTimeline('org');
  return blankTimeline('company');
}

export { blankTimeline };
