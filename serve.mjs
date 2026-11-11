// 简历与证件照共用一个本机服务：node serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './portrait/server.mjs';
import { createAdministration } from './admin.mjs';

const ROOT = process.env.VERCEL ? process.cwd() : import.meta.dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

export async function createResumeServer({ portraitOptions = {}, adminOptions = {} } = {}) {
  let server;
  const cloud=adminOptions.cloud===true||Boolean(process.env.VERCEL);
  const allowedOrigins=process.env.VERCEL?[process.env.VERCEL_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host=>'https://'+host):[];
  const administration=cloud?await (await import('./cloud-administration.mjs')).createCloudAdministration({root:ROOT,allowedOrigins,...adminOptions,hostPort:()=>server?.address()?.port}):createAdministration({root:ROOT,...adminOptions,hostPort:()=>server?.address()?.port});
  const portrait = await createApp({
    ...portraitOptions,
    configPath: portraitOptions.configPath || path.join(ROOT, 'private', 'portrait-config.json'),
    basePath: '/portrait', hostPort: () => server?.address()?.port,
    ...(cloud?{publicMode:true,allowedOrigins,requestToken:process.env.PORTRAIT_REQUEST_SECRET,checkRate:administration.checkPortraitRate}:{}),
  });
  const handlePortrait = portrait.listeners('request')[0];
  server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      if(await administration.handle(req,res,new URL(req.url,'http://127.0.0.1')))return;
      if(pathname==='/admin') {res.writeHead(308,{Location:'/admin.html','Cache-Control':'no-store'}).end();return;}
      if (pathname === '/portrait') {
        if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }).end(); return; }
        res.writeHead(308, { Location: '/portrait/', 'Cache-Control': 'no-store' }).end(); return;
      }
      if (pathname.startsWith('/portrait/')) { await handlePortrait(req, res); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      const iconFallback = ({ '/favicon.ico':'favicon.ico', '/apple-touch-icon.png':'apple-touch-icon.png', '/apple-touch-icon-precomposed.png':'apple-touch-icon.png' })[pathname];
      if (iconFallback) {
        const icon = await fs.readFile(path.join(ROOT,'assets','img','brand',iconFallback));
        res.writeHead(200, { 'Content-Type': MIME[path.extname(iconFallback)], 'Cache-Control':'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : icon); return;
      }
      // 仅开放页面和静态资源，私有配置、模型、依赖与服务代码均不通过 HTTP 暴露。
      if (pathname === '/resume') {
        res.writeHead(308, { Location: '/resume/', 'Cache-Control': 'no-store' }).end(); return;
      }
      const page = ({ '/': 'index.html', '/index.html': 'index.html', '/resume/': 'resume.html', '/resume.html': 'resume.html', '/admin.html':'admin.html' })[pathname];
      const isIndex = Boolean(page);
      const assets = path.join(ROOT, 'assets');
      const file = isIndex ? path.join(ROOT, page) : path.resolve(ROOT, '.' + pathname);
      if (!isIndex && (!pathname.startsWith('/assets/') || !file.startsWith(assets + path.sep) || !MIME[path.extname(file).toLowerCase()])) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('未找到此内容。'); return;
      }
      let body = await fs.readFile(file);
      if(page==='index.html')body=Buffer.from(await administration.renderHomepage(body.toString('utf8')));
      if(pathname==='/admin.html') {
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('未找到此内容。');
    }
  });
  server.requestTimeout = 60_000;
  server.on('close', () => {portrait.emit('close');void administration.close?.();});
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if(process.argv.includes('--public'))process.env.PUBLIC_MODE='1';
  const port = Number(process.argv[2] || 8099);
  const server = await createResumeServer();
  const publicMode=process.env.PUBLIC_MODE==='1',host=publicMode?(process.env.BIND_HOST||'127.0.0.1'):'127.0.0.1';
  server.listen(port, host, () => console.log(`一纸简历${publicMode?'（公开免费模式，云端已关闭）':''}已启动：http://${host}:${port}/`));
}
