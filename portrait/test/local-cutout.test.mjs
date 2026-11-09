import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {localCutout} from '../local-cutout.mjs';

test('existing transparent pixels and RGB are preserved, second call reuses cache',async()=>{
  const raw=Buffer.from([10,20,30,0,40,50,60,128,70,80,90,255,100,110,120,255]);
  const input=await sharp(raw,{raw:{width:2,height:2,channels:4}}).png().toBuffer();
  const result=await localCutout(input);const pixels=await sharp(result.image).ensureAlpha().raw().toBuffer();assert.deepEqual(pixels,raw);
  const again=await localCutout(input);assert.equal(again.cached,true);assert.deepEqual(again.image,result.image);
});
test('photographic portrait keeps face RGB and removes the empty backdrop',async()=>{
  const input=await readFile(new URL('./fixtures/modnet-portrait.png',import.meta.url));
  const result=await localCutout(input),out=await sharp(result.image).ensureAlpha().raw().toBuffer(),original=await sharp(input).ensureAlpha().raw().toBuffer();
  assert(out[(205*480+270)*4+3]>240,'face must remain opaque');assert.equal(out[3],0,'empty background must be transparent');
  for(let i=0;i<out.length;i+=4)for(let c=0;c<3;c++)assert.equal(out[i+c],original[i+c],'original color must be preserved');
  assert.equal(result.version,'modnet-photo-v1');
});
test('synthetic portrait inference yields spatially aligned alpha and unchanged RGB',async()=>{
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="320" height="400" fill="#ededed"/><ellipse cx="160" cy="130" rx="65" ry="85" fill="#c99e82"/><path d="M50 400V310C50 210 270 210 270 310V400Z" fill="#293548"/></svg>');
  const input=await sharp(svg).png().toBuffer();const result=await localCutout(input);const out=await sharp(result.image).ensureAlpha().raw().toBuffer();const original=await sharp(input).ensureAlpha().raw().toBuffer();
  assert(out[(130*320+160)*4+3]>200,'face centre must remain opaque');assert(out[3]<30,'corner must be removed');
  for(let i=0;i<out.length;i+=4){assert.equal(out[i],original[i]);assert.equal(out[i+1],original[i+1]);assert.equal(out[i+2],original[i+2]);}
});
