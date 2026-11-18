import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {ANALYTICS_CLEAN_SINCE as boundary,analyticsScope,selectAnalyticsPeriod,analyticsWindowStart,ANALYTICS_RETENTION_DAYS} from '../analytics-period.mjs';
import {buildSummary,defaults,periodSummaryRows,exportFileName,buildWeeklyReport} from '../admin.mjs';
import {productAudience,productTrend} from '../assets/js/admin-product.js';
import {createResumeServer} from '../serve.mjs';

const range={from:'2026-11-15',to:'2026-11-17'};
const event=(offset,type='page_view',visitor='same-browser')=>({time:boundary+offset,day:'2026-11-16',type,path:'/resume/',visitor,source:'直接访问',device:'mobile',attribution:{source:'wechat',medium:'community',campaign:'campus_01'}});
const visit=(offset,end=offset+100)=>({id:'visit-'+offset,visitor:'same-browser',path:'/resume/',startedAt:boundary+offset,updatedAt:boundary+end,visibleMs:100,reason:'end',nextPath:''});
test('records before and after the historical boundary form one timeline',()=>{
  const events=[event(-200,'page_view'),event(-100,'resume_edit_start'),event(0,'page_view'),event(100,'resume_export')],visits=[visit(-300,-250),visit(-50,50),visit(200,300)];
  const before=JSON.stringify({events,visits}),summary=buildSummary({events,visits,range,settings:defaults()});
  assert.equal(summary.collection.scope,'all');assert.deepEqual(summary.collection.range,range);
  assert.equal(summary.metrics.views,2);assert.equal(summary.metrics.exports,1);
  assert.equal(summary.product.metrics.sessions,1);assert.equal(summary.product.metrics.started,1);assert.equal(summary.product.metrics.completed,1);assert.equal(summary.product.metrics.converted,1);
  assert.equal(summary.engagement.metrics.measuredVisits,3);
  assert.equal(summary.acquisition.channels[0].completed,1);assert.equal(summary.product.channels[0].completed,1);
  assert.equal(summary.product.series.length,3);
  assert.equal(summary.recent.length,2);assert.equal(summary.recent[0].type,'resume_export');
  assert.equal(JSON.stringify({events,visits}),before);
});
test('干净口径只统计分界之后的记录，并从分界当天开始算',()=>{
  const events=[event(-200,'page_view'),event(100,'page_view'),event(200,'resume_export')],visits=[visit(-300,-250),visit(300,400)];
  const summary=buildSummary({events,visits,range:{from:'2026-11-15',to:'2026-11-17'},settings:defaults(),scope:'clean'});
  assert.equal(summary.collection.scope,'clean');assert.match(summary.collection.notice,/之后的记录/);
  assert.deepEqual(summary.range,{from:'2026-11-16',to:'2026-11-17'});assert.deepEqual(summary.requestedRange,{from:'2026-11-15',to:'2026-11-17'});
  // 分界之前的事件和访问整体排除，指标只按剩下的两天算。
  assert.equal(summary.metrics.views,1);assert.equal(summary.metrics.exports,1);
  assert.equal(summary.engagement.metrics.measuredVisits,1);
  assert.equal(summary.product.previous,null);assert.equal(summary.series.length,2);
  assert.equal(selectAnalyticsPeriod({range,events,visits,scope:'clean'}).events.length,2);
  assert.equal(selectAnalyticsPeriod({range,events,visits,scope:'all'}).events.length,3);
});
test('每份导出的文件自带周期、日均和上一期对比，文件名也标明周期与口径',()=>{
  const at=(date,type='page_view',visitor='export-'+date+type)=>({time:Date.parse(date+'T10:00:00+08:00'),day:date,type,path:'/resume/',visitor,device:'desktop',attribution:null});
  const events=[at('2026-11-09'),at('2026-11-10'),at('2026-11-10','resume_export'),at('2026-11-11'),at('2026-11-11','resume_export')];
  const summary=buildSummary({events,visits:[],settings:defaults(),range:{from:'2026-11-10',to:'2026-11-11'}}),rows=periodSummaryRows(summary).map(row=>row.join('|'));
  assert.match(rows.join('\n'),/统计周期\|2026-11-10 至 2026-11-11（2 天）/);
  assert.match(rows.join('\n'),/页面访问\|2 次（日均 1\.0）/);
  assert.match(rows.join('\n'),/完成导出\|2 次（日均 1\.0）/);
  assert.match(rows.join('\n'),/上一期对比\|2026-11-08 至 2026-11-09：访问会话 \d+ → \d+，完成导出 0 → 2/);
  assert.match(periodSummaryRows({...summary,scope:'clean'}).map(row=>row.join('|')).join('\n'),/干净口径从分界当天开始，暂无可比的上期/);
  assert.equal(exportFileName('analytics',summary),'jianying-analytics-2026-11-10_2026-11-11.csv');
  assert.equal(exportFileName('engagement',{...summary,scope:'clean'}),'jianying-engagement-2026-11-10_2026-11-11-clean.csv');
});
test('周报按自然周（周一起）并排，本周未结束按日均对比，干净口径截到分界日',()=>{
  const at=(date,type='page_view',visitor='w-'+date+type)=>({time:Date.parse(date+'T10:00:00+08:00'),day:date,type,path:'/resume/',visitor,device:'desktop',attribution:null});
  const events=[at('2026-11-10'),at('2026-11-16'),at('2026-11-16','resume_export','w-same'),at('2026-11-17')];
  const report=buildWeeklyReport({events,visits:[],weeks:8,to:'2026-11-18'});
  assert.equal(report.weeks.length,8,'默认回看 8 周');
  const [now,last]=report.weeks;
  assert.deepEqual([now.current.from,now.current.to,now.current.days],['2026-11-16','2026-11-18',3]);
  assert.equal(now.inProgress,true);
  assert.equal(now.current.views,2);assert.equal(now.current.viewsPerDay,0.7);
  assert.equal(last.current.from,'2026-11-09');assert.equal(last.current.to,'2026-11-15');assert.equal(last.current.views,1);
  assert.equal(now.prevWeek.from,'2026-11-09');assert.equal(now.prevMonth.from,'2026-10-19');
  const clean=buildWeeklyReport({events,visits:[],weeks:8,to:'2026-11-18',scope:'clean'});
  assert.equal(clean.scope,'clean');assert.equal(clean.weeks.length,1,'干净口径下分界前没有整周可看');
  assert.equal(clean.weeks[0].current.from,'2026-11-16');assert.equal(clean.weeks[0].prevWeek,null);
});
test('requested dates without records keep an empty series instead of a fabricated chart',()=>{
  const summary=buildSummary({events:[event(1)],visits:[visit(2)],settings:defaults(),range:{from:'2026-11-01',to:'2026-11-02'}});
  assert.equal(summary.metrics.views,0);assert.equal(summary.product.metrics.sessions,0);assert.equal(summary.product.metrics.completionRate,null);
  assert.equal(summary.product.series.length,2);assert.equal(summary.product.series.every(row=>row.sessions===0),true);
  assert.match(productTrend(summary.product,{panelBox:(_title,_desc,body)=>body}),/还没有访问记录/);
  assert.doesNotThrow(()=>productAudience(summary,{esc:String,number:String,table:()=>'',panelBox:(_title,_desc,body)=>body,empty:()=>''}));
});
test('the overview compares the selected window with the one immediately before it',()=>{
  const at=(date,type='page_view',visitor='previous-window')=>({time:Date.parse(date+'T10:00:00+08:00'),day:date,type,path:'/resume/',visitor,device:'desktop',attribution:null});
  const events=[at('2026-11-08'),at('2026-11-08','resume_export','previous-a'),at('2026-11-09','page_view','previous-b'),at('2026-11-10','page_view','selected-a'),at('2026-11-10','resume_edit_start','selected-a')];
  const summary=buildSummary({events,visits:[],settings:defaults(),range:{from:'2026-11-10',to:'2026-11-11'}});
  assert.equal(summary.product.metrics.sessions,1);
  assert.equal(summary.product.previous.sessions,3);
  assert.equal(summary.product.previous.completed,1);
});
test('every period shares one scope and malformed times never enter a report',()=>{
  assert.equal(analyticsScope(new URLSearchParams()),'all');assert.equal(analyticsScope(new URLSearchParams('scope=history')),'all');
  assert.equal(selectAnalyticsPeriod({range,scope:'anything'}).collection.scope,'all');
  assert.equal(selectAnalyticsPeriod({range,events:[{time:'invalid'}],visits:[{startedAt:0,updatedAt:'invalid'}]}).events.length,0);
});
test('authenticated HTTP summaries and all CSV exports use the same merged period without rewriting raw history',async t=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'jy-period-test-')),raw=[event(-1000),event(-900,'resume_edit_start'),event(1000),event(1100,'resume_edit_start'),event(1200,'resume_export')].map(e=>({...e,visitor:'period-test-browser-'+(e.time<boundary?'old':'new')}));
  const rawPath=path.join(dataDir,'events.jsonl');await writeFile(rawPath,raw.map(e=>JSON.stringify(e)).join('\n')+'\n');
  const server=await createResumeServer({adminOptions:{dataDir,initialAdmin:{username:'fixture_admin',password:'fixture-period-only-2026'}},memberOptions:{databaseUrl:'',directory:path.join(dataDir,'members')},portraitOptions:{publicMode:true,configPath:path.join(dataDir,'portrait.json')}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});assert(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(dataDir,{recursive:true,force:true});});
  const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'fixture_admin',password:'fixture-period-only-2026'})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
  const get=route=>fetch(origin+route,{headers:{Cookie:cookie}}),query='from=2026-11-15&to=2026-11-17';
  const summary=await(await get('/api/admin/summary?'+query)).json();
  // 分界前后的两个浏览器都会被算进来，不再只统计其中一侧。
  assert.equal(summary.metrics.views,2);assert.equal(summary.product.metrics.completed,1);assert.equal(summary.collection.scope,'all');
  for(const route of ['/api/admin/export?view=product','/api/admin/export?view=acquisition','/api/admin/export?view=generic','/api/admin/engagement/export?']) {
    const separator=route.endsWith('?')?'':'&';
    const csv=await(await get(route+separator+query)).text();assert.match(csv,/全部记录/);assert.match(csv,/2026-11-16 03:11/);assert.match(csv,/不能直接当作真实用户量/);
  }
  const stored=(await readFile(rawPath,'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(stored,raw);
});

test('后台概览只读「所选区间 + 等长上一期」，并封顶在 90 天保留期',()=>{
  const now=Date.parse('2026-11-18T02:00:00Z');
  const iso=value=>new Date(value).toISOString();
  assert.equal(iso(analyticsWindowStart({from:'2026-11-12',to:'2026-11-18'},now)),'2026-11-05T00:00:00.000Z','7 天视图只往前读 14 天');
  assert.equal(iso(analyticsWindowStart({from:'2026-10-20',to:'2026-11-18'},now)),'2026-09-20T00:00:00.000Z','30 天视图只往前读 60 天');
  assert.equal(analyticsWindowStart({from:'2026-01-01',to:'2026-11-18'},now),now-ANALYTICS_RETENTION_DAYS*86400000,'更早的区间回落到 90 天保留期');
  assert.equal(analyticsWindowStart({from:'2026-12-30',to:'2026-12-31'},now),now,'未来日期不会把窗口推到当前时间之后');
  assert.ok(Number.isFinite(analyticsWindowStart({},now)),'参数缺失时退回 30 天口径，不抛异常');
});
