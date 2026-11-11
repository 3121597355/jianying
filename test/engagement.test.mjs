import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEngagement} from '../engagement.mjs';
import {createVisitTracker} from '../assets/js/visit-tracker.js';

const local=value=>Date.parse('2026-11-11T'+value+'+08:00');
const range={from:'2026-11-11',to:'2026-11-11'};
test('visible-time tracker pauses hidden tabs and replaces the visit on BFCache restore',()=>{
  let clock=0,id=0,restores=0;const sent=[],listeners=new Map(),timers=[];
  const document={visibilityState:'visible',addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const window={location:new URL('http://127.0.0.1:8099/'),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),setInterval:fn=>(timers.push(fn),1),clearInterval:()=>{}};
  const tracker=createVisitTracker({document,window,route:'/',now:()=>clock,makeId:()=>String(++id),send:(data,beacon)=>sent.push({...data,beacon}),onRestore:()=>restores++});
  assert.equal(sent[0].visibleMs,0);clock=5000;document.visibilityState='hidden';listeners.get('visibilitychange')();assert.equal(sent.at(-1).visibleMs,5000);assert.equal(sent.at(-1).reason,'hidden');
  clock=600000;timers[0]();assert.equal(sent.length,2);document.visibilityState='visible';listeners.get('visibilitychange')();clock+=7000;tracker.checkpoint();assert.equal(sent.at(-1).visibleMs,12000);
  listeners.get('click')({target:{closest:()=>({href:'http://127.0.0.1:8099/resume/'})},button:0});listeners.get('pagehide')();assert.equal(sent.at(-1).nextPath,'/resume/');assert.equal(sent.at(-1).reason,'end');assert.equal(sent.at(-1).beacon,true);
  listeners.get('pageshow')({persisted:true});assert.equal(tracker.visitId,'2');assert.equal(sent.at(-1).visibleMs,0);assert.equal(restores,1);tracker.destroy();assert.equal(listeners.size,0);
});
test('large clock gaps are bounded and prevented or new-window links do not end a visit',()=>{
  let clock=0;const events=new Map(),sent=[];
  const document={visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:()=>{}};
  const window={location:new URL('http://127.0.0.1:8099/'),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:()=>{},setInterval:()=>1,clearInterval:()=>{}};
  const tracker=createVisitTracker({document,window,route:'/',now:()=>clock,makeId:()=> 'test',send:data=>sent.push(data)});
  clock=3600000;tracker.checkpoint();assert.equal(sent.at(-1).visibleMs,60000);
  events.get('click')({target:{closest:()=>({href:'http://127.0.0.1:8099/portrait/'})},defaultPrevented:true});events.get('click')({target:{closest:()=>({href:'http://127.0.0.1:8099/resume/',target:'_blank'})}});events.get('pagehide')();assert.equal(sent.at(-1).nextPath,'');tracker.destroy();
});
test('internal page changes count as one session, successful exits are not abandonment',()=>{
  const visits=[{id:'a',visitor:'browser-a',path:'/',startedAt:local('09:00:00'),updatedAt:local('09:00:05'),visibleMs:5000,reason:'end',nextPath:'/resume/'},{id:'b',visitor:'browser-a',path:'/resume/',startedAt:local('09:00:06'),updatedAt:local('09:01:06'),visibleMs:60000,reason:'end',nextPath:''},{id:'c',visitor:'browser-b',path:'/',startedAt:local('12:00:00'),updatedAt:local('12:00:08'),visibleMs:8000,reason:'end',nextPath:''}];
  const events=[{visitId:'b',day:'2026-11-11',type:'resume_edit_start'},{visitId:'b',day:'2026-11-11',type:'resume_export'}];
  const result=buildEngagement({visits,events,range,now:local('13:00:00')});assert.equal(result.metrics.completedSessions,2);assert.equal(result.metrics.successfulExits,1);assert.equal(result.metrics.quickUnfinished,1);assert.equal(result.metrics.averageVisibleMs,24333);assert.equal(result.pages[0].exits,1);assert.equal(result.pages[1].exits,1);assert.equal(result.buckets[0].value,1);assert.equal(result.buckets[3].value,1);assert.equal(result.hours[9].entries,1);assert.equal(result.hours[9].exits,1);assert.equal(result.paths[0].steps.at(-1).value,1);
});
test('hidden tabs remain pending, stale heartbeat loss is labeled inferred, and old views have no invented duration',()=>{
  const visit={id:'a',visitor:'browser-a',path:'/portrait/',startedAt:local('09:00:00'),updatedAt:local('09:01:00'),visibleMs:10000,reason:'hidden',nextPath:''};
  const pending=buildEngagement({visits:[visit],events:[],range,now:local('09:02:00')});assert.equal(pending.metrics.completedSessions,0);assert.equal(pending.metrics.pendingSessions,1);assert.equal(pending.metrics.averageVisibleMs,null);
  const stale=buildEngagement({visits:[visit],events:[],range,now:local('09:32:00')});assert.equal(stale.metrics.inferredExits,1);assert.equal(stale.metrics.averageVisibleMs,10000);assert.equal(stale.hours[9].exits,1);
  const legacy=buildEngagement({visits:[],events:[{type:'page_view',day:'2026-11-11',path:'/resume/'}],range,now:local('13:00:00')});assert.equal(legacy.metrics.measuredVisits,0);assert.equal(legacy.metrics.quickRate,null);
});
test('exit grace and internal navigation without a following page avoid premature exit counts',()=>{
  const visit={id:'a',visitor:'browser-a',path:'/',startedAt:local('09:00:00'),updatedAt:local('09:00:10'),visibleMs:10000,reason:'end',nextPath:''};
  assert.equal(buildEngagement({visits:[visit],events:[],range,now:local('09:00:20')}).metrics.completedSessions,0);
  assert.equal(buildEngagement({visits:[{...visit,nextPath:'/resume/'}],events:[],range,now:local('09:02:00')}).metrics.completedSessions,0);
  assert.equal(buildEngagement({visits:[{...visit,nextPath:'/resume/'}],events:[],range,now:local('09:31:00')}).metrics.inferredExits,1);
});
test('a quick successful download is not an unfinished exit and hourly rates follow entry cohorts',()=>{
  const visits=Array.from({length:5},(_,index)=>({id:String(index),visitor:'browser-'+index,path:'/portrait/',startedAt:local('10:59:55'),updatedAt:local('11:00:03'),visibleMs:8000,reason:'end',nextPath:''}));
  const events=[{visitId:'0',day:range.from,type:'portrait_export'}];
  const result=buildEngagement({visits,events,range,now:local('11:01:00')});
  assert.equal(result.metrics.successfulExits,1);assert.equal(result.metrics.quickUnfinished,4);assert.equal(result.hours[10].entries,5);assert.equal(result.hours[10].quickRate,.8);assert.equal(result.hours[11].exits,5);assert.equal(result.hours[11].quickRate,null);
});
test('date filtering keeps prior-day connected sessions out and session gaps create new visits',()=>{
  const visits=[{id:'a',visitor:'same',path:'/',startedAt:Date.parse('2026-11-10T23:59:40+08:00'),updatedAt:Date.parse('2026-11-10T23:59:50+08:00'),visibleMs:10000,reason:'end',nextPath:'/resume/'},{id:'b',visitor:'same',path:'/resume/',startedAt:local('00:00:00'),updatedAt:local('00:01:00'),visibleMs:60000,reason:'end',nextPath:''},{id:'c',visitor:'same',path:'/portrait/',startedAt:local('00:32:00'),updatedAt:local('00:33:00'),visibleMs:60000,reason:'end',nextPath:''}];
  const result=buildEngagement({visits,events:[],range,now:local('01:00:00')});assert.equal(result.metrics.measuredVisits,2);assert.equal(result.metrics.completedSessions,1);assert.equal(result.pages[1].exits,0);assert.equal(result.pages[2].exits,1);assert.equal(result.hours[0].entries,1);
});
