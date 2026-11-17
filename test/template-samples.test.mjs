import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TEMPLATES,renderByTpl} from '../assets/js/templates.js';
import {chooseTemplate} from '../assets/js/template-choice.js';
import {createTemplateSample,hasResumeContent,isTemplateSample,templateSampleKind} from '../assets/js/template-samples.js';
import {createDefault} from '../assets/js/resume-defaults.js';
import {initializeEditorDraft} from '../assets/js/editor-start.js';
import {MODULES} from '../assets/js/dict.js';

const blank=createDefault;
test('real empty drafts do not count project layout settings as written content',()=>{
  const resume=blank();assert.equal(hasResumeContent(resume),false);
  const project=resume.moduleData.find(mod=>mod.moduleName==='project');
  project.data[0].projectDetails.layout.spacing='airy';
  project.data[0].projectDetails.visible.summary=false;
  assert.equal(hasResumeContent(resume),false);
  project.data[0].projectDetails.summary='用户保留的项目简介';
  assert.equal(hasResumeContent(resume),true);
  const previous=structuredClone(resume.moduleData);assert.equal(chooseTemplate(resume,2002),false);assert.deepEqual(resume.moduleData,previous);
  for(const change of [r=>r.coverData.name='用户封面',r=>r.zijianData.content='<p>未写完的自荐信</p>']){const r=blank();change(r);assert.equal(chooseTemplate(r,2001),false);}
});
test('first visits and legacy empty drafts start with a complete, editable, independent example',()=>{
  for(const saved of [undefined,{resumeData:blank(),ui:{}}]){
    const result=initializeEditorDraft(saved);assert.equal(result.seeded,true);assert.equal(result.ui.tab,'basic');assert.equal(isTemplateSample(result.resumeData),true);
    assert(result.resumeData.coverData);assert(result.resumeData.zijianData);
    assert(renderByTpl(result.resumeData).includes('企业协作平台体验升级'));
    result.resumeData.basicInfo.name='真实姓名';assert.equal(isTemplateSample(result.resumeData),false);
    assert.equal(initializeEditorDraft().resumeData.basicInfo.name,'林予安');
    if(saved)assert.equal(saved.resumeData.basicInfo.name,'');
  }
});
test('written drafts, hidden details and deliberately blank starts survive entry unchanged',()=>{
  const resume=blank();resume.moduleData.find(mod=>mod.moduleName==='project').data[0].projectDetails.website='https://user.example/project';
  const saved={resumeData:resume,ui:{tab:'project',editOpen:false}};const initial=initializeEditorDraft(saved);
  assert.equal(initial.seeded,false);assert.deepEqual(initial.resumeData,resume);assert.equal(initial.ui.tab,'project');
  const intentional=initializeEditorDraft({resumeData:blank(),ui:{startBlank:true}});assert.equal(intentional.seeded,false);assert.equal(intentional.resumeData.basicInfo.name,'');
});
test('every empty template choice loads the same editable example shown by the gallery',()=>{
  for(const template of TEMPLATES){
    const resume=blank();assert.equal(hasResumeContent(resume),false);
    assert.equal(chooseTemplate(resume,template.id),true);
    const sample=createTemplateSample(template.id);
    assert.deepEqual(resume.basicInfo,sample.basicInfo);assert.deepEqual(resume.moduleData,sample.moduleData);
    assert.equal(resume.setData.tplId,template.id);assert.equal(resume.setData.title,sample.setData.title);
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
test('guide examples start fresh, preserve written drafts, and keep their content when switching templates',()=>{
  for(const example of ['graduate','developer']){
    const initial=initializeEditorDraft(undefined,{example});assert.equal(templateSampleKind(initial.resumeData),example);
    const resume=initial.resumeData;assert(renderByTpl(resume).includes('校园活动报名'));assert.equal(resume.moduleData.find(mod=>mod.moduleName==='work').visible,false);
    chooseTemplate(resume,2002,{useSample:isTemplateSample(resume)});assert.equal(templateSampleKind(resume),example);
    chooseTemplate(resume,2001,{useSample:isTemplateSample(resume)});assert.equal(templateSampleKind(resume),example);
    resume.basicInfo.name='已写姓名';assert.equal(isTemplateSample(resume),false);
    const saved={resumeData:resume,ui:{tab:'project'}},again=initializeEditorDraft(saved,{example:example==='graduate'?'developer':'graduate'});
    assert.equal(again.seeded,false);assert.deepEqual(again.resumeData,resume);assert.equal(again.ui.tab,'project');
    assert.equal(initializeEditorDraft(undefined,{example}).resumeData.basicInfo.name,'陈同学');
  }
  assert.equal(templateSampleKind(initializeEditorDraft(undefined,{example:'<script>'}).resumeData),'professional');
  assert.equal(initializeEditorDraft({resumeData:blank(),ui:{startBlank:true}},{example:'graduate'}).seeded,false);
});
