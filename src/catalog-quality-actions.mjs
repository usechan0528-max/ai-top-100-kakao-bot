// Read-only API-01/03/04/06/20. Source: docs/sources/action-api/actions.json.
// Scope TC is supplied by the server. This module never grants customer order access.
const ORIGIN='https://gyodong-mall-action.aitop100.org';
const id=v=>typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(v);
const text=v=>typeof v==='string' && v.length<=4096;
const integer=Number.isSafeInteger;
const nullable=f=>v=>v===null || f(v);
const list=f=>v=>Array.isArray(v) && v.length<=200 && v.every(f);
const oneOf=values=>v=>values.includes(v);
const date=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const time=v=>typeof v==='string' && v.length<=40 && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v) && date(v.slice(0,10)) && Number.isFinite(Date.parse(v));
const shape=fields=>v=>v!==null && typeof v==='object' && !Array.isArray(v) && Reflect.ownKeys(v).length===Object.keys(fields).length && Object.entries(fields).every(([key,valid])=>{
  const d=Object.getOwnPropertyDescriptor(v,key);return d && Object.hasOwn(d,'value') && valid(d.value);
});
const grade=oneOf(['PREMIUM','STANDARD','FAIR','IMPERFECT','REJECT']);
const product=shape({sku:id,name:text,origin:text,variety:nullable(text),listed_weight:text,grade:nullable(list(grade)),price:integer,sale_state:oneOf(['ON_SALE','PREORDER','SOLD_OUT','CLOSED'])});
const lot=shape({lot_id:id,sku:id,packed_at:time,measured_weight_g:integer,measured_brix:nullable(v=>typeof v==='number'&&Number.isFinite(v)),grade,qty_in_stock:integer,status:oneOf(['ACTIVE','HOLD','DISPOSED']),sprayed_at:nullable(date)});
const investigation=shape({lot_id:id,status:oneOf(['IN_PROGRESS','CLOSED']),symptom:oneOf(['BLACK_HEART','MOLD']),liability:oneOf(['DISTRIBUTION','PRODUCTION','CARRIER',null]),finding:nullable(text),disclosure_approved:nullable(v=>typeof v==='boolean'),opened_at:time,closed_at:nullable(time)});
const ticket=shape({ticket_id:id,member_id:id,lot_id:nullable(id),created_at:time,content:text,handler:text});
const promotion=shape({code:id,name:text,benefit_type:oneOf(['RATE','AMOUNT']),benefit_value:integer,valid_from:date,valid_until:nullable(date),target_skus:nullable(list(id)),stackable_with:list(oneOf(['DISCOUNT_CODE','REWARD_COUPON','POINTS']))});

async function boundedBody(response,signal) {
  const declared=response.headers.get('content-length');
  if(declared && (!/^\d+$/.test(declared) || Number(declared)>65536)) {void response.body?.cancel().catch(()=>{});throw new Error('INVALID_RESPONSE');}
  if(!response.body) return {body:null,empty:true};
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,raw='';
  const abort=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try {
    for(;;) {
      signal?.throwIfAborted();const {value,done}=await reader.read();signal?.throwIfAborted();if(done) break;
      size+=value.byteLength;if(size>65536){void reader.cancel().catch(()=>{});throw new Error('INVALID_RESPONSE');}
      raw+=decoder.decode(value,{stream:true});
    }
    raw+=decoder.decode();return {body:raw?JSON.parse(raw):null,empty:raw.length===0};
  } finally {signal?.removeEventListener('abort',abort);reader.releaseLock();}
}

export function createCatalogQualityActions({token,testCaseId,fetcher=fetch,beforeCall=async()=>{}}={}) {
  if(typeof token!=='string'||!token||token.length>4096||/\s/.test(token)||typeof testCaseId!=='string'||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(testCaseId)||typeof fetcher!=='function'||typeof beforeCall!=='function') return Object.freeze({});
  const lotEvidence=new Map(),lotVersions=new Map();
  async function get(path,signal,{empty404=false}={}) {
    let response,body,emptyBody;
    try {
      signal?.throwIfAborted();await beforeCall(signal);signal?.throwIfAborted();
      response=await fetcher(ORIGIN+path,{method:'GET',redirect:'manual',signal,headers:{Authorization:`Bearer ${token}`,'X-Aitop100-Test-Case-Id':testCaseId,Accept:'application/json'}});
      signal?.throwIfAborted();
    } catch {signal?.throwIfAborted();return {status:'unavailable'};}
    try {const parsed=await boundedBody(response,signal);body=parsed.body;emptyBody=parsed.empty;} catch {signal?.throwIfAborted();return {status:'invalid_response'};}
    if(response.status===200) return {status:'ok',body};
    if(response.status===400) return {status:['MISSING_TEST_CASE_ID','INVALID_TEST_CASE_ID'].includes(body?.code)?'invalid_test_case':'invalid_request'};
    if(response.status===401) return {status:'unauthorized'};
    if(response.status===403) return {status:'forbidden'};
    if(response.status===404) return {status:empty404&&emptyBody&&!response.redirected&&(!response.url||response.url===ORIGIN+path)?'empty':'not_found_or_route_error'};
    if(response.status===429) {
      if(body?.message==='누적 API 호출 한도를 초과했습니다.') return {status:'quota_exhausted'};
      const retry=response.headers.get('retry-after');return {status:'rate_limited',...(/^\d+$/.test(retry??'')&&Number.isSafeInteger(Number(retry))&&Number(retry)<=2147483647?{retryAfterSeconds:Number(retry)}:{})};
    }
    return {status:'unavailable'};
  }
  const action=(key,description,execute)=>{
    const valid=shape({[key]:id});return Object.freeze({kind:'read',description,
      parameters:{type:'object',properties:{[key]:{type:'string',minLength:1,maxLength:100,pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'}},required:[key],additionalProperties:false},
      validate:valid,authorize:()=>true,execute:async(args,{signal}={})=>valid(args)?execute(args[key],signal):{status:'invalid_request'}});
  };
  const single=async(path,key,target,valid,resultKey,project,signal)=>{
    const result=await get(path,signal);if(result.status!=='ok') return result;
    if(!valid(result.body)||result.body[key]!==target) return {status:'invalid_response'};
    return {status:'ok',[resultKey]:project(result.body)};
  };
  return Object.freeze({
    read_product:action('sku','상품 SKU의 실제 가격·판매상태·규격 조회. 가격 인하 이력/정상가 정책 자체를 증명하지 않습니다.',(sku,signal)=>single('/api/products/'+encodeURIComponent(sku),'sku',sku,product,'product',v=>v,signal)),
    read_lot:action('lot_id','확인한 로트의 실측 중량·당도·등급·상태 조회. 임의의 다른 고객 주문 연결이나 안전 판정을 하지 않습니다.',async(lotId,signal)=>{
      const version=Symbol();lotVersions.set(lotId,version);lotEvidence.delete(lotId);
      const result=await single('/api/lots/'+encodeURIComponent(lotId),'lot_id',lotId,lot,'lot',v=>v,signal);
      if(result.status==='ok'&&lotVersions.get(lotId)===version)lotEvidence.set(lotId,version);
      return result;
    }),
    read_lot_investigation:action('lot_id','로트 조사 조회. 공개 승인 없는 finding/책임 제외. 같은 실행에서 로트 존재 확인 후 정식 경로 빈404만 조사 항목 미반환으로 안내하며 원인·안전 확정이 아닙니다.',async(lotId,signal)=>{
      const evidence=lotEvidence.get(lotId);
      const result=await get('/api/lots/'+encodeURIComponent(lotId)+'/investigation',signal,{empty404:!!evidence});
      if(result.status==='empty')return lotEvidence.get(lotId)===evidence?
        {status:'empty',investigation:null,lot_id:lotId,notice:'확인한 로트에 조사 항목이 반환되지 않았습니다. 원인·안전 확정이 아닙니다.'}:{status:'not_found_or_route_error'};
      if(result.status!=='ok')return result;
      if(!investigation(result.body)||result.body.lot_id!==lotId)return {status:'invalid_response'};
      const {finding,liability,...safe}=result.body;
      return {status:'ok',investigation:result.body.disclosure_approved===true?{...safe,finding,liability}:safe};
    }),
    list_lot_claims:action('lot_id','로트별 상담 이력을 조회하여 비식별 건수와 명시된 증상 언급만 집계합니다. 타 고객 원문/신원은 반환하지 않으며 집계는 하자 확정·독립 피해자 수가 아닙니다.',async(lotId,signal)=>{
      const result=await get('/api/tickets?lot_id='+encodeURIComponent(lotId),signal);if(result.status!=='ok') return result;
      const rows=result.body;if(!list(ticket)(rows)||rows.some(row=>row.lot_id!==lotId)||new Set(rows.map(row=>row.ticket_id)).size!==rows.length) return {status:'invalid_response'};
      return {status:rows.length?'ok':'empty',claims:{lot_id:lotId,ticketCount:rows.length,distinctReporterCount:new Set(rows.map(row=>row.member_id)).size,
        symptomMentionCounts:{mold:rows.filter(row=>/곰팡이|\bMOLD\b/i.test(row.content)).length,blackHeart:rows.filter(row=>/\bBLACK_HEART\b|흑심/i.test(row.content)).length},
        interpretation:'Counts describe matching records and literal symptom mentions, not confirmed defects or unique incidents.'}};
    }),
    read_promotion:action('code','등록 프로모션의 기간·대상 SKU·혜택·중복 가능 유형 조회. 발급/사용 성공이나 임의 혜택 생성이 아닙니다.',(code,signal)=>single('/api/promos/'+encodeURIComponent(code),'code',code,promotion,'promotion',v=>v,signal)),
  });
}
