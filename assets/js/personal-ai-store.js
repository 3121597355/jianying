const loopback=/^(localhost|127\.0\.0\.1|\[::1\])$/i;
const host=()=>{try{return typeof location==='undefined'?'':String(location.hostname||'');}catch{return '';}};
const storage=()=>{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}};
export const localDeploy=()=>loopback.test(host());
export const storageKey=kind=>'yizhi:personal-ai:'+kind;
export function rememberLocal(kind,value){
  const store=storage();if(!store||!localDeploy())return;
  try{if(value)store.setItem(storageKey(kind),JSON.stringify(value));else store.removeItem(storageKey(kind));}catch{}
}
export function storedLocal(kind){
  const store=storage();if(!store||!localDeploy())return null;
  try{const value=JSON.parse(store.getItem(storageKey(kind))||'null');return value&&value.baseUrl&&value.apiKey&&value.model?value:null;}catch{return null;}
}
