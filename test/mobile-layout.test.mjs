import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keyboardIsOpen} from '../assets/js/mobile-layout.js';

test('mobile keyboard layout responds only to focused editing with a substantially reduced viewport',()=>{
  assert.equal(keyboardIsOpen({width:390,height:844,visualHeight:490,editing:true}),true);
  assert.equal(keyboardIsOpen({width:932,height:430,visualHeight:210,editing:true}),true);
  assert.equal(keyboardIsOpen({width:932,height:1024,visualHeight:600,editing:true}),false);
  assert.equal(keyboardIsOpen({width:390,height:844,visualHeight:770,editing:true}),false);
  assert.equal(keyboardIsOpen({width:390,height:844,visualHeight:490,editing:false}),false);
  assert.equal(keyboardIsOpen({width:1280,height:844,visualHeight:490,editing:true}),false);
  assert.equal(keyboardIsOpen({width:390,height:0,visualHeight:0,editing:true}),false);
});
