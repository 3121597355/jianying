import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import {refineAlpha} from './matting-refine.mjs';

const modelPath=process.env.VERCEL?path.join(process.cwd(),'portrait','models','modnet_photographic.onnx'):path.join(path.dirname(fileURLToPath(import.meta.url)),'models','modnet_photographic.onnx');
const checksum='5069a5e306b9f5e9f4f2b0360264c9f8ea13b257c7c39943c7cf6a2ec3a102ae';
export const CUTOUT_VERSION='modnet-photo-v1';
let sessionPromise;
const cache=new Map();
let processing=false;

async function getSession(){
  if(!sessionPromise)sessionPromise=(async()=>{
    const bytes=await readFile(modelPath);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==checksum)throw new Error('本地抠图模型校验失败，请重新运行 npm run setup-model。');
    return ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,graphOptimizationLevel:'all'});
  })().catch(error=>{sessionPromise=null;throw error;});
  return sessionPromise;
}

export function mattingSize(width,height){
  // Dynamic axes and bounded compute; maintain the portrait's proportions.
  const scale=Math.min(512/Math.min(width,height),768/Math.max(width,height));
  return {width:Math.max(32,Math.round(width*scale/32)*32),height:Math.max(32,Math.round(height*scale/32)*32)};
}

export async function localCutout(image){
  const started=performance.now(),key=crypto.createHash('sha256').update(image).digest('hex');
  const now=Date.now();for(const [k,v] of cache)if(now-v.createdAt>5*60_000)cache.delete(k);
  if(cache.has(key))return {image:cache.get(key).image,cached:true,durationMs:Math.round(performance.now()-started),version:CUTOUT_VERSION};
  if(processing)throw new Error('本机正在处理另一张照片，请稍候再试。');
  processing=true;
  try{
    const {data:rgba,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    // Already-cut PNGs need no new inference. Preserve their exact alpha channel.
    let hasTransparent=false,hasVisible=false;
    for(let i=3;i<rgba.length;i+=4){if(rgba[i]<250)hasTransparent=true;if(rgba[i]>10)hasVisible=true;}
    let output;
    if(hasTransparent&&hasVisible){output=await sharp(rgba,{raw:info}).png().toBuffer();}
    else{
      const session=await getSession(),size=mattingSize(info.width,info.height);
      const rgb=await sharp(image).flatten({background:'#fff'}).removeAlpha().resize(size.width,size.height,{fit:'fill'}).raw().toBuffer();
      const pixels=size.width*size.height,tensor=new Float32Array(pixels*3);
      for(let c=0;c<3;c++)for(let i=0;i<pixels;i++)tensor[c*pixels+i]=rgb[i*3+c]/127.5-1;
      const outputs=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',tensor,[1,3,size.height,size.width])});
      const prediction=outputs[session.outputNames[0]],data=prediction.data;
      const maskWidth=prediction.dims.at(-1),maskHeight=prediction.dims.at(-2),mask=Buffer.alloc(maskWidth*maskHeight);
      let visible=0,background=0;
      for(let i=0;i<mask.length;i++){
        if(!Number.isFinite(data[i]))throw new Error('本地抠图未完成，请重试。');
        const value=Math.max(0,Math.min(1,data[i]));mask[i]=Math.round(value*255);
        if(value>.5)visible++;if(value<.1)background++;
      }
      if(visible<mask.length*.003||background<mask.length*.003)throw new Error('未识别出清晰的人像，请使用人物与背景分明的照片。');
      const scale=Math.min(1,1280/Math.max(info.width,info.height)),w=Math.max(1,Math.round(info.width*scale)),h=Math.max(1,Math.round(info.height*scale));
      const alphaSmall=await sharp(mask,{raw:{width:maskWidth,height:maskHeight,channels:1}}).resize(w,h,{kernel:'linear'}).toColourspace('b-w').raw().toBuffer();
      const guide=await sharp(image).removeAlpha().resize(w,h).raw().toBuffer();
      const refined=refineAlpha(guide,alphaSmall,w,h);
      const alpha=await sharp(refined,{raw:{width:w,height:h,channels:1}}).resize(info.width,info.height,{kernel:'linear'}).toColourspace('b-w').raw().toBuffer();
      for(let i=0;i<info.width*info.height;i++)rgba[i*4+3]=Math.round(rgba[i*4+3]*alpha[i]/255);
      output=await sharp(rgba,{raw:info}).png().toBuffer();
    }
    cache.set(key,{image:output,createdAt:Date.now()});while(cache.size>4)cache.delete(cache.keys().next().value);
    return {image:output,cached:false,durationMs:Math.round(performance.now()-started),version:CUTOUT_VERSION};
  }finally{processing=false;}
}
