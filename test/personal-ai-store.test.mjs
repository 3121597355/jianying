import {test} from 'node:test';
import assert from 'node:assert/strict';

const entry=new URL('../assets/js/personal-ai-store.js',import.meta.url).href;

function fakeWindow(hostname,seed={}){
  const data=new Map(Object.entries(seed));
  globalThis.location={hostname};
  globalThis.localStorage={getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
  return data;
}

const sample={baseUrl:'http://127.0.0.1:7865/v1',model:'cn:deepseek-v4.1-flash',apiKey:'fixture'};

test('local deployments remember the AI connection across reloads until it is cleared',async()=>{
  const data=fakeWindow('localhost');
  const first=await import(entry+'?local-remember');
  assert.equal(first.localDeploy(),true);
  assert.equal(first.storedLocal('resume'),null);
  first.rememberLocal('resume',sample);
  assert.equal(data.get('yizhi:personal-ai:resume'),JSON.stringify(sample));
  const reloaded=await import(entry+'?local-remember');
  assert.deepEqual(reloaded.storedLocal('resume'),sample);
  reloaded.rememberLocal('resume',null);
  assert.equal(reloaded.storedLocal('resume'),null);
  assert.equal(data.has('yizhi:personal-ai:resume'),false);
  first.rememberLocal('portrait',sample);
  assert.deepEqual(reloaded.storedLocal('portrait'),sample,'portrait connections are stored separately');
  assert.equal(reloaded.storedLocal('resume'),null);
});

test('public deployments never read or write saved connections',async()=>{
  const data=fakeWindow('yizhijianli.top',{'yizhi:personal-ai:resume':JSON.stringify(sample)});
  const store=await import(entry+'?public-strict');
  assert.equal(store.localDeploy(),false);
  assert.equal(store.storedLocal('resume'),null);
  store.rememberLocal('fixture',sample);
  assert.equal(data.has('yizhi:personal-ai:fixture'),false,'public deployments never write');
  assert.deepEqual(JSON.parse(data.get('yizhi:personal-ai:resume')),sample,'existing browser values stay untouched');
});

test('incomplete or corrupt saved connections are ignored',async()=>{
  const data=fakeWindow('127.0.0.1',{'yizhi:personal-ai:resume':'{not json'});
  const store=await import(entry+'?corrupt');
  assert.equal(store.storedLocal('resume'),null);
  data.set('yizhi:personal-ai:portrait',JSON.stringify({baseUrl:''}));
  assert.equal(store.storedLocal('portrait'),null);
  delete globalThis.localStorage;
  assert.equal(store.storedLocal('resume'),null);
  store.rememberLocal('resume',sample);
});

