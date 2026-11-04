import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ConversationStore} from '../src/conversation-store.mjs';
import {runAgent} from '../src/agent.mjs';
import {createCustomerRequestActions} from '../src/customer-request-actions.mjs';
import {createRequestActions} from '../src/request-actions.mjs';

const when='2037-06-30T12:00:00+09:00';
const order={order_no:'ORDER-TEST',status:'PAID',amount:12000,payment_refs:['PAY-TEST']};
const payment={approval_no:'PAY-TEST',order_no:order.order_no,status:'APPROVED',amount:12000,pay_method:'BANK_TRANSFER'};
const cases=[
  ['API24','request_address_change',{order_no:order.order_no,new_address:'합성 검증 주소 101호',address_confirmed:true,
    pre_pickup_basis:'정상 빈 배송 목록과 공개 사례',ownership_confirmed:true,target_confirmed:true,policy_basis:'고객 요청과 정책 확인'},
    {request_id:'REQ-24',order_no:order.order_no,request_status:'SUBMITTED',requested_at:when}],
  ['API32','request_cash_receipt',{order_no:order.order_no,approval_no:payment.approval_no,receipt_number:'01012345678',
    receipt_purpose:'income_deduction',eligibility_confirmed:true,deadline_confirmed:true,ownership_confirmed:true,
    target_confirmed:true,policy_basis:'고객 요청과 정책 확인'},
    {request_id:'REQ-32',approval_no:payment.approval_no,request_status:'SUBMITTED',requested_at:when}],
  ['API29','request_refund',{order_no:order.order_no,amount:12000,reason:'합성 검증 미배송 환불',ownership_confirmed:true,policy_basis:'고객 요청과 정책 확인'},
    {refund_id:'REF-29',order_no:order.order_no,request_status:'SUBMITTED',requested_at:when}],
  ['API35','request_escalation',{lane:'LANE2_HANDOFF',reason:'합성 검증 담당 확인',policy_basis:'고객 요청과 정책 확인'},
    {escalation_id:'ESC-35',request_status:'SUBMITTED',requested_at:when}],
];
function harness(name,receipt) {
  const db=new DatabaseSync(':memory:');
  const storage={sql:{exec(q,...args){const rows=db.prepare(q).all(...args);return {toArray:()=>rows};}},sync:async()=>{}};
  const posts=[];
  const config={token:'synthetic-token',testCaseId:'L-03',getOrder:()=>order,getPayment:()=>payment,
    getShipments:()=>({status:'empty',shipments:[]}),fetcher:async(url,init)=>{
      assert.equal(init.method,'POST');posts.push({url,body:JSON.parse(init.body)});return Response.json(receipt);
    }};
  const action=({...createCustomerRequestActions(config),...createRequestActions(config)})[name];
  return {actions:{[name]:action},posts,journal:()=>new ConversationStore(storage).journal()};
}

for(const [api,name,args,receipt] of cases) {
  const revised={...args,policy_basis:'동일 고객 요청 및 적용 정책을 다시 검토함',
    ...(api==='API24'?{pre_pickup_basis:'같은 정상 빈 배송 결과를 재확인'}:{})};
  test(`${api} same official payload with different review wording is sent once in one run`,async()=>{
    const h=harness(name,receipt);
    const decisions=[{type:'action',name,arguments:args},{type:'action',name,arguments:revised},{type:'answer',text:'요청 접수 상태를 확인했습니다.'}];
    await runAgent({text:'합성 요청',actions:h.actions,model:async()=>decisions.shift(),maxSteps:3});
    assert.equal(h.posts.length,1,'internal review wording must not create another official submission');
    assert.ok(!Object.hasOwn(h.posts[0].body,'policy_basis'));
  });
  test(`${api} same official payload stays deduplicated after journal reconstruction`,async()=>{
    const h=harness(name,receipt);
    for(const arguments_ of [args,revised]) {
      const decisions=[{type:'action',name,arguments:arguments_},{type:'answer',text:'요청 접수 상태를 확인했습니다.'}];
      await runAgent({text:'합성 요청',actions:h.actions,writeJournal:h.journal(),model:async()=>decisions.shift(),maxSteps:2});
    }
    assert.equal(h.posts.length,1,'persistent dedupe must ignore non-HTTP policy/review fields');
  });
}
