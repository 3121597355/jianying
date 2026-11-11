import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults,normalizeSettings,upgradeTemplateCatalog} from '../admin.mjs';
import {EXTENDED_TEMPLATES} from '../assets/js/tpl-extended.js';
import {applyTemplate,renderByTpl} from '../assets/js/templates.js';

test('four-template site settings upgrade without resetting custom content, order or switches',()=>{
  const original=defaults();original.templates=original.templates.slice(0,4).reverse();
  original.site.headline='管理员自定义文案';original.defaultTemplate=2003;original.analytics.enabled=false;
  original.templates[0].name='管理员命名';original.templates[2].enabled=false;original.templates[2].featured=false;
  const before=structuredClone(original),upgraded=upgradeTemplateCatalog(original);
  assert.deepEqual(original,before);
  assert.equal(upgraded.templates.length,10);
  assert.deepEqual(upgraded.templates.slice(0,4),before.templates);
  assert.deepEqual(upgraded.site,before.site);
  assert.equal(upgraded.defaultTemplate,2003);
  assert.equal(upgraded.analytics.enabled,false);
  assert.ok(upgraded.templates.slice(4).every(t=>t.enabled&&!t.featured));
  assert.equal(upgradeTemplateCatalog(upgraded),upgraded);
  assert.doesNotThrow(()=>normalizeSettings(upgraded));
});
test('classic blue replaces only its old default labels and retains administrator overrides',()=>{
  const original=defaults(),item=original.templates.find(t=>t.id===1044);
  Object.assign(item,{name:'蓝色横条',desc:'居中页眉 · 淡色标题栏 · 层次清晰',enabled:false,featured:false});
  const upgraded=upgradeTemplateCatalog(original),blue=upgraded.templates.find(t=>t.id===1044);
  assert.equal(item.name,'蓝色横条');assert.equal(blue.name,'经典蓝色');assert.equal(blue.enabled,false);
  assert.equal(upgradeTemplateCatalog(upgraded),upgraded);
  item.name='管理员自定蓝色';item.desc='管理员自定介绍';
  assert.equal(upgradeTemplateCatalog(original),original);
});

test('all original draft template IDs preserve profile, photo, rich text and reordered modules',()=>{
  for(const template of EXTENDED_TEMPLATES){
    const resume={setData:{tplId:template.id,moduleSort:['work','basic','yixiang','jiaoyu'],title:'自定义标题'},basicInfo:{name:'模板回归示例',photo:'/assets/img/landing/portrait-demo.webp',photoShow:true},moduleData:[
      {moduleName:'work',moduleValue:'项目成果',visible:true,data:[{name:'示例项目',job:'工程师',content:'<p>保留个人经历</p>'}]},
      {moduleName:'jiaoyu',moduleValue:'教育背景',visible:true,data:[{name:'示例学校',major:'计算机'}]},
      {moduleName:'yixiang',moduleValue:'求职意向',visible:true,data:{job:'软件工程师'}},
    ]};
    const content=structuredClone(resume);applyTemplate(resume,template.id);
    assert.deepEqual(resume.basicInfo,content.basicInfo);assert.deepEqual(resume.moduleData,content.moduleData);
    assert.deepEqual(resume.setData.moduleSort,content.setData.moduleSort);assert.equal(resume.setData.title,content.setData.title);
    const html=renderByTpl(JSON.parse(JSON.stringify(resume)));
    assert.match(html,new RegExp(`standard-${template.variant}`));
    assert.ok(html.indexOf('id="work"')<html.indexOf('id="basicInfo"'));
    for(const value of ['模板回归示例','示例项目','保留个人经历','示例学校','软件工程师','portrait-demo.webp'])assert.ok(html.includes(value),`${template.id}: ${value}`);
  }
});
