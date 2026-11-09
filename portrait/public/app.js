import {presets,sizes,buildPrompt} from './presets.js';
import {quickIds,drawQuickBackground} from './quick-background.js';
import {createReturnNavigation} from './navigation.js';
import {portraitNavigationMarkup} from '/assets/js/workspace-nav.js';
import {createDemo} from '/assets/js/store.js';
import '/assets/js/motion.js';
const $=id=>document.getElementById(id);
const apiUrl=url=>new URL(url.replace(/^\//,''),import.meta.url).pathname;
const state={config:null,token:'',category:'证件底色',presetId:'white',sizeId:'original',original:null,result:null,view:'original',busy:false,jobId:null,history:[],crop:{zoom:1,x:.5,y:.4},toastTimer:null};
let draftReady=false,draftTimer,draftVersion=0,draftDatabase,savedDraftSource,savedDraftResult;
const imageBlobCache=new WeakMap();
document.querySelector('.site-nav').innerHTML=portraitNavigationMarkup();
setupIntegratedTheme();
const figure='<svg class="swatch-figure" viewBox="0 0 50 62" aria-hidden="true"><circle cx="25" cy="19" r="12"/><path d="M2 62V48C2 30 48 30 48 48V62Z"/></svg>';
let modelListVersion=0,availableModels=[];
const manualModelValue='__portrait_manual_model__';
function connectionDraft(){return {baseUrl:$('baseUrl').value,model:$('modelName').value,apiKey:$('apiKey').value,mode:$('requestMode').value,imageField:$('imageField').value};}
function modelConnectionKey(){return JSON.stringify([$('baseUrl').value.trim(),$('apiKey').value]);}
function renderModelChoices(models,{manual=false}={}){
  availableModels=models;const current=$('modelName').value,select=$('modelSelect');select.replaceChildren();
  const add=(parent,value,label)=>{const option=document.createElement('option');option.value=value;option.textContent=label;parent.append(option);};
  if(current&&!models.includes(current))add(select,current,`${current}（当前）`);
  const imageModels=models.filter(id=>/image|dall|flux|stable.diffusion|sdxl|ideogram|recraft|imagen|seedream|kolors/i.test(id));
  for(const [label,list] of [['图像相关',imageModels],['其他模型',models.filter(id=>!imageModels.includes(id))]]){if(!list.length)continue;const group=document.createElement('optgroup');group.label=label;for(const id of list)add(group,id,id);select.append(group);}
  add(select,manualModelValue,'手动输入模型 ID…');
  select.value=manual||!current?manualModelValue:current;$('modelName').hidden=select.value!==manualModelValue;
}
async function loadModels({check=false}={}){
  const version=++modelListVersion,key=modelConnectionKey();
  $('refreshModels').disabled=true;$('modelStatus').textContent='正在读取…';
  try{
    const data=await api('/api/models',{method:'POST',body:connectionDraft()});
    if(version!==modelListVersion||key!==modelConnectionKey()||!$('settingsDialog').open)return;
    const models=Array.isArray(data.models)?data.models.filter(id=>typeof id==='string'):[];
    renderModelChoices(models,{manual:$('modelSelect').value===manualModelValue});
    $('modelStatus').textContent=models.length?`${models.length} 个模型 · 图片编辑能力以平台为准`:'平台列表为空，可手动填写。';
    if(check){$('connectionMessage').hidden=false;$('connectionMessage').textContent=models.includes($('modelName').value)?'连接成功，已找到所选模型。':'连接成功，列表中未找到当前模型。';}
  }catch(e){if(version===modelListVersion){$('modelStatus').textContent=`${e.message} 可手动填写。`;if(check){$('connectionMessage').hidden=false;$('connectionMessage').textContent=e.message;}}}
  finally{if(version===modelListVersion)$('refreshModels').disabled=false;}
}
function invalidateModels(){modelListVersion++;availableModels=[];renderModelChoices([],{manual:$('modelSelect').value===manualModelValue});$('refreshModels').disabled=false;$('modelStatus').textContent='连接已修改，点击刷新列表。';$('connectionMessage').hidden=true;}
function useQuick(){return state.config?.features?.localCutout&&$('processingMode').value!=='cloud'&&quickIds.has(state.presetId);}
function maybeQuickPreview(){if(useQuick()&&state.result?.engine==='local'&&state.original?.cutout){if(state.busy){state.pendingQuick=true;return;}void generateLocal();}}
function visiblePresets(){return state.config?.publicMode?presets.filter(p=>quickIds.has(p.id)):presets;}
function setProcessingCopy(local){$('processingTitle').textContent=local?'正在本机提取人像':'正在等待云端生成背景';$('processingDetail').textContent=local?'完成后切换纯色和渐变，无需再次抠图':'云端整图编辑可能需要数分钟';$('cancelNote').textContent=local?(state.config?.publicMode?'站点服务处理 · 不调用第三方 AI':'照片不离开本机 · 不消耗 API 额度'):'停止后服务商可能仍会完成处理并计费';}
async function generateLocal(){
  if(!state.original||state.busy)return;
  const source=state.original,options=getPromptOptions(),started=performance.now(),reused=!!source.cutout;
  state.localController=new AbortController();
  // Cached compositing is brief: keep the image visible and controls stable.
  if(reused)state.busy=true;else{setProcessingCopy(true);setBusy(true);message('');}
  $('processingTime').textContent=source.cutout?'正在合成新背景…':'正在提取人像，首次需加载本地模型…';
  const timer=setInterval(()=>{$('processingTime').textContent=`已等待 ${((performance.now()-started)/1000).toFixed(1)} 秒 · 本地处理`;},250);
  try{
    if(!source.cutout){
      const response=await fetch(apiUrl('/api/cutout'),{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':state.token},body:JSON.stringify({image:source.data}),signal:state.localController.signal});
      if(!response.ok){const e=await response.json();throw new Error(e.error||'本地抠图失败');}
      const url=URL.createObjectURL(await response.blob());try{source.cutout=await readImage(url);}finally{URL.revokeObjectURL(url);}
      source.cutoutVersion=state.config.features.cutoutVersion;
    }
    if(state.localController.signal.aborted)throw new DOMException('Cancelled','AbortError');
    const canvas=drawQuickBackground(document.createElement('canvas'),source.cutout,options);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('合成背景失败，请重试。');
    const url=URL.createObjectURL(blob);let img;try{img=await readImage(url);}catch(e){URL.revokeObjectURL(url);throw e;}
    if(state.localController.signal.aborted){URL.revokeObjectURL(url);throw new DOMException('Cancelled','AbortError');}
    const elapsed=((performance.now()-started)/1000).toFixed(2);
    const item={id:crypto.randomUUID(),img,url,source,presetId:options.presetId,options,name:presets.find(p=>p.id===options.presetId).name,engine:'local'};
    state.history.unshift(item);if(state.history.length>8){const old=state.history.pop();URL.revokeObjectURL(old.url);}
    state.result=item;state.view='result';renderImage();renderCrop();renderHistory();
    message(`完成 · ${elapsed} 秒${reused?' · 已复用抠图':''}`);
  }catch(e){message(e.name==='AbortError'?'已停止本地处理。':e.message,e.name!=='AbortError');}
  finally{clearInterval(timer);state.localController=null;setBusy(false);if(state.pendingQuick){state.pendingQuick=false;maybeQuickPreview();}}
}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function message(text,error=false){$('resultMessage').textContent=text;$('resultMessage').hidden=!text;$('resultMessage').classList.toggle('error',error);}
async function api(url,{method='GET',body}={}){const r=await fetch(apiUrl(url),{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-App-Token':state.token},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({error:'本地服务返回异常，请重新启动。'}));if(!r.ok)throw new Error(data.error||'操作未完成。');return data;}
function button(text,className,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=className;b.addEventListener('click',action);return b;}
function getPromptOptions(){return {presetId:state.presetId,customColor:$('colorPicker').value,customPrompt:$('customPrompt').value,edge:Number($('edgeTrim').value),decontam:Number($('decontam').value)};}
function refreshPrompt(){const prompt=getPromptOptions();$('promptCount').textContent=`${prompt.customPrompt.length} / 4000`;$('fullPrompt').textContent=buildPrompt(prompt);}
function renderCategories(){const box=$('categoryTabs');box.replaceChildren();for(const category of [...new Set(visiblePresets().map(p=>p.category))]){const b=button(category,category===state.category?'active':'',()=>{state.category=category;renderCategories();renderPresets();});b.role='tab';b.setAttribute('aria-selected',String(category===state.category));box.append(b);}}
function renderPresets(){const box=$('presetGrid');box.replaceChildren();for(const p of visiblePresets().filter(p=>p.category===state.category)){const b=document.createElement('button');b.className=`preset-card${p.id===state.presetId?' active':''}`;b.dataset.id=p.id;b.type='button';b.setAttribute('aria-label',`${p.name} · ${p.tag}`);b.setAttribute('aria-pressed',String(p.id===state.presetId));const swatch=document.createElement('span');swatch.className=`swatch${p.id==='transparent'?' checker':''}`;if(p.id!=='transparent')swatch.style.background=p.color;swatch.innerHTML=figure;const name=document.createElement('span');name.className='preset-name';name.textContent=p.name;const tag=document.createElement('span');tag.className='preset-tag';tag.textContent=p.tag;b.append(swatch,name);if(p.id===state.presetId){const check=document.createElement('span');check.className='preset-check';check.textContent='✓';b.append(check);}b.addEventListener('click',()=>{state.presetId=p.id;renderPresets();refreshPrompt();updateButtons();});box.append(b);}
  const p=presets.find(p=>p.id===state.presetId);$('customColorRow').hidden=p.id!=='custom';
}
function renderSizes(){const box=$('sizePresets');box.replaceChildren();for(const size of sizes){const b=button('',`size-card${state.sizeId===size.id?' active':''}`,()=>{state.sizeId=size.id;resetCrop();renderSizes();renderCrop();updateButtons();});const label=document.createElement('span');label.textContent=size.name;const note=document.createElement('small');note.textContent=size.note;b.append(label,note);b.setAttribute('aria-pressed',String(size.id===state.sizeId));box.append(b);}const size=sizes.find(s=>s.id===state.sizeId);$('dimensionNote').textContent=size.width?`${size.width} × ${size.height} px · 300 DPI`:'保持原始构图';}
function updateConfigUI(){const c=state.config;$('settingsButton').hidden=!!c?.publicMode;$('configBanner').hidden=!!c?.publicMode||!!c?.configured;$('processingMode').querySelector('[value=cloud]').hidden=!!c?.publicMode;$('processingMode').querySelector('[value=cloud]').disabled=!!c?.publicMode;$('connectionDot').classList.toggle('ready',!!c?.configured);$('configBanner').hidden=!!c?.publicMode||!!c?.configured;$('configBanner').querySelector('b').textContent='AI 精修尚未连接';$('bannerText').textContent=' · 快速换底不受影响，可免费使用。';$('settingsButton').title=c?.configured?c.model:'AI 精修为可选扩展，未连接不影响快速换底';updateButtons();}
function updateButtons(){
  const hasImage=!!(state.result||state.original),quick=useQuick();
  $('useResumePhoto').disabled=!hasImage||state.busy;
  document.querySelectorAll('[data-return]').forEach(a=>a.setAttribute('aria-disabled',String(state.busy)));
  schedulePhotoSave();
  $('generateButton').disabled=!state.original||state.busy||!state.config;
  $('generateButton').innerHTML=state.busy?'<span>✦</span> 处理中 <span>…</span>':quick?'<span>ϟ</span> 一键换底 <span>→</span>':!state.config?.configured&&state.original?'<span>✦</span> 连接 AI <span>→</span>':'<span>✦</span> 生成背景 <span>→</span>';
  $('generateHint').textContent=state.busy?'':!state.original?'先上传照片':quick?(state.config?.publicMode?'免费换底 · 不调用第三方 AI':'本地处理 · 免费'):'照片上传云端 · 按平台计费';
  $('modeDescription').textContent=quick?(state.config?.publicMode?'免费人像换底 · 无需 API Key':'人像抠图 · 保留原貌'):'云端生成 · '+(state.config?.model||'未设置模型');
  $('promptModeNote').hidden=true;
  $('edgeSettings').hidden=!quick;$('edgeTrim').disabled=$('decontam').disabled=!state.original;$('promptSection').hidden=quick;$('enableTextMode').hidden=!quick||!!state.config?.publicMode;$('enableTextMode').disabled=state.busy;$('advancedSettings').hidden=quick;
  $('customPrompt').disabled=quick||state.busy;$('processingMode').disabled=state.busy;
  for(const b of document.querySelectorAll('[data-prompt]'))b.disabled=quick||state.busy;
  $('quality').disabled=quick||state.busy;$('resolution').disabled=quick||state.busy;
  $('downloadButton').disabled=!hasImage||state.busy;$('downloadButton').textContent=state.result?'↓ 下载照片':'↓ 下载原图裁切';$('printButton').disabled=!hasImage||state.busy||['original','square'].includes(state.sizeId);$('replacePhoto').disabled=state.busy;$('removePhoto').disabled=state.busy;$('uploadButton').disabled=state.busy;$('settingsButton').disabled=state.busy;$('bannerSettings').disabled=state.busy;$('viewResult').disabled=!state.result;$('viewCompare').disabled=!state.result;
}
async function openSettings(){if(state.busy||state.config?.publicMode)return;const c=state.config;$('baseUrl').value=c?.baseUrl||'';$('modelName').value=c?.model||'image2.5sub';$('apiKey').value='';$('keyStatus').textContent=c?.hasKey?'已保存':'';$('requestMode').value=c?.mode||'multipart';$('imageField').value=c?.imageField||'image[]';$('connectionMessage').hidden=true;renderModelChoices([]);$('modelStatus').textContent='填写连接后读取模型';$('settingsDialog').showModal();if(c?.baseUrl&&c?.hasKey)void loadModels();}
async function saveSettings(check=false){if(!$('settingsForm').reportValidity())return;if(check)return loadModels({check:true});const controls=[$('checkConnection'),$('settingsForm').querySelector('[type=submit]')];controls.forEach(b=>b.disabled=true);const result=$('connectionMessage');modelListVersion++;try{result.hidden=true;state.config=await api('/api/config',{method:'PATCH',body:connectionDraft()});$('apiKey').value='';$('keyStatus').textContent=state.config.hasKey?'已保存':'';updateConfigUI();$('settingsDialog').close();toast('已保存');}catch(e){result.hidden=false;result.textContent=e.message;}finally{controls.forEach(b=>b.disabled=false);$('refreshModels').disabled=false;}}
async function readImage(src){const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('图片无法读取，请换一张照片。'));img.src=src;});if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>40_000_000)throw new Error('照片分辨率过高，请使用不超过 4000 万像素的图片。');return img;}
function fileDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('照片读取失败。'));reader.readAsDataURL(file);});}
async function upload(file){if(!file||state.busy)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('请选择 JPG、PNG 或 WebP 格式的照片');return;}if(file.size>12*1024*1024){toast('照片不能超过 12 MB');return;}try{const data=await fileDataURL(file);const img=await readImage(data);state.original={data,img,name:file.name||'粘贴的照片'};state.result=null;state.view='original';resetCrop();message('');renderImage();renderCrop();updateButtons();}catch(e){toast(e.message);}finally{$('fileInput').value='';}}
async function removePhoto(){
  if(state.busy||(!state.original&&!state.result))return;
  // Invalidate image conversions started by an earlier save before clearing the draft.
  draftVersion++;
  const urls=new Set([state.result?.url,...state.history.map(item=>item.url)].filter(Boolean));
  state.original=null;state.result=null;state.history=[];state.view='original';state.pendingQuick=false;
  for(const url of urls)URL.revokeObjectURL(url);
  $('fileInput').value='';$('compareRange').value='50';resetCrop();
  $('edgeTrim').value='0';$('decontam').value='0';paintEdges();
  $('cropCanvas').getContext('2d').clearRect(0,0,$('cropCanvas').width,$('cropCanvas').height);
  message('');renderImage();renderCrop();renderHistory();updateButtons();$('uploadButton').focus();
  if(await persistPhotoDraft({force:true}))toast('照片已移除');
  else message('照片已移除，但本机保存失败；请检查浏览器存储权限，刷新后可能恢复旧照片。',true);
}
function imageSource(){return state.result?.img||state.original?.img;}
function renderImage(){const source=state.view==='original'?state.original?.img:state.result?.img||state.original?.img;const exists=!!source;$('uploadEmpty').hidden=exists;$('imageArea').hidden=!exists;$('photoActions').hidden=!exists;$('photoInfo').hidden=exists;$('previewCaption').textContent=exists?`${source.naturalWidth} × ${source.naturalHeight} px`:'';for(const key of ['Original','Result','Compare'])$('view'+key).classList.toggle('active',state.view===key.toLowerCase());const compare=state.view==='compare'&&!!state.result;$('compareControls').hidden=!compare;if(!source){$('resultImage').removeAttribute('src');$('originalImage').removeAttribute('src');return;}$('resultImage').src=source.src;$('originalImage').src=state.original.img.src;$('originalOverlay').hidden=!compare;$('compareLine').hidden=!compare;$('originalLabel').hidden=state.view==='result';$('resultLabel').hidden=state.view==='original';fitImage();renderCompare();}
function fitImage(){const source=state.view==='original'?state.original?.img:state.result?.img||state.original?.img;if(!source)return;const area=$('imageArea');const maxWidth=area.clientWidth-32,maxHeight=area.clientHeight-32;const ratio=source.naturalWidth/source.naturalHeight;const h=Math.min(maxHeight,maxWidth/ratio);$('imageFrame').style.width=`${h*ratio}px`;$('imageFrame').style.height=`${h}px`;}
function renderCompare(){const value=Number($('compareRange').value);$('originalOverlay').style.clipPath=`inset(0 ${100-value}% 0 0)`;$('compareLine').style.left=value+'%';}
function resetCrop(){state.crop={zoom:1,x:.5,y:.4};$('zoomRange').value='1';$('horizontalRange').value='50';$('verticalRange').value='40';}
function cropRect(img,width,height){const iw=img.naturalWidth,ih=img.naturalHeight,target=width/height;let sw=iw,sh=ih;if(iw/ih>target)sw=ih*target;else sh=iw/target;sw/=state.crop.zoom;sh/=state.crop.zoom;return [(iw-sw)*state.crop.x,(ih-sh)*state.crop.y,sw,sh];}
function drawPhoto(canvas,img,width,height,flatten=false){canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);if(flatten){ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);}ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,...cropRect(img,width,height),0,0,width,height);return canvas;}
function renderCrop(){const size=sizes.find(s=>s.id===state.sizeId),img=imageSource();$('cropControls').hidden=!img||!size.width;if(img&&size.width){const factor=Math.min(180/size.width,230/size.height);drawPhoto($('cropCanvas'),img,Math.round(size.width*factor),Math.round(size.height*factor));}}
function setBusy(value){state.busy=value;$('processingOverlay').hidden=!value;updateButtons();}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function generate(){if(!state.original||state.busy)return;if(useQuick())return generateLocal();if(!state.config?.configured){openSettings();return;}const source=state.original,options=getPromptOptions();setProcessingCopy(false);setBusy(true);message('');const started=Date.now();$('processingTime').textContent='正在提交照片…';const timer=setInterval(()=>{$('processingTime').textContent=`已等待 ${Math.floor((Date.now()-started)/1000)} 秒 · 等待云端返回`;},1000);let pollErrors=0;
  try{const job=await api('/api/jobs',{method:'POST',body:{...options,image:source.data,quality:$('quality').value,resolution:$('resolution').value}});state.jobId=job.id;while(true){await delay(1500);let status;try{status=await api(`/api/jobs/${job.id}`);pollErrors=0;}catch(e){if(++pollErrors>=5)throw new Error('暂时无法读取处理进度。服务商可能仍在处理，请检查平台记录后再重新提交。');continue;}if(status.status==='cancelled'){message('已停止等待。服务商可能仍在处理此请求，请检查平台记录。');break;}if(status.status==='failed')throw new Error(status.error);if(status.status==='done'){const response=await fetch(apiUrl(`/api/jobs/${job.id}/image`));if(!response.ok)throw new Error('结果下载失败，请稍后再试。');const url=URL.createObjectURL(await response.blob());let img;try{img=await readImage(url);}catch(e){URL.revokeObjectURL(url);throw e;}const item={id:job.id,img,url,source,presetId:options.presetId,options,name:presets.find(p=>p.id===options.presetId).name,warning:status.warning};state.history.unshift(item);if(state.history.length>8){const old=state.history.pop();URL.revokeObjectURL(old.url);}state.result=item;state.original=source;state.view='result';resetCrop();renderImage();renderCrop();renderHistory();message(status.warning||'生成完成');toast('新背景已生成');break;}}
  }catch(e){message(e.message,true);}finally{clearInterval(timer);state.jobId=null;setBusy(false);}
}
async function cancelGeneration(){if(state.localController){state.localController.abort();return;}if(!state.jobId){toast('请求正在提交，请稍候再停止');return;}$('cancelButton').disabled=true;try{await api(`/api/jobs/${state.jobId}/cancel`,{method:'POST',body:{}});}catch(e){toast(e.message);}finally{$('cancelButton').disabled=false;}}
function renderHistory(){const grid=$('historyGrid');grid.replaceChildren();$('historySection').hidden=!state.history.length;for(const item of state.history){const b=document.createElement('button');b.className=`history-card${state.result?.id===item.id?' active':''}`;b.setAttribute('aria-label',`查看${item.name}生成结果`);const img=new Image();img.src=item.url;img.alt=`${item.name}生成结果`;const label=document.createElement('span');label.textContent=item.name;b.append(img,label);b.addEventListener('click',()=>{if(state.busy)return;state.result=item;state.original=item.source;state.view='result';state.presetId=item.presetId;state.category=presets.find(p=>p.id===item.presetId).category;$('edgeTrim').value=item.options.edge||0;$('decontam').value=item.options.decontam||0;paintEdges();$('customPrompt').value=item.options.customPrompt;$('colorPicker').value=item.options.customColor;$('colorHex').value=item.options.customColor.toUpperCase();renderCategories();renderPresets();refreshPrompt();resetCrop();renderImage();renderCrop();renderHistory();updateButtons();message(item.warning||'已载入本次生成结果。');});grid.append(b);}}
function printLayout(size){const candidates=[[1800,1200],[1200,1800]].map(([w,h])=>{const margin=20,gap=20;const cols=Math.floor((w-2*margin+gap)/(size.width+gap)),rows=Math.floor((h-2*margin+gap)/(size.height+gap));return {w,h,cols,rows,gap,count:cols*rows};});return candidates.sort((a,b)=>b.count-a.count)[0];}
async function download(sheet=false){const img=imageSource();if(!img)return;const size=sizes.find(s=>s.id===state.sizeId);let canvas=document.createElement('canvas');let format=$('exportFormat').value;let fileName=`留影-${state.result?.name||'原图'}-${size.name}`;
  if(sheet){if(!size.width||['original','square'].includes(size.id))return;const layout=printLayout(size);canvas.width=layout.w;canvas.height=layout.h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);const photo=drawPhoto(document.createElement('canvas'),img,size.width,size.height,true);const offsetX=(layout.w-layout.cols*size.width-(layout.cols-1)*layout.gap)/2,offsetY=(layout.h-layout.rows*size.height-(layout.rows-1)*layout.gap)/2;for(let y=0;y<layout.rows;y++)for(let x=0;x<layout.cols;x++){const px=offsetX+x*(size.width+layout.gap),py=offsetY+y*(size.height+layout.gap);ctx.drawImage(photo,px,py);ctx.strokeStyle='#d5d9df';ctx.lineWidth=1;ctx.strokeRect(px-.5,py-.5,size.width+1,size.height+1);}format='jpeg';fileName+=`-六寸排版${layout.count}张`;
  }else if(size.width){drawPhoto(canvas,img,size.width,size.height,format==='jpeg');}
  else{canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');if(format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(img,0,0);}
  const target=sheet?$('printButton'):$('downloadButton');target.disabled=true;try{const r=await fetch(apiUrl('/api/export'),{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':state.token},body:JSON.stringify({image:canvas.toDataURL('image/png'),format})});if(!r.ok){const e=await r.json();throw new Error(e.error||'导出失败。');}const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=fileName+(format==='jpeg'?'.jpg':'.png');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);toast(sheet?'六寸排版已下载，打印时请选择实际尺寸':'照片已下载，分辨率标记为 300 DPI');}catch(e){toast(e.message);}finally{updateButtons();}
}
function saved(){try{const value=JSON.parse(localStorage.getItem('portrait-saved-prompts')||'[]');return Array.isArray(value)?value.filter(p=>typeof p==='string'&&p.length<=4000).slice(0,12):[];}catch{return [];}}
function saveList(list){try{localStorage.setItem('portrait-saved-prompts',JSON.stringify(list));renderSaved();}catch{toast('浏览器无法保存收藏，请检查存储设置。');}}
function renderSaved(){const box=$('savedPrompts');box.replaceChildren();for(const text of saved()){const wrap=document.createElement('span');wrap.className='saved-prompt';const b=button(text,'',()=>{$('customPrompt').value=text;refreshPrompt();});b.title=text;const remove=button('×','remove',()=>saveList(saved().filter(p=>p!==text)));remove.setAttribute('aria-label','移除收藏描述');wrap.append(b,remove);box.append(wrap);}}
$('settingsButton').onclick=openSettings;$('bannerSettings').onclick=openSettings;$('closeSettings').onclick=()=>$('settingsDialog').close();$('settingsForm').onsubmit=e=>{e.preventDefault();saveSettings();};$('checkConnection').onclick=()=>saveSettings(true);
$('refreshModels').onclick=()=>loadModels();
$('modelSelect').onchange=()=>{const manual=$('modelSelect').value===manualModelValue;$('modelName').hidden=!manual;if(manual)$('modelName').focus();else $('modelName').value=$('modelSelect').value;$('connectionMessage').hidden=true;};
$('baseUrl').addEventListener('input',invalidateModels);$('apiKey').addEventListener('input',invalidateModels);
$('settingsDialog').addEventListener('close',()=>{modelListVersion++;$('refreshModels').disabled=false;});
$('enableTextMode').onclick=()=>{$('processingMode').value='cloud';updateButtons();$('customPrompt').focus();};
$('removePhoto').onclick=removePhoto;$('uploadButton').onclick=$('replacePhoto').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>upload(e.target.files[0]);
const sampleButton=document.createElement('button');sampleButton.type='button';sampleButton.className='text-button sample-photo';sampleButton.textContent='试用示例照片';sampleButton.title='用示意人像体验本地换底与构图';$('uploadEmpty').append(sampleButton);
sampleButton.onclick=async()=>{try{const response=await fetch('/assets/img/landing/portrait-demo.webp');if(!response.ok)throw new Error();const file=new File([await response.blob()],'示例人像.webp',{type:'image/webp'});await upload(file);}catch{toast('示例照片未能载入，请上传照片。');}};
for(const event of ['dragenter','dragover'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.add('dragover');});for(const event of ['dragleave','drop'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('dragover');if(event==='drop')upload(e.dataTransfer.files[0]);});
document.addEventListener('paste',e=>{if($('settingsDialog').open||['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;const file=[...(e.clipboardData?.items||[])].find(item=>item.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();upload(file);}});
$('customPrompt').oninput=refreshPrompt;$('colorPicker').oninput=()=>{$('colorHex').value=$('colorPicker').value.toUpperCase();refreshPrompt();};$('colorHex').onchange=()=>{if(/^#[\da-f]{6}$/i.test($('colorHex').value)){$('colorPicker').value=$('colorHex').value;refreshPrompt();}else{$('colorHex').value=$('colorPicker').value.toUpperCase();toast('请输入 #RRGGBB 格式的颜色');}};
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{const current=$('customPrompt').value;$('customPrompt').value=(current+(current?'\n':'')+b.dataset.prompt).slice(0,4000);refreshPrompt();});$('clearPrompt').onclick=()=>{$('customPrompt').value='';refreshPrompt();};$('savePrompt').onclick=()=>{const text=$('customPrompt').value.trim();if(!text)return toast('先写一段背景描述再收藏');const list=saved();if(list.includes(text))return toast('这段描述已经收藏');saveList([text,...list].slice(0,12));toast('描述已收藏在此浏览器');};$('copyPrompt').onclick=async()=>{try{await navigator.clipboard.writeText($('fullPrompt').textContent);toast('完整提示词已复制');}catch{toast('无法访问剪贴板，请展开后手动复制。');}};
for(const key of ['Original','Result','Compare'])$('view'+key).onclick=()=>{state.view=key.toLowerCase();renderImage();};$('compareRange').oninput=renderCompare;
for(const id of ['zoomRange','horizontalRange','verticalRange'])$(id).oninput=()=>{state.crop={zoom:Number($('zoomRange').value),x:Number($('horizontalRange').value)/100,y:Number($('verticalRange').value)/100};renderCrop();};$('resetCrop').onclick=()=>{resetCrop();renderCrop();};
$('generateButton').onclick=generate;$('cancelButton').onclick=cancelGeneration;$('downloadButton').onclick=()=>download(false);$('printButton').onclick=()=>download(true);
function paintEdges(){$('edgeValue').textContent=Number($('edgeTrim').value)===0?'默认':Number($('edgeTrim').value)>0?'收缩 '+$('edgeTrim').value:'扩展 '+Math.abs(Number($('edgeTrim').value));$('decontamValue').textContent=$('decontam').value+'%';}
let edgeFrame;for(const id of ['edgeTrim','decontam'])$(id).oninput=()=>{paintEdges();cancelAnimationFrame(edgeFrame);edgeFrame=requestAnimationFrame(maybeQuickPreview);};
$('resetEdges').onclick=()=>{$('edgeTrim').value=0;$('decontam').value=0;paintEdges();maybeQuickPreview();};
$('processingMode').onchange=()=>{updateButtons();maybeQuickPreview();};
$('presetGrid').addEventListener('click',()=>maybeQuickPreview());
$('colorPicker').addEventListener('change',()=>maybeQuickPreview());$('colorHex').addEventListener('change',()=>maybeQuickPreview());
new ResizeObserver(fitImage).observe($('dropzone'));
window.addEventListener('beforeunload',e=>{if(state.busy){e.preventDefault();e.returnValue='';}});
renderCategories();renderPresets();renderSizes();refreshPrompt();renderSaved();
try{const {token,...config}=await api('/api/config');state.token=token;state.config=config;if(config.publicMode){$('processingMode').value='auto';if(!quickIds.has(state.presetId)){state.presetId='white';state.category='证件底色';}renderCategories();renderPresets();}if(!config.features?.localCutout){$('processingMode').value='cloud';$('processingMode').querySelector('option[value="auto"]').disabled=true;message('当前本机处理服务不可用，请刷新页面或重启简影。');}updateConfigUI();}catch(e){message('无法连接证件照服务，请刷新页面或重新启动简影。',true);}
await restorePhotoDraft();
draftReady=true;
document.querySelector('main').addEventListener('input',schedulePhotoSave);
document.querySelector('main').addEventListener('change',schedulePhotoSave);
document.querySelector('main').addEventListener('click',schedulePhotoSave);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void persistPhotoDraft();});
const returnLinks=[...document.querySelectorAll('[data-return]')];
const returnToPage=createReturnNavigation({
  save:()=>persistPhotoDraft(),
  navigate:destination=>location.assign(destination),
  isBusy:()=>state.busy,
  onBusy:()=>toast('请等待处理完成，或先停止等待。'),
  onPending:pending=>returnLinks.forEach(link=>link.setAttribute('aria-disabled',String(pending))),
});
returnLinks.forEach(link=>link.addEventListener('click',e=>{
  e.preventDefault();
  // Capture the exact internal destination before starting the asynchronous save.
  void returnToPage(link.getAttribute('href'));
}));
$('useResumePhoto').onclick=applyResumePhoto;

function setupIntegratedTheme(){
  const button=$('themeButton');
  const paint=()=>{
    let dark=false;try{dark=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}').theme==='dark';}catch{}
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#15171c':'#ffffff');
    button.setAttribute('aria-label',dark?'切换到浅色模式':'切换到深色模式');button.setAttribute('aria-pressed',String(dark));
    button.innerHTML=dark?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13a8.6 8.6 0 0 1-9.5-9.5A8.6 8.6 0 1 0 20.5 13Z"/></svg>';
  };
  button.onclick=()=>{try{const ui=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}');ui.theme=ui.theme==='dark'?'light':'dark';localStorage.setItem('qmj-clone:ui',JSON.stringify(ui));paint();}catch{toast('主题设置未能保存。');}};
  window.addEventListener('storage',e=>{if(e.key==='qmj-clone:ui')paint();});paint();
}
function photoPreferences(){return {category:state.category,presetId:state.presetId,sizeId:state.sizeId,view:state.view,crop:{...state.crop},customColor:$('colorPicker').value,customPrompt:$('customPrompt').value,mode:$('processingMode').value,edge:Number($('edgeTrim').value),decontam:Number($('decontam').value),format:$('exportFormat').value,quality:$('quality').value,resolution:$('resolution').value};}
function draftStatus(text,status){$('draftStatus').textContent=text;$('draftStatus').dataset.state=status;}
function schedulePhotoSave(){
  if(!draftReady)return;
  try{localStorage.setItem('qmj-clone:portrait-ui',JSON.stringify(photoPreferences()));}catch{}
  clearTimeout(draftTimer);draftTimer=setTimeout(persistPhotoDraft,250);
}
function openDraftDatabase(){
  return draftDatabase ||= new Promise((resolve,reject)=>{const request=indexedDB.open('qmj-clone:portrait',1);request.onupgradeneeded=()=>request.result.createObjectStore('draft');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
async function draftRecord(value){
  const db=await openDraftDatabase();return new Promise((resolve,reject)=>{const transaction=db.transaction('draft',value===undefined?'readonly':'readwrite');const store=transaction.objectStore('draft');const request=value===undefined?store.get('current'):store.put(value,'current');let result;request.onsuccess=()=>{result=request.result;};transaction.oncomplete=()=>resolve(result);transaction.onerror=transaction.onabort=()=>reject(transaction.error);});
}
function imageBlob(img){if(imageBlobCache.has(img))return imageBlobCache.get(img);const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);const pending=new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('保存图像失败')),'image/png'));imageBlobCache.set(img,pending);return pending;}
async function persistPhotoDraft({force=false}={}){
  if(!draftReady)return true;
  clearTimeout(draftTimer);const version=++draftVersion;
  const original=state.original,result=state.result,preferences=photoPreferences();
  try{
    localStorage.setItem('qmj-clone:portrait-ui',JSON.stringify(preferences));
    if(!force&&original===savedDraftSource&&result===savedDraftResult){draftStatus('照片与构图已自动保存到本机','saved');return true;}
    draftStatus('正在保存照片与构图…','saving');
    const record={preferences,original:original?{data:original.data,name:original.name,cutout:original.cutout?await imageBlob(original.cutout):null,cutoutVersion:original.cutoutVersion}:null,result:result?{blob:await imageBlob(result.img),id:result.id,name:result.name,presetId:result.presetId,options:result.options,engine:result.engine,warning:result.warning}:null};
    if(version!==draftVersion)return true;
    await draftRecord(record);savedDraftSource=original;savedDraftResult=result;draftStatus('照片与构图已自动保存到本机','saved');return true;
  }catch(error){console.warn('portrait draft save failed',error.name);draftStatus('照片保存失败，请先下载照片再离开','error');return false;}
}
async function restorePhotoDraft(){
  try{
    const record=await draftRecord();if(!record)return;
    let preferences=record.preferences||{};try{preferences={...preferences,...JSON.parse(localStorage.getItem('qmj-clone:portrait-ui')||'{}')};}catch{}
    const preset=visiblePresets().find(p=>p.id===preferences.presetId);if(preset){state.presetId=preset.id;state.category=visiblePresets().some(p=>p.category===preferences.category)?preferences.category:preset.category;}
    if(sizes.some(s=>s.id===preferences.sizeId))state.sizeId=preferences.sizeId;
    if(record.original){const original=record.original;state.original={data:original.data,name:original.name,img:await readImage(original.data)};if(original.cutout&&original.cutoutVersion===state.config?.features.cutoutVersion){state.original.cutoutVersion=original.cutoutVersion;const url=URL.createObjectURL(original.cutout);try{state.original.cutout=await readImage(url);}finally{URL.revokeObjectURL(url);}}}
    if(record.result&&state.original){const result=record.result,url=URL.createObjectURL(result.blob);state.result={...result,url,img:await readImage(url),source:state.original};state.history=[state.result];}
    state.view=state.result&&['result','compare'].includes(preferences.view)?preferences.view:'original';
    if(preferences.crop&&[preferences.crop.zoom,preferences.crop.x,preferences.crop.y].every(Number.isFinite)){state.crop={zoom:Math.max(1,Math.min(2.5,preferences.crop.zoom)),x:Math.max(0,Math.min(1,preferences.crop.x)),y:Math.max(0,Math.min(1,preferences.crop.y))};}
    $('zoomRange').value=state.crop.zoom;$('horizontalRange').value=state.crop.x*100;$('verticalRange').value=state.crop.y*100;
    if(/^#[\da-f]{6}$/i.test(preferences.customColor||'')){$('colorPicker').value=preferences.customColor;$('colorHex').value=preferences.customColor.toUpperCase();}
    $('customPrompt').value=String(preferences.customPrompt||'').slice(0,4000);
    for(const [id,key] of [['processingMode','mode'],['exportFormat','format'],['quality','quality'],['resolution','resolution']]){if([...$(id).options].some(o=>o.value===preferences[key]))$(id).value=preferences[key];}
    if(state.config?.publicMode)$('processingMode').value='auto';
    $('edgeTrim').value=Math.max(-20,Math.min(20,Number(preferences.edge)||0));$('decontam').value=Math.max(0,Math.min(100,Number(preferences.decontam)||0));paintEdges();
    renderCategories();renderPresets();renderSizes();refreshPrompt();renderImage();renderCrop();renderHistory();updateButtons();savedDraftSource=state.original;savedDraftResult=state.result;draftStatus(state.original?'已恢复上次照片与构图':'照片设置已恢复，可上传新照片','saved');
  }catch{draftStatus('上次照片未能恢复，可重新上传','error');}
}
async function applyResumePhoto(){
  const img=imageSource();if(!img||state.busy)return;
  const button=$('useResumePhoto');button.disabled=true;
  try{
    const size=sizes.find(s=>s.id===state.sizeId);const ratio=Math.min(1,700/Math.max(size.width||img.naturalWidth,size.height||img.naturalHeight));
    const width=Math.round((size.width||img.naturalWidth)*ratio),height=Math.round((size.height||img.naturalHeight)*ratio);
    const canvas=drawPhoto(document.createElement('canvas'),img,width,height);
    const resume=JSON.parse(localStorage.getItem('qmj-clone:resume')||'null')||createDemo();
    resume.basicInfo.photo=canvas.toDataURL('image/png');resume.basicInfo.photoShow=true;
    const ui=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}');Object.assign(ui,{tab:'basic',editOpen:true,savedAt:Date.now()});
    localStorage.setItem('qmj-clone:resume',JSON.stringify(resume));localStorage.setItem('qmj-clone:ui',JSON.stringify(ui));
    if(!await persistPhotoDraft())return;
    location.assign('/resume/?portrait=applied');
  }catch{toast('照片未能写入简历，请先下载照片后手动上传。');}finally{button.disabled=false;}
}
