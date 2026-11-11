import {STANDARD_TEMPLATES} from './tpl-standard.js';
import {EXTENDED_TEMPLATES} from './tpl-extended.js';
import {configureTemplates,siteSettings} from './site-settings.js';
export const TEMPLATES=configureTemplates([...STANDARD_TEMPLATES,...EXTENDED_TEMPLATES]);
export const DEFAULT_TPL=siteSettings?.defaultTemplate||2001;
export function getTemplate(id){return TEMPLATES.find(template=>template.id===Number(id))||TEMPLATES[0];}
export function applyTemplate(resume,id){const template=getTemplate(id);Object.assign(resume.setData,template.style,{tplId:template.id});}
export function renderByTpl(resume){return getTemplate(resume?.setData?.tplId||DEFAULT_TPL).render(resume);}
