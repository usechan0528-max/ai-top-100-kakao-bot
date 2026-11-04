import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerRequestActions,attachCustomerRequestActions,submittedCustomerRequestText} from '../src/customer-request-actions.mjs';
import {runAgent} from '../src/agent.mjs';
import {PUBLIC_TC_POLICY} from '../src/public-tc-policy.mjs';
import {createRequestActions} from '../src/request-actions.mjs';
import {createOrderPaymentActions} from '../src/order-payment-actions.mjs';
const order={order_no:'100100003',status:'PAID',payment_refs:['PAY-3706-0003']};
const payment={approval_no:'PAY-3706-0003',order_no:order.order_no,status:'APPROVED',amount:34900,pay_method:'BANK_TRANSFER'};
const address={order_no:order.order_no,new_address:'경기 성남시 테스트로 1, 101동 102호',address_confirmed:true,
  pre_pickup_basis:'정상 빈 배송 목록을 집하 전으로 명시한 공개 사례',ownership_confirmed:true,target_confirmed:true,policy_basis:'고객이 변경 대상과 상세주소 확인, 집하 전 변경 규정'};
const cash={order_no:order.order_no,approval_no:payment.approval_no,receipt_number:'019-2314-9701',receipt_purpose:'income_deduction',
  eligibility_confirmed:true,deadline_confirmed:true,ownership_confirmed:true,target_confirmed:true,policy_basis:'고객 소득공제 선택, 지난주 이체 결제·미발행·익월10일 이내 확인'};
const receipt=(key,value)=>({request_id:'REQ-1',[key]:value,request_status:'SUBMITTED',requested_at:'2037-06-30T18:54:00+09:00'});
const make=(extra={})=>createCustomerRequestActions({token:'synthetic',testCaseId:'L-03',getOrder:id=>id===order.order_no?order:null,
  getShipments:()=>({status:'empty',shipments:[]}),getPayment:id=>id===payment.approval_no?payment:null,...extra});

test('L-03 sends only target path and customer-confirmed address; receipt is submission',async()=>{
  let calls=0;const a=make({fetcher:async(url,init)=>{calls++;assert.ok(url.endsWith('/'+order.order_no+'/address-change-requests'));
    assert.equal(init.headers['X-Aitop100-Test-Case-Id'],'L-03');assert.deepEqual(JSON.parse(init.body),{new_address:address.new_address});
    return Response.json(receipt('order_no',order.order_no));}}).request_address_change;
  const result=await a.execute(address);assert.equal(result.status,'SUBMITTED');assert.match(result.notice,/완료가 아닙니다/);assert.equal(calls,1);
});
test('L-03 unconfirmed target/address, wrong order and missing policy never POST',async()=>{
  const a=make({fetcher:()=>assert.fail('no POST')}).request_address_change;
  for(const changes of [{target_confirmed:false},{address_confirmed:false},{ownership_confirmed:false},{order_no:'OTHER'},
    {policy_basis:''},{pre_pickup_basis:''},{new_address:''},{extra:'forbidden'}])
    await assert.rejects(a.execute({...address,...changes}),e=>e.code==='ACTION_NOT_EXECUTED');
});
test('L-03 missing/failed shipment evidence and picked-up/foreign shipment block writes',()=>{
  for(const s of [null,{status:'unavailable',shipments:[]},{status:'invalid_response',shipments:[]},
    {status:'ok',shipments:[{order_no:order.order_no,status:'IN_TRANSIT',picked_up_at:'2037-06-30T10:00:00Z'}]},
    {status:'ok',shipments:[{order_no:'OTHER',status:'READY',picked_up_at:null}]}])
    assert.equal(make({getShipments:()=>s}).request_address_change.authorize(address),false);
});
test('member match changes after reading invalidate both new writes at authorization time',()=>{
  let matches=true;const a=make({canUseOrder:()=>matches});
  assert.equal(a.request_address_change.authorize(address),true);assert.equal(a.request_cash_receipt.authorize(cash),true);
  matches=false;
  assert.equal(a.request_address_change.authorize(address),false);assert.equal(a.request_cash_receipt.authorize(cash),false);
});
test('L-05 targets only linked approval and sends no invented receipt_type field',async()=>{
  const a=make({testCaseId:'L-05',fetcher:async(url,init)=>{
    assert.ok(url.endsWith('/PAY-3706-0003/cash-receipt-requests'));assert.equal(init.headers['X-Aitop100-Test-Case-Id'],'L-05');
    assert.deepEqual(JSON.parse(init.body),{receipt_number:cash.receipt_number});return Response.json(receipt('approval_no',payment.approval_no));
  }}).request_cash_receipt;assert.equal((await a.execute(cash)).status,'SUBMITTED');
});
test('L-05 cards, unknown payment codes, cancellation and wrong linkage are denied',()=>{
  for(const p of [null,{...payment,pay_method:'CARD'},{...payment,pay_method:'UNSPECIFIED'},
    {...payment,status:'CANCELED'},{...payment,order_no:'OTHER'},{...payment,amount:0}])
    assert.equal(make({getPayment:()=>p}).request_cash_receipt.authorize(cash),false);
  for(const c of [{deadline_confirmed:false},{eligibility_confirmed:false},{receipt_purpose:'unknown'},{approval_no:'OTHER'}])
    assert.equal(make().request_cash_receipt.authorize({...cash,...c}),false);
});
test('both receipts reject wrong target/status/date/extra data and do not retry',async()=>{
  for(const [name,args,key] of [['request_address_change',address,'order_no'],['request_cash_receipt',cash,'approval_no']])
    for(const change of [{[key]:'OTHER'},{request_status:'DONE'},{requested_at:'2037-02-30T12:00:00Z'},{requested_at:'2037-06-30'}, {extra:'private'}]){
      let calls=0;const a=make({fetcher:async()=>{calls++;return Response.json({...receipt(key,args[key]),...change});}})[name];
      await assert.rejects(a.execute(args));assert.equal(calls,1);
    }
});
test('TC errors and preflight failure are explicitly not executed',async()=>{
  for(const extra of [{beforeCall:async()=>{throw Error('budget');},fetcher:()=>assert.fail()},
    {fetcher:async()=>Response.json({code:'INVALID_TEST_CASE_ID'},{status:400})}])
    await assert.rejects(make(extra).request_address_change.execute(address),e=>e.code==='ACTION_NOT_EXECUTED');
});
test('oversized and malformed write receipts remain uncertain',async()=>{
  for(const body of ['x'.repeat(16385),'{broken']) {
    let calls=0;const a=make({fetcher:async()=>{calls++;return new Response(body);}}).request_address_change;
    await assert.rejects(a.execute(address),e=>e.code!=='ACTION_NOT_EXECUTED');assert.equal(calls,1);
  }
});
test('abort cancels stalled write receipt stream without retry',async()=>{
  const controller=new AbortController();let cancelled=false;
  const a=make({fetcher:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}))}).request_address_change;
  const promise=a.execute(address,{signal:controller.signal});
  setTimeout(()=>controller.abort(),5);
  await assert.rejects(promise);assert.equal(cancelled,true);
});
test('core does not report success or perform second write after ambiguous L-03 response',async()=>{
  let calls=0;const actions=make({fetcher:async()=>{calls++;throw Error('network');}});
  const result=await runAgent({text:'배송지 변경 요청',actions,model:async({history})=>history.length>1?
    {type:'answer',text:'변경 완료'}:{type:'action',name:'request_address_change',arguments:address}});
  assert.equal(calls,1);assert.equal(result.outcomeUnknown,true);assert.ok(result.text.length<=500);
});
test('L-03 core tool roundtrip preserves concrete submitted receipt',async()=>{
  const actions=make({fetcher:async()=>Response.json(receipt('order_no',order.order_no))});
  const result=await runAgent({text:'상세주소로 변경해주세요',actions,model:async({history})=>history.length?
    {type:'answer',text:'배송지 변경 요청이 접수됐습니다. 접수번호 REQ-1입니다.'}:
    {type:'action',name:'request_address_change',arguments:address}});
  assert.equal(result.outcomeUnknown,false);assert.match(result.text,/요청이 접수/);
});
test('public TC policy retains escalation, evidence and unresolved timing distinctions',()=>{
  for(const term of ['LANE2_HANDOFF','LANE3_CLAIM','실제 사진','독립 인증','동일시각 포함','발행구분 시스템','공개 L-03','status=empty']) assert.ok(PUBLIC_TC_POLICY.includes(term));
});
test('verified receipt projection retains type/purpose/id without address or phone',async()=>{
  const receipts=[];const a=make({onSubmitted:r=>receipts.push(r),fetcher:async()=>Response.json(receipt('approval_no',payment.approval_no))});
  await a.request_cash_receipt.execute(cash);
  const output=submittedCustomerRequestText([{name:'request_cash_receipt',outcome:'success'}],receipts);
  assert.match(output,/소득공제용 현금영수증/);assert.match(output,/REQ-1/);
  assert.ok(!JSON.stringify(receipts).includes(cash.receipt_number));
  assert.equal(submittedCustomerRequestText([{name:'request_cash_receipt',outcome:'unknown'}],receipts),null);
});
test('per-message evidence requires successful reads, clears failed refresh, and never crosses case instances',async()=>{
  let status='empty';const reads={read_order:{kind:'read',execute:async()=>({status:'ok',order})},
    list_order_shipments:{kind:'read',execute:async()=>({status,shipments:[]})}};
  const config={token:'synthetic',testCaseId:'L-03'};
  const a=attachCustomerRequestActions(reads,config);
  assert.equal(a.request_address_change.authorize(address),false);
  await a.read_order.execute({order_no:order.order_no});
  assert.equal(a.request_address_change.authorize(address),false);
  await a.list_order_shipments.execute({order_no:order.order_no});
  assert.equal(a.request_address_change.authorize(address),true);
  assert.equal(attachCustomerRequestActions(reads,{...config,testCaseId:'L-05'}).request_address_change.authorize(address),false);
  status='unavailable';await a.list_order_shipments.execute({order_no:order.order_no});
  assert.equal(a.request_address_change.authorize(address),false);
});
for(const tc of ['L-03','L-05'])test(`${tc} real read adapters + new write + core fit four steps with exact target (mock HTTP/model)`,async()=>{
  const record={...order,member_id:'MB-77001',status_changed_at:null,ordered_at:'2037-06-24T10:00:00+09:00',amount:34900,
    recipient_name:'PRIVATE',shipping_address:'PRIVATE',inflow_tag:null,ship_scheduled_at:null,failure_code:null,
    refund_ids:[],change_request_ids:[],items:[{sku:'WTM-01',name:'수박',qty:1,unit_price:34900}]};
  const pay={...payment,paid_at:record.ordered_at,payer_name:'PRIVATE',cancellation_request_ids:[],card_last4:null};
  const calls=[];const config={token:'synthetic',testCaseId:tc,memberId:'MB-77001',fetcher:async(url,init)=>{
    const u=new URL(url);calls.push({path:u.pathname,method:init.method});assert.equal(init.headers['X-Aitop100-Test-Case-Id'],tc);
    if(init.method==='POST')return Response.json(tc==='L-03'?receipt('order_no',order.order_no):receipt('approval_no',payment.approval_no));
    if(u.pathname==='/api/orders/'+order.order_no)return Response.json(record);
    if(u.pathname==='/api/shipments'){assert.equal(u.searchParams.get('order_no'),order.order_no);return Response.json([]);}
    if(u.pathname==='/api/payments/'+payment.approval_no)return Response.json(pay);
    assert.fail('Unexpected target '+u.pathname);
  }};
  const actions=attachCustomerRequestActions(createOrderPaymentActions(config),config);
  const decisions=[{type:'action',name:'read_order',arguments:{order_no:order.order_no}},
    tc==='L-03'?{type:'action',name:'list_order_shipments',arguments:{order_no:order.order_no}}:
      {type:'action',name:'read_payment',arguments:{approval_no:payment.approval_no}},
    {type:'action',name:tc==='L-03'?'request_address_change':'request_cash_receipt',arguments:tc==='L-03'?address:cash},
    {type:'answer',text:'요청이 접수됐습니다. 접수번호 REQ-1입니다.'}];
  const result=await runAgent({text:'요청 대상과 입력 내용을 확인했습니다',actions,maxSteps:4,model:async()=>decisions.shift()});
  assert.equal(result.outcomeUnknown,false);assert.match(result.text,/접수/);assert.equal(calls.filter(c=>c.method==='POST').length,1);
  assert.equal(decisions.length,0);
});

for(const [tc,lane,reason] of [
  ['L-11','LANE2_HANDOFF','대상 주문과 로트 확인: 복수 곰팡이 신고, 진행 조사 없음. 안전 확인과 공급자 협의 요청'],
  ['L-23','LANE2_HANDOFF','타인 주문 상세 요구를 공개 없이 중단. 개인정보 요구 사건 확인 요청'],
  ['L-32','LANE3_CLAIM','대상 주문 확인, 복통 진술. 사진 미수신 및 인과 미확인, 진료증빙 확인과 배상 담당 검토 요청'],
  ['L-33','LANE2_HANDOFF','대상 주문 20통 중12통 수령,8통 미출고. 행사 전 잔여 일정 확인 및 고객 회신 요청'],
  ['L-34','LANE2_HANDOFF','대상 주문 당일배송 오인 안내 사과. 홍보라에게 빠른배송 문구 정정 검토 요청'],
]) test(`${tc} required escalation submits official lane and distinct receipt (mock transport)`,async()=>{
  let calls=0;const action=createRequestActions({token:'synthetic',testCaseId:tc,fetcher:async(url,init)=>{
    calls++;assert.equal(init.headers['X-Aitop100-Test-Case-Id'],tc);assert.ok(url.endsWith('/api/escalations'));
    assert.deepEqual(JSON.parse(init.body),{lane,reason});
    return Response.json({escalation_id:'ESC-1',request_status:'SUBMITTED',requested_at:'2037-06-30T12:00:00+09:00'});
  }}).request_escalation;
  const result=await action.execute({lane,reason,policy_basis:'공개 사례의 필수 이관 조건과 확인 사실에 따른 운영 검토 요청'});
  assert.equal(result.status,'SUBMITTED');assert.equal(calls,1);
});
