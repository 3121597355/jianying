import {Pool} from 'pg';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ACTIONS,catalog,defaults,normalizeSettings,dayOf,period,buildSummary,renderHomepageDocument} from './admin.mjs';
import {normalizeChangelog} from './changelog.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const revision=value=>hash(JSON.stringify(canonical(value)));
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const scrypt=promisify(crypto.scrypt),routes=new Set(['/','/resume/','/portrait/']);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));};
async function body(req,max=32768){if(!req.headers['content-type']?.startsWith('application/json'))throw fail('请使用 JSON 请求。',415);let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw fail('提交的内容过大。',413);chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw fail('提交的数据无法读取。');}}
async function password(value){if(typeof value!=='string'||value.length<10||value.length>128)throw fail('密码需要为 10～128 个字符。');const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:(await scrypt(value,salt,64)).toString('hex')};}
async function matches(value,admin){return Boolean(admin&&typeof value==='string'&&value.length<=128&&equal((await scrypt(value,admin.salt,64)).toString('hex'),admin.hash));}

export async function createCloudAdministration({root,databaseUrl=process.env.DATABASE_URL,setupCode=process.env.ADMIN_SETUP_CODE,schema='public',hostPort,publicOrigin=process.env.PUBLIC_ORIGIN||'',allowedOrigins=[]}){
  if(!databaseUrl||!setupCode)throw new Error('Cloud database and administrator setup code are required.');
  if(!/^[a-z][a-z0-9_]{0,39}$/.test(schema))throw new Error('Invalid database schema.');
  const connection=new URL(databaseUrl);connection.searchParams.set('sslmode','verify-full');
  const pool=new Pool({connectionString:connection.href,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:20000,allowExitOnIdle:true});
  // Identifiers are strictly validated above. User values always use SQL parameters.
  const table=name=>`"${schema}"."jy_${name}"`,q=(sql,values=[])=>pool.query(sql,values);
  let ready=false;try{ready=(await q(`SELECT data FROM ${table('state')} WHERE key='_schema'`)).rows[0]?.data.version===1;}catch(error){if(!['42P01','3F000'].includes(error.code))throw error;}
  if(!ready){
    const client=await pool.connect();let initializationError;
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['jianying:'+schema]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}";
        CREATE TABLE IF NOT EXISTS ${table('state')} (key text PRIMARY KEY,data jsonb NOT NULL);
        CREATE TABLE IF NOT EXISTS ${table('events')} (id bigserial PRIMARY KEY,time bigint NOT NULL,data jsonb NOT NULL);
        CREATE TABLE IF NOT EXISTS ${table('visits')} (id text PRIMARY KEY,seq bigint NOT NULL,path text NOT NULL,started bigint NOT NULL,updated bigint NOT NULL,visible bigint NOT NULL,data jsonb NOT NULL);
        CREATE TABLE IF NOT EXISTS ${table('sessions')} (id text PRIMARY KEY,expires bigint NOT NULL,data jsonb NOT NULL);
        CREATE TABLE IF NOT EXISTS ${table('limits')} (id text PRIMARY KEY,count integer NOT NULL,expires bigint NOT NULL);
        CREATE INDEX IF NOT EXISTS jy_events_time ON ${table('events')} (time);
        CREATE INDEX IF NOT EXISTS jy_visits_updated ON ${table('visits')} (updated);`);
      const seed=JSON.parse(await readFile(path.join(root,'changelog-seed.json'),'utf8'));
      const initial=[['settings',defaults()],['changelog',seed],['salt',{value:crypto.randomBytes(32).toString('hex')}],['auth',{admin:null,setupHash:hash(setupCode.trim().toUpperCase()),keys:[]}],['_schema',{version:1}]];
      await client.query(`INSERT INTO ${table('state')} (key,data) VALUES ${initial.map((_,i)=>`($${i*2+1},$${i*2+2})`).join(',')} ON CONFLICT(key) DO NOTHING`,initial.flatMap(([key,data])=>[key,JSON.stringify(data)]));
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');initializationError=error;}finally{client.release();}
    if(initializationError){await pool.end();throw initializationError;}
  }
  const state=async key=>(await q(`SELECT data FROM ${table('state')} WHERE key=$1`,[key])).rows[0].data;
  const salt=(await state('salt')).value;
  async function mutate(key,operation){const client=await pool.connect();try{await client.query('BEGIN');const current=(await client.query(`SELECT data FROM ${table('state')} WHERE key=$1 FOR UPDATE`,[key])).rows[0].data;const result=await operation(current,client);await client.query(`UPDATE ${table('state')} SET data=$2 WHERE key=$1`,[key,JSON.stringify(current)]);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
  const entryId=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(value)?hash(salt+value).slice(0,24):'';
  const sessionKey=req=>{const token=/(?:^|;\s*)jianying_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];return token?hash('session'+salt+token):'';};
  async function session(req){const id=sessionKey(req);if(!id)return null;return (await q(`SELECT data FROM ${table('sessions')} WHERE id=$1 AND expires>$2`,[id,Date.now()])).rows[0]?.data||null;}
  async function requireSession(req){const current=await session(req);if(!current)throw fail('请先登录管理员账户。',401);return current;}
  async function requireCsrf(req){const current=await requireSession(req);if(!equal(req.headers['x-editor-token']||'',current.csrf))throw fail('操作验证已过期，请刷新管理页。',403);return current;}
  const status=entry=>({authenticated:true,username:entry.username,csrf:entry.csrf,setupRequired:false});
  async function makeSession(req,res,admin,client=pool){const token=crypto.randomBytes(32).toString('hex'),entry={username:admin.username,csrf:crypto.randomBytes(32).toString('hex'),expires:Date.now()+12*3600000};await client.query(`INSERT INTO ${table('sessions')} (id,expires,data) VALUES ($1,$2,$3)`,[hash('session'+salt+token),entry.expires,JSON.stringify(entry)]);res.setHeader('Set-Cookie',`jianying_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${publicOrigin.startsWith('https://')||process.env.VERCEL?'; Secure':''}`);return status(entry);}
  function validate(req){const port=typeof hostPort==='function'?hostPort():hostPort,localOrigins=Number.isInteger(port)&&port>0?[`http://127.0.0.1:${port}`,`http://localhost:${port}`]:[],origins=[...localOrigins,publicOrigin,...allowedOrigins].filter(Boolean);if(!origins.some(origin=>new URL(origin).host===req.headers.host)||req.headers.origin&&!origins.includes(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site')throw fail('不允许跨站请求。',403);}
  async function budget(req,kind='analytics',max=120,window=60000){const address=process.env.VERCEL?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():req.socket.remoteAddress||'local';const id=hash(salt+kind+address),now=Date.now();const result=await q(`INSERT INTO ${table('limits')} (id,count,expires) VALUES ($1,1,$2) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN ${table('limits')}.expires<$3 THEN 1 ELSE ${table('limits')}.count+1 END,expires=CASE WHEN ${table('limits')}.expires<$3 THEN $2 ELSE ${table('limits')}.expires END RETURNING count`,[id,now+window,now]);if(result.rows[0].count>max)throw fail(kind==='login'?'尝试次数较多，请 15 分钟后再试。':'操作较频繁，请稍后再试。',429);}
  async function record(req,input){const settings=await state('settings');if(!settings.analytics.enabled||await session(req))return;if(!Object.hasOwn(ACTIONS,input.type)||!routes.has(input.path))throw fail('未知的统计事件。');await budget(req);const now=Date.now(),day=dayOf(now);let source='直接访问';if(typeof input.referrer==='string'&&input.referrer.length<=300)try{const address=new URL(input.referrer);if(['http:','https:'].includes(address.protocol)&&address.host!==req.headers.host)source=address.hostname.slice(0,100);}catch{}
    const event={time:now,day,type:input.type,path:input.path,visitor:entryId(input.visitor)?hash(salt+day+input.visitor).slice(0,24):'',source,device:['desktop','mobile','tablet'].includes(input.device)?input.device:'desktop',templateId:catalog.some(t=>t.id===Number(input.templateId))?Number(input.templateId):null};const visitId=entryId(input.visitId);if(visitId)event.visitId=visitId;await q(`INSERT INTO ${table('events')} (time,data) VALUES ($1,$2)`,[now,JSON.stringify(event)]);
  }
  async function recordVisit(req,input){const settings=await state('settings');if(!settings.analytics.enabled||await session(req))return;const id=entryId(input.visitId);if(!id||!routes.has(input.path)||!Number.isSafeInteger(input.seq)||input.seq<1||input.seq>1000000||!Number.isSafeInteger(input.visibleMs)||input.visibleMs<0||input.visibleMs>86400000||!['checkpoint','hidden','end'].includes(input.reason)||input.nextPath&&!routes.has(input.nextPath))throw fail('停留统计参数不正确。');await budget(req);const now=Date.now(),data={visitor:entryId(input.visitor)?hash(salt+dayOf(now)+input.visitor).slice(0,24):'',reason:input.reason,nextPath:input.nextPath||''};
    await q(`INSERT INTO ${table('visits')} AS v (id,seq,path,started,updated,visible,data) VALUES ($1,$2,$3,$4,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET seq=EXCLUDED.seq,updated=EXCLUDED.updated,visible=GREATEST(v.visible,LEAST($7,EXCLUDED.updated-v.started+15000)),data=jsonb_set(EXCLUDED.data,'{visitor}',v.data->'visitor') WHERE EXCLUDED.seq>v.seq AND EXCLUDED.path=v.path`,[id,input.seq,input.path,now,Math.min(input.visibleMs,15000),JSON.stringify(data),input.visibleMs]);
  }
  async function summary(params){const cutoff=Date.now()-90*86400000;const [settings,events,visits]=await Promise.all([state('settings'),q(`SELECT data FROM ${table('events')} WHERE time>=$1 ORDER BY time DESC,id DESC LIMIT 100000`,[cutoff]),q(`SELECT * FROM ${table('visits')} WHERE updated>=$1 ORDER BY updated DESC LIMIT 100000`,[cutoff])]);return buildSummary({settings,events:events.rows.reverse().map(e=>e.data),visits:visits.rows.map(v=>({id:v.id,path:v.path,seq:Number(v.seq),startedAt:Number(v.started),updatedAt:Number(v.updated),visibleMs:Number(v.visible),...v.data})),range:period(params)});}
  const logsResult=entries=>({entries:[...entries].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)),revision:revision(entries)});
  function csv(res,name,rows){const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store'}).end('\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n'));}
  let nextCleanup=0;
  async function cleanup(){if(Date.now()<nextCleanup)return;nextCleanup=Date.now()+3600000;const cutoff=Date.now()-90*86400000;await q(`DELETE FROM ${table('events')} WHERE time<$1 OR id IN (SELECT id FROM ${table('events')} ORDER BY time DESC,id DESC OFFSET 100000)`,[cutoff]);await q(`DELETE FROM ${table('visits')} WHERE updated<$1 OR id IN (SELECT id FROM ${table('visits')} ORDER BY updated DESC OFFSET 100000)`,[cutoff]);await q(`DELETE FROM ${table('sessions')} WHERE expires<$1`,[Date.now()]);await q(`DELETE FROM ${table('limits')} WHERE expires<$1`,[Date.now()]);}
  async function handle(req,res,url){
    if(!['/api/site-config','/api/analytics/event','/api/analytics/visit','/api/analytics/summary'].includes(url.pathname)&&!url.pathname.startsWith('/api/auth/')&&!url.pathname.startsWith('/api/admin/'))return false;
    try{validate(req);await cleanup();const route=url.pathname;
      if(route==='/api/site-config'&&req.method==='GET'){json(res,200,await state('settings'));return true;}
      if(route==='/api/analytics/event'&&req.method==='POST'){await record(req,await body(req,2048));res.writeHead(204,{'Cache-Control':'no-store'}).end();return true;}
      if(route==='/api/analytics/visit'&&req.method==='POST'){await recordVisit(req,await body(req,2048));res.writeHead(204,{'Cache-Control':'no-store'}).end();return true;}
      if(route==='/api/auth/status'&&req.method==='GET'){const current=await session(req);json(res,200,current?status(current):{authenticated:false,setupRequired:!(await state('auth')).admin,setupSource:'environment'});return true;}
      if(['/api/auth/setup','/api/auth/login'].includes(route)&&req.method==='POST'){
        await budget(req,'login',8,15*60000);const input=await body(req,8192);const result=await mutate('auth',async(auth,client)=>{
          if(route.endsWith('/setup')){if(auth.admin)throw fail('管理员账户已经创建，请登录。',409);if(typeof input.code!=='string'||!equal(hash(input.code.trim().toUpperCase()),auth.setupHash))throw fail('首次设置码不正确。',403);if(typeof input.username!=='string'||!/^[a-zA-Z0-9_.-]{3,40}$/.test(input.username))throw fail('账户名需要为 3～40 位字母、数字、点、横线或下划线。');auth.admin={username:input.username,...await password(input.password),createdAt:new Date().toISOString()};auth.setupHash='';}
          else if(!await matches(input.password,auth.admin)||input.username!==auth.admin.username)throw fail('账户或密码不正确。',401);
          return makeSession(req,res,auth.admin,client);
        });json(res,200,result);return true;
      }
      if(route==='/api/analytics/summary'&&req.method==='GET'){const token=/^Bearer (jy_[a-f0-9]{64})$/.exec(req.headers.authorization||'')?.[1];await mutate('auth',auth=>{const key=auth.keys.find(k=>token&&equal(k.hash,hash(token)));if(!key)throw fail('统计接口密钥无效或已撤销。',401);key.lastUsedAt=new Date().toISOString();});json(res,200,await summary(url.searchParams));return true;}
      const current=await requireSession(req);if(!['GET','HEAD'].includes(req.method))await requireCsrf(req);
      if(route==='/api/auth/logout'&&req.method==='POST'){await q(`DELETE FROM ${table('sessions')} WHERE id=$1`,[sessionKey(req)]);res.setHeader('Set-Cookie','jianying_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(publicOrigin.startsWith('https://')||process.env.VERCEL?'; Secure':''));json(res,200,{ok:true});return true;}
      if(route==='/api/auth/password'&&req.method==='POST'){await budget(req,'login',8,15*60000);const input=await body(req,8192);await mutate('auth',async(auth,client)=>{if(!await matches(input.currentPassword,auth.admin))throw fail('当前密码不正确。',403);Object.assign(auth.admin,await password(input.password),{changedAt:new Date().toISOString()});await client.query(`DELETE FROM ${table('sessions')} WHERE id<>$1`,[sessionKey(req)]);});json(res,200,{ok:true});return true;}
      if(route==='/api/admin/summary'&&req.method==='GET'){json(res,200,await summary(url.searchParams));return true;}
      if(route==='/api/admin/settings'&&req.method==='GET'){const settings=await state('settings');json(res,200,{settings,revision:revision(settings)});return true;}
      if(route==='/api/admin/settings'&&req.method==='PUT'){const input=await body(req);const result=await mutate('settings',settings=>{if(input.revision!==revision(settings))throw fail('设置已在其他窗口更新。请刷新后重新编辑。',409);const next=normalizeSettings(input.settings);for(const key of Object.keys(settings))delete settings[key];Object.assign(settings,next);return {settings,revision:revision(settings)};});json(res,200,result);return true;}
      if(route==='/api/admin/changelog'&&req.method==='GET'){json(res,200,logsResult(await state('changelog')));return true;}
      if(route==='/api/admin/changelog'&&req.method==='POST'||/^\/api\/admin\/changelog\/[a-f0-9-]{36}$/.test(route)&&['PUT','DELETE'].includes(req.method)){
        const input=await body(req),id=route.split('/').at(-1);const result=await mutate('changelog',entries=>{if(input.revision!==revision(entries))throw fail('更新日志已在其他窗口修改。请刷新后重试。',409);
          if(req.method==='POST'){if(entries.length>=100)throw fail('最多保存 100 条更新日志。');const now=new Date().toISOString();entries.push({...normalizeChangelog(input.entry),id:crypto.randomUUID(),createdAt:now,updatedAt:now});}
          else{const index=entries.findIndex(e=>e.id===id);if(index<0)throw fail('此更新日志已不存在，请刷新。',404);if(req.method==='DELETE')entries.splice(index,1);else entries[index]={...normalizeChangelog(input.entry),id,createdAt:entries[index].createdAt,updatedAt:new Date().toISOString()};}return logsResult(entries);
        });json(res,req.method==='POST'?201:200,result);return true;
      }
      if(route==='/api/admin/keys'&&req.method==='GET'){json(res,200,{keys:(await state('auth')).keys.map(({hash,...key})=>key)});return true;}
      if(route==='/api/admin/keys'&&req.method==='POST'){const {name}=await body(req,8192);const result=await mutate('auth',auth=>{if(auth.keys.length>=5)throw fail('最多保存 5 个接口密钥。');if(typeof name!=='string'||!name.trim()||name.length>80)throw fail('请填写 80 字以内的密钥名称。');const token='jy_'+crypto.randomBytes(32).toString('hex'),key={id:crypto.randomUUID(),name:name.trim(),prefix:token.slice(0,11),scope:'analytics:read',createdAt:new Date().toISOString(),lastUsedAt:null};auth.keys.push({...key,hash:hash(token)});return {key,token};});json(res,201,result);return true;}
      if(/^\/api\/admin\/keys\/[a-f0-9-]{36}$/.test(route)&&req.method==='DELETE'){await mutate('auth',auth=>{auth.keys=auth.keys.filter(k=>k.id!==route.split('/').at(-1));});json(res,200,{ok:true});return true;}
      if(route==='/api/admin/backup'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="jianying-site-settings.json"','Cache-Control':'no-store'}).end(JSON.stringify({version:1,settings:await state('settings')},null,2));return true;}
      if(route==='/api/admin/export'&&req.method==='GET'){const result=await summary(url.searchParams);csv(res,'jianying-analytics.csv',[['日期','页面访问','功能操作'],...result.series.map(e=>[e.date,e.views,e.actions])]);return true;}
      if(route==='/api/admin/engagement/export'&&req.method==='GET'){const result=(await summary(url.searchParams)).engagement;csv(res,'jianying-engagement.csv',[['按页面统计','可测访问','结束页面','平均可见秒数','中位秒数','退出会话','未完成短停留','任务完成后退出'],...result.pages.map(p=>[p.name,p.visits,p.completedPages,p.averageMs===null?'':p.averageMs/1000,p.medianMs===null?'':p.medianMs/1000,p.exits,p.quickUnfinished,p.successfulExits]),[],['小时（UTC+8）','进入会话','退出会话','该时段进入且已结束','该时段未完成短停留'],...result.hours.map(h=>[h.hour,h.entries,h.exits,h.completedEntries,h.quickUnfinished])]);return true;}
      throw fail('未找到此管理接口。',404);
    }catch(error){json(res,error.status||503,{error:error.status?error.message:'后台服务暂时不可用，请稍后重试。'});return true;}
  }
  return {handle,summary,record,renderHomepage:async html=>renderHomepageDocument(html,await state('settings')),checkPortraitRate:req=>budget(req,'portrait',12),close:()=>pool.end()};
}
