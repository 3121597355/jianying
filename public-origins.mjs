// Explicit aliases keep API origin checks and maintenance routing consistent.
// They are server configuration, never inferred from user-supplied headers.
export function publicOrigins(env = process.env) {
  const values=[env.PUBLIC_ORIGIN,...String(env.PUBLIC_ALTERNATE_ORIGINS||'').split(',')];
  for(const key of ['VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL']) {
    const host=env[key];
    if(host?.endsWith('.vercel.app')&&!/[\s/:@,]/.test(host))values.push('https://'+host);
  }
  const origins=[];
  for(const value of values)try {
    const url=new URL(String(value||'').trim());
    if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)origins.push(url.origin);
  }catch{}
  return [...new Set(origins)];
}
