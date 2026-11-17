import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supportAmount,normalizeSupportOffers,DEFAULT_SUPPORT_OFFERS,customSupportChoice,thankYouContext,confirmSupportChoice,consumeSupportConfirmation,SUPPORT_THANKS_KEY} from '../assets/js/support-choice.js';
import {normalizeSupport,DEFAULT_SUPPORT_PAGE} from '../assets/js/support-config.js';
import {supportOfferFields} from '../assets/js/admin-support-settings.js';
import {buildSupportReport} from '../sponsorship.mjs';

test('treat choices validate editable amounts and preserve existing payment codes',()=>{
  assert.equal(supportAmount('9.90'),'9.9');assert.equal(customSupportChoice('6.66').amount,'6.66');
  for(const value of ['0','-1','0.99','1000.01','1.999','1e2','Infinity','',5])assert.throws(()=>supportAmount(value));
  const qr='data:image/png;base64,aGVsbG8=';
  const config=normalizeSupport({wechat:qr,alipay:qr,thanksImage:qr});assert.equal(config.wechat,qr);assert.equal(config.alipay,qr);assert.equal(config.thanksImage,qr);assert.deepEqual(config.offers,DEFAULT_SUPPORT_OFFERS);
  assert.throws(()=>normalizeSupportOffers([]));assert.throws(()=>normalizeSupportOffers([...DEFAULT_SUPPORT_OFFERS,DEFAULT_SUPPORT_OFFERS[0]]));
  assert.throws(()=>normalizeSupportOffers([{...DEFAULT_SUPPORT_OFFERS[0],amount:'1e3'}]));assert.throws(()=>normalizeSupport({thanksImage:'javascript:alert(1)'}));
  const custom=normalizeSupportOffers([{...DEFAULT_SUPPORT_OFFERS[0],name:'一杯奶茶',amount:'8.88'}]);assert.equal(custom[0].amount,'8.88');assert.equal(custom[0].name,'一杯奶茶');
  assert(!supportOfferFields([{...DEFAULT_SUPPORT_OFFERS[0],name:'<img src=x onerror=1>'}]).includes('<img src=x'));
});
test('support page edits preserve payment configuration and validate card images and layout',()=>{
  const image='data:image/webp;base64,aGVsbG8=',qr='data:image/png;base64,aGVsbG8=';
  const config=normalizeSupport({wechat:qr,alipay:qr,offers:[{...DEFAULT_SUPPORT_OFFERS[2],image}],page:{title:'喝杯茶吧',description:'',columns:2,align:'center',imageFit:'cover',customName:'随心',customNote:'',buttonLabel:'请客'}});
  assert.equal(config.wechat,qr);assert.equal(config.alipay,qr);assert.equal(config.offers[0].id,'coffee');assert.equal(config.offers[0].image,image);assert.equal(config.page.columns,2);assert.equal(config.page.description,'');
  assert.deepEqual(normalizeSupport().page,DEFAULT_SUPPORT_PAGE);assert.deepEqual(normalizeSupport(config),config);
  for(const image of ['javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','https://secret@images.example/image.png','data:image/png;base64,'+'a'.repeat(180000)])assert.throws(()=>normalizeSupport({offers:[{...DEFAULT_SUPPORT_OFFERS[0],image}]}));
  for(const page of [{columns:'2'},{columns:6},{align:'left;display:none'},{imageFit:'stretch'},{title:''},{description:'x'.repeat(161)}])assert.throws(()=>normalizeSupport({page}));
});
test('self-reported gratitude does not become income and custom amounts do not enter analytics',()=>{
  assert.equal(thankYouContext({name:'咖啡',amount:'fake'}),null);assert.equal(thankYouContext(null),null);assert.equal(thankYouContext({name:'咖啡',amount:'9.9',paid:true}),null);
  const range={from:'2026-11-15',to:'2026-11-15'},report=buildSupportReport({range,entries:[],events:[{day:range.from,type:'support_amount_select'},{day:range.from,type:'support_thanks_view'}]});
  assert.equal(report.total.netFen,0);assert.equal(report.total.count,0);assert.equal(report.intent.amountSelections,1);assert.equal(report.intent.thanksViews,1);
});
test('thank-you pages require a fresh explicit confirmation, reject old choices and consume it once',()=>{
  const entries=new Map(),storage={getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)},now=Date.now(),choice={name:'咖啡',amount:'9.9'};
  assert.equal(consumeSupportConfirmation(storage,now),null);
  storage.setItem(SUPPORT_THANKS_KEY,JSON.stringify(choice));assert.equal(consumeSupportConfirmation(storage,now),null);
  storage.setItem(SUPPORT_THANKS_KEY,'{broken');assert.equal(consumeSupportConfirmation(storage,now),null);
  confirmSupportChoice(choice,storage,now);assert.deepEqual(consumeSupportConfirmation(storage,now+1000),choice);assert.equal(consumeSupportConfirmation(storage,now+1000),null);
  confirmSupportChoice(choice,storage,now);assert.equal(consumeSupportConfirmation(storage,now+30*60000+1),null);
  confirmSupportChoice(choice,storage,now);assert.equal(consumeSupportConfirmation(storage,now-1),null);
  assert.equal(thankYouContext({...choice,confirmed:false,confirmedAt:now},now),null);
  assert.throws(()=>confirmSupportChoice(choice,{setItem(){throw Error();}},now),/会话存储/);
  assert.throws(()=>confirmSupportChoice({name:'咖啡',amount:'fake'},storage,now));
});
