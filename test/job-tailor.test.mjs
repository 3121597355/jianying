import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateJobVersion} from '../job-tailor.mjs';
import {createDefault} from '../assets/js/resume-defaults.js';

test('provider failures explain the cause without exposing provider details or retrying',async t=>{
  const logs=[];
  t.mock.method(console,'warn',(...args)=>logs.push(args));
  const cases=[
    [400,{error:{message:'The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed deepseek.'}},'模型名称配置有误','model'],
    [404,{error:{code:'model_not_found'}},'模型名称配置有误','model'],
    [401,{error:{message:'Invalid API key'}},'密钥无效','credentials'],
    [402,{error:{message:'Insufficient balance'}},'额度不足','balance'],
    [429,{error:{code:'insufficient_quota'}},'额度不足','balance'],
    [429,{error:{message:'Too many requests'}},'请求过于频繁','rate_limit'],
    [400,{error:{message:'Unsupported response_format'}},'请求参数不兼容','request_config'],
    [503,null,'暂时不可用','unavailable'],
  ];
  for(const [status,body,message,reason] of cases) {
    let calls=0;
    const sensitive='sk-provider-secret PRIVATE_RESUME PRIVATE_JD';
    const responseBody=body?JSON.stringify({...body,debug:sensitive}):sensitive;
    await assert.rejects(generateJobVersion({resume:createDefault(),jd:'合成测试岗位',jobTitle:'合成测试',config:{enabled:true,baseUrl:'https://provider.example/v1',model:'example',apiKey:'qa-key'},fetchImpl:async()=>{calls++;return new Response(responseBody,{status});}}),error=>{
      assert.equal(error.status,502);
      assert(error.message.includes(message));
      assert(error.message.includes('本次不扣免费次数'));
      assert(!error.message.includes(sensitive));
      return true;
    });
    assert.equal(calls,1);
    assert.deepEqual(logs.at(-1),['[resume-ai]',JSON.stringify({status,reason})]);
  }
  assert(!JSON.stringify(logs).includes('sk-provider-secret'));
});
