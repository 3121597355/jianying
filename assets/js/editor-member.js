import {installGithubNav} from './github-nav.js?v=20261115-github';
import {setupMobileEditorTools} from './mobile-layout.js';
import {configurePersonalAi,personalConnection,requestPersonalAi,resumeWithoutIdentity} from './personal-ai.js';
import {createResumeDialog} from './resume-create.js';
import {getResume,getUi,replaceResume,subscribeResume,flushSave} from './store.js';
import {hasResumeContent} from './template-samples.js';
import {memberRequest,refreshMember,getMember,setMember,escape,dialog,loginLink,downloadJson} from './member-client.js';
import {track} from './analytics.js';
import {askSourceOnce} from './source-survey.js';
import {jobCoachKey,loadJobCoach,saveJobCoach} from './job-coach-store.js?v=20261118-coach3';
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
    if(coach.built)restoreCoach();
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
/** 导出后注册并保存的那一份，直接接管为当前同步目标，后续修改继续自动同步。 */
export function adoptCloudLink(saved){
  const owner=getMember()?.user?.id;
  if(!owner||!saved?.id)return;
  link={id:saved.id,version:saved.version,title:saved.title,owner};
  dirty=false;syncError=null;rememberLink();paintCloud('linked');
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

async function tailorSources(){
  const options=[{value:'current',label:'当前草稿'}];
  try{const backup=JSON.parse(localStorage.getItem(BACKUP)||'null');if(backup?.resume)options.push({value:'backup',label:'切换前备份 · '+new Date(backup.at||Date.now()).toLocaleDateString('zh-CN')});}catch{}
  if(getMember()?.authenticated){
    try{const {resumes}=await memberRequest('resumes');for(const item of resumes||[])options.push({value:'cloud:'+item.id,label:(item.kind==='job'?'岗位版本 · ':'')+item.title});}catch{}
  }
  return options;
}
function sourceSummary(resume){
  const modules=(resume?.moduleData||[]).filter(module=>module.visible!==false),projects=(resume?.moduleData||[]).find(module=>module.moduleName==='project')?.data;
  return modules.length+' 个模块'+(Array.isArray(projects)&&projects.length?' · '+projects.length+' 条项目经历':'');
}
/* ------------------------- AI 简历建议侧栏 ------------------------- */
/* 建议在编辑区旁边显示：能对着建议改简历，收起后建议仍然保留。 */
const COACH_ALIAS=[['求职意向','yixiang'],['报考','baokao'],['教育','jiaoyu'],['工作','work'],['项目','project'],['实习','shixi'],['校园','xiaoyuan'],['技能','jineng'],['证书','zhengshu'],['荣誉','zhengshu'],['自我评价','pingjia'],['自我介绍','pingjia'],['兴趣','aihao'],['基本信息','basic'],['自定义','make']];
const COACH_MOBILE='(max-width:860px), (max-width:1024px) and (max-height:500px)';
const COACH_POSITION_PREFIX='yizhi:job-coach-position:';
const coach={shell:null,body:null,form:null,built:false,open:false,controller:null,result:null,pendingResult:null,viewingPending:false,feedbackMessages:[],baseline:null,baselineHash:'',source:null,sourceKey:'current',jobTitle:'',jd:'',generating:false,feedbackGenerating:false,applied:false,confirmed:false,owner:'local',resumeId:'draft',key:'',loadedKey:'',timer:0,closeTimer:0,dragBound:false,positionReady:false};

/** 轻量指纹：生成时记下原稿，采用时确认期间有没有改过。 */
function coachHash(value){
  const raw=JSON.stringify(value||null);
  let hash=5381;
  for(let i=0;i<raw.length;i+=1)hash=((hash*33)^raw.charCodeAt(i))|0;
  return (hash>>>0).toString(36)+'-'+raw.length;
}
function coachKeyNow(){
  const member=getMember();
  coach.owner=member?.authenticated?String(member.user?.id||'local'):'local';
  coach.resumeId=link?.id?String(link.id):'draft';
  coach.key=jobCoachKey(coach.owner,coach.resumeId);
  return coach.key;
}
/** 把建议里的「项目经验 · 一纸简历」这类标题映射到编辑模块。 */
function coachModuleFor(label){
  const value=String(label||'').trim();
  if(!value)return '';
  for(const module of getResume()?.moduleData||[]){
    const name=String(module.moduleValue||'').trim();
    if(name&&value.startsWith(name))return module.moduleName;
  }
  for(const [word,name] of COACH_ALIAS)if(value.includes(word))return name;
  return '';
}
function jumpToCoachModule(name){
  if(!name)return;
  if(window.matchMedia(COACH_MOBILE).matches)closeJobCoach({remember:false});
  const select=window.__selectModule;
  if(typeof select!=='function')return;
  select(name);
  const host=document.querySelector('#formHost');
  if(!host)return;
  host.classList.remove('coach-flash');
  void host.offsetWidth;
  host.classList.add('coach-flash');
  setTimeout(()=>host.classList.remove('coach-flash'),1500);
}
function coachError(message){
  const label=coach.body?.querySelector('[data-coach-error]');
  if(!label)return;
  label.hidden=!message;
  label.textContent=message||'';
}

function coachPositionKey(){return COACH_POSITION_PREFIX+(coach.owner||'local');}
function readCoachPosition(){
  try{
    const value=JSON.parse(localStorage.getItem(coachPositionKey())||'null');
    if(!value||!Number.isFinite(value.x)||!Number.isFinite(value.y))return null;
    // 旧版本保存的是卡片左上角，而现在保存的是外层 fixed 浮层左上角。
    // 读取一次时扣除卡片的 24px margin，随后会以新格式覆盖保存。
    if(value.mode==='viewport')return {...value,x:Math.max(0,value.x-24),mode:'viewport-v2'};
    return value.mode==='viewport-v2'?value:null;
  }catch{return null;}
}
function clampCoachPosition(x,y){
  const shell=coach.shell,card=shell?.querySelector('.job-coach-card');
  if(!shell||!card)return {x:0,y:0};
  // 外层 fixed 浮层比卡片宽出 margin-left，边界按浮层自身尺寸算才不会越界。
  const maxX=Math.max(0,window.innerWidth-shell.offsetWidth),maxY=Math.max(0,window.innerHeight-card.offsetHeight);
  return {x:Math.max(0,Math.min(maxX,Number(x)||0)),y:Math.max(0,Math.min(maxY,Number(y)||0))};
}
function setCoachPosition(x,y,{persist=false}={}){
  const shell=coach.shell;
  if(!shell||window.matchMedia(COACH_MOBILE).matches)return;
  const position=clampCoachPosition(x,y);
  shell.style.right='auto';shell.style.bottom='auto';shell.style.left=`${Math.round(position.x)}px`;shell.style.top=`${Math.round(position.y)}px`;
  if(persist){try{localStorage.setItem(coachPositionKey(),JSON.stringify({...position,mode:'viewport-v2'}));}catch{}}
}
function restoreCoachPosition(){
  if(coach.positionReady||window.matchMedia(COACH_MOBILE).matches)return;
  coach.positionReady=true;const saved=readCoachPosition();if(saved)requestAnimationFrame(()=>setCoachPosition(saved.x,saved.y));
}
function bindCoachDrag(){
  if(coach.dragBound||!coach.shell)return;
  const handle=coach.shell.querySelector('[data-coach-drag]');if(!handle)return;coach.dragBound=true;
  let dragging=false,startX=0,startY=0,startLeft=0,startTop=0;
  const end=event=>{
    if(!dragging)return;
    dragging=false;
    handle.releasePointerCapture?.(event.pointerId);
    coach.shell.classList.remove('is-dragging');
    // 位置以外层 fixed 浮层为准。此前这里读取内层卡片坐标，
    // 再写回外层坐标，会把 margin-left 的 24px 重复累加。
    const sr=coach.shell.getBoundingClientRect();
    setCoachPosition(sr.left,sr.top,{persist:true});
  };
  handle.addEventListener('pointerdown',event=>{
    if(window.matchMedia(COACH_MOBILE).matches||event.target.closest('button,a,input,select,textarea,summary'))return;
    const shell=coach.shell,card=shell.querySelector('.job-coach-card');
    if(!card)return;
    const sr=shell.getBoundingClientRect();
    dragging=true;startX=event.clientX;startY=event.clientY;startLeft=sr.left;startTop=sr.top;
    handle.setPointerCapture?.(event.pointerId);shell.classList.add('is-dragging');event.preventDefault();
  });
  const move=event=>{
    if(!dragging)return;
    // 轻微抖动（例如只想点标题栏）不挪窗口，手感更稳。
    if(Math.abs(event.clientX-startX)+Math.abs(event.clientY-startY)<3)return;
    setCoachPosition(startLeft+event.clientX-startX,startTop+event.clientY-startY);
  };
  handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
}

function coachShell(){
  if(coach.shell?.isConnected)return coach.shell;
  const main=document.querySelector('.edit_main');
  if(!main)return null;
  const shell=document.createElement('aside');
  shell.id='jobCoachPanel';
  shell.className='job-coach';
  shell.inert=true;
  shell.setAttribute('aria-label','AI 简历建议');
  shell.setAttribute('aria-hidden','true');
  shell.innerHTML='<div class="job-coach-card"><header class="job-coach-head" data-coach-drag title="按住标题栏拖动建议窗口"><div class="job-coach-title"><strong>AI 简历建议</strong><small>边看建议边改简历 · 可拖动</small></div><button type="button" class="job-coach-close" data-coach-close aria-label="收起建议，内容会保留" title="收起，建议会保留">×</button></header><div class="job-coach-body" data-coach-body></div></div>';
  document.body.append(shell);
  coach.shell=shell;
  buildCoach();
  return shell;
}

function buildCoach(){
  const body=coach.shell.querySelector('[data-coach-body]');
  body.innerHTML=`<form class="job-coach-form" data-coach-form novalidate>
    <details class="job-coach-formwrap" data-coach-formwrap open>
      <summary><span>分析条件</span><small data-coach-source-note>正在读取简历…</small></summary>
      <label class="job-coach-field"><span>分析哪份简历</span><select name="source" data-coach-source><option value="current">当前草稿</option></select></label>
      <label class="job-coach-field"><span>目标岗位</span><input name="jobTitle" maxlength="80" placeholder="例如：全栈工程师" autocomplete="off"></label>
      <label class="job-coach-field"><span>岗位要求 JD</span><textarea name="jd" rows="5" maxlength="12000" placeholder="粘贴岗位职责与要求；留空则只诊断简历本身"></textarea></label>
      <label class="job-coach-consent"><input name="consent" type="checkbox"><span>同意把简历经历和岗位要求发送给我连接的 AI 分析；照片、姓名、联系方式不发送。</span></label>
    </details>
    <div class="job-coach-note" data-coach-note></div>
    <p class="job-coach-error" data-coach-error hidden role="alert"></p>
    <div class="job-coach-actions"><button type="button" class="member-button" data-coach-basic>基础整理</button><button type="submit" class="member-button primary">AI 分析</button></div>
  </form>
  <div class="job-coach-progress" data-coach-progress hidden role="status"><span class="member-spinner" aria-hidden="true"></span><span data-coach-progress-text>正在分析…</span><button type="button" class="job-coach-link" data-coach-cancel>停止</button></div>
  <section class="job-coach-result" data-coach-result hidden aria-live="polite"></section>
  <section class="coach-feedback" data-coach-feedback hidden>
    <div class="coach-feedback-head"><strong>继续反馈</strong><span>告诉我你想怎么调整，当前建议会先保留。</span></div>
    <div class="coach-feedback-log" data-coach-feedback-log aria-live="polite"></div>
    <form class="coach-feedback-form" data-coach-feedback-form novalidate>
      <textarea class="coach-feedback-input" data-coach-feedback-input name="feedback" rows="3" maxlength="2000" placeholder="例如：项目成果再具体一点，保留真实数据"></textarea>
      <label class="coach-feedback-consent"><input type="checkbox" data-coach-feedback-consent><span>同意把简历和这段反馈发送给我连接的 AI</span></label>
      <div class="coach-feedback-actions"><button type="submit" class="member-button primary" data-coach-feedback-submit>让 AI 按反馈修改</button><span class="coach-feedback-hint">Enter 发送 · Shift+Enter 换行</span></div>
    </form>
    <div class="job-coach-progress" data-coach-feedback-progress hidden role="status"><span class="member-spinner" aria-hidden="true"></span><span>AI 正在按你的反馈重新整理…</span><button type="button" class="job-coach-link" data-coach-feedback-cancel>停止</button></div>
  </section>
  <p class="job-coach-saved" data-coach-saved>建议保存在本机，收起或刷新后都能找回来。</p>`;
  coach.body=body;
  coach.form=body.querySelector('[data-coach-form]');
  coach.built=true;
  const form=coach.form;
  form.onsubmit=event=>{event.preventDefault();void runCoach(false);};
  form.querySelector('[data-coach-basic]').onclick=()=>void runCoach(true);
  form.elements.jd.addEventListener('input',()=>{paintCoachNote();scheduleCoachSave();});
  form.elements.jobTitle.addEventListener('input',()=>{scheduleCoachSave();});
  form.elements.source.onchange=()=>void changeCoachSource();
  form.elements.consent.addEventListener('change',()=>coachError(''));
  body.querySelector('[data-coach-cancel]').onclick=()=>coach.controller?.abort();
  body.querySelector('[data-coach-feedback-cancel]').onclick=()=>coach.controller?.abort();
  const feedbackForm=body.querySelector('[data-coach-feedback-form]');
  feedbackForm.onsubmit=event=>{event.preventDefault();void runCoachFeedback();};
  body.querySelector('[data-coach-feedback-input]').addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();feedbackForm.requestSubmit();}
  });
  body.addEventListener('click',event=>{
    const jump=event.target.closest('[data-coach-jump]');
    if(jump){jumpToCoachModule(jump.dataset.coachJump);return;}
    if(event.target.closest('[data-coach-pending-view]')){coach.viewingPending=true;renderCoachResult();return;}
    if(event.target.closest('[data-coach-pending-back]')){coach.viewingPending=false;renderCoachResult();return;}
    if(event.target.closest('[data-coach-pending-adopt]')){void adoptCoach(coach.pendingResult,true);return;}
    if(event.target.closest('[data-coach-pending-discard]')){coach.pendingResult=null;coach.viewingPending=false;persistCoach();renderCoachResult();return;}
    if(event.target.closest('[data-coach-adopt]')){void adoptCoach();return;}
    if(event.target.closest('[data-coach-keep]')){closeJobCoach();return;}
  });
  coach.shell.querySelector('[data-coach-close]').onclick=()=>closeJobCoach();
  coach.shell.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!coach.open)return;
    event.stopPropagation();
    closeJobCoach();
    document.querySelector('#jobTailorButton')?.focus({preventScroll:true});
  });
}

function paintCoachNote(){
  const form=coach.form;
  if(!form)return;
  const connection=personalConnection('resume');
  const hasJd=form.elements.jd.value.trim().length>0;
  const note=coach.body.querySelector('[data-coach-note]');
  note.innerHTML='<span>'+(connection?'已连接 '+escape(connection.model):'未连接 AI · 只影响 AI 分析，基础整理照常可用')+'</span><button type="button" class="job-coach-link" data-coach-connect>'+(connection?'更换 / 清除':'连接我的 AI')+'</button>';
  note.querySelector('[data-coach-connect]').onclick=()=>configurePersonalAi('resume',paintCoachNote);
  const submit=form.querySelector('[type=submit]');
  const basic=form.querySelector('[data-coach-basic]');
  submit.disabled=coach.generating;
  submit.textContent=connection?(hasJd?'AI 分析岗位':'AI 诊断简历'):(hasJd?'连接 AI 后分析':'连接 AI 后诊断');
  basic.disabled=coach.generating||!hasJd;
  basic.title=hasJd?'不消耗 AI 额度，只做基础整理':'填写岗位要求后可用';
}

function paintCoachBadge(){
  const button=document.querySelector('#jobTailorButton');
  if(!button)return;
  button.classList.toggle('has-coach',!!coach.result);
  button.title=coach.result?'已有 AI 建议，点击查看':'按岗位生成 AI 建议';
}

function renderCoachResult(){
  if(!coach.body)return;
  const host=coach.body.querySelector('[data-coach-result]');
  const wrap=coach.body.querySelector('[data-coach-formwrap]');
  if(!host)return;
  if(wrap)wrap.open=!coach.result;
  if(!coach.result){host.hidden=true;host.innerHTML='';renderCoachFeedback();paintCoachBadge();return;}
  host.hidden=false;
  const pending=!!(coach.viewingPending&&coach.pendingResult);
  const data=pending?coach.pendingResult:coach.result;
  if(data.mode==='review')renderCoachReview(host,data);else renderCoachDiff(host,data,{pending});
  if(pending)host.insertAdjacentHTML('afterbegin','<div class="coach-pending-banner"><strong>这是按反馈生成的新建议</strong><span>当前建议仍保留，未采用前不会改动简历。</span><div class="coach-apply-row"><button type="button" class="member-button primary" data-coach-pending-adopt>采用这次修改</button><button type="button" class="member-button" data-coach-pending-back>返回当前建议</button></div></div>');
  renderCoachFeedback();
  paintCoachBadge();
}

function renderCoachFeedback(){
  const section=coach.body?.querySelector('[data-coach-feedback]');
  const log=coach.body?.querySelector('[data-coach-feedback-log]');
  if(!section||!log)return;
  const enabled=!!coach.result&&coach.result.mode==='ai'&&!!personalConnection('resume');
  section.hidden=!enabled;
  if(!enabled)return;
  log.innerHTML=coach.feedbackMessages.map(item=>'<div class="coach-feedback-message '+(item.role==='user'?'user':'assistant')+'"><span>'+escape(item.role==='user'?'你':'AI')+'</span><p>'+escape(item.text)+'</p></div>').join('');
  if(coach.feedbackMessages.length)log.hidden=false;else log.hidden=true;
  if(coach.pendingResult&&!coach.viewingPending){
    log.insertAdjacentHTML('beforeend','<div class="coach-pending-result"><strong>AI 已生成一版新建议</strong><span>先看看再决定，采用前不会改动当前建议。</span><div class="coach-apply-row"><button type="button" class="member-button primary" data-coach-pending-view>查看新建议</button><button type="button" class="member-button" data-coach-pending-discard>不用这版</button></div></div>');
  }
  const submit=section.querySelector('[data-coach-feedback-submit]');
  if(submit)submit.disabled=coach.feedbackGenerating;
  const consent=section.querySelector('[data-coach-feedback-consent]');
  if(consent&&coach.form?.elements.consent.checked)consent.checked=true;
  section.querySelector('[data-coach-feedback-progress]').hidden=!coach.feedbackGenerating;
}

function coachJumpButton(label){
  const module=coachModuleFor(label);
  return module?'<button type="button" class="job-coach-link" data-coach-jump="'+escape(module)+'">去修改</button>':'';
}

function renderCoachReview(host,data){
  const levels={high:'优先处理',medium:'建议补充',low:'可以优化'};
  const findings=(data.findings||[]).map(item=>'<article class="coach-item"><header><strong>'+escape(item.area||'简历')+'<em>'+escape(levels[item.level]||'建议')+'</em></strong>'+coachJumpButton(item.area)+'</header><p>'+escape(item.advice)+'</p></article>').join('');
  const highlights=(data.highlights||[]).length?'<div class="coach-chips">'+data.highlights.map(item=>'<span class="is-found" title="'+escape(item.why||'')+'">'+escape(item.text)+'</span>').join('')+'</div>':'';
  const warnings=(data.warnings||[]).length?'<ul class="coach-warn">'+data.warnings.map(item=>'<li>'+escape(item)+'</li>').join('')+'</ul>':'';
  host.innerHTML='<div class="coach-head"><strong>AI 诊断</strong><span>'+escape(data.analysis?.notice||'只读诊断，不改动简历内容。')+'</span></div>'
    +(findings?'<div class="coach-list">'+findings+'</div>':'<p class="job-coach-muted">这次没有需要优先处理的问题。</p>')
    +highlights+warnings
    +'<p class="job-coach-muted">想按岗位改写，就在上面填岗位要求再生成；点「去修改」可直接跳到对应栏目。</p>';
}

function renderCoachDiff(host,data,{pending=false}={}){
  const changes=(data.changes||[]).map(change=>'<article class="coach-item"><header><strong>'+escape(change.label)+'</strong>'+coachJumpButton(change.label)+'</header><p class="coach-reason">'+escape(change.reason||'')+'</p><details class="coach-diff"><summary>对比原稿</summary><div><small>原稿</small><p>'+escape(change.before||'未填写')+'</p></div><div><small>建议</small><p>'+escape(change.after||'')+'</p></div></details></article>').join('');
  const skills=(data.analysis?.skills||[]).map(skill=>'<span class="'+(skill.found?'is-found':'')+'">'+escape(skill.text)+' · '+(skill.found?'有文字依据':'未找到依据')+'</span>').join('');
  const requirements=(data.analysis?.aiRequirements||[]).map(item=>'<p class="job-coach-muted"><strong>'+escape(item.text)+'</strong><br>'+escape(item.evidence||item.gap||'需要你核实对应经历')+'</p>').join('');
  const warnings=(data.warnings||[]).length?'<ul class="coach-warn">'+data.warnings.map(item=>'<li>'+escape(item)+'</li>').join('')+'</ul>':'';
  const adoptable=!!data.resume&&data.adoptable!==false;
  const adoptAttr=pending?'data-coach-pending-adopt':'data-coach-adopt';
  const adoptLabel=pending?'采用这次修改':'采用这份建议';
  const apply=data.mode==='review'?'':coach.applied
    ?'<div class="coach-applied">✓ 已采用，可继续编辑；原稿已保留为备份。</div>'
    :'<div class="coach-apply"><label><input type="checkbox" data-coach-reviewed><span>我已核对修改内容，确认个人经历、职责与成果符合事实。</span></label><div class="coach-apply-row"><button type="button" class="member-button primary" '+adoptAttr+(adoptable?'':' disabled title="建议内容较大只保留了文字，重新生成后可一键采用"')+'>'+adoptLabel+'</button><button type="button" class="member-button" data-coach-keep>保留原简历</button></div><p class="job-coach-muted">采用前会自动备份当前原稿，采用后仍可继续编辑。</p></div>';
  host.innerHTML='<div class="coach-head"><strong>'+(data.mode==='ai'?'AI 建议已生成':'基础整理已完成')+'</strong><span>'+escape(data.analysis?.notice||'')+'</span></div>'
    +(changes?'<div class="coach-list">'+changes+'</div>':'<p class="job-coach-muted">这次没有需要改写的段落。</p>')
    +(skills?'<div class="coach-chips">'+skills+'</div>':'')
    +requirements+warnings+apply;
}

function scheduleCoachSave(){
  clearTimeout(coach.timer);
  coach.timer=setTimeout(()=>persistCoach(),400);
}

/** 保存到本机：岗位、JD、建议全文和是否已采用。 */
function persistCoach(){
  if(!coach.built)return null;
  if(!coach.key)coachKeyNow();
  const form=coach.form;
  const outcome=saveJobCoach(coach.owner,coach.resumeId,{
    jobTitle:form?form.elements.jobTitle.value.trim():coach.jobTitle,
    jd:form?form.elements.jd.value:coach.jd,
    sourceKey:coach.sourceKey,
    baselineHash:coach.baselineHash,
    applied:coach.applied,
    opened:coach.open,
    result:coach.result,
    pendingResult:coach.pendingResult,
    feedbackMessages:coach.feedbackMessages
  });
  const saved=coach.body?.querySelector('[data-coach-saved]');
  if(saved)saved.textContent=outcome?.ok
    ? (coach.result&&!outcome.full?'建议已保存（内容较大，只保留文字部分）。':'建议保存在本机，收起或刷新后都能找回来。')
    : '本机存储空间不足，建议没有保存，请下载备份。';
  paintCoachBadge();
  return outcome;
}

function restoreCoach(){
  coachKeyNow();
  coach.loadedKey=coach.key;
  const saved=loadJobCoach(coach.owner,coach.resumeId);
  coach.result=saved?.result||null;
  coach.pendingResult=saved?.pendingResult||null;
  coach.feedbackMessages=Array.isArray(saved?.feedbackMessages)?saved.feedbackMessages:[];
  coach.viewingPending=false;
  coach.jobTitle=saved?.jobTitle||'';
  coach.jd=saved?.jd||'';
  // 老版本把岗位和 JD 暂存在 sessionStorage 里，第一次打开时接过来，别让用户白填。
  if(!saved){
    try{
      const draft=JSON.parse(sessionStorage.getItem('yizhi:job-draft:'+(getMember()?.user?.id||'local'))||'null');
      if(draft){
        coach.jobTitle=String(draft.jobTitle||'').slice(0,80);
        coach.jd=String(draft.jd||'').slice(0,12000);
        if(coach.jd||coach.jobTitle)scheduleCoachSave();
      }
    }catch{}
  }
  coach.sourceKey=saved?.sourceKey||'current';
  coach.baselineHash=saved?.baselineHash||'';
  coach.applied=!!saved?.applied;
  coach.confirmed=false;
  coach.baseline=null;
  coach.source=structuredClone(getResume());
  if(coach.form){
    coach.form.elements.jobTitle.value=coach.jobTitle;
    coach.form.elements.jd.value=coach.jd;
    const select=coach.form.elements.source;
    if(select&&[...select.options].some(option=>option.value===coach.sourceKey))select.value=coach.sourceKey;
    const note=coach.body.querySelector('[data-coach-source-note]');
    if(note)note.textContent='已读取：'+sourceSummary(coach.source);
  }
  coachError('');
  paintCoachNote();
  renderCoachResult();
}

function openJobCoach(){
  if(!coachShell())return;
  if(coach.open){closeJobCoach();return;}
  if(coach.loadedKey!==coachKeyNow())restoreCoach();
  bindCoachDrag();
  clearTimeout(coach.closeTimer);
  coach.open=true;
  coach.shell.inert=false;
  coach.shell.setAttribute('aria-hidden','false');
  document.body.classList.add('job-coach-host');
  void coach.shell.offsetWidth;
  coach.shell.classList.add('is-open');
  restoreCoachPosition();
  paintCoachNote();
  void fillCoachSources();
}

function closeJobCoach({remember=true}={}){
  if(!coach.shell)return;
  coach.open=false;
  coach.shell.classList.remove('is-open');
  coach.shell.inert=true;
  coach.shell.setAttribute('aria-hidden','true');
  // 等收起动画走完再让出位置，避免编辑区和预览瞬间跳回。
  clearTimeout(coach.closeTimer);
  coach.closeTimer=setTimeout(()=>{
    if(!coach.open)document.body.classList.remove('job-coach-host');
  },window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:260);
  if(remember)persistCoach();
}

async function fillCoachSources(){
  const select=coach.form?.elements.source;
  if(!select)return;
  try{
    const options=await tailorSources();
    if(!select.isConnected)return;
    select.innerHTML=options.map(item=>'<option value="'+escape(item.value)+'">'+escape(item.label)+'</option>').join('');
    if([...select.options].some(option=>option.value===coach.sourceKey))select.value=coach.sourceKey;
  }catch{}
}

async function changeCoachSource(){
  const select=coach.form.elements.source;
  const note=coach.body.querySelector('[data-coach-source-note]');
  const value=select.value;
  note.textContent='正在读取…';
  try{
    if(value==='current'){
      coach.sourceKey='current';
      coach.source=structuredClone(getResume());
    }else if(value==='backup'){
      const backup=JSON.parse(localStorage.getItem(BACKUP)||'null');
      if(!backup?.resume)throw Error('没有可用的切换前备份。');
      coach.sourceKey='backup';
      coach.source=structuredClone(backup.resume);
    }else if(value.startsWith('cloud:')){
      const saved=await memberRequest('resumes/'+encodeURIComponent(value.slice(6)));
      if(!select.isConnected)return;
      coach.sourceKey=value;
      coach.source=structuredClone(saved.resume);
      note.textContent='已读取：'+escape(saved.title)+' · '+sourceSummary(coach.source);
      scheduleCoachSave();
      return;
    }
    note.textContent='已读取：'+sourceSummary(coach.source);
    scheduleCoachSave();
  }catch(error){
    note.textContent=error.message;
    select.value='current';
    coach.sourceKey='current';
    coach.source=structuredClone(getResume());
  }
}

async function runCoach(basic=false){
  const form=coach.form;
  if(!form||coach.generating)return;
  const jd=form.elements.jd.value.trim();
  const jobTitle=form.elements.jobTitle.value.trim();
  const review=!basic&&!jd;
  // 「当前草稿」始终读最新的简历，避免面板开着时改过的内容没被分析到。
  const source=structuredClone(coach.sourceKey==='current'||!coach.source?getResume():coach.source);
  if(!basic&&!personalConnection('resume')){configurePersonalAi('resume',paintCoachNote);return;}
  if(basic&&!jd){coachError('基础整理需要岗位要求；只想看问题就把岗位要求留空，用 AI 诊断。');return;}
  if(jd&&jd.length<20){coachError('岗位要求至少 20 字；想直接分析简历就把它留空。');return;}
  if(!basic&&!review&&!jobTitle){coachError('请填写目标岗位名称。');return;}
  if(!basic&&form.elements.consent.checked!==true){coachError('请先勾选授权：简历经历和岗位要求会发送给你连接的 AI 服务。');return;}
  if(!hasResumeContent(source)){coachError('选中的简历还没有内容，请先填写或换一份。');return;}
  coachError('');
  coach.jobTitle=jobTitle;
  coach.jd=jd;
  coach.baseline=source;
  coach.baselineHash=coachHash(source);
  coach.confirmed=false;
  const progress=coach.body.querySelector('[data-coach-progress]');
  coach.generating=true;
  progress.hidden=false;
  progress.querySelector('[data-coach-progress-text]').textContent=review?'正在诊断简历…':'正在按岗位调整表达…';
  form.querySelectorAll('button,input,textarea,select').forEach(element=>element.disabled=true);
  paintCoachNote();
  coach.controller=new AbortController();
  try{
    const result=basic
      ?await memberRequest('basic','POST',{resume:source,jd,jobTitle},{signal:coach.controller.signal})
      :review
        ?await requestPersonalAi('resume',{resume:resumeWithoutIdentity(source),mode:'review'},{signal:coach.controller.signal})
        :await requestPersonalAi('resume',{resume:resumeWithoutIdentity(source),jd,jobTitle},{signal:coach.controller.signal});
    if(!basic&&!review){
      result.resume.basicInfo=structuredClone(source.basicInfo);
      result.resume.coverData=structuredClone(source.coverData);
      result.resume.zijianData=structuredClone(source.zijianData);
    }
    coach.result=result;
    coach.pendingResult=null;
    coach.viewingPending=false;
    coach.applied=false;
    persistCoach();
    renderCoachResult();
    if(!basic&&!review)void refreshMember().catch(()=>{});
    coach.body.querySelector('[data-coach-result]')?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }catch(error){
    coachError(error.name==='AbortError'?'已停止等待，简历没有变化。':(error.message||String(error)));
  }finally{
    coach.generating=false;
    progress.hidden=true;
    form.querySelectorAll('button,input,textarea,select').forEach(element=>element.disabled=false);
    coach.controller=null;
    paintCoachNote();
  }
}

/**
 * 用户在建议面板里的反馈：先存聊天记录，再请求 AI 生成「待确认版本」。
 * 当前建议和简历都不变，只有点击「采用这次修改」才写入编辑器。
 */
async function runCoachFeedback(){
  const previous=coach.result;
  if(!previous||previous.mode!=='ai'||coach.feedbackGenerating||coach.generating)return;
  const input=coach.body.querySelector('[data-coach-feedback-input]');
  const feedback=String(input?.value||'').trim().slice(0,2000);
  if(feedback.length<2){coachError('请简单说说想怎么调整，例如：项目成果再具体一点。');return;}
  if(!personalConnection('resume')){configurePersonalAi('resume',()=>{paintCoachNote();renderCoachFeedback();});return;}
  const jd=coach.form.elements.jd.value.trim();
  const jobTitle=coach.form.elements.jobTitle.value.trim();
  if(jd.length<20||!jobTitle){coachError('按反馈修改需要目标岗位和至少 20 字的岗位要求，请先补全。');return;}
  const feedbackConsent=coach.body.querySelector('[data-coach-feedback-consent]');
  if(coach.form.elements.consent.checked!==true&&feedbackConsent?.checked!==true){coachError('请先勾选授权：简历和反馈会发送给你连接的 AI 服务。');return;}
  if(feedbackConsent?.checked)coach.form.elements.consent.checked=true;
  coachError('');
  coach.feedbackGenerating=true;
  coach.feedbackMessages=[...coach.feedbackMessages,{role:'user',text:feedback,createdAt:Date.now()}].slice(-8);
  if(input)input.value='';
  coach.controller=new AbortController();
  renderCoachFeedback();
  try{
    const currentSource=structuredClone(coach.sourceKey==='current'||!coach.source?getResume():coach.source);
    // 只回传建议结论，不回传带姓名/联系方式的简历副本。
    const previousResult={
      analysis:{aiRequirements:Array.isArray(previous.analysis?.aiRequirements)?previous.analysis.aiRequirements.slice(0,12):[]},
      changes:Array.isArray(previous.changes)?previous.changes.slice(0,20):[],
      warnings:Array.isArray(previous.warnings)?previous.warnings.slice(0,10):[]
    };
    const next=await requestPersonalAi('resume',{resume:resumeWithoutIdentity(currentSource),jd,jobTitle,mode:'feedback',feedback,previousResult},{signal:coach.controller.signal});
    const identity=coach.baseline||previous.resume||currentSource;
    if(next?.resume){
      next.resume.basicInfo=structuredClone(identity.basicInfo||{});
      next.resume.coverData=structuredClone(identity.coverData||{});
      next.resume.zijianData=structuredClone(identity.zijianData||{});
    }
    coach.pendingResult=next;
    coach.viewingPending=false;
    coach.feedbackMessages=[...coach.feedbackMessages,{role:'assistant',text:'已按反馈生成新建议。当前建议保留，采用前不会改动简历。',createdAt:Date.now()}].slice(-8);
    persistCoach();
    renderCoachResult();
    coach.body.querySelector('[data-coach-feedback]')?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }catch(error){
    const stopped=error.name==='AbortError';
    coach.feedbackMessages=[...coach.feedbackMessages,{role:'assistant',text:stopped?'已停止，当前建议没有变化。':'这次没有改成：'+(error.message||error),createdAt:Date.now()}].slice(-8);
    coachError(stopped?'已停止，当前建议没有变化。':(error.message||String(error)));
    persistCoach();
    renderCoachResult();
  }finally{
    coach.feedbackGenerating=false;
    coach.controller=null;
    renderCoachFeedback();
  }
}

async function adoptCoach(target=coach.result,fromPending=false){
  const result=target;
  const host=coach.body.querySelector('[data-coach-result]');
  if(!result?.resume){
    coachError('这条建议只保留了文字（内容较大），重新生成后才能一键采用。');
    return;
  }
  const reviewed=host.querySelector('[data-coach-reviewed]');
  if(reviewed&&!reviewed.checked){coachError('请先核对并确认修改内容符合事实。');return;}
  const current=getResume();
  if(coach.sourceKey==='current'&&coach.baselineHash&&coachHash(current)!==coach.baselineHash&&!coach.confirmed){
    coach.confirmed=true;
    coachError('简历在生成后有改动，再点一次「采用」会覆盖这些改动；原稿会先备份。');
    return;
  }
  const button=host.querySelector(fromPending?'[data-coach-pending-adopt]':'[data-coach-adopt]');
  if(button)button.disabled=true;
  try{
    await preserveCurrent();
    backupCurrent();
    const identity=coach.baseline||result.resume;
    const next=structuredClone(result.resume);
    next.basicInfo=structuredClone(identity.basicInfo);
    next.coverData=structuredClone(identity.coverData);
    next.zijianData=structuredClone(identity.zijianData);
    let nextLink=null;
    if(getMember()?.authenticated)nextLink=await saveNew({title:(coach.jobTitle||'岗位')+' · 投递版',kind:'job',jobTitle:coach.jobTitle,resume:next});
    suppressed=true;
    replaceResume(next);
    link=nextLink;
    dirty=false;
    rememberLink();
    flushSave();
    suppressed=false;
    paintCloud(link?'linked':'local','岗位版本已采用，可继续编辑；原稿已保留为备份');
    if(result.mode==='ai')void memberRequest('activity','POST',{type:'adopt'}).catch(()=>{});
    track('job_version_adopt');
    coach.applied=true;
    coach.confirmed=false;
    coach.baselineHash=coachHash(next);
    if(fromPending){coach.result=result;coach.pendingResult=null;coach.viewingPending=false;}
    coachKeyNow();
    persistCoach();
    renderCoachResult();
    coachError('');
  }catch(error){
    suppressed=false;
    coachError(error.message||String(error));
  }finally{
    if(button)button.disabled=false;
  }
}

export async function installEditorMember(){
  const heading=document.querySelector('.editor-heading');
  if(!heading)return;
  heading.querySelector('strong').outerHTML='<button type="button" id="resumeWorkspaceButton" class="resume-workspace-button" aria-haspopup="dialog"><span>本地草稿</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>';
  document.querySelector('#resumeWorkspaceButton').onclick=workspaceDialog;
  const controls=document.createElement('div');controls.className='member-tools-wrap';controls.innerHTML='<div class="member-tools"><button type="button" class="member-button" id="cloudSaveButton">保存到云端</button><button type="button" class="member-button primary" id="jobTailorButton">AI 建议</button></div>';heading.append(controls);
  setupMobileEditorTools(controls);
  const status=document.createElement('span');status.id='cloudStatus';status.className='member-cloud-status';status.setAttribute('role','status');status.textContent='本地自动保存 · 登录后可同步';heading.append(status);
  const account=document.createElement('li');account.className='member-nav-item';account.innerHTML='<a class="member-account-icon" href="/account/" aria-label="登录或管理我的简历" title="登录 / 我的简历"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></a>';document.querySelector('.get_list')?.prepend(account);
  const support=document.createElement('li');support.className='member-nav-item support-editor-item';support.innerHTML='<a class="support-nav-link" aria-label="支持一下" href="/plans/?return=%2Fresume%2F"><img class="support-nav-icon" src="/assets/img/brand/support-coffee.png" width="22" height="22" alt=""><span>支持一下</span></a>';document.querySelector('.get_list')?.prepend(support);
  installGithubNav();
  document.querySelector('#cloudSaveButton').onclick=cloudDialog;document.querySelector('#jobTailorButton').onclick=openJobCoach;
  subscribeResume(()=>{if(suppressed||!link)return;dirty=true;link.pending=true;rememberLink();if(cloudState==='conflict')return;paintCloud('saving');clearTimeout(timer);timer=setTimeout(syncCloud,1500);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void syncCloud();});
  window.addEventListener('resume-file-generated',()=>{if(getMember()?.authenticated)void memberRequest('activity','POST',{type:'export'}).catch(()=>{});askSourceOnce();});
  window.addEventListener('member-change',()=>{coach.loadedKey='';if(link&&getMember()?.user?.id!==link.owner){dirty=false;clearTimeout(timer);link=null;rememberLink();paintCloud('local');}});
  paintCloud(link?'linked':'local');
  try{await refreshMember();}catch{paintCloud('error','本地保存正常，账户服务暂时不可用');return;}
  if(!link&&getMember()?.authenticated)paintCloud('local','本地自动保存 · 可保存到云端');
  if(link?.pending){dirty=true;paintCloud('saving');timer=setTimeout(syncCloud,1500);}
  // 已有保存过的建议时，在「AI 建议」按钮上留个标记，提示可以直接打开。
  coachKeyNow();
  const savedCoach=loadJobCoach(coach.owner,coach.resumeId);
  if(savedCoach){coach.result=savedCoach.result;coach.jobTitle=savedCoach.jobTitle;coach.jd=savedCoach.jd;coach.sourceKey=savedCoach.sourceKey;coach.baselineHash=savedCoach.baselineHash;coach.applied=savedCoach.applied;}
  paintCoachBadge();
  const params=new URLSearchParams(location.search);
  if(params.has('cloud'))await openCloud(params.get('cloud'),{confirm:params.get('created')!=='1'});
  else if(params.get('workspace')==='1')void workspaceDialog();
  else if(params.get('cloudSave')==='1')cloudDialog();
  else if(params.get('tailor')==='1')openJobCoach();
}
