import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEditorUi} from '../assets/js/editor-state.js';

test('new visitors and older drafts without a sidebar choice start expanded',()=>{
  for(const value of [undefined,null,{},[],{theme:'dark'}, {editOpen:'false'}]) assert.equal(normalizeEditorUi(value).editOpen,true);
});
test('explicit sidebar choices and other saved preferences survive normalization',()=>{
  const saved={editOpen:false,tab:'project',theme:'dark',savedAt:123};
  assert.deepEqual(normalizeEditorUi(saved),saved);
  assert.equal(normalizeEditorUi({...saved,editOpen:true}).editOpen,true);
  assert.equal(saved.editOpen,false);
});
