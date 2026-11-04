import { AgentError } from './errors.mjs';
import { escalationGuidance } from './submission-response.mjs';
const identifier=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
const nonempty=value=>typeof value==='string' && value.trim().length>0 && value.length<=2000;
const sameKeys=(value,keys)=>value && typeof value==='object' && !Array.isArray(value) &&
  Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
const string={type:'string',minLength:1,maxLength:2000};

// Policy evidence is an explicit model review, not a claim of independent authorization.
// Runtime additionally requires a successful order read and checks the refund ceiling.
export function createRequestActions({token,testCaseId,fetcher=fetch,beforeCall=async()=>{},getOrder=()=>null,onSubmitted=()=>{}}) {
  const make=(path,fields,idKey,validateBody,authorize)=>{
    const properties={...fields,policy_basis:{...string,description:'적용 규정·기한·권한·예외와 고객 요청 확인 근거. 추정 금액 금지.'}};
    const validate=args=>sameKeys(args,Object.keys(properties)) && nonempty(args.policy_basis) && validateBody(args);
    return {kind:'write',description:`${path} 신청 접수. 호출 전 정책·고객 요청·권한 확인. 성공도 신청 접수이며 처리 완료가 아니다.`,
      parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},
      validate,authorize:args=>validate(args) && authorize(args),
      idempotencyArgs:args=>{const {policy_basis,ownership_confirmed,...body}=args;return body;},
      execute:async(args,{signal}={})=>{
        if(!validate(args) || !authorize(args)) throw new AgentError('ACTION_NOT_EXECUTED');
        try {await beforeCall(signal);signal?.throwIfAborted();}
        catch {throw new AgentError('ACTION_NOT_EXECUTED');}
        const {policy_basis,ownership_confirmed,...body}=args;
        // No automatic retry: a timeout or ambiguous response locks subsequent writes.
        const response=await fetcher('https://gyodong-mall-action.aitop100.org'+path,{
          method:'POST',redirect:'manual',signal,headers:{'Content-Type':'application/json',Accept:'application/json',
            Authorization:`Bearer ${token}`,'X-Aitop100-Test-Case-Id':testCaseId},body:JSON.stringify(body)});
        let data;
        const reader=response.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();
        if(reader) try {for(;;){signal?.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;
          size+=chunk.value.byteLength;if(size>16384){await reader.cancel();throw new Error('INVALID_RECEIPT');}raw+=decoder.decode(chunk.value,{stream:true});}
          raw+=decoder.decode();data=JSON.parse(raw);
        } finally {reader.releaseLock();}
        if(response.status===400 && ['MISSING_TEST_CASE_ID','INVALID_TEST_CASE_ID'].includes(data?.code)) throw new AgentError('ACTION_NOT_EXECUTED');
        if(response.status!==200 || !identifier(data?.[idKey]) || data.request_status!=='SUBMITTED' ||
          typeof data.requested_at!=='string' || !Number.isFinite(Date.parse(data.requested_at)) ||
          (path==='/api/refunds' && data.order_no!==body.order_no)) throw new Error('UNKNOWN_REQUEST_OUTCOME');
        onSubmitted(path==='/api/refunds'?{kind:'refund',receipt_id:data[idKey],amount:body.amount}:
          {kind:'escalation',receipt_id:data[idKey],guidance:escalationGuidance(body.reason,body.lane)});
        return {status:'SUBMITTED',receipt_id:data[idKey],requested_at:data.requested_at,
          notice:'신청 접수입니다. 실제 환불·처리·승인 완료가 아닙니다.'};
      }};
  };
  return {
    request_refund:make('/api/refunds',{order_no:{type:'string'},amount:{type:'integer',minimum:1,maximum:2147483647},reason:string,
      ownership_confirmed:{type:'boolean',const:true}},'refund_id',
      a=>identifier(a.order_no) && Number.isInteger(a.amount) && a.amount>0 && a.amount<=2147483647 && nonempty(a.reason) && a.ownership_confirmed===true,
      a=>{const order=getOrder(a.order_no);return !!order && a.amount<=order.amount;}),
    request_escalation:make('/api/escalations',{lane:string,reason:string},'escalation_id',a=>nonempty(a.lane)&&nonempty(a.reason),()=>true),
  };
}
