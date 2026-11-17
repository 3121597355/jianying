import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {ANALYTICS_FILTERED_SINCE as boundary,analyticsScope,selectAnalyticsPeriod} from '../analytics-period.mjs';
import {buildSummary,defaults} from '../admin.mjs';
import {productAudience,productTrend} from '../assets/js/admin-product.js';
import {createResumeServer} from '../serve.mjs';

const range={from:'2026-11-15',to:'2026-11-17'};
const event=(offset,type='page_view',visitor='same-browser')=>({time:boundary+offset,day:'2026-11-16',type,path:'/resume/',visitor,source:'直接访问',device:'mobile',attribution:{source:'wechat',medium:'community',campaign:'campus_01'}});
const visit=(offset,end=offset+100)=>({id:'visit-'+offset,visitor:'same-browser',path:'/resume/',startedAt:boundary+offset,updatedAt:boundary+end,visibleMs:100,reason:'end',nextPath:''});
test('exact boundary separates events on the same day across every anonymous report',()=>{
  const events=[event(-200,'page_view'),event(-100,'resume_edit_start'),event(0,'page_view'),event(100,'resume_export')],visits=[visit(-300,-250),visit(-50,50),visit(200,300)];
  const before=JSON.stringify({events,visits}),current=buildSummary({events,visits,range,settings:defaults()}),history=buildSummary({events,visits,range,settings:defaults(),scope:'history'});
  assert.equal(current.collection.scope,'current');assert.equal(current.collection.range.from,'2026-11-16');assert.equal(history.collection.range.to,'2026-11-16');
  assert.equal(current.metrics.views,1);assert.equal(history.metrics.views,1);assert.equal(current.metrics.exports,1);assert.equal(history.metrics.exports,0);
  assert.equal(current.product.metrics.started,0);assert.equal(history.product.metrics.started,1);assert.equal(current.product.metrics.converted,0);
  assert.equal(current.engagement.metrics.measuredVisits,1);assert.equal(history.engagement.metrics.measuredVisits,1);
  assert.equal(current.actions.some(e=>e.label==='resume_edit_start'),false);assert.equal(history.actions.some(e=>e.label==='resume_export'),false);
  assert.equal(current.acquisition.channels[0].completed,1);assert.equal(history.acquisition.channels[0].completed,0);
  assert.equal(current.product.channels[0].completed,1);assert.equal(current.product.series.length,2);assert.equal(history.product.series.length,2);
  assert.equal(current.recent.length,1);assert.equal(current.recent[0].type,'resume_export');assert.equal(JSON.stringify({events,visits}),before);
});
test('nonoverlapping requested dates produce an explicit empty range and no fabricated chart',()=>{
  const summary=buildSummary({events:[event(1)],visits:[visit(2)],settings:defaults(),range:{from:'2026-11-14',to:'2026-11-15'}});
  assert.equal(summary.collection.range,null);assert.equal(summary.metrics.views,0);assert.equal(summary.product.metrics.sessions,0);assert.deepEqual(summary.product.series,[]);assert.equal(summary.product.metrics.completionRate,null);
  assert.match(productTrend(summary.product,{panelBox:(_title,_desc,body)=>body}),/暂无数据/);
  assert.doesNotThrow(()=>productAudience(summary,{esc:String,number:String,table:()=>'',panelBox:(_title,_desc,body)=>body,empty:()=>''}));
  const history=buildSummary({events:[event(1)],settings:defaults(),scope:'history',range:{from:'2026-11-17',to:'2026-11-18'}});assert.equal(history.collection.range,null);assert.equal(history.metrics.views,0);
});
test('the overview compares the selected window with the one immediately before it',()=>{
  const at=(date,type='page_view',visitor='previous-window')=>({time:Date.parse(date+'T10:00:00+08:00'),day:date,type,path:'/resume/',visitor,device:'desktop',attribution:null});
  const events=[at('2026-11-08'),at('2026-11-08','resume_export','previous-a'),at('2026-11-09','page_view','previous-b'),at('2026-11-10','page_view','selected-a'),at('2026-11-10','resume_edit_start','selected-a')];
  const history=buildSummary({events,visits:[],settings:defaults(),scope:'history',range:{from:'2026-11-10',to:'2026-11-11'}});
  assert.equal(history.product.metrics.sessions,1);
  assert.equal(history.product.previous.sessions,3);
  assert.equal(history.product.previous.completed,1);
  // Nothing before the reporting boundary may be presented as a comparison.
  const current=buildSummary({events,visits:[],settings:defaults(),range:{from:'2026-11-16',to:'2026-11-17'}});
  assert.equal(current.product.metrics.sessions,0);
  assert.equal(current.product.previous.sessions,0);
});
test('scope defaults to current and rejects unsupported values; malformed times do not enter a period',()=>{
  assert.equal(analyticsScope(new URLSearchParams()),'current');assert.equal(analyticsScope(new URLSearchParams('scope=history')),'history');
  assert.throws(()=>analyticsScope(new URLSearchParams('scope=all')),e=>e.status===400);
  assert.throws(()=>selectAnalyticsPeriod({range,scope:'anything'}),e=>e.status===400);
  assert.equal(selectAnalyticsPeriod({range,events:[{time:'invalid'}],visits:[{startedAt:0,updatedAt:'invalid'}]}).events.length,0);
});
test('authenticated HTTP summaries and all CSV exports use the same period without rewriting raw history',async t=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'jy-period-test-')),raw=[event(-1000),event(-900,'resume_edit_start'),event(1000),event(1100,'resume_edit_start'),event(1200,'resume_export')].map(e=>({...e,visitor:'period-test-browser-'+(e.time<boundary?'old':'new')}));
  const rawPath=path.join(dataDir,'events.jsonl');await writeFile(rawPath,raw.map(e=>JSON.stringify(e)).join('\n')+'\n');
  const server=await createResumeServer({adminOptions:{dataDir,initialAdmin:{username:'fixture_admin',password:'fixture-period-only-2026'}},memberOptions:{databaseUrl:'',directory:path.join(dataDir,'members')},portraitOptions:{publicMode:true,configPath:path.join(dataDir,'portrait.json')}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});assert(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(dataDir,{recursive:true,force:true});});
  const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'fixture_admin',password:'fixture-period-only-2026'})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
  const get=route=>fetch(origin+route,{headers:{Cookie:cookie}}),query='from=2026-11-15&to=2026-11-17';
  const current=await(await get('/api/admin/summary?'+query)).json(),history=await(await get('/api/admin/summary?'+query+'&scope=history')).json();
  assert.equal(current.metrics.views,1);assert.equal(current.product.metrics.completed,1);assert.equal(history.metrics.views,1);assert.equal(history.product.metrics.completed,0);
  for(const route of ['/api/admin/export?view=product','/api/admin/export?view=acquisition','/api/admin/export?view=generic','/api/admin/engagement/export?']) {
    const separator=route.endsWith('?')?'':'&';
    const csv=await(await get(route+separator+query+'&scope=history')).text();assert.match(csv,/历史数据/);assert.match(csv,/2026-11-16 03:11/);assert.match(csv,/包含无法准确剥离/);
    const currentCsv=await(await get(route+separator+query)).text();assert.match(currentCsv,/新周期/);
  }
  assert.equal((await get('/api/admin/summary?'+query+'&scope=all')).status,400);
  assert.equal((await get('/api/admin/export?'+query+'&scope=all')).status,400);
  assert.equal((await get('/api/admin/engagement/export?'+query+'&scope=all')).status,400);
  const stored=(await readFile(rawPath,'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(stored,raw);
});
