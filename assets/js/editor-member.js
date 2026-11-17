import {installGithubNav} from './github-nav.js?v=20261115-github';
import {setupMobileEditorTools} from './mobile-layout.js';
import {configurePersonalAi,personalConnection,requestPersonalAi,resumeWithoutIdentity} from './personal-ai.js';
import {createResumeDialog} from './resume-create.js';
import {getResume,getUi,replaceResume,subscribeResume,flushSave} from './store.js';
import {hasResumeContent} from './template-samples.js';
import {memberRequest,refreshMember,getMember,setMember,escape,dialog,loginLink,downloadJson} from './member-client.js';
import {track} from './analytics.js';
const LINK='yizhi:cloud-link',BACKUP='yizhi:before-replace';
let link=null,timer,busy=false,dirty=false,suppressed=false,cloudState='local',syncInFlight=null,syncError=null;
try{link=JSON.parse(localStorage.getItem(LINK)||'null');}catch{}
const rememberLink=()=>{try{if(link)localStorage.setItem(LINK,JSON.stringify(link));else localStorage.removeItem(LINK);}catch{paintCloud('error','本地保存空间不足，云端关联未记录');}};
function paintCloud(state,message){cloudState=state;paintWorkspaceTitle();const label=document.querySelector('#cloudStatus');if(label){label.dataset.state=state;label.textContent=message||({local:'本地自动保存 · 登录后可同步',linked:'本地与云端均已保存',saving:'本地已保存 · 正在同步云端…',error:'本地已保存 · 云端同步未完成',conflict:'本地已保存 · 云端版本有冲突'})[state];}const button=document.querySelector('#cloudSaveButton');if(button)button.textContent=link?'云端已关联':'保存到云端';}
function errorAt(box,error){const label=box.querySelector('[data-error]');if(label){label.hidden=false;label.textContent=error.message||String(error);}}
function backupCurrent(){localStorage.setItem(BACKUP,JSON.stringify({resume:getResume(),link,at:Date.now()}));}
function restoreBeforeSwitch(){
  try{const backup=JSON.parse(localStorage.getItem(BACKUP)||'null');if(!backup?.resume)throw Error('没有可以恢复的切换前草稿。');suppressed=true;replaceResume(backup.resume);link=backup.link?.owner===getMember()?.user?.id?backup.link:null;dirty=!!link;if(link)link.pending=true;syncError=null;rememberLink();flushSave();suppressed=false;paintCloud(link?'saving':'local','已恢复切换前草稿');if(link)timer=setTimeout(syncCloud,1500);}
  catch(error){suppressed=false;paintCloud('error',error.message);}
}
function syncCloud(){
  clearTimeout(timer);if(syncInFlight)return syncInFlight;
  if(!dirty||!link||!getMember()?.authenticated)return Promise.resolve();
  if(link.owner!==getMember().user.id){link=null;rememberLink();paintCloud('local');return Promise.resolve();}
  const originalLink={...link},snapshot=structuredClone(getResume());dirty=false;busy=true;syncError=null;paintCloud('saving');
  syncInFlight=(async()=>{
    try{
      const saved=await memberRequest('resumes/'+originalLink.id,'PUT',{resume:snapshot,version:originalLink.version});
      if(link?.id===originalLink.id&&getMember()?.user?.id===originalLink.owner){link.version=saved.version;link.pending=dirty;rememberLink();paintCloud(dirty?'saving':'linked');}
    }catch(error){dirty=true;syncError=error;if(error.status===409)paintCloud('conflict');else if(error.status===401){link=null;rememberLink();paintCloud('local','登录已失效，本地草稿已保留');}else paintCloud('error');}
    finally{busy=false;syncInFlight=null;if(dirty&&['linked','saving'].includes(cloudState))timer=setTimeout(syncCloud,1200);}
  })();
  return syncInFlight;
}
async function preserveCurrent({allowConflictCopy=false}={}){
  if(!flushSave())throw Error('本地草稿未能保存，请下载备份后再切换。');
  const previous=link?{...link}:null;
  if(previous){
    if(cloudState==='conflict'&&allowConflictCopy){backupCurrent();return;}
    if(cloudState==='conflict')throw Error('当前简历有版本冲突，请先处理云端同步，或下载本地备份并停止同步。');
    await syncCloud();
    if(syncError?.status===409&&allowConflictCopy){backupCurrent();return;}
    if(syncError)throw Error('当前简历同步未完成：'+syncError.message+' 请先重试同步，当前内容继续保留。');
    if(previous.owner!==getMember()?.user?.id||link?.id!==previous.id)throw Error('账户状态已改变，当前草稿已保留，请重新登录后再切换。');
    if(dirty)await syncCloud();
    if(dirty||syncError)throw Error('当前简历尚未同步完成，请重试后再切换。');
  }
  backupCurrent();
}
function applyCloud(saved){
  suppressed=true;
  try{
    getUi().tab='basic';window.__tab='basic';
    replaceResume(saved.resume);link={id:saved.id,version:saved.version,title:saved.title,owner:getMember().user.id};dirty=false;syncError=null;rememberLink();flushSave();paintCloud('linked');history.replaceState(null,'','/resume/');
  }finally{suppressed=false;}
}
function paintWorkspaceTitle(){
  const button=document.querySelector('#resumeWorkspaceButton');if(!button)return;
  const title=link?.title||'本地草稿';button.querySelector('span').textContent=title;button.title='切换 / 新建简历 · '+title;button.setAttribute('aria-label','切换或新建简历，当前：'+title);
}
async function workspaceDialog(){
  if(!getMember()?.authenticated){dialog('我的简历','<p>登录后可以新建多份简历，分别保存和切换。当前本地草稿继续保留。</p><a class="member-button primary" href="'+loginLink('/resume/?workspace=1')+'">登录 / 免费注册</a>');return;}
  const box=dialog('我的简历','<p class="member-muted" role="status">正在读取你的简历…</p>');
  try{
    const {resumes,limit}=await memberRequest('resumes');if(!box.open)return;
    box.querySelector('.member-dialog-body').innerHTML='<p class="member-muted">'+resumes.length+' / '+limit+' 份云端简历。切换前会保存当前修改。</p><div class="resume-workspace-list">'+resumes.map(item=>'<button type="button" class="resume-workspace-row" data-open-id="'+escape(item.id)+'" '+(item.id===link?.id?'aria-current="true" disabled':'')+'><span><strong>'+escape(item.title)+'</strong><small>'+(item.kind==='job'?'岗位版本':'基础简历')+(item.jobTitle?' · '+escape(item.jobTitle):'')+'</small></span><span>'+(item.id===link?.id?'当前':'打开 →')+'</span></button>').join('')+'</div><p class="member-error" data-error hidden role="alert"></p><div class="member-actions resume-workspace-actions"><button class="member-button primary" type="button" data-create '+(resumes.length>=limit?'disabled':'')+'>＋ 新建简历</button><a class="member-button" href="/account/">管理全部简历</a></div>';
    box.querySelectorAll('[data-open-id]').forEach(button=>button.onclick=async()=>{
      const owner=getMember()?.user?.id;box.querySelectorAll('button:not(.member-close)').forEach(control=>control.disabled=true);try{await preserveCurrent();if(!box.open)return;const saved=await memberRequest('resumes/'+button.dataset.openId);if(!box.open||getMember()?.user?.id!==owner)return;applyCloud(saved);box.close();}catch(error){errorAt(box,error);}finally{box.querySelectorAll('[data-open-id]').forEach(control=>control.disabled=control.dataset.openId===link?.id);box.querySelector('[data-create]').disabled=resumes.length>=limit;}
    });
    box.querySelector('[data-create]').onclick=()=>{box.close();createResumeDialog({resumes,limit,current:getResume,beforeCreate:preserveCurrent,onCreated:applyCloud});};
  }catch(error){box.querySelector('.member-dialog-body').innerHTML='<p class="member-error" data-error role="alert"></p>';errorAt(box,error);}
}
async function saveNew({title,kind='base',jobTitle='',resume=getResume()}){
  const saved=await memberRequest('resumes','POST',{title,kind,jobTitle,resume});
  return {id:saved.id,version:saved.version,title:saved.title,owner:getMember().user.id};
}
function cloudDialog(){
  const member=getMember();
  if(!member?.authenticated){dialog('保存到云端',`<p>本地草稿已自动保存。登录后可保存云端版本，在电脑和手机之间继续编辑。</p><p class="member-muted">基础编辑和 PDF 导出继续免费，无需登录。</p><div class="member-actions"><a class="member-button primary" href="${loginLink('/resume/?cloudSave=1')}">登录 / 免费注册</a><a class="member-button" href="/privacy/">了解数据去向</a></div>`);return;}
  const box=dialog(link?'云端同步':'保存一份云端简历',`<p>${link?'当前版本：'+escape(link.title)+'。修改会自动同步；其他设备同时修改时会提示冲突。':'云端保存包含简历文字和已添加的照片。保存后，当前这份简历的后续修改会自动同步到你的账户。'}</p><form class="member-form"><label>另存名称<input name="title" value="${escape(link?link.title+' · 新版本':'我的基础简历')}" maxlength="80" required></label><p class="member-error" data-error hidden role="alert"></p><div class="member-actions"><button type="submit" class="member-button primary">${link?'另存为新版本':'确认保存并开启同步'}</button>${link?'<button type="button" class="member-button" data-retry>重试同步</button><button type="button" class="member-button" data-unlink>停止同步</button>':''}<a class="member-button" href="/account/">我的简历</a></div></form><div class="member-actions" style="margin-top:18px"><button type="button" class="member-text-button" data-backup>下载本地备份</button><button type="button" class="member-text-button" data-restore>恢复切换前草稿</button></div>`,{onClose:()=>{}});
  box.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;try{const title=new FormData(event.currentTarget).get('title');await preserveCurrent({allowConflictCopy:true});if(!box.open)return;const savedLink=await saveNew({title});if(!box.open)return;link=savedLink;dirty=false;syncError=null;rememberLink();paintCloud('linked');box.close();}catch(error){errorAt(box,error);}finally{button.disabled=false;}};
  box.querySelector('[data-retry]')?.addEventListener('click',()=>{dirty=true;void syncCloud();box.close();});
  box.querySelector('[data-unlink]')?.addEventListener('click',()=>{link=null;dirty=false;clearTimeout(timer);rememberLink();paintCloud('local','已停止同步，后续修改仅保存在本地');box.close();});
  box.querySelector('[data-backup]').onclick=()=>downloadJson({resume:getResume()},'一纸简历-本地备份.json');
  box.querySelector('[data-restore]').onclick=()=>{if(busy){errorAt(box,Error('正在同步，请稍后恢复。'));return;}restoreBeforeSwitch();box.close();};
}

async function openCloud(id,{confirm=true}={}){
  try{
    if(!getMember()?.authenticated){location.href=loginLink('/resume/?cloud='+encodeURIComponent(id));return;}
    const owner=getMember().user.id;
    const preview=await memberRequest('resumes/'+encodeURIComponent(id));
    const apply=async box=>{
      await preserveCurrent();if(box&&!box.open)return;
      const saved=await memberRequest('resumes/'+encodeURIComponent(id));
      if((box&&!box.open)||getMember()?.user?.id!==owner)return;
      applyCloud(saved);box?.close();
    };
    if(confirm&&link?.id!==id&&hasResumeContent(getResume())){
      const box=dialog('打开云端简历','<p>打开“'+escape(preview.title)+'”后，编辑器将展示这份云端版本。当前修改会先保存，本地草稿也会保留为切换前备份。</p><p class="member-error" data-error hidden role="alert"></p><div class="member-actions"><button class="member-button" type="button" data-cancel>继续当前草稿</button><button class="member-button primary" type="button" data-open>保存并打开</button></div>');
      box.querySelector('[data-cancel]').onclick=()=>{history.replaceState(null,'','/resume/');box.close();};
      box.querySelector('[data-open]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await apply(box);}catch(error){errorAt(box,error);}finally{button.disabled=false;}};
    }else await apply();
  }catch(error){suppressed=false;paintCloud('error',error.message);}
}

function tailorDialog(){
  if(!hasResumeContent(getResume())){dialog('先填写基础简历','<p>请先填写真实的教育、技能和项目经历。岗位要求帮助调整表达，个人经历提供生成依据。</p>');return;}
  const member=getMember(),enabled=!!personalConnection('resume');
  let controller,result,baseline,requestId,previousInput='',generating=false;
  const box=dialog('按岗位准备简历',`<p class="member-muted">使用当前简历作为基础，生成后先检查修改对照。采用时会保留基础草稿，并创建新的投递版本。</p><form class="member-form" data-job-form><label>目标岗位名称<input name="jobTitle" maxlength="80" placeholder="例如：前端开发实习生" required></label><label>岗位要求 JD<textarea name="jd" rows="7" minlength="20" maxlength="12000" placeholder="粘贴职责、必备条件和加分项，不需要招聘网站链接。" required></textarea></label><div class="member-warnings member-quota-notice" data-quota-notice aria-live="polite"></div><label class="member-check"><input name="consent" type="checkbox"><span>同意将简历经历和 JD 发送给我连接的 AI 服务分析。照片、姓名和联系方式不发送给模型。<a href="/privacy/" target="_blank" rel="noopener">隐私说明</a></span></label><p class="member-error" data-error hidden role="alert"></p><div class="member-actions"><button type="button" class="member-button" data-basic>免费基础整理</button><button type="submit" class="member-button primary" ${enabled?'':'disabled'}>AI 分析并生成</button></div></form><div data-progress hidden class="member-progress" role="status"><span class="member-spinner" aria-hidden="true"></span><span>正在分析岗位并调整表达，请勿重复提交…</span><button type="button" class="member-text-button" data-cancel>取消</button></div><section data-result hidden aria-live="polite"></section>`,{wide:true,onClose:()=>controller?.abort()});
  const form=box.querySelector('form'),progress=box.querySelector('[data-progress]'),resultHost=box.querySelector('[data-result]');
  const draftKey='yizhi:job-draft:'+(member?.user?.id||'local');
  try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft){form.elements.jobTitle.value=String(draft.jobTitle||'').slice(0,80);form.elements.jd.value=String(draft.jd||'').slice(0,12000);}}catch{}
  form.addEventListener('input',()=>{try{sessionStorage.setItem(draftKey,JSON.stringify({jobTitle:form.elements.jobTitle.value,jd:form.elements.jd.value}));}catch{}});
  function updateQuota(){
    const connection=personalConnection('resume'),notice=box.querySelector('[data-quota-notice]');
    notice.innerHTML='<strong>'+ (connection?'我的 AI · '+escape(connection.model):'AI 使用你自己的 API Key')+'</strong><p>免费基础整理无需 Key。AI 调用费用由你的服务商账户承担，本站不计付费次数。</p><button type="button" class="member-button" data-ai-connect>'+(connection?'更换 / 清除连接':'连接我的 AI')+'</button>';
    notice.querySelector('[data-ai-connect]').onclick=()=>configurePersonalAi('resume',updateQuota);
    const button=form.querySelector('[type=submit]');button.disabled=generating;button.textContent=connection?'AI 分析并生成':'连接 AI 后生成';
  }
  updateQuota();
  box.querySelector('[data-cancel]').onclick=()=>controller?.abort();
  const generate=async basic=>{
    if(!form.reportValidity())return;
    if(!basic&&!personalConnection('resume')){configurePersonalAi('resume',updateQuota);return;}
    const input=Object.fromEntries(new FormData(form));
    if(!basic&&input.consent!=='on'){errorAt(box,Error('请确认经历与 JD 的 AI 分析授权。'));return;}
    baseline=structuredClone(getResume());const identity=JSON.stringify({resume:baseline,jd:input.jd,jobTitle:input.jobTitle,basic});
    if(identity!==previousInput){requestId=crypto.randomUUID();previousInput=identity;}
    box.querySelector('[data-error]').hidden=true;resultHost.hidden=true;progress.hidden=false;
    generating=true;form.querySelectorAll('button,input,textarea').forEach(element=>element.disabled=true);controller=new AbortController();
    try{
      result=basic?await memberRequest('basic','POST',{resume:baseline,jd:input.jd,jobTitle:input.jobTitle},{signal:controller.signal}):await requestPersonalAi('resume',{resume:resumeWithoutIdentity(baseline),jd:input.jd,jobTitle:input.jobTitle},{signal:controller.signal});
      if(!basic){result.resume.basicInfo=structuredClone(baseline.basicInfo);result.resume.coverData=structuredClone(baseline.coverData);result.resume.zijianData=structuredClone(baseline.zijianData);}
      if(!box.isConnected)return;
      resultHost.hidden=false;
      resultHost.innerHTML=`<h3>${result.mode==='ai'?'AI 建议已生成':'基础整理已完成'}</h3><p class="member-muted">${escape(result.analysis.notice)}</p><div class="member-chips">${result.analysis.skills.map(skill=>`<span class="member-chip ${skill.found?'found':''}">${escape(skill.text)} · ${skill.found?'已有文字依据':'未找到文字依据'}</span>`).join('')}</div>${(result.analysis.aiRequirements||[]).map(requirement=>`<p><strong>${escape(requirement.text)}</strong><br><span class="member-muted">${escape(requirement.evidence||requirement.gap||'需要你核实对应经历')}</span></p>`).join('')}${result.changes.map(change=>`<article class="member-diff"><h3>${escape(change.label)}</h3><div class="member-diff-grid"><div><small>基础简历</small>${escape(change.before||'未填写')}</div><div><small>岗位版本</small>${escape(change.after)}</div></div><div class="member-reason">${escape(change.reason)}</div></article>`).join('')}<div class="member-warnings"><ul>${result.warnings.map(warning=>`<li>${escape(warning)}</li>`).join('')}</ul></div><label class="member-check" style="margin-top:18px"><input type="checkbox" data-reviewed><span>我已核对修改内容，确认个人经历、职责与成果符合事实。</span></label><p class="member-error" data-error hidden role="alert"></p><div class="member-actions member-generation-actions"><button type="button" class="member-button primary" data-adopt>采用并打开编辑预览</button><button type="button" class="member-button" data-dismiss>保留基础简历</button></div>`;
      resultHost.querySelector('[data-dismiss]').onclick=()=>box.close();
      resultHost.querySelector('[data-adopt]').onclick=async event=>{
        const button=event.currentTarget;if(!resultHost.querySelector('[data-reviewed]').checked){errorAt(resultHost,Error('请先核对并确认修改内容。'));return;}button.disabled=true;
        try{
          await preserveCurrent();if(!box.open)return;
          if(JSON.stringify(getResume())!==JSON.stringify(baseline))throw Error('基础简历已发生变化，请重新生成，避免覆盖刚刚的修改。');
          backupCurrent();let nextLink=null;
          if(getMember()?.authenticated)nextLink=await saveNew({title:input.jobTitle+' · 投递版',kind:'job',jobTitle:input.jobTitle,resume:result.resume});
          if(!box.isConnected)return;
          suppressed=true;replaceResume(result.resume);link=nextLink;dirty=false;rememberLink();flushSave();suppressed=false;paintCloud(link?'linked':'local','岗位版本已采用，可继续编辑；基础草稿已保留');
          if(result.mode==='ai')void memberRequest('activity','POST',{type:'adopt'}).catch(()=>{});
          track('job_version_adopt');box.close();
        }catch(error){suppressed=false;errorAt(resultHost,error);}finally{button.disabled=false;}
      };
      if(!basic)await refreshMember().catch(()=>{});
      resultHost.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }catch(error){if(box.isConnected)errorAt(box,error.name==='AbortError'?Error('已停止等待，基础简历继续保留。服务商可能仍会处理，请查看调用记录。'):error);}
    finally{progress.hidden=true;form.querySelectorAll('button,input,textarea').forEach(element=>element.disabled=false);generating=false;controller=null;updateQuota();}
  };
  form.onsubmit=event=>{event.preventDefault();void generate(false);};form.querySelector('[data-basic]').onclick=()=>void generate(true);
}

export async function installEditorMember(){
  const heading=document.querySelector('.editor-heading');
  if(!heading)return;
  heading.querySelector('strong').outerHTML='<button type="button" id="resumeWorkspaceButton" class="resume-workspace-button" aria-haspopup="dialog"><span>本地草稿</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>';
  document.querySelector('#resumeWorkspaceButton').onclick=workspaceDialog;
  const controls=document.createElement('div');controls.className='member-tools-wrap';controls.innerHTML='<div class="member-tools"><button type="button" class="member-button" id="cloudSaveButton">保存到云端</button><button type="button" class="member-button primary" id="jobTailorButton">按岗位生成</button></div>';heading.append(controls);
  setupMobileEditorTools(controls);
  const status=document.createElement('span');status.id='cloudStatus';status.className='member-cloud-status';status.setAttribute('role','status');status.textContent='本地自动保存 · 登录后可同步';heading.append(status);
  const account=document.createElement('li');account.className='member-nav-item';account.innerHTML='<a class="member-account-icon" href="/account/" aria-label="登录或管理我的简历" title="登录 / 我的简历"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></a>';document.querySelector('.get_list')?.prepend(account);
  const support=document.createElement('li');support.className='member-nav-item support-editor-item';support.innerHTML='<a class="support-nav-link" aria-label="支持一下" href="/plans/?return=%2Fresume%2F"><img class="support-nav-icon" src="/assets/img/brand/support-coffee.png" width="22" height="22" alt=""><span>支持一下</span></a>';document.querySelector('.get_list')?.prepend(support);
  installGithubNav();
  document.querySelector('#cloudSaveButton').onclick=cloudDialog;document.querySelector('#jobTailorButton').onclick=tailorDialog;
  subscribeResume(()=>{if(suppressed||!link)return;dirty=true;link.pending=true;rememberLink();if(cloudState==='conflict')return;paintCloud('saving');clearTimeout(timer);timer=setTimeout(syncCloud,1500);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void syncCloud();});
  window.addEventListener('resume-file-generated',()=>{if(getMember()?.authenticated)void memberRequest('activity','POST',{type:'export'}).catch(()=>{});});
  window.addEventListener('member-change',()=>{if(link&&getMember()?.user?.id!==link.owner){dirty=false;clearTimeout(timer);link=null;rememberLink();paintCloud('local');}});
  paintCloud(link?'linked':'local');
  try{await refreshMember();}catch{paintCloud('error','本地保存正常，账户服务暂时不可用');return;}
  if(!link&&getMember()?.authenticated)paintCloud('local','本地自动保存 · 可保存到云端');
  if(link?.pending){dirty=true;paintCloud('saving');timer=setTimeout(syncCloud,1500);}
  const params=new URLSearchParams(location.search);
  if(params.has('cloud'))await openCloud(params.get('cloud'),{confirm:params.get('created')!=='1'});
  else if(params.get('workspace')==='1')void workspaceDialog();
  else if(params.get('cloudSave')==='1')cloudDialog();
  else if(params.get('tailor')==='1')tailorDialog();
}
