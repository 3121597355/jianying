import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {once} from 'node:events';
import path from 'node:path';
import {createResumeServer} from '../serve.mjs';

const memberPassword='qa-accounts-password-2026';
const resume=()=>({setData:{tplId:1044,skin:'#1575bf',title:'个人简历',fontSize:14,lineHeight:1.6},basicInfo:{name:'PRIVATE_NAME',mobile:'13812345678',email:'PRIVATE_EMAIL@example.com',photo:''},moduleData:[{moduleName:'jineng',moduleValue:'技能',visible:true,content:'<p>JavaScript</p>',data:[]}]});

async function setup(t){
  const dataDir=await mkdtemp(path.join(import.meta.dirname,'fixture-accounts-'));
  const server=await createResumeServer({adminOptions:{analyticsTestMode:true,dataDir,initialAdmin:{username:'fixture_admin',password:'fixture-password-only-2026'}},memberOptions:{directory:path.join(dataDir,'members'),databaseUrl:''},portraitOptions:{publicMode:true,configPath:path.join(dataDir,'unused.json')}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});const target=path.resolve(dataDir);assert(target.startsWith(path.resolve(import.meta.dirname)+path.sep));await rm(target,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(route,method='GET',value,extra={})=>fetch(base+route,{method,headers:{...(value?{'Content-Type':'application/json'}:{}),...extra},...(value?{body:JSON.stringify(value)}:{})});
  const login=await request('/api/auth/login','POST',{username:'fixture_admin',password:'fixture-password-only-2026'});assert.equal(login.status,200);
  const status=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
  const admin=(route,method='GET',value)=>request(route,method,value,{Cookie:cookie,'X-Editor-Token':status.csrf});
  const register=async(name,nickname)=>{
    const response=await request('/api/member/register','POST',{username:name,password:memberPassword,nickname,acceptPrivacy:true},{Origin:base});
    const body=await response.text();
    assert.equal(response.status,201,body);
    const user=JSON.parse(body);
    return {user,cookie:response.headers.get('set-cookie').split(';')[0],token:user.csrf};
  };
  return {base,request,admin,register,dataDir};
}

test('registered account list exposes identifiers and counts without credentials or resume content',async t=>{
  const s=await setup(t);
  const quiet=await s.register('qa_quiet','沉默账户');
  const active=await s.register('qa_active','活跃账户');
  const saved=await s.request('/api/member/resumes','POST',{resume:resume(),title:'基础版本'},{Origin:s.base,Cookie:active.cookie,'X-Member-Token':active.token});
  assert.equal(saved.status,201);
  assert.equal((await s.request('/api/member/activity','POST',{type:'export'},{Origin:s.base,Cookie:active.cookie,'X-Member-Token':active.token})).status,200);

  const list=await(await s.admin('/api/admin/accounts')).json();
  assert.equal(list.total,2);
  assert.equal(list.matched,2);
  assert.equal(list.accounts.length,2);
  const payload=JSON.stringify(list);
  assert(!payload.includes(memberPassword));
  assert(!payload.includes('PRIVATE_NAME'));
  assert(!payload.includes('13812345678'));
  assert(!payload.includes('recoveryHash'));
  assert(!payload.includes('password'));
  const entry=list.accounts.find(item=>item.username==='qa_active');
  assert.ok(entry&&entry.nickname==='活跃账户');
  assert.equal(entry.resumeCount,1);
  assert.equal(entry.exports,1);
  assert.ok(entry.createdAt>0);
  assert.ok(entry.lastActiveAt>=entry.createdAt);
  assert.equal(Object.keys(entry).sort().join(','),['aiGenerations','cloudSaves','createdAt','exports','lastActiveAt','lastLoginAt','logins','nickname','resumeCount','username'].join(','));
  assert.equal(list.accounts.find(item=>item.username==='qa_quiet').resumeCount,0);

  const registration=list.registration;
  assert.equal(registration.days,30);
  assert.equal(registration.series.length,30);
  assert.equal(registration.total,2);
  assert.equal(registration.today,2);
  assert.equal(registration.last7,2);
  assert.equal(registration.last30,2);
  assert.equal(registration.withResumes,1);
  assert.equal(registration.active7,2);
  assert.equal(registration.windowTotal,2);
  assert.equal(registration.peak,2);
  assert.equal(registration.series.reduce((total,item)=>total+item.count,0),2);
  const narrow=await(await s.admin('/api/admin/accounts?days=7')).json();
  assert.equal(narrow.registration.days,7);
  assert.equal(narrow.registration.series.length,7);
  const wide=await(await s.admin('/api/admin/accounts?days=90')).json();
  assert.equal(wide.registration.series.length,90);

  const byName=await(await s.admin('/api/admin/accounts?q=qa_active')).json();
  assert.equal(byName.matched,1);
  assert.equal(byName.accounts[0].username,'qa_active');
  const byNickname=await(await s.admin('/api/admin/accounts?q='+encodeURIComponent('沉默'))).json();
  assert.equal(byNickname.matched,1);
  assert.equal(byNickname.accounts[0].username,'qa_quiet');
  const missing=await(await s.admin('/api/admin/accounts?q=nobody-here')).json();
  assert.equal(missing.matched,0);
  assert.equal(missing.accounts.length,0);
  assert.equal(missing.total,2);

  const sorted=await(await s.admin('/api/admin/accounts?sort=resumes')).json();
  assert.equal(sorted.accounts[0].username,'qa_active');

  const csv=await s.admin('/api/admin/accounts/export');
  assert.equal(csv.status,200);
  const text=await csv.text();
  assert(text.includes('qa_active')&&text.includes('活跃账户'));
  assert(!text.includes('PRIVATE_NAME')&&!text.includes('13812345678')&&!text.includes(memberPassword));
});

test('accounts endpoint requires an administrator session',async t=>{
  const s=await setup(t);
  assert.equal((await s.request('/api/admin/accounts')).status,401);
});
