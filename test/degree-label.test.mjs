import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEGREE,degreeLabel} from '../assets/js/dict.js';
import {renderStandard} from '../assets/js/standard-renderer.js';

const resume=(xueli)=>({
  setData:{tplId:2001,skin:'#1575bf'},
  basicInfo:{name:'示例',mobile:'13800000000'},
  moduleData:[
    {moduleName:'jiaoyu',moduleValue:'教育背景',visible:true,data:[{name:'示例学院',major:'信息管理',xueli,timeStart:'2022-09',timeEnd:'2025-06'}]},
    {moduleName:'work',moduleValue:'工作经历',visible:true,data:[]},
  ],
});

test('degree choices offer 专科 and no longer show 大专',()=>{
  assert.ok(DEGREE.includes('专科'));
  assert.ok(!DEGREE.includes('大专'));
});

test('legacy 大专 drafts render as 专科 without rewriting stored text',()=>{
  const draft=resume('大专'),snapshot=structuredClone(draft);
  assert.match(renderStandard(draft),/专科/);
  assert.doesNotMatch(renderStandard(draft),/大专/);
  assert.deepEqual(draft,snapshot);
  assert.equal(degreeLabel('大专'),'专科');
});

test('updated 专科, other degrees and the empty choice still render as before',()=>{
  assert.match(renderStandard(resume('专科')),/专科/);
  assert.match(renderStandard(resume('本科')),/本科/);
  assert.doesNotMatch(renderStandard(resume('不填')),/不填/);
  assert.doesNotMatch(renderStandard(resume('')),/不填|大专/);
});
