import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TEMPLATES,renderByTpl} from '../assets/js/templates.js';
import {chooseTemplate} from '../assets/js/template-choice.js';
import {createTemplateSample,hasResumeContent} from '../assets/js/template-samples.js';
import {MODULES} from '../assets/js/dict.js';

const blank=()=>({setData:{title:'个人简历',slogan:'PERSONAL PROFILE'},basicInfo:{name:'',workYears:-1,photoShow:true},moduleData:MODULES.filter(def=>def.name!=='basic').map(def=>({moduleName:def.name,moduleValue:def.label,visible:true,content:'',data:[]}))});
test('every empty template choice loads the same editable example shown by the gallery',()=>{
  for(const template of TEMPLATES){
    const resume=blank();assert.equal(hasResumeContent(resume),false);
    assert.equal(chooseTemplate(resume,template.id),true);
    const sample=createTemplateSample(template.id);
    assert.deepEqual(resume.basicInfo,sample.basicInfo);assert.deepEqual(resume.moduleData,sample.moduleData);
    assert.equal(resume.setData.tplId,template.id);assert.equal(resume.setData.title,'');
    const html=renderByTpl(resume);
    for(const text of ['林予安','星桥科技','知行数字','企业协作平台体验升级','浙江工商大学'])assert.ok(html.includes(text),`${template.id}: ${text}`);
  }
});
test('switching populated drafts preserves edits, hidden content, photos and custom headings',()=>{
  for(const change of [r=>r.basicInfo.name='用户填写',r=>r.basicInfo.photo='data:image/png;base64,fixture',r=>r.moduleData[0].data={job:'研发工程师'},r=>{r.moduleData[2].visible=false;r.moduleData[2].content='<p>未完成的经历</p>';},r=>r.setData.title='我的个人介绍',r=>r.moduleData[0].moduleValue='职业方向']){
    const resume=blank();change(resume);const original=structuredClone(resume);
    assert.equal(chooseTemplate(resume,2002),false);
    assert.deepEqual(resume.basicInfo,original.basicInfo);assert.deepEqual(resume.moduleData,original.moduleData);
    assert.equal(resume.setData.title,original.setData.title);
  }
});
test('explicit sample start replaces prior personal fields and sample instances never share mutations',()=>{
  const resume=blank();resume.basicInfo={name:'旧用户',photo:'旧照片',mobile:'旧电话',zhengzhi:'旧字段'};
  chooseTemplate(resume,2001,{useSample:true});assert.deepEqual(resume.basicInfo,createTemplateSample(2001).basicInfo);
  resume.basicInfo.name='修改示例';resume.moduleData[1].data[0].name='修改公司';
  const fresh=createTemplateSample(2001);assert.equal(fresh.basicInfo.name,'林予安');assert.equal(fresh.moduleData[1].data[0].name,'星桥科技');
});
