import {createResumeServer} from '../serve.mjs';
import {maintenanceResponse,needsMaintenance} from '../maintenance.mjs';
process.env.PUBLIC_MODE='1';
let serverPromise;
export default async function handler(req,res){
  try{
    const maintenance=maintenanceResponse(new URL(req.url,'https://localhost').pathname,needsMaintenance(req));
    if(maintenance){res.writeHead(maintenance.status,maintenance.headers).end(req.method==='HEAD'?undefined:maintenance.body);return;}
    if(!process.env.DATABASE_URL||!process.env.PORTRAIT_REQUEST_SECRET)throw Error('Missing deployment configuration');
    serverPromise??=createResumeServer().catch(error=>{serverPromise=null;throw error;});
    const server=await serverPromise;
    await server.listeners('request')[0](req,res);
  }catch{
    if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify({error:'网站服务暂时不可用，请稍后重试。'}));
    else if(!res.writableEnded)res.end();
  }
}
