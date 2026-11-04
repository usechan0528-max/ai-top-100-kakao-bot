// API-07/08/11/17/18 from docs/sources/action-api/actions.json.
// memberId and testCaseId MUST be supplied by trusted server context, never model args.
const ORIGIN = 'https://gyodong-mall-action.aitop100.org';
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
const text = value => typeof value === 'string' && value.length <= 1024;
const nullable = validator => value => value === null || validator(value);
const integer = value => Number.isSafeInteger(value);
const list = validator => value => Array.isArray(value) && value.length <= 200 && value.every(validator);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const dateTime = value => typeof value === 'string' && value.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) &&
  date(value.slice(0,10)) && Number.isFinite(Date.parse(value));
const shape = fields => value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Reflect.ownKeys(value).length === Object.keys(fields).length && Object.entries(fields).every(([key,valid]) => {
    const descriptor = Object.getOwnPropertyDescriptor(value,key);
    return descriptor && Object.hasOwn(descriptor,'value') && valid(descriptor.value);
  });
const orderFields = {
  order_no:identifier,member_id:identifier,status:value=>['PAID','CONFIRMED','CANCEL_REQUESTED','CANCELED','FAILED'].includes(value),
  status_changed_at:nullable(dateTime),ordered_at:dateTime,amount:integer,recipient_name:text,shipping_address:text,
  inflow_tag:nullable(text),ship_scheduled_at:nullable(date),failure_code:nullable(text),
  payment_refs:list(identifier),refund_ids:list(identifier),change_request_ids:list(identifier),
  items:list(shape({sku:identifier,name:text,qty:integer,unit_price:integer})),
};
const paymentFields = {
  approval_no:identifier,order_no:nullable(identifier),pay_method:text,amount:integer,paid_at:dateTime,
  status:value=>['APPROVED','CANCELED'].includes(value),payer_name:nullable(text),
  cancellation_request_ids:list(identifier),card_last4:nullable(value=>typeof value==='string' && /^\d{4}$/.test(value)),
};
const validOrder = shape(orderFields), validPayment = shape(paymentFields);
const validShipment = shape({
  shipment_id:identifier,order_no:identifier,status:value=>['READY','IN_TRANSIT','DELIVERED','RETURNED'].includes(value),
  carrier:text,invoice_no:text,picked_up_at:nullable(dateTime),delivered_at:nullable(dateTime),
  delivered_location:nullable(text),return_reason:nullable(text),item_condition:nullable(text),
  ship_notice_sent_at:nullable(dateTime),items:list(shape({sku:identifier,qty:integer,lot_id:identifier})),
});
const shipmentView = value => {
  const {delivered_location,...safe} = value;
  return safe;
};
const orderView = value => {
  const {member_id,recipient_name,shipping_address,...safe} = value;
  return safe;
};
const paymentView = value => {
  const {payer_name,card_last4,...safe} = value;
  return safe;
};

async function readBounded(response,signal) {
  const length = response.headers.get('content-length');
  if(length && (!/^\d+$/.test(length) || Number(length)>65536)) throw new Error('INVALID_RESPONSE');
  if(!response.body) return '';
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  let size=0,result='';
  const aborted=()=>{void reader.cancel().catch(()=>{});};
  signal?.addEventListener('abort',aborted,{once:true});
  try {
    for(;;) {
      signal?.throwIfAborted();
      const {value,done}=await reader.read();
      signal?.throwIfAborted();
      if(done) break;
      size+=value.byteLength;
      if(size>65536) {void reader.cancel().catch(()=>{});throw new Error('INVALID_RESPONSE');}
      result+=decoder.decode(value,{stream:true});
    }
    return result+decoder.decode();
  } finally {signal?.removeEventListener('abort',aborted);reader.releaseLock();}
}

export function createOrderPaymentActions({token,testCaseId,memberId,conversationPolicy=false,fetcher=fetch,beforeCall=async()=>{}}={}) {
  // No guessed identity and no partially configured private tools.
  if((!conversationPolicy && !identifier(memberId)) || typeof token!=='string' || !token || token.length>4096 || /\s/.test(token) ||
     typeof testCaseId!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(testCaseId) ||
     typeof fetcher!=='function' || typeof beforeCall!=='function') return Object.freeze({});
  async function get(path,signal) {
    let response;
    try {
      signal?.throwIfAborted();await beforeCall(signal);signal?.throwIfAborted();
      response=await fetcher(ORIGIN+path,{method:'GET',redirect:'manual',signal,
        headers:{Authorization:`Bearer ${token}`,'X-Aitop100-Test-Case-Id':testCaseId,Accept:'application/json'}});
      signal?.throwIfAborted();
    } catch {signal?.throwIfAborted();return {status:'unavailable'};}
    let raw,body;
    try {raw=await readBounded(response,signal);body=raw ? JSON.parse(raw) : null;}
    catch {signal?.throwIfAborted();return {status:'invalid_response'};}
    if(response.status===200) return {status:'ok',body};
    if(response.status===400) return {status:['MISSING_TEST_CASE_ID','INVALID_TEST_CASE_ID'].includes(body?.code)?'invalid_test_case':'invalid_request'};
    if(response.status===401) return {status:'unauthorized'};
    if(response.status===403) return {status:'forbidden'};
    if(response.status===404) return {status:'not_found_or_route_error'};
    if(response.status===429) {
      if(body?.message==='누적 API 호출 한도를 초과했습니다.') return {status:'quota_exhausted'};
      const retry=response.headers.get('retry-after');
      return {status:'rate_limited',...(/^\d+$/.test(retry??'') && Number.isSafeInteger(Number(retry)) && Number(retry)<=2147483647 ? {retryAfterSeconds:Number(retry)} : {})};
    }
    return {status:'unavailable'};
  }
  async function ownedOrder(orderNo,signal) {
    const result=await get('/api/orders/'+encodeURIComponent(orderNo),signal);
    if(result.status!=='ok') return result;
    if(!validOrder(result.body) || result.body.order_no!==orderNo) return {status:'invalid_response'};
    if(!conversationPolicy && result.body.member_id!==memberId) return {status:'forbidden'};
    return {status:'ok',order:{...orderView(result.body),...(conversationPolicy?{member_id:result.body.member_id}:{})}};
  }
  const action=(description,fields,execute)=>{
    const valid=shape(fields);
    return Object.freeze({kind:'read',description,
      parameters:{type:'object',properties:Object.fromEntries(Object.keys(fields).map(key=>[key,{type:'string',minLength:1,maxLength:100,pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'}])),required:Object.keys(fields),additionalProperties:false},
      validate:valid,authorize:()=>true,
      execute:async(args,{signal}={})=>valid(args)?execute(args,signal):{status:'invalid_request'},
    });
  };
  return Object.freeze({
    read_order:action('주문 조회. 고객 진술과 반환 member_id·주문 항목을 대조해 본인 귀속을 확인한 뒤 안내. 주소·수령인 제외.',{order_no:identifier},
      ({order_no},signal)=>ownedOrder(order_no,signal)),
    list_my_orders:action('고객 대화의 회원 ID로 주문 검색. 조회 결과와 고객 진술을 대조하고 타인 주문은 공개하지 않는다.',conversationPolicy?{member_id:identifier}:{},async(args,signal)=>{
      const targetMember=conversationPolicy?args.member_id:memberId;
      const result=await get('/api/orders?member_id='+encodeURIComponent(targetMember),signal);
      if(result.status!=='ok') return result;
      if(!list(validOrder)(result.body)) return {status:'invalid_response'};
      if(result.body.some(order=>order.member_id!==targetMember)) return {status:'forbidden'};
      return {status:result.body.length?'ok':'empty',orders:result.body.map(value=>({...orderView(value),...(conversationPolicy?{member_id:value.member_id}:{})}))};
    }),
    read_payment:action('결제와 연결 주문 조회. 반환 member_id와 고객 진술을 대조한 뒤 안내. 미연결은 대사 필요이며 본인 확정이 아니다.',{approval_no:identifier},async({approval_no},signal)=>{
      const result=await get('/api/payments/'+encodeURIComponent(approval_no),signal);
      if(result.status!=='ok') return result;
      if(!validPayment(result.body) || result.body.approval_no!==approval_no) return {status:'invalid_response'};
      if(result.body.order_no===null) return conversationPolicy?{status:'ok',payment:paymentView(result.body),ownership:'unlinked_requires_reconciliation'}:{status:'forbidden'};
      const ownership=await ownedOrder(result.body.order_no,signal);
      if(ownership.status!=='ok') return {status:ownership.status};
      return {status:'ok',payment:paymentView(result.body),...(conversationPolicy?{member_id:ownership.order.member_id}:{})};
    }),
    list_order_payments:action('주문 연결을 확인하고 결제를 검색. 반환 member_id와 고객 진술을 대조해 본인 주문으로 확인한 뒤 안내.',{order_no:identifier},async({order_no},signal)=>{
      const ownership=await ownedOrder(order_no,signal);
      if(ownership.status!=='ok') return {status:ownership.status};
      const result=await get('/api/payments?order_no='+encodeURIComponent(order_no),signal);
      if(result.status!=='ok') return result;
      if(!list(validPayment)(result.body) || result.body.some(payment=>payment.order_no!==order_no)) return {status:'invalid_response'};
      return {status:result.body.length?'ok':'empty',payments:result.body.map(paymentView),...(conversationPolicy?{member_id:ownership.order.member_id}:{})};
    }),
    list_order_shipments:action('배송과 집하 스캔 조회. 반환 member_id와 고객 진술을 대조한 뒤 안내. 배송완료와 실제 수령은 구분. 수령 위치 제외.',{order_no:identifier},async({order_no},signal)=>{
      const ownership=await ownedOrder(order_no,signal);
      if(ownership.status!=='ok') return {status:ownership.status};
      const result=await get('/api/shipments?order_no='+encodeURIComponent(order_no),signal);
      if(result.status!=='ok') return result;
      if(!list(validShipment)(result.body) || result.body.some(shipment=>shipment.order_no!==order_no)) return {status:'invalid_response'};
      return {status:result.body.length?'ok':'empty',shipments:result.body.map(shipmentView),...(conversationPolicy?{member_id:ownership.order.member_id}:{})};
    }),
  });
}
