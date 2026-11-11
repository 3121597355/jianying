import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderStandard} from '../assets/js/standard-renderer.js';
import {DEFAULT_TPL,getTemplate,TEMPLATES} from '../assets/js/templates.js';

test('public registry contains ten native templates and retains original draft IDs',()=>{
  assert.deepEqual(TEMPLATES.map(t=>t.id),[2001,2002,2003,2004,1013,1044,1045,1002,1007,1046]);
  assert.equal(getTemplate(1044).id,1044);
  assert.equal(getTemplate(9999).id,DEFAULT_TPL);
  assert.equal(getTemplate('2003').id,2003);
});
test('blank and hidden modules do not emit empty headings or undefined profile values',()=>{
  const html=renderStandard({basicInfo:{workYears:-1},moduleData:[
    {moduleName:'work',moduleValue:'工作经历',visible:true,data:[{}]},
    {moduleName:'make',moduleValue:'保密模块',visible:false,content:'hidden'},
  ]});
  assert.doesNotMatch(html,/工作经历|保密模块|undefined|null|不填/);
  assert.match(html,/你的姓名/);
});
test('plain text, photo attributes and module labels are escaped; settings are bounded',()=>{
  const html=renderStandard({setData:{skin:'url(unsafe)',fontSize:200,pp:999},basicInfo:{name:'<img onerror=bad>',photoShow:true,photo:'" onerror="bad'},moduleData:[{moduleName:'make',moduleValue:'<script>',visible:true,content:'<p>safe rich text</p>'}]});
  assert.doesNotMatch(html,/<script>|<img onerror|src="" onerror|url\(unsafe\)|font-size:200px|padding:28px 999px/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/<p>safe rich text<\/p>/);
});
test('intention merges beside basic information and becomes independent when reordered',()=>{
  const r={setData:{moduleSort:['basic','yixiang','work']},basicInfo:{name:'示例'},moduleData:[{moduleName:'yixiang',moduleValue:'求职意向',visible:true,data:{job:'设计师'}}]};
  const merged=renderStandard(r);assert.match(merged,/class="yixiang_tip"/);assert.doesNotMatch(merged,/id="yixiang"/);
  r.setData.moduleSort=['yixiang','basic'];const moved=renderStandard(r);assert.match(moved,/id="yixiang"/);assert.ok(moved.indexOf('id="yixiang"')<moved.indexOf('id="basicInfo"'));
});
test('classic blue has a separate title, labeled profile and intention while retaining order and optional values',()=>{
  const template=getTemplate(1044);
  const r={setData:{...template.style,title:'我的求职简历',slogan:'PERSONAL PROFILE',moduleSort:['work','basic','yixiang']},basicInfo:{name:'测试姓名',workYears:'',sex:'不填',zhengzhi:0,photoShow:true,photo:'/assets/img/landing/portrait-demo.webp',make:[{keyValue:'个人网站',value:'example.com'}]},moduleData:[
    {moduleName:'work',moduleValue:'职业经历',visible:true,data:[{}, {name:'测试公司',content:'<p>测试经历</p>'}]},
    {moduleName:'yixiang',moduleValue:'职业方向',visible:true,data:{job:'工程师',city:'杭州'}},
  ]};
  const html=template.render(r);
  for(const text of ['我的求职简历','PERSONAL PROFILE','基本信息','basic_info_grid','意向岗位：工程师','个人网站','example.com','data-item-index="1"','data-photo-slot'])assert.ok(html.includes(text),text);
  assert.ok(html.indexOf('id="resumeHead"')<html.indexOf('id="work"'));
  assert.ok(html.indexOf('id="work"')<html.indexOf('id="basicInfo"'));
  assert.ok(html.indexOf('id="basicInfo"')<html.indexOf('id="yixiang"'));
  assert.doesNotMatch(html,/政治面貌|工作年限|不填|yixiang_tip/);
  r.basicInfo.zhengzhi='群众';r.basicInfo.photoShow=false;r.moduleData[1].visible=false;r.setData.skin='#168f83';
  const changed=template.render(r);
  assert.match(changed,/政治面貌/);assert.match(changed,/群众/);assert.match(changed,/rgba\(22,143,131,.12\)/);
  assert.doesNotMatch(changed,/data-photo-slot|职业方向|id="yixiang"/);
});
