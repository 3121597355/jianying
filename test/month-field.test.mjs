import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatMonthText,monthValue,monthText} from '../assets/js/month-field.js';

test('typed digits become a year-month while the field is still being filled',()=>{
  assert.equal(formatMonthText(''),'');
  assert.equal(formatMonthText('1'),'1');
  assert.equal(formatMonthText('1998'),'1998');
  assert.equal(formatMonthText('19980'),'1998-0');
  assert.equal(formatMonthText('199806'),'1998-06');
  assert.equal(formatMonthText(' 1998 - 06 '),'1998-06');
  assert.equal(formatMonthText('19980612'),'1998-06');
});

test('only six digits count as a finished value',()=>{
  assert.equal(monthValue('1998'),'');
  assert.equal(monthValue(''),'');
  assert.equal(monthValue('199806'),'1998-06');
  assert.equal(monthValue('1998-6'),'');
  assert.equal(monthValue('2000-01'),'2000-01');
  assert.equal(monthValue('199813'),'1998-12');
});

test('stored values display as typed input text',()=>{
  assert.equal(monthText('1998-06'),'1998-06');
  assert.equal(monthText('199806'),'1998-06');
  assert.equal(monthText(''),'');
  assert.equal(monthText(undefined),'');
  assert.equal(monthText('1998年6月'),'1998-6');
});
