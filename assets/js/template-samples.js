// The gallery and editor share this fictional, editable example. It is not user data.
import {MODULES} from './dict.js';
import {createProjectDetails} from './project-fields.js';
const sample={
  setData:{skin:'#284967',font:1,fontSize:14,mm:24,pp:52,lineHeight:1.7,title:'',slogan:'',moduleSort:['basic','yixiang','work','project','jiaoyu','jineng','pingjia']},
  basicInfo:{name:'林予安',sex:2,birthday:'1997-06',mobile:'138 0000 0000',email:'hello@example.com',workYears:6,isAge:false,photo:'/assets/img/landing/portrait-demo.webp',photoShow:true,make:[],minzu:'汉族',zhengzhi:3,jiguan:'浙江杭州',hunyin:2,height:'',weight:'',inShort:''},
  moduleData:[
    {moduleName:'yixiang',moduleValue:'求职意向',visible:true,data:{job:'产品经理',city:'杭州',money:'',joinTime:''}},
    {moduleName:'work',moduleValue:'工作经历',visible:true,data:[
      {name:'星桥科技',job:'产品经理',timeStart:'2023-07',timeEnd:'2026-10',today:false,content:'<ul><li>负责协作平台的需求分析、产品规划与迭代，服务 120 余家企业客户。</li><li>梳理新用户使用路径，重构引导流程，核心功能使用率提升 28%。</li></ul>'},
      {name:'知行数字',job:'产品专员',timeStart:'2021-07',timeEnd:'2023-06',today:false,content:'<ul><li>参与企业服务产品从调研到上线的全过程，独立完成需求文档与原型设计。</li><li>通过用户访谈和行为数据定位体验问题，推动 12 项功能优化。</li></ul>'},
    ]},
    {moduleName:'project',moduleValue:'项目经历',visible:true,data:[
      {name:'企业协作平台体验升级',job:'项目负责人',timeStart:'2024-03',timeEnd:'2024-11',today:false,content:'<ul><li>围绕任务管理、消息通知和团队空间，设计统一的交互规则与信息架构。</li><li>制定分阶段上线方案，与研发团队完成灰度验证及用户反馈跟进。</li></ul>',projectDetails:{...createProjectDetails(),summary:'统一企业协作平台的任务、通知与团队空间体验。',outcome:'上线后关键任务完成时间缩短 22%，用户满意度提升至 4.7 / 5。'}},
    ]},
    {moduleName:'jiaoyu',moduleValue:'教育背景',visible:true,data:[
      {name:'浙江工商大学',major:'信息管理与信息系统',xueli:'本科',timeStart:'2017-09',timeEnd:'2021-06',today:false,content:'<p>主修管理学、数据库原理、统计学及信息系统分析与设计；获校级奖学金。</p>'},
    ]},
    {moduleName:'jineng',moduleValue:'专业技能',visible:true,content:'<ul><li>熟悉用户研究、需求分析、产品规划及跨团队项目管理。</li><li>熟练使用 Figma、Axure 与 SQL，能结合业务目标开展数据分析。</li></ul>',data:[{name:'用户研究',percent:85},{name:'产品设计',percent:90},{name:'数据分析',percent:80},{name:'项目管理',percent:85}]},
    {moduleName:'pingjia',moduleValue:'个人简介',visible:true,content:'<p>具备企业服务产品经验，擅长需求拆解与跨团队协作，关注实际交付和用户反馈。</p>'},
    {moduleName:'baokao',moduleValue:'报考信息',visible:false,title:'',name:'',major:'',data:[]},
    {moduleName:'shixi',moduleValue:'实习经历',visible:false,data:[]},
    {moduleName:'xiaoyuan',moduleValue:'校园经历',visible:false,data:[]},
    {moduleName:'zhengshu',moduleValue:'荣誉证书',visible:false,content:''},
    {moduleName:'aihao',moduleValue:'兴趣爱好',visible:false,content:'',data:[]},
    {moduleName:'make',moduleValue:'自定义模块',visible:false,content:''},
  ],
};

export const TEMPLATE_SAMPLE_KINDS=['professional','graduate','developer'];
export function createTemplateSample(id,kind='professional'){
  const resume=structuredClone(sample);resume.setData.tplId=Number(id);
  if(['graduate','developer'].includes(kind)){
    const developer=kind==='developer';
    Object.assign(resume.basicInfo,{name:'陈同学',sex:1,birthday:'2005-03',workYears:0,photo:'',photoShow:false,email:'student@example.com',minzu:'汉族',zhengzhi:3,jiguan:'江苏南京',hunyin:2});
    resume.setData.moduleSort=['basic','yixiang','jiaoyu','project','xiaoyuan','jineng'];
    const mod=name=>resume.moduleData.find(item=>item.moduleName===name);
    mod('yixiang').data={job:developer?'前端开发实习生':'产品运营实习生',city:'',money:'',joinTime:''};
    mod('jiaoyu').data=[{name:'示例大学',major:developer?'计算机科学与技术':'信息管理与信息系统',xueli:'本科',timeStart:'2023-09',timeEnd:'2027-06',today:false,content:developer?'<p>相关课程：数据结构、计算机网络、数据库原理、软件工程。</p>':'<p>相关课程：统计学、市场调研、数据库原理、信息系统分析与设计。</p>'}];
    mod('work').visible=false;mod('work').data=[];
    mod('pingjia').visible=false;mod('pingjia').content='';
    mod('project').data=[{name:developer?'校园活动报名工具':'校园活动报名流程改进',job:developer?'前端开发（课程项目）':'需求分析与流程设计（课程项目）',timeStart:'2026-03',timeEnd:'2026-06',today:false,content:developer?'<ul><li>将报名、结果提示和名单管理拆分为独立页面，实现表单校验与提交状态反馈。</li><li>接入后端报名接口，处理请求失败和重复点击，在手机上验证填写与滚动流程。</li><li>整理功能测试清单，复现空输入和接口异常，修正错误提示并交付可运行演示。</li></ul>':'<ul><li>梳理活动报名、确认与名单整理流程，记录重复填写、状态不清等问题。</li><li>设计报名表单和结果提示原型，与组员确认字段、规则及异常情况。</li><li>组织同学按任务试用原型，根据反馈调整提示语与字段顺序。</li></ul>',projectDetails:{...createProjectDetails(),summary:'为校园活动提供报名、结果确认与名单管理，减少组织者手工整理信息的步骤。',outcome:developer?'交付报名与名单管理演示，完成表单校验、异常提示和移动端操作验证。':'交付流程图、表单原型与试用记录，明确正常流程和异常处理规则。',techStack:developer?'JavaScript、HTML、CSS':'Figma、Excel'}}];
    mod('xiaoyuan').visible=true;mod('xiaoyuan').data=[{name:'校园读书分享活动',job:'活动协助',timeStart:'2025-09',timeEnd:'2025-12',today:false,content:'<ul><li>协助发布报名通知与整理参与名单，核对信息并同步活动安排。</li><li>汇总活动反馈，整理执行清单供后续活动参考。</li></ul>'}];
    mod('jineng').content=developer?'<ul><li>掌握 HTML、CSS 和 JavaScript 基础，能完成表单交互与接口调用。</li><li>使用 Git 管理代码，能通过浏览器开发者工具定位页面与请求问题。</li></ul>':'<ul><li>能梳理业务流程，使用 Figma 制作交互原型，整理需求与试用记录。</li><li>使用 Excel 整理数据和反馈，表达清晰，能协助推进活动执行。</li></ul>';
    mod('jineng').data=[];
  }
  if(Number(id)===1044){resume.setData.title='个人简历';resume.setData.slogan='PERSONAL PROFILE';}
  if([2002,2003].includes(Number(id)))resume.basicInfo.photoShow=false;
  return resume;
}

// Layout/visibility settings (for example spacing="balanced") are not written experience.
const meaningful=value=>typeof value==='string'?Boolean(value.replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160);/g,'').trim()):typeof value==='number'?value>0:Array.isArray(value)?value.some(meaningful):value&&typeof value==='object'?Object.entries(value).some(([key,item])=>!['layout','visible'].includes(key)&&meaningful(item)):false;
export function hasResumeContent(resume){
  const basic=resume.basicInfo||{};
  if(['name','mobile','email','birthday','photo','minzu','zhengzhi','jiguan','height','weight','inShort'].some(key=>meaningful(basic[key])))return true;
  if(meaningful(basic.sex)||meaningful(basic.hunyin)||basic.workYears!==''&&basic.workYears!==undefined&&basic.workYears!==null&&Number(basic.workYears)>=0)return true;
  if(basic.make?.some(item=>meaningful(item?.value)))return true;
  if(meaningful(resume.setData?.title)&&resume.setData.title!=='个人简历'||meaningful(resume.setData?.slogan)&&!['PERSONAL PROFILE','努力超越自己，每天进步一点点'].includes(resume.setData.slogan))return true;
  if(meaningful(resume.coverData)||meaningful(resume.zijianData?.content))return true;
  return (resume.moduleData||[]).some(mod=>meaningful(mod.content)||meaningful(mod.data)||mod.moduleValue&&mod.moduleValue!==MODULES.find(def=>def.name===mod.moduleName)?.label||mod.moduleName==='baokao'&&(meaningful(mod.name)||meaningful(mod.major)||meaningful(mod.title)));
}

export function templateSampleKind(resume){
  return TEMPLATE_SAMPLE_KINDS.find(kind=>{
  const expected=createTemplateSample(resume.setData?.tplId,kind);
  return JSON.stringify(resume.basicInfo)===JSON.stringify(expected.basicInfo)
    &&JSON.stringify(resume.moduleData)===JSON.stringify(expected.moduleData)
    &&!meaningful(resume.coverData)&&!meaningful(resume.zijianData?.content);
  });
}
export const isTemplateSample=resume=>Boolean(templateSampleKind(resume));
