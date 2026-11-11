// Raster fallbacks use the site's existing vector mark, including mobile bookmarks.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const directory = new URL('../assets/img/brand/', import.meta.url);
const source = await readFile(new URL('mark-mono.svg', directory));
for (const [file, size] of [['favicon-32.png',32],['favicon.png',64],['icon.png',256],['apple-touch-icon.png',180]]) {
  let image = sharp(source).resize(size,size);
  if (file === 'apple-touch-icon.png') image = image.flatten({ background: '#1b1c20' });
  await image.png().toFile(fileURLToPath(new URL(file,directory)));
}
const sizes = [16,32,48];
// Classic uncompressed DIB frames are also understood by older mobile ICO decoders.
const images = await Promise.all(sizes.map(async size=>{
  const rgba = await sharp(source).resize(size,size).ensureAlpha().raw().toBuffer();
  const maskStride = Math.ceil(size/32)*4;
  const frame = Buffer.alloc(40 + size*size*4 + maskStride*size);
  frame.writeUInt32LE(40,0); frame.writeInt32LE(size,4); frame.writeInt32LE(size*2,8);
  frame.writeUInt16LE(1,12); frame.writeUInt16LE(32,14); frame.writeUInt32LE(frame.length-40,20);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const pixel=(y*size+x)*4, row=size-1-y, dest=40+(row*size+x)*4;
    frame[dest]=rgba[pixel+2];frame[dest+1]=rgba[pixel+1];frame[dest+2]=rgba[pixel];frame[dest+3]=rgba[pixel+3];
    if(rgba[pixel+3]<128)frame[40+size*size*4+row*maskStride+(x>>3)]|=0x80>>(x%8);
  }
  return frame;
}));
const header = Buffer.alloc(6 + images.length*16);
header.writeUInt16LE(1,2); header.writeUInt16LE(images.length,4);
let offset=header.length;
images.forEach((image,index)=>{
  const entry=6+index*16;
  header[entry]=sizes[index]; header[entry+1]=sizes[index];
  header.writeUInt16LE(1,entry+4); header.writeUInt16LE(32,entry+6);
  header.writeUInt32LE(image.length,entry+8); header.writeUInt32LE(offset,entry+12);
  offset+=image.length;
});
await writeFile(new URL('favicon.ico',directory),Buffer.concat([header,...images]));
console.log('Built matching PNG, ICO and Apple touch icons from mark-mono.svg');
