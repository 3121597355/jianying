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
test('support settings reject script URLs and accept either QR or a donation platform',()=>{
 assert.equal(normalizeSupport().offers.length,3);assert.equal(normalizeSupport().thanksImage,'');
 assert.throws(()=>normalizeSupport({url:'javascript:alert(1)'}));assert.throws(()=>normalizeSupport({wechat:'data:image/svg+xml;base64,PHN2Zz4='}));assert.throws(()=>normalizeSupport({url:'https://secret@donation.example/'}));
 assert.equal(normalizeSupport({url:'https://afdian.com/a/example',label:'支持作者'}).label,'支持作者');
});
