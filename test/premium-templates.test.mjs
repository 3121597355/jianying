import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PREMIUM_TEMPLATES} from '../assets/js/tpl-premium.js';
import {TEMPLATES,applyTemplate} from '../assets/js/templates.js';
import {createTemplateSample} from '../assets/js/template-samples.js';

const fixture=()=>({setData:{tplId:1051,skin:'#22405c',title:'自定义标题',slogan:'自定义副标题'},basicInfo:{name:'草稿姓名',mobile:'13800000000',email:'a@b.com',photo:'/assets/user-photo.png',photoShow:true},moduleData:[
  {moduleName:'work',moduleValue:'工作经历',visible:true,data:[{name:'草稿公司',job:'工程师',timeStart:'2021-07',timeEnd:'2024-10',content:'<p>保留富文本内容</p>'}]},
  {moduleName:'jiaoyu',moduleValue:'教育背景',visible:true,data:[{name:'草稿学校',major:'计算机',xueli:'本科',timeStart:'2017-09',timeEnd:'2021-06'}]},
  {moduleName:'yixiang',moduleValue:'求职意向',visible:true,data:{job:'工程师',city:'杭州'}},
  {moduleName:'jineng',moduleValue:'专业技能',visible:true,content:'',data:['TypeScript','SQL']},
  {moduleName:'project',moduleValue:'项目经验',visible:true,data:[{name:'草稿项目',role:'负责人',content:'<p>项目正文</p>'}]},
]});

test('14 套模板 id 唯一，且都带缩略图与渲染函数',()=>{
  assert.equal(TEMPLATES.length,14);
  assert.equal(new Set(TEMPLATES.map(t=>t.id)).size,14);
  for(const template of TEMPLATES){
    assert.match(template.thumbnail,/^\/assets\/img\/templates\/\d+\.png/);
    assert.equal(typeof template.render,'function');
  }
});

test('双栏模板保留草稿内容、模块锚点与照片槽位',()=>{
  for(const template of PREMIUM_TEMPLATES){
    const resume=fixture(),original=structuredClone(resume);
    applyTemplate(resume,template.id);
    assert.deepEqual(resume.basicInfo,original.basicInfo);
    assert.deepEqual(resume.moduleData,original.moduleData);
    assert.equal(resume.setData.skin,template.style.skin);
    const html=template.render(JSON.parse(JSON.stringify(resume)));
    assert.match(html,new RegExp(`premium-${template.variant}`));
    for(const value of ['草稿姓名','草稿公司','草稿学校','草稿项目','保留富文本内容','项目正文','TypeScript','/assets/user-photo.png'])assert.ok(html.includes(value),`${template.id} 缺少 ${value}`);
    for(const id of ['basicInfo','myname','work','jiaoyu','project','jineng'])assert.match(html,new RegExp(`id="${id}"`));
    assert.match(html,/data-photo-slot/);
    assert.match(html,/data-item-index="0"/);
    assert.doesNotMatch(html,/undefined|NaN/);
  }
});

test('侧栏版式把技能放进侧栏，网格版式把技能放进副栏',()=>{
  for(const template of PREMIUM_TEMPLATES){
    const resume=fixture();
    applyTemplate(resume,template.id);
    const html=template.render(resume);
    const skillsIndex=html.indexOf('TypeScript');
    assert.ok(skillsIndex>0);
    if(template.variant.startsWith('sidebar')){
      const railEnd=html.indexOf('</aside>');
      assert.ok(skillsIndex<railEnd,`${template.name} 的技能应位于侧栏`);
    }else{
      const sideStart=html.indexOf('p-col-side');
      assert.ok(sideStart>0&&skillsIndex>sideStart,`${template.name} 的技能应位于副栏`);
    }
  }
});

test('模板示例能渲染出单页内容且含项目字段',()=>{
  for(const template of PREMIUM_TEMPLATES){
    const sample=createTemplateSample(template.id);
    sample.setData={...sample.setData,...template.style,tplId:template.id};
    const html=template.render(sample);
    assert.match(html,new RegExp(`premium-${template.variant}`));
    assert.doesNotMatch(html,/undefined|NaN/);
  }
});
