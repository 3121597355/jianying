import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import {createResumeServer} from '../serve.mjs';
import {defaults,buildSummary} from '../admin.mjs';
import {captureAttribution,sanitizeAttribution,campaignLink} from '../assets/js/attribution.js';
import {buildAcquisition} from '../acquisition.mjs';

test('public search responses, canonical redirects and private-page directives work over HTTP',async t=>{
  const dataDir=await mkdtemp(path.join(import.meta.dirname,'fixture-seo-'));
  const settings=defaults();settings.site.title='自定义标题 & "测试"';settings.site.description='保留自定义描述 <说明>。';
  await writeFile(path.join(dataDir,'site-settings.json'),JSON.stringify(settings));
  const server=await createResumeServer({adminOptions:{dataDir},portraitOptions:{publicMode:true}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});assert(path.resolve(dataDir).startsWith(path.resolve(import.meta.dirname)+path.sep));await rm(dataDir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const route of ['/','/resume/','/portrait/','/privacy/']) {
    const response=await fetch(base+route+'?utm_source=wechat');assert.equal(response.status,200);
    const html=await response.text();
    assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
    assert(html.includes(`rel="canonical" href="https://yizhijianli.cn${route}"`));
    assert.match(html,/<meta name="description" content="[^"]+">/);
    assert.match(html,/<h1[ >]/);
    const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.url,'https://yizhijianli.cn'+route);
    if(route==='/'){assert.equal(schema.description,settings.site.description);assert(html.includes('content="自定义标题 &amp; &quot;测试&quot;"'));}
    assert.equal((await fetch(base+route,{method:'HEAD'})).status,200);
  }
  for(const [alias,canonical] of [['/resume','/resume/'],['/resume.html','/resume/'],['/index.html','/'],['/portrait','/portrait/'],['/portrait/index.html','/portrait/'],['/privacy','/privacy/']]) {
    const r=await fetch(base+alias+'?utm_source=wechat&template=2001',{redirect:'manual'});
    assert.equal(r.status,308);assert.equal(r.headers.get('location'),canonical+'?utm_source=wechat&template=2001');
  }
  const exportModule=await fetch(base+'/portrait/export-image.js');assert.equal(exportModule.status,200);assert.match(exportModule.headers.get('content-type'),/javascript/);
  const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),/Sitemap: https:\/\/yizhijianli.cn\/sitemap.xml/);
  const sitemap=await fetch(base+'/sitemap.xml');assert.equal(sitemap.status,200);assert.match(sitemap.headers.get('content-type'),/xml/);const xml=await sitemap.text();assert.equal((xml.match(/<loc>/g)||[]).length,4);assert(!xml.includes('/admin'));
  assert.equal((await fetch(base+'/sitemap.xml',{method:'HEAD'})).headers.get('content-type'),'application/xml; charset=utf-8');
  for(const route of ['/admin.html','/api/auth/status','/portrait/api/health','/?adminPreview=1'])assert.match((await fetch(base+route)).headers.get('x-robots-tag'),/noindex/);
  assert.equal((await fetch(base+'/private/admin/site-settings.json')).status,404);
  assert.equal((await fetch(base+'/robots.txt',{method:'POST'})).status,405);
  // The wire payload may contain arbitrary fields, but only approved campaign labels survive storage.
  const visitor='seo-acquisition-visitor-2026';
  for(const [type,route] of [['page_view','/'],['resume_edit_start','/resume/'],['resume_export','/resume/'],['resume_export','/resume/']]) {
    const response=await fetch(base+'/api/analytics/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,path:route,visitor,attribution:{source:'wechat',medium:'community',campaign:'campus_01',privateText:'NEVER_STORE'},referrer:'https://example.org/private?email=NEVER_STORE',resume:'NEVER_STORE'})});assert.equal(response.status,204);
  }
  const stored=await readFile(path.join(dataDir,'events.jsonl'),'utf8');assert(!stored.includes('NEVER_STORE'));assert(!stored.includes(visitor));
  const events=stored.trim().split('\n').map(JSON.parse),day=events[0].day;
  const summary=buildSummary({events,visits:[],settings,range:{from:day,to:day}});
  assert.deepEqual(summary.acquisition.channels,[{source:'wechat',medium:'community',campaign:'campus_01',sessions:1,started:1,completed:1,failures:0}]);
});

test('campaign attribution survives internal navigation and accepts only fixed labels',()=>{
  let stored='';const storage={getItem:()=>stored,setItem:(_,value)=>{stored=value;}};
  const first=captureAttribution({search:'?utm_source=xiaohongshu&utm_medium=social&utm_campaign=resume_demo_01&utm_term=PRIVATE',origin:'https://yizhijianli.cn',storage,now:1000});
  assert.deepEqual(first,{source:'xiaohongshu',medium:'social',campaign:'resume_demo_01'});assert(!stored.includes('PRIVATE'));
  assert.deepEqual(captureAttribution({referrer:'https://yizhijianli.cn/',origin:'https://yizhijianli.cn',storage,now:2000}),first);
  assert.equal(captureAttribution({referrer:'https://www.yizhijianli.cn/resume/',origin:'https://yizhijianli.cn',storage,now:3000}).campaign,'resume_demo_01');
  assert.equal(captureAttribution({origin:'https://yizhijianli.cn',storage,now:1900000}).source,'direct');
  assert.deepEqual(sanitizeAttribution({source:'wechat',medium:'PRIVATE',campaign:'PRIVATE',name:'PRIVATE'}),{source:'wechat',medium:'community',campaign:''});
  assert.equal(sanitizeAttribution({source:'__proto__'}),null);
  assert.equal(sanitizeAttribution({source:'constructor'}),null);
  const denied={getItem(){throw Error();},setItem(){throw Error();}};
  assert.equal(captureAttribution({origin:'https://yizhijianli.cn',storage:denied,referrer:'https://www.baidu.com/s?wd=PRIVATE'}).source,'baidu');
  assert.equal(captureAttribution({origin:'https://yizhijianli.cn',referrer:'https://baidu.com.evil.example/'}).source,'other');
  assert.equal(campaignLink({origin:'https://yizhijianli.cn',source:'wechat',campaign:'campus_01',path:'/resume/'}),'https://yizhijianli.cn/resume/?utm_source=wechat&utm_medium=community&utm_campaign=campus_01');
});

test('acquisition counts completed sessions, isolates historical traffic and splits idle sessions',()=>{
  const attribution={source:'wechat',medium:'community',campaign:'campus_01'},event={day:'2026-11-12',visitor:'anonymous',attribution};
  const result=buildAcquisition([
    {...event,time:100,type:'page_view'}, {...event,time:200,type:'resume_edit_start'}, {...event,time:300,type:'resume_export'}, {...event,time:350,type:'resume_export'},
    {...event,time:1900000,type:'page_view'}, {...event,time:1900001,type:'portrait_cutout_error'},
    {...event,visitor:'old',attribution:undefined,time:100,type:'page_view'},
    {...event,visitor:'',time:100,type:'page_view'},
  ]);
  assert.deepEqual(result,{channels:[{...attribution,sessions:2,started:1,completed:1,failures:1}],unattributedSessions:1});
});
