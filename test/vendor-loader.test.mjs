import { test } from 'node:test';
import assert from 'node:assert/strict';

async function loaderEnvironment(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => original ? Object.defineProperty(globalThis, 'document', original) : delete globalThis.document);
  const scripts = [];
  globalThis.document = {
    createElement: () => ({ removed: false, remove() { this.removed = true; } }),
    head: { appendChild(script) { scripts.push(script); } },
  };
  const { loadVendor } = await import(`../assets/js/vendor-loader.js?test=${Math.random()}`);
  return { loadVendor, scripts };
}

test('simultaneous dependency users share one load and an already available component needs no request', async t => {
  const { loadVendor, scripts } = await loaderEnvironment(t);
  let loaded = false;
  const first = loadVendor('/component.js', () => loaded);
  const second = loadVendor('/component.js', () => loaded);
  assert.equal(first, second);
  assert.equal(scripts.length, 1);
  loaded = true;
  scripts[0].onload();
  await Promise.all([first, second]);
  await loadVendor('/component.js', () => loaded);
  assert.equal(scripts.length, 1);
});

test('a failed dependency download is removed and a later action can retry', async t => {
  const { loadVendor, scripts } = await loaderEnvironment(t);
  const failed = loadVendor('/component.js', () => false);
  const rejection = assert.rejects(failed, /下载失败/);
  scripts[0].onerror();
  await rejection;
  assert.equal(scripts[0].removed, true);
  let loaded = false;
  const retry = loadVendor('/component.js', () => loaded);
  assert.equal(scripts.length, 2);
  loaded = true;
  scripts[1].onload();
  await retry;
});
