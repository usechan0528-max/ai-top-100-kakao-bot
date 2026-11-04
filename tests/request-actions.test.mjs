import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestActions} from '../src/request-actions.mjs';
import {createScopedActions} from '../src/action-context.mjs';
import {ConversationStore} from '../src/conversation-store.mjs';
import {DatabaseSync} from 'node:sqlite';
import {runAgent} from '../src/agent.mjs';
import {Conversation} from '../src/worker.mjs';
const token='aitop100_synthetic';
const args={order_no:'100100003',amount:12000,reason:'확인된 미배송 환불 요청',policy_basis:'고객 요청과 주문 대조, 미배송 환불 규정 및 전액 확인',ownership_confirmed:true};
const escalation={lane:'운영자',reason:'부분 환급 산식 확인 요청',policy_basis:'금액 미확정으로 직접 환불 대신 운영자 확인 신청'};
const receipt={refund_id:'RF-1',order_no:'100100003',request_status:'SUBMITTED',requested_at:'2037-06-30T13:00:00+09:00'};
const make=(extra={})=>createRequestActions({token,testCaseId:'L-03',getOrder:()=>({amount:12000}),...extra});
const storage=()=>{const db=new DatabaseSync(':memory:');return {sql:{exec(q,...a){const rows=db.prepare(q).all(...a);return {toArray:()=>rows};}},sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};};

test('member verification has persistent three-attempt case ceiling across time and reset',()=>{
  const s=storage();let now=1;const store=new ConversationStore(s,()=>now);
  for(let n=0;n<3;n++) assert.equal(store.allowMemberVerification('L-03'),true);
  now+=86400000;store.clean();store.clearMemberSession();
  assert.equal(new ConversationStore(s,()=>now).allowMemberVerification('L-03'),false);
  assert.equal(store.allowMemberVerification('L-05'),true);
});

test('TC alone creates five reads and two writes without pre-registration; no reset',async()=>{
  const store=new ConversationStore(storage());
  const scoped=await createScopedActions({env:{ACTION_TOKEN:token},store,text:'TC ID: L-03',scope:'a'.repeat(64)});
  for(const name of ['read_order','list_my_orders','read_payment','list_order_payments','list_order_shipments']) assert.equal(scoped.actions[name].kind,'read');
  for(const name of ['request_refund','request_escalation']) assert.equal(scoped.actions[name].kind,'write');
  assert.ok(!Object.keys(scoped.actions).some(name=>/reset/i.test(name)));
  assert.equal(scoped.actions.request_refund.authorize(args),false,'refund must first read the order');
});

test('refund sends only official body fields with fixed TC and returns submitted receipt',async()=>{
  let calls=0;
  const actions=make({fetcher:async(url,init)=>{
    calls++;assert.equal(url,'https://gyodong-mall-action.aitop100.org/api/refunds');assert.equal(init.method,'POST');
    assert.equal(init.headers.Authorization,`Bearer ${token}`);assert.equal(init.headers['X-Aitop100-Test-Case-Id'],'L-03');
    assert.deepEqual(JSON.parse(init.body),{order_no:args.order_no,amount:args.amount,reason:args.reason});
    return Response.json(receipt);
  }});
  assert.equal(actions.request_refund.authorize(args),true);
  const result=await actions.request_refund.execute(args,{});
  assert.equal(result.status,'SUBMITTED');assert.match(result.notice,/신청 접수/);assert.equal(calls,1);
});

test('refund rejects missing policy, ownership, unread order and excessive or invalid amounts',()=>{
  const action=make().request_refund;
  for(const changed of [{policy_basis:''},{ownership_confirmed:false},{amount:0},{amount:-1},{amount:1.5},{amount:2147483648},{extra:'x'}])
    assert.equal(action.authorize({...args,...changed}),false);
  assert.equal(action.authorize({...args,amount:12001}),false);
  assert.equal(make({getOrder:()=>null}).request_refund.authorize(args),false);
});

test('escalation posts lane/reason only and does not claim resolution',async()=>{
  const action=make({fetcher:async(url,init)=>{
    assert.ok(url.endsWith('/api/escalations'));assert.deepEqual(JSON.parse(init.body),{lane:escalation.lane,reason:escalation.reason});
    return Response.json({escalation_id:'ES-1',request_status:'SUBMITTED',requested_at:receipt.requested_at});
  }}).request_escalation;
  assert.equal((await action.execute(escalation,{})).status,'SUBMITTED');
});

test('ambiguous writes never retry and cause core unknown outcome',async()=>{
  for(const response of [()=>new Response(null,{status:503}),()=>Response.json({...receipt,order_no:'wrong'}),()=>Response.json({...receipt,request_status:'DONE'}),()=>{throw new Error('network');}]) {
    let calls=0;
    const actions=make({fetcher:async()=>{calls++;return response();}});
    const result=await runAgent({text:'환불 신청',actions,model:async({history})=>history.length?{type:'answer',text:'환불 완료'}:{type:'action',name:'request_refund',arguments:args}});
    assert.equal(calls,1);assert.equal(result.outcomeUnknown,true);assert.notEqual(result.text,'환불 완료');
  }
});

test('explicit TC rejection and preflight failure are known not-executed',async()=>{
  for(const extra of [{fetcher:async()=>Response.json({code:'INVALID_TEST_CASE_ID'},{status:400})},
    {beforeCall:async()=>{throw new Error('limited');},fetcher:async()=>assert.fail('must not post')}]) {
    const action=make(extra).request_refund;
    await assert.rejects(action.execute(args,{}),e=>e.code==='ACTION_NOT_EXECUTED');
  }
});

test('persistent journal blocks duplicate refund across runs',async()=>{
  let calls=0;const store=new ConversationStore(storage());
  const actions=make({fetcher:async()=>{calls++;return Response.json(receipt);}});
  for(let n=0;n<2;n++) await runAgent({text:'환불 신청',actions,writeJournal:store.journal(),model:async({history})=>history.length?{type:'answer',text:'신청 접수 확인'}:{type:'action',name:'request_refund',arguments:args}});
  assert.equal(calls,1);
});

test('Worker with no bindings performs TC read then refund and forces application receipt wording',async()=>{
  const original=globalThis.fetch;let modelCalls=0,posts=0,reply;
  const order={order_no:args.order_no,member_id:'MB-1',status:'PAID',status_changed_at:null,ordered_at:'2037-06-24T10:00:00+09:00',amount:12000,
    recipient_name:'PRIVATE',shipping_address:'PRIVATE',inflow_tag:null,ship_scheduled_at:null,failure_code:null,payment_refs:[],refund_ids:[],change_request_ids:[],items:[]};
  globalThis.fetch=async(url,init)=>{
    if(String(url).startsWith('https://api.openai.com/')) {
      const body=JSON.parse(init.body);assert.ok(body.tools.some(t=>t.name==='request_refund'));
      modelCalls++;
      if(modelCalls<3)return Response.json({status:'completed',output:[{type:'function_call',name:modelCalls===1?'read_order':'request_refund',call_id:'c'+modelCalls,arguments:JSON.stringify(modelCalls===1?{order_no:args.order_no}:args)}]});
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'환불 완료했습니다.',summary:'신청 접수'})}]}]});
    }
    if(String(url).includes('gyodong-mall-action')) {
      assert.equal(init.headers['X-Aitop100-Test-Case-Id'],'L-03');
      if(init.method==='POST'){posts++;return Response.json(receipt);}return Response.json(order);
    }
    reply=JSON.parse(init.body).skillResponse.template.outputs[0].simpleText.text;return Response.json({errorCount:0});
  };
  try {
    const env={ACTION_TOKEN:token,OPENAI_API_KEY:'fake-key',BOT_TOKEN:'bot',USAGE:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})}};
    const conv=new Conversation({storage:storage()},env);
    await conv.process({d:{content:'TC ID: L-03\n내 주문 100100003 환불 신청',botUserKey:'u',botGroupKey:'g',callbackToken:'callback'}},{scope:'a'.repeat(64),eventId:'p0'},Date.now());
    assert.equal(modelCalls,3);assert.equal(posts,1);assert.match(reply,/신청이 접수/);assert.ok(!reply.includes('환불 완료했습니다'));assert.ok(reply.length<=500);
  } finally {globalThis.fetch=original;}
});
