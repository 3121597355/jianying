import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writePreloadBlock} from './editor-preload.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changed = await writePreloadBlock(root);
console.log(changed ? 'resume.html 的 modulepreload 已更新。' : 'resume.html 的 modulepreload 已是最新。');
