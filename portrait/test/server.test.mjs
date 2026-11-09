import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import sharp from 'sharp';
import {createApp,normalizeConfig} from '../server.mjs';
import {buildPrompt,presets} from '../public/presets.js';

const fakeKey='test-only-private-key';
const png=await sharp({create:{width:295,height:413,channels:4,background:'#438edb'}}).png().toBuffer();
const dataUrl=`data:image/png;base64,${png.toString('base64')}`;
const testParent=path.dirname(fileURLToPath(import.meta.url));
async function setup(t,{transport,configured=true,cutout}={}){
  const dir=await mkdtemp(path.join(testParent,'fixture-'));const configPath=path.join(dir,'config.json');
  await writeFile(configPath,JSON.stringify({baseUrl:configured?'https://image.example/v1':'',model:'image2.5sub',apiKey:fakeKey,mode:'multipart',imageField:'image[]'}));
  const app=await createApp({configPath,transport,cutout,remoteValidator:async()=>{}});app.listen(0,'127.0.0.1');await once(app,'listening');const base=`http://127.0.0.1:${app.address().port}`;
  const config=await (await fetch(base+'/api/config')).json();
  t.after(async()=>{await new Promise(resolve=>{app.close(resolve);app.closeAllConnections();});const target=path.resolve(dir);assert(target.startsWith(testParent+path.sep));await rm(target,{recursive:true,force:true});});
  async function call(endpoint,body,method='POST',extra={}){return fetch(base+endpoint,{method,headers:{'Content-Type':'application/json','X-App-Token':config.token,...extra},body:JSON.stringify(body)});}
  async function waitJob(id){for(let i=0;i<150;i++){const j=await(await fetch(base+'/api/jobs/'+id)).json();if(j.status!=='processing')return j;await new Promise(r=>setTimeout(r,20));}throw new Error('mock job timeout');}
  return {base,config,call,waitJob,configPath};
}
test('17 presets all include identity and background constraints',()=>{
  assert.equal(presets.length,17);for(const p of presets){const prompt=buildPrompt({presetId:p.id,customPrompt:'柔和棚光'});assert.match(prompt,/不瘦脸/);assert.match(prompt,/仅修改背景/);assert.match(prompt,/柔和棚光/);}
  assert.throws(()=>buildPrompt({presetId:'invalid'}));assert.throws(()=>buildPrompt({presetId:'custom',customColor:'red'}));
  assert.match(buildPrompt({presetId:'custom',customColor:'#aabbcc'}),/#AABBCC/);
});
test('configuration validation preserves keys and refuses unsafe URLs',()=>{
  const old={apiKey:fakeKey};assert.equal(normalizeConfig({apiKey:'',model:'image2.5sub'},old).apiKey,fakeKey);
  assert.equal(normalizeConfig({baseUrl:'https://api.rtoc.cc'}).baseUrl,'https://api.rtoc.cc/v1');
  for(const baseUrl of ['http://example.com/v1','https://user:pass@example.com/v1','https://example.com/v1?key=abc','https://example.com/v1/images/edits'])assert.throws(()=>normalizeConfig({baseUrl}));
});
test('key never exposed; private files and cross-origin mutations blocked',async t=>{
  const s=await setup(t);assert.equal(s.config.hasKey,true);assert.equal(s.config.apiKey,undefined);assert(!JSON.stringify(s.config).includes(fakeKey));
  for(const url of ['/private/config.json','/.gitignore','/server.mjs','/%2e%2e/private/config.json'])assert.equal((await fetch(s.base+url)).status,404);
  assert.equal((await s.call('/api/config',{model:'tampered'},'PATCH',{'Origin':'https://untrusted.example'})).status,403);
  assert.equal((await fetch(s.base+'/api/config',{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  const updated=await s.call('/api/config',{model:'changed',apiKey:''},'PATCH');assert.equal(updated.status,200);assert(!(await updated.text()).includes(fakeKey));assert.equal(JSON.parse(await readFile(s.configPath,'utf8')).apiKey,fakeKey);
});
test('missing base URL blocks any provider request',async t=>{
  let calls=0;const s=await setup(t,{configured:false,transport:async()=>{calls++;throw new Error('should not call');}});
  const r=await s.call('/api/jobs',{presetId:'blue',image:dataUrl});assert.equal(r.status,400);assert.equal(calls,0);
});
test('local cutout works without provider config and makes no remote requests',async t=>{
  let remote=0,local=0;const s=await setup(t,{configured:false,transport:async()=>{remote++;throw new Error('must stay local');},cutout:async image=>{local++;assert(image.length>0);return {image:png,durationMs:12,cached:false};}});
  const r=await s.call('/api/cutout',{image:dataUrl});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal(r.headers.get('x-processing-ms'),'12');assert.equal(remote,0);assert.equal(local,1);
  assert.equal((await s.call('/api/cutout',{image:'invalid'})).status,400);
});
test('multipart edit sends image and keeps model name; blocks duplicate submissions',async t=>{
  let release;const wait=new Promise(r=>release=r);let captured;
  const s=await setup(t,{transport:async(url,options)=>{captured={url,options};await wait;return Response.json({data:[{b64_json:png.toString('base64')}]});}});
  const r=await s.call('/api/jobs',{presetId:'blue',image:dataUrl,customPrompt:'柔光',quality:'default',resolution:'default'});assert.equal(r.status,202);const {id}=await r.json();
  const duplicate=await s.call('/api/jobs',{presetId:'red',image:dataUrl});assert.equal(duplicate.status,409);
  release();const job=await s.waitJob(id);assert.equal(job.status,'done');assert.equal(captured.url,'https://image.example/v1/images/edits');assert.equal(captured.options.body.get('model'),'image2.5sub');assert.equal(captured.options.body.has('quality'),false);assert(captured.options.body.get('image[]') instanceof Blob);assert.match(captured.options.body.get('prompt'),/#438EDB/);
  const result=await fetch(s.base+`/api/jobs/${id}/image`);assert.equal(result.headers.get('content-type'),'image/png');const meta=await sharp(Buffer.from(await result.arrayBuffer())).metadata();assert.equal(meta.width,295);
});
test('JSON edit and result CDN download never forward credentials to CDN',async t=>{
  let request;const s=await setup(t,{transport:async(url,options)=>{if(url.endsWith('/images/edits')){request=JSON.parse(options.body);return Response.json({data:[{url:'https://cdn.example/result.png'}]});}assert.equal(url,'https://cdn.example/result.png');assert.equal(options.headers,undefined);return new Response(png,{headers:{'Content-Type':'image/png'}});}});
  await s.call('/api/config',{mode:'json'},'PATCH');const {id}=await(await s.call('/api/jobs',{presetId:'transparent',image:dataUrl,quality:'high'})).json();const j=await s.waitJob(id);assert.equal(j.status,'done');assert.match(j.warning,/没有实际透明区域/);assert.equal(request.background,'transparent');assert.equal(request.quality,'high');assert.match(request.images[0].image_url,/^data:image\/png;base64,/);
});
test('provider errors are redacted and paid requests are not retried',async t=>{
  let calls=0;const s=await setup(t,{transport:async()=>{calls++;return Response.json({error:{message:fakeKey}},{status:401});}});
  const {id}=await(await s.call('/api/jobs',{presetId:'white',image:dataUrl})).json();const j=await s.waitJob(id);assert.equal(j.status,'failed');assert.match(j.error,/密钥未通过/);assert(!j.error.includes(fakeKey));assert.equal(calls,1);
});
test('cancelled jobs cannot return generated results',async t=>{
  const s=await setup(t,{transport:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))});
  const {id}=await(await s.call('/api/jobs',{presetId:'white',image:dataUrl})).json();await s.call(`/api/jobs/${id}/cancel`,{});assert.equal((await s.waitJob(id)).status,'cancelled');assert.equal((await fetch(s.base+`/api/jobs/${id}/image`)).status,409);
});
test('models check reports exact model presence',async t=>{
  const s=await setup(t,{transport:async url=>{assert.match(url,/\/models$/);return Response.json({data:[{id:'image2.5sub'}]});}});const r=await s.call('/api/check',{});assert.equal(r.status,200);assert.equal((await r.json()).modelFound,true);
});
test('model picker reads unsaved connection without changing config or exposing key',async t=>{
  const s=await setup(t,{transport:async(url,options)=>{assert.equal(url,'https://draft.example/v1/models');assert.equal(options.headers.Authorization,'Bearer draft-only-key');return Response.json({data:[{id:'gpt-image-2.6-sunburst'},{id:'gpt-image-2.5-sunburst'},{id:'gpt-image-2.6-sunburst'},null,{}, {id:''}]});}});
  const before=await readFile(s.configPath,'utf8');
  const r=await s.call('/api/models',{baseUrl:'https://draft.example',apiKey:'draft-only-key',model:''});assert.equal(r.status,200);
  const text=await r.text();assert(!text.includes('draft-only-key'));assert.deepEqual(JSON.parse(text).models,['gpt-image-2.6-sunburst','gpt-image-2.5-sunburst']);assert.equal(await readFile(s.configPath,'utf8'),before);
  const updated=await(await s.call('/api/config',{model:'gpt-image-2.6-sunburst'},'PATCH')).json();assert.equal(updated.model,'gpt-image-2.6-sunburst');assert.equal(updated.baseUrl,'https://image.example/v1');assert.equal(JSON.parse(await readFile(s.configPath,'utf8')).apiKey,fakeKey);
});
test('model picker keeps full list beyond 200 items and supports an empty list',async t=>{
  let empty=false;const ids=Array.from({length:250},(_,i)=>({id:`model-${i}`}));ids.push({id:'gpt-image-2.6-sunburst'});
  const s=await setup(t,{transport:async()=>Response.json({data:empty?[]:ids})});
  let r=await s.call('/api/models',{});const list=(await r.json()).models;assert.equal(list.length,251);assert.equal(list.at(-1),'gpt-image-2.6-sunburst');empty=true;
  r=await s.call('/api/models',{});assert.deepEqual((await r.json()).models,[]);
});
test('model picker rejects cross-origin requests and redacts provider errors',async t=>{
  const s=await setup(t,{transport:async()=>Response.json({error:{message:fakeKey}},{status:401})});
  assert.equal((await s.call('/api/models',{},'POST',{Origin:'https://untrusted.example'})).status,403);
  const r=await s.call('/api/models',{});assert.equal(r.status,502);const text=await r.text();assert.match(text,/密钥未通过/);assert(!text.includes(fakeKey));
});
test('HTML model endpoint produces a specific address error',async t=>{
  const s=await setup(t,{transport:async()=>new Response('<html><title>Home</title></html>',{headers:{'Content-Type':'text/html'}})});const r=await s.call('/api/check',{});assert.equal(r.status,502);assert.match((await r.json()).error,/网页而非 API 数据/);
});
test('network failure produces a connection error without exposing credentials',async t=>{
  const s=await setup(t,{transport:async()=>{throw new TypeError('fetch failed',{cause:{code:'ENOTFOUND'}});}});const r=await s.call('/api/check',{});assert.equal(r.status,502);const text=await r.text();assert.match(text,/无法解析服务域名/);assert(!text.includes(fakeKey));
});
test('exports have precise size, 300 DPI metadata, and valid JPEG',async t=>{
  const s=await setup(t);for(const format of ['png','jpeg']){const r=await s.call('/api/export',{image:dataUrl,format});assert.equal(r.status,200);const metadata=await sharp(Buffer.from(await r.arrayBuffer())).metadata();assert.equal(metadata.width,295);assert.equal(metadata.height,413);assert.equal(metadata.density,300);assert.equal(metadata.format,format);}
  assert.equal((await s.call('/api/export',{image:'data:image/png;base64,aaaa',format:'svg'})).status,400);
});
