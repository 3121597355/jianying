import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindModuleDrag } from '../assets/js/module-drag.js';

// A minimal event/geometry fixture exercises gesture interruption without a browser driver.
function fixture(t) {
  const saved = Object.fromEntries(['window','document','requestAnimationFrame','cancelAnimationFrame'].map(key=>[key,globalThis[key]]));
  t.after(()=>{for(const [key,value] of Object.entries(saved)) { if(value===undefined)delete globalThis[key];else globalThis[key]=value; }});
  const emitter = () => {
    const listeners = new Map();
    return { addEventListener(type, fn) { if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn); },
      emit(type, event={}) { for(const fn of listeners.get(type)||[])fn(event); } };
  };
  const classes = () => {const values=new Set();return {add:name=>values.add(name),remove:name=>values.delete(name),contains:name=>values.has(name)};};
  const list = Object.assign(emitter(), {children:[],offsetWidth:400,clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0,
    clientHeight:200,scrollHeight:200,getBoundingClientRect:()=>({left:0,right:400,top:0,bottom:200,width:400}),
    querySelectorAll:()=>list.children,appendChild(card){list.children=list.children.filter(el=>el!==card);list.children.push(card);},
    capture:null,setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(){this.capture=null;} });
  const ghosts=[];
  const doc=Object.assign(emitter(),{documentElement:{dataset:{motion:'reduce'},classList:classes()},visibilityState:'visible',
    querySelector:()=>null,body:{appendChild:node=>ghosts.push(node)},createElement:()=>({style:{},setAttribute(){},remove(){ghosts.splice(ghosts.indexOf(this),1);}})});
  const win=Object.assign(emitter(),{innerWidth:400,innerHeight:500,matchMedia:()=>({matches:false}),scrollBy(){}});
  Object.assign(globalThis,{window:win,document:doc,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
  const cards=['basic','work','project','pingjia'].map(name=>({dataset:{tab:name},parentElement:list,classList:classes(),offsetWidth:100,offsetHeight:80,
    get offsetLeft(){return list.children.indexOf(this)*100;},offsetTop:0,
    getBoundingClientRect(){return {left:this.offsetLeft,top:0,width:100,height:80};},querySelector:()=>({textContent:name})}));
  list.children=[...cards];
  const drops=[];bindModuleDrag(list,(name,order)=>drops.push({name,order}));
  const target=(index,kind='card')=>({closest(selector){if(selector==='[data-tab]')return cards[index];if(selector==='[data-drag]'&&kind==='grip')return this;if(selector.includes('[data-switch]')&&kind==='switch')return this;return null;}});
  const send=(type,{index=0,kind='card',pointerType='mouse',x=50,y=40,...rest}={})=>{
    const event={target:target(index,kind),pointerType,clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0,preventDefault(){this.prevented=true;},stopPropagation(){},stopImmediatePropagation(){this.stopped=true;},...rest};
    (type==='pointerdown'?list:win).emit(type,event);return event;
  };
  return {list,win,doc,ghosts,drops,send,order:()=>list.children.map(card=>card.dataset.tab)};
}

test('drop saves once, while movement leaves the stored order and form selection alone', t=>{
  const f=fixture(t);f.send('pointerdown');f.send('pointermove',{x:250});
  assert.deepEqual(f.order(),['work','project','basic','pingjia']);assert.equal(f.drops.length,0);assert.equal(f.ghosts.length,1);
  f.send('pointerup',{x:250});
  assert.deepEqual(f.drops,[{name:'basic',order:['work','project','basic','pingjia']}]);assert.equal(f.ghosts.length,0);
  const click={preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
  f.list.emit('click',click);assert.equal(click.stopped,true);
});

for(const interruption of ['pointercancel','blur','Escape','outside','visibilitychange','resize']) {
  test(`interruption ${interruption} restores the order and clears drag feedback without saving`,t=>{
    const f=fixture(t);f.send('pointerdown');f.send('pointermove',{x:250});
    if(interruption==='Escape')f.win.emit('keydown',{key:'Escape',preventDefault(){},stopPropagation(){}});
    else if(interruption==='outside')f.send('pointerup',{x:450});
    else if(interruption==='visibilitychange'){f.doc.visibilityState='hidden';f.doc.emit('visibilitychange');}
    else {if(interruption==='resize')f.win.innerWidth=300;f.send(interruption);}
    assert.deepEqual(f.order(),['basic','work','project','pingjia']);assert.equal(f.drops.length,0);assert.equal(f.ghosts.length,0);
    assert.equal(f.doc.documentElement.classList.contains('module-dragging'),false);assert.equal(f.list.capture,null);
  });
}

test('small movements and switch gestures keep ordinary click behavior',t=>{
  const f=fixture(t);f.send('pointerdown');f.send('pointermove',{x:53});f.send('pointerup',{x:53});
  f.send('pointerdown',{kind:'switch'});f.send('pointermove',{x:250});f.send('pointerup',{x:250});
  assert.equal(f.drops.length,0);assert.equal(f.ghosts.length,0);
  const click={preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
  f.list.emit('click',click);assert.notEqual(click.stopped,true);
});

test('touch on the card permits native scrolling; touch on the grip permits sorting',t=>{
  const f=fixture(t);f.send('pointerdown',{pointerType:'touch'});f.send('pointermove',{pointerType:'touch',x:250});f.send('pointerup',{pointerType:'touch',x:250});
  assert.equal(f.drops.length,0);
  f.send('pointerdown',{pointerType:'touch',kind:'grip'});
  assert.equal(f.send('pointermove',{pointerType:'touch',x:250}).prevented,true);
  f.send('pointerup',{pointerType:'touch',x:250});assert.equal(f.drops.length,1);
});

test('touch capture transferred from the grip to the list does not cancel sorting',t=>{
  const f=fixture(t);f.send('pointerdown',{pointerType:'touch',kind:'grip'});
  f.send('pointermove',{pointerType:'touch',x:150});
  // Touch pointers are implicitly captured by the original hit target. Its
  // lostpointercapture bubbles when explicit capture moves to the stable list.
  f.list.emit('lostpointercapture',{target:{dataset:{drag:'basic'}},pointerId:1});
  assert.equal(f.ghosts.length,1);
  f.send('pointermove',{pointerType:'touch',x:250});
  f.send('pointerup',{pointerType:'touch',x:250});
  assert.deepEqual(f.drops,[{name:'basic',order:['work','project','basic','pingjia']}]);
});

test('unexpected loss of capture on the list still cancels the current pointer',t=>{
  const f=fixture(t);f.send('pointerdown',{pointerType:'touch',kind:'grip'});f.send('pointermove',{pointerType:'touch',x:250});
  f.list.emit('lostpointercapture',{target:f.list,pointerId:1});
  assert.equal(f.ghosts.length,0);assert.equal(f.drops.length,0);
  assert.deepEqual(f.order(),['basic','work','project','pingjia']);
});

test('mobile address-bar height changes do not interrupt an active touch drag',t=>{
  const f=fixture(t);f.send('pointerdown',{pointerType:'touch',kind:'grip'});f.send('pointermove',{pointerType:'touch',x:150});
  f.win.innerHeight=440;f.win.emit('resize');assert.equal(f.ghosts.length,1);
  f.send('pointermove',{pointerType:'touch',x:250});f.send('pointerup',{pointerType:'touch',x:250});
  assert.equal(f.drops.length,1);
});
