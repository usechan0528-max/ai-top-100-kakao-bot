import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ConversationStore} from '../src/conversation-store.mjs';
import {createScopedActions} from '../src/action-context.mjs';
import {createOpenAIModel} from '../src/openai-model.mjs';
const row={member_id:'MB-TEST01',name:'검증사용자',phone:'010-1234-5678',birth_year:1987,member_type:'INDIVIDUAL',grade:'MEMBER',status:'ACTIVE',address:null,joined_at:'2037-03-02',referred_by_member_id:null};
function setup(){
  const db=new DatabaseSync(':memory:');
  const store=new ConversationStore({sql:{exec(q,...a){const rows=db.prepare(q).all(...a);return {toArray:()=>rows};}},sync:async()=>{}});
  let calls=0;
  const make=(text,rows=[row])=>createScopedActions({env:{ACTION_TOKEN:'synthetic-token',USAGE:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})}},scope:'a'.repeat(64),store,text,
    fetcher:async(url,init)=>{calls++;assert.equal(init.method,'GET');assert.equal(init.headers['X-Aitop100-Test-Case-Id'],store.testCaseId());return Response.json(rows);}});
  return {store,make,calls:()=>calls};
}
const args={account_name:'검증사용자',phone:'01012345678'};
const message='TC: L-40\n이름 검증사용자, 연락처 010-1234-5678';
test('model summary excludes contiguous, formatted and international phone before SQL memory',async()=>{
  for(const phone of ['01012345678','010-1234-5678','010 1234 5678','+82 10 1234 5678','+821012345678']) {
    const model=createOpenAIModel({apiKey:'synthetic',fetcher:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'확인했습니다.',summary:`연락처${phone}로회원확인. 다음은 주문 조회.`})}]}]})});
    await model({system:'test',user:'회원정보를 조회해 주세요.',tools:[],history:[]});
    const h=setup();h.store.remember(model.summary());
    assert.ok(!h.store.summary().includes(phone));assert.ok(h.store.summary().includes('[전화번호 삭제]'));
  }
});
test('conversation member match returns no PII, persists only member and TC, and forbids another member orders',async()=>{
  const h=setup(),s=await h.make(message);
  assert.deepEqual(await s.actions.resolve_member.execute(args),{status:'matched',member_id:'MB-TEST01',basis:'customer_name_and_full_phone_match',independentLoginAuthentication:false});
  assert.deepEqual(h.store.lookup(),{resolvedMemberId:'MB-TEST01',testCaseId:'L-40'});
  const followup=await h.make('이어서 제 주문을 조회해주세요.');
  assert.equal((await followup.actions.member_lookup_status.execute({})).member_id,'MB-TEST01');
  assert.equal((await s.actions.list_my_orders.execute({member_id:'MB-OTHER'})).status,'forbidden');
  assert.equal(h.calls(),1);
  const changed=await h.make('TC: L-03');assert.deepEqual(h.store.lookup(),{});
  assert.equal((await changed.actions.member_lookup_status.execute({})).status,'unresolved');
});
test('model invented contact/name and masked contact cannot cause HTTP',async()=>{
  const h=setup(),s=await h.make('TC: L-40\n검증사용자 010-****-5678');
  assert.equal((await s.actions.resolve_member.execute(args)).status,'needs_customer_input');
  assert.equal((await s.actions.resolve_member.execute({...args,phone:'010-****-5678'})).status,'invalid_request');
  assert.equal(h.calls(),0);
});
test('same TC verification stops after three attempts and does not retain old match on failure',async()=>{
  const h=setup();let s=await h.make(message);
  await s.actions.resolve_member.execute(args);
  s=await h.make(message,[]);
  assert.equal((await s.actions.resolve_member.execute(args)).status,'no_match');assert.deepEqual(h.store.lookup(),{});
  await s.actions.resolve_member.execute(args);
  assert.equal((await s.actions.resolve_member.execute(args)).status,'verification_limit');assert.equal(h.calls(),3);
});
test('refund cannot reuse a foreign order cached before a successful member match',async()=>{
  const h=setup(),record={order_no:'100100003',member_id:'MB-OTHER',status:'PAID',status_changed_at:null,ordered_at:'2037-06-24T10:00:00+09:00',amount:12000,recipient_name:'test',shipping_address:'test',inflow_tag:null,ship_scheduled_at:'2037-06-25',failure_code:null,payment_refs:[],refund_ids:[],change_request_ids:[],items:[{sku:'WTM-01',name:'수박',qty:1,unit_price:12000}]};
  const scoped=await h.make(message,record);
  assert.equal((await scoped.actions.read_order.execute({order_no:record.order_no})).status,'ok');
  const matched=await h.make(message,[row]);await matched.actions.resolve_member.execute(args);
  const request={order_no:record.order_no,amount:12000,reason:'고객 환불 요청',policy_basis:'테스트 정책 대조 근거',ownership_confirmed:true};
  assert.equal(scoped.actions.request_refund.authorize(request),false);
  assert.equal(h.calls(),2,'only two GET calls; no live writes');
});
