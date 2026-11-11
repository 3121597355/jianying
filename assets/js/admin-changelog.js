const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={feature:'新增功能',improvement:'体验优化',fix:'问题修复'};
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);

export function changelogView(data){
  return `<div class="changelog-layout"><section class="panel"><div class="panel-heading"><div><h2>版本记录</h2><p>共 ${data.entries.length} 条 · 按发布日期从新到旧</p></div></div><div class="changelog-list">${data.entries.length?data.entries.map(entry=>`<article class="changelog-entry"><div class="changelog-meta"><span class="changelog-version">${esc(entry.version)}</span><time datetime="${entry.date}">${entry.date}</time><span class="changelog-kind">${kinds[entry.kind]}</span></div><h3>${esc(entry.title)}</h3><p class="changelog-content">${esc(entry.content)}</p><div class="changelog-actions"><button class="secondary" type="button" data-log-edit="${entry.id}" aria-label="编辑 ${esc(entry.title)}">编辑</button><button class="secondary log-delete" type="button" data-log-delete="${entry.id}" aria-label="删除 ${esc(entry.title)}">删除</button></div></article>`).join(''):'<p class="empty">还没有更新日志，可以在编辑区新增第一条。</p>'}</div></section><section class="panel changelog-editor" aria-labelledby="log-editor-title"><div class="panel-heading"><div><h2 id="log-editor-title">新增日志</h2><p>记录这一版带来的变化，支持多行纯文本。</p></div><button id="log-new" class="secondary" type="button">新增</button></div><form id="changelog-form"><div class="settings-fields"><label>版本标记<input name="version" maxlength="40" placeholder="例如 2.1.0" required></label><label>发布日期<input name="date" type="date" value="${today()}" required></label><label class="wide">更新类型<select name="kind"><option value="feature">新增功能</option><option value="improvement">体验优化</option><option value="fix">问题修复</option></select></label><label class="wide">更新标题<input name="title" maxlength="100" placeholder="这一版最主要的变化" required></label><label class="wide">更新内容<textarea name="content" maxlength="6000" rows="9" placeholder="每行写一项更新，说明改了什么、有什么帮助。" required></textarea><small>最多 6000 个字符。日志仅在管理员后台展示。</small></label></div><div class="settings-footer"><button class="primary" type="submit">保存日志</button><button class="secondary" type="button" id="log-cancel" hidden>取消编辑</button></div></form><p class="settings-help">保存后刷新或重新登录仍可查看。版本标记用于整理记录，不会修改程序版本。</p></section></div>`;
}

export function bindChangelog({data,api,notify,showError,isDirty,markClean,refresh}){
  const form=document.querySelector('#changelog-form');let editingId='',saving=false;
  const control=name=>form.elements.namedItem(name);
  function fill(entry){
    editingId=entry?.id||'';
    for(const name of ['version','title','content'])control(name).value=entry?.[name]||'';
    control('date').value=entry?.date||today();control('kind').value=entry?.kind||'feature';
    document.querySelector('#log-editor-title').textContent=entry?'编辑日志':'新增日志';
    document.querySelector('#log-cancel').hidden=!entry;markClean();control('version').focus();
  }
  function canSwitch(){return !saving&&(!isDirty()||confirm('有尚未保存的日志内容，确定切换？'));}
  document.querySelector('#log-new').onclick=()=>{if(canSwitch())fill();};
  document.querySelector('#log-cancel').onclick=()=>{if(canSwitch())fill();};
  document.querySelectorAll('[data-log-edit]').forEach(button=>button.onclick=()=>{if(canSwitch())fill(data.entries.find(e=>e.id===button.dataset.logEdit));});
  document.querySelectorAll('[data-log-delete]').forEach(button=>button.onclick=async()=>{
    if(saving)return;const entry=data.entries.find(e=>e.id===button.dataset.logDelete);
    if(!confirm(`确定删除「${entry.title}」？${isDirty()?'未保存的编辑内容也会被放弃。':''}删除后无法在后台恢复。`))return;
    saving=true;button.disabled=true;showError('');
    try{await api('/api/admin/changelog/'+entry.id,'DELETE',{revision:data.revision});markClean();await refresh();notify('更新日志已删除');}catch(error){showError(error.message);}finally{saving=false;button.disabled=false;}
  });
  form.onsubmit=async event=>{
    event.preventDefault();if(saving)return;saving=true;const button=form.querySelector('[type=submit]');button.disabled=true;showError('');
    const entry=Object.fromEntries(['version','date','kind','title','content'].map(name=>[name,control(name).value]));
    try{await api('/api/admin/changelog'+(editingId?'/'+editingId:''),editingId?'PUT':'POST',{revision:data.revision,entry});markClean();await refresh();notify(editingId?'更新日志已修改':'更新日志已保存');}catch(error){showError(error.message);}finally{saving=false;button.disabled=false;}
  };
}
