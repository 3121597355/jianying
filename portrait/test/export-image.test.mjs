import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {withDpi} from '../public/export-image.js';
test('browser PNG export keeps pixels and alpha, replaces DPI metadata and does not duplicate physical chunks',async()=>{
  const original=await sharp({create:{width:75,height:105,channels:4,background:{r:120,g:50,b:30,alpha:.4}}}).withMetadata({density:72}).png().toBuffer();
  const result=Buffer.from(withDpi(original,'png')),metadata=await sharp(result).metadata();assert.equal(metadata.density,300);assert.equal(metadata.width,75);assert.equal(metadata.height,105);assert(metadata.hasAlpha);assert.deepEqual(await sharp(result).raw().toBuffer(),await sharp(original).raw().toBuffer());assert.equal(result.toString('latin1').split('pHYs').length,2);assert.deepEqual(Buffer.from(withDpi(result,'png')),result);
});
test('browser JPEG export updates JFIF density without recompressing image data',async()=>{
  const original=await sharp({create:{width:75,height:105,channels:3,background:'#456789'}}).jpeg().toBuffer();const result=Buffer.from(withDpi(original,'jpeg'));assert.equal((await sharp(result).metadata()).density,300);assert.deepEqual(await sharp(result).raw().toBuffer(),await sharp(original).raw().toBuffer());assert.deepEqual(Buffer.from(withDpi(result,'jpeg')),result);assert.throws(()=>withDpi(new Uint8Array(3),'png'));assert.throws(()=>withDpi(original,'jpeg',0));
});
