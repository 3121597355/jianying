import {supportImage} from './support-image.js';
export const DEFAULT_SUPPORT_OFFERS=Object.freeze([
  Object.freeze({id:'milk',name:'营养快线',note:'补充一下营养',amount:'4',icon:'milk',image:'/assets/img/support/milk.png'}),
  Object.freeze({id:'iced-tea',name:'冰红茶',note:'来一瓶「国窖」',amount:'5',icon:'tea',image:'/assets/img/support/iced-tea.png'}),
  Object.freeze({id:'coffee',name:'咖啡',note:'喝杯咖啡，继续加油',amount:'9.9',icon:'coffee',image:'/assets/img/support/coffee.png'}),
]);
export function supportAmount(value){
  if(typeof value!=='string'||!/^\d{1,4}(?:\.\d{1,2})?$/.test(value.trim()))throw Error('填一个有效金额吧，最多两位小数。');
  const [whole,part='']=value.trim().split('.'),fen=Number(whole)*100+Number(part.padEnd(2,'0'));
  if(fen<100||fen>100000)throw Error('心意随你，金额可填 1～1000 元。');
  return (fen/100).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
}
export function normalizeSupportOffers(value=DEFAULT_SUPPORT_OFFERS){
  if(!Array.isArray(value)||value.length<1||value.length>6)throw Error('请保留 1～6 个请客档位。');
  const seen=new Set();
  return value.map(item=>{
    if(!item||typeof item!=='object'||typeof item.id!=='string'||!/^[a-z0-9-]{1,40}$/.test(item.id)||seen.has(item.id))throw Error('请客档位编号无效或重复。');
    seen.add(item.id);
    if(typeof item.name!=='string'||!item.name.trim()||item.name.length>24||typeof item.note!=='string'||item.note.length>50)throw Error('档位名称最多 24 字，说明最多 50 字。');
    return {id:item.id,name:item.name.trim(),note:item.note.trim(),amount:supportAmount(item.amount),icon:['tea','milk','coffee'].includes(item.icon)?item.icon:'coffee',image:supportImage(item.image,180000)};
  });
}
export function customSupportChoice(value){return{id:'custom',name:'随心请客',note:'这份心意，我收到了',amount:supportAmount(value),icon:'coffee'};}
// A self-reported thank-you context is presentation only, never a payment receipt.
export const SUPPORT_THANKS_KEY='yizhi:support-thanks';
export function thankYouContext(value,now=Date.now()){
  if(!value||typeof value!=='object'||value.confirmed!==true||!Number.isSafeInteger(value.confirmedAt)||value.confirmedAt>now||now-value.confirmedAt>30*60000||typeof value.name!=='string'||!value.name.trim()||value.name.length>24)return null;
  try{return{name:value.name.trim(),amount:supportAmount(value.amount)};}catch{return null;}
}
export function confirmSupportChoice(choice,storage,now=Date.now()){
  const value={name:choice?.name,amount:choice?.amount,confirmed:true,confirmedAt:now};
  if(!thankYouContext(value,now))throw Error('请重新选择请客金额。');
  try{storage.setItem(SUPPORT_THANKS_KEY,JSON.stringify(value));if(storage.getItem(SUPPORT_THANKS_KEY)!==JSON.stringify(value))throw Error();}catch{throw Error('浏览器无法保存付款确认，请允许本站使用会话存储后再试。');}
}
export function consumeSupportConfirmation(storage,now=Date.now()){
  try{const raw=storage.getItem(SUPPORT_THANKS_KEY);storage.removeItem(SUPPORT_THANKS_KEY);return thankYouContext(JSON.parse(raw||'null'),now);}catch{return null;}
}
