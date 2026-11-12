export const maintenanceHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f7f8f6">
<title>备案维护中 · 一纸简历</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:28px;background:#f7f8f6;color:#20241f;font:16px/1.8 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}.notice{width:min(100%,560px);padding:clamp(28px,7vw,52px);border:1px solid #e6e9e4;border-radius:8px;background:#fff}h1{margin:0 0 16px;font-size:30px;line-height:1.4;letter-spacing:0}.brand{display:flex;align-items:center;gap:10px;margin-bottom:38px;font-weight:650}.brand img{width:36px;height:36px}.eyebrow{margin:0 0 8px;color:#62705e;font-size:13px}p{margin:0;color:#636a61}.foot{margin-top:28px;color:#858b83;font-size:13px}</style></head>
<body><main class="notice"><div class="brand"><img src="/assets/img/brand/icon.png" alt="">一纸简历</div><p class="eyebrow">网站维护通知</p><h1>备案维护中，暂时关闭访问</h1><p>网站正在按备案要求进行维护，简历编辑和证件照服务暂时无法使用。维护完成后会恢复访问，你的草稿与站点数据不会因此删除。</p><p class="foot">感谢理解。</p></main></body></html>`;

export function maintenanceResponse(pathname, enabled) {
  if (!enabled) return null;
  return {status:503,headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store, max-age=0',
    'Retry-After':'3600',
    'X-Robots-Tag':'noindex, nofollow',
  },body:maintenanceHtml};
}
