export const quickIds=new Set(['white','blue','red','light-blue','gray','custom','gradient-blue','gradient-gray','gradient-warm','gradient-navy','transparent']);
const colors={white:'#ffffff',blue:'#438edb',red:'#d94343','light-blue':'#a9d5f1',gray:'#d9dde2'};
import {adjustedCutout} from './edge-adjust.js';
export function drawQuickBackground(canvas,cutout,{presetId,customColor,edge=0,decontam=0}){
  if(!quickIds.has(presetId))throw new Error('该背景需要 AI 场景生成。');
  const w=cutout.naturalWidth,h=cutout.naturalHeight;canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);
  if(presetId!=='transparent'){
    let fill=colors[presetId]||(presetId==='custom'?customColor:null);
    if(presetId.startsWith('gradient-')){
      const radial=['gradient-gray','gradient-navy'].includes(presetId);
      fill=radial?ctx.createRadialGradient(w*.5,h*.35,0,w*.5,h*.35,Math.max(w,h)*.85):ctx.createLinearGradient(0,0,0,h);
      const stops={'gradient-blue':['#7fb5e9','#e3f2ff'],'gradient-gray':['#f2f3f5','#a6b0be'],'gradient-warm':['#e5c5ad','#fff3e6'],'gradient-navy':['#42688b','#1b2b42']}[presetId];
      fill.addColorStop(0,stops[0]);fill.addColorStop(1,stops[1]);
    }
    ctx.fillStyle=fill;ctx.fillRect(0,0,w,h);
  }
  ctx.drawImage(adjustedCutout(cutout,{edge,decontam}),0,0);return canvas;
}
