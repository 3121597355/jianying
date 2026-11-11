import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TEMPLATES} from '../assets/js/templates.js';

async function environment(t,{draft=true}={}) {
  const originals=new Map(['window','document','localStorage','setTimeout','clearTimeout'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>originals.forEach((descriptor,key)=>descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]));
  const resumeKey='qmj-clone:resume',uiKey='qmj-clone:ui',events=new Map(),timers=new Map(),writes=[];
  const data=new Map(draft?[[resumeKey,JSON.stringify({setData:{tplId:1044,slogan:'PERSONAL PROFILE'},basicInfo:{name:'测试草稿',photo:'data:image/jpeg;base64,fixture'},moduleData:[]})],[uiKey,'{"tplChosen":true,"editOpen":true}']]:[]);
  globalThis.localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>{writes.push(key);data.set(key,value);}};
  globalThis.window={addEventListener:(name,fn)=>events.set(name,fn)};
  globalThis.document={visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn)};
  let id=0;
  globalThis.setTimeout=(fn,delay)=>{timers.set(++id,{fn,delay});return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const store=await import(`../assets/js/store.js?test=${Math.random()}`);
  return {store,data,writes,events,timers,resumeKey,uiKey};
}

test('fold preferences avoid preview updates and photo serialization, and restore after reload',async t=>{
  const {store,data,writes,timers,resumeKey,uiKey}=await environment(t);let previews=0;
  const previous=data.get(resumeKey);
  store.onChange(()=>previews++);
  Object.defineProperty(store.getResume().basicInfo,'photo',{enumerable:true,get(){throw Error('UI must not serialize photo');}});
  store.getUi().editOpen=false;
  store.commit({uiOnly:true});
  assert.equal(previews,0);
  assert.equal([...timers.values()][0].delay,550);
  assert.equal(store.flushSave(),true);
  assert.deepEqual(writes,[uiKey]);
  assert.equal(data.get(resumeKey),previous);
  const reloaded=await import(`../assets/js/store.js?reload=${Math.random()}`);
  assert.equal(reloaded.getUi().editOpen,false);
  assert.equal(reloaded.getResume().basicInfo.name,'测试草稿');
});

test('folding with pending edits still saves the latest resume before leaving',async t=>{
  const {store,data,writes,events,resumeKey,uiKey}=await environment(t);
  store.set(resume=>{resume.basicInfo.name='最新编辑';});
  store.getUi().editOpen=false;
  store.commit({uiOnly:true});
  events.get('pagehide')();
  assert.deepEqual(writes,[resumeKey,uiKey]);
  assert.equal(JSON.parse(data.get(resumeKey)).basicInfo.name,'最新编辑');
  assert.equal(JSON.parse(data.get(uiKey)).editOpen,false);
});

test('a first-visit fold creates a recoverable draft and preference',async t=>{
  const {store,data,resumeKey,uiKey}=await environment(t,{draft:false});
  store.getUi().editOpen=false;
  store.commit({uiOnly:true});
  assert.equal(store.flushSave(),true);
  assert.ok(JSON.parse(data.get(resumeKey)).basicInfo);
  assert.equal(JSON.parse(data.get(uiKey)).editOpen,false);
});

test('reloading every registered layout preserves the selected template and saved content',async t=>{
  const {data,resumeKey,uiKey}=await environment(t);
  for(const template of TEMPLATES){
    data.set(resumeKey,JSON.stringify({setData:{tplId:template.id,title:'保留标题'},basicInfo:{name:'保留草稿',photo:'data:image/png;base64,fixture'},moduleData:[]}));
    data.set(uiKey,JSON.stringify({tplChosen:true,editOpen:false}));
    const reloaded=await import(`../assets/js/store.js?templateReload=${template.id}-${Math.random()}`);
    assert.equal(reloaded.getResume().setData.tplId,template.id);
    assert.equal(reloaded.getResume().setData.title,'保留标题');
    assert.equal(reloaded.getResume().basicInfo.name,'保留草稿');
    assert.equal(reloaded.getUi().editOpen,false);
  }
});
