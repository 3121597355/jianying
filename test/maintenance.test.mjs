import {test} from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceResponse,needsMaintenance} from '../maintenance.mjs';
import {publicOrigins} from '../public-origins.mjs';

test('maintenance returns a no-cache 503 for every route, including admin pages and APIs',()=>{
  for(const route of ['/', '/resume/','/portrait/','/privacy/','/sitemap.xml','/robots.txt','/api/site-config','/api/analytics/event','/portrait/api/config','/portrait/api/cutout','/admin.html','/admin','/api/auth/status','/api/auth/login','/api/admin/settings','/api/admin/summary','/assets/css/admin.css','/assets/js/admin.js','/favicon.ico']) {
    const result=maintenanceResponse(route,true);assert.equal(result.status,503,route);assert.match(result.headers['X-Robots-Tag'],/noindex/);assert.match(result.body,/备案维护中/);assert.match(result.headers['Cache-Control'],/no-store/);
  }
  for(const route of ['/account/','/plans/','/api/member/register','/api/member/status','/api/member/resumes','/api/member/tailor','/api/admin/members','/api/admin/resume-ai'])assert.equal(maintenanceResponse(route,true).status,503,route);
  assert.equal(maintenanceResponse('/',false),null);
});

test('custom domain and default Vercel alias share origin checks without reopening filing domains',()=>{
  const env={MAINTENANCE_MODE:'filing',PUBLIC_ORIGIN:'https://yizhijianli.top',PUBLIC_ALTERNATE_ORIGINS:'https://jianying-omega.vercel.app,https://yizhijianli.cn,https://user:password@attacker.example,https://attacker.example/path',VERCEL_URL:'jianying-qa-3121597355.vercel.app'};
  assert.deepEqual(publicOrigins(env),['https://yizhijianli.top','https://jianying-omega.vercel.app','https://yizhijianli.cn','https://jianying-qa-3121597355.vercel.app']);
  for(const host of ['yizhijianli.top','jianying-omega.vercel.app','jianying-qa-3121597355.vercel.app'])assert.equal(needsMaintenance({headers:{host}},env),false);
  for(const host of ['www.yizhijianli.top','attacker.example','yizhijianli.cn','www.yizhijianli.cn'])assert.equal(needsMaintenance({headers:{host}},env),true);
});

test('filing mode opens only the approved deployment hosts and ignores spoofed forwarded headers',()=>{
  const env={MAINTENANCE_MODE:'filing',PUBLIC_ORIGIN:'https://jianying-omega.vercel.app',VERCEL_URL:'jianying-qa-3121597355.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'jianying-3121597355.vercel.app'};
  for(const host of ['jianying-omega.vercel.app','Jianying-Omega.Vercel.App','jianying-omega.vercel.app.','jianying-qa-3121597355.vercel.app','jianying-3121597355.vercel.app']) assert.equal(needsMaintenance({headers:{host}},env),false,host);
  for(const host of ['yizhijianli.cn','www.yizhijianli.cn','yizhijianli.cn.','evil.vercel.app','jianying-omega.vercel.app.evil.example','jianying-omega.vercel.app:443','jianying-omega.vercel.app,yizhijianli.cn','']) assert.equal(needsMaintenance({headers:{host,'x-forwarded-host':'jianying-omega.vercel.app'}},env),true,host);
  assert(needsMaintenance({headers:{host:'yizhijianli.cn'}},{...env,PUBLIC_ORIGIN:'https://yizhijianli.cn'}));
  assert(needsMaintenance({headers:{host:'jianying-omega.vercel.app'}},{...env,MAINTENANCE_MODE:'1'}));
  assert.equal(needsMaintenance({headers:{host:'127.0.0.1:8099'}},{}),false);
});
