const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max):'';
export const PROJECT_FIELDS=[
  {key:'summary',label:'项目简介',max:1800,placeholder:'面向谁，解决什么问题，提供什么能力？建议 1～2 句话。'},
  {key:'content',label:'个人贡献'},
  {key:'outcome',label:'项目成果',max:2400,placeholder:'写已交付的能力、上线情况、验证结果或真实数据。没有用户量也可以写交付成果。'},
  {key:'techStack',label:'技术栈',max:500,placeholder:'如：JavaScript、Node.js、PostgreSQL、Vercel'},
  {key:'website',label:'项目地址',max:1000,placeholder:'https://example.com'},
  {key:'repository',label:'源码地址',max:1000,placeholder:'https://github.com/用户名/项目'},
];
export const PROJECT_SPACING=[
  {value:'compact',label:'紧凑',paragraph:2,section:4},
  {value:'balanced',label:'适中',paragraph:5,section:8},
  {value:'airy',label:'舒展',paragraph:9,section:12},
];
export const projectSpacing=input=>PROJECT_SPACING.find(option=>option.value===input?.layout?.spacing)||PROJECT_SPACING[1];
export function createProjectDetails(){return {summary:'',outcome:'',techStack:'',website:'',repository:'',visible:Object.fromEntries(PROJECT_FIELDS.map(f=>[f.key,true])),layout:{spacing:'balanced'}};}
export function normalizeProjectDetails(input){
  const result=createProjectDetails();
  for(const field of PROJECT_FIELDS){if(field.key!=='content')result[field.key]=text(input?.[field.key],field.max);result.visible[field.key]=input?.visible?.[field.key]!==false;}
  result.layout.spacing=projectSpacing(input).value;
  return result;
}
export const projectFieldShown=(item,key)=>item?.projectDetails?.visible?.[key]!==false;
export function safeProjectUrl(value){
  try{const url=new URL(String(value||'').trim());return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
const projectUrlLabel=url=>url.replace(/^https?:\/\//,'').replace(/^www\./i,'').replace(/\/$/,'');
export function projectWebsiteLink(item){
  const url=safeProjectUrl(item?.projectDetails?.website);
  return projectFieldShown(item,'website')&&url?{url,label:projectUrlLabel(url)}:null;
}
export function renderProjectBody(item){
  const detail=normalizeProjectDetails(item.projectDetails),rows=[];
  const field=(key,label)=>{if(projectFieldShown(item,key)&&detail[key].trim())rows.push(`<p class="resume-project-field"><strong>${label}：</strong>${escape(detail[key].trim()).replace(/\n/g,'<br>')}</p>`);};
  const link=(key,label)=>{
    const url=safeProjectUrl(detail[key]);
    if(projectFieldShown(item,key)&&url){
      const display=projectUrlLabel(url);
      rows.push(`<p class="resume-project-field resume-project-link"><strong>${label}：</strong><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(display)}</a></p>`);
    }
  };
  field('summary','项目简介');
  const hasContent=String(item.content||'').replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160);/g,' ').trim();
  if(projectFieldShown(item,'content')&&hasContent)rows.push(item.projectDetails?`<div class="resume-project-contribution"><strong class="resume-project-label">个人贡献：</strong><div class="resume-project-content">${item.content}</div></div>`:item.content);
  field('outcome','项目成果');field('techStack','技术栈');
  link('repository','源码地址');
  if(!rows.length)return '';
  if(!item.projectDetails)return rows.join('');
  const spacing=projectSpacing(detail);
  return `<div class="resume-project-body" data-project-spacing="${spacing.value}" style="--project-paragraph-gap:${spacing.paragraph}px;--project-section-gap:${spacing.section}px">${rows.join('')}</div>`;
}
export function projectModelContent(item,plain){
  const detail=normalizeProjectDetails(item.projectDetails);
  return ['summary','content','outcome','techStack'].filter(key=>projectFieldShown(item,key)).map(key=>plain(key==='content'?item.content:detail[key])).filter(Boolean).join(' ');
}
