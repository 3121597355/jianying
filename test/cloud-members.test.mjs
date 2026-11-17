import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import {Pool} from 'pg';
import {createMembers} from '../members.mjs';
import {createDefault} from '../assets/js/resume-defaults.js';

const databaseUrl=process.env.CLOUD_TEST_DATABASE_URL;
test('PostgreSQL accounts and drafts survive function replacement and reject conflicting or cross-owner saves',{skip:!databaseUrl},async t=>{
  const schema='qa_jy_'+crypto.randomBytes(7).toString('hex');
  const options={root:path.resolve(import.meta.dirname,'..'),schema,databaseUrl,config:{enabled:false,dailyLimit:3}};
  const apps=[],servers=[];
  t.after(async()=>{
    for(const server of servers)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    for(const app of apps)await app.close();
    assert(/^qa_jy_[a-f0-9]{14}$/.test(schema));
    const pool=new Pool({connectionString:databaseUrl});
    try{await pool.query(`DROP SCHEMA "${schema}" CASCADE`);}finally{await pool.end();}
  });
  async function instance(){
    let server;
    const app=await createMembers({...options,hostPort:()=>server?.address()?.port});apps.push(app);
    server=http.createServer(async(req,res)=>{if(!await app.handle(req,res,new URL(req.url,'http://127.0.0.1')))res.writeHead(404).end();});servers.push(server);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=(route,method='GET',data,headers={})=>fetch(origin+'/api/member/'+route,{method,headers:{Origin:origin,...(data?{'Content-Type':'application/json'}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})});
    return {app,request};
  }
  const first=await instance(),password='synthetic-cloud-qa-2026';
  const signup=await first.request('register','POST',{username:'qa_owner',nickname:'合成测试',password,acceptPrivacy:true});assert.equal(signup.status,201);
  const user=await signup.json(),headers={Cookie:signup.headers.get('set-cookie').split(';')[0],'X-Member-Token':user.csrf};
  const resume=createDefault();resume.basicInfo.name='合成云端草稿';
  const saved=await first.request('resumes','POST',{title:'测试版本',resume},headers);assert.equal(saved.status,201);const draft=await saved.json();
  const second=await instance();
  const loaded=await second.request('resumes/'+draft.id,'GET',undefined,headers);assert.equal(loaded.status,200);assert.equal((await loaded.json()).resume.basicInfo.name,'合成云端草稿');
  const changes=await Promise.all([first.request('resumes/'+draft.id,'PUT',{version:draft.version,resume},headers),second.request('resumes/'+draft.id,'PUT',{version:draft.version,resume},headers)]);assert.deepEqual(changes.map(r=>r.status).sort(),[200,409]);
  const login=await second.request('login','POST',{username:'qa_owner',password});assert.equal(login.status,200);
  const stranger=await second.request('register','POST',{username:'qa_other',password,acceptPrivacy:true});assert.equal(stranger.status,201);
  assert.equal((await second.request('resumes/'+draft.id,'GET',undefined,{Cookie:stranger.headers.get('set-cookie').split(';')[0]})).status,404);
  assert.equal((await second.request('resumes')).status,401);
  assert.equal((await second.app.summary()).cloudResumes,1);
});
