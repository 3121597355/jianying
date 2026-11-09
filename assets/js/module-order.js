import { MODULES } from './dict.js';

/** 页签与预览共用排序；兼容旧存档中不包含 basic 的 moduleSort。 */
export function getModuleOrder(resume) {
  const names = [...new Set([
    'basic',
    ...(resume.moduleData || []).map(mod => mod.moduleName),
    ...MODULES.map(def => def.name),
  ])];
  const saved = Array.isArray(resume.setData?.moduleSort) ? resume.setData.moduleSort : [];
  const preferred = saved.includes('basic') ? saved : ['basic', ...saved];
  return [...new Set([...preferred, ...names])].filter(name => names.includes(name));
}
