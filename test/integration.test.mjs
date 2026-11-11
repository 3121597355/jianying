import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
import sharp from 'sharp';
import { createResumeServer } from '../serve.mjs';

const privateKey = 'integration-fixture-only';
const image = await sharp({ create: { width: 295, height: 413, channels: 4, background: '#438edb' } }).png().toBuffer();
const dataImage = `data:image/png;base64,${image.toString('base64')}`;
async function setup(t) {
  const directory = await mkdtemp(path.join(import.meta.dirname, 'fixture-'));
  const configPath = path.join(directory, 'config.json');
  await writeFile(configPath, JSON.stringify({ baseUrl: 'https://fixture.example/v1', apiKey: privateKey, model: 'fixture-image', mode: 'multipart', imageField: 'image[]' }));
  let cloudCalls = 0, cutoutCalls = 0;
  const server = await createResumeServer({ adminOptions: { dataDir: path.join(directory, 'admin') }, portraitOptions: { configPath, remoteValidator: async () => {}, transport: async () => { cloudCalls++; return new Response(JSON.stringify({ data: [{ b64_json: image.toString('base64') }] }), { headers: { 'Content-Type': 'application/json' } }); }, cutout: async () => { cutoutCalls++; return { image, durationMs: 1, cached: false }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); const target = path.resolve(directory); assert(target.startsWith(path.resolve(import.meta.dirname) + path.sep)); await rm(target, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(base + '/portrait/api/config')).json();
  const request = (url, body, extra = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Token': config.token, ...extra }, body: JSON.stringify(body) });
  return { base, config, request, counts: () => ({ cloudCalls, cutoutCalls }) };
}
test('resume and portrait share one origin with relative assets and protected private files', async t => {
  const s = await setup(t);
  const redirect = await fetch(s.base + '/portrait', { redirect: 'manual' });
  assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), '/portrait/');
  for (const route of ['/', '/resume/', '/portrait/', '/portrait/app.js', '/portrait/navigation.js', '/portrait/presets.js', '/portrait/quick-background.js', '/portrait/style.css', '/portrait/integration.css', '/portrait/experience.css', '/assets/js/store.js', '/assets/css/palette.css', '/assets/css/interface.css', '/assets/css/landing.css', '/assets/css/experience.css', '/assets/img/brand/mark-mono.svg', '/assets/img/brand/icon.png', '/assets/img/brand/favicon.png']) assert.equal((await fetch(s.base + route)).status, 200, route);
  const html = await (await fetch(s.base + '/portrait/')).text();
  assert.match(html, /简历设置/); assert.match(html, /更换模板/); assert.match(html, /useResumePhoto/); assert.match(html, /src="\.\/app.js"/);
  assert.equal(s.config.hasKey, true); assert.equal(s.config.apiKey, undefined); assert(!JSON.stringify(s.config).includes(privateKey));
  for (const route of ['/private/portrait-config.json', '/portrait/private/config.json', '/portrait/server.mjs', '/portrait/models/u2netp.onnx', '/node_modules/sharp/package.json', '/serve.mjs', '/assets/../private/portrait-config.json']) assert.equal((await fetch(s.base + route)).status, 404, route);
});
test('homepage and editor have distinct routes with absolute assets and the same saved-draft keys', async t => {
  const s = await setup(t);
  const home = await (await fetch(s.base + '/')).text();
  const editor = await (await fetch(s.base + '/resume/')).text();
  assert.match(home, /<title>一纸简历/);
  assert.match(home, /href="\/resume\/"/);
  assert.match(home, /href="\/portrait\/"/);
  assert.match(home, /templateDialog/);
  for (const id of [2001,2002,2003,2004]) {
    assert.ok(home.includes(`/resume/?template=${id}`));
    const thumbnail=await fetch(s.base+`/assets/img/templates/${id}.png`);
    assert.equal(thumbnail.status,200);
    assert.equal(thumbnail.headers.get('content-type'),'image/png');
  }
  for(const asset of ['/assets/js/tpl-standard.js','/assets/css/tpl-standard.css'])assert.equal((await fetch(s.base+asset)).status,200);
  assert.match(editor, /resumeHost/);
  assert.match(editor, /src="\/assets\/js\/editor-entry.js\?v=[^" ]+"/);
  assert.match(editor, /data-editor-state="loading"/);
  assert.match(editor, /id="editorWorkspace"[^>]+inert/);
  assert.doesNotMatch(editor, /登录 \/ 注册|简历智能助手|下载\/导出简历|在线客服|间距设置|字体\/语言|皮肤设置|封面设置/);
  assert.doesNotMatch(editor, /<script[^>]+src="\/assets\/vendor\/(html2canvas|jspdf)/);
  for (const route of ['/assets/js/editor-entry.js', '/assets/js/vendor-loader.js']) assert.equal((await fetch(s.base + route)).status, 200, route);
  assert.doesNotMatch(editor, /(?:src|href)="assets\//);
  const landing = await (await fetch(s.base + '/assets/js/landing.js')).text();
  assert.match(landing, /qmj-clone:resume/);
  assert.match(landing, /qmj-clone:ui/);
  const portrait = await (await fetch(s.base + '/portrait/app.js')).text();
  assert.match(portrait, /\/resume\/\?portrait=applied/);
  const redirect = await fetch(s.base + '/resume', {redirect:'manual'});
  assert.equal(redirect.status,308); assert.equal(redirect.headers.get('location'),'/resume/');
});
test('mounted portrait API keeps host, origin and request-token checks', async t => {
  const s = await setup(t);
  assert.equal((await s.request('/portrait/api/cutout', { image: dataImage }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await s.request('/portrait/api/cutout', { image: dataImage }, { 'X-App-Token': 'invalid' })).status, 403);
  const badHost = await new Promise((resolve, reject) => { const request = http.get(s.base + '/portrait/api/config', { headers: { Host: 'other.example' } }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); });
  assert.equal(badHost, 403);
  assert.equal((await s.request('/portrait/api/cutout', { image: dataImage }, { Origin: s.base })).status, 200);
  assert.deepEqual(s.counts(), { cloudCalls: 0, cutoutCalls: 1 });
});
test('mounted local processing, export DPI and generated image URLs work', async t => {
  const s = await setup(t);
  const local = await s.request('/portrait/api/cutout', { image: dataImage }); assert.equal(local.status, 200); assert.equal(local.headers.get('content-type'), 'image/png');
  const exported = await s.request('/portrait/api/export', { image: dataImage, format: 'jpeg' }); assert.equal(exported.status, 200);
  const meta = await sharp(Buffer.from(await exported.arrayBuffer())).metadata(); assert.equal(meta.width, 295); assert.equal(meta.height, 413); assert.equal(meta.density, 300);
  const started = await s.request('/portrait/api/jobs', { presetId: 'blue', image: dataImage }); assert.equal(started.status, 202); const { id } = await started.json();
  let result; for (let i = 0; i < 20; i++) { result = await (await fetch(s.base + `/portrait/api/jobs/${id}`)).json(); if (result.status === 'done') break; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.equal(result.status, 'done'); assert.equal((await fetch(s.base + `/portrait/api/jobs/${id}/image`)).status, 200);
  assert.deepEqual(s.counts(), { cloudCalls: 1, cutoutCalls: 1 });
});
