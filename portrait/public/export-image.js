// Canvas-generated files receive physical resolution metadata without uploading the download to a server.
const concat=arrays=>{const output=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;for(const array of arrays){output.set(array,offset);offset+=array.length;}return output;};
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const crc=bytes=>{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;};
export function withDpi(input,format,dpi=300){
  const bytes=new Uint8Array(input);
  if(!Number.isInteger(dpi)||dpi<1||dpi>65535)throw Error('Invalid DPI');
  if(format==='png'){
    if(bytes.length<33||!bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i]))throw Error('Invalid PNG');
    const physical=new Uint8Array(21),view=new DataView(physical.buffer);view.setUint32(0,9);physical.set([112,72,89,115],4);const ppm=Math.round(dpi/.0254);view.setUint32(8,ppm);view.setUint32(12,ppm);physical[16]=1;view.setUint32(17,crc(physical.subarray(4,17)));
    const chunks=[bytes.subarray(0,8)];let offset=8;
    while(offset<bytes.length){if(offset+12>bytes.length)throw Error('Invalid PNG chunk');const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0),end=offset+length+12;if(end>bytes.length)throw Error('Invalid PNG chunk');const name=String.fromCharCode(...bytes.subarray(offset+4,offset+8));if(name!=='pHYs'&&name!=='eXIf')chunks.push(bytes.subarray(offset,end));if(name==='IHDR')chunks.push(physical);offset=end;}
    return concat(chunks);
  }
  if(format==='jpeg'){
    if(bytes[0]!==255||bytes[1]!==216)throw Error('Invalid JPEG');
    let offset=2;
    while(offset+4<=bytes.length&&bytes[offset]===255){const marker=bytes[offset+1];if(marker===218||marker===217)break;const length=(bytes[offset+2]<<8)|bytes[offset+3];if(length<2||offset+2+length>bytes.length)throw Error('Invalid JPEG segment');
      if(marker===224&&length>=16&&String.fromCharCode(...bytes.subarray(offset+4,offset+9))==='JFIF\0'){bytes[offset+11]=1;bytes[offset+12]=dpi>>>8;bytes[offset+13]=dpi&255;bytes[offset+14]=dpi>>>8;bytes[offset+15]=dpi&255;return bytes;}offset+=2+length;
    }
    return concat([bytes.subarray(0,2),Uint8Array.from([255,224,0,16,74,70,73,70,0,1,1,1,dpi>>>8,dpi&255,dpi>>>8,dpi&255,0,0]),bytes.subarray(2)]);
  }
  throw Error('Unsupported image format');
}
export async function exportCanvas(canvas,format){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/'+format,.94));if(!blob)throw Error('图片导出失败，请重试。');return new Blob([withDpi(await blob.arrayBuffer(),format)],{type:'image/'+format});}
export function processingImage(image,data,maxBytes){
  if(!maxBytes||data.length<=maxBytes)return data;
  const canvas=document.createElement('canvas'),format=data.startsWith('data:image/jpeg')?'jpeg':'png';let scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  for(let attempt=0;attempt<8;attempt++){canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const encoded=canvas.toDataURL('image/'+format,.9);if(encoded.length<=maxBytes)return encoded;scale*=.75;}
  throw Error('照片过大，请选择尺寸更小的照片。');
}
