import {FONTS,SEX,MARRIAGE,POLITICS,WORK_YEARS,optionalLabel} from './dict.js';
import {getModuleOrder} from './module-order.js';

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

/** Native HTML rendering of the shared resume data model. No reference-site assets. */
export function renderStandard(resume){
  const settings=resume.setData||{},basic=resume.basicInfo||{};
  const size=number(settings.fontSize,10,18,14),gap=number(settings.mm,5,50,24),padding=number(settings.pp,10,80,52),leading=number(settings.lineHeight,1.3,2.2,1.7);
  const color=/^#[\da-f]{6}$/i.test(settings.skin||'')?settings.skin:'#284967';
  const order=getModuleOrder(resume),modules=new Map((resume.moduleData||[]).map(mod=>[mod.moduleName,mod]));
  const intent=modules.get('yixiang'),merged=order.indexOf('yixiang')===order.indexOf('basic')+1;
  const rich=content=>content?`<div class="ql-editor" style="font-size:${size}px;line-height:${leading};margin-top:7px">${content}</div>`:'';
  const section=(mod,content)=>mod?.visible&&content?`<section id="${escape(mod.moduleName)}" class="resume_content" style="margin-top:${gap}px"><div class="module_tit" style="font-size:${size+3}px;color:${color};border-color:${color}">${escape(mod.moduleValue||'')}</div>${content}</section>`:'';
  const timeline=mod=>{
    const rows=(Array.isArray(mod.data)?mod.data:[]).filter(item=>item&&(item.name||item.job||item.major||item.content||item.timeStart||item.timeEnd));
    return rows.map(item=>{
      const labels=[item.name,mod.moduleName==='jiaoyu'?item.major:item.job,mod.moduleName==='jiaoyu'&&item.xueli!=='不填'?item.xueli:''].filter(Boolean);
      return `<div class="content_list" data-item-index="${mod.data.indexOf(item)}" style="margin-top:${Math.round(gap/2)}px"><ul class="list_top"><li class="name">${labels.map(escape).join(' <i>·</i> ')}</li><li class="time">${escape(dates(item))}</li></ul>${rich(item.content)}</div>`;
    }).join('');
  };
  const header=()=>{
    const extra=(Array.isArray(basic.make)?basic.make:[]).filter(item=>item?.value).map(item=>`${item.keyValue||''}：${item.value}`);
    const profile=[basic.isAge===false?basic.birthday:age(basic.birthday),optionalLabel(SEX,basic.sex),basic.minzu,optionalLabel(MARRIAGE,basic.hunyin),basic.height?`${basic.height}cm`:'',basic.weight?`${basic.weight}kg`:'',optionalLabel(POLITICS,basic.zhengzhi),basic.jiguan,Number(basic.workYears)>=0?WORK_YEARS[Number(basic.workYears)+1]:'',...extra];
    const goal=merged&&intent?.visible?intent.data||{}:{};
    const photo=basic.photoShow?`<div class="photo_box${basic.photo?'':' is-default'}" data-photo-slot title="点击更换照片" style="right:${padding}px">${basic.photo?`<img src="${escape(basic.photo)}" alt="照片">`:'<span class="standard-photo-placeholder">添加照片</span>'}</div>`:'';
    return `<header id="basicInfo" class="basic_info_box" style="padding:28px ${padding}px ${Math.round(gap/2)}px${basic.photoShow?'':';min-height:0'}"><dl class="basic_info"${basic.photoShow?'':' style="padding-right:0"'}><dt id="myname">${escape(basic.name||'你的姓名')}</dt>${settings.title||settings.slogan?`<dd id="resumeHead" class="resume-heading">${escape([settings.title,settings.slogan].filter(Boolean).join(' · '))}</dd>`:''}${goal.job||goal.city||goal.money||goal.joinTime?`<dd class="yixiang_tip">${spans([goal.job?`${intent.moduleValue||'求职意向'}：${goal.job}`:'',goal.city,goal.money,goal.joinTime])}</dd>`:''}<dd>${spans(profile)}</dd><dd>${spans([basic.mobile,basic.email])}</dd></dl>${photo}</header>`;
  };
  const render=name=>{
    if(name==='basic')return header();
    const mod=modules.get(name);if(!mod?.visible)return '';
    if(['jiaoyu','work','project','shixi','xiaoyuan'].includes(name))return section(mod,timeline(mod));
    if(name==='yixiang')return merged?'':section(mod,spans(Object.values(mod.data||{})));
    if(name==='jineng'){
      const skills=(Array.isArray(mod.data)?mod.data:[]).map(item=>typeof item==='string'?item:item?.name).filter(Boolean);
      return section(mod,rich(mod.content)+(skills.length?`<ul class="standard-skills">${skills.map(skill=>`<li>${escape(skill)}</li>`).join('')}</ul>`:''));
    }
    if(name==='baokao'){
      const rows=(Array.isArray(mod.data)?mod.data:[]).filter(row=>row&&(row.name||row.score));
      const summary=spans([mod.name?`报考院校：${mod.name}`:'',mod.major?`报考专业：${mod.major}`:'']);
      const table=rows.length?`<table class="baokao_cj"><caption>${escape(mod.title||'')}</caption><tr>${rows.map(row=>`<th>${escape(row.name)}</th>`).join('')}</tr><tr>${rows.map(row=>`<td>${escape(row.score)}</td>`).join('')}</tr></table>`:'';
      return section(mod,summary+table);
    }
    const tags=Array.isArray(mod.data)?mod.data.filter(item=>typeof item==='string'&&item):[];
    return section(mod,rich(mod.content)+(tags.length?`<div class="tag_box">${spans(tags)}</div>`:''));
  };
  const basicIndex=order.indexOf('basic'),parts=order.map(render);
  const wrap=content=>content.some(Boolean)?`<div class="resume_content_all" style="margin:0 ${padding}px">${content.join('')}</div>`:'';
  const font=FONTS.find(item=>item.value===Number(settings.font))||FONTS[0];
  return `<div class="resume_all"><div class="pc_main"><div class="${escape(font.cls)}"><article class="resume_box">${wrap(parts.slice(0,basicIndex))}${parts[basicIndex]}${wrap(parts.slice(basicIndex+1))}</article></div></div></div>`;
}
