import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Word 导出用到的 docx 只在用户点「Word」时按需加载，
 * 这里把它打包成可直接 <script> 引入的浏览器文件。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  absWorkingDir: root,
  stdin: {
    contents: "import * as docx from 'docx';\nwindow.docx = docx;\n",
    resolveDir: root,
    sourcefile: 'docx-browser-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  define: {'process.env.NODE_ENV': '"production"'},
  outfile: path.join(root, 'assets', 'vendor', 'docx.browser.js'),
});

console.log('assets/vendor/docx.browser.js 已生成。');
