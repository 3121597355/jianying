import {dialog,escape} from './member-client.js';
const connections=new Map();
export const personalConnection=kind=>connections.get(kind)||null;
export function configurePersonalAi(kind='resume',onSaved=()=>{}){
  const portrait=kind==='portrait',current=personalConnection(kind)||{};
  const box=dialog(portrait?'连接我的照片 AI':'连接我的简历 AI',`<p class="member-muted">使用兼容 OpenAI 的${portrait?'图像编辑':'Chat Completions'}接口。调用费用由你的服务商账户承担，本站不售卖 AI 次数。</p><form class="member-form" autocomplete="off"><label>API 基础地址<input name="baseUrl" type="url" placeholder="https://api.example.com/v1" value="${escape(current.baseUrl||'')}" required><small>填写 Base URL，不包含 ${portrait?'/images/edits':'/chat/completions'}。</small></label><label>模型名称<input name="model" placeholder="服务商提供的完整模型 ID" value="${escape(current.model||'')}" maxlength="160" required></label><label>API Key<input name="apiKey" type="password" value="${escape(current.apiKey||'')}" maxlength="4000" autocomplete="off" required></label>${portrait?'<label>图片请求格式<select name="mode"><option value="multipart">Multipart · 标准图片编辑</option><option value="json">JSON · images 图片地址</option></select></label><label>Multipart 图片字段<select name="imageField"><option value="image">image</option><option value="image[]">image[]</option></select></label>':''}<p class="member-muted">密钥仅在当前标签页内存中暂存，刷新或关闭后清除；不会写入草稿、云端账户或后台配置。调用时经本站临时转发给你指定的服务商。</p><p class="member-error" data-error hidden role="alert"></p><div class="member-actions"><button class="member-button primary" type="submit">使用此连接</button><button class="member-button" type="button" data-clear>清除连接</button></div></form>`);
  if(portrait){box.querySelector('[name=mode]').value=current.mode||'multipart';box.querySelector('[name=imageField]').value=current.imageField||'image';}
  box.querySelector('[data-clear]').onclick=()=>{connections.delete(kind);window.dispatchEvent(new CustomEvent('personal-ai-change',{detail:kind}));onSaved();box.close();};
  box.querySelector('form').onsubmit=event=>{
    event.preventDefault();const form=event.currentTarget,input=Object.fromEntries(new FormData(form));
    try{const url=new URL(input.baseUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port)throw Error('请填写不含密钥与参数的 HTTPS 基础地址。');if(/\/(chat\/completions|images\/edits|models)\/?$/.test(url.pathname))throw Error('请去掉接口路径，填写 API 基础地址。');connections.set(kind,{...input,baseUrl:url.href.replace(/\/$/,'')});window.dispatchEvent(new CustomEvent('personal-ai-change',{detail:kind}));onSaved();box.close();}
    catch(error){const label=box.querySelector('[data-error]');label.hidden=false;label.textContent=error.message;}
  };
}
export async function requestPersonalAi(kind,input,{signal}={}){
  const connection=personalConnection(kind);if(!connection)throw Error('请先连接你自己的 API Key。');
  const response=await fetch('/api/personal-ai/'+(kind==='portrait'?'portrait':'tailor'),{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,connection,consent:true}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(58000)]):AbortSignal.timeout(58000)});
  const data=await response.json().catch(()=>({error:'服务响应未完成，请查看服务商调用记录后再重试。'}));if(!response.ok)throw Error(data.error||'个人 AI 请求未完成。');return data;
}
export function resumeWithoutIdentity(resume){
  const value=structuredClone(resume);value.basicInfo={};value.coverData={};value.zijianData={};return value;
}
