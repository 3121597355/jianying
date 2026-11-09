import {STANDARD_TEMPLATES} from './tpl-standard.js';
export const TEMPLATES=STANDARD_TEMPLATES;
export const DEFAULT_TPL=2001;
export function getTemplate(id){return TEMPLATES.find(template=>template.id===Number(id))||TEMPLATES[0];}
export function applyTemplate(resume,id){const template=getTemplate(id);Object.assign(resume.setData,template.style,{tplId:template.id});}
export function renderByTpl(resume){return getTemplate(resume?.setData?.tplId||DEFAULT_TPL).render(resume);}
