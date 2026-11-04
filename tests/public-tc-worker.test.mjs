import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Conversation} from '../src/worker.mjs';
import {MAX_MODEL_REQUEST_CHARS} from '../src/openai-model.mjs';

const storage=()=>{const db=new DatabaseSync(':memory:');return {sql:{exec(q,...a){const rows=db.prepare(q).all(...a);return {toArray:()=>rows};},},sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};};
for(const [tc,failFinal] of [['L-03',false],['L-05',false],['L-05',true]])test(`${tc} Worker preserves verified request type/id, final model failure=${failFinal} (mock endpoints)`,async()=>{
  const original=globalThis.fetch;let modelCalls=0,posts=0,reply;
  const order={order_no:'100100003',member_id:'MB-77001',status:'PAID',status_changed_at:null,ordered_at:'2037-06-24T10:00:00+09:00',amount:34900,
    recipient_name:'PRIVATE',shipping_address:'PRIVATE',inflow_tag:null,ship_scheduled_at:null,failure_code:null,payment_refs:['PAY-3706-0003'],refund_ids:[],change_request_ids:[],items:[]};
  const payment={approval_no:'PAY-3706-0003',order_no:order.order_no,pay_method:'BANK_TRANSFER',amount:34900,paid_at:order.ordered_at,status:'APPROVED',payer_name:null,cancellation_request_ids:[],card_last4:null};
  const address={order_no:order.order_no,new_address:'경기 성남시 테스트로1 101동102호',address_confirmed:true,pre_pickup_basis:'정상 빈 목록은 해당 사례 집하 전',ownership_confirmed:true,target_confirmed:true,policy_basis:'고객 대상/상세주소 확인, 집하 전 변경 가능'};
  const cash={order_no:order.order_no,approval_no:payment.approval_no,receipt_number:'019-2314-9701',receipt_purpose:'income_deduction',eligibility_confirmed:true,deadline_confirmed:true,ownership_confirmed:true,target_confirmed:true,policy_basis:'대상·소득공제·이체·기한·미발행 확인'};
  const decisions=[['read_order',{order_no:order.order_no}],tc==='L-03'?['list_order_shipments',{order_no:order.order_no}]:['read_payment',{approval_no:payment.approval_no}],
    tc==='L-03'?['request_address_change',address]:['request_cash_receipt',cash]];
  globalThis.fetch=async(url,init)=>{
    const u=new URL(url);
    if(u.hostname==='api.openai.com'){
      const body=JSON.parse(init.body);assert.match(body.instructions,/공개 사례에서 확인한 실행 원칙/);
      assert.ok(body.tools.some(t=>t.name==='request_address_change'));assert.ok(body.tools.some(t=>t.name==='request_cash_receipt'));
      assert.ok(init.body.length<=MAX_MODEL_REQUEST_CHARS);modelCalls++;
      if(failFinal && modelCalls===4)return new Response(null,{status:500});
      const d=decisions.shift();
      return Response.json({status:'completed',output:d?[{type:'function_call',name:d[0],call_id:'call'+modelCalls,arguments:JSON.stringify(d[1])}]:
        [{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'변경 및 발행 완료했습니다.',summary:'요청 접수'})}]}]});
    }
    if(u.hostname==='gyodong-mall-action.aitop100.org'){
      assert.equal(init.headers['X-Aitop100-Test-Case-Id'],tc);
      if(init.method==='POST'){posts++;return Response.json({request_id:'REQ-VERIFIED',...(tc==='L-03'?{order_no:order.order_no}:{approval_no:payment.approval_no}),request_status:'SUBMITTED',requested_at:'2037-06-30T18:54:00+09:00'});}
      if(u.pathname==='/api/orders/'+order.order_no)return Response.json(order);
      if(u.pathname==='/api/shipments'){assert.equal(u.searchParams.get('order_no'),order.order_no);return Response.json([]);}
      if(u.pathname==='/api/payments/'+payment.approval_no)return Response.json(payment);
      assert.fail('Unexpected business read');
    }
    reply=JSON.parse(init.body).skillResponse.template.outputs[0].simpleText.text;
    return Response.json({errorCount:0});
  };
  try{
    const env={ACTION_TOKEN:'aitop100_synthetic',OPENAI_API_KEY:'fake-key',BOT_TOKEN:'bot',USAGE:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})}};
    const conv=new Conversation({storage:storage()},env);
    await conv.process({d:{content:`TC ID: ${tc}\n고객이 대상과 요청내용 확인`,botUserKey:'u',botGroupKey:'g',callbackToken:'callback'}},{scope:'a'.repeat(64),eventId:'public-'+tc},Date.now());
    assert.equal(modelCalls,4);assert.equal(posts,1);assert.match(reply,/REQ-VERIFIED/);
    assert.match(reply,tc==='L-03'?/배송지 변경 요청/:/소득공제용 현금영수증 발행 요청/);
    assert.ok(!reply.includes('완료했습니다'));assert.ok(reply.length<=500);
  }finally{globalThis.fetch=original;}
});
test('receipt-status command reads scoped journal without model/API calls or private arguments',async()=>{
  const original=globalThis.fetch;let reply;
  globalThis.fetch=async(url,init)=>{assert.ok(String(url).startsWith('https://kapi.kakao.com/'));
    reply=JSON.parse(init.body).skillResponse.template.outputs[0].simpleText.text;return Response.json({errorCount:0});};
  try {
    const conv=new Conversation({storage:storage()},{BOT_TOKEN:'fake-bot'});
    const j=conv.store.journal();await j.reserve('request_address_change',{address:'PRIVATE'});
    await j.settle('request_address_change',{address:'PRIVATE'},'success');
    await conv.process({d:{content:'/접수상태',callbackToken:'callback'}},{eventId:'status'},Date.now());
    assert.match(reply,/배송지 변경: 접수응답 확인 1건/);assert.match(reply,/현금영수증: 접수응답 확인 0건/);
    assert.ok(!reply.includes('PRIVATE'));assert.ok(reply.length<=500);
  }finally{globalThis.fetch=original;}
});
