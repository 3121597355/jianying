import {createDefault} from './resume-defaults.js';
import {createStarterResume} from './template-choice.js';
import {memberRequest,getMember,escape,dialog} from './member-client.js';

/** Creates an independent cloud document; callers decide how to open it. */
export function createResumeDialog({resumes=[],limit=10,current,beforeCreate,onCreated}={}){
  const box=dialog('新建简历',`<form class="member-form"><label>简历名称<input name="title" maxlength="80" value="${resumes.length?'新简历 '+(resumes.length+1):'我的基础简历'}" required></label><label>从哪里开始<select name="source"><option value="sample">完整模板示例（推荐）</option><option value="blank">空白简历</option>${current?'<option value="current">复制当前正在编辑的简历</option>':''}${resumes.map(item=>`<option value="${escape(item.id)}">复制 · ${escape(item.title)}</option>`).join('')}</select></label><p class="member-muted">示例为虚构履历，可直接改成你的信息。每份简历独立保存，可以为不同岗位分别准备。${resumes.length} / ${limit} 份已使用。</p><p class="member-error" data-error hidden role="alert"></p><div class="member-actions"><button type="button" class="member-button" data-cancel>取消</button><button type="submit" class="member-button primary" ${resumes.length>=limit?'disabled':''}>新建并编辑</button></div>${resumes.length>=limit?'<p class="member-muted">云端简历已满，请先在个人中心删除不再需要的版本。</p>':''}</form>`);
  box.querySelector('[data-cancel]').onclick=()=>box.close();
  box.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,input=Object.fromEntries(new FormData(form)),button=form.querySelector('[type=submit]');
    if(!input.title.trim()){form.elements.title.setCustomValidity('请填写简历名称');form.elements.title.reportValidity();return;}
    button.disabled=true;form.querySelector('[data-error]').hidden=true;
    try{
      const owner=getMember()?.user?.id;
      if(!owner)throw Error('请先登录，再新建云端简历。');
      await beforeCreate?.();if(!box.open)return;
      let resume=createDefault(),kind='base',jobTitle='';
      if(input.source==='sample')resume=createStarterResume();
      else if(input.source==='current')resume=structuredClone(current());
      else if(input.source!=='blank'){
        const original=await memberRequest('resumes/'+encodeURIComponent(input.source));
        resume=original.resume;kind=original.kind;jobTitle=original.jobTitle;
      }
      if(!box.open)return;
      if(getMember()?.user?.id!==owner)throw Error('账户状态已改变，请重新打开新建窗口。');
      const saved=await memberRequest('resumes','POST',{title:input.title.trim(),resume,kind,jobTitle});
      if(!box.open||getMember()?.user?.id!==owner)return;
      await onCreated?.(saved,box);if(box.open)box.close();
    }catch(error){if(box.open){const label=form.querySelector('[data-error]');label.hidden=false;label.textContent=error.message||String(error);}}
    finally{button.disabled=false;}
  };
  box.querySelector('[name=title]').oninput=event=>event.target.setCustomValidity('');
  return box;
}
