import {safeReturn,installMemberNav,refreshMember} from './member-client.js';
import {consumeSupportConfirmation} from './support-choice.js';
import {normalizeSupport} from './support-config.js';
const returnTo=safeReturn(new URLSearchParams(location.search).get('return')||'/resume/');
let context=null;try{context=consumeSupportConfirmation(sessionStorage);}catch{}
const main=document.querySelector('.support-thanks-main');
const backToSupport=()=>location.replace('/plans/?return='+encodeURIComponent(returnTo));
if(!context){backToSupport();}else{
document.querySelector('[data-return]').href=returnTo;
installMemberNav();void refreshMember().then(()=>installMemberNav()).catch(()=>{});
main.hidden=false;
window.addEventListener('pagehide',()=>{main.hidden=true;});
window.addEventListener('pageshow',event=>{if(event.persisted){main.hidden=true;backToSupport();}});
const note=document.querySelector('[data-thanks-choice]');
const thanksImage=document.querySelector('[data-thanks-image]');
thanksImage.onerror=()=>{thanksImage.hidden=true;document.querySelector('.thanks-emoji').hidden=false;};
note.textContent='你选的「'+context.name+'」· ¥'+context.amount+'，这份心意让我很有动力。';note.hidden=false;
// Invalid entry never loads the page-view tracker or becomes a thank-you event.
void import('./analytics.js').then(({track})=>track('support_thanks_view')).catch(()=>{});
try{const response=await fetch('/api/site-config',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(response.ok){const {support}=await response.json(),config=normalizeSupport(support);if(config.thanksImage){thanksImage.src=config.thanksImage;thanksImage.hidden=false;document.querySelector('.thanks-emoji').hidden=true;}}}catch{}
const theme=document.querySelector('#thanksTheme');
function paint(){theme.textContent=document.documentElement.dataset.theme==='dark'?'☼':'◐';theme.setAttribute('aria-label',document.documentElement.dataset.theme==='dark'?'切换浅色模式':'切换深色模式');}paint();
theme.onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';paint();try{const ui=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}');ui.theme=document.documentElement.dataset.theme;localStorage.setItem('qmj-clone:ui',JSON.stringify(ui));}catch{}};
}
