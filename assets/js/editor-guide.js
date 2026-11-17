import {MOBILE_EDITOR_MEDIA} from './mobile-layout.js';
/** One small, dismissible coachmark; never locks the editor or changes resume data. */
export function setupEditorGuide({isSample,openEditor,openModules,selectModule}) {
  const heading=document.querySelector('.editor-heading');
  if(!heading)return;
  const key='yizhi:editor-guide:v1';
  let seen=false;
  try{seen=localStorage.getItem(key)==='done';}catch{}
  const tools=document.createElement('div');
  tools.className='editor-help-tools';
  tools.innerHTML='<span class="editor-sample-note" hidden>虚构示例 · 可直接修改</span><button type="button" class="editor-help-trigger" aria-expanded="false" aria-controls="editorQuickGuide"><span aria-hidden="true">?</span> 使用提示</button>';
  heading.append(tools);
  const trigger=tools.querySelector('button'),note=tools.querySelector('.editor-sample-note');
  const card=document.createElement('section');
  card.id='editorQuickGuide';card.className='editor-quick-guide';card.hidden=true;
  card.setAttribute('aria-label','简历编辑使用提示');
  card.innerHTML='<header><span class="guide-count"></span><button type="button" data-guide-close aria-label="关闭使用提示">×</button></header><div aria-live="polite"><h2></h2><p></p></div><footer><button type="button" data-guide-blank hidden>从空白开始</button><button type="button" data-guide-prev>上一步</button><button type="button" data-guide-next></button></footer>';
  document.body.append(card);
  let step=0,target=null,initialOpen=true,initialEditorOpen=true,initialTab='basic',frame=0;
  const steps=[
    {title:'先换成你的信息',text:'用“编辑栏目”切换填写内容；也可以直接点预览中的内容。修改后会自动保存。',selector:'.mobile-module-bar'},
    {title:'展开栏目，按需取舍',text:'点“展开栏目”查看全部卡片。点击卡片编辑，用开关决定是否展示；填写时可以收起，给表单留出更多空间。',selector:'#mobileModuleToggle'},
    {title:'拖动卡片，调整顺序',text:'拖住卡片左侧的六点把手移动；手机上也从把手开始拖。也可以点前后箭头，或聚焦把手后按方向键。',selector:'.edit_tab [data-drag]'},
    {title:'收起编辑区，看看整份简历',text:'点侧边箭头收起编辑区，简历预览会放大。手机上点“查看预览”；点“编辑内容”或箭头就能回来继续写。',selector:()=>window.matchMedia(MOBILE_EDITOR_MEDIA).matches?'.workspace-views [data-view="edit"]':'#resumeEditorPanel > .close'},
    {title:'把证件照换成你的',text:'基本信息里可以更换或移除照片，也可以关闭“展示照片”。顶部“证件照”可换底、裁切，再放回简历。',selector:'#formHost [data-act="pickPhoto"]'},
    {title:'更多信息，按需填写',text:'点“展开更多信息”填写政治面貌等资料；不填就不展示。还可以在下面添加个人网站、作品集等自定义信息。',selector:'#formHost [data-act="toggleMore"]'},
    {title:'保存与导出，准备投递',text:'输入后自动保存在当前浏览器。登录后可保存到云端、创建多份简历；完成后点右上角导出，先看完整预览，再选 PDF、长图或纯文本。',selector:'.qm-download'},
  ];
  const targetSelector=()=>typeof steps[step].selector==='function'?steps[step].selector():steps[step].selector;
  function position(){
    frame=0;
    if(card.hidden||!target)return;
    if(!target.isConnected){target=document.querySelector(targetSelector());target?.classList.add('editor-guide-target');if(!target)return;}
    const rect=target.getBoundingClientRect();
    const width=card.offsetWidth,height=card.offsetHeight;
    const viewport=window.visualViewport;
    const vw=document.documentElement.clientWidth,vh=viewport?.height||window.innerHeight;
    const viewportTop=viewport?.offsetTop||0;
    const left=Math.max(12,Math.min(step===3?rect.right+12:rect.right-width,vw-width-12));
    // On narrow screens the coachmark sits at the bottom, away from the module controls.
    const top=vw<=860?viewportTop+vh-height-12:rect.bottom+height+22<=vh?rect.bottom+12:Math.max(12,rect.top-height-12);
    card.style.left=`${left}px`;card.style.top=`${Math.max(12,top)}px`;
  }
  function queuePosition(){if(!frame&&!card.hidden)frame=requestAnimationFrame(position);}
  function clearTarget(){target?.classList.remove('editor-guide-target');target=null;}
  function showStep(){
    cancelAnimationFrame(frame);frame=0;
    document.documentElement.classList.add('editor-guide-active');
    clearTarget();
    const current=steps[step];
    card.querySelector('.guide-count').textContent=`使用提示 ${step+1} / ${steps.length}`;
    card.querySelector('h2').textContent=current.title;
    card.querySelector('p').textContent=current.text;
    card.querySelector('[data-guide-prev]').hidden=step===0;
    card.querySelector('[data-guide-blank]').hidden=step!==0||!isSample();
    card.querySelector('[data-guide-next]').textContent=step===steps.length-1?'开始填写':'下一步';
    if(step===3)openEditor(false);
    else{openEditor(true);if(step===4||step===5)selectModule('basic');openModules(step===1||step===2?true:step>=4?false:initialOpen);}
    card.hidden=false;trigger.setAttribute('aria-expanded','true');
    target=document.querySelector(targetSelector());target?.classList.add('editor-guide-target');
    if(step===2||step===4||step===5)target?.scrollIntoView({block:'center',behavior:'instant'});
    position();
  }
  function close({focus=true,restore=true}={}){
    if(card.hidden)return;
    card.hidden=true;clearTarget();trigger.setAttribute('aria-expanded','false');
    document.documentElement.classList.remove('editor-guide-active');
    if(restore){if(window.__tab!==initialTab)selectModule(initialTab);openModules(initialOpen);openEditor(initialEditorOpen);}
    seen=true;try{localStorage.setItem(key,'done');}catch{}
    if(focus&&initialEditorOpen)trigger.focus({preventScroll:true});
  }
  function start({focus=true}={}){
    if(!card.hidden){close();return;}
    initialEditorOpen=!document.querySelector('.resume-workspace')?.classList.contains('editor-collapsed');initialTab=window.__tab||'basic';
    initialOpen=!document.querySelector('#resumeEditorPanel')?.classList.contains('modules-collapsed');openEditor(true);
    step=0;showStep();
    if(focus)card.querySelector('[data-guide-next]').focus({preventScroll:true});
  }
  trigger.onclick=()=>start();
  card.querySelector('[data-guide-close]').onclick=()=>close();
  card.querySelector('[data-guide-prev]').onclick=()=>{step--;showStep();};
  card.querySelector('[data-guide-next]').onclick=()=>{
    if(step<steps.length-1){step++;showStep();}
    else{close({focus:false});selectModule(initialTab);requestAnimationFrame(()=>document.querySelector('#formHost input:not([type="checkbox"]):not([type="file"]),#formHost textarea')?.focus({preventScroll:true}));}
  };
  card.querySelector('[data-guide-blank]').onclick=()=>{
    close({focus:false});document.querySelector('[data-blank]')?.click();selectModule('basic');
  };
  // Escape is shared with drag cancellation; no focus trap and no backdrop.
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!card.hidden){close();event.preventDefault();}});
  window.addEventListener('resize',queuePosition);
  window.visualViewport?.addEventListener('resize',queuePosition);
  window.visualViewport?.addEventListener('scroll',queuePosition);
  document.addEventListener('scroll',queuePosition,true);
  document.querySelector('#formHost')?.addEventListener('focusin',event=>{
    if(event.target.matches('input,select,textarea,[contenteditable=true]'))close({focus:false,restore:false});
  });
  document.querySelector('#formHost')?.addEventListener('input',()=>close({focus:false,restore:false}),true);
  const refresh=()=>{note.hidden=!isSample();queuePosition();};
  refresh();
  // Editor entry removes its startup/inert state after bootEditor returns.
  if(!seen&&isSample()&&!document.querySelector('.qm-template-dialog,dialog[open]'))requestAnimationFrame(()=>start({focus:false}));
  return refresh;
}
