import {test} from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceResponse} from '../maintenance.mjs';

test('maintenance returns a no-cache 503 only for public pages and public APIs',()=>{
  for(const route of ['/', '/resume/','/portrait/','/privacy/','/sitemap.xml','/robots.txt','/api/site-config','/api/analytics/event','/portrait/api/config','/portrait/api/cutout']) {
    const result=maintenanceResponse(route,true);assert.equal(result.status,503,route);assert.match(result.headers['X-Robots-Tag'],/noindex/);assert.match(result.body,/备案维护中/);assert.match(result.headers['Cache-Control'],/no-store/);
  }
  for(const route of ['/admin.html','/admin','/api/auth/status','/api/auth/login','/api/admin/settings','/api/admin/summary','/assets/css/admin.css','/assets/js/admin.js','/favicon.ico'])assert.equal(maintenanceResponse(route,true),null,route);
  assert.equal(maintenanceResponse('/',false),null);
});
