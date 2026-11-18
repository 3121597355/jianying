import sanitizeHtml from './sanitizer.mjs';
import {TEMPLATES,DEFAULT_TPL} from './assets/js/templates.js';
import {normalizeProjectDetails,projectModelContent} from './assets/js/project-fields.js';
import {normalizeBasicFields,normalizeBasicOrder,BASIC_FIELD_KEYS} from './assets/js/basic-fields.js';

export const invalid=(message,status=400)=>Object.assign(new Error(message),{status});
export const text=(value,max=300)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max):'';
export const rich=value=>sanitizeHtml(text(value,30000),{
  allowedTags:['p','br','ul','ol','li','strong','b','em','i','u','s','span','a'],
  allowedAttributes:{a:['href','title'],span:['style'],p:['style']},
  allowedSchemes:['https','http','mailto'],allowProtocolRelative:false,
  allowedStyles:{'*':{'text-align':[/^(left|center|right|justify)$/],'color':[/^#[a-fA-F0-9]{3,8}$/],'font-size':[/^(1[0-9]|2[0-9]|3[0-2])px$/]}},
});
export const plain=value=>sanitizeHtml(text(value,30000).replace(/<\/(?:p|li|div)>|<br\s*\/?>/gi,' '),{allowedTags:[],allowedAttributes:{}}).replace(/\s+/g,' ').trim();
const moduleNames=['yixiang','baokao','jiaoyu','work','project','shixi','xiaoyuan','jineng','zhengshu','pingjia','aihao','make'];
const strings=(input,keys,max=300)=>Object.fromEntries(keys.map(key=>[key,text(input?.[key],max)]));
const numeric=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;

export function normalizeResume(input) {
  if(!input||typeof input!=='object'||!input.basicInfo||!input.setData||!Array.isArray(input.moduleData))throw invalid('简历数据不完整，请从编辑器重新保存。');
  if(Buffer.byteLength(JSON.stringify(input))>2200000)throw invalid('简历超过 2 MB，请缩小照片后再保存。',413);
  const settings=input.setData,basic=input.basicInfo;
  const photo=text(basic.photo,1900000);
  if(photo&&photo!=='/assets/img/landing/portrait-demo.webp'&&!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(photo))throw invalid('云端简历仅支持 PNG、JPG 或 WebP 照片。');
  const result={
    setData:{...strings(settings,['title','slogan','language']),skin:/^#[a-fA-F0-9]{6}$/.test(settings.skin)?settings.skin:'#284967',tplId:TEMPLATES.some(t=>t.id===Number(settings.tplId))?Number(settings.tplId):DEFAULT_TPL,coverId:'',coverShow:0,mm:numeric(settings.mm,24,0,80),pp:numeric(settings.pp,52,0,100),font:numeric(settings.font,1,1,8),fontSize:numeric(settings.fontSize,14,10,24),lineHeight:numeric(settings.lineHeight,1.7,1,3),visitType:1,visitPass:'',zpType:numeric(settings.zpType,0,0,3),basicOrder:Array.isArray(settings.basicOrder)?normalizeBasicOrder(settings.basicOrder).filter(key=>BASIC_FIELD_KEYS.includes(key)):[],moduleSort:Array.isArray(settings.moduleSort)?[...new Set(settings.moduleSort.filter(n=>n==='basic'||moduleNames.includes(n)))]:[]},
    basicInfo:{...strings(basic,['name','birthday','email','mobile','minzu','zhengzhi','jiguan','height','weight','inShort']),sex:numeric(basic.sex,0,0,2),isAge:basic.isAge!==false,workYears:numeric(basic.workYears,-1,-1,60),hunyin:numeric(basic.hunyin,0,0,3),photo,photoShow:basic.photoShow!==false,make:normalizeBasicFields(basic.make)},
    coverData:strings(input.coverData,['name','job','school','mobile','email']),
    zijianData:{visible:input.zijianData?.visible?1:0,content:rich(input.zijianData?.content)},
    moduleData:[],
  };
  // 基本信息顺序只在用户调整过时保存，空数组代表沿用默认版式。
  result.setData.basicOrder=Array.isArray(settings.basicOrder)&&settings.basicOrder.length
    ?normalizeBasicOrder(settings.basicOrder).filter(key=>BASIC_FIELD_KEYS.includes(key)):[];
  for(const name of moduleNames){
    const source=input.moduleData.find(module=>module?.moduleName===name);if(!source)continue;
    const module={moduleName:name,moduleValue:text(source.moduleValue,40),visible:source.visible===true};
    if(name==='yixiang')module.data=strings(source.data,['job','city','money','joinTime']);
    else{
      module.content=rich(source.content);
      module.data=Array.isArray(source.data)?source.data.slice(0,30).map(item=>typeof item==='string'?text(item):{...strings(item,['timeStart','timeEnd','name','major','xueli','job']),today:item?.today===true,content:rich(item?.content),...(name==='project'&&item?.projectDetails&&typeof item.projectDetails==='object'?{projectDetails:normalizeProjectDetails(item.projectDetails)}:{}),...(item?.percent!==undefined?{percent:numeric(item.percent,0,0,100)}:{})}):[];
      if(name==='baokao')Object.assign(module,strings(source,['title','name','major']));
    }
    result.moduleData.push(module);
  }
  for(const name of moduleNames.filter(name=>!result.moduleData.some(m=>m.moduleName===name)))result.moduleData.push({moduleName:name,moduleValue:({yixiang:'求职意向',jiaoyu:'教育背景',work:'工作经历',project:'项目经验',shixi:'实习经历',jineng:'技能特长',pingjia:'自我评价'})[name]||'其他信息',visible:false,content:'',data:name==='yixiang'?{job:'',city:'',money:'',joinTime:''}:[]});
  if(Buffer.byteLength(JSON.stringify(result))>2200000)throw invalid('简历超过保存限制。',413);
  return result;
}

export function modelResume(resume) {
  // The provider receives experience text, never photographs or contact/identity fields.
  return resume.moduleData.filter(m=>m.visible&&m.moduleName!=='baokao').map(module=>({
    moduleName:module.moduleName,title:module.moduleValue,content:plain(module.content),
    entries:Array.isArray(module.data)?module.data.map((entry,index)=>typeof entry==='string'?{index,name:entry}:{index,...strings(entry,['name','major','xueli','job','timeStart','timeEnd']),content:module.moduleName==='project'?projectModelContent(entry,plain):plain(entry.content)}):[],
  }));
}
