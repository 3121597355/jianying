/**
 * 编辑器入口的静态模块图。
 *
 * 编辑器的源码保持「不打包的原生 ES 模块」，浏览器会按 import 依赖一层层串行取模块，
 * 这里把整张图提前算出来，写进 resume.html 的 modulepreload 区块，
 * 让浏览器一次性并发下载，避免 5～6 层模块瀑布（弱网/代理抖动时尤其明显）。
 */
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

export const PRELOAD_START = '<!-- editor-modulepreload:start -->';
export const PRELOAD_END = '<!-- editor-modulepreload:end -->';
const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s(?:[^'"`]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

export async function collectEditorPreloads(root, entry = 'assets/js/editor-entry.js') {
  const jsRoot = path.join(root, 'assets/js');
  const seen = new Set();
  const hrefs = [];
  const walk = async file => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = await readFile(file, 'utf8');
    const specs = [];
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(source))) {
      const spec = match[1] || match[2];
      if (spec && spec.startsWith('.')) specs.push(spec);
    }
    for (const spec of specs) {
      const [clean, ...rest] = spec.split('?');
      const target = path.resolve(path.dirname(file), clean);
      const relative = path.relative(jsRoot, target).split(path.sep).join('/');
      const href = `/assets/js/${relative}${rest.length ? `?${rest.join('?')}` : ''}`;
      if (!seen.has(target)) hrefs.push(href);
      await walk(target);
    }
  };
  await walk(path.resolve(root, entry));
  return hrefs;
}

export function renderPreloadBlock(hrefs) {
  return [PRELOAD_START, ...hrefs.map(href => `<link rel="modulepreload" href="${href}">`), PRELOAD_END].join('\n');
}

/** 把生成好的 modulepreload 区块写回 resume.html，返回是否有改动。 */
export async function writePreloadBlock(root) {
  const htmlPath = path.join(root, 'resume.html');
  const html = await readFile(htmlPath, 'utf8');
  const start = html.indexOf(PRELOAD_START);
  const end = html.indexOf(PRELOAD_END);
  if (start < 0 || end < start) throw new Error('resume.html 缺少 editor-modulepreload 标记区块');
  const block = renderPreloadBlock(await collectEditorPreloads(root));
  const next = html.slice(0, start) + block + html.slice(end + PRELOAD_END.length);
  if (next === html) return false;
  await writeFile(htmlPath, next);
  return true;
}
