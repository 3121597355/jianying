import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'models');
const target=path.join(dir,'modnet_photographic.onnx'),tmp=target+'.download';
const expected='5069a5e306b9f5e9f4f2b0360264c9f8ea13b257c7c39943c7cf6a2ec3a102ae';
const valid=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')===expected;
let exists=false;try{exists=valid(await readFile(target));}catch{}
if(exists)console.log('本地抠图模型已就绪。');
else{
  console.log('正在安装约 26 MB 的 MODNet 人像抠图模型，仅首次需要下载…');
  await mkdir(dir,{recursive:true});
  let bytes;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const r=await fetch('https://github.com/yakhyo/modnet/releases/download/weights/modnet_photographic.onnx',{signal:AbortSignal.timeout(90_000)});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      bytes=Buffer.from(await r.arrayBuffer());
      if(!valid(bytes))throw new Error('文件校验失败');
      break;
    }catch(error){
      if(attempt===3)throw new Error('模型下载失败，请检查 GitHub 网络连接后重新运行 npm run setup-model。',{cause:error});
      console.log(`下载中断，正在重试（${attempt}/2）…`);
    }
  }
  await writeFile(tmp,bytes);await rename(tmp,target);console.log('本地抠图模型已就绪。');
}
