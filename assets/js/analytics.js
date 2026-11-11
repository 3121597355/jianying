import {siteSettings} from './site-settings.js';
import {createVisitTracker} from './visit-tracker.js';
let visitor='';
try{visitor=sessionStorage.getItem('jianying:visit')||crypto.randomUUID();sessionStorage.setItem('jianying:visit',visitor);}catch{}
const route=({'/index.html':'/','/resume.html':'/resume/'})[location.pathname]||location.pathname;
let preview=new URLSearchParams(location.search).has('adminPreview');
try{if(preview)sessionStorage.setItem('jianying:admin-preview','1');preview ||= sessionStorage.getItem('jianying:admin-preview')==='1';}catch{}
const enabled=siteSettings?.analytics?.enabled!==false&&!preview&&['/','/resume/','/portrait/'].includes(route);
let tracker,editStarted=false;
if(enabled)tracker=createVisitTracker({document,window,route,now:()=>performance.now(),makeId:()=>crypto.randomUUID(),onRestore:()=>{editStarted=false;track('page_view');},send:(snapshot,beacon)=>{
  const payload=JSON.stringify({...snapshot,visitor});
  if(beacon){try{if(navigator.sendBeacon?.('/api/analytics/visit',new Blob([payload],{type:'application/json'})))return;}catch{}}
  void fetch('/api/analytics/visit',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:payload}).catch(()=>{});
}});
export function track(type,templateId){
  if(!enabled)return;
  const device=/iPad|Tablet/i.test(navigator.userAgent)?'tablet':/Mobile|Android/i.test(navigator.userAgent)?'mobile':'desktop';
  // Fixed event names only; never read the resume, photo, contact details or draft storage.
  let referrer='';try{referrer=new URL(document.referrer).origin;}catch{}
  void fetch('/api/analytics/event',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({type,path:route,visitor,device,referrer,templateId,visitId:tracker?.visitId})}).catch(()=>{});
}
track('page_view');
if(route==='/resume/')document.addEventListener('input',event=>{if(!editStarted&&event.isTrusted&&event.target?.closest?.('#formHost')){editStarted=true;track('resume_edit_start');}});
