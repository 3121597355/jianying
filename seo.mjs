export const SITE_ORIGIN = 'https://yizhijianli.cn';
export const PUBLIC_PAGES = ['/', '/resume/', '/portrait/', '/privacy/'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode = value => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, key) => ({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[key]));

// Metadata is rendered on the server so crawlers and link previews need no JavaScript.
export function renderSeo(html, pathname) {
  if (!PUBLIC_PAGES.includes(pathname)) return html;
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] || '一纸简历');
  const description = decode(html.match(/<meta name="description" content="([^"]*)"\s*\/?>/)?.[1] || '免费制作简历与证件照，无需注册。');
  const url = SITE_ORIGIN + pathname;
  const image = SITE_ORIGIN + '/assets/img/brand/icon.png';
  const schema = pathname === '/' ? {
    '@context':'https://schema.org','@type':'WebSite',name:'一纸简历',url,description,inLanguage:'zh-CN',
  } : pathname === '/privacy/' ? {
    '@context':'https://schema.org','@type':'WebPage',name:title,url,description,inLanguage:'zh-CN',
  } : {
    '@context':'https://schema.org','@type':'WebApplication',name:pathname==='/resume/'?'一纸简历 · 在线简历制作':'一纸简历 · 证件照换底',url,description,
    applicationCategory:'UtilitiesApplication',operatingSystem:'Web',inLanguage:'zh-CN',
    offers:{'@type':'Offer',price:'0',priceCurrency:'CNY'},
  };
  const tags = `\n<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="一纸简历">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:alt" content="一纸简历标志">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${image}">
<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script>\n`;
  return html.replace(/<meta\s+(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*/g, '')
    .replace(/<link rel="canonical"[^>]*>\s*/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '')
    .replace('</head>', tags+'</head>');
}

export function searchDocument(pathname) {
  if (pathname === '/robots.txt') return {type:'text/plain; charset=utf-8',body:`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /portrait/api/\nDisallow: /private/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`};
  if (pathname === '/sitemap.xml') return {type:'application/xml; charset=utf-8',body:`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PAGES.map(page=>`  <url><loc>${SITE_ORIGIN}${page}</loc></url>`).join('\n')}\n</urlset>\n`};
  return null;
}
