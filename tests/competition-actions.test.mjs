import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompetitionClient, createCompetitionActions, ACTION_ORIGIN } from '../src/competition-actions.mjs';
import { runAgent } from '../src/agent.mjs';
import { sendCallback } from '../src/worker.mjs';
const token = 'aitop100_unit_test_token';
test('official origin, headers, GET and redirect protection', async () => {
  const client = createCompetitionClient({token,testCaseId:'L-03',fetcher:async (url, options) => {
    assert.equal(url.origin,ACTION_ORIGIN); assert.equal(url.pathname,'/api/orders/100100003');
    assert.equal(options.method,'GET'); assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Authorization,`Bearer ${token}`);
    assert.equal(options.headers['X-Aitop100-Test-Case-Id'],'L-03');
    assert.equal(options.body,undefined); return Response.json({order_no:'100100003',status:'PAID'});
  }});
  assert.equal((await client.getOrder('100100003')).status,'PAID');
});
test('invalid TC/token/order rejected before network', async () => {
  let calls=0; const fetcher=async()=>{calls++;};
  for (const testCaseId of ['',undefined,'L-03\r\nX: evil','a'.repeat(101)]) assert.throws(()=>createCompetitionClient({token,testCaseId,fetcher}));
  assert.throws(()=>createCompetitionClient({token:'Bearer secret',testCaseId:'L-03',fetcher}));
  const client=createCompetitionClient({token,testCaseId:'L-03',fetcher});
  for (const id of ['../reset','https://evil.test','a?b=1','']) await assert.rejects(client.getOrder(id));
  assert.equal(calls,0);
});
test('HTTP failures never retry or disclose body',async()=>{
  for(const status of [301,400,401,404,429,500,503]) {
    let calls=0;
    const client=createCompetitionClient({token,testCaseId:'L-03',fetcher:async()=>{calls++;return new Response(token,{status,headers:{'Retry-After':'10'}});}});
    await assert.rejects(client.getOrder('1'),e=>e.status===status && !JSON.stringify(e).includes(token) && e.retryAfterSeconds===10);
    assert.equal(calls,1);
  }
});
test('unexpected order and non-JSON response fail closed',async()=>{
  for(const response of [Response.json({order_no:'other',status:'PAID'}),new Response('bad json')]) {
    const client=createCompetitionClient({token,testCaseId:'L-03',fetcher:async()=>response});
    await assert.rejects(client.getOrder('1'),/INVALID_ACTION_RESPONSE/);
  }
});
test('shipments query permits empty array',async()=>{
  const client=createCompetitionClient({token,testCaseId:'L-03',fetcher:async url=>{assert.equal(url.search,'?order_no=123');return Response.json([]);}});
  assert.deepEqual(await client.getShipments('123'),[]);
});
test('core blocks wrong TC and unconfirmed order; removes address fields',async()=>{
  let calls=0;
  const actions=createCompetitionActions({token,testCaseId:'L-03',confirmedOrderNo:'123',fetcher:async()=>{calls++;return Response.json({order_no:'123',status:'PAID',recipient_name:'PRIVATE',shipping_address:'PRIVATE'});}});
  for(const context of [{testCaseId:'L-05',confirmedOrderNo:'123'},{testCaseId:'L-03',confirmedOrderNo:'456'}]) {
    const result=await runAgent({text:'조회',actions,context,model:async({history})=>history.length?{type:'answer',text:history[0].error}:{type:'action',name:'getConfirmedOrder',arguments:{}}});
    assert.equal(result.text,'FORBIDDEN');
  }
  assert.equal(calls,0);
  await runAgent({text:'조회',actions,context:{testCaseId:'L-03',confirmedOrderNo:'123'},model:async({history})=>{
    if(!history.length)return {type:'action',name:'getConfirmedOrder',arguments:{}};
    assert.ok(!JSON.stringify(history).includes('PRIVATE'));return {type:'answer',text:'확인'};
  }});
  assert.equal(calls,1);
});
test('callback redacts action token and obeys 500 character limit',async()=>{
  await sendCallback('callback',token+'가'.repeat(600),{ACTION_TOKEN:token,BOT_TOKEN:'bot'},async(_url,options)=>{
    const text=JSON.parse(options.body).skillResponse.template.outputs[0].simpleText.text;
    assert.ok(!text.includes(token));assert.ok(text.length<=500);return Response.json({errorCount:0});
  });
});
