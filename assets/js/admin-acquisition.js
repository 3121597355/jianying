import {SOURCES,CAMPAIGNS,campaignLink} from './attribution.js';
const NOTE_IDLE='会话按日划分，连续 30 分钟无操作或渠道变化会开启新会话；完成导出指收到成功导出事件，草稿恢复可跳过开始填写。这里是会话估算，不是精确真人数。';
const NOTE_DIRECT='「直接访问」里通常混着三类：书签或手动输入、App 内打开链接（小红书、微信等会去掉来源）、以及没带标签的分享链接。给每次分享生成带标签的链接，回访会沿用首次来源 30 天，这部分就能拆开；自测请在链接后面加 <code>?adminPreview=1</code>，或用「本设备排除统计」。';
export function acquisitionView({data,esc,number,table,panelBox,empty,linksOnly=false}) {
  const rows=data?.channels||[],said=data?.selfReported||[];
  const options=entries=>Object.entries(entries).map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');
  const channels=rows.length?table(['来源 / 活动','访问会话','开始制作','完成导出','完成占比','失败操作'],rows.map(row=>[
    `<span class="project-name">${esc(SOURCES[row.source])}<small>${esc(CAMPAIGNS[row.campaign]||'未指定活动')}</small></span>`,
    number(row.sessions),number(row.started),number(row.completed),`${Math.round(row.completed/row.sessions*100)}%`,number(row.failures),
  ])):empty('还没有带渠道信息的访问','用下方链接分享网站后，真实访问和成功导出会逐步显示。');
  const unattributed=data?.unattributedSessions?`另有 ${number(data.unattributedSessions)} 个历史会话没有渠道记录，不补算到当前渠道。`:'';
  const notes=`<div class="section-gap">${panelBox('关于来源统计','看懂「直接访问」和这些数字的边界。',`<p class="settings-help">${NOTE_IDLE}${unattributed}</p><p class="settings-help">${NOTE_DIRECT}</p>`)}</div>`;
  const survey=said.length?`<div class="section-gap">${panelBox('用户自述来源','平台发不出带参链接时，用导出后的一次性自述兜底。',table(['自述来源','人数'],said.map(row=>[`<span class="project-name">${esc(SOURCES[row.source]||row.source)}</span>`,number(row.count)]))+`<p class="settings-help">这些是用户自己点的，正好补上「直接访问」里发不出带标签链接的那部分：小红书占比高，就说明流量主要来自小红书，不是没人来。</p>`)}</div>`:'';
  return (linksOnly?'':panelBox('渠道带来的实际使用','跨首页、简历和证件照保留来源，按匿名会话去重统计。',channels))+
    notes+survey+
    `<div class="section-gap">${panelBox('生成推广链接','每条演示或分享使用不同的活动标签，方便回来比较效果。',`<form id="campaign-link-form"><div class="settings-fields"><label>发布渠道<select id="campaign-source">${options(Object.fromEntries(Object.entries(SOURCES).filter(([key])=>!['direct','other','baidu','bing','google'].includes(key))))}</select></label><label>活动标签<select id="campaign-name">${options(CAMPAIGNS)}</select></label><label class="wide">打开页面<select id="campaign-path"><option value="/">首页</option><option value="/resume/">简历编辑器</option><option value="/portrait/">证件照</option></select></label><label class="wide">推广链接<input id="campaign-url" readonly aria-label="推广链接"></label></div><div class="settings-footer"><button class="secondary" type="button" id="copy-campaign-link">复制链接</button></div><p class="settings-help">只使用这些固定标签，不填写姓名、电话或用户内容。链接已能被站点识别；搜索排名和流量不会由标签自动产生。</p></form>`)}</div>`;
}
export function bindAcquisition({host,notify}) {
  const form=host.querySelector('#campaign-link-form');if(!form)return;
  const field=id=>form.querySelector('#'+id);
  const update=()=>{field('campaign-url').value=campaignLink({origin:location.origin,source:field('campaign-source').value,campaign:field('campaign-name').value,path:field('campaign-path').value});};
  form.addEventListener('submit',event=>event.preventDefault());
  form.addEventListener('input',event=>event.stopPropagation());
  form.addEventListener('change',event=>{event.stopPropagation();update();});
  field('copy-campaign-link').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(field('campaign-url').value);notify('推广链接已复制');}
    catch{field('campaign-url').focus();field('campaign-url').select();notify('链接已选中，请复制');}
  });
  update();
}
