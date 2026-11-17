import {ANALYTICS_PAGES} from './assets/js/public-pages.js';
import {sanitizeAttribution,SOURCES,CAMPAIGNS} from './assets/js/attribution.js';
import {analyticsCsvNotes} from './analytics-period.mjs';
const dayOf=time=>new Date(time+8*3600000).toISOString().slice(0,10);
const rate=(n,d)=>d?n/d:null;
const definitions=[{key:'resume',name:'简历制作',path:'/resume/',start:'resume_edit_start',finish:'resume_export',steps:[['进入编辑器','page_view'],['开始填写','resume_edit_start'],['导出 PDF','resume_export']]},{key:'portrait',name:'证件照制作',path:'/portrait/',start:'portrait_upload',finish:'portrait_export',steps:[['进入证件照','page_view'],['载入照片','portrait_upload'],['快速换底','portrait_cutout'],['下载照片','portrait_export']]}];
// Visits bridge a long editing interval with no click events. A heartbeat is
// duration evidence, never another page view or another completed task.
export function buildProductAnalytics({events=[],visits=[],range}) {
  const byVisitor=new Map();let unidentified=0;
  const add=(visitor,item)=>{if(!visitor){if(item.event&&dayOf(item.time)>=range.from&&dayOf(item.time)<=range.to)unidentified++;return;}const key=dayOf(item.time)+':'+visitor;const list=byVisitor.get(key)||[];list.push(item);byVisitor.set(key,list);};
  for(const event of events)if(Number.isFinite(event.time)&&Object.hasOwn(ANALYTICS_PAGES,event.path))add(event.visitor,{time:event.time,end:event.time,event,path:event.path});
  for(const visit of visits)if(Number.isFinite(visit.startedAt)&&Number.isFinite(visit.updatedAt)&&Object.hasOwn(ANALYTICS_PAGES,visit.path))add(visit.visitor,{time:visit.startedAt,end:visit.updatedAt,path:visit.path,visit});
  const sessions=[];
  for(const items of byVisitor.values()) {
    items.sort((a,b)=>a.time-b.time);let session;
    for(const item of items) {
      if(!session||item.time-session.last>=30*60000){session={day:dayOf(item.time),last:item.end,entry:item.path,events:[],paths:new Set(),measured:false};sessions.push(session);}
      session.last=Math.max(session.last,item.end);session.paths.add(item.path);session.measured ||= Boolean(item.visit);
      if(item.event)session.events.push(item.event);
    }
  }
  const selected=sessions.filter(s=>s.day>=range.from&&s.day<=range.to);
  for(const s of selected) {
    s.tools=definitions.map(d=>{const list=s.events.filter(e=>e.path===d.path);const start=list.find(e=>e.type===d.start);const finishes=list.filter(e=>e.type===d.finish);return {entered:s.paths.has(d.path),started:Boolean(start),completed:finishes.length>0,converted:Boolean(start&&finishes.some(e=>e.time>=start.time)),steps:d.steps.map(([,type])=>type==='page_view'?s.paths.has(d.path):list.some(e=>e.type===type))};});
    s.started=s.tools.some(t=>t.started);s.completed=s.tools.some(t=>t.completed);s.converted=s.tools.some(t=>t.converted);
    s.attribution=sanitizeAttribution(s.events.find(e=>sanitizeAttribution(e.attribution))?.attribution);
    s.device=s.events.find(e=>['desktop','mobile','tablet'].includes(e.device))?.device||'unknown';
    s.signedIn=s.events.some(e=>e.signedIn===true)?true:(s.events.some(e=>e.signedIn===false)?false:null);
  }
  const metricsFor=list=>{const started=list.filter(s=>s.started).length,completed=list.filter(s=>s.completed).length,converted=list.filter(s=>s.converted).length;return {sessions:list.length,started,completed,converted,startRate:rate(started,list.length),completionRate:rate(converted,started),exportRate:rate(completed,list.length)};};
  const selectedEvents=events.filter(e=>e.day>=range.from&&e.day<=range.to);
  const tools=definitions.map((d,index)=>{const list=selected.filter(s=>s.tools[index].entered).map(s=>s.tools[index]);const metrics=metricsFor(list);return {...metrics,key:d.key,name:d.name,path:d.path,exportCount:selectedEvents.filter(e=>e.path===d.path&&e.type===d.finish).length,exportsWithoutStart:list.filter(t=>t.completed&&!t.converted).length,steps:d.steps.map(([name],i)=>({name,value:list.filter(t=>t.steps[i]).length}))};});
  const groups=(key,label)=>{const map=new Map();for(const s of selected){const value=key(s);const list=map.get(value)||[];list.push(s);map.set(value,list);}return [...map].map(([value,list])=>({label:label(value),...metricsFor(list)})).sort((a,b)=>b.completed-a.completed||b.sessions-a.sessions);};
  const series=[];for(let time=Date.parse(range.from);time<=Date.parse(range.to);time+=86400000){const date=new Date(time).toISOString().slice(0,10);series.push({date,...metricsFor(selected.filter(s=>s.day===date))});}
  // Signed-in versus guest sessions: guests used the product without registering.
  const guestSessions=selected.filter(s=>s.signedIn===false),memberSessions=selected.filter(s=>s.signedIn===true),unmarkedSessions=selected.filter(s=>s.signedIn===null);
  const usageByAccount={guest:metricsFor(guestSessions),signedIn:metricsFor(memberSessions),unmarked:metricsFor(unmarkedSessions),guestTools:definitions.map((d,index)=>{const list=guestSessions.filter(s=>s.tools[index].entered).map(s=>s.tools[index]);return {key:d.key,name:d.name,...metricsFor(list)};})};
  const failures=[['简历导出失败','resume_export_error'],['照片换底失败','portrait_cutout_error'],['照片导出失败','portrait_export_error']].map(([name,type])=>({name,value:selectedEvents.filter(e=>e.type===type).length}));
  return {metrics:metricsFor(selected),tools,usageByAccount,series,failures,entries:groups(s=>s.entry,path=>ANALYTICS_PAGES[path]),devices:groups(s=>s.device,value=>({desktop:'电脑',mobile:'手机',tablet:'平板',unknown:'未识别设备'})[value]),channels:groups(s=>s.attribution?JSON.stringify(s.attribution):'legacy',value=>value==='legacy'?{source:'legacy',medium:'',campaign:''}:JSON.parse(value)),coverage:{measuredSessions:selected.filter(s=>s.measured).length,unidentifiedEvents:unidentified,unattributedSessions:selected.filter(s=>!s.attribution).length},notice:'匿名会话按日标识与 30 分钟空闲间隔估算，不等于真实人数。历史记录可能包含本人访问、未排除的调试或自动化流量，无法事后准确拆分。'};
}
export function productAnalyticsCsvRows(report) {
  return [['日期','访问会话','开始制作会话','完成导出会话','开始后完成会话','制作完成率'],...report.series.map(row=>[row.date,row.sessions,row.started,row.completed,row.converted,row.completionRate===null?'':(row.completionRate*100).toFixed(1)+'%']),[],['身份','会话数','开始制作会话','完成导出会话'],['未登录（未注册）',report.usageByAccount.guest.sessions,report.usageByAccount.guest.started,report.usageByAccount.guest.completed],['已登录',report.usageByAccount.signedIn.sessions,report.usageByAccount.signedIn.started,report.usageByAccount.signedIn.completed],['未标记（历史记录）',report.usageByAccount.unmarked.sessions,report.usageByAccount.unmarked.started,report.usageByAccount.unmarked.completed],[],['工具','进入会话','开始制作会话','完成导出会话','导出次数'],...report.tools.map(row=>[row.name,row.sessions,row.started,row.completed,row.exportCount]),[],['统计说明',report.notice],...analyticsCsvNotes(report.collection)];
}
export function productAcquisitionCsvRows(report) {
  return [['来源','活动','访问会话','开始制作会话','完成导出会话','开始后完成会话','开始后完成率'],...report.channels.map(row=>[SOURCES[row.label.source]||'历史来源未标记',CAMPAIGNS[row.label.campaign]||'未指定活动',row.sessions,row.started,row.completed,row.converted,row.completionRate===null?'':(row.completionRate*100).toFixed(1)+'%']),[],['统计说明',report.notice],...analyticsCsvNotes(report.collection)];
}
