import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {once} from 'node:events';
import path from 'node:path';
import {createResumeServer} from '../serve.mjs';

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
