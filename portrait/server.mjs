import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import sharp from 'sharp';
import {buildPrompt} from './public/presets.js';
import {localCutout,CUTOUT_VERSION} from './local-cutout.mjs';

const root=process.env.VERCEL?path.join(process.cwd(),'portrait'):path.dirname(fileURLToPath(import.meta.url));
const MAX_IMAGE=12*1024*1024;
class AppError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export function normalizeConfig(input,previous={}) {
  const result={baseUrl:String(input.baseUrl??previous.baseUrl??'').trim().replace(/\/+$/,''),model:String(input.model??previous.model??'image2.5sub').trim(),apiKey:previous.apiKey??'',mode:input.mode??previous.mode??'multipart',imageField:input.imageField??previous.imageField??'image[]'};
  if (input.apiKey?.trim()) result.apiKey=input.apiKey.trim();
  if (result.apiKey.length>512 || /[\r\n]/.test(result.apiKey)) throw new AppError('密钥格式无效。');
  if (!result.model || result.model.length>160 || /[\r\n]/.test(result.model)) throw new AppError('请填写正确的模型名称。');
  if (!['multipart','json'].includes(result.mode) || !['image','image[]'].includes(result.imageField)) throw new AppError('请求格式无效。');
  if(result.baseUrl){
    let url;try{url=new URL(result.baseUrl);}catch{throw new AppError('请填写完整的 HTTPS 服务地址。');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash) throw new AppError('服务地址须使用 HTTPS，不可包含密钥、查询参数或账号。');
    if(/\/(images\/edits|models)\/?$/.test(url.pathname)) throw new AppError('请填写 Base URL（通常以 /v1 结尾），不要包含 /images/edits 或 /models。');
    if(url.pathname==='/')result.baseUrl=url.origin+'/v1';
  }
  return result;
}
function publicConfig(c,publicMode=false){return {...c,apiKey:undefined,hasKey:!publicMode&&!!c.apiKey,configured:!publicMode&&!!(c.apiKey&&c.baseUrl),keyHint:!publicMode&&c.apiKey?'已保存在本机':'',publicMode,features:{localCutout:true,cloudEditing:!publicMode,cutoutVersion:CUTOUT_VERSION,maxUploadBytes:process.env.VERCEL?3500000:null}};}
function isPrivate(ip){
  if(net.isIPv4(ip)){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19));}
  const s=ip.toLowerCase();return s==='::'||s==='::1'||s.startsWith('fc')||s.startsWith('fd')||/^fe[89ab]/.test(s)||s.startsWith('::ffff:')||s.startsWith('ff');
}
async function validateRemote(urlString){
  let u;try{u=new URL(urlString);}catch{throw new AppError('服务返回了无效的图片地址。');}
  if(u.protocol!=='https:'||u.username||u.password) throw new AppError('远程地址须使用 HTTPS。');
  const host=u.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')) throw new AppError('不支持本地或内网服务地址。');
  const ips=net.isIP(host)?[{address:host}]:await dns.lookup(host,{all:true});
  if(!ips.length||ips.some(x=>isPrivate(x.address))) throw new AppError('不支持本地或内网服务地址。');
}
async function limitedBody(response,limit){
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new AppError('接口返回的内容过大。');}
  const parts=[];let total=0;
  if(response.body) for await(const chunk of response.body){total+=chunk.length;if(total>limit)throw new AppError('接口返回的内容过大。');parts.push(chunk);}
  return Buffer.concat(parts);
}
async function inputImage(data){
  if(typeof data!=='string') throw new AppError('请先上传照片。');
  const m=data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!m) throw new AppError('仅支持 JPG、PNG、WebP 图片。');
  const buf=Buffer.from(m[2],'base64');if(buf.length>MAX_IMAGE)throw new AppError('照片不得超过 12 MB。');
  try{return await sharp(buf,{limitInputPixels:40_000_000}).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();}catch{throw new AppError('图片无法读取，请换用有效的 JPG、PNG 或 WebP。');}
}
function apiError(status){return ({400:'服务不接受当前参数，请检查模型 ID、请求格式及画质设置。',401:'密钥未通过验证，请检查密钥或服务地址。',403:'服务拒绝访问，请检查密钥权限与可用模型。',404:'未找到 API 接口，请检查 Base URL 是否包含 /v1。',413:'服务商拒绝了图片大小，请使用更小的照片。',429:'服务额度不足或请求过于频繁，请检查余额并稍后重试。'})[status]??`服务返回 HTTP ${status}，请检查模型和接口设置。`;}
function connectionError(error){
  if(error instanceof AppError)return error;
  if(error.name==='TimeoutError'||error.name==='AbortError')return new AppError('服务连接超时，请稍后重试或检查网络。',504);
  const code=error.cause?.code||error.code;
  if(['ENOTFOUND','EAI_AGAIN'].includes(code))return new AppError('无法解析服务域名，请检查地址拼写和网络连接。',502);
  if(code==='ECONNREFUSED')return new AppError('服务拒绝连接，请检查 API 地址或稍后重试。',502);
  return new AppError('无法连接图像服务，请检查网络和完整的 Base URL（通常以 /v1 结尾）。',502);
}

export async function createApp({configPath=path.join(root,'private','config.json'),transport=fetch,remoteValidator=validateRemote,cutout=localCutout,basePath='',hostPort=null,publicMode=process.env.PUBLIC_MODE==='1',publicOrigin=process.env.PUBLIC_ORIGIN||'',allowedOrigins=[],requestToken='',checkRate}={}){
  let siteOrigin='';
  if(publicOrigin){const site=new URL(publicOrigin);if(!publicMode||!['https:','http:'].includes(site.protocol)||site.username||site.password||site.search||site.hash||site.pathname!=='/')throw new Error('PUBLIC_ORIGIN 须为公开站点的完整域名，如 https://example.com。');siteOrigin=site.origin;}
  let installationId='workspace';try{installationId=(await readFile(path.join(root,'private','installation.id'),'utf8')).trim();}catch{}
  // Public mode never reads the owner's connection file, even if it is present.
  let config=normalizeConfig({});if(!publicMode)try{const stored=JSON.parse(await readFile(configPath,'utf8'));config=normalizeConfig(stored,stored);}catch(e){if(e.code!=='ENOENT')throw e;}
  const requestLimits=new Map();
  const csrf=requestToken||crypto.randomBytes(32).toString('hex'),jobs=new Map();let activeJob=null;
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  async function requestJson(req){let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>19*1024*1024)throw new AppError('上传内容过大。',413);parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw new AppError('请求内容不是有效的 JSON。');}}
  async function upstream(c,suffix,options={}){const address=c.baseUrl+suffix;try{await remoteValidator(address);return await transport(address,{...options,redirect:'error',headers:{...options.headers,Authorization:`Bearer ${c.apiKey}`}});}catch(e){throw connectionError(e);}}
  async function listModels(c){
    if(!c.baseUrl||!c.apiKey)throw new AppError('请填写服务地址和密钥。');
    const response=await upstream(c,'/models',{signal:AbortSignal.timeout(20_000)});
    if(!response.ok){await response.body?.cancel();throw new AppError(apiError(response.status),502);}
    let payload;try{payload=JSON.parse((await limitedBody(response,2*1024*1024)).toString());}catch(e){if(e instanceof AppError)throw e;throw new AppError('地址返回了网页而非 API 数据，请使用平台的完整 Base URL（通常以 /v1 结尾）。',502);}
    if(!Array.isArray(payload.data))throw new AppError('平台未提供模型列表，请手动填写模型 ID。');
    return [...new Set(payload.data.map(m=>m?.id).filter(id=>typeof id==='string'&&id.length>0&&id.length<=160))];
  }
  async function runJob(job,c,body,image){
    try{
      const fields={model:c.model,prompt:buildPrompt(body),n:1};
      if(body.quality&&body.quality!=='default')fields.quality=body.quality;
      if(body.resolution&&body.resolution!=='default')fields.size=body.resolution;
      if(body.presetId==='transparent'){fields.background='transparent';fields.output_format='png';}
      let requestBody,headers={};
      if(c.mode==='json'){headers['Content-Type']='application/json';requestBody=JSON.stringify({...fields,images:[{image_url:`data:image/png;base64,${image.toString('base64')}`}]});}
      else {requestBody=new FormData();for(const [k,v]of Object.entries(fields))requestBody.set(k,String(v));requestBody.set(c.imageField,new Blob([image],{type:'image/png'}),'portrait.png');}
      const timeout=setTimeout(()=>job.controller.abort('timeout'),300_000);timeout.unref();
      try{
        const response=await upstream(c,'/images/edits',{method:'POST',headers,body:requestBody,signal:job.controller.signal});
        if(!response.ok){await response.body?.cancel();throw new AppError(apiError(response.status),502);}
        const buf=await limitedBody(response,36*1024*1024);let raw;
        if(response.headers.get('content-type')?.startsWith('image/'))raw=buf;
        else{
          let payload;try{payload=JSON.parse(buf.toString());}catch{throw new AppError('接口没有返回可识别的图片结果。');}
          const first=payload.data?.[0];
          if(first?.b64_json)raw=Buffer.from(first.b64_json,'base64');
          else if(first?.url){
            let address=first.url;
            for(let i=0;i<4;i++){
              await remoteValidator(address);
              // Result CDN requests intentionally carry no provider authorization header.
              const out=await transport(address,{redirect:'manual',signal:job.controller.signal});
              if([301,302,303,307,308].includes(out.status)){const next=out.headers.get('location');await out.body?.cancel();if(!next)throw new AppError('图片下载地址无效。');address=new URL(next,address).href;continue;}
              if(!out.ok){await out.body?.cancel();throw new AppError('图片已生成，但结果下载失败。');}raw=await limitedBody(out,25*1024*1024);break;
            }
          }
          if(!raw)throw new AppError('接口未返回 data[0].b64_json 或 data[0].url。若平台使用异步任务接口，需要按平台文档适配。');
        }
        const pipeline=sharp(raw,{limitInputPixels:40_000_000});const metadata=await pipeline.metadata();
        if(!['png','jpeg','webp'].includes(metadata.format))throw new AppError('服务返回了不支持的图片格式。');
        if(job.status==='cancelled')return;
        job.image=await pipeline.rotate().png().toBuffer();
        const finalMeta=await sharp(job.image).metadata();
        job.width=finalMeta.width;job.height=finalMeta.height;job.warning='';
        if(body.presetId==='transparent'&&(await sharp(job.image).stats()).isOpaque)job.warning='服务返回的图片没有实际透明区域，请检查模型是否支持透明输出。';
        if(job.status==='cancelled'){delete job.image;return;}
        job.status='done';job.completedAt=Date.now();
      }finally{clearTimeout(timeout);}
    }catch(e){if(job.status!=='cancelled'){job.status='failed';job.error=job.controller.signal.aborted?'处理超过 5 分钟，已停止等待；服务商可能仍在处理，请检查平台记录后再试。':e instanceof AppError?e.message:'连接服务失败或返回内容无法读取，请检查网络、Base URL 和请求格式。';}}
    finally{if(activeJob===job.id)activeJob=null;delete job.controller;}
  }
  const cleanup=setInterval(()=>{for(const [id,j]of jobs)if(Date.now()-j.createdAt>30*60_000&&id!==activeJob)jobs.delete(id);},60_000);cleanup.unref();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try{
      const port=server.address()?.port??(typeof hostPort==='function'?hostPort():hostPort);
      const allowedHosts=[`127.0.0.1:${port}`,`localhost:${port}`,...[siteOrigin,...allowedOrigins].filter(Boolean).map(origin=>new URL(origin).host)];
      if(!allowedHosts.includes(req.headers.host))throw new AppError('无效的访问主机。',403);
      const origin=req.headers.origin;if(origin&&origin!==siteOrigin&&!allowedOrigins.includes(origin)&&!allowedHosts.slice(0,2).some(h=>origin===`http://${h}`))throw new AppError('不允许跨站请求。',403);
      const url=new URL(req.url,'http://127.0.0.1');
      if(basePath){if(!url.pathname.startsWith(basePath+'/'))throw new AppError('未找到此内容。',404);url.pathname=url.pathname.slice(basePath.length);}
      if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{app:'portrait-studio',installationId,ready:true});
      if(req.method!=='GET'&&(!['POST','PATCH'].includes(req.method)||req.headers['x-app-token']!==csrf||!req.headers['content-type']?.startsWith('application/json')))throw new AppError('请求校验失败，请刷新页面。',403);
      if(publicMode&&(/^\/api\/(models|check|jobs)(\/|$)/.test(url.pathname)||(url.pathname==='/api/config'&&req.method!=='GET')))throw new AppError('公开版仅提供免费换底，云端连接与 AI 调用已关闭。',403);
      if(url.pathname==='/api/config'&&req.method==='GET')return json(res,200,{...publicConfig(config,publicMode),token:csrf});
      if(publicMode&&['/api/cutout','/api/export'].includes(url.pathname)&&req.method==='POST'){
        if(checkRate)await checkRate(req);
        else{
        const now=Date.now(),ip=req.socket.remoteAddress||'unknown';
        for(const [key,value]of requestLimits)if(now-value.start>60_000)requestLimits.delete(key);
        const entry=requestLimits.get(ip)||{start:now,count:0};entry.count++;requestLimits.set(ip,entry);
        if(entry.count>12){res.setHeader('Retry-After','60');throw new AppError('操作较频繁，请稍等一分钟再试。',429);}
        if(requestLimits.size>1024)requestLimits.delete(requestLimits.keys().next().value);
        }
      }
      if(url.pathname==='/api/cutout'&&req.method==='POST'){
        const body=await requestJson(req),image=await inputImage(body.image);
        try{
          const result=await cutout(image);
          res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Processing-Ms':String(result.durationMs),'X-Cutout-Cached':String(result.cached),'X-Cutout-Version':result.version||CUTOUT_VERSION});
          return res.end(result.image);
        }catch(e){throw new AppError(e.code==='ENOENT'?'本地抠图模型尚未安装，请运行 npm run setup-model。':e.message?.startsWith('本')||e.message?.startsWith('未识别')?e.message:'本地抠图未完成，请使用人物与背景分明的照片。',503);}
      }
      if(url.pathname==='/api/config'&&req.method==='PATCH'){
        if(activeJob)throw new AppError('请等待当前生成结束后再修改连接设置。',409);
        const next=normalizeConfig(await requestJson(req),config);
        await mkdir(path.dirname(configPath),{recursive:true});await writeFile(configPath+'.tmp',JSON.stringify(next,null,2),{mode:0o600});await rename(configPath+'.tmp',configPath);config=next;
        return json(res,200,publicConfig(config));
      }
      if(url.pathname==='/api/models'&&req.method==='POST'){
        const draft=normalizeConfig({...await requestJson(req),model:config.model},config);
        return json(res,200,{models:await listModels(draft)});
      }
      if(url.pathname==='/api/check'&&req.method==='POST'){
        const c={...config},models=await listModels(c);
        return json(res,200,{ok:true,modelFound:models.includes(c.model),models,message:models.includes(c.model)?'连接成功，当前模型可用。':'连接成功，列表中未找到当前模型，请重新选择。'});
      }
      if(url.pathname==='/api/jobs'&&req.method==='POST'){
        if(activeJob)throw new AppError('已有一张照片正在处理中，请稍候。',409);
        if(!config.baseUrl||!config.apiKey)throw new AppError('密钥已保存，还需要填写服务商的 Base URL 才能开始生成。');
        const body=await requestJson(req);buildPrompt(body);
        if(!['default','auto','low','medium','high'].includes(body.quality??'default')||!['default','auto','1024x1024','1024x1536','1536x1024'].includes(body.resolution??'default'))throw new AppError('画质或分辨率参数无效。');
        // Reserve the slot before asynchronous image decoding to prevent concurrent charges.
        const id=crypto.randomUUID();activeJob=id;
        let image;try{image=await inputImage(body.image);}catch(e){activeJob=null;throw e;}
        const job={id,status:'processing',createdAt:Date.now(),presetId:body.presetId,controller:new AbortController()};jobs.set(id,job);
        while(jobs.size>8){const oldest=[...jobs.keys()].find(k=>k!==activeJob);if(!oldest)break;jobs.delete(oldest);}
        void runJob(job,{...config},body,image);return json(res,202,{id});
      }
      const match=url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)(\/image|\/cancel)?$/);
      if(match){const job=jobs.get(match[1]);if(!job)throw new AppError('结果已过期，请重新生成。',404);
        if(match[2]==='/cancel'&&req.method==='POST'){if(job.status==='processing'){job.status='cancelled';job.controller?.abort('user');}return json(res,200,{status:job.status});}
        if(req.method!=='GET')throw new AppError('不支持此操作。',405);
        if(match[2]==='/image'){if(!job.image)throw new AppError('图片尚未准备好。',409);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});return res.end(job.image);}
        return json(res,200,{id:job.id,status:job.status,error:job.error,width:job.width,height:job.height,warning:job.warning,presetId:job.presetId});
      }
      if(url.pathname==='/api/export'&&req.method==='POST'){
        const body=await requestJson(req);
        if(!['png','jpeg'].includes(body.format))throw new AppError('导出格式无效。');
        const m=typeof body.image==='string'&&body.image.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);if(!m)throw new AppError('导出图像无效。');
        const raw=Buffer.from(m[1],'base64');if(raw.length>MAX_IMAGE)throw new AppError('导出内容过大。');
        let p=sharp(raw,{limitInputPixels:40_000_000}).withMetadata({density:300});
        const out=body.format==='jpeg'?await p.flatten({background:'#fff'}).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer():await p.png().toBuffer();
        res.writeHead(200,{'Content-Type':`image/${body.format}`,'Cache-Control':'no-store','Content-Disposition':`attachment; filename="portrait.${body.format==='jpeg'?'jpg':'png'}"`});return res.end(out);
      }
      const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/navigation.js':'navigation.js','/quick-background.js':'quick-background.js','/edge-adjust.js':'edge-adjust.js','/presets.js':'presets.js','/style.css':'style.css','/integration.css':'integration.css','/experience.css':'experience.css','/favicon.svg':'favicon.svg'};
      if(req.method==='GET'&&files[url.pathname]){const file=files[url.pathname];const mime=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html';const data=await readFile(path.join(root,'public',file));res.writeHead(200,{'Content-Type':`${mime}; charset=utf-8`,'Cache-Control':'no-cache'});return res.end(data);}
      throw new AppError('未找到此内容。',404);
    }catch(e){if(!res.headersSent)json(res,e instanceof AppError?e.status:500,{error:e instanceof AppError?e.message:'操作未完成，请检查网络或配置后重试。'});else res.end();}
  });
  server.requestTimeout=60_000;
  server.on('close',()=>{clearInterval(cleanup);for(const j of jobs.values())j.controller?.abort();});
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const app=await createApp();const port=Number(process.env.PORT||4318);
  app.listen(port,'127.0.0.1',()=>console.log(`留影已启动：http://127.0.0.1:${port}`));
  app.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已占用，请打开已有页面或更换 PORT。`:'本地服务启动失败。');process.exitCode=1;});
}
