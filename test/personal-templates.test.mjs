import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureTemplateStyle,listPersonalTemplates,savePersonalTemplate,removePersonalTemplate,templateMatches} from '../assets/js/personal-templates.js';
const memory=()=>{const data=new Map();return{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};};
test('personal templates persist only styles, retain identity on updates and can be removed',()=>{
  const storage=memory(),style={tplId:2001,skin:'#236D58',font:1,fontSize:14,mm:20,pp:40,lineHeight:1.65,title:'personal heading',basicInfo:{name:'private'},apiKey:'fixture-only'};
  const saved=savePersonalTemplate('清爽简历',style,{storage});assert.equal(saved.name,'清爽简历');
  assert.equal(saved.style.skin,'#236d58');assert.equal(saved.style.title,undefined);assert.equal(saved.style.basicInfo,undefined);assert.equal(saved.style.apiKey,undefined);
  assert.equal(listPersonalTemplates(storage).length,1);assert.equal(templateMatches(saved,style),true);
  const renamed=savePersonalTemplate('新的名称',{...style,pp:50},{id:saved.id,storage});assert.equal(renamed.id,saved.id);assert.equal(listPersonalTemplates(storage).length,1);assert.equal(renamed.style.pp,50);
  removePersonalTemplate(saved.id,storage);assert.deepEqual(listPersonalTemplates(storage),[]);
});
test('template validation handles damaged storage, bad values and failed writes',()=>{
  const storage=memory();storage.setItem('qmj-clone:templates','broken JSON');assert.deepEqual(listPersonalTemplates(storage),[]);
  const style=captureTemplateStyle({tplId:999,skin:'url(unsafe)',mm:999,fontSize:-5});assert.equal(style.tplId,2001);assert.equal(style.mm,50);assert.equal(style.fontSize,10);assert.match(style.skin,/^#[\da-f]{6}$/);
  assert.throws(()=>savePersonalTemplate(' ',{}, {storage}),/模板名称/);
  assert.throws(()=>savePersonalTemplate('保存失败',{}, {storage:{getItem:()=>null,setItem:()=>{throw Error('storage full')}}}),/storage full/);
});
