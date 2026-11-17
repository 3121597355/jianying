import {isLocalHostname,isKnownAutomation} from './assets/js/analytics-policy.js';
export function excludeAnalyticsRequest(req,{allowLocal=false,environment=process.env.VERCEL_ENV}={}) {
  let hostname='';try{hostname=new URL('http://'+req.headers.host).hostname;}catch{return true;}
  return environment==='preview'||environment==='development'||(!allowLocal&&isLocalHostname(hostname))||isKnownAutomation(req.headers['user-agent']||'')||/(?:^|;\s*)jianying_analytics_excluded=1(?:;|$)/.test(req.headers.cookie||'');
}
