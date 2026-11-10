import {siteSettings} from './site-settings.js';
let visitor='';
try{visitor=sessionStorage.getItem('jianying:visit')||crypto.randomUUID();sessionStorage.setItem('jianying:visit',visitor);}catch{}
const route=({'/index.html':'/','/resume.html':'/resume/'})[location.pathname]||location.pathname;
const preview=new URLSearchParams(location.search).has('adminPreview');
export function track(type,templateId){
  if(siteSettings?.analytics?.enabled===false||preview||!['/','/resume/','/portrait/'].includes(route))return;
  const device=/iPad|Tablet/i.test(navigator.userAgent)?'tablet':/Mobile|Android/i.test(navigator.userAgent)?'mobile':'desktop';
  // Fixed event names only; never read the resume, photo, contact details or draft storage.
  let referrer='';try{referrer=new URL(document.referrer).origin;}catch{}
  void fetch('/api/analytics/event',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({type,path:route,visitor,device,referrer,templateId})}).catch(()=>{});
}
track('page_view');
