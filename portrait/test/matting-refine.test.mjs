import {test} from 'node:test';
import assert from 'node:assert/strict';
import {refineAlpha} from '../matting-refine.mjs';
import {mattingSize} from '../local-cutout.mjs';
import {adjustEdgePixels} from '../public/edge-adjust.js';

test('matting size keeps portrait proportions and bounds model compute',()=>{
  for(const [width,height]of [[300,400],[600,900],[1600,900],[100,2000]]){
    const result=mattingSize(width,height);
    assert.equal(result.width%32,0);assert.equal(result.height%32,0);
    assert(Math.max(result.width,result.height)<=768);
    assert(Math.abs(result.width/result.height-width/height)<.08);
  }
});
test('guided refinement preserves opaque foreground and clear background',()=>{
  const w=32,h=16,rgb=Buffer.alloc(w*h*3),mask=Buffer.alloc(w*h);
  for(let i=0;i<w*h;i++){const foreground=i%w>=16;rgb.fill(foreground?50:240,i*3,i*3+3);mask[i]=foreground?255:0;}
  const refined=refineAlpha(rgb,mask,w,h);
  assert.equal(refined[0],0);assert.equal(refined[w-1],255);
  assert(refined[15]<20);assert(refined[16]>235);
});
test('edge corrections change only translucent pixels and can be reset exactly',()=>{
  const source=new Uint8ClampedArray([255,255,255,0,180,170,160,128,50,60,70,255]);
  assert.deepEqual(adjustEdgePixels(source,3,1),source);
  const result=adjustEdgePixels(source,3,1,{edge:15,decontam:100});
  assert(result[7]<128);assert(result[4]<180);
  assert.deepEqual(result.slice(0,4),source.slice(0,4));assert.deepEqual(result.slice(8),source.slice(8));
  assert(adjustEdgePixels(source,3,1,{edge:-15})[7]>128);
});
