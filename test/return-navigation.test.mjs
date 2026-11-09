import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReturnNavigation} from '../portrait/public/navigation.js';

test('return to resume waits for the photo save and keeps the first destination',async()=>{
  let finishSave;
  const destinations=[];
  const states=[];
  const go=createReturnNavigation({save:()=>new Promise(resolve=>{finishSave=resolve;}),navigate:url=>destinations.push(url),isBusy:()=>false,onBusy:()=>{},onPending:value=>states.push(value)});
  const first=go('/resume/');
  assert.deepEqual(destinations,[]);
  assert.equal(await go('/'),false);
  finishSave(true);
  assert.equal(await first,true);
  assert.deepEqual(destinations,['/resume/']);
  assert.equal(await go('/'),false);
  assert.deepEqual(states,[true]);
});
test('failed saves keep the photo page and allow retrying the intended destination',async()=>{
  let saved=false;
  const destinations=[];
  const go=createReturnNavigation({save:()=>saved,navigate:url=>destinations.push(url),isBusy:()=>false,onBusy:()=>{}});
  assert.equal(await go('/resume/'),false);
  assert.deepEqual(destinations,[]);
  saved=true;
  assert.equal(await go('/resume/'),true);
  assert.deepEqual(destinations,['/resume/']);
});
test('return links reject other destinations and remain on the page while processing',async()=>{
  let busy=true,blocked=0,saves=0;
  const destinations=[];
  const go=createReturnNavigation({save:()=>{saves++;return true;},navigate:url=>destinations.push(url),isBusy:()=>busy,onBusy:()=>blocked++});
  assert.equal(await go('https://example.com/'),false);
  assert.equal(await go('/resume/'),false);
  assert.equal(blocked,1);
  assert.equal(saves,0);
  busy=false;
  assert.equal(await go('/'),true);
  assert.deepEqual(destinations,['/']);
});
test('shared toolbar opens the exact settings or template destination after saving',async()=>{
  for(const destination of ['/resume/?settings=1','/resume/?templates=1']) {
    const events=[];
    const go=createReturnNavigation({save:()=>{events.push('saved');return true;},navigate:url=>events.push(url),isBusy:()=>false,onBusy:()=>{}});
    assert.equal(await go(destination),true);
    assert.deepEqual(events,['saved',destination]);
  }
});
