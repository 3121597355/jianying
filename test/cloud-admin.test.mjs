import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import {Pool} from 'pg';
import {createCloudAdministration} from '../cloud-administration.mjs';

const databaseUrl=process.env.CLOUD_TEST_DATABASE_URL?(()=>{const url=new URL(process.env.CLOUD_TEST_DATABASE_URL);url.searchParams.set('sslmode','verify-full');return url.href;})():null;
async function fixture(t,serverless=false){
  const schema='qa_jy_'+crypto.randomBytes(7).toString('hex'),root=path.resolve(import.meta.dirname,'..');let server;
  const allowedOrigins=[];
  const options={root,databaseUrl,setupCode:'QA-SETUP-ONLY',schema,hostPort:()=>serverless?undefined:server?.address()?.port,allowedOrigins};
  const app=await createCloudAdministration(options);
  server=http.createServer(async(req,res)=>{if(!await app.handle(req,res,new URL(req.url,'http://127.0.0.1')))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  if(serverless)allowedOrigins.push(`http://127.0.0.1:${server.address().port}`);
  const request=(route,method='GET',value,headers={})=>fetch(`http://127.0.0.1:${server.address().port}`+route,{method,headers:{...(value?{'Content-Type':'application/json'}:{}),...headers},...(value?{body:JSON.stringify(value)}:{})});
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await app.close();assert(/^qa_jy_[a-f0-9]{14}$/.test(schema));const pool=new Pool({connectionString:databaseUrl});try{await pool.query(`DROP SCHEMA "${schema}" CASCADE`);}finally{await pool.end();}});
  const response=await request('/api/auth/setup','POST',{code:'QA-SETUP-ONLY',username:'qa_admin',password:'qa-password-only-2026'});assert.equal(response.status,200);const auth=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
  const admin=(route,method='GET',value)=>request(route,method,value,{Cookie:cookie,'X-Editor-Token':auth.csrf});
  return {app,options,request,admin,cookie,auth};
}
test('cloud database persists administrator sessions and serializes concurrent settings and log writes',{skip:!databaseUrl},async t=>{
  const f=await fixture(t);assert.equal((await f.request('/api/admin/changelog')).status,401);
  const settings=await(await f.admin('/api/admin/settings')).json(),a=structuredClone(settings),b=structuredClone(settings);a.settings.site.headline='A';b.settings.site.headline='B';const writes=await Promise.all([f.admin('/api/admin/settings','PUT',a),f.admin('/api/admin/settings','PUT',b)]);assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);
  const original=await(await f.admin('/api/admin/changelog')).json(),entry={version:'qa-1',date:'2026-11-11',kind:'fix',title:'QA update',content:'A test update'};
  const createdResponse=await f.admin('/api/admin/changelog','POST',{revision:original.revision,entry});assert.equal(createdResponse.status,201);const created=await createdResponse.json(),log=created.entries.find(e=>e.version==='qa-1');assert(log);
  let other;const second=await createCloudAdministration({...f.options,hostPort:()=>other?.address()?.port});t.after(()=>second.close());other=http.createServer(async(req,res)=>{if(!await second.handle(req,res,new URL(req.url,'http://127.0.0.1')))res.writeHead(404).end();});await new Promise(resolve=>other.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{other.close(resolve);other.closeAllConnections();}));
  const reread=await fetch(`http://127.0.0.1:${other.address().port}/api/admin/changelog`,{headers:{Cookie:f.cookie}});assert.equal(reread.status,200);assert.deepEqual(await reread.json(),created);
  assert.equal((await f.admin('/api/admin/changelog/'+log.id,'PUT',{revision:created.revision,entry:{...entry,title:'Updated'}})).status,200);assert.equal((await f.admin('/api/admin/changelog/'+log.id,'DELETE',{revision:created.revision})).status,409);
  const current=await(await f.admin('/api/admin/changelog')).json();assert.equal((await f.admin('/api/admin/changelog/'+log.id,'DELETE',{revision:current.revision})).status,200);
});
test('serverless administration accepts its configured origin without a listening port',{skip:!databaseUrl},async t=>{
  const f=await fixture(t,true);
  assert.equal((await f.request('/api/auth/status')).status,200);
  assert.equal((await f.request('/api/admin/changelog')).status,401);
  assert.equal((await f.admin('/api/admin/changelog')).status,200);
  assert.equal((await f.request('/api/auth/status','GET',undefined,{Origin:'https://attacker.example'})).status,403);
});
test('cloud visits deduplicate heartbeats, preserve privacy, and enforce authentication and recording controls',{skip:!databaseUrl},async t=>{
  const f=await fixture(t),visit={visitId:'qa-visit-id-20261111',visitor:'qa-visitor-id-20261111',path:'/resume/',seq:1,visibleMs:0,reason:'checkpoint',privateText:'NEVER_STORE'};
  for(const value of [visit,{...visit,seq:2,visibleMs:4567,reason:'end'},{...visit,seq:1,visibleMs:9999}])assert.equal((await f.request('/api/analytics/visit','POST',value)).status,204);
  const event={type:'resume_export',path:'/resume/',visitor:visit.visitor,visitId:visit.visitId};assert.equal((await f.request('/api/analytics/event','POST',event)).status,204);
  const summary=await(await f.admin('/api/admin/summary')).json();assert.equal(summary.metrics.exports,1);assert.equal(summary.engagement.metrics.measuredVisits,1);assert.equal(summary.engagement.metrics.averageVisibleMs,4567);
  assert.equal((await f.request('/api/admin/settings','PUT',{})).status,401);assert.equal((await f.request('/api/admin/settings','PUT',{}, {Cookie:f.cookie})).status,403);
  assert.equal((await f.request('/api/analytics/event','POST',event,{Origin:'https://attacker.example'})).status,403);assert.equal((await f.admin('/api/analytics/visit','POST',{...visit,visitId:'qa-admin-id-20261111'})).status,204);assert.equal((await(await f.admin('/api/admin/summary')).json()).engagement.metrics.measuredVisits,1);
  const settings=await(await f.admin('/api/admin/settings')).json();settings.settings.analytics.enabled=false;assert.equal((await f.admin('/api/admin/settings','PUT',settings)).status,200);assert.equal((await f.request('/api/analytics/event','POST',event)).status,204);assert.equal((await(await f.admin('/api/admin/summary')).json()).metrics.exports,1);
  const key=await(await f.admin('/api/admin/keys','POST',{name:'QA only'})).json();assert.equal((await f.request('/api/analytics/summary','GET',undefined,{Authorization:'Bearer '+key.token})).status,200);assert(!JSON.stringify(await(await f.admin('/api/admin/keys')).json()).includes(key.token));assert.equal((await f.admin('/api/admin/keys/'+key.key.id,'DELETE')).status,200);assert.equal((await f.request('/api/analytics/summary','GET',undefined,{Authorization:'Bearer '+key.token})).status,401);
  const pool=new Pool({connectionString:databaseUrl});try{const records=await pool.query(`SELECT data FROM "${f.options.schema}"."jy_visits"`);const serialized=JSON.stringify(records.rows);for(const value of [visit.visitId,visit.visitor,'NEVER_STORE','127.0.0.1'])assert(!serialized.includes(value));}finally{await pool.end();}
});
