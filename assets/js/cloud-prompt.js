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

const ACCOUNT_PATTERN=/^[^\s@]+@[^\s@]+\.[^\s@]+$|^1[3-9]\d{9}$/;

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
    let completed=false;
    let skipped=false;
    let accountCreated=false;
    let createdSession=null;
    const box=dialog('文件已下载 · 要不要也存一份到云端？',`
      <p>存到云端，换手机或电脑都能接着改；投不同岗位时还能复制成第二份。</p>
      <form class="member-form" novalidate>
        <label class="member-field">邮箱或手机号<input name="username" type="text" autocomplete="username" inputmode="email" enterkeyhint="next" maxlength="120" placeholder="you@example.com" required></label>
        <label class="member-field">设置密码<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="至少 10 位" required></label>
        <label class="member-check"><input type="checkbox" name="acceptPrivacy"><span>我已阅读并同意<a href="/privacy/" target="_blank" rel="noopener">《使用与隐私》</a></span></label>
        <p class="member-error" data-error hidden role="alert"></p>
        <div class="member-actions"><button class="member-button primary" type="submit">免费保存到云端</button><button class="member-button" type="button" data-skip>先不用</button></div>
      </form>
      <p class="member-muted">不注册也能一直免费编辑和导出。已经注册过？<a href="${loginLink('/resume/')}">直接登录</a></p>`,{onClose:()=>{if(!completed&&!skipped)track('cloud_prompt_dismiss');}});
    box.querySelector('[data-skip]').onclick=()=>{skipped=true;track('cloud_prompt_skip');box.close();};
    const form=box.querySelector('.member-form');
    const usernameInput=form.querySelector('[name="username"]');
    if(window.matchMedia('(min-width: 861px)').matches)usernameInput.focus({preventScroll:true});
    else{
      const heading=box.querySelector('.member-dialog-head h2');
      heading.tabIndex=-1;
      heading.focus({preventScroll:true});
    }

    const finishSave=async session=>{
      const record=await memberRequest('resumes','POST',{title:titleFor(resume),kind:'base',jobTitle:'',resume});
      completed=true;
      try{await onSaved?.({id:record.id,version:record.version,title:record.title});}catch{}
      box.querySelector('.member-dialog-body').innerHTML=`<p>已存到云端：<strong>${escape(record.title||titleFor(resume))}</strong>。之后在这台设备或其它设备打开「个人中心」都能继续改。</p><p class="member-muted">这是账户恢复码，忘记密码时用它找回；只显示这一次，请自己存好。</p><p class="member-recovery">${escape(session.recoveryCode||'')}</p><div class="member-actions"><button class="member-button primary" type="button" data-done>继续编辑</button><a class="member-button" href="/account/">去个人中心</a></div>`;
      box.querySelector('[data-done]').onclick=()=>box.close();
      track('resume_cloud_saved');
      toast?.('已保存到云端，换设备也能接着改');
    };

    const showPartialFailure=(failure,session)=>{
      box.querySelector('.member-dialog-body').innerHTML=`<p>账户已经创建，但这张简历还没有存进云端。</p><p class="member-muted">${escape(failure?.message||'网络暂时不可用，请稍后再试。')} 你可以直接重试，或先继续本地编辑。</p><div class="member-actions"><button class="member-button primary" type="button" data-retry-cloud>重新保存</button><a class="member-button" href="/account/">去个人中心</a></div>`;
      const retry=box.querySelector('[data-retry-cloud]');
      retry.onclick=async()=>{
        retry.disabled=true;
        try{await finishSave(session);}catch(next){showPartialFailure(next,session);}
      };
    };

    form.onsubmit=async event=>{
      event.preventDefault();
      const error=form.querySelector('[data-error]'),button=form.querySelector('[type=submit]');
      const values=Object.fromEntries(new FormData(form));
      const username=String(values.username||'').trim();
      const password=String(values.password||'');
      error.hidden=true;
      if(!ACCOUNT_PATTERN.test(username)){error.hidden=false;error.textContent='请输入邮箱或 11 位手机号，例如 you@example.com。';form.querySelector('[name="username"]').focus();return;}
      if(password.length<10){error.hidden=false;error.textContent='密码至少 10 位。';form.querySelector('[name="password"]').focus();return;}
      if(!values.acceptPrivacy){error.hidden=false;error.textContent='请先勾选同意《使用与隐私》。';form.querySelector('[name="acceptPrivacy"]').focus();return;}
      button.disabled=true;
      try{
        const session=await memberRequest('register','POST',{username,password,acceptPrivacy:true});
        setMember(session);
        createdSession=session;
        accountCreated=true;
        track('cloud_prompt_register');
        await finishSave(session);
      }catch(failure){
        if(accountCreated)showPartialFailure(failure,createdSession);
        else if(failure?.status===409||/注册|已被使用|已存在/.test(failure?.message||'')){
          error.hidden=false;
          error.innerHTML=`这个账号已经注册过了，先用 <a href="${loginLink('/resume/')}">直接登录</a>，再从「保存到云端」存这一份。`;
        }else{
          error.hidden=false;
          error.textContent=failure?.message||'注册没有完成，请稍后再试。';
        }
      }finally{
        button.disabled=false;
      }
    };
  }

  return {afterExport};
}
