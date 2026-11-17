import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {collectEditorPreloads, renderPreloadBlock, PRELOAD_START, PRELOAD_END} from '../scripts/editor-preload.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('resume.html 的 modulepreload 区块与编辑器模块图一致', async () => {
  const html = await readFile(path.join(root, 'resume.html'), 'utf8');
  const start = html.indexOf(PRELOAD_START);
  const end = html.indexOf(PRELOAD_END);
  assert.ok(start > -1 && end > start, '缺少 editor-modulepreload 标记');
  const actual = html.slice(start, end + PRELOAD_END.length);
  assert.equal(actual, renderPreloadBlock(await collectEditorPreloads(root)), '模块有增减时请运行 node scripts/gen-editor-preload.mjs');
});

test('编辑器模块图包含入口依赖且都是本地路径', async () => {
  const hrefs = await collectEditorPreloads(root);
  assert.ok(hrefs.length > 20, `模块数量异常：${hrefs.length}`);
  assert.ok(hrefs.includes('/assets/js/app.js?v=20261115-guide-details'), '缺少 app.js 预加载');
  for (const href of hrefs) assert.match(href, /^\/assets\/js\/[\w./-]+(\.js)?(\?[\w=-]+)?$/);
  assert.equal(new Set(hrefs).size, hrefs.length, '存在重复的预加载地址');
});
