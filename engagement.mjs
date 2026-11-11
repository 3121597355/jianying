const dayOf=time=>new Date(time+8*3600000).toISOString().slice(0,10);
const hourOf=time=>new Date(time+8*3600000).getUTCHours();
const names={'/':'介绍页','/resume/':'简历编辑','/portrait/':'证件照'};
const success=new Set(['resume_export','portrait_export','portrait_apply']);
const average=values=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;
const median=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return Math.round(sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2);};
const isClosed=(visit,now)=>visit.reason==='end'||now-visit.updatedAt>=30*60000;

export function buildEngagement({visits,events,range,now=Date.now()}){
  const all=visits.filter(v=>v.startedAt&&v.updatedAt&&Number.isFinite(v.visibleMs));
  const measured=all.filter(v=>dayOf(v.startedAt)>=range.from&&dayOf(v.startedAt)<=range.to);
  const eventMap=new Map();for(const event of events){if(!event.visitId)continue;const list=eventMap.get(event.visitId)||[];list.push(event);eventMap.set(event.visitId,list);}
  const grouped=new Map();for(const visit of all){const key=visit.visitor||visit.id;const list=grouped.get(key)||[];list.push(visit);grouped.set(key,list);}
  const sessions=[];
  for(const list of grouped.values()){
    list.sort((a,b)=>a.startedAt-b.startedAt);let session;
    for(const visit of list){if(!session||visit.startedAt-session.last.updatedAt>30*60000){session={first:visit,last:visit,visits:[]};sessions.push(session);}session.visits.push(visit);if(visit.updatedAt>=session.last.updatedAt)session.last=visit;}
  }
  const inRange=sessions.filter(s=>dayOf(s.first.startedAt)>=range.from&&dayOf(s.first.startedAt)<=range.to);
  const completed=inRange.filter(s=>now-s.last.updatedAt>=30*60000||(s.last.reason==='end'&&!s.last.nextPath&&now-s.last.updatedAt>=30000));
  for(const session of completed){session.visibleMs=session.visits.reduce((sum,v)=>sum+v.visibleMs,0);session.completedTask=session.visits.some(v=>(eventMap.get(v.id)||[]).some(e=>success.has(e.type)));session.quickUnfinished=session.visibleMs<30000&&!session.completedTask;session.inferred=session.last.reason!=='end'||Boolean(session.last.nextPath);}
  const closed=measured.filter(v=>isClosed(v,now));
  const buckets=[{label:'少于 10 秒',from:0,to:10000},{label:'10–30 秒',from:10000,to:30000},{label:'30–60 秒',from:30000,to:60000},{label:'1–3 分钟',from:60000,to:180000},{label:'3–10 分钟',from:180000,to:600000},{label:'10 分钟以上',from:600000,to:Infinity}].map(b=>({label:b.label,value:completed.filter(s=>s.visibleMs>=b.from&&s.visibleMs<b.to).length}));
  const pages=Object.entries(names).map(([path,name])=>{const entries=measured.filter(v=>v.path===path),ended=closed.filter(v=>v.path===path),exits=completed.filter(s=>s.last.path===path);return {path,name,visits:entries.length,completedPages:ended.length,averageMs:average(ended.map(v=>v.visibleMs)),medianMs:median(ended.map(v=>v.visibleMs)),exits:exits.length,quickUnfinished:exits.filter(s=>s.quickUnfinished).length,successfulExits:exits.filter(s=>s.completedTask).length};});
  const hours=Array.from({length:24},(_,hour)=>{const entries=inRange.filter(s=>hourOf(s.first.startedAt)===hour),endedEntries=completed.filter(s=>hourOf(s.first.startedAt)===hour),exits=completed.filter(s=>hourOf(s.last.updatedAt)===hour);return {hour,entries:entries.length,exits:exits.length,completedEntries:endedEntries.length,quickUnfinished:endedEntries.filter(s=>s.quickUnfinished).length,quickRate:endedEntries.length?endedEntries.filter(s=>s.quickUnfinished).length/endedEntries.length:null};});
  const paths=[{path:'/resume/',name:'简历制作',steps:[['进入编辑器',null],['开始填写','resume_edit_start'],['导出 PDF','resume_export']]},{path:'/portrait/',name:'证件照制作',steps:[['进入证件照',null],['载入照片','portrait_upload'],['快速换底','portrait_cutout'],['下载照片','portrait_export']]}].map(p=>{const entries=measured.filter(v=>v.path===p.path);return {name:p.name,visits:entries.length,steps:p.steps.map(([name,type])=>({name,value:type?entries.filter(v=>(eventMap.get(v.id)||[]).some(e=>e.type===type)).length:entries.length}))};});
  const failures=events.filter(e=>e.day>=range.from&&e.day<=range.to&&['resume_export_error','portrait_cutout_error','portrait_export_error'].includes(e.type));
  const diagnostics=[];
  if(completed.length<30)diagnostics.push({title:'先积累真实样本',detail:`目前有 ${completed.length} 个可测结束会话。先观察短停留率和任务完成情况；30 个会话只用于初步筛查，不代表结论已可靠。`});
  if(failures.length)diagnostics.push({title:'先排查处理与导出失败',detail:`所选日期有 ${failures.length} 次处理或导出失败。优先改善错误提示、重试和等待反馈，再判断离开是否与这些环节有关。`});
  const home=pages[0];if(home.exits>=10&&home.quickUnfinished/home.exits>=.4)diagnostics.push({title:'试验更直接的首屏入口',detail:'介绍页短停留且未完成的会话占比较高。可试验让“开始编辑”和“制作证件照”更突出、提供一键示例；用开始操作率检验，而不是只看停留变长。'});
  for(const item of paths){if(item.visits>=10){const first=item.steps[1].value,last=item.steps.at(-1).value;if(first/item.visits<.3)diagnostics.push({title:item.name+'：降低第一步门槛',detail:'进入工具后开始操作的比例偏低。试验首个字段或上传入口的引导，并突出已有示例；草稿恢复和直接导出可能跳过该步骤，应一起核对。'});else if(last/item.visits<.2)diagnostics.push({title:item.name+'：检查完成与下载环节',detail:'已有操作，但成功导出覆盖较低。核对下载入口、等待反馈、重试，以及是否有人只是试用；这些数据提示排查方向，不能单独证明原因。'});}}
  const successes=completed.filter(s=>s.completedTask).length;if(successes)diagnostics.push({title:'完成后离开是正常结果',detail:`${successes} 个结束会话已完成导出或将照片用于简历。保留直接下载和自动保存，不增加强制弹窗来延长停留。`});
  if(!diagnostics.length)diagnostics.push({title:'按任务完成情况判断体验',detail:'先比较进入、开始操作、成功导出的覆盖情况，再针对具体环节做小范围试验。停留较久可能是认真填写，也可能是卡住，单靠时长无法判断。'});
  return {metrics:{measuredVisits:measured.length,closedPages:closed.length,completedSessions:completed.length,pendingSessions:inRange.length-completed.length,averageVisibleMs:average(closed.map(v=>v.visibleMs)),medianVisibleMs:median(closed.map(v=>v.visibleMs)),quickUnfinished:completed.filter(s=>s.quickUnfinished).length,quickRate:completed.length?completed.filter(s=>s.quickUnfinished).length/completed.length:null,successfulExits:successes,inferredExits:completed.filter(s=>s.inferred).length},buckets,pages,hours,paths,failures:failures.length,diagnostics:diagnostics.slice(0,5)};
}
