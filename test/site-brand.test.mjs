import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import {defaults} from '../admin.mjs';
import {createResumeServer} from '../serve.mjs';

test('saved old brand upgrades in the homepage and settings while keeping configured templates and analytics',async t=>{
  const dataDir=await mkdtemp(path.join(import.meta.dirname,'fixture-brand-'));
  const before=defaults();
  before.site.title='简影 · 自定义首页标题';
  before.site.description='欢迎使用简影，继续保留管理员的介绍。';
  before.site.headline='自定义首屏文案';
  before.templates.reverse();
  before.templates[0].name='管理员自定义模板';
  before.templates[0].enabled=false;before.templates[0].featured=false;
  before.analytics.enabled=false;
  await writeFile(path.join(dataDir,'site-settings.json'),JSON.stringify(before));
  const server=await createResumeServer({adminOptions:{dataDir},portraitOptions:{publicMode:true}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    const resolved=path.resolve(dataDir);assert(resolved.startsWith(path.resolve(import.meta.dirname)+path.sep));
    await rm(resolved,{recursive:true,force:true});
  });
  const base=`http://127.0.0.1:${server.address().port}`;
  const expected=structuredClone(before);
  expected.site.title='一纸简历 · 自定义首页标题';
  expected.site.description='欢迎使用一纸简历，继续保留管理员的介绍。';
  assert.deepEqual(await(await fetch(base+'/api/site-config')).json(),expected);
  assert.deepEqual(JSON.parse(await readFile(path.join(dataDir,'site-settings.json'),'utf8')),expected);
  assert.match(await(await fetch(base+'/')).text(),/<title>一纸简历 · 自定义首页标题<\/title>/);
});
