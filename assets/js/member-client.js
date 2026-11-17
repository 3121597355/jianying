import {installGithubNav} from './github-nav.js?v=20261115-github';
let status=null;
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function getMember(){return status;}
export function setMember(value){status=value;window.dispatchEvent(new CustomEvent('member-change',{detail:value}));return value;}
export async function memberRequest(route,method='GET',input,{signal}={}){
  const response=await fetch('/api/member/'+route,{method,credentials:'same-origin',cache:'no-store',headers:{...(input!==undefined?{'Content-Type':'application/json'}:{}),...(status?.csrf?{'X-Member-Token':status.csrf}:{})},...(input!==undefined?{body:JSON.stringify(input)}:{}),signal:signal||AbortSignal.timeout(route==='tailor'?55000:12000)});
  let data;try{data=await response.json();}catch{throw Error('服务暂时不可用，请稍后再试。');}
  if(!response.ok){if(response.status===401)setMember({...status,authenticated:false,csrf:''});throw Object.assign(Error(data.error||'操作未完成，请重试。'),{status:response.status,code:data.code,quota:data.quota});}
  return data;
}
export async function refreshMember(){return setMember(await memberRequest('status'));}
export function loginLink(returnTo=location.pathname+location.search){return '/account/?return='+encodeURIComponent(returnTo);}
export function safeReturn(value){try{const url=new URL(value||'/resume/',location.origin);return url.origin===location.origin&&['/','/resume/','/portrait/'].includes(url.pathname)?url.pathname+url.search:'/resume/';}catch{return '/resume/';}}
export function downloadJson(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function dialog(title,content,{wide=false,onClose}={}){
  const element=document.createElement('dialog');element.className='member-dialog'+(wide?' member-wide':'');
  element.innerHTML=`<header class="member-dialog-head"><h2>${escape(title)}</h2><button type="button" class="member-close" aria-label="关闭">×</button></header><div class="member-dialog-body">${content}</div>`;
  const trigger=document.activeElement;
  element.querySelector('.member-close').onclick=()=>element.close();
  element.addEventListener('click',event=>{if(event.target===element){const bounds=element.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)element.close();}});
  element.addEventListener('close',()=>{onClose?.();element.remove();trigger?.focus?.({preventScroll:true});});
  document.body.append(element);element.showModal();return element;
}

export function installMemberNav(root=document){
  installGithubNav(root);
  root.querySelectorAll('[data-member-link]').forEach(link=>{const label=status?.authenticated?'个人中心':'登录 / 注册';link.href='/account/';if(link.hasAttribute('data-member-icon'))link.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg><span>'+label+'</span>';else link.textContent=label;link.setAttribute('aria-label',label);link.title=status?.authenticated?'管理云端简历与账户':'登录或免费注册，保存云端简历';});
}
