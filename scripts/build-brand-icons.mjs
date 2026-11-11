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
const images = await Promise.all(sizes.map(size=>sharp(source).resize(size,size).png().toBuffer()));
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
