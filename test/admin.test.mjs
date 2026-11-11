import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {once} from 'node:events';
import path from 'node:path';
import {createResumeServer} from '../serve.mjs';
import {createChangelog} from '../changelog.mjs';
import {changelogView} from '../assets/js/admin-changelog.js';

async function setup(t){
  const dataDir=await mkdtemp(path.join(import.meta.dirname,'fixture-admin-'));
  const server=await createResumeServer({adminOptions:{dataDir},portraitOptions:{publicMode:true,configPath:path.join(dataDir,'unused.json')}});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});const target=path.resolve(dataDir);assert(target.startsWith(path.resolve(import.meta.dirname)+path.sep));await rm(target,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(route,method='GET',value,extra={})=>fetch(base+route,{method,headers:{...(value?{'Content-Type':'application/json'}:{}),...extra},...(value?{body:JSON.stringify(value)}:{})});
  const code=(await readFile(path.join(dataDir,'管理员首次设置码.txt'),'utf8')).match(/[A-F0-9]{6}(?:-[A-F0-9]{6}){5}/)[0];
  const created=await request('/api/auth/setup','POST',{username:'fixture_admin',password:'fixture-password-only-2026',code});assert.equal(created.status,200);const status=await created.json(),cookie=created.headers.get('set-cookie').split(';')[0];
  const admin=(route,method='GET',value,extra={})=>request(route,method,value,{Cookie:cookie,'X-Editor-Token':status.csrf,...extra});
  return {base,request,admin,dataDir,cookie,status};
}
test('changelog CRUD persists entries, protects concurrent changes, and escapes rendered text',async t=>{
  const s=await setup(t);assert.equal((await s.request('/api/admin/changelog')).status,401);
  for(const route of ['/changelog-seed.json','/changelog.mjs','/private/admin/changelog.json'])assert.equal((await s.request(route)).status,404);
  const original=await(await s.admin('/api/admin/changelog')).json();assert(original.entries.length>=1);
  const entry={version:'fixture-2.1',date:'2026-11-11',kind:'fix',title:'测试修复',content:'第一行\n<script>alert(1)</script>',privateField:'must-not-store'};
  assert.equal((await s.request('/api/admin/changelog','POST',{revision:original.revision,entry},{Cookie:s.cookie})).status,403);
  assert.equal((await s.admin('/api/admin/changelog','POST',{revision:original.revision,entry},{Origin:'https://attacker.example'})).status,403);
  const createdResponse=await s.admin('/api/admin/changelog','POST',{revision:original.revision,entry});assert.equal(createdResponse.status,201);const created=await createdResponse.json(),item=created.entries.find(e=>e.version===entry.version);assert(item);assert.equal(item.privateField,undefined);
  assert.equal((await s.admin('/api/admin/changelog','POST',{revision:original.revision,entry})).status,409);
  const rendered=changelogView(created);assert(!rendered.includes('<script>'));assert(rendered.includes('&lt;script&gt;'));
  const updated=await(await s.admin('/api/admin/changelog/'+item.id,'PUT',{revision:created.revision,entry:{...entry,title:'修改后的日志'}})).json();assert.equal(updated.entries.find(e=>e.id===item.id).title,'修改后的日志');
  const reopened=createChangelog({root:path.resolve(import.meta.dirname,'..'),dataDir:s.dataDir}).list();assert.deepEqual(reopened,updated);
  assert.equal((await s.admin('/api/admin/changelog/'+item.id,'DELETE',{revision:created.revision})).status,409);
  const removedResponse=await s.admin('/api/admin/changelog/'+item.id,'DELETE',{revision:updated.revision});assert.equal(removedResponse.status,200);const removed=await removedResponse.json();assert.equal(removed.entries.length,original.entries.length);assert(!removed.entries.some(e=>e.id===item.id));
  assert.equal((await s.admin('/api/admin/changelog/'+item.id,'DELETE',{revision:removed.revision})).status,404);
});
test('changelog rejects malformed dates, empty content, oversized text and unknown categories',async t=>{
  const s=await setup(t),original=await(await s.admin('/api/admin/changelog')).json();
  const entry={version:'test',date:'2026-11-11',kind:'feature',title:'测试',content:'一项更新'};
  for(const change of [{date:'2026-02-30'},{content:' '},{content:'x'.repeat(6001)},{kind:'toString'},{title:[]},{version:''}])assert.equal((await s.admin('/api/admin/changelog','POST',{revision:original.revision,entry:{...entry,...change}})).status,400);
  assert.deepEqual(await(await s.admin('/api/admin/changelog')).json(),original);
});
test('admin authentication, CSRF, origin checks and private files protect managed settings',async t=>{
  const s=await setup(t);
  assert.equal((await s.request('/api/admin/settings')).status,401);
  assert.equal((await s.request('/api/admin/summary')).status,401);
  assert.equal((await s.request('/admin.html')).status,200);
  assert.match((await s.request('/admin.html')).headers.get('content-security-policy'),/frame-ancestors 'none'/);
  for(const route of ['/admin.mjs','/admin-auth.cjs','/private/admin/admin-auth.json','/private/admin/events.jsonl','/private/admin/管理员首次设置码.txt'])assert.equal((await s.request(route)).status,404);
  const loaded=await (await s.admin('/api/admin/settings')).json();
  assert.equal((await s.request('/api/admin/settings','PUT',loaded,{Cookie:s.cookie})).status,403);
  assert.equal((await s.admin('/api/admin/settings','PUT',loaded,{Origin:'https://attacker.example'})).status,403);
  assert.equal((await s.admin('/api/auth/logout','POST')).status,200);
  assert.equal((await s.admin('/api/admin/settings')).status,401);
});
test('site and template changes persist, reject conflicts and keep at least one usable default',async t=>{
  const s=await setup(t);const original=await(await s.admin('/api/admin/settings')).json();const next=structuredClone(original);next.settings.site.headline='后台保存的标题';next.settings.site.github='https://github.com/3121597355/jianying';next.settings.templates.reverse();next.settings.templates[0].name='修改后的模板名称';next.settings.templates[0].enabled=true;next.settings.defaultTemplate=next.settings.templates[0].id;
  const saved=await s.admin('/api/admin/settings','PUT',next);assert.equal(saved.status,200);const current=await saved.json();assert.notEqual(current.revision,original.revision);
  const publicSettings=await(await s.request('/api/site-config')).json();assert.equal(publicSettings.site.headline,'后台保存的标题');assert.equal(publicSettings.templates[0].name,'修改后的模板名称');assert.equal(publicSettings.defaultTemplate,next.settings.defaultTemplate);
  assert.equal(JSON.parse(await readFile(path.join(s.dataDir,'site-settings.json'),'utf8')).site.headline,'后台保存的标题');
  assert.equal((await s.admin('/api/admin/settings','PUT',original)).status,409);
  const invalid=structuredClone(current);invalid.settings.templates.forEach(item=>item.enabled=false);assert.equal((await s.admin('/api/admin/settings','PUT',invalid)).status,400);
  const invalidLink=structuredClone(current);invalidLink.settings.site.github='javascript:alert(1)';assert.equal((await s.admin('/api/admin/settings','PUT',invalidLink)).status,400);
  const backup=await s.admin('/api/admin/backup');assert.equal(backup.status,200);assert(!JSON.stringify(await backup.json()).includes('fixture-password'));
});
test('anonymous statistics retain only allowlisted fields, exclude admins, and honor disabled recording',async t=>{
  const s=await setup(t);const event={type:'page_view',path:'/resume/',visitor:'fixture-browser-20261110',device:'mobile',referrer:'https://example.com/?contact=private',name:'private-name',photo:'private-photo',resume:'private-resume'};
  assert.equal((await s.request('/api/analytics/event','POST',event)).status,204);
  assert.equal((await s.admin('/api/analytics/event','POST',event)).status,204);
  assert.equal((await s.request('/api/analytics/event','POST',{...event,type:'resume_export'})).status,204);
  assert.equal((await s.request('/api/analytics/event','POST',{...event,path:'/private/resume'})).status,400);
  const raw=await readFile(path.join(s.dataDir,'events.jsonl'),'utf8');for(const value of ['private-name','private-photo','private-resume','private','fixture-browser-20261110','127.0.0.1'])assert(!raw.includes(value));
  const stats=await(await s.admin('/api/admin/summary?days=7')).json();assert.equal(stats.metrics.views,1);assert.equal(stats.metrics.visitors,1);assert.equal(stats.metrics.exports,1);assert.equal(stats.sources[0].label,'example.com');assert.equal(stats.series.length,7);
  assert.equal((await s.admin('/api/admin/summary?from=2026-02-30&to=2026-03-01')).status,400);
  const config=await(await s.admin('/api/admin/settings')).json();config.settings.analytics.enabled=false;assert.equal((await s.admin('/api/admin/settings','PUT',config)).status,200);assert.equal((await s.request('/api/analytics/event','POST',event)).status,204);assert.equal((await(await s.admin('/api/admin/summary')).json()).metrics.views,1);
  const csv=await s.admin('/api/admin/export?days=7');assert.match(csv.headers.get('content-type'),/text\/csv/);assert.match(await csv.text(),/日期,页面访问,功能操作/);
});
test('API keys read only anonymous statistics and password changes invalidate other sessions',async t=>{
  const s=await setup(t);const second=await s.request('/api/auth/login','POST',{username:'fixture_admin',password:'fixture-password-only-2026'});assert.equal(second.status,200);const secondCookie=second.headers.get('set-cookie').split(';')[0];
  const keyResponse=await s.admin('/api/admin/keys','POST',{name:'fixture-only'});assert.equal(keyResponse.status,201);const {key,token}=await keyResponse.json();
  assert.equal((await s.request('/api/analytics/summary','GET',undefined,{Authorization:'Bearer '+token})).status,200);
  assert.equal((await s.request('/api/admin/settings','GET',undefined,{Authorization:'Bearer '+token})).status,401);
  assert(!JSON.stringify(await(await s.admin('/api/admin/keys')).json()).includes(token));
  assert.equal((await s.admin('/api/admin/keys/'+key.id,'DELETE')).status,200);assert.equal((await s.request('/api/analytics/summary','GET',undefined,{Authorization:'Bearer '+token})).status,401);
  assert.equal((await s.admin('/api/auth/password','POST',{currentPassword:'fixture-password-only-2026',password:'new-fixture-password-2026'})).status,200);
  assert.equal((await s.request('/api/admin/settings','GET',undefined,{Cookie:secondCookie})).status,401);assert.equal((await s.admin('/api/admin/settings')).status,200);
});
test('visit snapshots deduplicate unordered checkpoints and retain no raw visitor or submitted private fields',async t=>{
  const s=await setup(t),visitId='fixture-page-visit-20261111',visitor='fixture-browser-20261111';
  const send=value=>s.request('/api/analytics/visit','POST',{visitId,visitor,path:'/resume/',seq:1,visibleMs:0,reason:'checkpoint',...value});
  assert.equal((await send({})).status,204);assert.equal((await send({seq:2,visibleMs:3456,reason:'end',privateText:'do-not-store'})).status,204);assert.equal((await send({seq:1,visibleMs:9999})).status,204);
  const result=await(await s.admin('/api/admin/summary')).json();assert.equal(result.engagement.metrics.measuredVisits,1);assert.equal(result.engagement.metrics.averageVisibleMs,3456);
  const raw=await readFile(path.join(s.dataDir,'visits.jsonl'),'utf8');for(const secret of [visitId,visitor,'do-not-store','127.0.0.1'])assert(!raw.includes(secret));assert.equal(raw.trim().split('\n').length,2);
  assert.equal((await s.admin('/api/analytics/visit','POST',{visitId:'admin-visit-20261111',path:'/',seq:1,visibleMs:0,reason:'checkpoint'})).status,204);assert.equal((await(await s.admin('/api/admin/summary')).json()).engagement.metrics.measuredVisits,1);
  assert.equal((await send({seq:3,visibleMs:-10})).status,400);
  const cross=await s.request('/api/analytics/visit','POST',{visitId,path:'/',seq:1,visibleMs:0,reason:'checkpoint'},{Origin:'https://attacker.example'});assert.equal(cross.status,403);
  assert.equal((await s.request('/private/admin/visits.jsonl')).status,404);assert.equal((await s.request('/api/admin/engagement/export')).status,401);const csv=await s.admin('/api/admin/engagement/export');assert.equal(csv.status,200);assert.match(await csv.text(),/平均可见秒数/);
  assert.equal((await s.request('/api/analytics/event','POST',{type:'resume_export_error',path:'/resume/',visitId,visitor})).status,204);const failure=await(await s.admin('/api/admin/summary')).json();assert.equal(failure.metrics.actions,0);assert.equal(failure.engagement.failures,1);
  const config=await(await s.admin('/api/admin/settings')).json();config.settings.analytics.enabled=false;assert.equal((await s.admin('/api/admin/settings','PUT',config)).status,200);assert.equal((await send({seq:3,visibleMs:5000})).status,204);assert.equal((await(await s.admin('/api/admin/summary')).json()).engagement.metrics.averageVisibleMs,3456);
});
