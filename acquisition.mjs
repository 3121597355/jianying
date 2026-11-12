import {sanitizeAttribution,SOURCES,CAMPAIGNS} from './assets/js/attribution.js';
const STARTS = new Set(['resume_edit_start','portrait_upload']);
const FINISHES = new Set(['resume_export','portrait_export']);
export function buildAcquisition(events) {
  const sessions = [], current = new Map();
  for (const event of [...events].sort((a,b)=>a.time-b.time)) {
    if(!event.visitor)continue;
    const attribution=sanitizeAttribution(event.attribution), channel=attribution?JSON.stringify(attribution):'legacy';
    const key=event.day+':'+event.visitor;
    let session=current.get(key);
    if(!session || event.time-session.last>=30*60000 || session.channel!==channel) {
      session={channel,attribution,last:event.time,started:false,completed:false,failures:0};sessions.push(session);current.set(key,session);
    }
    session.last=event.time;
    session.started ||= STARTS.has(event.type);
    session.completed ||= FINISHES.has(event.type);
    if(event.type.endsWith('_error'))session.failures++;
  }
  const groups=new Map();
  for(const session of sessions) {
    if(!session.attribution)continue;
    let row=groups.get(session.channel);
    if(!row){row={...session.attribution,sessions:0,started:0,completed:0,failures:0};groups.set(session.channel,row);}
    row.sessions++;row.started+=Number(session.started);row.completed+=Number(session.completed);row.failures+=session.failures;
  }
  return {channels:[...groups.values()].sort((a,b)=>b.completed-a.completed||b.sessions-a.sessions),unattributedSessions:sessions.filter(s=>!s.attribution).length};
}
export function acquisitionCsvRows(data) {
  return [['来源','媒介','活动标签','访问会话','开始制作','完成导出','失败操作'],...data.channels.map(row=>[SOURCES[row.source],row.medium,CAMPAIGNS[row.campaign]||'未指定活动',row.sessions,row.started,row.completed,row.failures]),[],['未归因的历史会话',data.unattributedSessions]];
}
