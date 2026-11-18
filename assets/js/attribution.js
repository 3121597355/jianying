// Only these public labels may enter analytics; never retain arbitrary URL parameters.
export const SOURCES = Object.freeze({xiaohongshu:'小红书',bilibili:'哔哩哔哩',wechat:'微信 / 校园社群',zhihu:'知乎',douban:'豆瓣',github:'GitHub',v2ex:'V2EX',linuxdo:'LINUX DO',baidu:'百度',bing:'必应',google:'Google',direct:'直接访问',other:'其他外部来源'});
export const CAMPAIGNS = Object.freeze({resume_demo_01:'简历演示 01',resume_demo_02:'简历演示 02',resume_demo_03:'简历演示 03',portrait_demo_01:'证件照演示 01',portrait_demo_02:'证件照演示 02',portrait_demo_03:'证件照演示 03',campus_01:'校园分享 01',beta_01:'首批试用 01',github_readme:'GitHub 项目介绍',guide_resume:'简历教程',guide_portrait:'证件照教程',self_report:'来源自述'});
const MEDIA = new Set(['social','community','search','referral','direct']);
const STORAGE_KEY = 'yizhi:attribution:v1';
const FIRST_KEY = 'yizhi:attribution:first:v1';
const MAX_IDLE = 30 * 60 * 1000;
// 首次触点保留 30 天：回访时不再因为 referrer 为空就被记成直接访问。
const FIRST_TTL = 30 * 24 * 60 * 60 * 1000;
// 短链和小程序常用简写参数，统一折叠成 utm_* 后再做白名单校验。
const ALIASES = {from:'utm_source',src:'utm_source',channel:'utm_source',s:'utm_source',c:'utm_campaign',campaign:'utm_campaign',m:'utm_medium',medium:'utm_medium'};
export const sourceMedium = source => ['baidu','bing','google'].includes(source)?'search':source==='direct'?'direct':['github','v2ex','linuxdo','wechat','douban'].includes(source)?'community':source==='other'?'referral':'social';
export function sanitizeAttribution(value) {
  if (!value || typeof value!=='object' || typeof value.source!=='string' || !Object.hasOwn(SOURCES,value.source)) return null;
  return {source:value.source,medium:MEDIA.has(value.medium)?value.medium:sourceMedium(value.source),campaign:typeof value.campaign==='string'&&Object.hasOwn(CAMPAIGNS,value.campaign)?value.campaign:''};
}
function referrerSource(referrer, origin) {
  try {
    const address = new URL(referrer), own = new URL(origin);
    if (!['http:','https:'].includes(address.protocol) || address.hostname.replace(/^www\./,'')===own.hostname.replace(/^www\./,'')) return null;
    const host = address.hostname;
    const domains = {xiaohongshu:'xiaohongshu.com',bilibili:'bilibili.com',wechat:'weixin.qq.com',zhihu:'zhihu.com',douban:'douban.com',github:'github.com',v2ex:'v2ex.com',linuxdo:'linux.do',baidu:'baidu.com',bing:'bing.com',google:'google.com'};
    return Object.keys(domains).find(key=>host===domains[key]||host.endsWith('.'+domains[key])) || 'other';
  } catch { return null; }
}
export function captureAttribution({search='',referrer='',origin,storage,now=Date.now()}) {
  const read=key=>{try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}};
  const write=(key,value)=>{try{storage?.setItem(key,JSON.stringify(value));}catch{}};
  const previous=read(STORAGE_KEY),first=read(FIRST_KEY);
  const params=new URLSearchParams(search);
  for(const [alias,target] of Object.entries(ALIASES)) if(!params.get(target)&&params.get(alias)) params.set(target,params.get(alias));
  let next=sanitizeAttribution({source:params.get('utm_source'),medium:params.get('utm_medium'),campaign:params.get('utm_campaign')});
  if (!next) {
    const source=referrerSource(referrer,origin);
    if(source)next=sanitizeAttribution({source});
  }
  if(!next && Number.isFinite(previous?.touched) && now>=previous.touched && now-previous.touched<MAX_IDLE)next=sanitizeAttribution(previous);
  // 没有新来源时用首次触点兜底，而不是直接记成“直接访问”。
  const firstValid=Number.isFinite(first?.at) && now>=first.at && now-first.at<FIRST_TTL ? sanitizeAttribution(first) : null;
  if(!next && firstValid) next=firstValid;
  const result=next || {source:'direct',medium:'direct',campaign:''};
  // 只有拿到新的明确来源才更新首次触点；回访沿用旧触点，保留期才不会被无限顺延。
  const sameTouch=firstValid && firstValid.source===result.source && firstValid.campaign===result.campaign;
  if(result.source!=='direct'&&!sameTouch) write(FIRST_KEY,{...result,at:now});
  write(STORAGE_KEY,{...result,touched:now});
  return result;
}
export function campaignLink({origin,source,campaign,path='/'}) {
  const value=sanitizeAttribution({source,campaign});
  if(!value || !['/','/resume/','/portrait/'].includes(path))throw new Error('请选择有效的推广来源和页面。');
  const url=new URL(path,origin);
  url.search=new URLSearchParams({utm_source:value.source,utm_medium:value.medium,...(value.campaign?{utm_campaign:value.campaign}:{})}).toString();
  return url.href;
}
// 用户在站内自报来源（平台不允许放带参链接时的兜底），固定映射到同一套白名单来源。
export function surveyAttribution(source) {
  return sanitizeAttribution({source,campaign:'self_report'});
}
