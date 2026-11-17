import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
import {buildProductAnalytics,productAnalyticsCsvRows} from '../product-analytics.mjs';
import {excludeAnalyticsRequest} from '../analytics-policy.mjs';
import {analyticsExcluded,setAnalyticsExclusion,EXCLUSION_KEY} from '../assets/js/analytics-policy.js';
import {createResumeServer} from '../serve.mjs';
const range={from:'2026-11-16',to:'2026-11-16'},base=Date.parse('2026-11-16T09:00:00+08:00');
const event=(offset,type,path='/resume/',visitor='anonymous-a',extra={})=>({time:base+offset,day:range.from,type,path,visitor,device:'mobile',attribution:{source:'wechat',medium:'community',campaign:'campus_01'},...extra});
test('product outcomes deduplicate refreshes and exports, separate tools, and use a started cohort',()=>{
  const events=[event(0,'page_view','/'),event(100,'page_view'),event(200,'page_view'),event(300,'resume_edit_start'),event(400,'resume_export'),event(500,'resume_export'),event(600,'portrait_upload','/portrait/'),event(700,'portrait_cutout','/portrait/'),event(800,'portrait_export','/portrait/'),event(0,'resume_export','/resume/','restored'),event(0,'page_view','/','only-browse'),event(0,'resume_export_error','/resume/','failure')];
  const report=buildProductAnalytics({events,range});
  assert.deepEqual(report.metrics,{sessions:4,started:1,completed:2,converted:1,startRate:.25,completionRate:1,exportRate:.5});
  assert.equal(report.tools[0].exportCount,3);assert.equal(report.tools[0].completed,2);assert.equal(report.tools[0].exportsWithoutStart,1);assert.equal(report.tools[1].completed,1);assert.equal(report.tools[1].steps[2].value,1);
  assert.equal(report.failures[0].value,1);assert.equal(report.channels[0].sessions,4);assert.equal(report.channels[0].completed,2);
  assert.equal(report.series[0].completed,2);assert.match(JSON.stringify(productAnalyticsCsvRows(report)),/制作完成率/);
});
test('visible visit intervals keep a long editing session together, idle gaps split it',()=>{
  const events=[event(0,'page_view'),event(100,'resume_edit_start'),event(45*60000,'resume_export'),event(80*60000,'page_view')];
  const visits=[{id:'page-a',visitor:'anonymous-a',path:'/resume/',startedAt:base,updatedAt:base+46*60000,visibleMs:40*60000}];
  const report=buildProductAnalytics({events,visits,range});
  assert.equal(report.metrics.sessions,2);assert.equal(report.metrics.converted,1);assert.equal(report.coverage.measuredSessions,1);
});
test('empty and incomplete evidence is not presented as zero percent conversion or invented people',()=>{
  const events=[event(0,'page_view','/',''),event(200,'resume_export','/resume/','restored',{attribution:null}),event(1000,'resume_edit_start','/resume/','restored',{attribution:null})];
  const report=buildProductAnalytics({events,range});
  assert.equal(report.metrics.sessions,1);assert.equal(report.metrics.converted,0);assert.equal(report.coverage.unidentifiedEvents,1);assert.equal(report.coverage.unattributedSessions,1);
  const empty=buildProductAnalytics({range});assert.equal(empty.metrics.completionRate,null);assert.equal(empty.metrics.exportRate,null);
  assert.equal(buildProductAnalytics({events,range:{from:'2026-11-17',to:'2026-11-17'}}).metrics.sessions,0);
});
test('analytics excludes local, preview, known bots and explicit browser marks without claiming all humans',()=>{
  const request=(host,cookie='',agent='Mozilla/5.0')=>({headers:{host,cookie,'user-agent':agent}});
  for(const host of ['localhost:8099','127.0.0.2:18202','[::1]:8099'])assert.equal(excludeAnalyticsRequest(request(host)),true);
  assert.equal(excludeAnalyticsRequest(request('yizhijianli.top'),{environment:'preview'}),true);
  assert.equal(excludeAnalyticsRequest(request('yizhijianli.top'),{environment:'production'}),false);
  assert.equal(excludeAnalyticsRequest(request('yizhijianli.top','jianying_analytics_excluded=1')),true);
  assert.equal(excludeAnalyticsRequest(request('yizhijianli.top','','Mozilla/5.0 (compatible; Googlebot/2.1)')),true);
  assert.equal(excludeAnalyticsRequest(request('127.0.0.1:8000'),{allowLocal:true}),false);
  assert.equal(excludeAnalyticsRequest(request('127.0.0.1:8000','jianying_analytics_excluded=1'),{allowLocal:true}),true);
  const entries=new Map(),storage={getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)},document={location:{protocol:'https:'},cookie:''};
  setAnalyticsExclusion(true,{document,storage});assert.match(document.cookie,/Secure/);assert.equal(storage.getItem(EXCLUSION_KEY),'1');
  assert.equal(analyticsExcluded({hostname:'yizhijianli.top',storage}),true);
  setAnalyticsExclusion(false,{document,storage});assert.equal(analyticsExcluded({hostname:'yizhijianli.top',storage}),false);
  assert.equal(analyticsExcluded({hostname:'yizhijianli.top',search:'?adminPreview=1'}),true);
  assert.equal(analyticsExcluded({hostname:'yizhijianli.top',webdriver:true}),true);
});
test('HTTP recording guards protect both event and visit storage; regular traffic still records',async t=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'jy-analytics-fixture-'));
  const server=await createResumeServer({adminOptions:{dataDir,publicOrigin:'http://stats.example',initialAdmin:{username:'fixture_admin',password:'fixture-password-only-2026'}},memberOptions:{databaseUrl:'',directory:path.join(dataDir,'members')},portraitOptions:{publicMode:true,configPath:path.join(dataDir,'portrait.json')}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});assert(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(dataDir,{recursive:true,force:true});});
  const send=(route,input,headers={})=>new Promise((resolve,reject)=>{
    const req=http.request(origin+route,{method:'POST',headers:{'Content-Type':'application/json',...headers}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(res.statusCode===204?null:Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});req.on('error',reject);req.end(JSON.stringify(input));
  });
  const input={type:'page_view',path:'/resume/',visitor:'fixture-browser-20261116'},visit={...input,visitId:'fixture-visit-20261116',seq:1,visibleMs:0,reason:'checkpoint'};
  for(const headers of [{},{Host:'stats.example',Cookie:'jianying_analytics_excluded=1'},{Host:'stats.example','User-Agent':'HeadlessChrome'}]) {
    assert.equal((await send('/api/analytics/event',input,headers)).status,204);
    assert.equal((await send('/api/analytics/visit',visit,headers)).status,204);
  }
  const login=await send('/api/auth/login',{username:'fixture_admin',password:'fixture-password-only-2026'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const summary=async()=>await(await fetch(origin+'/api/admin/summary',{headers:{Cookie:cookie}})).json();
  assert.equal((await summary()).metrics.views,0);assert.equal((await summary()).engagement.metrics.measuredVisits,0);
  assert.equal((await send('/api/analytics/event',input,{Host:'stats.example'})).status,204);assert.equal((await send('/api/analytics/visit',visit,{Host:'stats.example'})).status,204);
  const result=await summary();assert.equal(result.metrics.views,1);assert.equal(result.engagement.metrics.measuredVisits,1);assert.equal(result.product.metrics.sessions,1);
  const csv=await fetch(origin+'/api/admin/export?view=product',{headers:{Cookie:cookie}});assert.match(await csv.text(),/"访问会话","开始制作会话","完成导出会话"/);
});
