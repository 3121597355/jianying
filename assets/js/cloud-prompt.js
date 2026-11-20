/**
 * 导出成功后再问一次「要不要存到云端」。
 * 基础编辑和导出一直免费；这里只在用户拿到成品、最愿意留个账号的时刻出现一次。
 */
import {memberRequest,getMember,setMember,escape,dialog,loginLink} from './member-client.js';
import {getResume} from './store.js';
import {hasResumeContent} from './template-samples.js';
import {track} from './analytics.js';

const SESSION_KEY='yizhi:cloud-prompt-shown';
let open=false;

function titleFor(resume){
  const name=String(resume?.basicInfo?.name||'').trim();
  return name?`${name}的简历`:'我的基础简历';
}

export function setupCloudPrompt({toast,onSaved}={}){
  function afterExport(){
    if(open||getMember()?.authenticated)return;
    try{if(sessionStorage.getItem(SESSION_KEY)==='1')return;}catch{}
    const resume=getResume();
    if(!hasResumeContent(resume))return;
    try{sessionStorage.setItem(SESSION_KEY,'1');}catch{}
    open=true;
    // 等下载提示先出现，避免两个浮层抢同一秒钟。
    setTimeout(()=>{open=false;show(resume);},900);
  }

  function show(resume){
    track('cloud_prompt_view');
    const box=dialog('文件已下载 · 要不要也存一份到云端？',`
      <p>存到云端，换手机或电脑都能接着改；投不同岗位时还能复制成第二份。</p>
      <form class="member-form" novalidate>
        <label class="member-field">邮箱或手机号<input name="username" type="text" autocomplete="username" inputmode="email" placeholder="you@example.com" required></label>
        <label class="member-field">设置密码<input name="password" type="password" autocomplete="new-password" minlength="10" placeholder="至少 10 位" required></label>
        <label class="member-check"><input type="checkbox" name="acceptPrivacy"><span>我已阅读并同意<a href="/privacy/" target="_blank" rel="noopener">《使用与隐私》</a></span></label>
        <p class="member-error" data-error hidden role="alert"></p>
        <div class="member-actions"><button class="member-button primary" type="submit">免费保存到云端</button><button class="member-button" type="button" data-skip>先不用</button></div>
      </form>
      <p class="member-muted">不注册也能一直免费编辑和导出。已经注册过？<a href="${loginLink('/resume/')}">直接登录</a></p>`);
    box.querySelector('[data-skip]').onclick=()=>{track('cloud_prompt_skip');box.close();};
    const form=box.querySelector('.member-form');
    form.onsubmit=async event=>{
      event.preventDefault();
      const error=form.querySelector('[data-error]'),button=form.querySelector('[type=submit]');
      const values=Object.fromEntries(new FormData(form));
      error.hidden=true;
      if(!values.acceptPrivacy){error.hidden=false;error.textContent='请先勾选同意《使用与隐私》。';return;}
      button.disabled=true;
      try{
        const session=await memberRequest('register','POST',{username:String(values.username||'').trim(),password:String(values.password||''),acceptPrivacy:true});
        setMember(session);
        const saved=await memberRequest('resumes','POST',{title:titleFor(resume),kind:'base',jobTitle:'',resume});
        track('cloud_prompt_register');
        track('resume_cloud_saved');
        try{await onSaved?.({id:saved.id,version:saved.version,title:saved.title});}catch{}
        box.querySelector('.member-dialog-body').innerHTML=`<p>已存到云端：<strong>${escape(saved.title||titleFor(resume))}</strong>。之后在这台设备或其它设备打开「个人中心」都能继续改。</p><p class="member-muted">这是账户恢复码，忘记密码时用它找回；只显示这一次，请自己存好。</p><p class="member-recovery">${escape(session.recoveryCode||'')}</p><div class="member-actions"><button class="member-button primary" type="button" data-done>继续编辑</button><a class="member-button" href="/account/">去个人中心</a></div>`;
        box.querySelector('[data-done]').onclick=()=>box.close();
        toast?.('已保存到云端，换设备也能接着改');
      }catch(failure){
        error.hidden=false;
        if(failure?.status===409||/注册|已被使用|已存在/.test(failure?.message||'')){
          error.innerHTML=`这个账号已经注册过了，先用 <a href="${loginLink('/resume/')}">直接登录</a>，再从「保存到云端」存这一份。`;
        }else error.textContent=failure?.message||'注册没有完成，请稍后再试。';
      }finally{
        button.disabled=false;
      }
    };
  }

  return {afterExport};
}
