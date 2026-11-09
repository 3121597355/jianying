import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STANDARD_TEMPLATES} from '../assets/js/tpl-standard.js';
import {applyTemplate,renderByTpl} from '../assets/js/templates.js';
import {savePersonalTemplate,listPersonalTemplates} from '../assets/js/personal-templates.js';

const fixture=()=>({setData:{tplId:2001,skin:'#1575bf',title:'自定义标题',slogan:'自定义副标题',moduleSort:['jiaoyu','basic','work','yixiang']},basicInfo:{name:'草稿姓名',mobile:'13800000000',photo:'/assets/user-photo.png',photoShow:true},moduleData:[
  {moduleName:'work',moduleValue:'工作经历',visible:true,data:[{name:'草稿公司',job:'工程师',content:'<p>保留富文本内容</p>'}]},
  {moduleName:'jiaoyu',moduleValue:'教育背景',visible:true,data:[{name:'草稿学校',major:'计算机',xueli:'本科'}]},
  {moduleName:'yixiang',moduleValue:'求职意向',visible:true,data:{job:'工程师'}},
  {moduleName:'jineng',moduleValue:'专业技能',visible:true,data:[{name:'TypeScript',percent:88}]},
]});
test('all standard layouts preserve draft content and reordered modules when selected and restored',()=>{
  for(const template of STANDARD_TEMPLATES){
    const resume=fixture(),original=structuredClone(resume);
    applyTemplate(resume,template.id);
    assert.deepEqual(resume.basicInfo,original.basicInfo);
    assert.deepEqual(resume.moduleData,original.moduleData);
    assert.deepEqual(resume.setData.moduleSort,original.setData.moduleSort);
    assert.equal(resume.setData.title,original.setData.title);
    assert.equal(resume.setData.skin,template.style.skin);
    const restored=JSON.parse(JSON.stringify(resume)),html=renderByTpl(restored);
    assert.match(html,new RegExp(`standard-${template.variant}`));
    assert.ok(html.indexOf('id="jiaoyu"')<html.indexOf('id="basicInfo"'));
    assert.ok(html.indexOf('id="work"')<html.indexOf('id="yixiang"'));
    for(const value of ['草稿姓名','草稿公司','草稿学校','保留富文本内容','TypeScript','/assets/user-photo.png'])assert.ok(html.includes(value),value);
    assert.doesNotMatch(html,/role="progressbar"/);
  }
});
test('standard layouts remain the base after saving and restoring a personal template',()=>{
  const saved=new Map(),storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  for(const template of STANDARD_TEMPLATES){
    const resume=fixture();applyTemplate(resume,template.id);
    const personal=savePersonalTemplate(template.name,resume.setData,{storage});
    const restored=listPersonalTemplates(storage).find(t=>t.id===personal.id);
    assert.equal(restored.style.tplId,template.id);
    assert.equal(restored.style.skin,template.style.skin);
  }
});
