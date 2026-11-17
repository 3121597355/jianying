import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';

test('cloud sanitizer bundle starts without require(ESM) and still removes unsafe HTML',async()=>{
  const result=await build({entryPoints:['sanitize-html'],bundle:true,platform:'node',format:'cjs',target:'node24',write:false,logLevel:'silent'});
  const source=result.outputFiles[0].text+`
    const assert=require('node:assert/strict');
    const clean=module.exports('<p>正常内容<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">链接</a></p>');
    assert(clean.includes('正常内容'));
    assert(!clean.includes('<script'));
    assert(!clean.includes('onerror'));
    assert(!clean.includes('javascript:'));
  `;
  const run=spawnSync(process.execPath,['--no-experimental-require-module'],{input:source,encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stderr);
});
