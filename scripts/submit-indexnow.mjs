import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {PUBLIC_PAGES,siteOrigin,SITE_ORIGIN} from '../seo.mjs';
import {INDEXNOW_KEY,INDEXNOW_KEY_PATH} from '../search-verification.mjs';

export async function submitIndexNow({origin=SITE_ORIGIN,fetchImpl=fetch}={}) {
  origin=siteOrigin(origin);
  // Submit only the public production domain. Filing, local and preview hosts stay out.
  if(origin!=='https://yizhijianli.top')throw Error('Only the public .top production domain may be submitted.');
  const request=(url,options={})=>fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(20000),...options});
  const keyResponse=await request(origin+INDEXNOW_KEY_PATH);
  if(!keyResponse.ok||(await keyResponse.text()).trim()!==INDEXNOW_KEY)throw Error('IndexNow ownership file is unavailable or incorrect.');
  const sitemapResponse=await request(origin+'/sitemap.xml');
  if(!sitemapResponse.ok)throw Error('Sitemap is unavailable.');
  const sitemap=await sitemapResponse.text();
  const urlList=PUBLIC_PAGES.map(page=>origin+page);
  if(urlList.some(url=>!sitemap.includes(`<loc>${url}</loc>`)))throw Error('Production sitemap does not include the current public pages.');
  const checks=await Promise.all(urlList.map(async url=>{
    const response=await request(url,{method:'HEAD'});
    return response.status===200&&!/noindex/i.test(response.headers.get('x-robots-tag')||'');
  }));
  if(checks.some(ok=>!ok))throw Error('A public page is unavailable or has noindex. Submission stopped.');
  const response=await request('https://api.indexnow.org/indexnow',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({host:new URL(origin).hostname,key:INDEXNOW_KEY,keyLocation:origin+INDEXNOW_KEY_PATH,urlList})});
  if(![200,202].includes(response.status))throw Error(`IndexNow returned HTTP ${response.status}. No automatic retry was made.`);
  return {origin,urlCount:urlList.length,status:response.status,received:true,keyValidationPending:response.status===202,indexingGuaranteed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(await submitIndexNow({origin:process.argv[2]||SITE_ORIGIN}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
