import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import sharp from 'sharp';
import {createPersonalAi,personalConnection,privateAddress,personalFetch} from '../personal-ai.mjs';
import {createStarterResume} from '../assets/js/template-choice.js';
import {normalizeSupport} from '../assets/js/support-config.js';

test('personal connections reject credentials in URLs, private endpoints, bad keys and interface paths',()=>{
 for(const baseUrl of ['http://provider.example/v1','https://key@provider.example/v1','https://provider.example/v1?key=secret','https://127.0.0.1/v1','https://internal.local/v1','https://provider.example:8443/v1','https://provider.example/v1/chat/completions'])assert.throws(()=>personalConnection({baseUrl,apiKey:'fixture',model:'fixture'}));
 assert.throws(()=>personalConnection({baseUrl:'https://provider.example',apiKey:'bad\r\nkey',model:'fixture'}));
 assert.equal(personalConnection({baseUrl:'https://provider.example',apiKey:'fixture',model:'fixture'}).baseUrl,'https://provider.example/v1');
 for(const ip of ['127.0.0.1','169.254.169.254','10.0.0.1','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fd00::1'])assert.equal(privateAddress(ip),true);
});
test('DNS validation refuses a public hostname resolving partly to an internal address',async()=>{
 await assert.rejects(personalFetch('https://provider.example/v1',{},async()=>[{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}]),/内网/);
});
test('anonymous personal AI relays only the supplied key, keeps model identity private and returns safe failures',async t=>{
 let server,calls=[];
 const image=await sharp({create:{width:20,height:30,channels:3,background:'white'}}).png().toBuffer();
 const handle=createPersonalAi({hostPort:()=>server.address().port,transport:async(url,options)=>{calls.push({url:String(url),options});if(String(url).endsWith('/images/edits'))return new Response(JSON.stringify({data:[{b64_json:image.toString('base64')}]}));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({suggestions:[],requirements:[]})}}]}));}});
 server=http.createServer(async(req,res)=>{if(!await handle(req,res,new URL(req.url,'http://localhost')))res.writeHead(404).end();});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const origin='http://127.0.0.1:'+server.address().port,connection={baseUrl:'https://provider.example/v1',model:'fixture',apiKey:'synthetic-private-key'},resume=createStarterResume();
 const request=(route,body,headers={})=>fetch(origin+'/api/personal-ai/'+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 let response=await request('tailor',{connection,resume,jd:'负责网站产品需求拆解和功能验收，改善使用体验',jobTitle:'产品经理',consent:true});assert.equal(response.status,200);const result=await response.json();assert.equal(result.mode,'ai');assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-private-key');assert(!calls[0].options.body.includes('林予安'));assert(!JSON.stringify(result).includes('synthetic-private-key'));
 response=await request('portrait',{connection,consent:true,image:'data:image/png;base64,'+image.toString('base64'),presetId:'white'});assert.equal(response.status,200);assert((await response.json()).image.startsWith('data:image/webp;'));
 response=await request('tailor',{connection,consent:false});assert.equal(response.status,400);
 response=await request('tailor',{connection,consent:true},{Origin:'https://evil.example'});assert.equal(response.status,403);assert.equal(calls.length,2);
});
test('local deployments may reach loopback endpoints while public deployments stay strict',()=>{
 for(const baseUrl of ['http://127.0.0.1:7865/v1','http://localhost:7865/v1','https://127.0.0.1:7865/v1']){
  assert.equal(personalConnection({baseUrl,apiKey:'fixture',model:'fixture'},{allowLocal:true}).baseUrl,baseUrl.replace(/\/$/,''));
  assert.throws(()=>personalConnection({baseUrl,apiKey:'fixture',model:'fixture'}));
 }
 assert.throws(()=>personalConnection({baseUrl:'http://192.168.1.9:7865/v1',apiKey:'fixture',model:'fixture'},{allowLocal:true}));
 assert.throws(()=>personalConnection({baseUrl:'http://api.example.com/v1',apiKey:'fixture',model:'fixture'},{allowLocal:true}));
 assert.throws(()=>personalConnection({baseUrl:'http://user:key@127.0.0.1:7865/v1',apiKey:'fixture',model:'fixture'},{allowLocal:true}));
});
test('local personal AI relays to a loopback provider over http',async t=>{
 let provider,relay;const seen=[];
 provider=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{seen.push(JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{message:{content:JSON.stringify({suggestions:[],requirements:[]})}}]}));});});
 provider.listen(0,'127.0.0.1');await once(provider,'listening');
 t.after(()=>new Promise(resolve=>{provider.close(resolve);provider.closeAllConnections();}));
 const handle=createPersonalAi({hostPort:()=>relay.address().port,allowLocal:true});
 relay=http.createServer(async(req,res)=>{if(!await handle(req,res,new URL(req.url,'http://localhost')))res.writeHead(404).end();});
 relay.listen(0,'127.0.0.1');await once(relay,'listening');
 t.after(()=>new Promise(resolve=>{relay.close(resolve);relay.closeAllConnections();}));
 const origin='http://127.0.0.1:'+relay.address().port;
 const connection={baseUrl:'http://127.0.0.1:'+provider.address().port+'/v1',model:'fixture',apiKey:'local-key'};
 const response=await fetch(origin+'/api/personal-ai/tailor',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({connection,resume:createStarterResume(),jd:'负责网站产品需求拆解和功能验收，改善使用体验',jobTitle:'产品经理',consent:true})});
 assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.mode,'ai');assert.equal(seen.length,1);assert.equal(seen[0].model,'fixture');
});
test('support settings reject script URLs and accept either QR or a donation platform',()=>{
 assert.equal(normalizeSupport().offers.length,3);assert.equal(normalizeSupport().thanksImage,'');
 assert.throws(()=>normalizeSupport({url:'javascript:alert(1)'}));assert.throws(()=>normalizeSupport({wechat:'data:image/svg+xml;base64,PHN2Zz4='}));assert.throws(()=>normalizeSupport({url:'https://secret@donation.example/'}));
 assert.equal(normalizeSupport({url:'https://afdian.com/a/example',label:'支持作者'}).label,'支持作者');
});

test('review mode diagnoses a resume without job requirements and never rewrites it',async t=>{
 let server,calls=[];
 const handle=createPersonalAi({hostPort:()=>server.address().port,transport:async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify({choices:[{message:{content:'```json\n'+JSON.stringify({findings:[{area:'项目经验',level:'high',advice:'补充真实的交付数据'},{area:'技能特长',level:'low',advice:'按岗位顺序排列'}],highlights:[{text:'零上传设计',why:'隐私是差异点'}],warnings:['时间线需核实']})+'\n```'}}]}));}});
 server=http.createServer(async(req,res)=>{if(!await handle(req,res,new URL(req.url,'http://localhost')))res.writeHead(404).end();});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const origin='http://127.0.0.1:'+server.address().port,connection={baseUrl:'https://provider.example/v1',model:'fixture',apiKey:'synthetic-private-key'};
 const request=body=>fetch(origin+'/api/personal-ai/tailor',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 let response=await request({connection,resume:createStarterResume(),mode:'review',consent:true});
 assert.equal(response.status,200);
 const review=await response.json();
 assert.equal(review.mode,'review');
 assert.equal(review.findings[0].area,'项目经验');
 assert.equal(review.findings[0].level,'high');
 assert.equal(review.highlights[0].text,'零上传设计');
 assert.deepEqual(review.warnings,['时间线需核实']);
 assert.equal(review.resume,undefined,'review mode never returns rewritten resume content');
 assert.ok(!calls[0].options.body.includes('林予安'),'identity fields are stripped before the provider call');
 assert.ok(calls[0].options.body.includes('简历诊断'),'review prompt is used');
 response=await request({connection,resume:createStarterResume(),consent:true});
 assert.equal(response.status,400,'tailoring still requires a job title and JD');
 response=await request({connection,resume:createStarterResume(),mode:'review',consent:false});
 assert.equal(response.status,400,'review mode still requires consent');
});

test('feedback mode revises a previous suggestion without resending identity fields',async t=>{
 let server,calls=[];
 const handle=createPersonalAi({hostPort:()=>server.address().port,transport:async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({suggestions:[],requirements:[],warnings:['只调整了表达']})}}]}));}});
 server=http.createServer(async(req,res)=>{if(!await handle(req,res,new URL(req.url,'http://localhost')))res.writeHead(404).end();});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const origin='http://127.0.0.1:'+server.address().port,connection={baseUrl:'https://provider.example/v1',model:'fixture',apiKey:'synthetic-private-key'};
 const request=body=>fetch(origin+'/api/personal-ai/tailor',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 let response=await request({connection,resume:createStarterResume(),mode:'feedback',jd:'负责网站产品需求拆解和功能验收，改善使用体验',jobTitle:'产品经理',feedback:'项目成果再具体一点，保留真实数据',previousResult:{analysis:{aiRequirements:[]},changes:[],warnings:[]},consent:true});
 assert.equal(response.status,200);
 assert.equal((await response.json()).mode,'ai');
 assert.ok(calls[0].options.body.includes('项目成果再具体一点'),'feedback is passed to the provider');
 assert.ok(!calls[0].options.body.includes('林予安'),'identity fields stay stripped');
 response=await request({connection,resume:createStarterResume(),mode:'feedback',jd:'负责网站产品需求拆解和功能验收，改善使用体验',jobTitle:'产品经理',feedback:'',consent:true});
 assert.equal(response.status,400,'feedback mode requires a non-empty request');
 response=await request({connection,resume:createStarterResume(),mode:'feedback',jobTitle:'产品经理',feedback:'改一下',consent:true});
 assert.equal(response.status,400,'feedback mode still requires a job requirement');
});
