import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBasicFields,MAX_BASIC_FIELDS} from '../assets/js/basic-fields.js';
import {createDefault} from '../assets/js/resume-defaults.js';
import {TEMPLATES,renderByTpl} from '../assets/js/templates.js';
import {normalizeResume,modelResume} from '../resume-document.mjs';
import {applyModelResult} from '../job-tailor.mjs';

test('all templates render custom basic information, hide blank and disabled rows, and support legacy names',()=>{
  const r=createDefault();r.basicInfo.photoShow=false;
  r.basicInfo.make=[{keyValue:'个人网站',value:'example.com'},{name:'旧名称',value:'legacy-value'},{keyValue:'空白名称',value:'  '},{keyValue:'隐藏字段',value:'hidden-value',visible:false},{value:'value-only'},{keyValue:'姓名',value:'custom-alias'}];
  for(const t of TEMPLATES){
    r.setData.tplId=t.id;const html=renderByTpl(r);
    for(const value of ['个人网站','example.com','旧名称','legacy-value','value-only'])assert(html.includes(value),`${t.id}: ${value}`);
    for(const value of ['空白名称','隐藏字段','hidden-value','：value-only'])assert(!html.includes(value),`${t.id}: ${value}`);
    assert.equal((html.match(/id="myname"/g)||[]).length,1,`${t.id}: custom label cannot duplicate the profile anchor`);
  }
  r.basicInfo.make[3].visible=true;
  assert(renderByTpl(r).includes('hidden-value'));
});
test('custom fields normalize safely, bound lengths and keep canonical and legacy labels through save',()=>{
  const r=createDefault();r.basicInfo.make=[{name:'旧标签',value:'旧值',visible:false},{keyValue:'<img src=x>',value:'<script>bad</script>'}];
  const saved=normalizeResume(r);
  assert.deepEqual(saved.basicInfo.make[0],{keyValue:'旧标签',value:'旧值',visible:false});
  assert.deepEqual(normalizeResume(JSON.parse(JSON.stringify(saved))),saved);
  const html=renderByTpl(saved);assert(!html.includes('<script>'));assert(!html.includes('<img src=x>'));assert(html.includes('&lt;script&gt;'));
  const bounded=normalizeBasicFields(Array.from({length:20},()=>({keyValue:'x'.repeat(100),value:'v'.repeat(1000),visible:false,secret:'not kept'})));
  assert.equal(bounded.length,MAX_BASIC_FIELDS);assert.equal(bounded[0].keyValue.length,24);assert.equal(bounded[0].value.length,300);assert(!('secret' in bounded[0]));
  assert.deepEqual(normalizeBasicFields([null,3,'x',[]]),[]);
  assert.equal(createDefault().basicInfo.make.length,0);
});
test('AI suggestions retain custom basic details and never send them to the model',()=>{
  const r=createDefault();r.basicInfo.make=[{keyValue:'个人网站',value:'private-site.example',visible:true},{keyValue:'微信',value:'private-contact',visible:false}];
  const m=r.moduleData.find(x=>x.moduleName==='project');m.visible=true;m.data[0].name='测试工具';m.data[0].content='<p>使用 JavaScript 实现编辑。</p>';
  const input=normalizeResume(r);assert(!JSON.stringify(modelResume(input)).includes('private-'));
  const result=applyModelResult(input,{requirements:[],suggestions:[{moduleName:'project',index:0,sourceRefs:['project:0'],bullets:['使用 JavaScript 实现编辑。']}]},'JavaScript 开发','开发');
  assert.deepEqual(result.resume.basicInfo.make,input.basicInfo.make);
});
