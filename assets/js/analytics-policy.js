// These are exclusion signals, not a claim that all other traffic is human.
export const EXCLUSION_KEY = 'jianying:analytics-excluded';
export const EXCLUSION_COOKIE = 'jianying_analytics_excluded';
export function isLocalHostname(value='') {
  const host=value.toLowerCase().replace(/^\[|\]$/g,'');
  return host==='localhost'||host.endsWith('.localhost')||host==='::1'||host==='0.0.0.0'||/^127\./.test(host);
}
export function isKnownAutomation(userAgent='') {
  return /HeadlessChrome|Googlebot|Bingbot|Baiduspider|YandexBot|DuckDuckBot|Bytespider|PetalBot|facebookexternalhit|GPTBot|ClaudeBot|crawler|spider|Lighthouse|PageSpeed/i.test(userAgent);
}
export function analyticsExcluded({hostname='',userAgent='',webdriver=false,search='',cookie='',storage,session}={}) {
  let saved=false;
  try{saved=storage?.getItem(EXCLUSION_KEY)==='1'||session?.getItem('jianying:admin-preview')==='1';}catch{}
  return isLocalHostname(hostname)||isKnownAutomation(userAgent)||webdriver||new URLSearchParams(search).has('adminPreview')||saved||/(?:^|;\s*)jianying_analytics_excluded=1(?:;|$)/.test(cookie);
}
export function setAnalyticsExclusion(excluded,{document,storage,session}={}) {
  try{if(excluded)storage?.setItem(EXCLUSION_KEY,'1');else storage?.removeItem(EXCLUSION_KEY);}catch{}
  try{if(excluded)session?.setItem('jianying:admin-preview','1');else session?.removeItem('jianying:admin-preview');}catch{}
  if(document)document.cookie=`${EXCLUSION_COOKIE}=${excluded?'1':''}; Path=/; SameSite=Lax; Max-Age=${excluded?31536000:0}${document.location?.protocol==='https:'?'; Secure':''}`;
}
