import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceiptReadActions} from '../src/read-request-receipts.mjs';
const refund={order_no:'100100016',refund_id:'RFD-100100016-01',amount:34900,request_status:'SUBMITTED',requested_at:'2037-06-30T12:00:00+09:00',reason:'PRIVATE_REASON'};
const escalation={escalation_id:'ESC-18462',lane:'LANE2_HANDOFF',request_status:'SUBMITTED',status:'PENDING',requested_at:refund.requested_at,reason:'주문 100100016 곰팡이 확인 요청. 원인과 책임 미확정. PRIVATE_PHONE'};
const config={token:'aitop100_test',testCaseId:'L-11',getOrder:id=>({order_no:id,member_id:'MB-3'}),canUseOrder:o=>o.member_id==='MB-3'};
test('receipt queries only GET fixed TC and return minimal verified fields',async()=>{
  const calls=[];const actions=createReceiptReadActions({...config,fetcher:async(url,init)=>{
    calls.push(url);assert.equal(init.method,'GET');assert.equal(init.headers['X-Aitop100-Test-Case-Id'],'L-11');
    return Response.json(url.includes('/refunds')?[refund]:escalation);
  }});
  const r=await actions.read_refund_requests.execute({order_no:refund.order_no},{});
  assert.equal(r.refunds[0].receipt_id,refund.refund_id);assert.ok(!JSON.stringify(r).includes('PRIVATE'));
  const e=await actions.read_escalation_request.execute({order_no:refund.order_no,escalation_id:escalation.escalation_id},{});
  assert.equal(e.review_status,'PENDING');assert.equal(e.safety.mold,true);assert.equal(e.safety.symptoms,false);assert.ok(!JSON.stringify(e).includes('PRIVATE'));
  assert.equal(calls.length,2);assert.ok(Object.values(actions).every(a=>a.kind==='read'));
});
test('no prior order or revoked ownership cannot query receipts',async()=>{
  for(const extra of [{getOrder:()=>null},{canUseOrder:()=>false}]) {
    const a=createReceiptReadActions({...config,...extra,fetcher:()=>assert.fail('network forbidden')});
    assert.equal(a.read_refund_requests.authorize({order_no:refund.order_no}),false);
    assert.equal((await a.read_refund_requests.execute({order_no:refund.order_no},{})).status,'forbidden');
  }
});
test('malformed or mixed target refund results never leak',async()=>{
  for(const value of [[{...refund,order_no:'other'}],[{...refund,amount:1.5}],[{...refund,request_status:'DONE'}],{}]){
    const a=createReceiptReadActions({...config,fetcher:async()=>Response.json(value)});
    assert.equal((await a.read_refund_requests.execute({order_no:refund.order_no},{})).status,'invalid_response');
  }
});
test('escalation must match id and exact order token in reason',async()=>{
  for(const value of [{...escalation,reason:'주문 1001000169'}, {...escalation,reason:'다른 주문'}, {...escalation,escalation_id:'other'}]){
    const a=createReceiptReadActions({...config,fetcher:async()=>Response.json(value)});
    const r=await a.read_escalation_request.execute({order_no:refund.order_no,escalation_id:escalation.escalation_id},{});
    assert.ok(['forbidden','invalid_response'].includes(r.status));assert.equal(r.receipt_id,undefined);
  }
});
test('errors and global reservation refusal do not retry or claim empty success',async()=>{
  let calls=0;
  const a=createReceiptReadActions({...config,fetcher:async()=>{calls++;return new Response(null,{status:404});}});
  assert.equal((await a.read_refund_requests.execute({order_no:refund.order_no},{})).status,'not_found_or_route_error');assert.equal(calls,1);
  const b=createReceiptReadActions({...config,beforeCall:()=>{throw new Error('limited');},fetcher:()=>assert.fail('network forbidden')});
  assert.equal((await b.read_refund_requests.execute({order_no:refund.order_no},{})).status,'unavailable');
});
test('aborted or oversized reads cannot return receipt metadata',async()=>{
  const a=createReceiptReadActions({...config,fetcher:async()=>Response.json('x'.repeat(70000))});
  assert.equal((await a.read_refund_requests.execute({order_no:refund.order_no},{})).status,'invalid_response');
  const controller=new AbortController();controller.abort();await assert.rejects(a.read_refund_requests.execute({order_no:refund.order_no},{signal:controller.signal}));
});
