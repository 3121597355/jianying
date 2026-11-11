// Foreground-visible time only. No field values, pointer paths or keyboard contents are read.
export function createVisitTracker({document,window,now,makeId,send,onRestore=()=>{},route}){
  let id=makeId(),sequence=0,visibleMs=0,visibleSince=document.visibilityState==='visible'?now():null,nextPath='',stopped=false;
  function accrue(){if(visibleSince!==null){const at=now();visibleMs+=Math.max(0,Math.min(at-visibleSince,60000));visibleSince=at;}}
  function checkpoint(reason='checkpoint',beacon=false){if(stopped)return;accrue();send({visitId:id,seq:++sequence,path:route,visibleMs:Math.round(visibleMs),reason,nextPath},beacon);}
  function visibility(){
    if(document.visibilityState==='hidden'){checkpoint('hidden',true);visibleSince=null;}
    else if(!stopped){visibleSince=now();checkpoint();}
  }
  function leave(){checkpoint('end',true);stopped=true;visibleSince=null;}
  function restore(event){if(!event.persisted)return;id=makeId();sequence=0;visibleMs=0;nextPath='';stopped=false;visibleSince=document.visibilityState==='visible'?now():null;checkpoint();onRestore();}
  function navigation(event){const anchor=event.target?.closest?.('a[href]');if(!anchor||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||anchor.download||anchor.target&&anchor.target!=='_self')return;try{const target=new URL(anchor.href,window.location.href);if(target.origin!==window.location.origin)return;const normalized=({'/index.html':'/','/resume':'/resume/','/resume.html':'/resume/','/portrait':'/portrait/'})[target.pathname]||target.pathname;if(['/','/resume/','/portrait/'].includes(normalized)&&!(target.pathname===window.location.pathname&&target.search===window.location.search&&target.hash))nextPath=normalized;}catch{}}
  document.addEventListener('visibilitychange',visibility);
  document.addEventListener('click',navigation);
  window.addEventListener('pagehide',leave);
  window.addEventListener('pageshow',restore);
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')checkpoint();},15000);
  checkpoint();
  return {get visitId(){return id;},checkpoint,destroy(){window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('click',navigation);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',restore);stopped=true;}};
}
