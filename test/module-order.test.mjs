import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getModuleOrder, moveModuleToIndex } from '../assets/js/module-order.js';
import { createTemplateSample } from '../assets/js/template-samples.js';
import { renderByTpl } from '../assets/js/templates.js';

test('dragging across several modules preserves their relative order and does not mutate the original', () => {
  const original = ['basic','work','project','jiaoyu','pingjia'];
  assert.deepEqual(moveModuleToIndex(original, 'pingjia', 0), ['pingjia','basic','work','project','jiaoyu']);
  assert.deepEqual(moveModuleToIndex(original, 'work', 4), ['basic','project','jiaoyu','pingjia','work']);
  assert.deepEqual(original, ['basic','work','project','jiaoyu','pingjia']);
  for (const index of [-1,5,NaN,1.5]) assert.deepEqual(moveModuleToIndex(original, 'work', index), original);
  assert.deepEqual(moveModuleToIndex(original, 'unknown', 0), original);
  assert.deepEqual(moveModuleToIndex(original, 'work', 1), original);
});

test('the full module order survives draft serialization and drives the rendered resume without changing content', () => {
  const resume = createTemplateSample(2001);
  const content = structuredClone({basicInfo:resume.basicInfo,moduleData:resume.moduleData});
  const original = getModuleOrder(resume);
  resume.setData.moduleSort = moveModuleToIndex(original, 'project', 0);
  const restored = JSON.parse(JSON.stringify(resume));
  assert.deepEqual(getModuleOrder(restored), resume.setData.moduleSort);
  assert.equal(new Set(getModuleOrder(restored)).size, original.length);
  const html = renderByTpl(restored);
  assert.ok(html.indexOf('id="project"') < html.indexOf('id="basicInfo"'));
  assert.ok(html.indexOf('id="project"') < html.indexOf('id="work"'));
  assert.deepEqual({basicInfo:restored.basicInfo,moduleData:restored.moduleData}, content);
});
