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
const DAY=86400000;
// Day buckets on the server are UTC+8, so "next period" must stop at today there.
const beijingToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
// A period is just the current date range; the arrows slide it by its own length
// so 7 天窗口永远看 7 天，往前推一期就是上一周的同一口径。
function periodSwitch(range) {
  if(!range)return '';
  const from=Date.parse(range.from),to=Date.parse(range.to);
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<from)return '';
  const length=Math.round((to-from)/DAY)+1,atLatest=range.to>=beijingToday();
  return `<div class="period-switch" role="group" aria-label="切换统计周期"><button type="button" data-period="-1" title="往前推 ${length} 天" aria-label="上一周期，往前推 ${length} 天">‹</button><span>${range.from.slice(5)} ~ ${range.to.slice(5)} · ${length} 天</span><button type="button" data-period="1" title="往后推 ${length} 天" aria-label="下一周期，往后推 ${length} 天" ${atLatest?'disabled':''}>›</button></div>`;
}
function trendPanel(navigator,description,body) {
  return `<section class="panel trend-panel"><div class="panel-heading trend-heading"><div><h2>每日走势</h2><p>${description}</p></div>${navigator}</div>${body}</section>`;
}
const TREND_DESCRIPTION='柱状为每日访问会话，折线为每日完成导出；按会话开始日期统计，重复下载只算一次完成。';
// 只要图表本身，面板外壳交给调用方，方便放进「趋势 / 分布 / 排行」的视图切换里。
export function trendChart(report,{esc,number}) {
  const series=report.series||[];
  if(!series.length)return '<div class="empty"><strong>暂无数据</strong>所选日期没有记录，可用箭头往前推一个周期，或在上方调整日期范围。</div>';
  const total=series.reduce((sum,row)=>({sessions:sum.sessions+row.sessions,started:sum.started+row.started,completed:sum.completed+row.completed}),{sessions:0,started:0,completed:0});
  if(!total.sessions)return '<div class="empty"><strong>这个周期还没有访问记录</strong>用箭头往前推一个周期，或在上方调整日期范围。</div>';
  const count=series.length,left=44,right=884,top=24,bottom=192,slot=(right-left)/count,center=index=>left+slot*(index+.5);
  const peak=series.reduce((best,row)=>row.sessions>(best?best.sessions:0)?row:best,null);
  const exportPeak=series.reduce((best,row)=>row.completed>(best?best.completed:0)?row:best,null);
  const step=niceStep(Math.max(peak.sessions,1)/4),max=step*4,y=value=>bottom-value/max*(bottom-top);
  // 完成导出的量级远小于访问量，共用一根轴会把它压成贴底的直线，所以单独给右轴。
  const exportStep=niceStep(Math.max(exportPeak.completed,1)/4),exportMax=exportStep*4,exportY=value=>bottom-value/exportMax*(bottom-top);
  const barWidth=Math.max(3,Math.min(30,slot*.46)),radius=Math.min(3,barWidth/2).toFixed(1);
  const bars=series.map((row,index)=>row.sessions?`<rect class="bar" x="${(center(index)-barWidth/2).toFixed(1)}" y="${y(row.sessions).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(bottom-y(row.sessions),1.5).toFixed(1)}" rx="${radius}"><title>${esc(row.date)}：访问 ${number(row.sessions)}，开始制作 ${number(row.started)}，完成导出 ${number(row.completed)}</title></rect>`:'').join('');
  const labels=slot>=34?series.map((row,index)=>row.sessions?`<text class="bar-value" x="${center(index).toFixed(1)}" y="${(y(row.sessions)-6).toFixed(1)}" text-anchor="middle">${number(row.sessions)}</text>`:'').join(''):'';
  const finishLine=`<path class="finish-line" d="${series.map((row,index)=>`${index?'L':'M'}${center(index).toFixed(1)},${exportY(row.completed).toFixed(1)}`).join(' ')}"/>`;
  const finishDots=series.map((row,index)=>`<circle class="finish-dot" cx="${center(index).toFixed(1)}" cy="${exportY(row.completed).toFixed(1)}" r="2.6"><title>${esc(row.date)}：完成导出 ${number(row.completed)} 个会话</title></circle>`).join('');
  const grid=[0,1,2,3,4].map(index=>{const lineY=y(step*index),tickY=(lineY+3).toFixed(1);return `<line class="grid" x1="${left}" x2="${right}" y1="${lineY.toFixed(1)}" y2="${lineY.toFixed(1)}"/><text x="4" y="${tickY}">${number(step*index)}</text><text class="axis-export" x="${right+8}" y="${tickY}" text-anchor="start">${number(exportStep*index)}</text>`;}).join('');
  const labelStep=Math.max(1,Math.ceil(count/9));
  const ticks=[...new Set([...series.keys()].filter(index=>index%labelStep===0||index===count-1))].filter(index=>index===count-1||count-1-index>=Math.ceil(labelStep/2));
  const figures=[`合计 <strong>${number(total.sessions)}</strong> 个访问会话`,`日均 <strong>${number(Math.round(total.sessions/count))}</strong>`,`峰值 <strong>${number(peak.sessions)}</strong>（${peak.date.slice(5)}）`,`完成导出 <strong>${number(total.completed)}</strong> 个会话`].map(item=>`<span>${item}</span>`).join('');
  const rows=series.filter(row=>row.sessions).map(row=>`<tr><td>${esc(row.date)}</td><td>${number(row.sessions)}</td><td>${number(row.started)}</td><td>${number(row.completed)}</td><td>${percent(row.completionRate)}</td></tr>`).join('')||'<tr><td colspan="5">暂无记录</td></tr>';
  return `<div class="chart-legend product-legend"><span><i class="bar-swatch"></i>访问会话</span><span><i class="finishes"></i>完成导出（右轴）</span></div><div class="chart-figures">${figures}</div><div class="chart-scroll"><svg class="trend-chart product-trend" viewBox="0 0 940 230" role="img" aria-label="每日访问会话柱状图与每日完成导出折线">${grid}${bars}${finishLine}${finishDots}${labels}${ticks.map(index=>`<text x="${center(index).toFixed(1)}" y="216" text-anchor="${index===0?'start':index===count-1?'end':'middle'}">${series[index].date.slice(5)}</text>`).join('')}</svg></div><details class="analytics-detail"><summary>查看每日数据</summary><div class="data-table-wrap"><table class="data-table data-table-wide"><thead><tr><th>日期</th><th>访问会话</th><th>开始制作</th><th>完成导出</th><th>制作完成率</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
export function productTrend(report,{esc,number,range}) {
  return trendPanel(periodSwitch(range),TREND_DESCRIPTION,trendChart(report,{esc,number}));
}
export function toolJourneys(report,{number,panelBox}) {
  return `<div class="two-columns section-gap">${report.tools.map(tool=>panelBox(tool.name,`${number(tool.exportCount)} 次成功下载 · ${number(tool.completed)} 个完成导出的会话`,`${funnel(tool.steps,number)}<p class="settings-help">全程完成率 ${percent(tool.sessions?tool.completed/tool.sessions:null)}：${number(tool.completed)} 个进入后完成 / ${number(tool.sessions)} 个进入会话。${tool.exportsWithoutStart?`另有 ${number(tool.exportsWithoutStart)} 个导出会话未记录先开始填写，可能直接使用示例或恢复草稿。`:''}</p>`)).join('')}</div>`;
}
function quality(report,{esc}) {
  const durationNote=report.collection?.durationNotice;
  return `<details class="analytics-detail analytics-quality"><summary>统计口径与历史数据</summary><p>${esc(report.notice)}</p><p>开始制作指实际填写简历或载入照片；完成导出指网页成功生成文件并触发下载，无法确认用户最终是否保存或投递。完成率只计算同一工具中“先开始、后导出”的会话，不要求登录。</p><p>刷新会增加页面访问，但同一匿名标识在 30 分钟内继续使用仍属一个会话；标识按日变化，不跨设备识别人。无操作事件的持续编辑由可见时长快照衔接。新标签页、跨日和清理浏览器数据仍可能重复计算。</p><p>本地、Vercel 预览环境、已识别爬虫、管理员与标记排除的浏览器不再写入新访问；无法保证识别所有自动化访问。历史调试记录保留，不据此宣称真实用户量。</p>${durationNote?`<p>${esc(durationNote)}</p>`:''}</details>`;
}
// 一段同口径的数据可以用三种方式看：趋势看走向、分布看构成、排行看具体页面。
// 收在一个面板里切换，比堆一排面板更容易一眼看懂，也符合一纸简历「简洁」的定位。
const VIEWS=[['trend','趋势'],['dist','分布'],['rank','排行']];
function viewSwitch() {
  return `<div class="view-switch" role="group" aria-label="数据视图">${VIEWS.map(([key,name],index)=>`<button type="button" data-view="${key}" class="${index?'':'active'}" aria-pressed="${index?'false':'true'}">${name}</button>`).join('')}</div>`;
}
function barList(rows,number) {
  const top=Math.max(...rows.map(row=>row.value),1);
  return `<div class="dist-list">${rows.map(row=>`<div class="dist-row"><span class="dist-name">${row.name}</span><span class="dist-track"><i style="width:${Math.max(row.value/top*100,row.value?3:0)}%"></i></span><span class="dist-value">${number(row.value)}${row.share===null||row.share===undefined?'':`<small>${Math.round(row.share*100)}%</small>`}</span></div>`).join('')}</div>`;
}
function distributionView(p,{esc,number,empty}) {
  const total=p.metrics.sessions;
  const sources=p.channels.slice(0,5).map(row=>({name:`${esc(SOURCES[row.label.source]||'历史来源未标记')}<small>${esc(CAMPAIGNS[row.label.campaign]||'未指定活动')}</small>`,value:row.sessions,share:total?row.sessions/total:null}));
  const devices=p.devices.map(row=>({name:esc(row.label),value:row.sessions,share:total?row.sessions/total:null}));
  const entries=p.entries.slice(0,5).map(row=>({name:esc(row.label),value:row.sessions,share:total?row.sessions/total:null}));
  const block=(title,rows,note)=>`<div class="dist-block"><h3>${title}</h3>${rows.length?barList(rows,number):empty('暂无记录','积累真实访问后出现。')}<p class="settings-help">${note}</p></div>`;
  return `<div class="dist-grid">${block('来源',sources,`按访问会话计，占全部 ${number(total)} 个会话的比例；来源缺失不代表都是直接访问。`)}${block('设备',devices,'来自浏览器标识，模拟设备可能归入电脑。')}${block('首访页面',entries,'会话第一次落在哪个页面。')}</div>`;
}
function rankingView(summary,{esc,number,empty}) {
  const pages=(summary.pages||[]).filter(row=>row.views||row.actions).sort((a,b)=>b.views-a.views).slice(0,8);
  const rows=pages.map(row=>`<tr><td>${esc(row.name)}</td><td class="num">${number(row.views)}</td><td class="num">${number(row.actions)}</td></tr>`).join('');
  const pageTable=pages.length?`<div class="data-table-wrap"><table class="data-table"><thead><tr><th>页面</th><th class="num">浏览量</th><th class="num">操作数</th></tr></thead><tbody>${rows}</tbody></table></div>`:empty('还没有页面记录','真实访问后会显示页面排行。');
  const templates=(summary.templates||[]).filter(item=>item.uses).sort((a,b)=>b.uses-a.uses).slice(0,5).map(item=>({name:esc(item.name),value:item.uses,share:null}));
  return `<div class="rank-grid"><div>${pageTable}</div><div><h3 class="rank-title">模板套用</h3>${templates.length?barList(templates,number):empty('还没有套用记录','用户选模板后会显示这里。')}<p class="settings-help">模板按套用次数排序。</p></div></div>`;
}
export function productOverview(summary,ui) {
  const {esc,number,panelBox,table,empty}=ui,p=summary.product,m=p.metrics;
  const hero=`${periodStats(p,number)}${m.sessions?funnel([{name:'访问会话',value:m.sessions},{name:'开始制作',value:m.started},{name:'完成导出',value:m.completed}],number):''}<p class="hero-insight">${insight(m,number)}</p>`;
  const overviewPanel=`<section class="panel trend-panel"><div class="panel-heading trend-heading"><div><h2>访问走势</h2><p>${TREND_DESCRIPTION}</p></div><div class="heading-controls">${periodSwitch(summary.range)}${viewSwitch()}</div></div><div data-view-pane="trend">${trendChart(p,{esc,number})}</div><div data-view-pane="dist" hidden>${distributionView(p,ui)}</div><div data-view-pane="rank" hidden>${rankingView(summary,ui)}</div></section>`;
  const exportBase=[p.tools[0]?.exportCount||0,p.tools[1]?.exportCount||0,p.tools[1]?.exportCount||0];
  const failureRows=p.failures.map((item,index)=>{const base=exportBase[index]||0;return `<div class="failure-row" data-state="${item.value?'warn':'ok'}"><span class="failure-name">${item.name}</span><span class="failure-figures"><strong>${number(item.value)}</strong><small>${base&&item.value?`每 100 次下载 ${(item.value/base*100).toFixed(1)} 次`:'没有记录到失败'}</small></span></div>`;}).join('');
  return `${!summary.enabled?'<div class="error-banner">匿名统计已关闭，当前展示已有记录。</div>':''}<section class="panel overview-hero"><div class="panel-heading"><div><h2>本期转化</h2><p>从访问到导出，每一步留下多少人。</p></div></div>${hero}</section>${overviewPanel}${toolJourneys(p,ui)}<div class="section-gap">${panelBox('需要关注的卡点','失败记录优先排查；完成任务后离开是正常结果。',`<div class="failure-list">${failureRows}</div><p class="settings-help">未完成短停留 ${percent(summary.engagement.metrics.quickRate)}，来自 ${number(summary.engagement.metrics.completedSessions)} 个可测结束会话。${summary.engagement.metrics.completedSessions<30?'样本较少，先积累数据。':'需结合实际反馈判断离开的原因。'}</p>`)}</div><details class="analytics-detail analytics-aux"><summary>查看辅助流量指标</summary><div class="support-method-totals"><span>页面访问 <strong>${number(summary.metrics.views)}</strong></span><span>按日匿名标识 <strong>${number(summary.metrics.visitors)}</strong></span><span>下载次数 <strong>${number(summary.metrics.exports)}</strong></span><span>有时长的会话 <strong>${number(p.coverage.measuredSessions)}</strong></span></div><p>这些指标用于诊断，不等于真实人数或产品成绩。注册与云端简历查看“账户与简历”，核实到账查看“赞助统计”。</p></details>${quality(p,ui)}`;
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
