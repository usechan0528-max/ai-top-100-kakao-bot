import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFulfillmentRequestActions} from '../src/fulfillment-request-actions.mjs';

const spec=JSON.parse(fs.readFileSync(new URL('../docs/sources/action-api/actions.json',import.meta.url),'utf8'));
const order={order_no:'ORDER-1',member_id:'MB-1',status:'PAID',amount:32000,items:[{sku:'SKU-1',qty:1,unit_price:32000}]};
const product={sku:'SKU-1',price:27900};
const promo={code:'CARE5000',benefit_type:'AMOUNT',benefit_value:5000,target_skus:null};
const base={policy_basis:'고객 선택과 대상·정책 근거 확인',target_confirmed:true,choice_confirmed:true,eligibility_confirmed:true};
const cases=[
  ['request_reship',{...base,order_no:'ORDER-1',shipment_id:'SHIP-1'},'/api/shipments/{shipment_id}/reship-requests','shipment_id','SHIP-1',{}],
  ['request_schedule_change',{...base,order_no:'ORDER-1',requested_date:'2037-07-01',pre_pickup_basis:'집하 전 조회 및 고객 확인'},'/api/orders/{order_no}/schedule-change-requests','order_no','ORDER-1',{requested_date:'2037-07-01'}],
  ['request_coupon_issue',{...base,order_no:'ORDER-1',sku:'SKU-1',promo_code:'CARE5000',price_policy_basis:'정상가 인하와 구매금액 대조',minimum_coupon_confirmed:true,window_confirmed:true,no_previous_compensation:true},
    '/api/members/{member_id}/coupon-issue-requests','member_id','MB-1',{promo_code:'CARE5000'}],
];
function make(overrides={}) {
  const calls=[],receipts=[];
  const config={token:'synthetic-token',testCaseId:'L-47',getOrder:()=>order,getMemberId:()=>order.member_id,canUseOrder:()=>true,
    getProduct:()=>product,getPromotion:()=>promo,getPromotions:()=>[promo],
    getShipments:()=>({status:'ok',shipments:[{shipment_id:'SHIP-1',order_no:'ORDER-1',status:'READY',picked_up_at:null}]}),
    onSubmitted:r=>receipts.push(r),fetcher:async(url,init)=>{
      calls.push({url,init});const c=cases.find(c=>url.endsWith(c[2].replace(/\{[^}]+\}/,c[4])));assert.ok(c);
      return Response.json({request_id:'REQ-1',[c[3]]:c[4],request_status:'SUBMITTED',requested_at:'2037-06-30T12:00:00Z'});
    },...overrides};
  return {actions:createFulfillmentRequestActions(config),calls,receipts};
}

test('API25/28/33 transport and receipts follow actual POST schema rather than record schemas',async()=>{
  for(const [name,args,path,key,target,body] of cases) {
    const schema=spec.paths[path].post.requestBody.content['application/json'].schema;
    assert.deepEqual(Object.keys(body).sort(),[...(schema.required??[])].sort());
    const h=make();const result=await h.actions[name].execute(args);
    assert.equal(result.status,'SUBMITTED');assert.match(result.notice,/완료가 아닙니다/);
    const call=h.calls[0];assert.equal(call.url,'https://gyodong-mall-action.aitop100.org'+path.replace(/\{[^}]+\}/,target));
    assert.equal(call.init.method,'POST');assert.equal(call.init.redirect,'manual');assert.equal(call.init.headers['X-Aitop100-Test-Case-Id'],'L-47');
    assert.deepEqual(JSON.parse(call.init.body),body);assert.equal(h.receipts.length,1);
    const receiptRef=spec.paths[path].post.responses['200'].content['application/json'].schema.$ref;
    assert.deepEqual(spec.components.schemas[receiptRef.split('/').at(-1)].required,['request_id',key,'request_status','requested_at']);
  }
});

test('every fulfillment request requires current order evidence, matched ownership and explicit customer choice',async()=>{
  for(const [name,args] of cases) {
    for(const overrides of [{getOrder:()=>null},{canUseOrder:()=>false},{getOrder:()=>({...order,status:'CANCELED'})}]) {
      const h=make(overrides);await assert.rejects(h.actions[name].execute(args),e=>e.code==='ACTION_NOT_EXECUTED');assert.equal(h.calls.length,0);
    }
    for(const flag of ['target_confirmed','choice_confirmed','eligibility_confirmed'])
      assert.equal(make().actions[name].authorize({...args,[flag]:false}),false);
  }
});

test('ownership withdrawn during asynchronous beforeCall blocks every fulfillment POST',async()=>{
  for(const [name,args] of cases) {
    let allowed=true;const h=make({canUseOrder:()=>allowed,beforeCall:async()=>{allowed=false}});
    await assert.rejects(h.actions[name].execute(args),e=>e.code==='ACTION_NOT_EXECUTED');assert.equal(h.calls.length,0);
  }
});

test('same official fulfillment request has stable idempotency despite review text changes',()=>{
  for(const [name,args] of cases) {
    const action=make().actions[name];
    assert.deepEqual(action.idempotencyArgs(args),action.idempotencyArgs({...args,policy_basis:'다른 표현의 동일 정책 검토'}));
  }
});

test('schedule date must be real and shipment evidence must be uncollected and linked',()=>{
  const [name,args]=cases[1];
  for(const requested_date of ['2037-02-30','2037-07-01T00:00:00Z','../reset'])assert.equal(make().actions[name].authorize({...args,requested_date}),false);
  for(const row of [{shipment_id:'SHIP-1',order_no:'OTHER',status:'READY',picked_up_at:null},{shipment_id:'SHIP-1',order_no:'ORDER-1',status:'IN_TRANSIT',picked_up_at:'2037-06-30T12:00:00Z'}])
    assert.equal(make({getShipments:()=>({status:'ok',shipments:[row]})}).actions[name].authorize(args),false);
});

test('coupon path rejects mismatched member and unsupported quantity or allocation',()=>{
  const [name,args]=cases[2];
  assert.equal(make({getMemberId:()=> 'OTHER'}).actions[name].authorize(args),false);
  assert.equal(make({getOrder:()=>({...order,items:[{...order.items[0],qty:2}]})}).actions[name].authorize(args),false);
  const larger={...promo,benefit_value:10000};
  // One item does not prove that shipping/discounts are absent from the order total.
  assert.equal(make({getOrder:()=>({...order,amount:37000}),getPromotion:()=>larger,getPromotions:()=>[larger]}).actions[name].authorize(args),false);
});

test('wrong target, false success status and invalid date never produce a verified fulfillment receipt',async()=>{
  for(const [name,args,,key,target] of cases)for(const changed of [{[key]:'OTHER'},{request_status:'DONE'},{requested_at:'2037-02-30T12:00:00Z'}]) {
    let posts=0;const h=make({fetcher:async()=>{posts++;return Response.json({request_id:'REQ-1',[key]:target,request_status:'SUBMITTED',requested_at:'2037-06-30T12:00:00Z',...changed});}});
    await assert.rejects(h.actions[name].execute(args));assert.equal(posts,1);assert.equal(h.receipts.length,0);
  }
});
