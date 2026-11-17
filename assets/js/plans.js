import {track} from './analytics.js';
import {refreshMember,installMemberNav,escape,safeReturn,dialog} from './member-client.js';
import {normalizeSupport} from './support-config.js';
import {customSupportChoice,confirmSupportChoice,SUPPORT_THANKS_KEY} from './support-choice.js';
const returnTo=safeReturn(new URLSearchParams(location.search).get('return')||'/resume/');
document.querySelectorAll('[data-return]').forEach(link=>link.href=returnTo);
const theme=document.querySelector('#plansTheme');
function paintTheme(){const dark=document.documentElement.dataset.theme==='dark';theme.textContent=dark?'☼':'◐';theme.setAttribute('aria-label',dark?'切换浅色模式':'切换深色模式');theme.setAttribute('aria-pressed',String(dark));}
theme.onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';paintTheme();try{const ui=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}');ui.theme=document.documentElement.dataset.theme;localStorage.setItem('qmj-clone:ui',JSON.stringify(ui));}catch{}};paintTheme();
installMemberNav();void refreshMember().then(()=>installMemberNav()).catch(()=>{});
const host=document.querySelector('[data-support]');
const drinkIcon=kind=>'<svg viewBox="0 0 48 48" aria-hidden="true">'+(kind==='coffee'?'<path d="M10 17h25v12a11 11 0 0 1-11 11h-3a11 11 0 0 1-11-11V17ZM35 20h3a6 6 0 0 1 0 12h-3M17 7v5m8-5v5m8-5v5M8 41h29"/>':kind==='milk'?'<path d="M17 6h14v7l5 7v21H12V20l5-7V6ZM12 20h24M17 13h14M17 6l5 7M22 13v7M18 27h12m-10 6h8"/>':'<path d="M20 6h8v9l6 8v16a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V23l6-8V6ZM19 6h10M14 26h20m-20 9h20M20 12h8"/>')+'</svg>';
try{
  const response=await fetch('/api/site-config',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();
  const {support}=await response.json(),config=normalizeSupport(support);
  const channels=[['wechat','微信'],['alipay','支付宝']].filter(([key])=>config[key]);
  let selected=config.offers[0].id;
  document.querySelector("[data-support-title]").textContent=config.page.title;
  const description=document.querySelector("[data-support-description]");description.textContent=config.page.description;description.hidden=!config.page.description;
  host.innerHTML='<div class="support-offers" data-columns="'+config.page.columns+'" data-align="'+config.page.align+'" data-fit="'+config.page.imageFit+'" role="group" aria-label="选择请客金额">'+config.offers.map(item=>'<button type="button" class="support-offer" data-offer="'+item.id+'" aria-pressed="'+(item.id===selected)+'"><span class="drink-icon offer-visual'+(item.image?' has-image':'')+'">'+(item.image?'<img data-offer-image src="'+escape(item.image)+'" alt="" loading="lazy">':drinkIcon(item.icon))+'</span><strong>'+escape(item.name)+'</strong><small>'+escape(item.note)+'</small><span class="offer-price">¥'+escape(item.amount)+'</span></button>').join('')+'<button type="button" class="support-offer support-custom" data-offer="custom" aria-pressed="false"><span class="drink-icon offer-visual custom-visual"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 10v28M10 24h28"/></svg></span><strong>'+escape(config.page.customName)+'</strong><small>'+escape(config.page.customNote)+'</small><span class="offer-price">随心</span></button></div><div class="support-custom-field" hidden><label for="supportCustomAmount">你的请客金额 <span>¥</span></label><input id="supportCustomAmount" inputmode="decimal" type="text" maxlength="7" placeholder="例如 6.66" aria-describedby="customAmountHelp"><small id="customAmountHelp">1～1000 元，量力而行就好。</small></div><p class="support-choice-error" role="alert" hidden></p><div class="support-checkout"><p data-selection-summary aria-live="polite"></p><button type="button" class="member-button primary" data-treat '+(channels.length?'':'disabled')+'>'+escape(config.page.buttonLabel)+'</button><small>'+(channels.length?'微信 / 支付宝扫码 · 自愿支持':'收款方式还在准备中，分享给朋友也是支持。')+'</small></div>'+(config.url?'<p class="support-platform-link">习惯用赞助平台？<a href="'+escape(config.url)+'" data-support-open="platform" target="_blank" rel="noopener noreferrer">'+escape(config.label)+' ↗</a></p>':'');
  host.querySelectorAll('[data-offer-image]').forEach(image=>image.onerror=()=>{const card=image.closest('[data-offer]'),item=config.offers.find(item=>item.id===card.dataset.offer);image.parentElement.classList.remove('has-image');image.parentElement.innerHTML=drinkIcon(item.icon);});
  const error=host.querySelector('.support-choice-error'),input=host.querySelector('input');
  const choice=()=>selected==='custom'?customSupportChoice(input.value):config.offers.find(item=>item.id===selected);
  function updateSummary(){let text='填一份你想请的心意';try{const item=choice();text=item.name+' · ¥'+item.amount;}catch{}host.querySelector('[data-selection-summary]').textContent=text;}
  host.querySelectorAll('[data-offer]').forEach(button=>button.onclick=event=>{
    selected=button.dataset.offer;host.querySelectorAll('[data-offer]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    host.querySelector('.support-custom-field').hidden=selected!=='custom';error.hidden=true;updateSummary();
    if(selected==='custom')input.focus({preventScroll:true});if(event.isTrusted)track('support_amount_select');
  });
  input.oninput=()=>{error.hidden=true;updateSummary();};updateSummary();
  host.querySelector('[data-treat]').onclick=()=>{
    let item;try{item=choice();}catch(e){error.textContent=e.message;error.hidden=false;input.focus();return;}
    if(!channels.length)return;
    try{sessionStorage.removeItem(SUPPORT_THANKS_KEY);}catch{}
    const box=dialog('扫码请客', '<div class="support-payment"><div class="support-payment-choice"><strong>'+escape(item.name)+'</strong><span>¥'+escape(item.amount)+'</span></div><div class="support-channel-tabs" role="group" aria-label="选择收款方式">'+channels.map(([key,label],index)=>'<button class="member-button" type="button" data-channel="'+key+'" aria-pressed="'+(index===0)+'">'+label+'</button>').join('')+'</div><div data-payment-code></div><p class="support-payment-note">扫码后请填写 <b>¥'+escape(item.amount)+'</b>，在支付应用里确认付款。</p><label class="support-payment-confirm"><input type="checkbox" data-payment-confirm>我已在微信或支付宝完成付款</label><button type="button" class="member-button primary support-thanks-action" data-thanks disabled>确认，收下心意 →</button><p class="support-choice-error" data-confirm-error role="alert" hidden></p><small class="support-payment-foot">付好再勾选，本站不会自动确认到账。</small></div>');
    function showChannel(key){
      box.querySelectorAll('[data-channel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.channel===key)));
      box.querySelector('[data-payment-code]').innerHTML='<img class="support-qr" src="'+escape(config[key])+'" alt="'+(key==='wechat'?'微信':'支付宝')+'收款码" width="220" height="220">'+(config[key].startsWith('data:')?'<button type="button" class="member-text-button" data-code-expand>放大收款码</button>':'<a class="member-text-button" href="'+escape(config[key])+'" data-support-open="'+key+'" target="_blank" rel="noopener noreferrer">打开收款码 ↗</a>')+'<p class="support-scan-tip">电脑用手机扫码；手机可打开图片，长按保存后在支付应用识别。</p>';
      const expand=box.querySelector('[data-code-expand]');if(expand)expand.onclick=()=>{const image=box.querySelector('.support-qr');image.classList.toggle('is-expanded');expand.textContent=image.classList.contains('is-expanded')?'收起收款码':'放大收款码';};
      track(key==='wechat'?'support_wechat_open':'support_alipay_open');
    }
    box.querySelectorAll('[data-channel]').forEach(button=>button.onclick=()=>showChannel(button.dataset.channel));showChannel(channels[0][0]);
    const confirmation=box.querySelector('[data-payment-confirm]'),thanksButton=box.querySelector('[data-thanks]');
    confirmation.onchange=()=>{thanksButton.disabled=!confirmation.checked;};
    thanksButton.onclick=()=>{
      if(!confirmation.checked)return;
      const error=box.querySelector('[data-confirm-error]');error.hidden=true;
      try{confirmSupportChoice(item,sessionStorage);location.assign('/plans/thanks/?return='+encodeURIComponent(returnTo));}catch(e){error.textContent=e.message;error.hidden=false;}
    };
  };
}catch{host.innerHTML='<p class="member-muted" role="status">支持方式暂时未能加载，免费功能照常使用。稍后刷新即可。</p>';}
document.addEventListener('click',event=>{const channel=event.target.closest('[data-support-open]')?.dataset.supportOpen;if(event.isTrusted&&channel==='platform')track('support_platform_open');});
