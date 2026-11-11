// The gallery and editor share this fictional, editable example. It is not user data.
import {MODULES} from './dict.js';
const sample={
  setData:{skin:'#284967',font:1,fontSize:14,mm:24,pp:52,lineHeight:1.7,title:'',slogan:'',moduleSort:['basic','yixiang','work','project','jiaoyu','jineng','pingjia']},
  basicInfo:{name:'林予安',sex:0,birthday:'',mobile:'138 0000 0000',email:'hello@example.com',workYears:6,isAge:false,photo:'/assets/img/landing/portrait-demo.webp',photoShow:true,make:[],minzu:'',zhengzhi:'',jiguan:'',hunyin:0,height:'',weight:'',inShort:''},
  moduleData:[
    {moduleName:'yixiang',moduleValue:'求职意向',visible:true,data:{job:'产品经理',city:'杭州',money:'',joinTime:''}},
    {moduleName:'work',moduleValue:'工作经历',visible:true,data:[
      {name:'星桥科技',job:'产品经理',timeStart:'2023-07',timeEnd:'2026-10',today:false,content:'<ul><li>负责协作平台的需求分析、产品规划与迭代，服务 120 余家企业客户。</li><li>梳理新用户使用路径，重构引导流程，核心功能使用率提升 28%。</li><li>建立需求评审与验收机制，协调设计、研发和运营按期交付。</li></ul>'},
      {name:'知行数字',job:'产品专员',timeStart:'2021-07',timeEnd:'2023-06',today:false,content:'<ul><li>参与企业服务产品从调研到上线的全过程，独立完成需求文档与原型设计。</li><li>通过用户访谈和行为数据定位体验问题，推动 12 项功能优化。</li><li>维护产品知识库与反馈台账，提高团队的信息同步和问题处理效率。</li></ul>'},
    ]},
    {moduleName:'project',moduleValue:'项目经历',visible:true,data:[
      {name:'企业协作平台体验升级',job:'项目负责人',timeStart:'2024-03',timeEnd:'2024-11',today:false,content:'<ul><li>围绕任务管理、消息通知和团队空间，设计统一的交互规则与信息架构。</li><li>制定分阶段上线方案，与研发团队完成灰度验证及用户反馈跟进。</li><li>上线后关键任务完成时间缩短 22%，用户满意度提升至 4.7 / 5。</li></ul>'},
    ]},
    {moduleName:'jiaoyu',moduleValue:'教育背景',visible:true,data:[
      {name:'浙江工商大学',major:'信息管理与信息系统',xueli:'本科',timeStart:'2017-09',timeEnd:'2021-06',today:false,content:'<p>主修管理学、数据库原理、统计学及信息系统分析与设计；获校级奖学金。</p>'},
    ]},
    {moduleName:'jineng',moduleValue:'专业技能',visible:true,content:'<ul><li>熟悉用户研究、需求分析、产品规划及跨团队项目管理。</li><li>熟练使用 Figma、Axure 与 SQL，能结合业务目标开展数据分析。</li></ul>',data:[{name:'用户研究',percent:85},{name:'产品设计',percent:90},{name:'数据分析',percent:80},{name:'项目管理',percent:85}]},
    {moduleName:'pingjia',moduleValue:'个人简介',visible:true,content:'<p>具备完整的企业服务产品经验，关注用户需求与落地效果。善于把复杂问题拆解成清晰的任务，通过持续迭代改善产品体验。</p>'},
    {moduleName:'baokao',moduleValue:'报考信息',visible:false,title:'',name:'',major:'',data:[]},
    {moduleName:'shixi',moduleValue:'实习经历',visible:false,data:[]},
    {moduleName:'xiaoyuan',moduleValue:'校园经历',visible:false,data:[]},
    {moduleName:'zhengshu',moduleValue:'荣誉证书',visible:false,content:''},
    {moduleName:'aihao',moduleValue:'兴趣爱好',visible:false,content:'',data:[]},
    {moduleName:'make',moduleValue:'自定义模块',visible:false,content:''},
  ],
};

export function createTemplateSample(id){
  const resume=structuredClone(sample);resume.setData.tplId=Number(id);
  if(Number(id)===1044){resume.setData.title='个人简历';resume.setData.slogan='PERSONAL PROFILE';}
  if([2002,2003].includes(Number(id)))resume.basicInfo.photoShow=false;
  return resume;
}

const meaningful=value=>typeof value==='string'?Boolean(value.replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160);/g,'').trim()):typeof value==='number'?value>0:Array.isArray(value)?value.some(meaningful):value&&typeof value==='object'?Object.values(value).some(meaningful):false;
export function hasResumeContent(resume){
  const basic=resume.basicInfo||{};
  if(['name','mobile','email','birthday','photo','minzu','zhengzhi','jiguan','height','weight','inShort'].some(key=>meaningful(basic[key])))return true;
  if(meaningful(basic.sex)||meaningful(basic.hunyin)||basic.workYears!==''&&basic.workYears!==undefined&&basic.workYears!==null&&Number(basic.workYears)>=0)return true;
  if(basic.make?.some(item=>meaningful(item?.value)))return true;
  if(meaningful(resume.setData?.title)&&resume.setData.title!=='个人简历'||meaningful(resume.setData?.slogan)&&!['PERSONAL PROFILE','努力超越自己，每天进步一点点'].includes(resume.setData.slogan))return true;
  return (resume.moduleData||[]).some(mod=>meaningful(mod.content)||meaningful(mod.data)||mod.moduleValue&&mod.moduleValue!==MODULES.find(def=>def.name===mod.moduleName)?.label||mod.moduleName==='baokao'&&(meaningful(mod.name)||meaningful(mod.major)||meaningful(mod.title)));
}
