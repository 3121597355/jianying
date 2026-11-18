import {test} from 'node:test';
import assert from 'node:assert/strict';

const entry=new URL('../assets/js/job-coach-store.js',import.meta.url).href;

function fakeStorage(seed={}){
  const data=new Map(Object.entries(seed));
  globalThis.localStorage={getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
  return data;
}

const resume={moduleData:[{moduleName:'project',moduleValue:'项目经验',visible:true,data:[{name:'一纸简历'}]}]};
const result={mode:'ai',resume,analysis:{notice:'已按岗位调整'},changes:[{label:'项目经验 · 一纸简历',before:'旧',after:'新',reason:'更贴岗位'}],warnings:[]};

test('suggestions survive a reload for the same account and resume',async()=>{
  const data=fakeStorage();
  const store=await import(entry+'?roundtrip');
  assert.equal(store.loadJobCoach('u1','r1'),null);
  const saved=store.saveJobCoach('u1','r1',{jobTitle:'全栈工程师',jd:'负责前端与后端开发，熟悉 Node',sourceKey:'current',baselineHash:'abc-12',result});
  assert.equal(saved.ok,true);
  assert.equal(saved.full,true);
  const loaded=store.loadJobCoach('u1','r1');
  assert.equal(loaded.jobTitle,'全栈工程师');
  assert.equal(loaded.baselineHash,'abc-12');
  assert.equal(loaded.result.mode,'ai');
  assert.equal(loaded.result.adoptable,true);
  assert.deepEqual(loaded.result.resume.moduleData[0].data[0],{name:'一纸简历'});
  assert.equal(loaded.result.changes[0].after,'新');
  assert.equal(data.size,1);
});

test('accounts and resumes never share a suggestion slot',async()=>{
  fakeStorage();
  const store=await import(entry+'?scoped');
  store.saveJobCoach('u1','r1',{jobTitle:'A',jd:'',result});
  store.saveJobCoach('u1','r2',{jobTitle:'B',jd:'',result});
  store.saveJobCoach('u2','r1',{jobTitle:'C',jd:'',result});
  store.saveJobCoach('local','draft',{jobTitle:'D',jd:'',result});
  assert.equal(store.loadJobCoach('u1','r1').jobTitle,'A');
  assert.equal(store.loadJobCoach('u1','r2').jobTitle,'B');
  assert.equal(store.loadJobCoach('u2','r1').jobTitle,'C');
  assert.equal(store.loadJobCoach('local','draft').jobTitle,'D');
  store.clearJobCoach('u1','r1');
  assert.equal(store.loadJobCoach('u1','r1'),null);
  assert.equal(store.loadJobCoach('u1','r2').jobTitle,'B');
});

test('only known fields are restored and long drafts are trimmed',async()=>{
  fakeStorage();
  const store=await import(entry+'?sanitize');
  store.saveJobCoach('u1','r1',{jobTitle:'x'.repeat(200),jd:'y'.repeat(20000),sourceKey:'cloud:9',result:{mode:'weird',findings:'nope',changes:[],warnings:[]}});
  const loaded=store.loadJobCoach('u1','r1');
  assert.equal(loaded.jobTitle.length,80);
  assert.equal(loaded.jd.length,12000);
  assert.equal(loaded.result.mode,'ai','unknown modes fall back to the editable version');
  assert.deepEqual(loaded.result.findings,[]);
  assert.equal(loaded.result.adoptable,false,'a suggestion without a resume copy cannot be adopted');
});

test('oversized results keep the advice text but drop the resume copy',async()=>{
  fakeStorage();
  const store=await import(entry+'?oversize');
  const big={...result,resume:{...resume,pad:'z'.repeat(3600000)}};
  const saved=store.saveJobCoach('u1','r1',{jobTitle:'全栈',jd:'',result:big});
  assert.equal(saved.ok,true);
  assert.equal(saved.full,false);
  const loaded=store.loadJobCoach('u1','r1');
  assert.equal(loaded.result.resume,null);
  assert.equal(loaded.result.adoptable,false);
  assert.equal(loaded.result.changes[0].after,'新','advice text is still kept');
});

test('a resume copy that does not fit falls back to advice only',async()=>{
  const data=new Map();
  globalThis.localStorage={
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>{if(String(value).length>300000){const error=Error('quota');error.name='QuotaExceededError';throw error;}data.set(key,String(value));},
    removeItem:key=>data.delete(key)
  };
  const store=await import(entry+'?partial');
  const big={...result,resume:{...resume,pad:'z'.repeat(400000)}};
  const saved=store.saveJobCoach('u1','r1',{jobTitle:'全栈',jd:'',result:big});
  assert.equal(saved.ok,true);
  assert.equal(saved.full,false);
  assert.equal(store.loadJobCoach('u1','r1').result.adoptable,false);
  assert.equal(store.loadJobCoach('u1','r1').jobTitle,'全栈');
});

test('a full disk is reported instead of silently losing the advice',async()=>{
  globalThis.localStorage={getItem:()=>null,setItem:()=>{const error=Error('quota');error.name='QuotaExceededError';throw error;},removeItem:()=>{}};
  const store=await import(entry+'?quota');
  const saved=store.saveJobCoach('u1','r1',{jobTitle:'全栈',jd:'',result});
  assert.equal(saved.ok,false);
  assert.equal(saved.reason,'quota');
  delete globalThis.localStorage;
  assert.equal(store.loadJobCoach('u1','r1'),null);
  assert.equal(store.saveJobCoach('u1','r1',{result}).ok,false);
});

test('a pending feedback revision survives reload without replacing the current advice',async()=>{
  fakeStorage();
  const store=await import(entry+'?feedback');
  const pending={...result,changes:[{label:'项目经验 · 一纸简历',before:'旧',after:'按反馈改过',reason:'更贴岗位'}]};
  store.saveJobCoach('u1','r1',{jobTitle:'全栈',jd:'',result,pendingResult:pending,feedbackMessages:[{role:'user',text:'再具体一点',createdAt:1},{role:'assistant',text:'已生成新建议',createdAt:2}]});
  const loaded=store.loadJobCoach('u1','r1');
  assert.equal(loaded.result.changes[0].after,'新','the confirmed advice stays untouched');
  assert.equal(loaded.pendingResult.changes[0].after,'按反馈改过');
  assert.equal(loaded.feedbackMessages.length,2);
  assert.equal(loaded.feedbackMessages[0].role,'user');
  assert.equal(loaded.feedbackMessages[1].role,'assistant');
});

test('feedback history is capped and each message is trimmed',async()=>{
  fakeStorage();
  const store=await import(entry+'?feedbacklimit');
  const messages=Array.from({length:12},(_,index)=>({role:index%2?'assistant':'user',text:'x'.repeat(index===11?3000:10),createdAt:index}));
  store.saveJobCoach('u1','r1',{jobTitle:'全栈',jd:'',result,feedbackMessages:messages});
  const loaded=store.loadJobCoach('u1','r1');
  assert.equal(loaded.feedbackMessages.length,8);
  assert.equal(loaded.feedbackMessages.at(-1).text.length,2000);
  assert.equal(loaded.pendingResult,null,'older records without a pending revision still load');
});
