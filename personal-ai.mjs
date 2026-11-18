import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import clientAddress from './request-client.cjs';
import {generateJobVersion,reviewResume,reviseJobVersion} from './job-tailor.mjs';
import {normalizeResume,modelResume} from './resume-document.mjs';
import sharp from 'sharp';
import {buildPrompt} from './portrait/public/presets.js';

const fail=(message,status=400)=>Object.assign(Error(message),{status});
const loopbackHost=host=>/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(String(host||''));
export function privateAddress(ip){
  if(net.isIPv4(ip)){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19));}
  return !net.isIPv6(ip)||/^(::|fc|fd|fe[89ab]|ff)/i.test(ip);
}
export function personalConnection(input={},options={}){
  const allowLocal=options.allowLocal===true;
  const base=String(input.baseUrl||'').trim().replace(/\/$/,'');let url;
  try{url=new URL(base);}catch{throw fail('请填写有效的 API 基础地址。');}
  // 本机部署可以连本机服务（127.0.0.1 / localhost 任意端口，http 或 https）；
  // 公网部署仍然只允许公开 HTTPS 域名，防止被当成访问内网的跳板。
  const local=allowLocal&&loopbackHost(url.hostname);
  const scheme=local?(url.protocol==='https:'||url.protocol==='http:'):url.protocol==='https:';
  const host=url.hostname.replace(/[\[\]]/g,'');
  const hostOk=local?true:(host.includes('.')&&!host.endsWith('.local')&&!host.endsWith('.localhost')&&!net.isIP(host));
  if(!scheme||url.username||url.password||url.search||url.hash||(!local&&url.port)||!hostOk)throw fail(local?'请填写有效的本机接口地址。':'API 须使用公开的 HTTPS 域名，不支持内网、IP 或含密钥的地址。');
  if(/\/(chat\/completions|images\/edits|models)$/.test(url.pathname))throw fail('请填写 API 基础地址（通常以 /v1 结尾），不要包含接口路径。');
  const apiKey=String(input.apiKey||'').trim(),model=String(input.model||'').trim();
  if(!apiKey||apiKey.length>4000||/[\r\n]/.test(apiKey)||!model||model.length>160)throw fail('请填写 API Key 和服务商提供的完整模型名称。');
  return {baseUrl:url.pathname==='/'?url.origin+'/v1':base,apiKey,model,enabled:true,personal:true,local,mode:input.mode==='json'?'json':'multipart',imageField:['image','image[]'].includes(input.imageField)?input.imageField:'image'};
}
// DNS is resolved once, checked, and pinned on the actual HTTPS connection.
// No redirects, cookies, shared provider keys or raw provider errors are forwarded.
export async function personalFetch(address,options={},lookup=dns.lookup,allowLocal=false){
  const url=new URL(address);
  const local=allowLocal===true&&loopbackHost(url.hostname);
  if(url.username||url.password)throw fail('远程地址不受支持。');
  if(local){if(url.protocol!=='https:'&&url.protocol!=='http:')throw fail('远程地址不受支持。');}
  else if(url.protocol!=='https:'||url.port)throw fail('远程地址不受支持。');
  const host=url.hostname.replace(/[\[\]]/g,'');
  if(!local&&(!host.includes('.')||host.endsWith('.localhost')||host.endsWith('.local')))throw fail('不支持内网地址。');
  const ips=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await lookup(host,{all:true});
  if(!ips.length||(!local&&ips.some(item=>privateAddress(item.address))))throw fail('不支持内网地址。');
  let payload=options.body,headers={...options.headers};
  if(payload instanceof FormData){const request=new Request(url,{method:'POST',body:payload});payload=Buffer.from(await request.arrayBuffer());headers['Content-Type']=request.headers.get('content-type');}
  if(payload)headers['Content-Length']=Buffer.byteLength(payload);
  return new Promise((resolve,reject)=>{
    const send=(url.protocol==='http:'?http:https).request;
    // 本机端点常使用自签证书，仅对回环地址放行；公网连接仍严格校验证书。
    const request=send(url,{method:options.method||'GET',headers,signal:options.signal,...(local?{rejectUnauthorized:false}:{}),lookup:(_host,opts,cb)=>cb(null,opts.all?ips:ips[0].address,ips[0].family)},response=>{
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>36*1024*1024){response.destroy(fail('服务返回内容过大。',502));return;}chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));
    });
    request.on('error',reject);if(payload)request.write(payload);request.end();
  });
}
export function createPersonalAi({hostPort,allowedOrigins=[],publicOrigin='',checkRate,allowLocal=false,transport}={}){
  if(!transport)transport=(address,options)=>personalFetch(address,options,dns.lookup,allowLocal===true);
  const limits=new Map();let active=0;
  return async function handle(req,res,url){
    if(!url.pathname.startsWith('/api/personal-ai/'))return false;
    const json=(status,value)=>{if(!res.headersSent&&!res.destroyed)res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(value));};
    let running=false,controller,onClose;
    try{
      const port=hostPort?.(),origins=[...allowedOrigins,publicOrigin,`http://127.0.0.1:${port}`,`http://localhost:${port}`].filter(Boolean);
      if(req.method!=='POST')throw fail('请使用 POST 请求。',405);
      if(!origins.some(origin=>new URL(origin).host===req.headers.host)||!origins.includes(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site'||!req.headers['content-type']?.startsWith('application/json'))throw fail('不允许跨站请求。',403);
      if(!['/api/personal-ai/tailor','/api/personal-ai/portrait'].includes(url.pathname))throw fail('接口不存在。',404);
      if(checkRate)await checkRate(req);
      const id=process.env.VERCEL?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():clientAddress(req),now=Date.now();for(const [key,item]of limits)if(item.until<now)limits.delete(key);
      const budget=limits.get(id)||{count:0,until:now+60000};limits.set(id,budget);if(++budget.count>4||active>=2)throw fail('请求较多，请稍后重试。',429);
      const parts=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4100000)throw fail('提交内容过大，请缩小照片。',413);parts.push(chunk);}
      let input;try{input=JSON.parse(Buffer.concat(parts).toString());}catch{throw fail('提交格式无效。');}
      if(input.consent!==true)throw fail('请确认使用个人 API 连接并发送相关材料。');
      const config=personalConnection(input.connection,{allowLocal});active++;running=true;controller=new AbortController();onClose=()=>{if(!res.writableEnded)controller.abort();};res.on('close',onClose);
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(55000)]);
      if(url.pathname.endsWith('/tailor')){
        const resume=normalizeResume(input.resume),jd=String(input.jd||'').slice(0,12000),jobTitle=String(input.jobTitle||'').trim().slice(0,80);
        // The browser omits identity fields; the model receives only modelResume facts.
        modelResume(resume);
        // 不填岗位要求时是只读诊断，不生成新版本，因此不要求岗位名称。
        if(input.mode==='review')json(200,await reviewResume({resume,config,fetchImpl:transport,signal}));
        else if(input.mode==='feedback'){
          const feedback=String(input.feedback||'').trim().slice(0,2000);
          if(jd.trim().length<20||!jobTitle||feedback.length<2)throw fail('请填写岗位名称、至少 20 字的岗位要求和具体反馈。');
          json(200,await reviseJobVersion({resume,jd,jobTitle,feedback,previousResult:input.previousResult,config,fetchImpl:transport,signal}));
        }
        else{
          if(jd.trim().length<20||!jobTitle)throw fail('请填写岗位名称和至少 20 字的岗位要求，或留空岗位要求只做简历诊断。');
          json(200,await generateJobVersion({resume,jd,jobTitle,config,fetchImpl:transport,signal}));
        }
      }else{
        if(typeof input.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(input.image))throw fail('请上传有效照片。');
        const source=Buffer.from(input.image.split(',')[1],'base64');
        const image=await sharp(source,{limitInputPixels:40000000}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).png().toBuffer();
        const fields={model:config.model,prompt:buildPrompt(input),n:1,response_format:'b64_json'};
        let body,headers={Authorization:'Bearer '+config.apiKey};
        if(config.mode==='json'){headers['Content-Type']='application/json';body=JSON.stringify({...fields,images:[{image_url:'data:image/png;base64,'+image.toString('base64')}]});}
        else{body=new FormData();for(const [key,value]of Object.entries(fields))body.set(key,String(value));body.set(config.imageField,new Blob([image],{type:'image/png'}),'portrait.png');}
        const response=await transport(config.baseUrl+'/images/edits',{method:'POST',headers,body,signal});
        if(!response.ok)throw fail([401,403].includes(response.status)?'个人 API Key 无效或没有权限，请检查连接。':response.status===429?'服务商限流或额度不足，请检查账户。':'图像服务返回异常，请检查模型与请求格式。',502);
        const contentType=response.headers.get('content-type');let raw;
        if(contentType?.startsWith('image/'))raw=Buffer.from(await response.arrayBuffer());
        else{const payload=await response.json(),first=payload.data?.[0];if(first?.b64_json)raw=Buffer.from(first.b64_json,'base64');else if(first?.url){const output=await transport(first.url,{signal});if(!output.ok)throw fail('服务商图片下载失败。',502);raw=Buffer.from(await output.arrayBuffer());}}
        if(!raw||raw.length>25000000)throw fail('模型未返回有效图片，请确认支持同步 images/edits 接口。',502);
        const output=await sharp(raw,{limitInputPixels:40000000}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:92}).toBuffer();
        if(output.length>2800000)throw fail('生成图片过大，请使用较小输出规格。',502);
        json(200,{image:'data:image/webp;base64,'+output.toString('base64')});
      }
    }catch(error){json(error.status||502,{error:error.status?error.message:'个人 AI 请求未完成，请检查网络与服务配置。服务商可能已计费，请先查看记录再重试。'});}
    finally{if(running)active--;if(onClose)res.off('close',onClose);}
    return true;
  };
}
