// Optional edge corrections: opaque face/body pixels always keep their RGB.
export function adjustEdgePixels(source,width,height,{edge=0,decontam=0}={}){
  const output=new Uint8ClampedArray(source),exponent=Math.exp(Math.max(-20,Math.min(20,Number(edge)||0))/20);
  const strength=Math.max(0,Math.min(1,(Number(decontam)||0)/100));
  for(let i=0;i<width*height;i++){
    const offset=i*4,alpha=source[offset+3]/255;
    if(alpha===0||alpha===1)continue;
    output[offset+3]=Math.round(255*Math.pow(alpha,exponent));
    if(!strength||alpha<.02)continue;
    const x=i%width,y=Math.floor(i/width);let neighbor=-1;
    for(const radius of [1,2,4,8,12]){
      for(const [dx,dy]of [[-radius,0],[radius,0],[0,-radius],[0,radius],[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]]){
        const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;
        const candidate=(ny*width+nx)*4;if(source[candidate+3]>=250){neighbor=candidate;break;}
      }
      if(neighbor>=0)break;
    }
    if(neighbor<0)continue;
    const blend=strength*(1-alpha);
    for(let c=0;c<3;c++)output[offset+c]=Math.round(source[offset+c]*(1-blend)+source[neighbor+c]*blend);
  }
  return output;
}

const pixelsCache=new WeakMap(),adjustedCache=new WeakMap();
export function adjustedCutout(cutout,options){
  if(!Number(options.edge)&&!Number(options.decontam))return cutout;
  const key=`${options.edge}:${options.decontam}`,existing=adjustedCache.get(cutout);
  if(existing?.key===key)return existing.canvas;
  const width=cutout.naturalWidth,height=cutout.naturalHeight;
  let raw=pixelsCache.get(cutout);
  if(!raw){const source=document.createElement('canvas');source.width=width;source.height=height;const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(cutout,0,0);raw=ctx.getImageData(0,0,width,height).data;pixelsCache.set(cutout,raw);}
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  canvas.getContext('2d').putImageData(new ImageData(adjustEdgePixels(raw,width,height,options),width,height),0,0);
  adjustedCache.set(cutout,{key,canvas});return canvas;
}
