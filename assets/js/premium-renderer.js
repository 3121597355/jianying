import {FONTS,SEX,MARRIAGE,POLITICS,WORK_YEARS,optionalLabel,degreeLabel} from './dict.js';
import {getModuleOrder} from './module-order.js';
import {renderProjectBody,projectWebsiteLink} from './project-fields.js';
import {normalizeBasicFields,normalizeBasicOrder,isCustomBasicKey,customBasicIndex} from './basic-fields.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=(value,min,max,fallback)=>Math.min(max,Math.max(min,Number(value)||fallback));
const month=value=>/^\d{4}-\d{2}/.test(value||'')?String(value).slice(0,7).replace('-','.'):String(value||'');
const dates=item=>[month(item.timeStart),item.today?'至今':month(item.timeEnd)].filter(Boolean).join(' - ');
const spans=values=>values.filter(value=>value!==''&&value!==null&&value!==undefined).map(value=>`<span>${escape(value)}</span>`).join('');
function age(birth){
  if(!/^\d{4}-\d{2}(?:-\d{2})?$/.test(birth||''))return '';
  const [year,mon,day=1]=birth.split('-').map(Number),now=new Date();
  const years=now.getFullYear()-year-Number(now.getMonth()+1<mon||(now.getMonth()+1===mon&&now.getDate()<day));
  return years>0?`${years}岁`:'';
}

/**
 * 双栏版式：侧栏集中姓名、照片、联系方式与技能，正文只放经历主线。
 * 仍复用原有数据契约（moduleSort / basicOrder / 富文本 / 项目字段），因此草稿与导出链路不变。
 */
export const PREMIUM_LAYOUTS={
  sidebar:{rail:['jineng','zhengshu','aihao'],main:['yixiang','baokao','jiaoyu','work','shixi','project','xiaoyuan','pingjia','make']},
  'sidebar-light':{rail:['jineng','zhengshu','aihao'],main:['yixiang','baokao','jiaoyu','work','shixi','project','xiaoyuan','pingjia','make']},
  swiss:{side:['jineng','zhengshu','aihao','make'],main:['yixiang','baokao','jiaoyu','work','shixi','project','xiaoyuan','pingjia']},
  banner:{side:['jineng','zhengshu','aihao','make'],main:['yixiang','baokao','jiaoyu','work','shixi','project','xiaoyuan','pingjia']},
};

export function renderPremium(resume,{layout='sidebar'}={}){
  const config=PREMIUM_LAYOUTS[layout]||PREMIUM_LAYOUTS.sidebar;
  const settings=resume.setData||{},basic=resume.basicInfo||{};
  const size=number(settings.fontSize,10,18,14),gap=number(settings.mm,5,50,24),padding=number(settings.pp,10,80,44),leading=number(settings.lineHeight,1.3,2.2,1.65);
  const color=/^#[\da-f]{6}$/i.test(settings.skin||'')?settings.skin:'#22405c';
  const order=getModuleOrder(resume),modules=new Map((resume.moduleData||[]).map(mod=>[mod.moduleName,mod]));
  const basicOrder=normalizeBasicOrder(settings.basicOrder);
  const customItems=normalizeBasicFields(basic.make).map(item=>item.visible&&item.value.trim()?item:null);

  const experience=basic.workYears!==''&&basic.workYears!==null&&basic.workYears!==undefined&&Number(basic.workYears)>=0?WORK_YEARS[Number(basic.workYears)+1]:'';
  const basicValue=key=>({
    name:basic.name||'你的姓名',
    sex:optionalLabel(SEX,basic.sex),
    birthday:basic.isAge===false?basic.birthday:age(basic.birthday),
    workYears:experience,
    mobile:basic.mobile,
    email:basic.email,
    hunyin:optionalLabel(MARRIAGE,basic.hunyin),
    height:basic.height?`${basic.height}cm`:'',
    weight:basic.weight?`${basic.weight}kg`:'',
    minzu:basic.minzu,
    jiguan:basic.jiguan,
    zhengzhi:optionalLabel(POLITICS,basic.zhengzhi),
  })[key]||'';

  // 侧栏/副栏的「基本信息」：按用户排序输出，身高体重合并成两行。
  const factLabels={sex:'性别',birthday:basic.isAge===false?'出生年月':'年龄',workYears:'工作年限',hunyin:'婚姻状况',minzu:'民族',jiguan:'籍贯',zhengzhi:'政治面貌'};
  const facts=[];
  for(const key of basicOrder){
    if(key==='name'||key==='photo'||key==='mobile'||key==='email'||key==='weight')continue;
    if(isCustomBasicKey(key)){
      const item=customItems[customBasicIndex(key)];
      if(item)facts.push([item.keyValue.trim()||'其他',item.value.trim()]);
      continue;
    }
    if(key==='height'){
      if(basic.height)facts.push(['身高',`${basic.height}cm`]);
      if(basic.weight)facts.push(['体重',`${basic.weight}kg`]);
      continue;
    }
    if(factLabels[key]){const value=basicValue(key);if(value)facts.push([factLabels[key],value]);}
  }
  const contacts=[basic.mobile,basic.email].filter(value=>String(value||'').trim());
  const headingText=[settings.title,settings.slogan].filter(Boolean).join(' · ');

  const rich=content=>content?`<div class="ql-editor p-rich" style="font-size:${size}px;line-height:${leading}">${content}</div>`:'';
  const titleTag=(label,rail)=>`<h3 class="${rail?'p-rail-tit':'p-title'}">${escape(label)}</h3>`;

  const timeline=mod=>{
    const rows=(Array.isArray(mod.data)?mod.data:[]).filter(item=>item);
    return rows.map(item=>{
      const body=mod.moduleName==='project'?renderProjectBody(item):item.content;
      const website=mod.moduleName==='project'?projectWebsiteLink(item):null;
      if(!(item.name||item.job||item.major||body||website||item.timeStart||item.timeEnd))return '';
      const degree=mod.moduleName==='jiaoyu'?degreeLabel(item.xueli):'';
      const labels=[item.name,mod.moduleName==='jiaoyu'?item.major:item.job,degree&&degree!=='不填'?degree:''].filter(Boolean);
      const address=website?`<span class="p-link">${labels.length?'<i>·</i>':''}<span class="p-link-label">项目地址：</span><a href="${escape(website.url)}" target="_blank" rel="noopener noreferrer" title="打开项目地址">${escape(website.label)}</a></span>`:'';
      return `<div class="content_list p-item" data-item-index="${mod.data.indexOf(item)}"><div class="p-item-head"><div class="p-item-name">${labels.map(escape).join(' <i>·</i> ')}${address}</div><div class="p-item-date">${escape(dates(item))}</div></div>${body?`<div class="ql-editor p-body" style="font-size:${size}px;line-height:${leading}">${body}</div>`:''}</div>`;
    }).join('');
  };

  const blockInner=mod=>{
    const name=mod.moduleName;
    if(['jiaoyu','work','project','shixi','xiaoyuan'].includes(name))return timeline(mod);
    if(name==='yixiang'){
      const goal=mod.data||{};
      return spans([goal.job?`${mod.moduleValue||'求职意向'}：${goal.job}`:'',goal.city?`意向城市：${goal.city}`:'',goal.money?`期望薪资：${goal.money}`:'',goal.joinTime?`到岗时间：${goal.joinTime}`:'']);
    }
    if(name==='jineng'){
      const skills=(Array.isArray(mod.data)?mod.data:[]).map(item=>typeof item==='string'?item:item?.name).filter(Boolean);
      return rich(mod.content)+(skills.length?`<ul class="p-skills">${skills.map(skill=>`<li>${escape(skill)}</li>`).join('')}</ul>`:'');
    }
    if(name==='baokao'){
      const rows=(Array.isArray(mod.data)?mod.data:[]).filter(row=>row&&(row.name||row.score));
      const summary=spans([mod.name?`报考院校：${mod.name}`:'',mod.major?`报考专业：${mod.major}`:'']);
      const table=rows.length?`<table class="p-table">${mod.title?`<caption>${escape(mod.title)}</caption>`:''}<tr>${rows.map(row=>`<th>${escape(row.name)}</th>`).join('')}</tr><tr>${rows.map(row=>`<td>${escape(row.score)}</td>`).join('')}</tr></table>`:'';
      return summary+table;
    }
    const tags=Array.isArray(mod.data)?mod.data.filter(item=>typeof item==='string'&&item):[];
    return rich(mod.content)+(tags.length?`<div class="p-tags">${spans(tags)}</div>`:'');
  };

  const section=(mod,{rail=false}={})=>{
    if(!mod?.visible)return '';
    const inner=blockInner(mod);
    if(!inner)return '';
    return `<section id="${escape(mod.moduleName)}" class="resume_content p-section${rail?' p-section-rail':''}" style="margin-top:${Math.round(gap*(rail?0.72:1))}px">${titleTag(mod.moduleValue||'',rail)}${inner}</section>`;
  };

  const mainSections=order.filter(name=>config.main.includes(name)).map(name=>section(modules.get(name))).join('');
  const railSections=order.filter(name=>config.rail?.includes(name)).map(name=>section(modules.get(name),{rail:true})).join('');
  const sideSections=order.filter(name=>config.side?.includes(name)).map(name=>section(modules.get(name),{rail:true})).join('');

  const factsList=className=>facts.length?`<dl class="${className}">${facts.map(([label,value])=>`<dd><span class="p-fact-label">${escape(label)}</span><span class="p-fact-value">${escape(value)}</span></dd>`).join('')}</dl>`:'';
  const factsSection=()=>facts.length?`<section class="resume_content p-section p-facts-section" style="margin-top:${gap}px"><h3 class="p-title">基本信息</h3>${factsList('p-facts-grid')}</section>`:'';
  const photo=variant=>basic.photoShow?`<div class="p-photo p-photo-${variant}" data-photo-slot title="点击更换照片">${basic.photo?`<img src="${escape(basic.photo)}" alt="照片">`:'<span>添加照片</span>'}</div>`:'';
  const contactLine=separator=>contacts.length?`<p class="p-contacts">${contacts.map(escape).join(`<i>${separator}</i>`)}</p>`:'';

  let content='';
  if(config.rail){
    content=`<aside class="p-rail" id="basicInfo">${photo('circle')}<div class="p-rail-name" id="myname">${escape(basic.name||'你的姓名')}</div>${headingText?`<p class="p-rail-role">${escape(headingText)}</p>`:''}${contactLine('·')}${facts.length?`<div class="p-rail-block"><h3 class="p-rail-tit">基本信息</h3>${factsList('p-facts')}</div>`:''}${railSections}</aside><main class="p-main">${mainSections}</main>`;
  }else if(layout==='swiss'){
    content=`<header class="p-swiss-head" id="basicInfo"><div class="p-swiss-id"><h1 id="myname">${escape(basic.name||'你的姓名')}</h1>${headingText?`<p class="p-swiss-role">${escape(headingText)}</p>`:''}${contactLine('·')}</div>${photo('square')}</header><div class="p-cols p-cols-swiss"><div class="p-col-main">${mainSections}</div><aside class="p-col-side">${factsSection()}${sideSections}</aside></div>`;
  }else{
    content=`<header class="p-banner" id="basicInfo"><div class="p-banner-text"><h1 id="myname">${escape(basic.name||'你的姓名')}</h1>${headingText?`<p class="p-banner-role">${escape(headingText)}</p>`:''}${contactLine('·')}</div>${photo('banner')}</header><div class="p-cols p-cols-banner"><aside class="p-col-side">${factsSection()}${sideSections}</aside><div class="p-col-main">${mainSections}</div></div>`;
  }

  const font=FONTS.find(item=>item.value===Number(settings.font))||FONTS[0];
  return `<div class="resume_all premium-resume premium-${layout}" style="--standard-font:${size}px;--standard-line:${leading};--standard-accent:${color};--p-pad:${padding}px"><div class="pc_main"><div class="${escape(font.cls)}"><article class="resume_box premium-box">${content}</article></div></div></div>`;
}
