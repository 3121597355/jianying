// Mobile helpers change interface layout only; they never replace draft content.
export const MOBILE_EDITOR_MEDIA='(max-width:860px), (max-width:1024px) and (max-height:500px)';
export const MOBILE_ADMIN_MEDIA='(max-width:800px), (max-width:1024px) and (max-height:500px)';
export function keyboardIsOpen({width,height,visualHeight,editing}) {
  const compact=width<=860 || width<=1024 && height<=500;
  return editing && compact && height > 0 && visualHeight > 0 && visualHeight < height * .78;
}

let installed=false;
export function setupMobileKeyboard() {
  if(installed || !window.visualViewport)return;
  installed=true;
  const update=()=>{
    const field=document.activeElement;
    const editing=Boolean(field?.isContentEditable || field?.matches('textarea:not([readonly]),input:not([readonly]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]):not([type=color])'));
    document.documentElement.classList.toggle('mobile-keyboard-open',keyboardIsOpen({width:innerWidth,height:innerHeight,visualHeight:visualViewport.height,editing}));
  };
  visualViewport.addEventListener('resize',update);
  window.addEventListener('resize',update);
  document.addEventListener('focusin',update);
  document.addEventListener('focusout',()=>requestAnimationFrame(update));
  update();
}

export function setupMobileEditorTools(controls) {
  const button=document.createElement('button');
  button.type='button';button.className='mobile-editor-tools-toggle';
  button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','mobileEditorTools');
  button.innerHTML='<span>保存与岗位优化</span><span aria-hidden="true">⌄</span>';
  controls.querySelector('.member-tools').id='mobileEditorTools';
  controls.prepend(button);
  button.onclick=()=>{
    const expanded=button.getAttribute('aria-expanded')!=='true';
    button.setAttribute('aria-expanded',String(expanded));
    controls.classList.toggle('mobile-tools-open',expanded);
  };
  setupMobileKeyboard();
}

export function setupMobilePortraitTools() {
  const settings=document.querySelector('#settingsButton'),nav=document.querySelector('.site-nav');
  if(!settings||!nav||nav.querySelector('.mobile-photo-settings'))return;
  const button=document.createElement('button');
  button.type='button';button.className='mobile-photo-settings';
  button.setAttribute('aria-label','照片设置');
  button.innerHTML=settings.querySelector('svg').outerHTML+'<span>照片设置</span>';
  button.onclick=()=>settings.click();
  nav.append(button);
  const sync=()=>{button.disabled=settings.disabled;button.hidden=settings.hidden;};
  new MutationObserver(sync).observe(settings,{attributes:true,attributeFilter:['disabled','hidden']});
  sync();setupMobileKeyboard();
}
