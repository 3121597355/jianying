import {TEMPLATES,DEFAULT_TPL} from './templates.js';
const KEY='qmj-clone:templates',LIMIT=20;
const BASES=new Set(TEMPLATES.map(template=>template.id));
export function captureTemplateStyle(data){
  const numeric=(key,min,max,fallback)=>Math.max(min,Math.min(max,Number(data?.[key])||fallback));
  return {tplId:BASES.has(Number(data?.tplId))?Number(data.tplId):DEFAULT_TPL,
    skin:/^#[\da-f]{6}$/i.test(data?.skin||'')?data.skin.toLowerCase():'#167ac6',
    font:numeric('font',1,9,1),fontSize:numeric('fontSize',10,18,13),
    mm:numeric('mm',5,50,16),pp:numeric('pp',10,80,40),lineHeight:numeric('lineHeight',1.3,2.2,1.6)};
}
export function templateMatches(template,data){return JSON.stringify(template.style)===JSON.stringify(captureTemplateStyle(data));}
export function listPersonalTemplates(storage=localStorage){
  try{const saved=JSON.parse(storage.getItem(KEY)||'[]');if(!Array.isArray(saved))return[];
    return saved.filter(t=>typeof t?.id==='string'&&typeof t?.name==='string'&&t?.style).slice(0,LIMIT).map(t=>({id:t.id.slice(0,80),name:t.name.trim().slice(0,24)||'我的模板',style:captureTemplateStyle(t.style),updatedAt:Number(t.updatedAt)||0}));
  }catch{return[];}
}
export function savePersonalTemplate(name,data,{id=null,storage=localStorage}={}){
  const clean=String(name).trim();if(!clean||clean.length>24)throw new Error('请填写1–24字的模板名称。');
  const templates=listPersonalTemplates(storage),existing=templates.find(t=>t.id===id);
  if(!existing&&templates.length>=LIMIT)throw new Error('最多保存20个模板，可先移除不再使用的模板。');
  const template={id:existing?.id||crypto.randomUUID(),name:clean,style:captureTemplateStyle(data),updatedAt:Date.now()};
  storage.setItem(KEY,JSON.stringify([template,...templates.filter(t=>t.id!==template.id)]));return template;
}
export function removePersonalTemplate(id,storage=localStorage){storage.setItem(KEY,JSON.stringify(listPersonalTemplates(storage).filter(t=>t.id!==id)));}
