import {animateDisclosure,applyMotionPreference} from './motion.js';
import {SITE_LINKS} from './site-config.js';
import {setupLandingMotion,setupMotionToggle} from './landing-motion.js';
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
      document.querySelectorAll('[data-github]').forEach(link=>link.setAttribute('aria-label','查看项目开源代码（新窗口）'));
    }
  }
} catch {}

function updateDraft() {
  let hasDraft=false;
  try {
    const draft=JSON.parse(localStorage.getItem('qmj-clone:resume')||'null');
    const basic=draft?.basicInfo;
    hasDraft=Boolean(basic && ([basic.name,basic.mobile,basic.email,basic.photo].some(Boolean) || draft.moduleData?.some(m=>m.content || m.data?.job || (Array.isArray(m.data)&&m.data.some(x=>x?.name||x?.content)))));
  } catch {}
  document.querySelectorAll('[data-start] .button-label').forEach(label=>{label.textContent='开始编辑简历';});
  $('#draftNote').textContent=hasDraft?'本地草稿已保存，打开后可继续编辑。':'无需注册 · 自动保存 · 随时导出';
}
updateDraft();
window.addEventListener('pageshow',updateDraft);
window.addEventListener('storage',event=>{if(event.key==='qmj-clone:resume')updateDraft();if(event.key==='qmj-clone:ui'){try{const ui=JSON.parse(event.newValue||'{}');document.documentElement.dataset.theme=ui.theme==='dark'?'dark':'light';applyMotionPreference(ui.motionMode||'soft');}catch{}}});

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
setupMotionToggle();
