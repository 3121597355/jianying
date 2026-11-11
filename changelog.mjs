import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const kinds=new Set(['feature','improvement','fix']);
function normalize(input){
  const entry={};
  for(const [key,max,label]of [['version',40,'版本标记'],['title',100,'更新标题'],['content',6000,'更新内容']]){
    if(typeof input?.[key]!=='string'||!input[key].trim()||input[key].length>max)throw fail(`${label}需填写 1～${max} 个字符。`);
    entry[key]=input[key].trim();
  }
  const date=input.date;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw fail('请选择有效的发布日期。');
  if(!kinds.has(input.kind))throw fail('请选择有效的更新类型。');
  return {...entry,date,kind:input.kind};
}

export function createChangelog({root,dataDir}){
  const file=path.join(dataDir,'changelog.json');
  fs.mkdirSync(dataDir,{recursive:true});
  let entries=JSON.parse(fs.readFileSync(fs.existsSync(file)?file:path.join(root,'changelog-seed.json'),'utf8')).map(item=>{
    if(!/^[a-f0-9-]{36}$/.test(item.id)||!Number.isFinite(Date.parse(item.createdAt))||!Number.isFinite(Date.parse(item.updatedAt)))throw new Error('更新日志文件格式不正确。');
    return {...normalize(item),id:item.id,createdAt:item.createdAt,updatedAt:item.updatedAt};
  });
  if(new Set(entries.map(e=>e.id)).size!==entries.length)throw new Error('更新日志编号重复。');
  function persist(next){fs.writeFileSync(file+'.tmp',JSON.stringify(next,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);entries=next;}
  if(!fs.existsSync(file))persist(entries);
  const revision=()=>crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  const list=()=>({entries:[...entries].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)),revision:revision()});
  function check(input){if(input?.revision!==revision())throw fail('更新日志已在其他窗口修改。请刷新后重试。',409);}
  return {
    list,
    create(input){check(input);if(entries.length>=100)throw fail('最多保存 100 条更新日志。');const now=new Date().toISOString();persist([...entries,{...normalize(input.entry),id:crypto.randomUUID(),createdAt:now,updatedAt:now}]);return list();},
    update(id,input){check(input);const existing=entries.find(e=>e.id===id);if(!existing)throw fail('此更新日志已不存在，请刷新。',404);const next={...normalize(input.entry),id,createdAt:existing.createdAt,updatedAt:new Date().toISOString()};persist(entries.map(e=>e.id===id?next:e));return list();},
    remove(id,input){check(input);if(!entries.some(e=>e.id===id))throw fail('此更新日志已不存在，请刷新。',404);persist(entries.filter(e=>e.id!==id));return list();},
  };
}
export {normalize as normalizeChangelog};
