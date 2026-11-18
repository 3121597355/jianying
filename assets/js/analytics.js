import {siteSettings} from './site-settings.js';
import {createVisitTracker} from './visit-tracker.js';
import {captureAttribution,surveyAttribution} from './attribution.js';
import {ANALYTICS_PAGES} from './public-pages.js';
import {analyticsExcluded,setAnalyticsExclusion} from './analytics-policy.js';
let storage,session;
try{storage=window.localStorage;}catch{}
try{session=window.sessionStorage;}catch{}
if(new URLSearchParams(location.search).has('adminPreview'))setAnalyticsExclusion(true,{document,storage,session});
const isExcluded=()=>analyticsExcluded({hostname:location.hostname,userAgent:navigator.userAgent,webdriver:navigator.webdriver,search:location.search,cookie:document.cookie,storage,session});
let visitor='';
try{visitor=sessionStorage.getItem('jianying:visit')||crypto.randomUUID();sessionStorage.setItem('jianying:visit',visitor);}catch{}
const route=({'/index.html':'/','/resume.html':'/resume/'})[location.pathname]||location.pathname;
const enabled=siteSettings?.analytics?.enabled!==false&&!isExcluded()&&Object.hasOwn(ANALYTICS_PAGES,route);
let tracker,editStarted=false;
if(enabled)tracker=createVisitTracker({document,window,route,now:()=>performance.now(),makeId:()=>crypto.randomUUID(),onRestore:()=>{editStarted=false;track('page_view');},send:(snapshot,beacon)=>{
  if(isExcluded())return;
  const payload=JSON.stringify({...snapshot,visitor});
  if(beacon){try{if(navigator.sendBeacon?.('/api/analytics/visit',new Blob([payload],{type:'application/json'})))return;}catch{}}
  void fetch('/api/analytics/visit',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:payload}).catch(()=>{});
}});
export function track(type,templateId){
  if(!enabled||isExcluded())return;
  const device=/iPad|Tablet/i.test(navigator.userAgent)?'tablet':/Mobile|Android/i.test(navigator.userAgent)?'mobile':'desktop';
  // Fixed event names only; never read the resume, photo, contact details or draft storage.
  let referrer='';try{referrer=new URL(document.referrer).origin;}catch{}
  let storage;try{storage=window.sessionStorage;}catch{}
  const attribution=captureAttribution({search:location.search,referrer,origin:location.origin,storage});
  void fetch('/api/analytics/event',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({type,path:route,visitor,device,referrer,templateId,attribution,visitId:tracker?.visitId})}).catch(()=>{});
}
track('page_view');
document.addEventListener('click',event=>{if(event.isTrusted&&event.target?.closest?.('a.support-nav-link'))track('support_entry_click');});
if(route==='/resume/')document.addEventListener('input',event=>{if(!editStarted&&event.isTrusted&&event.target?.closest?.('#formHost')){editStarted=true;track('resume_edit_start');}});
// 站内自报来源：只接受固定来源标签，附在同一个匿名会话上。
export function trackSourceSurvey(source){
  if(!enabled||isExcluded())return;
  const attribution=surveyAttribution(String(source||''));
  if(!attribution)return;
  const device=/iPad|Tablet/i.test(navigator.userAgent)?'tablet':/Mobile|Android/i.test(navigator.userAgent)?'mobile':'desktop';
  void fetch('/api/analytics/event',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'source_survey',path:route,visitor,device,attribution,visitId:tracker?.visitId})}).catch(()=>{});
}
