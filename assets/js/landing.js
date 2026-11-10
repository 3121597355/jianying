import {animateDisclosure,applyMotionPreference} from './motion.js';
import {SITE_LINKS} from './site-config.js';
import {setupLandingMotion} from './landing-motion.js';
import {siteSettings} from './site-settings.js';
import {track} from './analytics.js';
const $ = selector => document.querySelector(selector);
if(siteSettings?.site) {
  const site=siteSettings.site;
  document.title=site.title;
  $('.hero-kicker').textContent=site.kicker;
  const lines=site.headline.split('\n'),headline=$('.hero h1');headline.replaceChildren();
  lines.forEach((line,index)=>{if(index){headline.append(document.createElement('br'));const node=document.createElement('span');node.textContent=line;headline.append(node);}else headline.append(document.createTextNode(line));});
  $('.hero-description').textContent=site.description;$('.hero-description').style.whiteSpace='pre-line';
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const featured=siteSettings.templates.filter(t=>t.enabled&&t.featured).slice(0,4);
  $('.template-grid').innerHTML=featured.map(t=>`<article class="template-card"><button type="button" class="template-preview" data-preview="${t.id}" data-name="${escape(t.name)}" aria-label="预览${escape(t.name)}模板"><img loading="lazy" src="${escape(t.thumbnail)}" alt="${escape(t.name)}模板的示例简历" width="820" height="1160"><span class="preview-label">放大预览 ↗</span></button><div class="template-caption"><div><h3>${escape(t.name)}</h3><p>${escape(t.desc)}</p></div><a href="/resume/?template=${t.id}" aria-label="使用${escape(t.name)}模板">↗</a></div></article>`).join('');
  $('.templates-section').hidden=featured.length===0;
  $('.section-note').textContent=`${siteSettings.templates.filter(t=>t.enabled).length}套基础版式，也可以把自己的配色、字体和间距保存为自定义模板。`;
}
try {
  const github=siteSettings?.site?.github??SITE_LINKS.github;
  if(github) {
    const address=new URL(github);
    if(address.protocol==='https:' && address.hostname==='github.com' && !address.username && !address.password && address.pathname!=='/') {
      document.querySelectorAll('[data-github]').forEach(link=>{link.href=address.href;link.hidden=false;});
      const repository=address.pathname.split('/').filter(Boolean).length>=2;
      $('.github-link span').textContent=repository?'Star on GitHub':'GitHub';
      $('.github-link').setAttribute('aria-label',repository?'打开 GitHub 仓库，可 Star 或下载代码（新窗口）':'打开 GitHub 主页（新窗口）');
      $('.mobile-github').firstChild.textContent=repository?'GitHub · Star / 下载':'GitHub 主页';
    }
  }
} catch {}
const themeButton = $('.theme-toggle');
const menuButton = $('.menu-toggle');
const mainNav = $('#mainNav');
function closeMenu() {
  menuButton.setAttribute('aria-expanded','false');
  menuButton.setAttribute('aria-label','打开导航菜单');
  mainNav.classList.remove('is-open');
}
menuButton.addEventListener('click',()=>{
  const open=menuButton.getAttribute('aria-expanded')!=='true';
  menuButton.setAttribute('aria-expanded',String(open));
  menuButton.setAttribute('aria-label',open?'关闭导航菜单':'打开导航菜单');
  mainNav.classList.toggle('is-open',open);
});
mainNav.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
document.addEventListener('click',event=>{if(!event.target.closest('.header-inner'))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuButton.getAttribute('aria-expanded')==='true'){closeMenu();menuButton.focus();}});
matchMedia('(max-width:700px)').addEventListener('change',closeMenu);
function paintTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
  themeButton.setAttribute('aria-pressed', String(dark));
  $('meta[name="theme-color"]').content=dark?'#15171c':'#ffffff';
  themeButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${dark ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>' : '<path d="M20.5 13a8.6 8.6 0 0 1-9.5-9.5A8.6 8.6 0 1 0 20.5 13Z"/>'}</svg>`;
}
themeButton.onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try {const ui=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}');ui.theme=theme;localStorage.setItem('qmj-clone:ui',JSON.stringify(ui));} catch {}
  paintTheme();
};
paintTheme();

function updateDraft() {
  try {
    const draft=JSON.parse(localStorage.getItem('qmj-clone:resume')||'null');
    const basic=draft?.basicInfo;
    const hasDraft=basic && ([basic.name,basic.mobile,basic.email,basic.photo].some(Boolean) || draft.moduleData?.some(m=>m.content || m.data?.job || (Array.isArray(m.data)&&m.data.some(x=>x?.name||x?.content))));
    if (!hasDraft) return;
    document.querySelectorAll('[data-start] .button-label').forEach(label=>{label.textContent='继续编辑简历';});
    $('#draftNote').textContent='已有草稿，随时可以接着编辑。';
  } catch {}
}
updateDraft();
window.addEventListener('pageshow',updateDraft);
window.addEventListener('storage',event=>{if(event.key==='qmj-clone:resume')updateDraft();if(event.key==='qmj-clone:ui'){try{const ui=JSON.parse(event.newValue||'{}');document.documentElement.dataset.theme=ui.theme==='dark'?'dark':'light';applyMotionPreference(ui.motionMode||'system');paintTheme();}catch{}}});

const dialog=$('#templateDialog');
document.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>{
  const id=button.dataset.preview;
  track('template_preview',Number(id));
  $('#previewTitle').textContent=button.dataset.name;
  $('#previewImage').src=`/assets/img/templates/${id}.png`;
  $('#previewImage').alt=`${button.dataset.name}模板的示例简历`;
  $('#useTemplate').href=`/resume/?template=${id}`;
  dialog.showModal();
}));
$('#closePreview').onclick=()=>dialog.close();
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
document.querySelectorAll('details>summary').forEach(summary=>summary.addEventListener('click',event=>{
  event.preventDefault();
  const details=summary.parentElement;
  animateDisclosure(details,()=>{details.open=!details.open;});
}));
// 兼容旧证件照页面的返回地址，继续把照片应用到编辑器。
if(new URL(location.href).searchParams.get('portrait')==='applied')location.replace('/resume/?portrait=applied');
setupLandingMotion();
