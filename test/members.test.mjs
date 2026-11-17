import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createMembers} from '../members.mjs';
import {normalizeResume} from '../resume-document.mjs';
import {applyModelResult} from '../job-tailor.mjs';
import {createDefault} from '../assets/js/resume-defaults.js';
import {createProjectDetails} from '../assets/js/project-fields.js';
const root=path.resolve(import.meta.dirname,'..');
const password='qa-member-password-2026';
const resume=()=>({setData:{tplId:1044,skin:'#1575bf',title:'个人简历',fontSize:14,lineHeight:1.6},basicInfo:{name:'PRIVATE_NAME',mobile:'13812345678',email:'PRIVATE_EMAIL@example.com',photo:''},moduleData:[{moduleName:'yixiang',moduleValue:'求职意向',visible:true,data:{job:'软件开发'}},{moduleName:'project',moduleValue:'项目经历',visible:true,data:[{name:'简历工具',job:'前端开发',timeStart:'2026-09',timeEnd:'2026-11',content:'<p>使用 JavaScript 和 CSS 开发简历编辑器，实现移动端适配与导出。</p>'}]},{moduleName:'jineng',moduleValue:'技能',visible:true,content:'<p>JavaScript、CSS</p>',data:[]}]});
async function fixture(t,options={}){
  const directory=await fs.mkdtemp(path.join(root,'test','fixture-members-'));let server;
  const app=await createMembers({root,directory,databaseUrl:'',hostPort:()=>server?.address()?.port,config:{enabled:false,dailyLimit:3},...options});
  server=http.createServer(async(req,res)=>{if(!await app.handle(req,res,new URL(req.url,'http://127.0.0.1')))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(route,method='GET',value,headers={})=>fetch(base+'/api/member/'+route,{method,headers:{Origin:base,...(value!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(value!==undefined?{body:JSON.stringify(value)}:{})});
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await app.close();const target=path.resolve(directory);assert(target.startsWith(path.join(root,'test','fixture-members-')));await fs.rm(target,{recursive:true,force:true});});
  const register=async name=>{const response=await request('register','POST',{username:name,password,nickname:'测试用户',acceptPrivacy:true});assert.equal(response.status,201);const user=await response.json();const cookie=response.headers.get('set-cookie').split(';')[0];const headers={Cookie:cookie,'X-Member-Token':user.csrf};return {user,cookie,headers,request:(route,method='GET',input)=>request(route,method,input,headers)};};
  return {app,request,register,directory,base};
}

test('registration is persistent, hashes credentials, validates origin and separates administrator/user sessions',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('register','POST',{username:'qa_one',password,acceptPrivacy:true},{Origin:'https://attacker.example'})).status,403);
  const a=await f.register('qa_one');assert(a.user.recoveryCode.startsWith('YZ-'));assert(!JSON.stringify(a.user).includes(password));
  assert.equal((await f.request('resumes')).status,401);
  assert.equal((await f.request('resumes','GET',undefined,{Cookie:'jianying_admin='+crypto.randomBytes(32).toString('hex')})).status,401);
  assert.equal((await f.request('resumes','POST',{resume:resume()},{Cookie:a.cookie})).status,403);
  const saved=await a.request('resumes','POST',{resume:resume(),title:'基础版本'});assert.equal(saved.status,201);
  const store=await fs.readFile(path.join(f.directory,'accounts.json'),'utf8');assert(!store.includes(password));assert(!store.includes(a.user.recoveryCode));assert(!store.includes(a.cookie.split('=')[1]));
  const other=await createMembers({root,directory:f.directory,databaseUrl:'',hostPort:Number(new URL(f.base).port),config:{enabled:false,dailyLimit:3}});t.after(()=>other.close());
  assert.equal((await other.summary()).totalAccounts,1);assert.equal((await other.summary()).cloudResumes,1);
  assert.equal((await f.request('login','POST',{username:'qa_one',password:'incorrect-password'})).status,401);
});
test('cloud versions are isolated by owner, sanitize rich text and reject concurrent stale saves',async t=>{
  const f=await fixture(t),a=await f.register('qa_owner'),b=await f.register('qa_other');
  const input=resume();input.moduleData[1].data[0].content+='<img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">bad</a>';
  const created=await(await a.request('resumes','POST',{title:'基础',resume:input})).json();assert(!JSON.stringify(created.resume).includes('onerror'));assert(!JSON.stringify(created.resume).includes('javascript:'));assert(!JSON.stringify(created.resume).includes('<script>'));
  assert.equal((await b.request('resumes/'+created.id)).status,404);assert.equal((await b.request('resumes/'+created.id,'DELETE',{version:1})).status,404);
  const writes=await Promise.all([a.request('resumes/'+created.id,'PUT',{version:1,resume:resume()}),a.request('resumes/'+created.id,'PUT',{version:1,resume:resume()})]);assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);
  assert.equal((await a.request('resumes/'+created.id,'DELETE',{version:1})).status,409);
  const second=await(await a.request('resumes','POST',{title:'岗位版本',kind:'job',resume:resume()})).json();assert.notEqual(second.id,created.id);assert.equal((await(await a.request('resumes')).json()).resumes.length,2);
});
test('blank and copied resumes retain independent contents when edited and reloaded',async t=>{
  const f=await fixture(t),a=await f.register('qa_multi');
  const first=createDefault(),second=createDefault();
  first.basicInfo.name='版本甲';first.moduleData.find(m=>m.moduleName==='jiaoyu').data[0].name='甲校';
  assert.equal(second.basicInfo.name,'');assert.equal(second.moduleData.find(m=>m.moduleName==='jiaoyu').data[0].name,'');
  const one=await(await a.request('resumes','POST',{title:'开发岗位',resume:first})).json();
  const two=await(await a.request('resumes','POST',{title:'产品岗位',resume:second})).json();
  one.resume.basicInfo.name='甲更新';
  assert.equal((await a.request('resumes/'+one.id,'PUT',{version:one.version,resume:one.resume})).status,200);
  const untouched=await(await a.request('resumes/'+two.id)).json();assert.equal(untouched.resume.basicInfo.name,'');assert.equal(untouched.version,1);
  const source=await(await a.request('resumes/'+one.id)).json();
  const copy=await(await a.request('resumes','POST',{title:'开发岗位副本',resume:source.resume})).json();
  copy.resume.basicInfo.name='副本更新';copy.resume.setData.skin='#123456';
  assert.equal((await a.request('resumes/'+copy.id,'PUT',{version:copy.version,resume:copy.resume})).status,200);
  const original=await(await a.request('resumes/'+one.id)).json();assert.equal(original.resume.basicInfo.name,'甲更新');assert.equal(original.resume.setData.skin,source.resume.setData.skin);
  assert.equal((await(await a.request('resumes')).json()).resumes.length,3);
  await f.register('qa_multi_empty');
  const stats=await f.app.summary();assert.equal(stats.workspace.accountsWithResumes,1);assert.equal(stats.workspace.multiResumeAccounts,1);assert.equal(stats.workspace.baseResumes,3);assert.equal(stats.workspace.jobResumes,0);
  assert.deepEqual(stats.workspace.distribution.map(item=>item.accounts),[1,0,1,0]);
  await a.request('resumes/'+copy.id,'DELETE',{version:2});await a.request('resumes/'+two.id,'DELETE',{version:1});
  const remaining=await f.app.summary();assert.equal(remaining.cloudResumes,1);assert.equal(remaining.workspace.multiResumeAccounts,0);assert.deepEqual(remaining.workspace.distribution.map(item=>item.accounts),[1,1,0,0]);
});
test('cloud project details survive create, reload and copy with independent visibility settings',async t=>{
  const f=await fixture(t),a=await f.register('qa_project_fields'),input=resume();
  const item=input.moduleData.find(m=>m.moduleName==='project').data[0];
  item.projectDetails={...createProjectDetails(),summary:'合成项目简介',outcome:'合成测试成果',techStack:'JavaScript',website:'https://example.com',repository:'https://github.com/example/demo'};
  item.projectDetails.visible.outcome=false;
  item.projectDetails.layout.spacing='airy';
  const one=await(await a.request('resumes','POST',{title:'项目字段',resume:input})).json();
  const loaded=await(await a.request('resumes/'+one.id)).json();
  assert.deepEqual(loaded.resume.moduleData.find(m=>m.moduleName==='project').data[0].projectDetails,item.projectDetails);
  const copy=await(await a.request('resumes','POST',{title:'副本',resume:loaded.resume})).json();
  copy.resume.moduleData.find(m=>m.moduleName==='project').data[0].projectDetails.visible.outcome=true;
  copy.resume.moduleData.find(m=>m.moduleName==='project').data[0].projectDetails.layout.spacing='compact';
  assert.equal((await a.request('resumes/'+copy.id,'PUT',{version:copy.version,resume:copy.resume})).status,200);
  const original=await(await a.request('resumes/'+one.id)).json();
  assert.equal(original.resume.moduleData.find(m=>m.moduleName==='project').data[0].projectDetails.visible.outcome,false);
  assert.equal(original.resume.moduleData.find(m=>m.moduleName==='project').data[0].projectDetails.layout.spacing,'airy');
});
test('custom basic fields survive cloud save and copy with names and visibility intact',async t=>{
  const f=await fixture(t),a=await f.register('qa_basic_fields'),input=resume();
  input.basicInfo.make=[{keyValue:'个人网站',value:'example.com',visible:true},{name:'微信',value:'synthetic-contact',visible:false}];
  const one=await(await a.request('resumes','POST',{title:'自定义字段',resume:input})).json();
  const loaded=await(await a.request('resumes/'+one.id)).json();
  assert.deepEqual(loaded.resume.basicInfo.make,[{keyValue:'个人网站',value:'example.com',visible:true},{keyValue:'微信',value:'synthetic-contact',visible:false}]);
  const copy=await(await a.request('resumes','POST',{title:'自定义字段副本',resume:loaded.resume})).json();
  copy.resume.basicInfo.make[0].keyValue='作品集';copy.resume.basicInfo.make[1].visible=true;
  assert.equal((await a.request('resumes/'+copy.id,'PUT',{version:copy.version,resume:copy.resume})).status,200);
  const original=await(await a.request('resumes/'+one.id)).json();
  assert.equal(original.resume.basicInfo.make[0].keyValue,'个人网站');assert.equal(original.resume.basicInfo.make[1].visible,false);
  copy.resume.basicInfo.make.splice(0,1);
  assert.equal((await a.request('resumes/'+copy.id,'PUT',{version:copy.version+1,resume:copy.resume})).status,200);
  assert.equal((await(await a.request('resumes/'+copy.id)).json()).resume.basicInfo.make.length,1);
});
test('password recovery rotates recovery code and revokes every previous session',async t=>{
  const f=await fixture(t),a=await f.register('qa_recover');
  await a.request('resumes','POST',{title:'保留',resume:resume()});
  const recovery=await f.request('recover','POST',{username:'qa_recover',recoveryCode:a.user.recoveryCode,password:'new-long-password-2026'});assert.equal(recovery.status,200);const code=(await recovery.json()).recoveryCode;assert.notEqual(code,a.user.recoveryCode);
  assert.equal((await a.request('resumes')).status,401);assert.equal((await f.request('recover','POST',{username:'qa_recover',recoveryCode:a.user.recoveryCode,password})).status,401);
  const logged=await f.request('login','POST',{username:'qa_recover',password:'new-long-password-2026'});assert.equal(logged.status,200);const status=await logged.json(),headers={Cookie:logged.headers.get('set-cookie').split(';')[0],'X-Member-Token':status.csrf};
  assert.equal((await(await f.request('resumes','GET',undefined,headers)).json()).resumes.length,1);
  assert.equal((await f.request('password','POST',{currentPassword:'new-long-password-2026',password:'another-long-password-2026'},headers)).status,200);
  assert.equal((await f.request('resumes','GET',undefined,headers)).status,401);
});
test('account export excludes credentials and account deletion removes drafts, tasks and activity',async t=>{
  const f=await fixture(t),a=await f.register('qa_delete');await a.request('resumes','POST',{resume:resume()});await a.request('activity','POST',{type:'export'});
  const exported=await(await a.request('export')).json();assert.equal(exported.resumes.length,1);assert(!JSON.stringify(exported).includes('recoveryHash'));assert(!JSON.stringify(exported).includes('"password"'));
  const stats=await f.app.summary();assert.equal(stats.totalAccounts,1);assert.equal(stats.completedAccounts,1);assert(!JSON.stringify(stats).includes('PRIVATE_NAME'));
  assert.equal((await a.request('account','DELETE',{currentPassword:password,confirm:'qa_delete'})).status,200);
  assert.equal((await a.request('resumes')).status,401);const after=await f.app.summary();assert.equal(after.totalAccounts,0);assert.equal(after.cloudResumes,0);assert.equal(after.exports,0);
});
test('AI generation protects contact details, persists an idempotent result and enforces successful-generation quotas',async t=>{
  let calls=0,clock=Date.parse('2026-11-13T15:59:50Z');
  const f=await fixture(t,{now:()=>clock,config:{enabled:true,apiKey:'qa-key',model:'qa-model',baseUrl:'https://provider.example/v1',dailyLimit:1},fetchImpl:async(url,options)=>{
    calls++;assert.equal(String(url),'https://provider.example/v1/chat/completions');const payload=JSON.stringify(JSON.parse(options.body).messages);assert(!payload.includes('PRIVATE_NAME'));assert(!payload.includes('PRIVATE_EMAIL'));assert(!payload.includes('13812345678'));
    const result={requirements:[{text:'移动端适配',evidence:'已有项目实现',gap:''}],suggestions:[{moduleName:'project',index:0,sourceRefs:['project:0'],bullets:['使用 JavaScript 和 CSS 实现简历编辑、移动端适配与导出。'],reason:'突出对应职责'}]};
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200});
  }}),a=await f.register('qa_ai');
  const input={resume:resume(),jd:'岗位职责：使用 JavaScript 和 CSS 开发页面，负责移动端适配。',jobTitle:'前端实习',consent:true,requestId:crypto.randomUUID()};
  const generated=await a.request('tailor','POST',input);assert.equal(generated.status,200);const result=await generated.json();assert.equal(result.mode,'ai');assert.equal(result.resume.basicInfo.name,'PRIVATE_NAME');assert.equal(result.resume.moduleData.find(m=>m.moduleName==='project').data[0].name,'简历工具');
  assert.deepEqual(await(await a.request('tailor','POST',input)).json(),result);assert.equal(calls,1);
  const exceeded=await a.request('tailor','POST',{...input,requestId:crypto.randomUUID(),plan:'job-search',paidCredits:30});assert.equal(exceeded.status,429);assert.equal(calls,1);
  const denial=await exceeded.json();assert.equal(denial.code,'AI_DAILY_LIMIT');assert.equal(denial.quota.remaining,0);assert.equal(denial.quota.used,1);assert.equal(denial.quota.resetAt,'2026-11-13T16:00:00.000Z');
  const status=await(await a.request('status')).json();assert.deepEqual(status.quota,denial.quota);assert.equal(status.config.checkoutEnabled,false);
  assert.equal((await a.request('checkout','POST',{plan:'job-search'})).status,404);
  assert.equal((await(await a.request('resumes')).json()).resumes.length,0,'generation does not overwrite or create cloud resumes before adoption');
  assert.equal((await f.app.summary()).aiGenerations,1);
  clock+=15000;
  const nextDay=await(await a.request('status')).json();assert.equal(nextDay.quota.used,0);assert.equal(nextDay.quota.remaining,1);
  assert.equal((await a.request('tailor','POST',{...input,requestId:crypto.randomUUID()})).status,200);assert.equal(calls,2);
});
test('provider failure releases reservations without consuming quota, and pending jobs prevent double submissions',async t=>{
  let calls=0,release;
  const f=await fixture(t,{config:{enabled:true,apiKey:'qa',model:'qa',baseUrl:'https://provider.example/v1',dailyLimit:1},fetchImpl:async()=>{calls++;if(calls===1)await new Promise(resolve=>release=resolve);return new Response('',{status:503});}}),a=await f.register('qa_failure');
  const input={resume:resume(),jd:'岗位要求：JavaScript 页面开发与移动端适配，能独立实现基础功能。',jobTitle:'开发',consent:true,requestId:crypto.randomUUID()};
  const first=a.request('tailor','POST',input);while(!release)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await a.request('tailor','POST',{...input,requestId:crypto.randomUUID()})).status,409);release();assert.equal((await first).status,502);
  assert.equal((await a.request('tailor','POST',input)).status,502);assert.equal(calls,2);assert.equal((await f.app.summary()).aiGenerations,0);
  const status=await(await a.request('status')).json();assert.equal(status.quota.used,0);assert.equal(status.quota.remaining,1);
});
test('basic mode is explicitly non-AI and obvious invented metrics or technologies are rejected',async t=>{
  const f=await fixture(t);const input={resume:resume(),jobTitle:'前端实习',jd:'岗位要求：使用 JavaScript 开发页面，熟悉 CSS 与移动端适配。'};
  const result=await(await f.request('basic','POST',input)).json();assert.equal(result.mode,'basic');assert(result.warnings.some(w=>w.includes('未调用 AI')));assert.equal(result.resume.moduleData.find(m=>m.moduleName==='yixiang').data.job,'前端实习');
  const fabricated=applyModelResult(normalizeResume(resume()),{requirements:[],suggestions:[{moduleName:'project',index:0,sourceRefs:['project:0'],bullets:['使用 React 获得 10000 用户，增长 30%。']}]},input.jd,input.jobTitle);
  const content=fabricated.resume.moduleData.find(m=>m.moduleName==='project').data[0].content;
  assert(!content.includes('10000'));assert(!content.includes('React'));assert(fabricated.warnings.some(w=>w.includes('忽略')));
  assert(!result.analysis.skills.some(skill=>skill.text==='Java'),'JavaScript must not be matched as Java');
  const withSample=resume();withSample.basicInfo.photo='/assets/img/landing/portrait-demo.webp';assert.equal(normalizeResume(withSample).basicInfo.photo,withSample.basicInfo.photo);
});
test('AI configuration is saved server-side, redacts its key and never becomes public account metadata',async t=>{
  const f=await fixture(t);
  const key='qa-private-ai-config-key';
  const changed=await f.app.updateConfiguration({baseUrl:'https://provider.example/v1',model:'text-test',apiKey:key,dailyLimit:2,enabled:true});
  assert.equal(changed.enabled,true);assert.equal(changed.keyConfigured,true);assert(!JSON.stringify(changed).includes(key));
  const status=await(await f.request('status')).json();assert.equal(status.config.aiEnabled,true);assert(!JSON.stringify(status).includes('provider.example'));assert(!JSON.stringify(status).includes(key));
  await assert.rejects(f.app.updateConfiguration({baseUrl:'https://provider.example/v1?key=secret',model:'text-test',enabled:true}),/HTTPS API/);
  await f.app.updateConfiguration({baseUrl:'https://provider.example/v1',model:'text-test',enabled:false,clearKey:true});assert.equal((await f.app.configuration()).keyConfigured,false);
});

test('personal-only mode disables legacy provider calls while preserving account and basic features',async t=>{
 let calls=0;const f=await fixture(t,{hostedAi:false,config:{enabled:true,dailyLimit:3,baseUrl:'https://provider.example/v1',model:'fixture',apiKey:'fixture-legacy-key'},fetchImpl:async()=>{calls++;throw Error('Should not call');}}),account=await f.register('qa_personal_only');
 const status=await(await account.request('status')).json();assert.equal(status.config.aiEnabled,false);assert.equal(status.config.personalAi,true);
 const result=await account.request('tailor','POST',{resume:resume(),jd:'负责软件产品开发与移动端适配，处理用户反馈',jobTitle:'软件开发',requestId:crypto.randomUUID(),consent:true});assert.equal(result.status,410);assert.equal(calls,0);
 const basic=await account.request('basic','POST',{resume:resume(),jd:'负责软件产品开发与移动端适配，处理用户反馈',jobTitle:'软件开发'});assert.equal(basic.status,200);assert.equal((await basic.json()).mode,'basic');
});
