import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderStandard} from '../assets/js/standard-renderer.js';
import {DEFAULT_TPL,getTemplate,TEMPLATES} from '../assets/js/templates.js';

test('public registry contains only authored templates and safely falls back from old IDs',()=>{
  assert.deepEqual(TEMPLATES.map(t=>t.id),[2001,2002,2003,2004]);
  assert.equal(getTemplate(1044).id,DEFAULT_TPL);
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
