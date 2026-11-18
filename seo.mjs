import {CONTENT_PAGES} from './assets/js/public-pages.js';
import {contentMetadata} from './content-pages.mjs';
import {INDEXNOW_KEY,INDEXNOW_KEY_PATH,searchVerificationTags} from './search-verification.mjs';

export function siteOrigin(value) {
  if (!value) return 'https://yizhijianli.top';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Invalid public origin');
  return url.origin;
}
export const SITE_ORIGIN = siteOrigin(process.env.PUBLIC_ORIGIN);
export const PUBLIC_PAGES = ['/', '/resume/', '/portrait/', '/privacy/', ...Object.keys(CONTENT_PAGES)];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode = value => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, key) => ({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[key]));

// Metadata is rendered on the server so crawlers and link previews need no JavaScript.
export function renderSeo(html, pathname, origin = SITE_ORIGIN) {
  if (!PUBLIC_PAGES.includes(pathname)) return html;
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] || '一纸简历');
  const description = decode(html.match(/<meta name="description" content="([^"]*)"\s*\/?>/)?.[1] || '免费制作简历与证件照，无需注册。');
  const url = siteOrigin(origin) + pathname;
  const image = siteOrigin(origin) + '/assets/img/brand/icon.png';
  const content=contentMetadata(pathname);
  const publisher={'@type':'Organization',name:'一纸简历',url:siteOrigin(origin)+'/',logo:{'@type':'ImageObject',url:image}};
  const parent=content?.kind==='article'?{name:'使用指南',path:'/guides/'}:content?.kind==='template'?{name:'简历模板',path:'/templates/'}:null;
  const breadcrumb={'@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'首页',item:siteOrigin(origin)+'/'},
    ...(parent?[{'@type':'ListItem',position:2,name:parent.name,item:siteOrigin(origin)+parent.path}]:[]),
    {'@type':'ListItem',position:parent?3:2,name:CONTENT_PAGES[pathname],item:url},
  ]};
  const schema = pathname === '/' ? {
    '@context':'https://schema.org','@type':'WebSite',name:'一纸简历',url,description,inLanguage:'zh-CN',publisher,
  } : content?.kind==='article'||content?.kind==='template' ? {
    '@context':'https://schema.org','@type':'Article',headline:content.title,url,description,inLanguage:'zh-CN',datePublished:content.updated,dateModified:content.updated,
    author:publisher,publisher,mainEntityOfPage:{'@type':'WebPage','@id':url,breadcrumb},
  } : content ? {
    '@context':'https://schema.org','@type':'CollectionPage',name:title,url,description,inLanguage:'zh-CN',breadcrumb,
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
${pathname==='/'?searchVerificationTags():''}
<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script>\n`;
  return html.replace(/<meta\s+(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*/g, '')
    .replace(/<link rel="canonical"[^>]*>\s*/g, '')
    .replace(/<meta name="(?:google-site-verification|msvalidate\.01|baidu-site-verification)"[^>]*>\s*/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '')
    .replace('</head>', tags+'</head>');
}

export function searchDocument(pathname, origin = SITE_ORIGIN) {
  origin = siteOrigin(origin);
  if (pathname === INDEXNOW_KEY_PATH) return {type:'text/plain; charset=utf-8',body:INDEXNOW_KEY,noindex:true};
  if (pathname === '/robots.txt') return {type:'text/plain; charset=utf-8',body:`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /account/\nDisallow: /plans/\nDisallow: /portrait/api/\nDisallow: /private/\n\nSitemap: ${origin}/sitemap.xml\n`};
  if (pathname === '/sitemap.xml') return {type:'application/xml; charset=utf-8',body:`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PAGES.map(page=>`  <url><loc>${origin}${page}</loc>${contentMetadata(page)?.updated?`<lastmod>${contentMetadata(page).updated}</lastmod>`:''}</url>`).join('\n')}\n</urlset>\n`};
  return null;
}
