import crypto from 'node:crypto';
import {promisify} from 'node:util';
import path from 'node:path';
import {createAccountStore} from './account-store.mjs';
import {normalizeResume,invalid,text} from './resume-document.mjs';
import {aiConfiguration,basicJobVersion,generateJobVersion} from './job-tailor.mjs';
import clientAddress from './request-client.cjs';

const scrypt=promisify(crypto.scrypt),digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const dayOf=now=>new Date(now+8*3600000).toISOString().slice(0,10);
const json=(res,status,data)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}).end(JSON.stringify(data));
const safeUser=user=>({id:user.id,username:user.username,nickname:user.nickname,createdAt:user.createdAt});
function username(value){if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/.test(value))throw invalid('用户名需要为 3～32 位字母、数字、点、横线或下划线。');return value.toLowerCase();}
async function password(value){if(typeof value!=='string'||value.length<10||value.length>128)throw invalid('密码需要为 10～128 个字符。');const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:(await scrypt(value,salt,64)).toString('hex')};}
async function matches(value,user){if(typeof value!=='string'||value.length>128)return false;const salt=user?.password?.salt||'00000000000000000000000000000000';const hash=(await scrypt(value,salt,64)).toString('hex');return Boolean(user&&equal(hash,user.password.hash));}
async function readBody(req,max=2400000){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw invalid('请使用 JSON 请求。',415);
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>max)throw invalid('提交的内容过大，请缩小照片或简历。',413);chunks.push(chunk);}
  try{const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!input||typeof input!=='object'||Array.isArray(input))throw Error();return input;}
  catch{throw invalid('提交的数据无法读取。');}
}

export async function createMembers({root,directory=path.join(root,'private','members'),databaseUrl=process.env.DATABASE_URL,schema='public',hostPort,publicOrigin=process.env.PUBLIC_ORIGIN||'',allowedOrigins=[],config=aiConfiguration(),fetchImpl=fetch,now=Date.now,maxResumes=10,hostedAi=true}={}) {
  if(process.env.VERCEL&&!databaseUrl)throw Error('Member accounts require PostgreSQL on serverless deployments');
  const store=await createAccountStore({directory,databaseUrl,schema});
  const salt=await store.transaction(async tx=>{let current=await tx.get('config','salt');if(!current){current={value:crypto.randomBytes(32).toString('hex')};await tx.put('config','salt','',current);}return current.value;});
  const environmentConfig={...config};
  async function refreshConfig(){config=await store.transaction(tx=>tx.get('config','ai'))||environmentConfig;}
  await refreshConfig();
  const quotaInfo=used=>({limit:config.dailyLimit,used,remaining:Math.max(0,config.dailyLimit-used),resetAt:new Date(Date.parse(dayOf(now())+'T00:00:00+08:00')+86400000).toISOString(),timezone:'Asia/Shanghai'});
  const publicConfig=()=>({aiEnabled:hostedAi&&config.enabled,personalAi:true,aiDailyLimit:config.dailyLimit,cloudLimit:maxResumes,free:true,checkoutEnabled:false});
  async function configuration(){await refreshConfig();return {enabled:config.enabled,baseUrl:config.baseUrl||'https://api.openai.com/v1',model:config.model||'',keyConfigured:Boolean(config.apiKey),dailyLimit:config.dailyLimit};}
  async function updateConfiguration(input){
    await refreshConfig();const next={...config};
    if(typeof input.baseUrl!=='string'||input.baseUrl.length>500)throw invalid('请填写有效的 AI 服务地址。');
    let url;try{url=new URL(input.baseUrl);}catch{throw invalid('AI 服务地址无法读取。');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw invalid('请使用不含账号、查询参数或片段的 HTTPS API 地址。');
    next.baseUrl=url.href.replace(/\/$/,'');next.model=text(input.model,120).trim();
    if(!next.model)throw invalid('请填写模型名称。');
    if(input.apiKey!==undefined&&input.apiKey!==''){if(typeof input.apiKey!=='string'||input.apiKey.length<8||input.apiKey.length>4000||/[\r\n]/.test(input.apiKey))throw invalid('API 密钥格式不正确。');next.apiKey=input.apiKey.trim();}
    if(input.clearKey===true)next.apiKey='';
    next.dailyLimit=Math.max(1,Math.min(50,Number(input.dailyLimit)||3));next.enabled=input.enabled===true&&Boolean(next.apiKey&&next.model);
    if(input.enabled===true&&!next.apiKey)throw invalid('启用前请配置专用 API 密钥。');
    await store.transaction(tx=>tx.put('config','ai','',next));config=next;return configuration();
  }
  let closing=false;
  const controllers=new Set();
  const token=req=>/(?:^|;\s*)yizhi_member=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1]||'';
  const sessionId=req=>token(req)?digest(salt+token(req)):'';
  function validate(req,mutation){
    const port=typeof hostPort==='function'?hostPort():hostPort;
    const origins=[publicOrigin,...allowedOrigins,...(Number.isInteger(port)&&port>0?[`http://127.0.0.1:${port}`,`http://localhost:${port}`]:[])].filter(Boolean);
    if(!origins.some(origin=>new URL(origin).host===req.headers.host)||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&!origins.includes(req.headers.origin)||mutation&&!req.headers.origin)throw invalid('不允许跨站请求，请从本站页面操作。',403);
  }
  const secure=publicOrigin.startsWith('https://')||Boolean(process.env.VERCEL);
  const setCookie=(res,value,age=7*86400)=>res.setHeader('Set-Cookie',`yizhi_member=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`);
  async function session(tx,req,required=true,csrf=false){
    const entry=await tx.get('session',sessionId(req));
    let user=entry&&entry.expires>now()?await tx.get('user',entry.username):null;
    if(user&&entry.version!==user.password.hash)user=null;
    if(!user){if(required)throw invalid('请先登录账户。',401);return null;}
    if(csrf&&!equal(req.headers['x-member-token']||'',entry.csrf))throw invalid('登录验证已过期，请刷新后重试。',403);
    return {entry,user};
  }
  async function makeSession(tx,res,user){
    const previous=(await tx.list('session',user.username)).sort((a,b)=>b.expires-a.expires);
    for(const old of previous.slice(9))await tx.remove('session',old.id);
    const value=crypto.randomBytes(32).toString('hex'),id=digest(salt+value),entry={id,username:user.username,version:user.password.hash,csrf:crypto.randomBytes(32).toString('hex'),expires:now()+7*86400000};
    await tx.put('session',id,user.username,entry);setCookie(res,value);
    const daily=await tx.get('activity',user.username+':'+dayOf(now())),used=daily?.counts?.generate||0;
    return {authenticated:true,user:safeUser(user),csrf:entry.csrf,config:publicConfig(),usedToday:used,quota:quotaInfo(used)};
  }
  async function rate(req,kind,max=8,window=15*60000){
    const address=process.env.VERCEL?String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||clientAddress(req):clientAddress(req),key=digest(salt+kind+address);
    const allowed=await store.transaction(async tx=>{const current=await tx.get('limit',key);const record=current&&current.expires>now()?{...current,count:current.count+1}:{id:key,count:1,expires:now()+window};await tx.put('limit',key,'',record);return record.count<=max;});
    if(!allowed)throw invalid('操作较频繁，请稍后重试。',429);
  }
  async function event(tx,user,kind){
    if(!await tx.get('user',user.username))throw invalid('账户已注销，请重新登录。',401);
    const day=dayOf(now()),key=user.username+':'+day,entry=await tx.get('activity',key)||{owner:user.username,day,first:now(),last:now(),counts:{}};
    entry.last=now();entry.counts[kind]=(entry.counts[kind]||0)+1;await tx.put('activity',key,user.username,entry);
  }
  const resumeInfo=record=>({id:record.id,title:record.title,jobTitle:record.jobTitle,kind:record.kind,version:record.version,createdAt:record.createdAt,updatedAt:record.updatedAt});
  let nextCleanup=0;
  async function cleanup(){
    if(now()<nextCleanup)return;nextCleanup=now()+3600000;
    await store.transaction(async tx=>{
      for(const kind of ['session','limit','task'])for(const row of await tx.list(kind)){if((row.expires||0)<now())await tx.remove(kind,row.id||row.key||'');}
      for(const row of await tx.list('activity'))if(row.last<now()-90*86400000)await tx.remove('activity',row.owner+':'+row.day);
    });
  }
  // Only aggregate counts reach administrators. Drafts and account credentials do not.
  async function summary(params=new URLSearchParams()) {
    await refreshConfig();
    let days=Math.max(1,Math.min(90,Number(params.get('days'))||30)),end=now(),start=Date.parse(dayOf(end)+'T00:00:00+08:00')-(days-1)*86400000;
    if(params.has('from')||params.has('to')){
      const from=params.get('from'),to=params.get('to');if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||''))throw invalid('请选择有效日期范围。');
      start=Date.parse(from+'T00:00:00+08:00');end=Date.parse(to+'T00:00:00+08:00')+86400000-1;days=Math.ceil((end-start)/86400000);
      if(!Number.isFinite(start)||!Number.isFinite(end)||dayOf(start)!==from||dayOf(end)!==to||days<1||days>90)throw invalid('日期范围需为有效的 1～90 天。');
    }
    return store.transaction(async tx=>{
      const users=await tx.list('user'),drafts=await tx.list('resume'),activity=(await tx.list('activity')).filter(row=>row.last>=start&&row.first<=end),tasks=await tx.list('task');
      const active=new Set(activity.filter(row=>['save','generate','export','adopt'].some(kind=>row.counts[kind]>0)).map(row=>row.owner));
      const activated=new Set(activity.filter(row=>row.counts.generate>0||row.counts.export>0).map(row=>row.owner));
      const count=kind=>activity.reduce((n,row)=>n+(row.counts[kind]||0),0);
      const perAccount=new Map(users.map(user=>[user.username,0]));
      for(const draft of drafts)if(perAccount.has(draft.owner))perAccount.set(draft.owner,perAccount.get(draft.owner)+1);
      const quantities=[...perAccount.values()],accountsWithResumes=quantities.filter(n=>n>0).length;
      const workspace={limit:maxResumes,accountsWithResumes,multiResumeAccounts:quantities.filter(n=>n>1).length,baseResumes:drafts.filter(draft=>draft.kind!=='job').length,jobResumes:drafts.filter(draft=>draft.kind==='job').length,distribution:[{label:'未保存',accounts:quantities.filter(n=>n===0).length},{label:'1 份',accounts:quantities.filter(n=>n===1).length},{label:'2～3 份',accounts:quantities.filter(n=>n>=2&&n<=3).length},{label:'4 份及以上',accounts:quantities.filter(n=>n>=4).length}]};
      return {days,range:{from:dayOf(start),to:dayOf(end)},totalAccounts:users.length,newAccounts:users.filter(u=>u.createdAt>=start&&u.createdAt<=end).length,activeAccounts:active.size,completedAccounts:activated.size,cloudResumes:drafts.length,workspace,cloudSaves:count('save'),aiGenerations:count('generate'),adoptions:count('adopt'),exports:count('export'),generationFailures:count('generate_error'),pending:tasks.filter(task=>task.status==='pending'&&task.expires>now()).length,config:publicConfig(),notice:'账号数按当前注册账户去重，不等于真人数；活跃指保存、生成、采用或触发导出。仅汇总记录，不显示用户简历内容。'};
    });
  }
  // Registered account list for administrators: identifiers, timestamps and operation counts only.
  // Passwords, recovery hashes, sessions, resume text and photos never leave this function.
  async function accounts(params=new URLSearchParams()) {
    const query=(params.get('q')||'').trim().toLowerCase().slice(0,40);
    const all=params.get('all')==='1';
    const size=all?1000:Math.max(5,Math.min(100,Number(params.get('size'))||20));
    const page=Math.max(1,Number(params.get('page'))||1);
    const sort=['recent','created','resumes'].includes(params.get('sort'))?params.get('sort'):'recent';
    const rows=await store.transaction(async tx=>{
      const users=await tx.list('user'),drafts=await tx.list('resume'),activity=await tx.list('activity');
      const stats=new Map();
      const statistic=owner=>{let entry=stats.get(owner);if(!entry){entry={first:0,last:0,saves:0,exports:0,generates:0,logins:0};stats.set(owner,entry);}return entry;};
      for(const row of activity){
        const entry=statistic(row.owner),counts=row.counts||{};
        entry.last=Math.max(entry.last,Number(row.last)||0);
        entry.first=entry.first?Math.min(entry.first,Number(row.first)||entry.first):(Number(row.first)||0);
        entry.saves+=counts.save||0;entry.exports+=counts.export||0;entry.generates+=counts.generate||0;entry.logins+=counts.login||0;
      }
      const counts=new Map();
      for(const draft of drafts)counts.set(draft.owner,(counts.get(draft.owner)||0)+1);
      return users.map(user=>{
        const entry=stats.get(user.username)||{first:0,last:0,saves:0,exports:0,generates:0,logins:0};
        return {username:user.username,nickname:user.nickname||user.username,createdAt:user.createdAt||0,lastLoginAt:user.lastLoginAt||0,lastActiveAt:Math.max(entry.last,user.lastLoginAt||0),resumeCount:counts.get(user.username)||0,cloudSaves:entry.saves,exports:entry.exports,aiGenerations:entry.generates,logins:entry.logins};
      });
    });
    const matched=query?rows.filter(row=>row.username.toLowerCase().includes(query)||String(row.nickname).toLowerCase().includes(query)):rows;
    const order={recent:(a,b)=>b.lastActiveAt-a.lastActiveAt||b.createdAt-a.createdAt,created:(a,b)=>b.createdAt-a.createdAt,resumes:(a,b)=>b.resumeCount-a.resumeCount||b.createdAt-a.createdAt}[sort];
    const sorted=[...matched].sort(order);
    const pages=all?1:Math.max(1,Math.ceil(sorted.length/size));
    const current=all?1:Math.min(page,pages);
    // Registration overview: totals plus a per-day series across the selected window.
    const days=Math.max(7,Math.min(90,Number(params.get('days'))||30));
    const dayStart=value=>Date.parse(dayOf(value)+'T00:00:00+08:00');
    const current0=now();
    const series=[];
    for(let index=days-1;index>=0;index-=1)series.push({date:dayOf(current0-index*86400000),count:0});
    const buckets=new Map(series.map(item=>[item.date,item]));
    for(const row of rows){const bucket=buckets.get(dayOf(row.createdAt||0));if(bucket)bucket.count+=1;}
    const since=dayOffset=>dayStart(current0-dayOffset*86400000);
    const registration={
      days,
      total:rows.length,
      today:buckets.get(dayOf(current0))?.count||0,
      last7:rows.filter(row=>(row.createdAt||0)>=since(6)).length,
      last30:rows.filter(row=>(row.createdAt||0)>=since(29)).length,
      withResumes:rows.filter(row=>row.resumeCount>0).length,
      active7:rows.filter(row=>row.lastActiveAt>=current0-7*86400000).length,
      windowTotal:series.reduce((total,item)=>total+item.count,0),
      peak:series.reduce((total,item)=>Math.max(total,item.count),0),
      series
    };
    return {total:rows.length,matched:sorted.length,page:current,pages,size,sort,query,registration,accounts:all?sorted:sorted.slice((current-1)*size,current*size),notice:'仅显示账户标识、时间和操作次数；不展示简历正文、照片、密码或恢复码。'};
  }
  async function handle(req,res,url){
    const route=url.pathname;if(!route.startsWith('/api/member/'))return false;
    try{
      validate(req,!['GET','HEAD'].includes(req.method));await cleanup();await refreshConfig();
      if(route==='/api/member/status'&&req.method==='GET'){
        const current=await store.transaction(tx=>session(tx,req,false));
        const count=current?await store.transaction(async tx=>{const row=await tx.get('activity',current.user.username+':'+dayOf(now()));return row?.counts?.generate||0;}):0;
        json(res,200,current?{authenticated:true,user:safeUser(current.user),csrf:current.entry.csrf,config:publicConfig(),usedToday:count,quota:quotaInfo(count)}:{authenticated:false,config:publicConfig()});return true;
      }
      if(['/api/member/register','/api/member/login','/api/member/recover'].includes(route)&&req.method==='POST'){
        await rate(req,route,route.endsWith('register')?5:8);
        const input=await readBody(req,8192),name=username(input.username);
        if(route.endsWith('register')){
          if(input.acceptPrivacy!==true)throw invalid('请阅读并同意隐私说明后注册。');
          const passwordHash=await password(input.password),recoveryCode='YZ-'+crypto.randomBytes(24).toString('hex').toUpperCase();
          const result=await store.transaction(async tx=>{
            if(await tx.get('user',name))throw invalid('这个用户名已被使用，请换一个。',409);
            const user={id:crypto.randomUUID(),username:name,nickname:text(input.nickname,40)||name,password:passwordHash,recoveryHash:digest(recoveryCode),createdAt:now(),lastLoginAt:now()};
            await tx.put('user',name,name,user);await event(tx,user,'register');
            return {...await makeSession(tx,res,user),recoveryCode};
          });json(res,201,result);return true;
        }
        const user=await store.transaction(tx=>tx.get('user',name));
        if(route.endsWith('recover')){
          if(!user||typeof input.recoveryCode!=='string'||!equal(digest(input.recoveryCode.trim().toUpperCase()),user.recoveryHash))throw invalid('用户名或恢复码不正确。',401);
          const passwordHash=await password(input.password),recoveryCode='YZ-'+crypto.randomBytes(24).toString('hex').toUpperCase();
          await store.transaction(async tx=>{
            const current=await tx.get('user',name);if(!current||!equal(current.recoveryHash,user.recoveryHash))throw invalid('恢复码已失效，请重新操作。',409);
            current.password=passwordHash;current.recoveryHash=digest(recoveryCode);await tx.put('user',name,name,current);
            for(const entry of await tx.list('session',name))await tx.remove('session',entry.id);
          });setCookie(res,'',0);json(res,200,{ok:true,recoveryCode});return true;
        }
        if(!await matches(input.password,user))throw invalid('用户名或密码不正确。',401);
        const result=await store.transaction(async tx=>{
          const current=await tx.get('user',name);if(!current||!equal(current.password.hash,user.password.hash))throw invalid('账户已变更，请重新登录。',401);
          current.lastLoginAt=now();await tx.put('user',name,name,current);await event(tx,current,'login');return makeSession(tx,res,current);
        });json(res,200,result);return true;
      }
      if(route==='/api/member/basic'&&req.method==='POST'){
        await rate(req,'basic',20,60000);const input=await readBody(req);
        const jd=text(input.jd,12000),jobTitle=text(input.jobTitle,80).trim();if(jd.trim().length<20||!jobTitle)throw invalid('请填写岗位名称和至少 20 字的岗位要求。');
        json(res,200,basicJobVersion(normalizeResume(input.resume),jd,jobTitle));return true;
      }
      const current=await store.transaction(tx=>session(tx,req,true,!['GET','HEAD'].includes(req.method)));
      const name=current.user.username;
      if(route==='/api/member/logout'&&req.method==='POST'){
        await store.transaction(tx=>tx.remove('session',sessionId(req)));setCookie(res,'',0);json(res,200,{ok:true});return true;
      }
      if(route==='/api/member/export'&&req.method==='GET'){
        const resumes=await store.transaction(tx=>tx.list('resume',name));json(res,200,{version:1,user:safeUser(current.user),resumes,exportedAt:now()});return true;
      }
      if(route==='/api/member/activity'&&req.method==='POST'){
        await rate(req,'activity',60,60000);const input=await readBody(req,2048);if(!['export','adopt'].includes(input.type))throw invalid('未知操作。');
        await store.transaction(tx=>event(tx,current.user,input.type));json(res,200,{ok:true});return true;
      }
      if(['/api/member/password','/api/member/recovery','/api/member/account'].includes(route)&&['POST','DELETE'].includes(req.method)){
        await rate(req,'security',8);const input=await readBody(req,8192);
        if(!await matches(input.currentPassword,current.user))throw invalid('当前密码不正确。',403);
        if(route.endsWith('recovery')&&req.method==='POST'){
          const recoveryCode='YZ-'+crypto.randomBytes(24).toString('hex').toUpperCase();
          await store.transaction(async tx=>{const {user}=await session(tx,req,true,true);user.recoveryHash=digest(recoveryCode);await tx.put('user',name,name,user);});
          json(res,200,{ok:true,recoveryCode});return true;
        }
        if(route.endsWith('password')&&req.method==='POST'){
          const passwordHash=await password(input.password);
          await store.transaction(async tx=>{const {user}=await session(tx,req,true,true);user.password=passwordHash;await tx.put('user',name,name,user);for(const entry of await tx.list('session',name))await tx.remove('session',entry.id);});
          setCookie(res,'',0);json(res,200,{ok:true});return true;
        }
        if(route.endsWith('account')&&req.method==='DELETE'){
          if(input.confirm!==name)throw invalid('请填写用户名确认注销。');
          await store.transaction(async tx=>{await session(tx,req,true,true);for(const kind of ['resume','session','task','activity'])for(const row of await tx.list(kind,name))await tx.remove(kind,row.id||row.key||row.owner+':'+row.day);await tx.remove('user',name);});
          setCookie(res,'',0);json(res,200,{ok:true});return true;
        }
      }
      if(route==='/api/member/resumes'&&req.method==='GET'){
        const items=await store.transaction(tx=>tx.list('resume',name));json(res,200,{resumes:items.sort((a,b)=>b.updatedAt-a.updatedAt).map(resumeInfo),limit:maxResumes});return true;
      }
      if(route==='/api/member/resumes'&&req.method==='POST'){
        await rate(req,'save',60,60000);const input=await readBody(req),resume=normalizeResume(input.resume);
        const item=await store.transaction(async tx=>{
          if((await tx.list('resume',name)).length>=maxResumes)throw invalid(`目前可免费保存 ${maxResumes} 份简历，请先导出或删除不需要的版本。`,409);
          const record={id:crypto.randomUUID(),owner:name,title:text(input.title,80).trim()||'我的简历',jobTitle:text(input.jobTitle,80),kind:input.kind==='job'?'job':'base',version:1,createdAt:now(),updatedAt:now(),resume};await tx.put('resume',record.id,name,record);await event(tx,current.user,'save');return record;
        });json(res,201,item);return true;
      }
      const match=/^\/api\/member\/resumes\/([a-f0-9-]{36})$/.exec(route);
      if(match&&['GET','PUT','DELETE'].includes(req.method)){
        if(req.method!=='GET')await rate(req,'save',60,60000);
        const input=req.method==='GET'?{}:await readBody(req),resume=req.method==='PUT'?normalizeResume(input.resume):null;
        const result=await store.transaction(async tx=>{
          const record=await tx.get('resume',match[1]);if(!record||record.owner!==name)throw invalid('这份简历不存在或不属于当前账户。',404);
          if(req.method==='GET')return record;
          if(input.version!==record.version)throw invalid('这份简历已在其他设备更新。请另存为新版本，或重新打开云端版本。',409);
          if(req.method==='DELETE'){await tx.remove('resume',record.id);return {ok:true};}
          record.resume=resume;record.version+=1;record.updatedAt=now();if(input.title!==undefined)record.title=text(input.title,80).trim()||record.title;await tx.put('resume',record.id,name,record);await event(tx,current.user,'save');return record;
        });json(res,200,result);return true;
      }
      if(route==='/api/member/tailor'&&req.method==='POST'){
        if(!hostedAi)throw invalid('站点托管 AI 已停用，请刷新页面并连接你自己的 API Key。基础整理继续免费。',410);
        await rate(req,'generate',8,60000);if(!config.enabled)throw invalid('AI 按岗位生成尚未连接，可先使用基础整理。',503);
        const input=await readBody(req),resume=normalizeResume(input.resume),jd=text(input.jd,12000),jobTitle=text(input.jobTitle,80).trim();
        if(input.consent!==true)throw invalid('请确认将经历与 JD 发送给 AI 服务分析。');
        if(jd.trim().length<20||!jobTitle)throw invalid('请填写岗位名称和至少 20 字的岗位要求。');
        if(!/^[a-f0-9-]{36}$/.test(input.requestId||''))throw invalid('生成请求标识无效。');
        const key=name+':'+input.requestId,inputHash=digest(JSON.stringify({resume,jd,jobTitle}));
        const task=await store.transaction(async tx=>{
          const user=await tx.get('user',name);if(!user)throw invalid('请重新登录。',401);
          let previous=await tx.get('task',key);
          if(previous&&previous.expires<=now()){await tx.remove('task',key);previous=null;}
          if(previous&&previous.inputHash!==inputHash)throw invalid('请求内容已改变，请重新发起生成。',409);
          if(previous?.status==='complete')return previous;
          const pending=(await tx.list('task')).filter(t=>t.status==='pending'&&t.expires>now());
          if(pending.some(t=>t.owner===name))throw invalid('已有一份简历正在生成，请等待完成。',409);
          if(pending.length>=4)throw invalid('生成服务正忙，请稍后重试。',429);
          const daily=await tx.get('activity',name+':'+dayOf(now())),used=daily?.counts?.generate||0;if(used>=config.dailyLimit)throw Object.assign(invalid(`今天的 ${config.dailyLimit} 次免费 AI 生成已用完，明天 00:00（北京时间）恢复。基础整理和手动编辑仍可使用。`,429),{code:'AI_DAILY_LIMIT',quota:quotaInfo(used)});
          const row={id:key,owner:name,status:'pending',inputHash,expires:now()+90000};await tx.put('task',key,name,row);return row;
        });
        if(task.status==='complete'){json(res,200,task.result);return true;}
        const controller=new AbortController();controllers.add(controller);const onClose=()=>{if(!res.writableEnded)controller.abort();};res.on('close',onClose);
        try{
          const result=await generateJobVersion({resume,jd,jobTitle,config,fetchImpl,signal:controller.signal});
          if(controller.signal.aborted||closing)throw invalid('生成已取消。',499);
          await store.transaction(async tx=>{if(!await tx.get('user',name))throw invalid('账户已注销，生成结果不再保存。',401);await tx.put('task',key,name,{...task,status:'complete',expires:now()+86400000,result});await event(tx,current.user,'generate');});
          json(res,200,result);
        }catch(error){await store.transaction(async tx=>{if(await tx.get('user',name)){await tx.put('task',key,name,{...task,status:'failed',expires:now()+3600000});await event(tx,current.user,'generate_error');}});throw error;}
        finally{controllers.delete(controller);res.off('close',onClose);}
        return true;
      }
      throw invalid('未找到此账户接口。',404);
    }catch(error){if(!res.headersSent&&!res.destroyed)json(res,error.status||503,{error:error.status?error.message:'账户服务暂时不可用，请稍后重试。',...(error.code==='AI_DAILY_LIMIT'?{code:error.code,quota:error.quota}: {})});return true;}
  }
    return {handle,summary,accounts,configuration,updateConfiguration,close:async()=>{closing=true;for(const controller of controllers)controller.abort();await store.close();},config:publicConfig};
}
