import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import createAuth from './admin-auth.cjs';
import {TEMPLATES, DEFAULT_TPL} from './assets/js/templates.js';
import {SITE_LINKS} from './assets/js/site-config.js';
import {buildEngagement} from './engagement.mjs';

const fail = (message, status=400) => Object.assign(new Error(message), {status});
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const dayOf = time => new Date(time + 8*3600000).toISOString().slice(0,10);
const catalog = TEMPLATES.map(({id,code,name,desc,thumbnail})=>({id,code,name,desc,thumbnail}));
const routes = {'/':'介绍页','/resume/':'简历编辑','/portrait/':'证件照'};
export const ACTIONS = {page_view:'页面访问',template_select:'套用模板',template_preview:'预览模板',resume_edit_start:'开始填写简历',resume_export:'导出简历 PDF',resume_export_error:'简历导出失败',portrait_upload:'载入照片',portrait_cutout:'快速换底',portrait_cutout_error:'快速换底失败',portrait_export:'导出证件照',portrait_export_error:'证件照导出失败',portrait_apply:'照片用于简历'};
const defaults = () => ({site:{title:'简影 · 开源的简历与证件照一站式工具',kicker:'开源 · 简洁 · 一站式',headline:'简历与证件照，\n一站准备好。',description:'简约模板、实时排版、照片换底。\n无需注册，打开就能用。',github:SITE_LINKS.github},templates:catalog.map((item,index)=>({...item,enabled:true,featured:index<4})),defaultTemplate:DEFAULT_TPL,analytics:{enabled:true}});
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,limit=32768){
  if(!req.headers['content-type']?.startsWith('application/json'))throw fail('请使用 JSON 请求。',415);
  let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>limit)throw fail('提交的内容过大。',413);parts.push(part);}
  try{const value=JSON.parse(Buffer.concat(parts).toString());if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw fail('提交的数据无法读取。');}
}
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.length>max)throw fail(`${label}需填写 1～${max} 个字符。`);return value.trim();}
function normalizeSettings(input){
  const site={};for(const [key,max,label] of [['title',100,'网页标题'],['kicker',60,'首页关键词'],['headline',100,'首页主标题'],['description',240,'首页介绍']])site[key]=text(input.site?.[key],max,label);
  site.github=input.site?.github?.trim()||'';
  if(site.github){let address;try{address=new URL(site.github);}catch{throw fail('GitHub 地址不正确。');}if(address.protocol!=='https:'||address.hostname!=='github.com'||address.username||address.password||address.port||address.search||address.hash||address.pathname==='/')throw fail('请填写公开的 HTTPS GitHub 主页或仓库地址。');site.github=address.href;}
  if(!Array.isArray(input.templates)||input.templates.length!==catalog.length)throw fail('模板列表不完整，请刷新后重试。');
  const seen=new Set();const templates=input.templates.map(item=>{const original=catalog.find(t=>t.id===item.id);if(!original||seen.has(item.id))throw fail('模板编号无效或重复。');seen.add(item.id);if(typeof item.enabled!=='boolean'||typeof item.featured!=='boolean')throw fail('模板开关不正确。');return {...original,name:text(item.name,40,'模板名称'),desc:text(item.desc,120,'模板说明'),enabled:item.enabled,featured:item.enabled&&item.featured};});
  if(!templates.some(t=>t.enabled))throw fail('至少保留一套可用模板。');
  if(templates.filter(t=>t.featured).length>4)throw fail('首页最多展示四套模板。');
  const defaultTemplate=Number(input.defaultTemplate);if(!templates.some(t=>t.id===defaultTemplate&&t.enabled))throw fail('默认模板必须是已启用的模板。');
  if(typeof input.analytics?.enabled!=='boolean')throw fail('统计开关不正确。');
  return {site,templates,defaultTemplate,analytics:{enabled:input.analytics.enabled}};
}
export function createAdministration({root,dataDir=path.join(root,'private','admin'),hostPort,publicOrigin=process.env.PUBLIC_ORIGIN||''}){
  fs.mkdirSync(dataDir,{recursive:true});const settingsFile=path.join(dataDir,'site-settings.json'),eventFile=path.join(dataDir,'events.jsonl'),saltFile=path.join(dataDir,'analytics-salt.txt');
  const atomic=(file,value)=>{fs.writeFileSync(file+'.tmp',value,{mode:0o600});fs.renameSync(file+'.tmp',file);};
  let settings=fs.existsSync(settingsFile)?normalizeSettings(JSON.parse(fs.readFileSync(settingsFile,'utf8'))):defaults();
  if(!fs.existsSync(settingsFile))atomic(settingsFile,JSON.stringify(settings,null,2));
  const salt=fs.existsSync(saltFile)?fs.readFileSync(saltFile,'utf8'):crypto.randomBytes(32).toString('hex');if(!fs.existsSync(saltFile))fs.writeFileSync(saltFile,salt,{mode:0o600});
  let events=fs.existsSync(eventFile)?fs.readFileSync(eventFile,'utf8').split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return []}}):[];
  const prune=()=>{const cutoff=Date.now()-90*86400000;events=events.filter(event=>event.time>=cutoff).slice(-100000);atomic(eventFile,events.map(e=>JSON.stringify(e)).join('\n')+(events.length?'\n':''));};
  prune();const auth=createAuth(dataDir);const limits=new Map();let nextPrune=Date.now()+3600000;
  const visitFile=path.join(dataDir,'visits.jsonl'),visits=new Map();let visitWrites=0,nextVisitPrune=Date.now()+3600000;
  if(fs.existsSync(visitFile))for(const line of fs.readFileSync(visitFile,'utf8').split('\n').filter(Boolean)){try{const item=JSON.parse(line);if(item.id&&item.updatedAt>=Date.now()-90*86400000)visits.set(item.id,item);}catch{}}
  function compactVisits(){const cutoff=Date.now()-90*86400000;for(const [id,visit]of visits)if(visit.updatedAt<cutoff)visits.delete(id);while(visits.size>100000)visits.delete(visits.keys().next().value);atomic(visitFile,[...visits.values()].map(v=>JSON.stringify(v)).join('\n')+(visits.size?'\n':''));visitWrites=0;nextVisitPrune=Date.now()+3600000;}
  compactVisits();
  const visitKey=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(value)?hash(salt+value).slice(0,24):'';
  const revision=()=>hash(JSON.stringify(settings));
  const result=()=>({settings,revision:revision()});
  const sessionStatus=entry=>({authenticated:true,username:entry.username,csrf:entry.csrf,setupRequired:false});
  function validateHost(req){const port=typeof hostPort==='function'?hostPort():hostPort;const origins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`,...(publicOrigin?[new URL(publicOrigin).origin]:[])];if(!origins.some(origin=>new URL(origin).host===req.headers.host))throw fail('无效的访问主机。',403);if(req.headers.origin&&!origins.includes(req.headers.origin))throw fail('不允许跨站请求。',403);if(req.headers['sec-fetch-site']==='cross-site')throw fail('不允许跨站请求。',403);}
  function budget(req){
    const now=Date.now(),limitId=hash(salt+(req.socket.remoteAddress||''));const entry=limits.get(limitId)||{count:0,until:now+60000};if(entry.until<now){entry.count=0;entry.until=now+60000;}if(++entry.count>120)throw fail('请求过于频繁，请稍后再试。',429);limits.set(limitId,entry);if(limits.size>10000){for(const [key,item]of limits)if(item.until<now)limits.delete(key);if(limits.size>10000)limits.delete(limits.keys().next().value);}
  }
  function record(req,input){
    if(!settings.analytics.enabled||auth.session(req))return;
    if(!Object.hasOwn(ACTIONS,input.type)||!Object.hasOwn(routes,input.path))throw fail('未知的统计事件。');
    budget(req);const now=Date.now(),day=dayOf(now);
    let source='直接访问';if(typeof input.referrer==='string'&&input.referrer.length<=300){try{const u=new URL(input.referrer);if(['http:','https:'].includes(u.protocol)&&u.host!==req.headers.host)source=u.hostname.slice(0,100);}catch{}}
    const visitor=typeof input.visitor==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(input.visitor)?hash(salt+day+input.visitor).slice(0,24):'';
    const event={time:now,day,type:input.type,path:input.path,visitor,source,device:['desktop','mobile','tablet'].includes(input.device)?input.device:'desktop',templateId:catalog.some(t=>t.id===Number(input.templateId))?Number(input.templateId):null};
    const id=visitKey(input.visitId);if(id)event.visitId=id;
    // Only fixed event fields are retained. Resume content, photos, raw addresses and referrer query strings never enter this store.
    events.push(event);fs.appendFileSync(eventFile,JSON.stringify(event)+'\n',{mode:0o600});if(events.length>100000||now>nextPrune){prune();nextPrune=now+3600000;}
  }
  function recordVisit(req,input){
    if(!settings.analytics.enabled||auth.session(req))return;
    const id=visitKey(input.visitId);if(!id||!Object.hasOwn(routes,input.path)||!Number.isSafeInteger(input.seq)||input.seq<1||input.seq>1000000||!Number.isSafeInteger(input.visibleMs)||input.visibleMs<0||input.visibleMs>86400000||!['checkpoint','hidden','end'].includes(input.reason))throw fail('停留统计参数不正确。');
    if(input.nextPath&&!Object.hasOwn(routes,input.nextPath))throw fail('转页目标不正确。');
    budget(req);const existing=visits.get(id);if(existing&&input.seq<=existing.seq)return;if(existing&&existing.path!==input.path)throw fail('访问路径不匹配。');
    const now=Date.now(),startedAt=existing?.startedAt||now,visitor=existing?.visitor||(visitKey(input.visitor)?hash(salt+dayOf(now)+input.visitor).slice(0,24):'');
    const item={id,visitor,path:input.path,seq:input.seq,startedAt,updatedAt:now,visibleMs:Math.max(existing?.visibleMs||0,Math.min(input.visibleMs,now-startedAt+15000)),reason:input.reason,nextPath:input.nextPath||''};
    visits.set(id,item);fs.appendFileSync(visitFile,JSON.stringify(item)+'\n',{mode:0o600});visitWrites++;if(visitWrites>=10000||visits.size>100000||now>=nextVisitPrune)compactVisits();
  }
  function period(params){let from,to;if(params.has('from')||params.has('to')){from=params.get('from');to=params.get('to');}else{const days=Number(params.get('days')||30);if(![7,30,90].includes(days))throw fail('请选择 7、30 或 90 天。');to=dayOf(Date.now());from=dayOf(Date.now()-(days-1)*86400000);}const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;if(!valid(from)||!valid(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>=90)throw fail('请选择不超过 90 天的有效日期范围。');return {from,to};}
  function summary(params){
    const range=period(params),selected=events.filter(e=>e.day>=range.from&&e.day<=range.to),views=selected.filter(e=>e.type==='page_view'),actions=selected.filter(e=>e.type!=='page_view'&&!e.type.endsWith('_error'));
    const engagement=buildEngagement({visits:[...visits.values()],events,range});
    const count=(list,key)=>Object.entries(list.reduce((out,e)=>{const value=e[key];out[value]=(out[value]||0)+1;return out;},{})).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
    const series=[];for(let time=Date.parse(range.from);time<=Date.parse(range.to);time+=86400000){const date=new Date(time).toISOString().slice(0,10),dayEvents=selected.filter(e=>e.day===date);series.push({date,views:dayEvents.filter(e=>e.type==='page_view').length,actions:dayEvents.filter(e=>e.type!=='page_view'&&!e.type.endsWith('_error')).length});}
    return {range,enabled:settings.analytics.enabled,engagement,metrics:{views:views.length,visitors:new Set(views.filter(e=>e.visitor).map(e=>e.visitor)).size,exports:actions.filter(e=>['resume_export','portrait_export'].includes(e.type)).length,actions:actions.length},series,pages:Object.entries(routes).map(([route,name])=>({route,name,views:views.filter(e=>e.path===route).length,actions:actions.filter(e=>e.path===route).length})),actions:count(actions,'type').map(item=>({...item,name:ACTIONS[item.label]})),sources:count(views,'source'),devices:count(views,'device').map(item=>({...item,name:({desktop:'电脑',mobile:'手机',tablet:'平板'})[item.label]})),templates:settings.templates.map(t=>({id:t.id,name:t.name,uses:actions.filter(e=>e.type==='template_select'&&e.templateId===t.id).length})),recent:actions.slice(-15).reverse().map(({time,type,path,templateId})=>({time,type,name:ACTIONS[type],path,templateId})),updatedAt:new Date().toISOString()};
  }
  async function handle(req,res,url){
    if(!['/api/site-config','/api/analytics/event','/api/analytics/visit','/api/analytics/summary'].includes(url.pathname)&&!url.pathname.startsWith('/api/auth/')&&!url.pathname.startsWith('/api/admin/'))return false;
    try{
      validateHost(req);
      if(url.pathname==='/api/site-config'&&req.method==='GET'){json(res,200,settings);return true;}
      if(url.pathname==='/api/analytics/event'&&req.method==='POST'){record(req,await body(req,2048));res.writeHead(204,{'Cache-Control':'no-store'}).end();return true;}
      if(url.pathname==='/api/analytics/visit'&&req.method==='POST'){recordVisit(req,await body(req,2048));res.writeHead(204,{'Cache-Control':'no-store'}).end();return true;}
      if(url.pathname==='/api/admin/engagement/export'&&req.method==='GET'){
        auth.requireSession(req);const data=summary(url.searchParams).engagement,cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
        const rows=[['按页面统计','可测访问','结束页面','平均可见秒数','中位秒数','退出会话','未完成短停留','任务完成后退出'],...data.pages.map(p=>[p.name,p.visits,p.completedPages,p.averageMs===null?'':p.averageMs/1000,p.medianMs===null?'':p.medianMs/1000,p.exits,p.quickUnfinished,p.successfulExits]),[],['小时（UTC+8）','进入会话','退出会话','该时段进入且已结束','该时段未完成短停留'],...data.hours.map(h=>[h.hour,h.entries,h.exits,h.completedEntries,h.quickUnfinished])];res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="jianying-engagement.csv"','Cache-Control':'no-store'}).end('\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n'));return true;
      }
      if(url.pathname==='/api/auth/status'&&req.method==='GET'){const current=auth.session(req);json(res,200,current?sessionStatus(current):{authenticated:false,setupRequired:auth.setupRequired()});return true;}
      if(['/api/auth/setup','/api/auth/login'].includes(url.pathname)&&req.method==='POST'){const input=await body(req,8192);const entry=url.pathname.endsWith('/setup')?await auth.setup(req,res,input):await auth.login(req,res,input);json(res,200,sessionStatus(entry));return true;}
      if(url.pathname==='/api/auth/logout'&&req.method==='POST'){auth.logout(req,res);json(res,200,{ok:true});return true;}
      if(url.pathname==='/api/auth/password'&&req.method==='POST'){await auth.changePassword(req,await body(req,8192));json(res,200,{ok:true});return true;}
      if(url.pathname==='/api/analytics/summary'&&req.method==='GET'){auth.apiKey(req);json(res,200,summary(url.searchParams));return true;}
      auth.requireSession(req);if(!['GET','HEAD'].includes(req.method))auth.requireCsrf(req);
      if(url.pathname==='/api/admin/summary'&&req.method==='GET'){json(res,200,summary(url.searchParams));return true;}
      if(url.pathname==='/api/admin/settings'&&req.method==='GET'){json(res,200,result());return true;}
      if(url.pathname==='/api/admin/settings'&&req.method==='PUT'){const input=await body(req);if(input.revision!==revision())throw fail('设置已在其他窗口更新。请刷新后重新编辑。',409);const next=normalizeSettings(input.settings);atomic(settingsFile,JSON.stringify(next,null,2));settings=next;json(res,200,result());return true;}
      if(url.pathname==='/api/admin/export'&&req.method==='GET'){const s=summary(url.searchParams),rows=[['日期','页面访问','功能操作'],...s.series.map(e=>[e.date,e.views,e.actions])];res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="jianying-analytics.csv"','Cache-Control':'no-store'}).end('\uFEFF'+rows.map(row=>row.join(',')).join('\r\n'));return true;}
      if(url.pathname==='/api/admin/backup'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="jianying-site-settings.json"','Cache-Control':'no-store'}).end(JSON.stringify({version:1,settings},null,2));return true;}
      if(url.pathname==='/api/admin/keys'&&req.method==='GET'){json(res,200,{keys:auth.keys()});return true;}
      if(url.pathname==='/api/admin/keys'&&req.method==='POST'){json(res,201,auth.createKey((await body(req,8192)).name));return true;}
      if(/^\/api\/admin\/keys\/[a-f0-9-]{36}$/.test(url.pathname)&&req.method==='DELETE'){auth.revokeKey(url.pathname.split('/').at(-1));json(res,200,{ok:true});return true;}
      throw fail('未找到此管理接口。',404);
    }catch(error){json(res,error.status||500,{error:error.status?error.message:'管理操作未完成，请稍后重试。'});return true;}
  }
  function renderHomepage(html){
    const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const site=settings.site,featured=settings.templates.filter(t=>t.enabled&&t.featured).slice(0,4);
    const gallery=featured.map(t=>`<article class="template-card"><button type="button" class="template-preview" data-preview="${t.id}" data-name="${esc(t.name)}" aria-label="预览${esc(t.name)}模板"><img loading="lazy" src="${esc(t.thumbnail)}" alt="${esc(t.name)}模板的示例简历" width="820" height="1160"><span class="preview-label">放大预览 ↗</span></button><div class="template-caption"><div><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></div><a href="/resume/?template=${t.id}" aria-label="使用${esc(t.name)}模板">↗</a></div></article>`).join('');
    return html.replace(/<title>[^<]*<\/title>/,`<title>${esc(site.title)}</title>`).replace(/<p class="hero-kicker">[\s\S]*?<\/p>/,`<p class="hero-kicker">${esc(site.kicker)}</p>`).replace(/<h1>[\s\S]*?<\/h1>/,`<h1>${site.headline.split('\n').map((line,index)=>index?`<br><span>${esc(line)}</span>`:esc(line)).join('')}</h1>`).replace(/<p class="hero-description">[\s\S]*?<\/p>/,`<p class="hero-description">${site.description.split('\n').map(esc).join('<br>')}</p>`).replace(/<div class="template-grid">[\s\S]*?<\/div><p class="section-note">[\s\S]*?<\/p>/,`<div class="template-grid">${gallery}</div><p class="section-note">${settings.templates.filter(t=>t.enabled).length}套基础版式，也可以把自己的配色、字体和间距保存为自定义模板。</p>`);
  }
  return {handle,record,summary,renderHomepage};
}
