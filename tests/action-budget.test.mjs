import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveActionRead} from '../src/action-budget.mjs';
import {checkActionConnection} from '../src/action-diagnostic.mjs';
test('all reservations target same global object and abort before network',async()=>{
  let count=0;
  const env={USAGE:{idFromName:name=>{assert.equal(name,'action-usage');return name;},get:()=>({fetch:async(url)=>{count++;assert.equal(url,'https://internal/action');return new Response(null,{status:204});}})}};
  await reserveActionRead(env);await reserveActionRead(env);assert.equal(count,2);
  const controller=new AbortController();controller.abort();await assert.rejects(reserveActionRead(env,controller.signal));assert.equal(count,2);
});
test('limiter rejection or missing binding fails closed',async()=>{
  await assert.rejects(reserveActionRead({}));
  await assert.rejects(reserveActionRead({USAGE:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:429})})}}),/ACTION_RATE_LIMIT/);
});
test('diagnostic reserves each HTTP including second read and stops when rejected',async()=>{
  let reads=0,reserves=0;
  await assert.rejects(checkActionConnection('aitop100_fake',async()=>{reads++;return Response.json({order_no:'100100003',status:'PAID'});},async()=>{if(++reserves===2)throw new Error('limited');}));
  assert.equal(reserves,2);assert.equal(reads,1);
});
