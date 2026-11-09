// Prepare real renderer output for browser screenshot capture, without loading a draft.
import fs from 'node:fs/promises';
import path from 'node:path';
import {STANDARD_TEMPLATES} from '../assets/js/tpl-standard.js';

const root=path.resolve(import.meta.dirname,'..');
const sample={
  setData:{title:'',slogan:'',moduleSort:['basic','yixiang','work','project','jiaoyu','jineng','pingjia']},
  basicInfo:{name:'林予安',mobile:'138 0000 0000',email:'hello@example.com',workYears:6,isAge:false,photo:'/assets/img/landing/portrait-demo.webp',photoShow:true,make:[]},
  moduleData:[
    {moduleName:'yixiang',moduleValue:'求职意向',visible:true,data:{job:'产品经理',city:'杭州',money:'',joinTime:''}},
    {moduleName:'work',moduleValue:'工作经历',visible:true,data:[
      {name:'星桥科技',job:'产品经理',timeStart:'2023-07',timeEnd:'2026-10',content:'<ul><li>负责协作平台的需求分析、产品规划与迭代，服务 120 余家企业客户。</li><li>梳理新用户使用路径，重构引导流程，核心功能使用率提升 28%。</li><li>建立需求评审与验收机制，协调设计、研发和运营按期交付。</li></ul>'},
      {name:'知行数字',job:'产品专员',timeStart:'2021-07',timeEnd:'2023-06',content:'<ul><li>参与企业服务产品从调研到上线的全过程，独立完成需求文档与原型设计。</li><li>通过用户访谈和行为数据定位体验问题，推动 12 项功能优化。</li><li>维护产品知识库与反馈台账，提高团队的信息同步和问题处理效率。</li></ul>'},
    ]},
    {moduleName:'project',moduleValue:'项目经历',visible:true,data:[
      {name:'企业协作平台体验升级',job:'项目负责人',timeStart:'2024-03',timeEnd:'2024-11',content:'<ul><li>围绕任务管理、消息通知和团队空间，设计统一的交互规则与信息架构。</li><li>制定分阶段上线方案，与研发团队完成灰度验证及用户反馈跟进。</li><li>上线后关键任务完成时间缩短 22%，用户满意度提升至 4.7 / 5。</li></ul>'},
    ]},
    {moduleName:'jiaoyu',moduleValue:'教育背景',visible:true,data:[
      {name:'浙江工商大学',major:'信息管理与信息系统',xueli:'本科',timeStart:'2017-09',timeEnd:'2021-06',content:'<p>主修管理学、数据库原理、统计学及信息系统分析与设计；获校级奖学金。</p>'},
    ]},
    {moduleName:'jineng',moduleValue:'专业技能',visible:true,content:'<ul><li>熟悉用户研究、需求分析、产品规划及跨团队项目管理。</li><li>熟练使用 Figma、Axure 与 SQL，能结合业务目标开展数据分析。</li></ul>',data:[{name:'用户研究'},{name:'产品设计'},{name:'数据分析'},{name:'项目管理'}]},
    {moduleName:'pingjia',moduleValue:'个人简介',visible:true,content:'<p>具备完整的企业服务产品经验，关注用户需求与落地效果。善于把复杂问题拆解成清晰的任务，通过持续迭代改善产品体验。</p>'},
  ],
};
const pages=STANDARD_TEMPLATES.map(template=>{
  const resume=structuredClone(sample);
  resume.setData={...resume.setData,...template.style,tplId:template.id};
  if([2002,2003].includes(template.id))resume.basicInfo.photoShow=false;
  return `<section id="sample-${template.id}" data-resume-export>${template.render(resume)}</section>`;
}).join('');
await fs.writeFile(path.join(root,'assets/qa-standard-templates.html'),`<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><title>标准模板预览校验</title><link rel="stylesheet" href="/assets/css/editor-base.css"><link rel="stylesheet" href="/assets/css/tpl-standard.css"><style>*{box-sizing:border-box}body{margin:0;background:#e8ebef}body>section{width:820px;margin:0 0 30px;background:#fff}</style><body>${pages}</body></html>`);
console.log('Prepared /assets/qa-standard-templates.html; capture each 820 × 1160 resume, then remove the temporary page.');
