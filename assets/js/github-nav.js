import {SITE_LINKS} from './site-config.js';
const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.76-.24.76-.54v-2.1c-3.12.68-3.78-1.33-3.78-1.33-.51-1.29-1.25-1.63-1.25-1.63-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.15 1.72 1.15 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.22.71-1.5-2.49-.28-5.1-1.25-5.1-5.54 0-1.22.43-2.22 1.15-3-.12-.29-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.67.11 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.62 5.26-5.11 5.54.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"/></svg>';
let settingsPromise;
function paint(root,value){
  let address=null;
  try{const url=new URL(value);if(url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&!url.port&&url.pathname!=='/')address=url.href;}catch{}
  root.querySelectorAll('[data-github]').forEach(link=>{link.hidden=!address;if(address)link.href=address;});
}
export function installGithubNav(root=document){
  const actions=root.querySelector('.header-actions,.account-header-actions,.top-actions,.get_list');
  if(!actions)return;
  if(!actions.querySelector('.github-nav-link')){
    const link=document.createElement('a');link.className='github-nav-link';link.dataset.github='';link.href=SITE_LINKS.github;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','GitHub 源码与 Star（新窗口）');link.title='GitHub · 源码与 Star';link.innerHTML=icon+'<span>GitHub</span>';
    const support=actions.querySelector('.support-nav-link');
    if(actions.matches('.get_list')){const item=document.createElement('li');item.className='member-nav-item github-editor-item';item.append(link);if(support)support.closest('li').after(item);else actions.prepend(item);}
    else if(support)support.after(link);else actions.prepend(link);
  }
  if(!settingsPromise)settingsPromise=fetch('/api/site-config',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(response=>response.ok?response.json():null).catch(()=>null);
  const mobileNav=root.querySelector('.site-header nav');
  if(mobileNav&&!mobileNav.querySelector('.mobile-github-link')){
    const mobile=actions.querySelector('.github-nav-link').cloneNode(true);
    mobile.classList.add('mobile-github-link');mobile.querySelector('span').textContent='GitHub 源码';
    mobileNav.append(mobile);
  }
  void settingsPromise.then(settings=>paint(root,settings?.site?.github??SITE_LINKS.github));
}
