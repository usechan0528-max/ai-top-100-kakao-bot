import { AgentError } from './errors.mjs';

const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const str = {type:'string', minLength:1, maxLength:2000};
const confirmed = {type:'boolean', const:true};
const dateTime = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  return Number.isFinite(Date.parse(value)) && new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10) === value.slice(0,10);
};

// Review booleans record the model's policy review, not independent authentication.
// Read evidence callbacks must be supplied by the server, never by tool arguments.
export function createCustomerRequestActions({token,testCaseId,fetcher=fetch,beforeCall=async()=>{},
  getOrder=()=>null,getShipments=()=>null,getPayment=()=>null,onSubmitted=()=>{},canUseOrder=()=>true}={}) {
  if (typeof token!=='string' || !token || /\s/.test(token) || token.length>4096 ||
      typeof testCaseId!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(testCaseId)) return {};
  const make = (description, fields, valid, eligible, path, body, targetKey) => {
    const properties={...fields,policy_basis:str,ownership_confirmed:confirmed,target_confirmed:confirmed};
    const validate=a=>exact(a,Object.keys(properties)) && text(a.policy_basis) &&
      a.ownership_confirmed===true && a.target_confirmed===true && valid(a);
    const authorize=a=>validate(a) && eligible(a)===true;
    return {kind:'write',description,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},
      validate,authorize,idempotencyArgs:a=>({[targetKey]:a[targetKey],...body(a)}),execute:async(a,{signal}={})=>{
        if(!authorize(a)) throw new AgentError('ACTION_NOT_EXECUTED');
        try {signal?.throwIfAborted();await beforeCall(signal);signal?.throwIfAborted();}
        catch {throw new AgentError('ACTION_NOT_EXECUTED');}
        const response=await fetcher('https://gyodong-mall-action.aitop100.org'+path(a),{
          method:'POST',redirect:'manual',signal,
          headers:{Authorization:`Bearer ${token}`,'X-Aitop100-Test-Case-Id':testCaseId,'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify(body(a))});
        const reader=response.body?.getReader();let raw='',size=0;
        const decoder=new TextDecoder('utf-8',{fatal:true});
        const abort=()=>{void reader?.cancel().catch(()=>{});};
        signal?.addEventListener('abort',abort,{once:true});
        try {
          if(reader) for(;;){signal?.throwIfAborted();const chunk=await reader.read();signal?.throwIfAborted();if(chunk.done)break;
            size+=chunk.value.byteLength;if(size>16384){void reader.cancel().catch(()=>{});throw new Error('UNKNOWN_REQUEST_OUTCOME');}
            raw+=decoder.decode(chunk.value,{stream:true});}
          raw+=decoder.decode();
        } finally {signal?.removeEventListener('abort',abort);reader?.releaseLock();}
        let data;try{data=JSON.parse(raw);}catch{throw new Error('UNKNOWN_REQUEST_OUTCOME');}
        if(response.status===400 && ['MISSING_TEST_CASE_ID','INVALID_TEST_CASE_ID'].includes(data?.code)) throw new AgentError('ACTION_NOT_EXECUTED');
        if(response.status!==200 || !exact(data,['request_id',targetKey,'request_status','requested_at']) ||
          !id(data.request_id) || data[targetKey]!==a[targetKey] || data.request_status!=='SUBMITTED' || !dateTime(data.requested_at))
          throw new Error('UNKNOWN_REQUEST_OUTCOME');
        const result={status:'SUBMITTED',receipt_id:data.request_id,requested_at:data.requested_at,
          notice:'요청 접수이며 실제 변경·발행 완료가 아닙니다.'};
        onSubmitted({kind:targetKey==='order_no'?'address_change':'cash_receipt',receipt_id:data.request_id,
          ...(targetKey==='approval_no'?{purpose:a.receipt_purpose}:{})});
        return result;
      }};
  };
  return {
    request_address_change:make('고객이 확인한 대상 주문과 상세주소로 배송지 변경 요청. 먼저 해당 주문 배송 조회 필요. 정상 빈 목록은 집하 전 명시 근거가 있는 경우만 사용.',
      {order_no:str,new_address:str,address_confirmed:confirmed,pre_pickup_basis:str},
      a=>id(a.order_no)&&text(a.new_address)&&a.address_confirmed===true&&text(a.pre_pickup_basis),
      a=>{const order=getOrder(a.order_no),s=getShipments(a.order_no);
        return !!order && canUseOrder(order)===true && ['PAID','CONFIRMED'].includes(order.status) && !!s &&
          ['ok','empty'].includes(s.status) && Array.isArray(s.shipments) &&
          s.shipments.every(row=>row.order_no===a.order_no && row.status==='READY' && row.picked_up_at===null);},
      a=>`/api/orders/${encodeURIComponent(a.order_no)}/address-change-requests`,a=>({new_address:a.new_address}),'order_no'),
    request_cash_receipt:make('대상 주문·결제 조회 후 현금영수증 발행 요청. 발행구분·고객번호·기한·현금/이체 적격성을 확인. 발행구분은 API 본문 필드가 아니며 실제 발행 완료를 보장하지 않음.',
      {order_no:str,approval_no:str,receipt_number:str,receipt_purpose:{type:'string',enum:['income_deduction','expense_evidence']},
        eligibility_confirmed:confirmed,deadline_confirmed:confirmed},
      a=>id(a.order_no)&&id(a.approval_no)&&text(a.receipt_number)&&['income_deduction','expense_evidence'].includes(a.receipt_purpose)&&
        a.eligibility_confirmed===true&&a.deadline_confirmed===true,
      a=>{const o=getOrder(a.order_no),p=getPayment(a.approval_no);
        return !!o && canUseOrder(o)===true && !!p && o.payment_refs?.includes(a.approval_no) && p.order_no===a.order_no && p.approval_no===a.approval_no &&
          // BANK_TRANSFER observed for public L-05 by the coordinated API verification.
          p.status==='APPROVED' && p.amount>0 && ['BANK_TRANSFER','현금','계좌이체','무통장입금','계좌이체(무통장입금)'].includes(p.pay_method);},
      a=>`/api/payments/${encodeURIComponent(a.approval_no)}/cash-receipt-requests`,a=>({receipt_number:a.receipt_number}),'approval_no'),
  };
}

// One invocation/message only: no addresses or payment numbers are persisted.
// Failed refreshes remove prior successful evidence before any following write.
export function attachCustomerRequestActions(reads, config) {
  const orders=new Map(),shipments=new Map(),payments=new Map();
  const wrapped=Object.fromEntries(Object.entries(reads).map(([name,action])=>[name,{...action,execute:async(args,options)=>{
    const invalidateOrder=()=>{if(args.order_no){orders.delete(args.order_no);shipments.delete(args.order_no);
      for(const [key,p] of payments)if(p.order_no===args.order_no)payments.delete(key);}};
    if(name==='read_order')invalidateOrder();
    if(name==='list_order_shipments')shipments.delete(args.order_no);
    if(name==='list_order_payments')for(const [key,p] of payments)if(p.order_no===args.order_no)payments.delete(key);
    if(args.approval_no)payments.delete(args.approval_no);
    if(name==='list_my_orders'){orders.clear();shipments.clear();payments.clear();}
    let result;try{result=await action.execute(args,options);}catch(error){invalidateOrder();throw error;}
    if(result.status==='ok'||result.status==='empty') {
      if(result.order)orders.set(result.order.order_no,result.order);
      for(const o of result.orders??[])orders.set(o.order_no,o);
      if(result.payment)payments.set(result.payment.approval_no,result.payment);
      for(const p of result.payments??[])payments.set(p.approval_no,p);
      if(name==='list_order_shipments')shipments.set(args.order_no,result);
    } else invalidateOrder();
    return result;
  }}]));
  // Some read clients return only shipments/payment after their internal order check.
  // Keep explicit order reads required unless that check also returns safe order evidence.
  return {...wrapped,...createCustomerRequestActions({...config,getOrder:key=>orders.get(key),
    getShipments:key=>shipments.get(key),getPayment:key=>payments.get(key)})};
}

export function submittedCustomerRequestText(writes, receipts) {
  const successful=new Set(writes.filter(w=>w.outcome==='success').map(w=>w.name));
  const lines=[];
  for(const receipt of receipts) {
    if(!id(receipt.receipt_id))continue;
    if(receipt.kind==='address_change' && successful.has('request_address_change'))
      lines.push(`배송지 변경 요청이 접수됐습니다. 접수번호 ${receipt.receipt_id}.`);
    if(receipt.kind==='cash_receipt' && successful.has('request_cash_receipt'))
      lines.push(`${receipt.purpose==='income_deduction'?'소득공제용':receipt.purpose==='expense_evidence'?'지출증빙용':''} 현금영수증 발행 요청이 접수됐습니다. 접수번호 ${receipt.receipt_id}.`);
  }
  if(!lines.length)return null;
  if(successful.has('request_refund'))lines.push('환불 신청도 접수됐습니다.');
  if(successful.has('request_escalation'))lines.push('담당자 확인 신청도 접수됐습니다.');
  return [...new Set(lines),'실제 변경·발행·환불·승인 완료를 뜻하지 않습니다.'].join(' ');
}
