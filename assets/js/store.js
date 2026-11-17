import { DEFAULT_TPL } from './templates.js';
/** 浏览器草稿状态与自动保存。 */
import {TEMPLATES} from './templates.js';

import { normalizeEditorUi } from './editor-state.js';
import {createStarterResume} from './template-choice.js';
import {initializeEditorDraft} from './editor-start.js';

const KEY = 'qmj-clone:resume';
const KEY_UI = 'qmj-clone:ui';

import {createDefault,moduleTpl,blankTimeline} from './resume-defaults.js';
export {createDefault,moduleTpl} from './resume-defaults.js';

/** The gallery, first visit and restore action share one editable fictional example. */
export function createDemo() { return createStarterResume(); }

const savedDraft = load();
const entryExample=typeof location==='object'?new URLSearchParams(location.search).get('example'):null;
const initialDraft=initializeEditorDraft(savedDraft,{example:entryExample});
let state = {resumeData:initialDraft.resumeData,ui:initialDraft.ui};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const resumeData = JSON.parse(raw);
    const ui = normalizeEditorUi(JSON.parse(localStorage.getItem(KEY_UI) || '{}'));
    // 已有草稿也更新旧默认副标题，用户自行填写的副标题继续保留。
    if (resumeData.setData?.slogan === '努力超越自己，每天进步一点点') resumeData.setData.slogan = 'PERSONAL PROFILE';
    // 一次性迁移：用户从未主动切换过模板时，采用当前默认版式（旧存档里是上一版默认值）
    if (!ui.tplChosen || !TEMPLATES.some(template=>template.id===Number(resumeData.setData?.tplId))) {
      resumeData.setData.tplId = DEFAULT_TPL;
      if (!resumeData.setData.title) resumeData.setData.title = '个人简历';
    }
    return { resumeData, ui };
  } catch { return null; }
}

let saveTimer = null;
let savePending = false;
let resumePending = !savedDraft||initialDraft.seeded;
let saveState = { status: savedDraft&&!initialDraft.seeded ? 'restored' : 'ready', savedAt: state.ui.savedAt || 0 };
const subscribers = {};
const resumeSubscribers = new Set();

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
export function subscribeResume(fn) { resumeSubscribers.add(fn); return () => resumeSubscribers.delete(fn); }
export function replaceResume(data) {
  state.resumeData = structuredClone(data);
  state.ui.tplChosen = true;
  state.ui.customTemplateId = null;
  state.ui.startBlank = false;
  commit({structural:true,tabs:true});
}

export function getResume() { return state.resumeData; }
export function getUi() { return state.ui; }

/** Save changes; uiOnly skips resume rendering and persists only preferences. */
export function commit(opts = {}) {
  scheduleSave(opts);
  if (!opts.uiOnly) subscribers.change?.(opts);
  if (!opts.uiOnly) for (const listener of resumeSubscribers) listener(state.resumeData);
}

export function set(patchFn, opts = {}) {
  patchFn(state.resumeData, state.ui);
  commit(opts);
}

export function reset(kind = 'demo') {
  const templateId=state.resumeData.setData.tplId;
  state.resumeData = kind === 'blank' ? createDefault() : createStarterResume(templateId);
  if(kind==='blank')state.resumeData.setData.tplId=templateId;
  state.ui.startBlank=kind==='blank';
  state.ui.tab='basic';window.__tab='basic';
  state.ui.tplChosen=true;state.ui.customTemplateId=null;
  commit({structural:true,tabs:true});
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

// Persist the starter even if a first-time visitor only looks and then leaves.
if(initialDraft.seeded)scheduleSave();
