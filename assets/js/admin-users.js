// Registered account list for the administrator console.
// Renders identifiers, timestamps and operation counts only — never resume text or photos.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=value=>String(value).padStart(2,'0');
const stamp=value=>{if(!value)return '—';const date=new Date(value);return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;};
const relative=value=>{if(!value)return '从未';const diff=Date.now()-value,minute=60000,hour=3600000,day=86400000;if(diff<minute)return '刚刚';if(diff<hour)return Math.floor(diff/minute)+' 分钟前';if(diff<day)return Math.floor(diff/hour)+' 小时前';if(diff<30*day)return Math.floor(diff/day)+' 天前';return stamp(value).slice(0,10);};
const number=value=>Number(value||0).toLocaleString('zh-CN');
const sorts=[['recent','最近活动'],['created','注册时间'],['resumes','云端简历数量']];

export function usersView(data){
  if(!data||data.unavailable)return '<div class="empty"><strong>账户数据尚未连接</strong>请检查服务部署配置后再试。</div>';
  const query=data.query||'';
  const locked=sorts.some(([key])=>key===data.sort)?data.sort:'recent';
  const toolbar=`<div class="users-toolbar">
    <form id="users-search" class="users-search" role="search">
      <input id="users-query" type="search" name="q" value="${esc(query)}" maxlength="40" placeholder="搜索用户名或昵称" aria-label="搜索用户名或昵称">
      <button class="secondary" type="submit">搜索</button>
    </form>
    <label class="users-sort">排序
      <select id="users-sort">${sorts.map(([key,label])=>`<option value="${key}"${key===locked?' selected':''}>${label}</option>`).join('')}</select>
    </label>
    <a class="secondary" href="/api/admin/accounts/export">导出 CSV <span aria-hidden="true">↓</span></a>
  </div>`;
  if(!data.total)return toolbar+'<div class="empty"><strong>还没有注册账户</strong>有人注册后会出现在这里。</div>';
  if(!data.matched)return toolbar+`<div class="empty"><strong>没有匹配的账户</strong>换个用户名或昵称再试。</div>`;
  const rows=data.accounts.map(item=>`<tr>
    <td><strong>${esc(item.username)}</strong>${item.nickname&&item.nickname!==item.username?`<small class="muted">${esc(item.nickname)}</small>`:''}</td>
    <td>${esc(stamp(item.createdAt))}</td>
    <td title="${esc(stamp(item.lastActiveAt))}">${esc(relative(item.lastActiveAt))}</td>
    <td class="num">${number(item.resumeCount)}</td>
    <td class="num">${number(item.cloudSaves)}</td>
    <td class="num">${number(item.exports)}</td>
    <td class="num">${number(item.aiGenerations)}</td>
    <td class="num">${number(item.logins)}</td>
  </tr>`).join('');
  const pager=data.pages>1?`<div class="users-pager"><button type="button" class="secondary" data-users-page="${data.page-1}"${data.page<=1?' disabled':''}>← 上一页</button><span>第 ${data.page} / ${data.pages} 页 · 共 ${number(data.matched)} 个账户</span><button type="button" class="secondary" data-users-page="${data.page+1}"${data.page>=data.pages?' disabled':''}>下一页 →</button></div>`:`<p class="users-count">共 ${number(data.matched)} 个账户</p>`;
  return `${toolbar}<div class="data-table-wrap"><table class="data-table data-table-wide"><thead><tr><th>账户</th><th>注册时间</th><th>最近活动</th><th>云端简历</th><th>云端保存</th><th>导出</th><th>AI 生成</th><th>登录</th></tr></thead><tbody>${rows}</tbody></table></div>${pager}<p class="settings-help">${esc(data.notice||'仅显示账户标识、时间和操作次数；不展示简历正文和照片。')}</p>`;
}

export function bindUsers({host,onChange}){
  const form=host.querySelector('#users-search');
  form?.addEventListener('submit',event=>{event.preventDefault();onChange({q:form.querySelector('#users-query').value.trim(),page:1});});
  host.querySelector('#users-sort')?.addEventListener('change',event=>{onChange({sort:event.currentTarget.value,page:1});});
  host.querySelectorAll('[data-users-page]').forEach(button=>button.addEventListener('click',()=>{
    const page=Number(button.dataset.usersPage);
    if(Number.isFinite(page)&&page>0)onChange({page});
  }));
}
