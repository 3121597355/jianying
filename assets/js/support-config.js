import {normalizeSupportOffers} from './support-choice.js';
import {supportUrl,supportImage} from './support-image.js';
export const DEFAULT_SUPPORT_PAGE=Object.freeze({title:'请我喝一杯',description:'觉得好用的话，随手支持一下～',columns:4,align:'left',imageFit:'contain',customName:'其他心意',customNote:'随心就好',buttonLabel:'请我喝这个 →'});
export function normalizeSupportPage(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('支持页排版设置无效。');
  const result={...DEFAULT_SUPPORT_PAGE};
  for(const [key,max] of [['title',60],['description',160],['customName',24],['customNote',50],['buttonLabel',24]]){
    if(input[key]===undefined)continue;
    if(typeof input[key]!=='string'||input[key].length>max||(['title','customName','buttonLabel'].includes(key)&&!input[key].trim()))throw Error('支持页文字过长或标题为空。');
    result[key]=input[key].trim();
  }
  for(const [key,choices] of [['columns',[2,3,4]],['align',['left','center']],['imageFit',['contain','cover']]]){
    if(input[key]===undefined)continue;
    if(!choices.includes(input[key]))throw Error('请选择有效的支持页排版。');
    result[key]=input[key];
  }
  return result;
}
export function normalizeSupport(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('支持设置格式无效。');
  return {wechat:supportImage(input.wechat),alipay:supportImage(input.alipay),url:supportUrl(input.url),label:String(input.label||'前往赞助页面').trim().slice(0,40),offers:normalizeSupportOffers(input.offers),thanksImage:supportImage(input.thanksImage),page:normalizeSupportPage(input.page)};
}
