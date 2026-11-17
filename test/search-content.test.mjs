import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import {createResumeServer} from '../serve.mjs';
import {defaults,buildSummary} from '../admin.mjs';
import {CONTENT_PAGES} from '../assets/js/public-pages.js';
import {PUBLIC_PAGES,SITE_ORIGIN,searchDocument,renderSeo} from '../seo.mjs';
import {INDEXNOW_KEY,INDEXNOW_KEY_PATH,searchVerificationTags} from '../search-verification.mjs';
import {submitIndexNow} from '../scripts/submit-indexnow.mjs';
import {contentMetadata,GUIDES} from '../content-pages.mjs';

test('content is crawlable without JavaScript, honors template controls, and keeps private paths out',async t=>{
  const directory=await mkdtemp(path.join(import.meta.dirname,'fixture-search-'));
  const settings=defaults();settings.templates[0].enabled=false;settings.templates[0].featured=false;settings.templates[1].name='自定义 <模板>';settings.defaultTemplate=settings.templates[1].id;
  await writeFile(path.join(directory,'site-settings.json'),JSON.stringify(settings));
  const server=await createResumeServer({adminOptions:{analyticsTestMode:true,dataDir:directory},portraitOptions:{publicMode:true}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});assert(path.resolve(directory).startsWith(path.resolve(import.meta.dirname)+path.sep));await rm(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const route of Object.keys(CONTENT_PAGES)){
    const response=await fetch(base+route+'?utm_source=bing');assert.equal(response.status,200);assert(!response.headers.get('x-robots-tag'));
    const html=await response.text();assert.equal((html.match(/<h1>/g)||[]).length,1);assert.equal((html.match(/rel="canonical"/g)||[]).length,1);assert(html.includes(`href="${SITE_ORIGIN}${route}"`));
    const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(schema.url,SITE_ORIGIN+route);assert(['Article','CollectionPage'].includes(schema['@type']));
    if(schema['@type']==='Article'){assert.equal(schema.dateModified,contentMetadata(route).updated);assert.equal(schema.mainEntityOfPage.breadcrumb.itemListElement.length,3);assert.match(html,/<section id="/);}
    assert.equal((await fetch(base+route,{method:'HEAD'})).status,200);
    const alias=await fetch(base+route.slice(0,-1)+'?utm_source=bing',{redirect:'manual'});assert.equal(alias.status,308);assert.equal(alias.headers.get('location'),route+'?utm_source=bing');
  }
  const templates=await(await fetch(base+'/templates/')).text();assert(!templates.includes(`href="/resume/?template=${settings.templates[0].id}"`));assert(templates.includes('自定义 &lt;模板&gt;'));assert.equal((templates.match(/class="content-template-card"/g)||[]).length,settings.templates.length-1);
  const home=await(await fetch(base+'/')).text(),index=await(await fetch(base+'/guides/')).text(),sitemap=await(await fetch(base+'/sitemap.xml')).text();
  for(const route of ['/guides/graduate-resume/','/guides/developer-projects/','/guides/free-resume-pdf/']){
    assert(home.includes(`href="${route}"`));assert(index.includes(`href="${route}"`));assert(sitemap.includes(`<loc>${SITE_ORIGIN}${route}</loc>`));
    const guide=GUIDES.find(item=>item.path===route),html=await(await fetch(base+route)).text();
    assert(html.includes(guide.action.replaceAll('&','&amp;')));
    if(guide.preview){const image=await fetch(base+guide.preview.src);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/png/);}
  }
  const preview=await fetch(base+'/guides/?adminPreview=1');assert.match(preview.headers.get('x-robots-tag'),/noindex/);
  const ownership=await fetch(base+INDEXNOW_KEY_PATH);assert.equal(await ownership.text(),INDEXNOW_KEY);assert.match(ownership.headers.get('x-robots-tag'),/noindex/);
  assert.equal((await fetch(base+'/guides/private-resume/')).status,404);assert.equal((await fetch(base+'/search-verification.mjs')).status,404);
  assert(!searchDocument('/sitemap.xml').body.includes(INDEXNOW_KEY));
  const visitor='search-content-fixture-2026';
  for(const [type,route] of [['page_view','/guides/project-experience/'],['resume_edit_start','/resume/'],['resume_export','/resume/']]){
    const response=await fetch(base+'/api/analytics/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,path:route,visitor,attribution:{source:'bing',medium:'search'},privateText:'NEVER_STORE'})});assert.equal(response.status,204);
  }
  const raw=await readFile(path.join(directory,'events.jsonl'),'utf8');assert(!raw.includes('NEVER_STORE'));
  const events=raw.trim().split('\n').map(JSON.parse);const result=buildSummary({events,visits:[],settings,range:{from:events[0].day,to:events[0].day}});assert.equal(result.acquisition.channels[0].source,'bing');assert.equal(result.acquisition.channels[0].completed,1);assert.equal(result.pages.find(page=>page.route==='/guides/project-experience/').views,1);
});

test('verification metadata only accepts public tokens and repeated rendering avoids duplicate tags',()=>{
  assert(!searchVerificationTags({GOOGLE_SITE_VERIFICATION:'x"><script>bad</script>'}).includes('google-site-verification'));
  assert.match(searchVerificationTags({}),/baidu-site-verification" content="codeva-9KJ9BDbhXe"/);
  assert.match(searchVerificationTags({GOOGLE_SITE_VERIFICATION:'safe_token-123',BING_SITE_VERIFICATION:'0123456789abcdef'}),/google-site-verification/);
  const raw='<html><head><title>一纸简历</title><meta name="google-site-verification" content="stale-value"></head></html>';
  const rendered=renderSeo(raw,'/');assert(!rendered.includes('stale-value'));const repeated=renderSeo(rendered,'/');assert.equal((repeated.match(/rel="canonical"/g)||[]).length,1);assert.equal((repeated.match(/property="og:title"/g)||[]).length,1);
});

test('IndexNow submits only verified public pages and distinguishes pending validation from indexing',async()=>{
  let submission;
  const fetchImpl=async(url,options)=>{
    if(url==='https://api.indexnow.org/indexnow'){submission=JSON.parse(options.body);return new Response('',{status:202});}
    if(url.endsWith(INDEXNOW_KEY_PATH))return new Response(INDEXNOW_KEY);
    if(url.endsWith('/sitemap.xml'))return new Response(searchDocument('/sitemap.xml').body);
    return new Response(null,{status:200});
  };
  const result=await submitIndexNow({fetchImpl});assert.equal(result.status,202);assert.equal(result.keyValidationPending,true);assert.equal(result.indexingGuaranteed,false);assert.equal(submission.host,'yizhijianli.top');assert.equal(submission.urlList.length,PUBLIC_PAGES.length);assert(submission.urlList.every(url=>!/[?#]/.test(url)&&!url.includes('/account/')&&!url.includes('/admin')));
  await assert.rejects(submitIndexNow({origin:'https://yizhijianli.cn',fetchImpl}),/public .top/);
  await assert.rejects(submitIndexNow({fetchImpl:async(url,options)=>options?.method==='HEAD'?new Response(null,{headers:{'X-Robots-Tag':'noindex'}}):fetchImpl(url,options)}),/noindex/);
  await assert.rejects(submitIndexNow({fetchImpl:async()=>new Response('incorrect ownership')}),/ownership/);
});
