import {trackSourceSurvey} from './analytics.js';
// 平台不允许放带参链接时，用一次性的站内自述兜底。只记录固定来源标签，不采集任何输入内容。
const KEY='yizhi:source-survey:v1';
const OPTIONS=[['xiaohongshu','小红书'],['zhihu','知乎'],['github','GitHub'],['wechat','朋友推荐'],['baidu','搜索引擎'],['other','其他']];
export function askSourceOnce(){
  let done=false;
  try{done=Boolean(localStorage.getItem(KEY));}catch{return;}
  if(done||document.querySelector('[data-source-survey]'))return;
  const bar=document.createElement('div');
  bar.className='source-survey';
  bar.setAttribute('data-source-survey','');
  bar.setAttribute('role','group');
  bar.setAttribute('aria-label','你从哪里知道一纸简历');
  bar.innerHTML=`<span>你从哪里知道一纸简历的？</span>${OPTIONS.map(([value,label])=>`<button type="button" data-answer="${value}">${label}</button>`).join('')}<button type="button" class="source-survey-skip" data-skip>不用了</button>`;
  const remember=()=>{try{localStorage.setItem(KEY,'1');}catch{}bar.remove();};
  bar.querySelectorAll('[data-answer]').forEach(button=>{
    button.addEventListener('click',()=>{trackSourceSurvey(button.dataset.answer);remember();});
  });
  bar.querySelector('[data-skip]').addEventListener('click',remember);
  document.body.append(bar);
  const style=document.createElement('style');
  style.textContent='.source-survey{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:60;display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:min(560px,calc(100vw - 32px));padding:10px 14px;border:1px solid var(--line,#e3e3e8);border-radius:14px;background:var(--surface,#fff);box-shadow:0 10px 30px rgb(0 0 0 / 12%);font-size:13px;color:var(--text,#222);animation:source-survey-in .28s ease-out}.source-survey span{font-weight:600}.source-survey button{border:1px solid var(--line,#e3e3e8);border-radius:999px;background:transparent;padding:4px 12px;font-size:12px;cursor:pointer;color:inherit;transition:background .18s ease,transform .18s ease}.source-survey button:hover{background:var(--hover,#f2f3f7)}.source-survey button:active{transform:scale(.97)}.source-survey-skip{border-color:transparent!important;color:var(--muted,#777)!important}@keyframes source-survey-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.source-survey{animation:none}}@media(max-width:640px){.source-survey{left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));padding:8px 10px;gap:6px;font-size:12px}.source-survey span{flex:1 0 100%}.source-survey button{padding:4px 10px}}';
  document.head.append(style);
}
// 落地页停留一会儿再问一次，避免打断首次阅读；只问一次，关掉就不再出现。
export function scheduleSourceSurvey(delay=15000){
  setTimeout(()=>{if(document.visibilityState==='visible')askSourceOnce();},delay);
}
