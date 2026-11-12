import {test} from 'node:test';
import assert from 'node:assert/strict';
import clientAddress from '../request-client.cjs';
const req=(remoteAddress,forwarded)=>({socket:{remoteAddress},headers:{'x-real-ip':forwarded}});
test('only an explicitly trusted local proxy can supply a client address',()=>{
  assert.equal(clientAddress(req('127.0.0.1','198.51.100.10'),''),'127.0.0.1');
  assert.equal(clientAddress(req('198.51.100.20','198.51.100.10'),'loopback'),'198.51.100.20');
  for(const loopback of ['127.0.0.1','::1','::ffff:127.0.0.1']) {
    assert.equal(clientAddress(req(loopback,'198.51.100.10'),'loopback'),'198.51.100.10');
    assert.equal(clientAddress(req(loopback,'2001:db8::1'),'loopback'),'2001:db8::1');
    for(const invalid of [undefined,'unknown','198.51.100.1, 198.51.100.2',['198.51.100.1']])
      assert.equal(clientAddress(req(loopback,invalid),'loopback'),loopback);
  }
});
