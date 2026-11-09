import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createResumeServer} from '../serve.mjs';
import sharp from 'sharp';

async function setup(t,publicOrigin=''){
  let calls=0;const image=await sharp({create:{width:20,height:20,channels:4,background:'#fff'}}).png().toBuffer();
  const server=await createResumeServer({portraitOptions:{publicMode:true,publicOrigin,configPath:import.meta.filename,transport:async()=>{calls++;throw Error('must not call provider');},cutout:async()=>({image,cached:false,durationMs:1})}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`,config=await(await fetch(base+'/portrait/api/config')).json();
  const request=(route,body={},method='POST',headers={})=>fetch(base+'/portrait/api/'+route,{method,headers:{'Content-Type':'application/json','X-App-Token':config.token,...headers},body:JSON.stringify(body)});
  return{base,config,request,image:`data:image/png;base64,${image.toString('base64')}`,calls:()=>calls};
}
test('public mode skips private config and blocks every cloud/connection route',async t=>{
  const s=await setup(t); // The configPath points to invalid JSON: success proves no read.
  assert.equal(s.config.publicMode,true);assert.equal(s.config.hasKey,false);assert.equal(s.config.configured,false);assert.equal(s.config.baseUrl,'');assert.equal(s.config.features.cloudEditing,false);
  for(const [route,method]of [['config','PATCH'],['models','POST'],['check','POST'],['jobs','POST'],['jobs/abc/cancel','POST']])assert.equal((await s.request(route,{},method)).status,403,route);
  assert.equal((await fetch(s.base+'/portrait/api/jobs/abc')).status,403);
  assert.equal((await s.request('cutout',{image:s.image})).status,200);
  assert.equal((await s.request('export',{image:s.image,format:'png'})).status,200);
  assert.equal(s.calls(),0);
});
test('public processing rate limit and declared domain origin are enforced',async t=>{
  const s=await setup(t,'https://resume.example');
  for(let i=0;i<12;i++)assert.equal((await s.request('cutout',{image:s.image},'POST',{Origin:'https://resume.example'})).status,200);
  const limited=await s.request('cutout',{image:s.image});assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
  assert.equal((await s.request('cutout',{image:s.image},'POST',{Origin:'https://evil.example'})).status,403);
  assert.equal(s.calls(),0);
});
