import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{Conversation} from '../src/worker.mjs';
import {DatabaseSync} from 'node:sqlite';
const makeStorage=()=>{const db=new DatabaseSync(':memory:');return {sql:{exec(q,...args){const rows=db.prepare(q).all(...args);return {toArray:()=>rows};}},sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};};
const limiter={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
test('cloud diagnostic rejects unauthenticated caller without network',async()=>{
  const r=await worker.fetch(new Request('https://worker/action-check',{method:'POST'}),{WEBHOOK_SECRET:'correct'},{});assert.equal(r.status,401);
});
test('authenticated cloud diagnostic and Kakao diagnostic read both APIs and expose only success',async()=>{
  const original=globalThis.fetch;let reads=0,callback,expectedTC='L-03';
  globalThis.fetch=async(url,options)=>{
    if(String(url).startsWith('https://kapi.kakao.com')){callback=JSON.parse(options.body);return Response.json({errorCount:0});}
    reads++;assert.equal(options.method,'GET');assert.equal(options.headers['X-Aitop100-Test-Case-Id'],expectedTC);
    return new URL(url).pathname==='/api/shipments'?Response.json([]):Response.json({order_no:'100100003',status:'PAID',recipient_name:'PRIVATE'});
  };
  try{
    const env={WEBHOOK_SECRET:'correct',ACTION_TOKEN:'aitop100_fake',BOT_TOKEN:'bot',USAGE:limiter};
    const r=await worker.fetch(new Request('https://worker/action-check',{method:'POST',headers:{'X-Webhook-Secret':'correct'}}),env,{});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{authenticated:true,orderRead:true,shipmentRead:true,readOnly:true});
    const conversation=new Conversation({storage:makeStorage()},env);
    conversation.store.rememberCase('OTHER-CASE');
    await conversation.process({d:{content:'/액션연결확인',callbackToken:'callback'}},{eventId:'1'},Date.now());
    assert.equal(conversation.store.testCaseId(),'OTHER-CASE');assert.equal(reads,4);const text=callback.skillResponse.template.outputs[0].simpleText.text;
    assert.match(text,/주문·배송 조회가 모두 성공/);assert.ok(!text.includes('PRIVATE'));assert.ok(text.length<=500);
  }finally{globalThis.fetch=original;}
});

test('health does not claim malformed or empty member bindings are active',async()=>{
  for(const raw of ['malformed','{}',JSON.stringify({['a'.repeat(64)]:{testCaseId:'L-03',memberId:'MB-1',expiresAt:'2000-01-01T00:00:00Z'}})]){
    const r=await worker.fetch(new Request('https://worker/health'),{ACTION_TOKEN:'aitop100_fake',ACTION_READ_BINDINGS:raw},{});
    const state=await r.json();assert.equal(state.actionLookup,true);assert.equal(state.actionBindingsConfigured,false);
    assert.equal(state.actionMode,'conversation-tc-read-write');
  }
});
