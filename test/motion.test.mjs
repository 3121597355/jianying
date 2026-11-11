import {test} from 'node:test';
import assert from 'node:assert/strict';

async function motionEnvironment(t) {
  const originals=new Map(['document','matchMedia','localStorage','getComputedStyle','IntersectionObserver','innerHeight'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>originals.forEach((descriptor,key)=>descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]));
  globalThis.document={documentElement:{dataset:{}}};
  globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
  globalThis.localStorage={getItem:()=>'{"motionMode":"soft"}'};
  globalThis.getComputedStyle=element=>element.computed;
  return import(`../assets/js/motion.js?test=${Math.random()}`);
}
function element(left=100,width=500) {
  return {
    bounds:{left,top:0,width,height:500},
    computed:{opacity:'1',visibility:'visible',zoom:'1'},
    played:[],
    getBoundingClientRect(){return {...this.bounds};},
    animate(keyframes,options){
      const target=this;
      const animation={keyframes,options,cancelled:false,cancel(){this.cancelled=true;target.bounds.left=100;this.oncancel?.();}};
      this.played.push(animation);
      return animation;
    },
  };
}

test('reversing a sidebar fold keeps its currently visible position and opacity',async t=>{
  const motion=await motionEnvironment(t),sidebar=element();
  motion.slideSidebar(sidebar,{bounds:{left:100,top:0,width:500},opacity:1,visibility:'visible'},false);
  const previous=sidebar.played[0];
  sidebar.bounds.left=280;sidebar.computed.opacity='.4';
  const snapshot=motion.captureElement(sidebar);
  assert.equal(snapshot.bounds.left,280);
  assert.equal(snapshot.opacity,.4);
  assert.equal(previous.cancelled,true);
  sidebar.bounds.left=100;
  motion.slideSidebar(sidebar,snapshot,true);
  const next=sidebar.played[1];
  assert.equal(next.keyframes[0].transform,'translate(180px,0px)');
  assert.equal(next.keyframes[0].opacity,.4);
  assert.equal(next.keyframes[1].opacity,1);
});
test('reduced motion cancels in-flight paper and handle animations and skips new slides',async t=>{
  const motion=await motionEnvironment(t),paper=element(),handle=element(100,32);
  motion.movePaper(paper,{left:0,top:0,width:400});
  motion.moveElement(handle,{left:0,top:0,width:32});
  motion.applyMotionPreference('reduce');
  assert.equal(paper.played[0].cancelled,true);
  assert.equal(handle.played[0].cancelled,true);
  motion.slideSidebar(paper,{bounds:paper.bounds,opacity:0,visibility:'hidden'},true);
  assert.equal(paper.played.length,1);
});
test('a hidden sidebar enters from the right at full width',async t=>{
  const motion=await motionEnvironment(t),sidebar=element();
  motion.slideSidebar(sidebar,{bounds:{left:100,top:0,width:500},opacity:0,visibility:'hidden'},true);
  assert.equal(sidebar.played[0].keyframes[0].transform,'translate(536px,0px)');
  assert.equal(sidebar.played[0].keyframes[0].opacity,0);
  assert.equal(sidebar.played[0].options.duration,480);
});

async function scrollEnvironment(t) {
  const motion=await motionEnvironment(t),observers=[],events=new Map();
  Object.assign(document,{hidden:false,activeElement:null,
    addEventListener:(name,listener)=>events.set(name,listener),
    removeEventListener:name=>events.delete(name),
  });
  globalThis.innerHeight=720;
  globalThis.IntersectionObserver=class {
    constructor(callback,options){this.callback=callback;this.options=options;this.targets=new Set();observers.push(this);}
    observe(target){this.targets.add(target);}
    disconnect(){this.targets.clear();}
    deliver(target,isIntersecting){this.callback([{target,isIntersecting}]);}
  };
  const card=element(),classes=new Set();card.bounds.top=1000;
  card.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};
  card.contains=target=>target===card;
  return {motion,observers,events,card};
}
test('background observations do not consume a scroll entrance before the tab is visible',async t=>{
  const {motion,observers,events,card}=await scrollEnvironment(t);
  const cleanup=motion.revealOnScroll([{element:card}]);
  document.hidden=true;
  observers[0].deliver(card,true);
  assert.equal(card.played.length,0);
  document.hidden=false;
  events.get('visibilitychange')();
  assert.equal(observers[0].targets.has(card),true);
  observers[0].deliver(card,true);
  assert.equal(card.played.length,1);
  document.hidden=true;
  events.get('visibilitychange')();
  assert.equal(card.played[0].cancelled,true);
  document.hidden=false;
  events.get('visibilitychange')();
  observers[0].deliver(card,true);
  assert.equal(card.played.length,2);
  cleanup();
  assert.equal(events.size,0);
  assert.equal(card.classList.contains('scroll-reveal-pending'),false);
});
test('scroll entrances replay after a full exit, but not at the entrance boundary or on keyboard focus',async t=>{
  const {motion,observers,events,card}=await scrollEnvironment(t);
  motion.revealOnScroll([{element:card}]);
  observers[0].deliver(card,true);
  observers[0].deliver(card,false);
  observers[0].deliver(card,true);
  assert.equal(card.played.length,1);
  observers[1].deliver(card,false);
  assert.equal(card.classList.contains('scroll-reveal-pending'),true);
  observers[0].deliver(card,true);
  assert.equal(card.played.length,2);
  observers[1].deliver(card,false);
  document.activeElement=card;
  events.get('focusin')({target:card});
  observers[0].deliver(card,true);
  assert.equal(card.classList.contains('scroll-reveal-pending'),false);
  assert.equal(card.played.length,2);
});
test('reduced motion reveals pending cards immediately without playback',async t=>{
  const {motion,observers,card}=await scrollEnvironment(t);
  motion.applyMotionPreference('reduce');
  motion.revealOnScroll([{element:card}]);
  observers[0].deliver(card,true);
  assert.equal(card.played.length,0);
  assert.equal(card.classList.contains('scroll-reveal-pending'),false);
});

test('paper translation compensates for CSS zoom on its preview ancestor',async t=>{
  const motion=await motionEnvironment(t),paper=element(300,410);paper.offsetWidth=820;
  motion.movePaper(paper,{left:100,top:0,width:328});
  assert.equal(paper.played[0].keyframes[0].transform,'translate(-400px,0px) scale(0.8)');
  assert.equal(paper.played[0].options.duration,480);
});
