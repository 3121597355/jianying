import {test} from 'node:test';
import assert from 'node:assert/strict';

const {STANDARD_TEMPLATES: templates}=await import('../assets/js/tpl-standard.js');
const resume = basicInfo => ({setData:{title:'测试简历'}, basicInfo:{name:'测试姓名',workYears:-1,...basicInfo},moduleData:[]});

for (const {id, render} of templates) {
  test(`${id}: unfilled optional details disappear for current and legacy drafts`, () => {
    for (const value of [0, '0', '', null, undefined, '不填']) {
      const html = render(resume({sex:value,hunyin:value,zhengzhi:value}));
      assert.doesNotMatch(html, /不填|政治面貌|婚姻状况|性别|undefined/, `stored value ${String(value)}`);
    }
  });
  test(`${id}: valid numeric and legacy text choices still appear`, () => {
    for (const basic of [
      {sex:2,hunyin:2,zhengzhi:5},
      {sex:'2',hunyin:'2',zhengzhi:'5'},
      {sex:'女',hunyin:'未婚',zhengzhi:'群众'},
    ]) {
      const html = render(resume(basic));
      for (const label of ['女','未婚','群众']) assert.ok(html.includes(label), `missing ${label}`);
    }
    assert.ok(render(resume({zhengzhi:1})).includes('中共党员'));
  });
}
