export function supportUrl(value){
  if(!value)return '';
  if(typeof value!=='string'||value.length>1000)throw Error('图片或支持链接过长。');
  let url;try{url=new URL(value);}catch{throw Error('请填写完整的 HTTPS 地址。');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname))throw Error('图片或支持链接须为公开的 HTTPS 地址。');
  return url.href;
}
export function supportImage(value,max=350000){
  if(!value)return '';
  if(typeof value!=='string')throw Error('图片格式无效。');
  if(['/assets/img/support/milk.png','/assets/img/support/iced-tea.png','/assets/img/support/coffee.png'].includes(value))return value;
  if(value.startsWith('data:')){
    if(value.length>max||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('请上传较小的 PNG、JPG 或 WebP 图片。');
    return value;
  }
  return supportUrl(value);
}
