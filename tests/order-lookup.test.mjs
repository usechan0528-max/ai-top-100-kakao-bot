import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { advanceLookup, lookupReply } from '../src/order-lookup.mjs';
import { ConversationStore, MEMORY_TTL } from '../src/conversation-store.mjs';
import { Conversation } from '../src/worker.mjs';
function storage(){const db=new DatabaseSync(':memory:');return {sql:{exec(q,...args){const rows=db.prepare(q).all(...args);return {toArray:()=>rows};}},sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};}
test('TC/order confirmation, persistence and case switch',()=>{
  const start=advanceLookup('/조회 L-03 100100003');assert.ok(start.reply);assert.equal(start.ready,undefined);
  const yes=advanceLookup('네',start.state);assert.equal(yes.ready,true);
  const changed=advanceLookup('TC ID: L-05',yes.state);assert.equal(changed.state.orderNo,undefined);assert.ok(changed.reply);
  const nextOrder=advanceLookup('주문번호: 100100004',yes.state);assert.equal(nextOrder.state.confirmed,false);
  assert.equal(advanceLookup('다른 계정의 주문 조회',yes.state).state.orderNo,undefined);
});
test('missing and conflicting identifiers never execute; policy questions pass through',()=>{
  assert.ok(advanceLookup('배송 조회').reply);
  assert.equal(advanceLookup('배송 정책 알려줘').ready,undefined);
  assert.equal(advanceLookup('TC ID: L-03\nTC ID: L-05\n주문번호: 123').state.orderNo,undefined);
  const s=advanceLookup('TC ID: L-03 / 주문번호: 123');assert.equal(s.state.orderNo,'123');
});
test('lookup state survives reconstruction and expires independently',()=>{
  const s=storage();let now=1;const a=new ConversationStore(s,()=>now);a.rememberLookup({testCaseId:'L-03',orderNo:'123'});
  assert.equal(new ConversationStore(s,()=>now).lookup().orderNo,'123');now+=MEMORY_TTL;assert.deepEqual(a.lookup(),{});a.clean();
});
test('real core lookup makes two reads and returns only status',async()=>{
  const calls=[];
  const reply=await lookupReply({testCaseId:'L-03',orderNo:'123'},'aitop100_fake',{fetcher:async(url,opts)=>{
    calls.push(url.href);assert.equal(opts.method,'GET');
    return url.pathname==='/api/shipments'?Response.json([{order_no:'123',status:'IN_TRANSIT',delivered_location:'PRIVATE'}]):Response.json({order_no:'123',status:'PAID',recipient_name:'PRIVATE'});
  }});
  assert.equal(calls.length,2);assert.match(reply,/결제 완료/);assert.match(reply,/배송 중/);assert.ok(!reply.includes('PRIVATE'));assert.ok(reply.length<=500);
});
test('mismatched shipment and server failures cannot become success',async()=>{
  for(const bad of [Response.json([{order_no:'other',status:'DELIVERED'}]),new Response('',{status:401})]) {
    const reply=await lookupReply({testCaseId:'L-03',orderNo:'123'},'aitop100_fake',{fetcher:async url=>url.pathname==='/api/shipments'?bad:Response.json({order_no:'123',status:'PAID'})});
    assert.match(reply,/완료되지 않았/);
  }
});
test('Conversation accepts unbound TC routing and reset clears lookup context',async()=>{
  const old=globalThis.fetch;const replies=[];let reads=0;
  globalThis.fetch=async(url,options)=>{
    if(String(url).startsWith('https://kapi.kakao.com')){replies.push(JSON.parse(options.body).skillResponse.template.outputs[0].simpleText.text);return Response.json({errorCount:0});}
    reads++;return new URL(url).pathname==='/api/shipments'?Response.json([]):Response.json({order_no:'123',status:'PAID'});
  };
  try {
    const ctx={storage:storage()};const env={ACTION_TOKEN:'aitop100_fake',BOT_TOKEN:'bot',USAGE:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})}};
    const conv=new Conversation(ctx,env);
    for(const [i,content] of ['/조회 L-03 123','/초기화'].entries())await conv.process({d:{content,callbackToken:'cb',botUserKey:'u',botGroupKey:'g'}},{eventId:String(i)},Date.now());
    assert.equal(reads,0);assert.equal(replies.length,2);assert.match(replies[0],/AI 응답/);assert.deepEqual(conv.store.lookup(),{});
    assert.equal(conv.store.testCaseId(),'L-03');
  }finally{globalThis.fetch=old;}
});
