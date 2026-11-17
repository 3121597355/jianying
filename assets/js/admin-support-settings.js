import {normalizeSupportOffers} from './support-choice.js';
import {normalizeSupportPage} from './support-config.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(choices,value)=>choices.map(([key,label])=>'<option value="'+key+'" '+(value===key?'selected':'')+'>'+label+'</option>').join('');
const row=item=>`<article class="support-offer-row" data-support-offer="${esc(item.id)}">
  <div class="support-offer-image-setting"><img data-offer-preview src="${esc(item.image||'')}" alt="卡片图片预览" ${item.image?'':'hidden'}><label>卡片图片<input type="file" accept="image/png,image/jpeg,image/webp" data-offer-upload></label><input type="hidden" data-offer-field="image" value="${esc(item.image||'')}"><button type="button" class="secondary" data-offer-clear>移除图片</button></div>
  <div class="support-offer-text-setting"><label>名称<input data-offer-field="name" maxlength="24" value="${esc(item.name)}" required></label><label>金额（元）<input data-offer-field="amount" inputmode="decimal" value="${esc(item.amount)}" required></label><label class="wide">小字说明<input data-offer-field="note" maxlength="50" value="${esc(item.note)}"></label><label>备用图标<select data-offer-field="icon">${options([['tea','冰红茶'],['milk','饮料'],['coffee','咖啡']],item.icon)}</select></label><div class="support-offer-order"><button type="button" class="secondary" data-offer-move="-1" aria-label="上移档位">↑</button><button type="button" class="secondary" data-offer-move="1" aria-label="下移档位">↓</button><button type="button" class="secondary" data-offer-remove>移除档位</button></div></div>
</article>`;
export function supportPageFields(value){
  const page=normalizeSupportPage(value);
  return `<section class="wide support-page-settings"><h3>支持页文案与排版</h3><div class="settings-fields"><label class="wide">页面标题<input data-support-page="title" maxlength="60" value="${esc(page.title)}" required></label><label class="wide">一句说明（可留空）<textarea data-support-page="description" maxlength="160">${esc(page.description)}</textarea></label><label>电脑端列数<select data-support-page="columns">${options([[2,'两列'],[3,'三列'],[4,'四列']],page.columns)}</select></label><label>卡片文字对齐<select data-support-page="align">${options([['left','左对齐'],['center','居中']],page.align)}</select></label><label>图片展示<select data-support-page="imageFit">${options([['contain','完整显示'],['cover','填满裁切']],page.imageFit)}</select></label><label>其他金额卡片名称<input data-support-page="customName" maxlength="24" value="${esc(page.customName)}" required></label><label>其他金额说明<input data-support-page="customNote" maxlength="50" value="${esc(page.customNote)}"></label><label>请客按钮文字<input data-support-page="buttonLabel" maxlength="24" value="${esc(page.buttonLabel)}" required></label></div><p class="settings-help">手机自动使用两列。保存后可打开支持页查看效果。</p></section>`;
}
export function readSupportPage(host){
  const page=Object.fromEntries([...host.querySelectorAll('[data-support-page]')].map(input=>[input.dataset.supportPage,input.dataset.supportPage==='columns'?Number(input.value):input.value]));
  return normalizeSupportPage(page);
}
export function supportOfferFields(value){
  return '<section class="wide support-offer-settings"><h3>请客卡片</h3><p class="settings-help">可改文字、金额、图片，或用箭头调整顺序。未上传图片时显示备用图标。保留 1～6 档，“其他心意”自动保留。</p><div data-support-offer-list>'+normalizeSupportOffers(value).map(row).join('')+'</div><button type="button" class="secondary" data-offer-add>＋ 添加档位</button></section>';
}
export function readSupportOffers(host){
  return [...host.querySelectorAll('[data-support-offer]')].map(row=>({id:row.dataset.supportOffer,...Object.fromEntries([...row.querySelectorAll('[data-offer-field]')].map(input=>[input.dataset.offerField,input.value]))}));
}
async function cardImage(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8000000)throw Error('请选择小于 8 MB 的 PNG、JPG 或 WebP 图片。');
  const bitmap=await createImageBitmap(file);
  try{
    const canvas=document.createElement('canvas'),scale=Math.min(1,480/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [.86,.7,.5]){const data=canvas.toDataURL('image/webp',quality);if(data.length<=180000)return data;}
    throw Error('图片内容过大，请缩小后重试。');
  }finally{bitmap.close();}
}
export function bindSupportOffers(host,{dirty,showError}){
  const list=host.querySelector('[data-support-offer-list]');if(!list)return;
  const order=()=>[...list.children].forEach((item,index)=>{item.querySelector('[data-offer-move="-1"]').disabled=index===0;item.querySelector('[data-offer-move="1"]').disabled=index===list.children.length-1;});
  order();
  host.querySelector('[data-offer-add]').onclick=()=>{if(list.children.length>=6){showError('最多设置 6 个请客档位。');return;}const container=document.createElement('div');container.innerHTML=row({id:'treat-'+crypto.randomUUID().slice(0,8),name:'一份小心意',note:'谢谢你的支持',amount:'6.66',icon:'coffee'});list.append(container.firstElementChild);order();dirty();};
  list.onclick=event=>{
    const button=event.target.closest('button');if(!button)return;const item=button.closest('[data-support-offer]');if(!item)return;
    if(button.hasAttribute('data-offer-remove')){if(list.children.length<=1){showError('至少保留一个请客档位。');return;}item.remove();}
    else if(button.hasAttribute('data-offer-move')){const previous=button.dataset.offerMove==='-1',adjacent=previous?item.previousElementSibling:item.nextElementSibling;if(!adjacent)return;if(previous)adjacent.before(item);else adjacent.after(item);}
    else if(button.hasAttribute('data-offer-clear')){item.querySelector('[data-offer-field="image"]').value='';const preview=item.querySelector('[data-offer-preview]');preview.removeAttribute('src');preview.hidden=true;}
    else return;
    order();dirty();
  };
  let uploading=0;
  list.addEventListener('change',async event=>{
    const input=event.target;if(!input.matches('[data-offer-upload]')||!input.files[0])return;
    const item=input.closest('[data-support-offer]'),save=host.querySelector('[type="submit"]');
    uploading++;input.disabled=true;if(save)save.disabled=true;
    try{const image=await cardImage(input.files[0]);if(!item.isConnected)return;item.querySelector('[data-offer-field="image"]').value=image;const preview=item.querySelector('[data-offer-preview]');preview.src=image;preview.hidden=false;dirty();}
    catch(error){showError(error.message);}finally{uploading--;input.value='';input.disabled=false;if(save&&uploading===0)save.disabled=false;}
  });
}
