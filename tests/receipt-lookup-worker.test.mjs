import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Conversation} from '../src/worker.mjs';
import {ConversationStore} from '../src/conversation-store.mjs';
import {createScopedActions,extractTestCaseId} from '../src/action-context.mjs';
const storage=()=>{const db=new DatabaseSync(':memory:');return {sql:{exec(q,...a){const rows=db.prepare(q).all(...a);return {toArray:()=>rows};}},sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};};
const order={order_no:'100100016',member_id:'MB-77003',status:'PAID',status_changed_at:null,ordered_at:'2037-06-24T10:00:00+09:00',amount:34900,
  recipient_name:'PRIVATE',shipping_address:'PRIVATE',inflow_tag:null,ship_scheduled_at:null,failure_code:null,payment_refs:[],refund_ids:['RFD-TEST'],change_request_ids:[],items:[]};
const refund={order_no:order.order_no,refund_id:'RFD-TEST',amount:34900,request_status:'SUBMITTED',requested_at:order.ordered_at};
const escalation={escalation_id:'ESC-TEST',lane:'LANE2_HANDOFF',request_status:'SUBMITTED',status:'PENDING',requested_at:order.ordered_at,
  reason:'주문 100100016 곰팡이 복수 신고 안전 확인. 원인과 책임 미확정. PRIVATE_NAME'};
const text='/접수조회 L-11 주문 100100016 이관 ESC-TEST 기존 신청만 확인';
test('receipt command selects TC and exposes only the required read tools',async()=>{
  assert.equal(extractTestCaseId(text),'L-11');
  const s=await createScopedActions({env:{ACTION_TOKEN:'synthetic'},scope:'a'.repeat(64),store:new ConversationStore(storage()),text});
  assert.equal(s.readOnlyReceiptLookup,true);
  assert.ok(Object.values(s.actions).every(a=>a.kind==='read'));
  assert.deepEqual(Object.keys(s.actions).sort(),['business_calendar','member_lookup_status','read_escalation_request','read_order','read_refund_requests','resolve_member'].sort());
  assert.equal(s.actions.request_refund,undefined);assert.equal(s.actions.read_product,undefined);
});
for(const symptomatic of [false,true])for(const failFinal of [false,true])test(`receipt-only Worker preserves both verified receipts with POST0, model failure=${failFinal}, symptoms=${symptomatic}`,async()=>{
  const original=globalThis.fetch;let modelCalls=0,posts=0,reply;const logs=[],oldLog=console.log;
  const decisions=[['read_order',{order_no:order.order_no}],['read_refund_requests',{order_no:order.order_no}],['read_escalation_request',{order_no:order.order_no,escalation_id:escalation.escalation_id}]];
  console.log=value=>logs.push(JSON.parse(value));
  globalThis.fetch=async(url,init)=>{
    const u=new URL(url);
    if(u.hostname==='api.openai.com') {
      const payload=JSON.parse(init.body);assert.ok(payload.tools.every(t=>!t.name.startsWith('request_')));assert.equal(payload.tools.length,6);modelCalls++;
      const d=decisions.shift();if(!d&&failFinal)return new Response(null,{status:503});
      return Response.json({status:'completed',output:d?[{type:'function_call',name:d[0],call_id:'c'+modelCalls,arguments:JSON.stringify(d[1])}]:
        [{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'환불 지급과 이관 승인이 완료되었습니다. PRIVATE_NAME',summary:''})}]}]});
    }
    if(u.hostname==='gyodong-mall-action.aitop100.org') {
      if(init.method!=='GET'){posts++;assert.fail('business mutations are forbidden');}
      assert.equal(init.headers['X-Aitop100-Test-Case-Id'],'L-11');
      if(u.pathname==='/api/orders/'+order.order_no)return Response.json(order);
      if(u.pathname==='/api/refunds')return Response.json([refund]);
      if(u.pathname==='/api/escalations/'+escalation.escalation_id)return Response.json(escalation);
      assert.fail('unexpected business read');
    }
    reply=JSON.parse(init.body).skillResponse.template.outputs[0].simpleText.text;return Response.json({errorCount:0});
  };
  try {
    const conv=new Conversation({storage:storage()},{ACTION_TOKEN:'synthetic',OPENAI_API_KEY:'fake',BOT_TOKEN:'bot',USAGE:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})}});
    await conv.process({d:{content:text+(symptomatic?'\n먹었고 복통이 있어요':''),botUserKey:'u',botGroupKey:'g',callbackToken:'cb'}},{scope:'a'.repeat(64),eventId:'event'},Date.now());
    assert.equal(posts,0);assert.equal(modelCalls,4);
    for(const word of ['재접수 없이','RFD-TEST','ESC-TEST','34,900','검토 대기','섭취','3영업일'])assert.ok(reply.includes(word),word);
    assert.ok(!reply.includes('PRIVATE'));assert.ok(!reply.includes('완료되었습니다'));assert.ok(reply.length<=500);
    assert.ok(!reply.includes('알려 주세요'));
    if(symptomatic){assert.ok(!reply.includes('폐기'));assert.match(reply,/진료/);assert.match(reply,/원물과 사진을 보관/);}
    assert.ok(logs.some(log=>log.readOnlyReceipts===true&&log.writeAttempts===0));
    assert.ok(!JSON.stringify(logs).includes(order.order_no));
  }finally{globalThis.fetch=original;console.log=oldLog;}
});
