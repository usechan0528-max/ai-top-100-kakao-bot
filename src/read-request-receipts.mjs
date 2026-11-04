// API30/36 receipt confirmation only. No POST, replay, reset or mutation capability.
const origin='https://gyodong-mall-action.aitop100.org';
const id=v=>typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(v);
const stamp=v=>typeof v==='string' && v.length<=40 && Number.isFinite(Date.parse(v));
const record=v=>v!==null && typeof v==='object' && !Array.isArray(v);
const text=v=>typeof v==='string' && v.length<=8000;
const identifier={type:'string',minLength:1,maxLength:100,pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'};

export function createReceiptReadActions({token,testCaseId,fetcher=fetch,beforeCall=async()=>{},getOrder=()=>null,canUseOrder=()=>false}={}) {
  if(typeof token!=='string'||!token||/\s/.test(token)||typeof testCaseId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(testCaseId))return {};
  const permitted=orderNo=>{const order=getOrder(orderNo);return !!order && order.order_no===orderNo && canUseOrder(order)===true;};
  async function get(path,signal) {
    try {
      signal?.throwIfAborted();await beforeCall(signal);signal?.throwIfAborted();
      const response=await fetcher(origin+path,{method:'GET',redirect:'manual',signal,headers:{Authorization:`Bearer ${token}`,'X-Aitop100-Test-Case-Id':testCaseId,Accept:'application/json'}});
      if(response.status!==200)return {status:response.status===404?'not_found_or_route_error':response.status===429?'rate_limited':'unavailable'};
      if(Number(response.headers.get('content-length'))>65536)return {status:'invalid_response'};
      const reader=response.body?.getReader();if(!reader)return {status:'invalid_response'};
      let raw='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
      const abort=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
      try {for(;;){signal?.throwIfAborted();const part=await reader.read();signal?.throwIfAborted();if(part.done)break;
        size+=part.value.byteLength;if(size>65536){void reader.cancel().catch(()=>{});return {status:'invalid_response'};}raw+=decoder.decode(part.value,{stream:true});}
        return {status:'ok',data:JSON.parse(raw+decoder.decode())};
      }finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
    }catch {signal?.throwIfAborted();return {status:'unavailable'};}
  }
  const action=(description,keys,execute)=>{
    const valid=a=>record(a)&&Object.keys(a).length===keys.length&&keys.every(k=>id(a[k]));
    return {kind:'read',description,parameters:{type:'object',properties:Object.fromEntries(keys.map(k=>[k,identifier])),required:keys,additionalProperties:false},
      validate:valid,authorize:a=>valid(a)&&permitted(a.order_no),
      execute:async(a,{signal}={})=>valid(a)&&permitted(a.order_no)?execute(a,signal):{status:'forbidden'}};
  };
  return {
    read_refund_requests:action('먼저 본인 주문을 조회·대조한 뒤 기존 환불 신청만 확인. 재접수 금지. SUBMITTED는 지급 완료가 아니다.', ['order_no'],async({order_no},signal)=>{
      const r=await get('/api/refunds?order_no='+encodeURIComponent(order_no),signal);if(r.status!=='ok')return r;
      if(!permitted(order_no))return {status:'forbidden'};
      if(!Array.isArray(r.data)||r.data.length>100||r.data.some(v=>!record(v)||v.order_no!==order_no||!id(v.refund_id)||v.request_status!=='SUBMITTED'||!stamp(v.requested_at)||!Number.isInteger(v.amount)||v.amount<0))return {status:'invalid_response'};
      return {status:r.data.length?'ok':'empty',order_no,refunds:r.data.map(v=>({receipt_id:v.refund_id,request_status:v.request_status,requested_at:v.requested_at,amount:v.amount})),notice:'기존 신청 조회입니다. 환불 지급 완료가 아닙니다.'};
    }),
    read_escalation_request:action('본인 주문 선조회 후 기존 이관번호 상태만 조회. 해당 주문 연결을 확인하며 새 이관/재접수하지 않는다. 원인·책임·승인 완료 추정 금지.', ['order_no','escalation_id'],async({order_no,escalation_id},signal)=>{
      const r=await get('/api/escalations/'+encodeURIComponent(escalation_id),signal);if(r.status!=='ok')return r;
      if(!permitted(order_no))return {status:'forbidden'};
      const v=r.data;
      if(!record(v)||v.escalation_id!==escalation_id||v.request_status!=='SUBMITTED'||!stamp(v.requested_at)||!['APPROVED','REJECTED','PENDING'].includes(v.status)||!text(v.reason)||!id(v.lane))return {status:'invalid_response'};
      const orderPattern=new RegExp('(?:^|[^A-Za-z0-9_-])'+order_no.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^A-Za-z0-9_-])');
      if(!orderPattern.test(v.reason))return {status:'forbidden'};
      return {status:'ok',order_no,receipt_id:v.escalation_id,request_status:v.request_status,requested_at:v.requested_at,review_status:v.status,lane:v.lane,
        safety:{mold:/곰팡이|부패|MOLD/i.test(v.reason),symptoms:/섭취.?후|증상|배탈|병원/i.test(v.reason)},
        notice:'기존 담당자 확인 신청 조회입니다. 처리 완료가 아니며 회신 기한은 업무 정책과 시나리오 날짜를 확인하세요.'};
    }),
  };
}
