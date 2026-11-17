import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProjectDetails,normalizeProjectDetails,PROJECT_SPACING,renderProjectBody,safeProjectUrl} from '../assets/js/project-fields.js';
import {blankTimeline,createDefault} from '../assets/js/resume-defaults.js';
import {TEMPLATES,renderByTpl} from '../assets/js/templates.js';
import {normalizeResume,modelResume} from '../resume-document.mjs';
import {applyModelResult} from '../job-tailor.mjs';
const project=()=>({name:'合成项目',job:'开发',content:'<ul><li>使用 JavaScript 实现编辑。</li></ul>',projectDetails:{...createProjectDetails(),summary:'面向求职者的编辑工具。',outcome:'完成编辑与导出验证。',techStack:'JavaScript、CSS',website:'https://example.com/demo',repository:'https://github.com/example/demo'}});
const fixture=()=>{const resume=createDefault(),mod=resume.moduleData.find(m=>m.moduleName==='project');mod.visible=true;mod.data=[project()];return resume;};
test('all templates render optional project details, skip disabled fields and retain their values',()=>{
  for(const template of TEMPLATES){
    const resume=fixture();resume.setData.tplId=template.id;
    const item=resume.moduleData.find(m=>m.moduleName==='project').data[0];
    const full=renderByTpl(resume);
    for(const value of ['项目简介','个人贡献','项目成果','技术栈','完成编辑与导出验证','example.com/demo','github.com/example/demo'])assert(full.includes(value),`${template.id}: ${value}`);
    for(const key of Object.keys(item.projectDetails.visible))item.projectDetails.visible[key]=false;
    const hidden=renderByTpl(resume);
    for(const value of ['项目简介：','个人贡献：','项目成果：','技术栈：','example.com/demo','实现编辑'])assert(!hidden.includes(value),`${template.id}: hidden ${value}`);
    assert.equal(item.projectDetails.outcome,'完成编辑与导出验证。');
    item.projectDetails.visible.outcome=true;
    assert(renderByTpl(resume).includes('完成编辑与导出验证'));
  }
});
test('legacy rich project descriptions remain intact and empty optional fields create no blank sections',()=>{
  const legacy={content:'<p><strong>已有内容</strong>保持格式</p>'};
  assert.equal(renderProjectBody(legacy),legacy.content);
  const resume=fixture(),mod=resume.moduleData.find(m=>m.moduleName==='project');
  mod.data=[blankTimeline('project')];mod.data[0].content='<p><br></p>';
  assert(!renderByTpl(resume).includes('id="project"'));
  const a=blankTimeline('project'),b=blankTimeline('project');a.projectDetails.visible.summary=false;
  assert.equal(b.projectDetails.visible.summary,true);
});
test('project text is escaped and only valid web links are rendered',()=>{
  const item=project();item.projectDetails.summary='<script>alert(1)</script>';
  item.projectDetails.website='javascript:alert(1)';item.projectDetails.repository='https://user:password@example.com';
  const html=renderProjectBody(item);
  assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
  assert(!html.includes('href='));
  for(const value of ['javascript:alert(1)','data:text/html,evil','//example.com','https://user:password@example.com'])assert.equal(safeProjectUrl(value),'');
});
test('cloud normalization preserves details and hidden facts and URLs stay out of model inputs',()=>{
  const resume=fixture(),item=resume.moduleData.find(m=>m.moduleName==='project').data[0];
  item.projectDetails.layout.spacing='airy';
  item.projectDetails.outcome='不发送的隐藏成果 999';item.projectDetails.visible.outcome=false;
  const normalized=normalizeResume(resume),copy=normalizeResume(JSON.parse(JSON.stringify(normalized)));
  assert.deepEqual(copy,normalized);
  assert.equal(copy.moduleData.find(m=>m.moduleName==='project').data[0].projectDetails.outcome,item.projectDetails.outcome);
  const input=JSON.stringify(modelResume(copy));assert(input.includes('CSS'));assert(input.includes('面向求职者'));
  assert(!input.includes('999'));assert(!input.includes('example.com'));assert(!input.includes('github.com'));
  const result={requirements:[],suggestions:[{moduleName:'project',index:0,sourceRefs:['project:0'],bullets:['使用 JavaScript 和 CSS 实现编辑。']}]};
  const generated=applyModelResult(copy,result,'JavaScript 与 CSS 开发','开发');
  assert(generated.resume.moduleData.find(m=>m.moduleName==='project').data[0].content.includes('和 CSS'));
  assert.deepEqual(generated.resume.moduleData.find(m=>m.moduleName==='project').data[0].projectDetails,item.projectDetails);
  item.projectDetails.visible.content=false;
  const hidden=applyModelResult(resume,result,'JavaScript 与 CSS 开发','开发');
  assert.equal(hidden.resume.moduleData.find(m=>m.moduleName==='project').data[0].content,item.content);
});
test('project spacing persists independently, renders in all templates and never replaces contribution text',()=>{
  for(const spacing of PROJECT_SPACING){
    const resume=fixture(),item=resume.moduleData.find(m=>m.moduleName==='project').data[0];
    item.content='<p><strong>主导交付：</strong>完成需求拆解。</p><p>完成验证与迭代。</p>';
    item.projectDetails.layout.spacing=spacing.value;
    const normalized=normalizeResume(resume),saved=normalized.moduleData.find(m=>m.moduleName==='project').data[0];
    assert.equal(saved.projectDetails.layout.spacing,spacing.value);
    assert.equal(saved.content,item.content);
    for(const template of TEMPLATES){
      normalized.setData.tplId=template.id;
      const html=renderByTpl(normalized);
      assert(html.includes(`data-project-spacing="${spacing.value}"`));
      assert(html.includes(`--project-paragraph-gap:${spacing.paragraph}px`));
      assert(html.includes(item.content));
    }
  }
  assert.equal(normalizeProjectDetails({layout:{spacing:'evil; color:red'}}).layout.spacing,'balanced');
  assert.equal(normalizeProjectDetails({}).layout.spacing,'balanced');
  const first=createProjectDetails(),second=createProjectDetails();first.layout.spacing='airy';
  assert.equal(second.layout.spacing,'balanced');
});
