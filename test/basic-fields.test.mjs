import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBasicFields,MAX_BASIC_FIELDS,normalizeBasicOrder,moveBasicKey,hasCustomBasicOrder,defaultBasicOrder,DEFAULT_BASIC_ORDER,customBasicKey,customBasicIndex,isCustomBasicKey} from '../assets/js/basic-fields.js';
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

test('basic field order keeps only known keys and falls back to the default order',()=>{
  assert.deepEqual(normalizeBasicOrder(undefined),defaultBasicOrder());
  assert.deepEqual(normalizeBasicOrder([]),defaultBasicOrder());
  assert.deepEqual(normalizeBasicOrder(['sex','sex','不存在的键']),['sex',...defaultBasicOrder().filter(key=>key!=='sex')]);
  assert.deepEqual(moveBasicKey(DEFAULT_BASIC_ORDER,'email',0)[0],'email');
  assert.deepEqual(moveBasicKey(DEFAULT_BASIC_ORDER,'name',3).indexOf('name'),3);
  assert.deepEqual(moveBasicKey(DEFAULT_BASIC_ORDER,'name',99).at(-1),'name');
  assert.equal(hasCustomBasicOrder(undefined),false,'未调整过的草稿仍按原版式渲染');
  assert.equal(hasCustomBasicOrder(DEFAULT_BASIC_ORDER),false);
  assert.equal(hasCustomBasicOrder(['email',...DEFAULT_BASIC_ORDER.filter(key=>key!=='email')]),true);
});

test('custom basic fields share the order table with built-in fields',()=>{
  assert.equal(isCustomBasicKey(customBasicKey(3)),true);
  assert.equal(isCustomBasicKey('make:x'),false);
  assert.equal(customBasicIndex('make:7'),7);
  assert.equal(customBasicIndex('name'),-1);
  // 自定义键可以插到中间，缺失的内置字段补在末尾
  const order=normalizeBasicOrder(['name','make:1','sex'],2);
  assert.deepEqual(order.slice(0,4),['name','make:1','sex','birthday']);
  assert(order.includes('make:0')&&!order.includes('make:2'),'超出实际条目数的自定义键被丢弃');
  // 没调整过顺序时仍视为默认版式
  assert.equal(hasCustomBasicOrder(normalizeBasicOrder(undefined,2),2),false);
  assert.equal(hasCustomBasicOrder(['make:0','name'],2),true);
  // 移动自定义行
  assert.equal(moveBasicKey(normalizeBasicOrder(['name','make:0'],1),'make:0',0)[0],'make:0');
});

test('custom basic order survives cloud save with custom keys',()=>{
  const r=createDefault();
  r.basicInfo={...r.basicInfo,name:'张三',mobile:'13800000000',make:[{keyValue:'个人网站',value:'example.com',visible:true},{keyValue:'微信',value:'wechat-id',visible:true}]};
  r.setData.basicOrder=['name',customBasicKey(1),'mobile',customBasicKey(0),...DEFAULT_BASIC_ORDER.filter(key=>!['name','mobile'].includes(key))];
  const saved=normalizeResume(r);
  assert.deepEqual(saved.setData.basicOrder.slice(0,4),['name','make:1','mobile','make:0'],'自定义信息顺序写入云端');
  assert.deepEqual(normalizeResume(JSON.parse(JSON.stringify(saved))),saved);
  const html=renderByTpl(saved);
  assert(html.indexOf('wechat-id')<html.indexOf('13800000000'),'自定义行按顺序显示在手机号之前');
  assert(html.indexOf('13800000000')<html.indexOf('example.com'),'第二个自定义行排在手机号之后');
});

test('custom basic order survives save and drives the resume header order',()=>{
  const r=createDefault();
  r.basicInfo={...r.basicInfo,name:'张三',sex:1,birthday:'1990-01',mobile:'13800000000',email:'hi@example.com',minzu:'汉族'};
  const before=renderByTpl(r);
  assert(before.indexOf('hi@example.com')>0);
  const order=['email','mobile','sex','birthday','name','photo','workYears','hunyin','height','minzu','jiguan','zhengzhi'];
  r.setData.basicOrder=order;
  const html=renderByTpl(r);
  assert(html.indexOf('hi@example.com')>0&&html.indexOf('13800000000')>0,'联系方式仍会展示');
  assert(html.indexOf('hi@example.com')<html.indexOf('13800000000'),'邮箱按设置排在手机号之前');
  assert.equal((html.match(/id="myname"/g)||[]).length,1,'姓名仍是唯一的标题锚点');
  const saved=normalizeResume(r);
  assert.deepEqual(saved.setData.basicOrder,order,'云端保存后顺序不丢失');
  assert.deepEqual(normalizeResume(JSON.parse(JSON.stringify(saved))),saved);
});
