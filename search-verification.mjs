// IndexNow uses a publicly readable ownership token, not an account/API credential.
export const INDEXNOW_KEY = '380bfa9a296dfe116a6e55f191bfef3c';
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`;
// Public ownership tag supplied by the site owner; keep it after verification.
export const BAIDU_VERIFICATION = 'codeva-9KJ9BDbhXe';
export const BING_VERIFICATION = 'BC6588BC0335B53BA874F2BC8D15CB5E';

export function searchVerificationTags(env = process.env) {
  const values={...env,BAIDU_SITE_VERIFICATION:env.BAIDU_SITE_VERIFICATION??BAIDU_VERIFICATION,BING_SITE_VERIFICATION:env.BING_SITE_VERIFICATION??BING_VERIFICATION};
  return [['google-site-verification','GOOGLE_SITE_VERIFICATION'],['msvalidate.01','BING_SITE_VERIFICATION'],['baidu-site-verification','BAIDU_SITE_VERIFICATION']]
    .filter(([,key])=>/^[A-Za-z0-9_-]{8,200}$/.test(values[key]||''))
    .map(([name,key])=>`<meta name="${name}" content="${values[key]}">`).join('\n');
}
