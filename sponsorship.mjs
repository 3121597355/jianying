import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SUPPORT_EVENTS=Object.freeze({support_entry_click:'支持入口点击',support_amount_select:'选择请客档位',support_wechat_open:'微信收款码展示',support_alipay_open:'支付宝收款码展示',support_platform_open:'赞助平台跳转',support_thanks_view:'自报支持后查看感谢页'});
export const SUPPORT_METHODS=Object.freeze({wechat:'微信',alipay:'支付宝',platform:'赞助平台',other:'其他'});
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export function amountFen(value,{zero=false}={}){
  if(typeof value!=='string'||!/^\d{1,6}(?:\.\d{1,2})?$/.test(value.trim()))throw fail('金额须为有效人民币金额，最多两位小数。');
  const [whole,fraction='']=value.trim().split('.'),fen=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(fen<(zero?0:1)||fen>10000000)throw fail('金额须在 '+(zero?'0':'0.01')+'～100000 元之间。');
  return fen;
}
export const money=fen=>(fen/100).toFixed(2);
export function normalizeReceipt(input={}){
  const date=input.date;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today())throw fail('请选择有效的到账日期，不能晚于今天。');
  if(!Object.hasOwn(SUPPORT_METHODS,input.method))throw fail('请选择收款渠道。');
  const amount=amountFen(input.amount),refund=amountFen(input.refund||'0',{zero:true});
  if(refund>amount)throw fail('退款金额不能超过到账金额。');
  const strings={};for(const [key,max]of [['nickname',40],['reference',100],['note',200]]){
    if(input[key]!==undefined&&(typeof input[key]!=='string'||input[key].length>max))throw fail('备注或核对信息过长。');strings[key]=(input[key]||'').trim();
  }
  if(input.voided!==undefined&&typeof input.voided!=='boolean')throw fail('记录状态无效。');
  return {date,method:input.method,amountFen:amount,refundFen:refund,voided:input.voided===true,...strings};
}
export function receiptsRevision(entries){return crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');}
export function mutateReceipts(entries,input,id=''){
  if(input?.revision!==receiptsRevision(entries))throw fail('赞助记录已在其他窗口更新，请刷新后再保存。',409);
  const record=normalizeReceipt(input.entry),existing=id?entries.find(item=>item.id===id):null;
  if(id&&!existing)throw fail('这条记录已不存在，请刷新。',404);
  if(!id&&entries.length>=5000)throw fail('最多保存 5000 条记录，请先导出备份。');
  if(record.reference&&!record.voided&&entries.some(item=>item.id!==id&&!item.voided&&item.method===record.method&&item.reference===record.reference))throw fail('该渠道的交易核对编号已登记，请检查是否重复。',409);
  const at=new Date().toISOString(),next={...record,id:existing?.id||crypto.randomUUID(),createdAt:existing?.createdAt||at,updatedAt:at};
  return existing?entries.map(item=>item.id===id?next:item):[...entries,next];
}
export function receiptTotals(entries){
  return entries.filter(item=>!item.voided).reduce((out,item)=>({grossFen:out.grossFen+item.amountFen,refundFen:out.refundFen+item.refundFen,netFen:out.netFen+item.amountFen-item.refundFen,count:out.count+1,netCount:out.netCount+(item.amountFen>item.refundFen?1:0)}),{grossFen:0,refundFen:0,netFen:0,count:0,netCount:0});
}
export function buildSupportReport({entries,events=[],range,analyticsEnabled=true}){
  const selected=entries.filter(item=>item.date>=range.from&&item.date<=range.to),periodEvents=events.filter(item=>item.day>=range.from&&item.day<=range.to),views=periodEvents.filter(item=>item.type==='page_view'&&item.path==='/plans/');
  const count=type=>periodEvents.filter(item=>item.type===type).length;
  return {range,analyticsEnabled,revision:receiptsRevision(entries),total:receiptTotals(entries),period:receiptTotals(selected),intent:{views:views.length,visitors:new Set(views.filter(item=>item.visitor).map(item=>item.day+':'+item.visitor)).size,entryClicks:count('support_entry_click'),amountSelections:count('support_amount_select'),thanksViews:count('support_thanks_view'),wechatOpens:count('support_wechat_open'),alipayOpens:count('support_alipay_open'),platformOpens:count('support_platform_open')},methods:Object.entries(SUPPORT_METHODS).map(([method,label])=>({method,label,...receiptTotals(selected.filter(item=>item.method===method))})),entries:[...selected].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)),allEntryCount:entries.length,notice:'选择档位、展示收款码及查看感谢页不代表支付成功。到账由管理员核对账单后手动登记；按到账日期汇总，退款在原到账日期冲减，作废记录不计收入。累计记录持续保存，匿名行为仅保留最近 90 天。'};
}
// Prefix spreadsheet formulas before quoting. CSV always remains a private admin export.
export const safeCsvCell=value=>{const text=String(value??'');return '"'+(/^[\s]*[=+@-]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';};
export function receiptsCsv(entries){
  const rows=[['到账日期','渠道','到账金额（元）','退款金额（元）','净支持金额（元）','状态','支持者昵称（选填）','交易核对编号（选填）','备注','记录编号'],...entries.map(item=>[item.date,SUPPORT_METHODS[item.method],money(item.amountFen),money(item.refundFen),money(item.voided?0:item.amountFen-item.refundFen),item.voided?'已作废':'已确认',item.nickname,item.reference,item.note,item.id])];
  return '\uFEFF'+rows.map(row=>row.map(safeCsvCell).join(',')).join('\r\n');
}
export function createSponsorship(dataDir){
  const file=path.join(dataDir,'sponsorship.json');
  let entries=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  if(!Array.isArray(entries)||entries.length>5000)throw Error('赞助记录文件无效。');
  const persist=next=>{fs.writeFileSync(file+'.tmp',JSON.stringify(next,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);entries=next;};
  return {get:()=>structuredClone(entries),save(input,id){persist(mutateReceipts(entries,input,id));return entries;}};
}
