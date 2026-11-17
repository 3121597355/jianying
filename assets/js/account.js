import './analytics.js';
import {quotaText} from './member-quota.js';
import {createResumeDialog} from './resume-create.js';
import {memberRequest,refreshMember,getMember,setMember,escape,safeReturn,dialog,downloadJson,installMemberNav} from './member-client.js';
const main=document.querySelector('#accountMain');
const returnTo=safeReturn(new URLSearchParams(location.search).get('return'));
let mode='login';
let savedResumes=[],resumeLimit=10,filter='all',query='',dashboardReady=false;
const paths={
  file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  settings:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  edit:'<path d="m16 3 5 5-12 12H4v-5zM13 6l5 5"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  logout:'<path d="M9 4H4v16h5M9 12h12m-5-5 5 5-5 5"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  key:'<circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-2-2 3-3m-6 0 3-3"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  moon:'<path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5A9 9 0 1 0 20.5 13z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
};
const icon=name=>`<svg class="account-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.file}</svg>`;
const themeButton=document.querySelector('#accountTheme');
function updateThemeButton(){const dark=document.documentElement.dataset.theme==='dark';themeButton.innerHTML=icon(dark?'sun':'moon');themeButton.setAttribute('aria-label',dark?'切换浅色模式':'切换深色模式');themeButton.title=dark?'切换浅色模式':'切换深色模式';}
themeButton.onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{const ui=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}');localStorage.setItem('qmj-clone:ui',JSON.stringify({...ui,theme}));}catch{}updateThemeButton();};
window.addEventListener('storage',event=>{if(event.key==='qmj-clone:ui'){try{document.documentElement.dataset.theme=JSON.parse(event.newValue||'{}').theme==='dark'?'dark':'light';updateThemeButton();}catch{}}});
updateThemeButton();
installMemberNav(document.querySelector('header'));
window.addEventListener('member-change',()=>installMemberNav(document.querySelector('header')));
const format=value=>new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(new Date(value));
function errorAt(host,error){const box=host.querySelector('[data-error]');box.hidden=false;box.textContent=error.message||String(error);}
function recoveryView(code,done){
  const box=dialog('保存你的账户恢复码',`<p>忘记密码时，用用户名和这个恢复码重设密码。恢复码只显示这一次，请保存在自己的密码管理器或安全位置。</p><p class="member-recovery">${escape(code)}</p><p class="member-muted">不要发送给其他人或提交到 GitHub；丢失密码和恢复码后，目前无法找回账户。</p><div class="member-actions"><button type="button" class="member-button" data-copy>复制恢复码</button><button type="button" class="member-button primary" data-done>我已保存</button></div>`,{onClose:done});
  box.querySelector('[data-copy]').onclick=async event=>{try{await navigator.clipboard.writeText(code);event.target.textContent='已复制';}catch{event.target.textContent='请选中上方恢复码手动复制';}};
  box.querySelector('[data-done]').onclick=()=>box.close();
}
function authView(){
  dashboardReady=false;
  const recovering=mode==='recover',registering=mode==='register';
  main.innerHTML=`<section class="member-card member-auth"><p class="member-kicker">一纸简历 · 免费账户</p><h1>${recovering?'找回账户':'把简历留在这里'}</h1><p class="member-muted">${recovering?'用注册时保存的恢复码重设密码。':'保存云端版本，换台设备继续写。基础编辑与导出无需登录。'}</p>${recovering?'':`<div class="member-tabs" role="tablist" aria-label="账户操作"><button type="button" role="tab" data-mode="login" aria-selected="${!registering}">登录</button><button type="button" role="tab" data-mode="register" aria-selected="${registering}">免费注册</button></div>`}<form class="member-form" id="authForm"><label>用户名<input name="username" autocomplete="username" minlength="3" maxlength="32" pattern="[a-zA-Z0-9][a-zA-Z0-9_.\\-]{2,31}" placeholder="例如 your_name" required><small>3～32 位字母、数字、点、横线或下划线。</small></label>${registering?'<label>昵称<span class="member-muted">（选填）</span><input name="nickname" autocomplete="nickname" maxlength="40" placeholder="希望怎么称呼你"></label>':''}${recovering?'<label>账户恢复码<input name="recoveryCode" autocomplete="off" maxlength="80" placeholder="YZ-…" required></label>':''}<label>${recovering?'新密码':'密码'}<input name="password" type="password" autocomplete="${registering||recovering?'new-password':'current-password'}" minlength="10" maxlength="128" required><small>10～128 个字符，建议使用独立的长密码。</small></label>${registering||recovering?'<label>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>':''}${registering?'<label class="member-check"><input name="acceptPrivacy" type="checkbox" required><span>我已阅读<a href="/privacy/" target="_blank" rel="noopener">隐私说明</a>。注册仅建立账户，云端保存由我主动开启。</span></label>':''}<p class="member-error" data-error hidden role="alert"></p><button class="member-button primary" type="submit">${recovering?'重设密码':registering?'注册并保存恢复码':'登录'}</button></form><div class="member-auth-foot"><a href="${escape(returnTo)}">继续免费编辑</a><button type="button" class="member-text-button" data-mode="${recovering?'login':'recover'}">${recovering?'返回登录':'忘记密码？'}</button></div></section>`;
  main.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;authView();});
  main.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),input=Object.fromEntries(new FormData(form));
    form.querySelector('[data-error]').hidden=true;
    if(input.confirmPassword!==undefined&&input.password!==input.confirmPassword){errorAt(form,Error('两次密码不一致。'));return;}
    button.disabled=true;
    try{
      input.acceptPrivacy=input.acceptPrivacy==='on';
      const result=await memberRequest(mode==='register'?'register':mode==='recover'?'recover':'login','POST',input);
      form.reset();
      if(recovering){recoveryView(result.recoveryCode,()=>{mode='login';authView();});}
      else{setMember(result);if(registering)recoveryView(result.recoveryCode,()=>void dashboard());else await dashboard();}
    }catch(error){errorAt(form,error);}
    finally{button.disabled=false;}
  };
}

async function dashboard(){
  const member=getMember();if(!member?.authenticated){authView();return;}
  if(!dashboardReady)main.innerHTML='<p class="account-loading" role="status">正在读取你的简历…</p>';
  try{
    const {resumes,limit}=await memberRequest('resumes');
    savedResumes=resumes;resumeLimit=limit;dashboardReady=true;renderDashboard();
  }catch(error){main.innerHTML='<p class="member-error" data-error role="alert"></p><button class="member-button" data-retry>重试</button>';errorAt(main,error);main.querySelector('[data-retry]').onclick=()=>void refreshMember().then(dashboard).catch(()=>authView());}
}
function editorLink(){
  // Respect this device's active version when it belongs to the signed-in account.
  let active;try{active=JSON.parse(localStorage.getItem('yizhi:cloud-link')||'null');}catch{}
  const selected=savedResumes.find(item=>item.id===active?.id)||savedResumes[0];
  return selected?'/resume/?cloud='+encodeURIComponent(selected.id):'/resume/';
}
function renderDashboard(){
  const member=getMember();if(!member?.authenticated){authView();return;}
  const settings=location.hash==='#settings';
  main.innerHTML=`<div class="account-shell"><aside class="account-sidebar" aria-label="账户导航"><div class="account-identity"><span class="account-avatar" aria-hidden="true">${escape(Array.from(member.user.nickname||member.user.username)[0])}</span><div class="account-identity-text"><strong title="${escape(member.user.nickname)}">${escape(member.user.nickname)}</strong><span title="${escape(member.user.username)}">@${escape(member.user.username)}</span></div></div><nav class="account-navigation" aria-label="个人工作区"><a href="#resumes" ${settings?'':'aria-current="page"'}>${icon('file')}我的简历</a><a href="#settings" ${settings?'aria-current="page"':''}>${icon('settings')}账户设置</a></nav><div class="account-side-foot"><button class="account-logout" type="button" data-logout>${icon('logout')}退出登录</button><a href="/privacy/" target="_blank" rel="noopener">隐私与数据说明 ↗</a></div></aside><div class="account-content"><p class="member-error" data-error hidden role="alert"></p>${settings?settingsView(member):resumesView(member)}<p class="account-notice" role="status" aria-live="polite" data-notice></p></div></div>`;
  main.querySelectorAll('[data-logout]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await memberRequest('logout','POST',{});try{localStorage.removeItem('yizhi:cloud-link');}catch{}setMember({authenticated:false,config:member.config});authView();}catch(error){errorAt(main,error);button.disabled=false;}});
  if(settings){
    main.querySelector('[data-export]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{downloadJson(await memberRequest('export'),'一纸简历-我的数据.json');announce('你的数据已导出。');}catch(error){errorAt(main,error);}finally{button.disabled=false;}};
    main.querySelector('[data-password]').onclick=()=>securityDialog('password');
    main.querySelector('[data-recovery]').onclick=()=>securityDialog('recovery');
    main.querySelector('[data-close-account]').onclick=()=>securityDialog('delete');
  }else{
    main.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;main.querySelectorAll('[data-filter]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));renderResumeGrid();});
    const search=main.querySelector('[data-search]');if(search)search.oninput=()=>{query=search.value;renderResumeGrid();};
    main.querySelector('[data-new-resume]').onclick=newResume;
    renderResumeGrid();
  }
}
function resumesView(member){
  const counts={all:savedResumes.length,base:savedResumes.filter(r=>r.kind!=='job').length,job:savedResumes.filter(r=>r.kind==='job').length};
  return `<header class="account-heading"><div><p class="member-kicker">个人工作区</p><h1 tabindex="-1">我的简历</h1><p>${savedResumes.length?`${savedResumes.length} / ${resumeLimit} 份云端简历 · 最近修改在前`:'从一份基础简历开始'}</p></div><div class="account-heading-actions"><a class="member-button" href="${editorLink()}">${savedResumes.length?'继续编辑':'打开编辑器'}</a><button type="button" class="member-button primary" data-new-resume ${savedResumes.length>=resumeLimit?'disabled':''}>${icon('plus')}新建简历</button></div></header>${savedResumes.length?`<div class="account-toolbar"><div class="account-filters" role="group" aria-label="筛选简历类型">${[['all','全部'],['base','基础简历'],['job','岗位版本']].map(([value,label])=>`<button type="button" data-filter="${value}" aria-pressed="${filter===value}">${label}<span>${counts[value]}</span></button>`).join('')}</div><label class="account-search">${icon('search')}<input type="search" data-search aria-label="搜索简历名称或岗位" placeholder="搜索简历" maxlength="80" value="${escape(query)}"></label></div>`:''}<section class="account-grid" data-resume-grid aria-label="云端简历"></section><section class="account-job-banner"><div><h2>一份经历，多份投递版本</h2><p>粘贴岗位要求，整理更合适的简历。可使用免费基础整理，或连接自己的 API Key 获取 AI 建议。</p></div><div class="account-job-actions"><a class="member-button" href="/resume/?tailor=1">按岗位准备${icon('arrow')}</a><a class="member-text-button" href="/plans/">支持一下 →</a></div></section>`;
}
function renderResumeGrid(){
  const grid=main.querySelector('[data-resume-grid]');if(!grid)return;
  const needle=query.trim().toLocaleLowerCase('zh-CN');
  const visible=savedResumes.filter(item=>(filter==='all'||(item.kind==='job'?'job':'base')===filter)&&(!needle||(item.title+' '+(item.jobTitle||'')).toLocaleLowerCase('zh-CN').includes(needle)));
  if(!savedResumes.length){grid.innerHTML=`<div class="account-empty"><span class="account-empty-mark">${icon('file')}</span><h2>开始第一份简历</h2><p>从完整模板示例开始，改成你的信息，边写边同步；也可以把设备上已有的草稿保存到云端。</p><div class="member-actions"><button type="button" class="member-button primary" data-new-first>新建简历</button><a class="member-button" href="/resume/?cloudSave=1">保存已有草稿</a></div></div>`;grid.querySelector('[data-new-first]').onclick=newResume;return;}
  grid.innerHTML=visible.length?visible.map(item=>`<article class="account-resume" data-id="${item.id}" data-kind="${item.kind==='job'?'job':'base'}"><div class="account-resume-top"><span class="account-document-icon">${icon('file')}</span><span class="member-label">${item.kind==='job'?'岗位版本':'基础简历'}</span></div><h2><a class="account-resume-title" href="/resume/?cloud=${item.id}">${escape(item.title)}</a></h2>${item.jobTitle?`<p class="account-resume-job">投递岗位 · ${escape(item.jobTitle)}</p>`:''}<time datetime="${new Date(item.updatedAt).toISOString()}" title="${format(item.updatedAt)}">更新于 ${format(item.updatedAt)}</time><div class="account-resume-footer"><a class="account-edit" href="/resume/?cloud=${item.id}">编辑简历${icon('arrow')}</a><details class="account-menu"><summary class="account-icon-button" aria-label="${escape(item.title)}的更多操作" title="更多操作">${icon('more')}</summary><div class="account-menu-items"><button type="button" data-copy>${icon('copy')}复制简历</button><button type="button" data-rename>${icon('edit')}修改名称</button><button type="button" class="danger" data-delete>${icon('trash')}删除简历</button></div></details></div></article>`).join(''):`<div class="account-empty search-empty"><span class="account-empty-mark">${icon('search')}</span><h2>${needle?'没有找到这份简历':'还没有'+(filter==='job'?'岗位版本':'基础简历')}</h2><p>${needle?'试试其他名称或岗位，或者查看全部简历。':'可以先编辑一份基础简历，再按岗位整理投递版本。'}</p><button type="button" class="member-button" data-reset>查看全部简历</button></div>`;
  const reset=grid.querySelector('[data-reset]');if(reset)reset.onclick=()=>{filter='all';query='';renderDashboard();};
  grid.querySelectorAll('[data-id]').forEach(card=>{
    const item=savedResumes.find(r=>r.id===card.dataset.id),menu=card.querySelector('details');
    menu.addEventListener('toggle',()=>{if(menu.open)grid.querySelectorAll('details[open]').forEach(other=>{if(other!==menu)other.open=false;});});
    card.querySelector('[data-copy]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const original=await memberRequest('resumes/'+item.id);const created=await memberRequest('resumes','POST',{...original,title:original.title+' · 副本'});await dashboard();focusResume(created.id);announce('已复制简历，原来的版本保留。');}catch(error){errorAt(main,error);button.disabled=false;}};
    card.querySelector('[data-rename]').onclick=()=>{menu.open=false;renameDialog(item.id,item);};
    card.querySelector('[data-delete]').onclick=()=>{menu.open=false;deleteDialog(item.id,item);};
  });
  announce(needle||filter!=='all'?`找到 ${visible.length} 份简历。`:'');
}
function newResume(){
  createResumeDialog({resumes:savedResumes,limit:resumeLimit,onCreated:saved=>{location.href='/resume/?cloud='+encodeURIComponent(saved.id)+'&created=1';}});
}
function settingsView(member){
  const row=(glyph,title,description,button)=>`<div class="account-setting-row"><div class="account-setting-copy">${icon(glyph)}<div><h2>${title}</h2><p>${description}</p></div></div>${button}</div>`;
  return `<header class="account-heading"><div><p class="member-kicker">个人工作区</p><h1 tabindex="-1">账户设置</h1><p>管理账户安全与自己的数据</p></div></header><section class="account-settings-group"><p class="account-settings-label">账户信息</p>${row('settings','用户名',escape(member.user.username),'')}${row('file','昵称',escape(member.user.nickname),'')}</section><section class="account-settings-group"><p class="account-settings-label">登录与安全</p>${row('lock','登录密码','修改后需要重新登录。','<button type="button" class="member-button" data-password>修改密码</button>')}${row('key','账户恢复码','忘记密码时找回账户，请单独保存。','<button type="button" class="member-button" data-recovery>更换</button>')}</section><section class="account-settings-group"><p class="account-settings-label">我的数据</p>${row('download','导出全部简历','下载账户与云端简历的 JSON 备份。','<button type="button" class="member-button" data-export>导出数据</button>')}</section><details class="account-danger"><summary>注销账户${icon('chevron')}</summary>${row('trash','删除账户与云端数据','注销前请先导出需要保留的简历。','<button type="button" class="member-button danger" data-close-account>注销账户</button>')}</details><div class="account-settings-mobile-foot"><a href="/privacy/" target="_blank" rel="noopener">隐私与数据说明 ↗</a><button type="button" class="account-logout" data-logout>${icon('logout')}退出登录</button></div>`;
}
function announce(message){const status=main.querySelector('[data-notice]');if(status)status.textContent=message;}
function focusResume(id){const target=id&&main.querySelector(`.account-resume[data-id="${CSS.escape(id)}"] .account-resume-title`);(target||main.querySelector('h1'))?.focus({preventScroll:true});}
document.addEventListener('click',event=>{main.querySelectorAll('.account-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false;});});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){main.querySelectorAll('.account-menu[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus();});}});
window.addEventListener('hashchange',()=>{if(dashboardReady){renderDashboard();main.querySelector('h1')?.focus({preventScroll:true});}});
function renameDialog(id,item){
  const box=dialog('修改简历名称',`<form class="member-form"><label>名称<input name="title" maxlength="80" value="${escape(item.title)}" required></label><p class="member-error" data-error hidden role="alert"></p><button class="member-button primary" type="submit">保存名称</button></form>`);
  box.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),title=new FormData(form).get('title');button.disabled=true;try{const original=await memberRequest('resumes/'+id);if(original.version!==item.version)throw Error('简历已更新，请刷新列表后再改名。');await memberRequest('resumes/'+id,'PUT',{resume:original.resume,version:item.version,title});box.close();await dashboard();focusResume(id);announce('简历名称已更新。');}catch(error){errorAt(box,error);}finally{button.disabled=false;}};
}
function deleteDialog(id,item){
  const box=dialog('删除云端简历',`<p>删除“${escape(item.title)}”？这只删除云端版本，不会清除设备上的本地草稿。</p><p class="member-error" data-error hidden role="alert"></p><div class="member-actions"><button type="button" class="member-button" data-back>保留</button><button type="button" class="member-button danger" data-confirm>删除云端版本</button></div>`);
  box.querySelector('[data-back]').onclick=()=>box.close();box.querySelector('[data-confirm]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await memberRequest('resumes/'+id,'DELETE',{version:item.version});box.close();await dashboard();focusResume();announce('云端简历已删除，本地草稿保留。');}catch(error){errorAt(box,error);button.disabled=false;}};
}
function securityDialog(kind){
  const titles={password:'修改密码',recovery:'更换账户恢复码',delete:'注销账户'};
  const box=dialog(titles[kind],`<form class="member-form">${kind==='delete'?'<p>注销会删除账户、云端简历和账户使用记录。请先导出需要的材料；设备上的本地草稿不会自动清除。</p>':''}<label>当前密码<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label>${kind==='password'?'<label>新密码<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>确认新密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>':''}${kind==='delete'?`<label>输入用户名确认<input name="confirm" autocomplete="off" placeholder="${escape(getMember().user.username)}" required></label>`:''}<p class="member-error" data-error hidden role="alert"></p><button class="member-button ${kind==='delete'?'danger':'primary'}" type="submit">${kind==='password'?'更新密码并重新登录':kind==='recovery'?'生成新的恢复码':'确认注销'}</button></form>`);
  box.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,input=Object.fromEntries(new FormData(form)),button=form.querySelector('button');if(kind==='password'&&input.password!==input.confirmPassword){errorAt(box,Error('两次密码不一致。'));return;}button.disabled=true;try{const result=await memberRequest(kind==='delete'?'account':kind,kind==='delete'?'DELETE':'POST',input);box.close();if(kind==='recovery')recoveryView(result.recoveryCode);else{try{localStorage.removeItem('yizhi:cloud-link');}catch{}setMember({authenticated:false,config:getMember()?.config});authView();}}catch(error){errorAt(box,error);}finally{button.disabled=false;}};
}
try{await refreshMember();if(getMember()?.authenticated)await dashboard();else authView();}catch(error){authView();errorAt(main,error);}
