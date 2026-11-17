const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function resumeAiView(config){
  if(config.unavailable)return '';
  return `<section class="panel" style="margin-top:24px;padding:24px"><h2>简历 AI 服务</h2><p class="settings-help">当前用户端已改为自填 API Key；个人密钥不会写入这里。以下为旧站点托管服务配置，仅为兼容已有部署保留。</p><p class="settings-help">收费套餐已关闭，自愿支持不影响免费使用。<a href="/plans/?adminPreview=1" target="_blank" rel="noopener">预览自愿支持页面 ↗</a></p><form id="resume-ai-form" class="security-form"><label>API 基础地址<input name="baseUrl" type="url" value="${esc(config.baseUrl)}" placeholder="https://api.example.com/v1" required><small class="muted">使用兼容 Chat Completions 的 HTTPS 地址，系统会追加 /chat/completions。</small></label><label>模型名称<input name="model" value="${esc(config.model)}" maxlength="120" placeholder="填写服务商提供的文本模型名称" required><small class="muted">填写完整模型 ID，不能只写品牌名；以服务商提供的模型列表为准。</small></label><label>专用 API 密钥<input name="apiKey" type="password" autocomplete="new-password" maxlength="4000" placeholder="${config.keyConfigured?'已配置；留空保留现有密钥':'尚未配置'}"><small class="muted">不要填写到前端代码或提交到 GitHub。</small></label><label>每账户每天免费生成次数<input name="dailyLimit" type="number" min="1" max="50" value="${config.dailyLimit||3}" required></label><label class="checkbox"><input name="enabled" type="checkbox" ${config.enabled?'checked':''}>启用免费 AI 按岗位生成</label><label class="checkbox"><input name="clearKey" type="checkbox">清除保存的密钥并停用</label><button type="submit" class="primary">保存 AI 服务配置</button></form></section>`;
}
export function bindResumeAi({host,api,notify,showError,refresh,markClean}){
  host.querySelector('#resume-ai-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),data=Object.fromEntries(new FormData(form));button.disabled=true;
    try{const clearKey=data.clearKey==='on';await api('/api/admin/resume-ai','PUT',{baseUrl:data.baseUrl,model:data.model,apiKey:data.apiKey,dailyLimit:Number(data.dailyLimit),enabled:!clearKey&&data.enabled==='on',clearKey});form.querySelector('[name=apiKey]').value='';markClean();notify('AI 服务配置已保存，新请求使用最新设置');await refresh();}
    catch(error){showError(error.message);}finally{button.disabled=false;}
  });
}
