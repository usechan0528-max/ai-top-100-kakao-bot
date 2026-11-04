import {AgentError} from './errors.mjs';
// API-25/28/33: only request receipts, never actual fulfillment/coupon completion.
// Sources: docs/sources/action-api/actions.json; member-link-research/L-47.md;
// delegation/TRANSCRIPT.md. Limits: docs/development/2026-10-31/FULFILLMENT_REQUEST_SCOPE.txt.
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(v);
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=1500;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const time=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)&&date(v.slice(0,10))&&Number.isFinite(Date.parse(v));
const str={type:'string',minLength:1,maxLength:1500},identifier={type:'string',minLength:1,maxLength:100},yes={type:'boolean',const:true};
const unexecuted=()=>new AgentError('ACTION_NOT_EXECUTED');

export function createFulfillmentRequestActions({token,testCaseId,fetcher=fetch,beforeCall=async()=>{},onSubmitted=()=>{},
  getOrder=()=>null,getShipments=()=>null,getProduct=()=>null,getPromotion=()=>null,getPromotions=()=>[],
  getMemberId=()=>null,canUseOrder=()=>true}={}) {
  if(typeof token!=='string'||!token||token.length>4096||/\s/.test(token)||typeof testCaseId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(testCaseId))return {};
  const own=a=>{const o=getOrder(a.order_no);return o&&o.order_no===a.order_no&&canUseOrder(o)===true&&['PAID','CONFIRMED'].includes(o.status)?o:null;};
  const memberFor=a=>getMemberId()??getOrder(a.order_no)?.member_id;
  const make=(name,fields,valid,eligible,project)=>{
    const properties={...fields,policy_basis:str,target_confirmed:yes,choice_confirmed:yes,eligibility_confirmed:yes};
    const validate=a=>exact(a,Object.keys(properties))&&text(a.policy_basis)&&a.target_confirmed===true&&a.choice_confirmed===true&&a.eligibility_confirmed===true&&valid(a);
    const authorize=a=>validate(a)&&eligible(a)===true;
    return {kind:'write',description:`${name} 요청만 접수. 현재 실행의 조회근거·본인귀속·고객선택·정책 검토 필요. 플래그는 독립 인증이 아니며 실제 처리 완료를 뜻하지 않음.`,
      parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},validate,authorize,
      idempotencyArgs:a=>{const p=project(a);return {path:p.path,body:p.body};},
      execute:async(a,{signal}={})=>{
        if(!authorize(a))throw unexecuted();
        try{signal?.throwIfAborted();await beforeCall(signal);signal?.throwIfAborted();if(!authorize(a))throw unexecuted();}catch{throw unexecuted();}
        const p=project(a);
        // Snapshot the validated prices before transmission; later reads cannot alter this receipt evidence.
        const priceCompensation=name==='coupon_issue'?{
          paid_price:getOrder(a.order_no).amount,current_price:getProduct(a.sku).price,
          difference:getOrder(a.order_no).amount-getProduct(a.sku).price,coupon_value:getPromotion(a.promo_code).benefit_value,
        }:null;
        const response=await fetcher('https://gyodong-mall-action.aitop100.org'+p.path,{method:'POST',redirect:'manual',signal,
          headers:{Authorization:`Bearer ${token}`,'X-Aitop100-Test-Case-Id':testCaseId,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(p.body)});
        const reader=response.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let raw='',size=0;
        const abort=()=>{void reader?.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
        try{if(reader)for(;;){signal?.throwIfAborted();const c=await reader.read();signal?.throwIfAborted();if(c.done)break;size+=c.value.byteLength;if(size>16384){void reader.cancel().catch(()=>{});throw Error('UNKNOWN_REQUEST_OUTCOME');}raw+=decoder.decode(c.value,{stream:true});}raw+=decoder.decode();}
        finally{signal?.removeEventListener('abort',abort);reader?.releaseLock();}
        let data;try{data=JSON.parse(raw);}catch{throw Error('UNKNOWN_REQUEST_OUTCOME');}
        if(response.status===400&&['MISSING_TEST_CASE_ID','INVALID_TEST_CASE_ID'].includes(data?.code))throw unexecuted();
        if(response.status!==200||!exact(data,['request_id',p.key,'request_status','requested_at'])||!id(data.request_id)||data[p.key]!==p.target||data.request_status!=='SUBMITTED'||!time(data.requested_at))throw Error('UNKNOWN_REQUEST_OUTCOME');
        const receipt={kind:name,receipt_id:data.request_id,requested_at:data.requested_at,order_no:a.order_no,target:p.target,
          ...(name==='coupon_issue'?{promo_code:a.promo_code,price_compensation:priceCompensation}:{}),...(name==='schedule_change'?{requested_date:a.requested_date}:{})};
        onSubmitted(receipt);
        return {status:'SUBMITTED',receipt_id:data.request_id,requested_at:data.requested_at,notice:'요청 접수이며 실제 재배송·쿠폰 발급·일정 변경 완료가 아닙니다.'};
      }};
  };
  return {
    request_reship:make('reship',{order_no:identifier,shipment_id:identifier},a=>id(a.order_no)&&id(a.shipment_id),a=>{
      const s=getShipments(a.order_no);return !!own(a)&&s?.status==='ok'&&Array.isArray(s.shipments)&&s.shipments.some(row=>row.shipment_id===a.shipment_id&&row.order_no===a.order_no);
    },a=>({path:`/api/shipments/${encodeURIComponent(a.shipment_id)}/reship-requests`,body:{},key:'shipment_id',target:a.shipment_id})),
    request_schedule_change:make('schedule_change',{order_no:identifier,requested_date:{type:'string',format:'date'},pre_pickup_basis:str},a=>id(a.order_no)&&date(a.requested_date)&&text(a.pre_pickup_basis),a=>{
      const s=getShipments(a.order_no);return !!own(a)&&s&&['ok','empty'].includes(s.status)&&Array.isArray(s.shipments)&&s.shipments.every(row=>row.order_no===a.order_no&&row.status==='READY'&&row.picked_up_at===null);
    },a=>({path:`/api/orders/${encodeURIComponent(a.order_no)}/schedule-change-requests`,body:{requested_date:a.requested_date},key:'order_no',target:a.order_no})),
    request_coupon_issue:make('coupon_issue',{order_no:identifier,sku:identifier,promo_code:identifier,price_policy_basis:str,minimum_coupon_confirmed:yes,window_confirmed:yes,no_previous_compensation:yes},
      a=>id(a.order_no)&&id(a.sku)&&id(a.promo_code)&&text(a.price_policy_basis)&&a.minimum_coupon_confirmed===true&&a.window_confirmed===true&&a.no_previous_compensation===true,a=>{
        const o=own(a),p=getProduct(a.sku),promo=getPromotion(a.promo_code),member=memberFor(a);
        // Narrow price-drop path: mixed quantities/discount allocations need a separate verified calculator.
        if(!o||!id(member)||o.member_id!==member||!p||p.sku!==a.sku||!promo||promo.code!==a.promo_code||
          !Array.isArray(o.items)||o.items.length!==1||o.items[0].sku!==a.sku||o.items[0].qty!==1||
          !Number.isSafeInteger(o.amount)||o.amount!==o.items[0].unit_price||!Number.isSafeInteger(p.price)||p.price<0||o.amount<=p.price||
          // L-47 establishes CARE5000 as a 5,000-won compensation coupon. AMOUNT alone does not establish that role.
          // stackable_with REWARD_COUPON describes stacking, not this code's category. No other code is inferred.
          a.promo_code!=='CARE5000'||promo.benefit_type!=='AMOUNT'||promo.benefit_value!==5000||promo.benefit_value<o.amount-p.price||
          (promo.target_skus!==null&&(!Array.isArray(promo.target_skus)||!promo.target_skus.includes(a.sku))))return false;
        // Reject a larger coupon if a smaller eligible registered coupon was already read.
        return !getPromotions().some(c=>c.benefit_type==='AMOUNT'&&c.benefit_value>=o.amount-p.price&&c.benefit_value<promo.benefit_value&&
          (c.target_skus===null||c.target_skus?.includes(a.sku)));
      },a=>({path:`/api/members/${encodeURIComponent(memberFor(a))}/coupon-issue-requests`,body:{promo_code:a.promo_code},key:'member_id',target:memberFor(a)})),
  };
}

// Evidence lives only within this invocation. Failed refreshes revoke cached evidence.
export function attachFulfillmentRequestActions(reads,config) {
  const orders=new Map(),shipments=new Map(),products=new Map(),promos=new Map();
  const wrapped=Object.fromEntries(Object.entries(reads).map(([name,action])=>[name,{...action,execute:async(args,options)=>{
    if(name==='read_order'){orders.delete(args.order_no);shipments.delete(args.order_no);}
    if(name==='list_my_orders'){orders.clear();shipments.clear();}
    if(name==='list_order_shipments')shipments.delete(args.order_no);
    if(name==='read_product')products.delete(args.sku);
    if(name==='read_promotion')promos.delete(args.code);
    let result;try{result=await action.execute(args,options);}catch(error){if(args.order_no){orders.delete(args.order_no);shipments.delete(args.order_no);}throw error;}
    if(result.status==='ok'||result.status==='empty'){
      if(name==='read_order'&&result.order)orders.set(args.order_no,structuredClone(result.order));
      if(name==='list_my_orders')for(const o of result.orders??[])orders.set(o.order_no,structuredClone(o));
      if(name==='list_order_shipments')shipments.set(args.order_no,structuredClone(result));
      if(name==='read_product'&&result.product)products.set(args.sku,structuredClone(result.product));
      if(name==='read_promotion'&&result.promotion)promos.set(args.code,structuredClone(result.promotion));
    }else if(args.order_no){orders.delete(args.order_no);shipments.delete(args.order_no);}
    return result;
  }}]));
  return {...wrapped,...createFulfillmentRequestActions({...config,getOrder:key=>orders.get(key),getShipments:key=>shipments.get(key),
    getProduct:key=>products.get(key),getPromotion:key=>promos.get(key),getPromotions:()=>[...promos.values()]})};
}
