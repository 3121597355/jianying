// Only these public labels may enter analytics; never retain arbitrary URL parameters.
export const SOURCES = Object.freeze({xiaohongshu:'小红书',bilibili:'哔哩哔哩',wechat:'微信 / 校园社群',zhihu:'知乎',douban:'豆瓣',github:'GitHub',v2ex:'V2EX',linuxdo:'LINUX DO',baidu:'百度',bing:'必应',google:'Google',direct:'直接访问',other:'其他外部来源'});
export const CAMPAIGNS = Object.freeze({resume_demo_01:'简历演示 01',resume_demo_02:'简历演示 02',resume_demo_03:'简历演示 03',portrait_demo_01:'证件照演示 01',portrait_demo_02:'证件照演示 02',portrait_demo_03:'证件照演示 03',campus_01:'校园分享 01',beta_01:'首批试用 01',github_readme:'GitHub 项目介绍',guide_resume:'简历教程',guide_portrait:'证件照教程'});
const MEDIA = new Set(['social','community','search','referral','direct']);
const STORAGE_KEY = 'yizhi:attribution:v1';
const MAX_IDLE = 30 * 60 * 1000;
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
  let previous;
  try { previous=JSON.parse(storage?.getItem(STORAGE_KEY)||'null'); } catch {}
  const params=new URLSearchParams(search);
  let next=sanitizeAttribution({source:params.get('utm_source'),medium:params.get('utm_medium'),campaign:params.get('utm_campaign')});
  if (!next) {
    const source=referrerSource(referrer,origin);
    if(source)next=sanitizeAttribution({source});
  }
  if(!next && Number.isFinite(previous?.touched) && now>=previous.touched && now-previous.touched<MAX_IDLE)next=sanitizeAttribution(previous);
  next ||= {source:'direct',medium:'direct',campaign:''};
  try { storage?.setItem(STORAGE_KEY,JSON.stringify({...next,touched:now})); } catch {}
  return next;
}
export function campaignLink({origin,source,campaign,path='/'}) {
  const value=sanitizeAttribution({source,campaign});
  if(!value || !['/','/resume/','/portrait/'].includes(path))throw new Error('请选择有效的推广来源和页面。');
  const url=new URL(path,origin);
  url.search=new URLSearchParams({utm_source:value.source,utm_medium:value.medium,...(value.campaign?{utm_campaign:value.campaign}:{})}).toString();
  return url.href;
}
