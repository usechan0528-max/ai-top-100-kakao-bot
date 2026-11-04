import test from 'node:test';
import assert from 'node:assert/strict';
import {createFulfillmentRequestActions,attachFulfillmentRequestActions} from '../src/fulfillment-request-actions.mjs';
const common={policy_basis:'검수된 규정과 현재 주문에 해당하는 근거',target_confirmed:true,choice_confirmed:true,eligibility_confirmed:true};
const reship={...common,order_no:'ORDER-1',shipment_id:'SHIP-1'};
const schedule={...common,order_no:'ORDER-1',requested_date:'2037-07-01',pre_pickup_basis:'배송조회 집하전 및 일정 변경 가능 근거'};
const coupon={...common,order_no:'ORDER-1',sku:'SKU-1',promo_code:'CARE5000',price_policy_basis:'7일 이내 정상가 인하, 최소 보상쿠폰 원문 검토',minimum_coupon_confirmed:true,window_confirmed:true,no_previous_compensation:true};
const order=()=>({order_no:'ORDER-1',member_id:'MEM-1',status:'PAID',amount:32000,items:[{sku:'SKU-1',qty:1,unit_price:32000}]});
const shipments=()=>({status:'ok',shipments:[{shipment_id:'SHIP-1',order_no:'ORDER-1',status:'READY',picked_up_at:null}]});
const product=()=>({sku:'SKU-1',price:27900});
const promotion=()=>({code:'CARE5000',benefit_type:'AMOUNT',benefit_value:5000,target_skus:null});
function setup(overrides={}) {
  const calls=[],receipts=[];
  const fetcher=async(url,opts)=>{calls.push({url,opts});const target=url.includes('/shipments/')?{shipment_id:'SHIP-1'}:url.includes('/members/')?{member_id:'MEM-1'}:{order_no:'ORDER-1'};return Response.json({request_id:'REQ-1',...target,request_status:'SUBMITTED',requested_at:'2037-06-30T10:20:30+09:00'});};
  const config={token:'mock-token',testCaseId:'CASE-X',fetcher,onSubmitted:r=>receipts.push(r),getOrder:order,getShipments:shipments,getProduct:product,getPromotion:promotion,...overrides};
  return {actions:createFulfillmentRequestActions(config),config,calls,receipts};
}
test('official three POST paths, minimal bodies, receipt only, no identity preregistration',async()=>{
  const h=setup();
  for(const [name,args,path,body] of [
    ['request_reship',reship,'/api/shipments/SHIP-1/reship-requests',{}],
    ['request_schedule_change',schedule,'/api/orders/ORDER-1/schedule-change-requests',{requested_date:'2037-07-01'}],
    ['request_coupon_issue',coupon,'/api/members/MEM-1/coupon-issue-requests',{promo_code:'CARE5000'}]]) {
    const result=await h.actions[name].execute(args);assert.equal(result.status,'SUBMITTED');assert.match(result.notice,/완료가 아닙니다/);
    const {url,opts}=h.calls.at(-1);assert.equal(url,'https://gyodong-mall-action.aitop100.org'+path);assert.equal(opts.method,'POST');assert.equal(opts.redirect,'manual');assert.equal(opts.headers['X-Aitop100-Test-Case-Id'],'CASE-X');assert.deepEqual(JSON.parse(opts.body),body);
    assert.equal(h.receipts.at(-1).order_no,'ORDER-1');assert.equal(result.member_id,undefined);
  }
});
test('strict args and required reviews block before POST',async()=>{
  const h=setup();for(const args of [{...reship,extra:true},{...reship,shipment_id:'../../x'},{...reship,choice_confirmed:false},{...reship,policy_basis:''}]){assert.equal(h.actions.request_reship.validate(args),false);await assert.rejects(h.actions.request_reship.execute(args),e=>e.code==='ACTION_NOT_EXECUTED');}assert.equal(h.calls.length,0);
});
test('coupon receipt preserves only validated price numbers from before POST',async()=>{
  let price=27900;const h=setup({getProduct:()=>({...product(),price}),fetcher:async()=>{
    price=1;return Response.json({request_id:'REQ-PRICE',member_id:'MEM-1',request_status:'SUBMITTED',requested_at:'2037-06-30T10:20:30Z'});
  }});
  await h.actions.request_coupon_issue.execute(coupon);
  assert.deepEqual(h.receipts[0].price_compensation,{paid_price:32000,current_price:27900,difference:4100,coupon_value:5000});
  assert.deepEqual(Object.keys(h.receipts[0].price_compensation),['paid_price','current_price','difference','coupon_value']);
});
test('only selected shipment belonging to current order can be reshipped',()=>{
  for(const overrides of [{getOrder:()=>null},{canUseOrder:()=>false},{getShipments:()=>({status:'ok',shipments:[{shipment_id:'SHIP-1',order_no:'OTHER'}]})},{getOrder:()=>({...order(),status:'CANCELED'})}])assert.equal(setup(overrides).actions.request_reship.authorize(reship),false);
});
test('schedule date format and pre-pickup evidence',()=>{
  const h=setup();assert.equal(h.actions.request_schedule_change.validate({...schedule,requested_date:'2037-02-30'}),false);
  for(const s of [{status:'unavailable'}, {status:'ok',shipments:[{...shipments().shipments[0],status:'IN_TRANSIT'}]},{status:'ok',shipments:[{...shipments().shipments[0],picked_up_at:'2037-06-30T10:00:00Z'}]}])assert.equal(setup({getShipments:()=>s}).actions.request_schedule_change.authorize(schedule),false);
  assert.equal(setup({getShipments:()=>({status:'empty',shipments:[]})}).actions.request_schedule_change.authorize(schedule),true);
});
test('coupon requires verified code, exact item purchase price, actual price reduction and target',()=>{
  const variants=[{getPromotion:()=>({...promotion(),benefit_value:7000})},{getProduct:()=>({...product(),price:32000})},{getProduct:()=>({...product(),price:26000})},{getPromotion:()=>({...promotion(),target_skus:['OTHER']})},{getMemberId:()=> 'OTHER'},{getOrder:()=>({...order(),amount:37000})},{getOrder:()=>({...order(),items:[{sku:'SKU-1',qty:2,unit_price:16000}]})},{getPromotions:()=>[{benefit_type:'AMOUNT',benefit_value:4500,target_skus:null}]}];
  for(const override of variants)assert.equal(setup(override).actions.request_coupon_issue.authorize(coupon),false);
  const h=setup({getPromotion:()=>({...promotion(),code:'MELON99'})});assert.equal(h.actions.request_coupon_issue.authorize({...coupon,promo_code:'MELON99'}),false);
});
test('membership rechecked after asynchronous call reservation',async()=>{
  let permitted=true;const h=setup({canUseOrder:()=>permitted,beforeCall:async()=>{permitted=false;}});await assert.rejects(h.actions.request_reship.execute(reship),e=>e.code==='ACTION_NOT_EXECUTED');assert.equal(h.calls.length,0);
});
test('idempotency uses official target/body, not rewritten review text',()=>{
  const h=setup();for(const [name,args] of [['request_reship',reship],['request_schedule_change',schedule],['request_coupon_issue',coupon]])assert.deepEqual(h.actions[name].idempotencyArgs(args),h.actions[name].idempotencyArgs({...args,policy_basis:'다른 설명'}));
});
test('attach requires same-run reads and invalidates failed or thrown refresh',async()=>{
  const h=setup();let fail=false;
  const reads={read_order:{execute:async()=>fail?{status:'forbidden'}:{status:'ok',order:order()}},list_order_shipments:{execute:async()=>shipments()}};
  const a=attachFulfillmentRequestActions(reads,h.config);assert.equal(a.request_reship.authorize(reship),false);await a.read_order.execute({order_no:'ORDER-1'});await a.list_order_shipments.execute({order_no:'ORDER-1'});assert.equal(a.request_reship.authorize(reship),true);fail=true;await a.read_order.execute({order_no:'ORDER-1'});assert.equal(a.request_reship.authorize(reship),false);
});
test('aborted budget and reservation rejection do not send',async()=>{
  const h=setup();const c=new AbortController();c.abort();await assert.rejects(h.actions.request_reship.execute(reship,{signal:c.signal}),e=>e.code==='ACTION_NOT_EXECUTED');assert.equal(h.calls.length,0);
  await assert.rejects(setup({beforeCall:()=>{throw Error('budget');}}).actions.request_reship.execute(reship),e=>e.code==='ACTION_NOT_EXECUTED');
});
test('TC pre-execution rejection differs from unknown response, never retries',async()=>{
  for(const response of [Response.json({code:'INVALID_TEST_CASE_ID'},{status:400}),Response.json({code:'OTHER'},{status:400}),new Response(null,{status:302}),Response.json({request_id:'REQ-1',shipment_id:'OTHER',request_status:'SUBMITTED',requested_at:'2037-06-30T10:20:30Z'}),new Response('x'.repeat(17000))]){
    let calls=0;const h=setup({fetcher:async()=>{calls++;return response;}});await assert.rejects(h.actions.request_reship.execute(reship));assert.equal(calls,1);assert.equal(h.receipts.length,0);
  }
});
