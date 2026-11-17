import {SOURCES,CAMPAIGNS} from './attribution.js';
const percent=value=>Number.isFinite(value)?`${Math.round(value*100)}%`:'—';
function change(now,before,mode){
  if(!Number.isFinite(now))return '';
  if(!before)return '<span class="delta flat">上期无数据</span>';
  const diff=mode==='rate'?(now-before)*100:(now-before)/before*100;
  if(Math.abs(diff)<0.5)return '<span class="delta flat">较上期持平</span>';
  const up=diff>0;
  return `<span class="delta ${up?'up':'down'}">较上期 ${up?'↑':'↓'}${Math.abs(Math.round(diff))}${mode==='rate'?' 个百分点':'%'}</span>`;
}
// One funnel component for both the period overview and each tool, so the
// same shape means the same thing everywhere.
function funnel(steps,number){
  const total=steps[0]?.value||0;
  return `<div class="ovf">${steps.map((step,index)=>{
    const share=total?step.value/total:0,previous=index?steps[index-1].value:0;
    const drop=index&&previous?1-step.value/previous:null;
    const connector=index?`<p class="ovf-drop">${drop===null?'':drop<=0?'无流失':`流失 ${Math.round(drop*100)}%`}</p>`:'';
    return `${connector}<div class="ovf-step"><div class="ovf-meta"><span class="ovf-name">${step.name}</span><span class="ovf-figures"><strong>${number(step.value)}</strong><small>${Math.round(share*100)}%</small></span></div><div class="ovf-track"><i style="width:${Math.max(share*100,1.5)}%"></i></div></div>`;
  }).join('')}</div>`;
}
function insight(metrics,number){
  if(!metrics.sessions)return '所选期间没有会话记录，先积累数据再看转化。';
  const toStart=metrics.sessions?1-metrics.started/metrics.sessions:0,toFinish=metrics.started?1-metrics.completed/metrics.started:0;
  const stage=toStart>=toFinish
    ?`「访问 → 开始制作」：每 100 个访问会话只有 ${Math.round(metrics.started/metrics.sessions*100)} 个真正开始填写`
    :`「开始制作 → 完成导出」：每 100 个开始填写的会话只有 ${Math.round(metrics.completed/metrics.started*100)} 个完成导出`;
  const lead=metrics.sessions<30?`样本较少（${number(metrics.sessions)} 个会话），仅供参考：`:'最大流失在';
  return `${lead}${stage}。整体完成率 ${percent(metrics.completionRate)}。`;
}
function periodStats(product,number){
  const m=product.metrics,previous=product.previous||{};
  const stats=[
    ['访问会话',number(m.sessions),change(m.sessions,previous.sessions),'按日标识去重 · 空闲 30 分钟分段'],
    ['开始制作',number(m.started),change(m.started,previous.started),'实际填写简历或载入照片'],
    ['完成导出',number(m.completed),change(m.completed,previous.completed),'下载简历或证件照的会话'],
    ['制作完成率',percent(m.completionRate),change(m.completionRate,previous.completionRate,'rate'),`${number(m.converted)} 个开始后导出 / ${number(m.started)} 个开始会话`]
  ];
  return `<div class="hero-stats">${stats.map(([label,value,delta,note])=>`<div class="hero-stat"><div class="hero-stat-label">${label}</div><div class="hero-stat-value">${value}</div>${delta||'<span class="delta flat">&nbsp;</span>'}<div class="hero-stat-note">${note}</div></div>`).join('')}</div>`;
}
// Round the axis to a readable step so ticks read 0/20/40/60/80, not 0/27/53/80.
function niceStep(rough){
  if(!Number.isFinite(rough)||rough<=0)return 1;
  const magnitude=10**Math.floor(Math.log10(rough)),base=rough/magnitude;
  const pick=[1,2,2.5,5,10].find(option=>option>=base)||10;
  return Math.max(1,Math.round(pick*magnitude));
}
export function productTrend(report,{esc,number,panelBox}) {
  if(!report.series.length)return panelBox('制作趋势','所选日期与当前数据周期无交集。','<div class="empty"><strong>暂无数据</strong>请调整日期范围或切换数据周期。</div>');
  if(!report.series.some(row=>row.sessions))return panelBox('制作趋势','所选日期范围内还没有访问记录。','<div class="empty"><strong>暂无数据</strong>出现真实访问后会显示每日趋势。</div>');
  const series=report.series,axisStep=niceStep(Math.max(...series.map(row=>row.sessions),1)/4),max=axisStep*4;
  const left=46,right=904,top=18,bottom=200,width=right-left;
  const x=index=>left+index*width/Math.max(series.length-1,1),y=value=>bottom-value/max*(bottom-top);
  const slot=width/Math.max(series.length,1),barWidth=Math.max(2,Math.min(16,slot*0.52));
  const definitions=[['started','开始制作','starts'],['completed','完成导出','finishes']];
  const average=list=>list.length?list.reduce((total,row)=>total+row.sessions,0)/list.length:0;
  const recent=series.slice(-7),earlier=series.slice(-14,-7),recentAverage=average(recent);
  const peak=series.reduce((best,row)=>row.sessions>(best?.sessions||0)?row:best,null);
  const figures=[`日均 <strong>${number(Math.round(average(series)))}</strong> 个会话`,peak?`峰值 <strong>${number(peak.sessions)}</strong>（${peak.date.slice(5)}）`:'',`最近 7 天日均 <strong>${number(Math.round(recentAverage))}</strong>${change(recentAverage,average(earlier))}`].filter(Boolean).map(item=>`<span>${item}</span>`).join('');
  const legend=`<span><i class="bar-swatch"></i>访问会话</span>`+definitions.map(([,name,key])=>`<span><i class="${key}"></i>${name}</span>`).join('');
  const bars=series.map((row,index)=>row.sessions?`<rect class="bar" x="${(x(index)-barWidth/2).toFixed(1)}" y="${y(row.sessions).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1,bottom-y(row.sessions)).toFixed(1)}" rx="2"><title>${esc(row.date)}：访问 ${row.sessions}</title></rect>`:'').join('');
  const lines=definitions.map(([key,,style])=>`<path class="line ${style}" d="${series.map((row,index)=>`${index?'L':'M'}${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' ')}"/>`).join('');
  const dots=definitions.map(([key,,style])=>series.map((row,index)=>`<circle class="dot ${style}" cx="${x(index).toFixed(1)}" cy="${y(row[key]).toFixed(1)}" r="2.4"><title>${esc(row.date)}：${key==='started'?'开始制作':'完成导出'} ${row[key]}</title></circle>`).join('')).join('');
  const grid=[0,1,2,3,4].map(index=>{const value=axisStep*index;return `<line class="grid" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/><text x="4" y="${y(value)+3}">${number(value)}</text>`;}).join('');
  const step=Math.max(1,Math.ceil((series.length-1)/5));
  const ticks=[...series.keys()].filter(index=>index%step===0||index===series.length-1).filter((value,index,list)=>list.indexOf(value)===index);
  const chart=`<div class="chart-legend product-legend">${legend}</div><div class="chart-figures">${figures}</div><div class="chart-scroll"><svg class="trend-chart product-trend" viewBox="0 0 920 240" role="img" aria-label="每日访问会话柱状图，以及开始制作与完成导出的折线趋势">${grid}${bars}${lines}${dots}${ticks.map(index=>`<text x="${x(index)}" y="228" text-anchor="${index===0?'start':index===series.length-1?'end':'middle'}">${series[index].date.slice(5)}</text>`).join('')}</svg></div><details class="analytics-detail"><summary>查看每日数据</summary><div class="data-table-wrap"><table class="data-table"><thead><tr><th>日期</th><th>访问会话</th><th>开始制作</th><th>完成导出</th></tr></thead><tbody>${series.filter(row=>row.sessions).map(row=>`<tr><td>${esc(row.date)}</td><td>${number(row.sessions)}</td><td>${number(row.started)}</td><td>${number(row.completed)}</td></tr>`).join('')||'<tr><td colspan="4">暂无记录</td></tr>'}</tbody></table></div></details>`;
  return panelBox('制作趋势','柱状为每日访问会话，折线为开始制作与完成导出；重复下载在同一会话中只算一次完成。',chart);
}
export function toolJourneys(report,{number,panelBox}) {
  return `<div class="two-columns section-gap">${report.tools.map(tool=>panelBox(tool.name,`${number(tool.exportCount)} 次成功下载 · ${number(tool.completed)} 个完成导出的会话`,`${funnel(tool.steps,number)}<p class="settings-help">全程完成率 ${percent(tool.sessions?tool.completed/tool.sessions:null)}：${number(tool.completed)} 个进入后完成 / ${number(tool.sessions)} 个进入会话。${tool.exportsWithoutStart?`另有 ${number(tool.exportsWithoutStart)} 个导出会话未记录先开始填写，可能直接使用示例或恢复草稿。`:''}</p>`)).join('')}</div>`;
}
function quality(report,{esc}) {
  const durationNote=report.collection?.durationNotice;
  return `<details class="analytics-detail analytics-quality"><summary>统计口径与历史数据</summary><p>${esc(report.notice)}</p><p>开始制作指实际填写简历或载入照片；完成导出指网页成功生成文件并触发下载，无法确认用户最终是否保存或投递。完成率只计算同一工具中“先开始、后导出”的会话，不要求登录。</p><p>刷新会增加页面访问，但同一匿名标识在 30 分钟内继续使用仍属一个会话；标识按日变化，不跨设备识别人。无操作事件的持续编辑由可见时长快照衔接。新标签页、跨日和清理浏览器数据仍可能重复计算。</p><p>本地、Vercel 预览环境、已识别爬虫、管理员与标记排除的浏览器不再写入新访问；无法保证识别所有自动化访问。历史调试记录保留，不据此宣称真实用户量。</p>${durationNote?`<p>${esc(durationNote)}</p>`:''}</details>`;
}
export function productOverview(summary,ui) {
  const {esc,number,panelBox,table,empty}=ui,p=summary.product,m=p.metrics;
  const hero=`${periodStats(p,number)}${m.sessions?funnel([{name:'访问会话',value:m.sessions},{name:'开始制作',value:m.started},{name:'完成导出',value:m.completed}],number):''}<p class="hero-insight">${insight(m,number)}</p>`;
  const topCompleted=Math.max(...p.channels.map(row=>row.completed),1);
  const sourceRows=p.channels.slice(0,5).map(row=>`<tr><td><span>${esc(SOURCES[row.label.source]||'历史来源未标记')}</span><small class="analytics-channel-note">${esc(CAMPAIGNS[row.label.campaign]||'未指定活动')}</small></td><td class="num">${number(row.sessions)}</td><td class="num">${number(row.started)}</td><td class="num"><span class="bar-cell"><span class="bar-track"><i style="width:${row.completed/topCompleted*100}%"></i></span><span class="bar-value">${number(row.completed)}</span></span></td></tr>`).join('');
  const sourceTable=sourceRows?`<div class="data-table-wrap"><table class="data-table source-table"><thead><tr><th>来源</th><th class="num">访问会话</th><th class="num">开始制作</th><th class="num">完成导出</th></tr></thead><tbody>${sourceRows}</tbody></table></div>`:empty('还没有来源记录','真实使用后会逐步显示。');
  const exportBase=[p.tools[0]?.exportCount||0,p.tools[1]?.exportCount||0,p.tools[1]?.exportCount||0];
  const failureRows=p.failures.map((item,index)=>{const base=exportBase[index]||0;return `<div class="failure-row" data-state="${item.value?'warn':'ok'}"><span class="failure-name">${item.name}</span><span class="failure-figures"><strong>${number(item.value)}</strong><small>${base&&item.value?`每 100 次下载 ${(item.value/base*100).toFixed(1)} 次`:'没有记录到失败'}</small></span></div>`;}).join('');
  return `${!summary.enabled?'<div class="error-banner">匿名统计已关闭，当前展示已有记录。</div>':''}<section class="panel overview-hero"><div class="panel-heading"><div><h2>本期转化</h2><p>从访问到导出，每一步留下多少人。</p></div></div>${hero}</section>${productTrend(p,ui)}${toolJourneys(p,ui)}<div class="two-columns section-gap">${panelBox('来源带来的实际使用','条形长度＝该来源完成导出占最高来源的比例。',sourceTable)}${panelBox('需要关注的卡点','失败记录优先排查；完成任务后离开是正常结果。',`<div class="failure-list">${failureRows}</div><p class="settings-help">未完成短停留 ${percent(summary.engagement.metrics.quickRate)}，来自 ${number(summary.engagement.metrics.completedSessions)} 个可测结束会话。${summary.engagement.metrics.completedSessions<30?'样本较少，先积累数据。':summary.collection.scope==='history'?'历史测试可能影响该比例，需结合实际反馈判断。':'需结合实际反馈判断离开的原因。'}</p>`)}</div><details class="analytics-detail analytics-aux"><summary>查看辅助流量指标</summary><div class="support-method-totals"><span>页面访问 <strong>${number(summary.metrics.views)}</strong></span><span>按日匿名标识 <strong>${number(summary.metrics.visitors)}</strong></span><span>下载次数 <strong>${number(summary.metrics.exports)}</strong></span><span>有时长的会话 <strong>${number(p.coverage.measuredSessions)}</strong></span></div><p>这些指标用于诊断，不等于真实人数或产品成绩。注册与云端简历查看“账户与简历”，核实到账查看“赞助统计”。</p></details>${quality(p,ui)}`;
}
export function productFeatures(summary,ui) {
  const {esc,number,table,panelBox,empty}=ui,p=summary.product;
  const primary=['resume_edit_start','resume_export','portrait_upload','portrait_cutout','portrait_export','portrait_apply'];
  return `${toolJourneys(p,ui)}<div class="section-gap">${panelBox('核心工具操作次数','会话判断完成覆盖，次数用于观察使用强度。',table(['操作','次数'],summary.actions.filter(item=>primary.includes(item.label)).map(item=>[esc(item.name),number(item.value)])))}${panelBox('处理与导出失败','仅在错误发生时计入。',table(['环节','失败次数'],p.failures.map(item=>[item.name,number(item.value)])))}</div><details class="analytics-detail analytics-aux"><summary>模板偏好与最近操作</summary>${table(['模板','套用次数'],summary.templates.filter(t=>t.uses).map(t=>[esc(t.name),number(t.uses)]))}${table(['时间','操作','页面'],summary.recent.map(e=>[ui.time(e.time),esc(e.name),esc(e.path)]))}</details>${quality(p,ui)}`;
}
export function productAudience(summary,ui) {
  const {esc,number,table,panelBox,empty}=ui,p=summary.product;
  const columns=['来源 / 活动','访问会话','开始制作','完成导出','开始后完成率'];
  return `${panelBox('渠道带来的制作结果','自然搜索与推广标签可归因；来源缺失不代表都是真正的直接访问。',p.channels.length?table(columns,p.channels.map(row=>[`${esc(SOURCES[row.label.source]||'历史来源未标记')}<small class="analytics-channel-note">${esc(CAMPAIGNS[row.label.campaign]||'未指定活动')}</small>`,number(row.sessions),number(row.started),number(row.completed),percent(row.completionRate)])):empty('还没有来源记录','来源和制作结果会随使用积累。'))}<div class="two-columns section-gap">${panelBox('从哪个页面进入','首次进入的页面，按会话去重。',table(['入口','访问会话','完成导出'],p.entries.map(row=>[esc(row.label),number(row.sessions),number(row.completed)])))}${panelBox('手机与电脑的完成情况','设备来自浏览器标识，模拟设备可能归入电脑。',table(['设备','访问会话','开始制作','完成导出'],p.devices.map(row=>[esc(row.label),number(row.sessions),number(row.started),number(row.completed)])))}</div>${quality(p,ui)}`;
}
