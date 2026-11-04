// Server-side resolver. Model tools must wrap it with customer-input evidence checks.
// Sources: docs/sources/member-link-research/L-40.md; actions.json API-12/13, Members.
// trustedAccountName is the legacy parameter name. The optional operator session
// supplies trusted ingress; member-actions supplies conversation evidence under
// the user's V-018 evaluation policy. A match is not independent authentication.
const ORIGIN='https://gyodong-mall-action.aitop100.org';
const id=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
const text=value=>typeof value==='string' && value.length<=1024;
const nullable=valid=>value=>value===null || valid(value);
const date=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const fields={member_id:id,name:text,phone:text,birth_year:Number.isSafeInteger,
  member_type:value=>['INDIVIDUAL','BUSINESS','GROUP_BUY_OPERATOR'].includes(value),
  grade:value=>['MEMBER','REGULAR'].includes(value),status:value=>['ACTIVE','WITHDRAWAL_REQUESTED','WITHDRAWN'].includes(value),
  address:nullable(text),joined_at:date,referred_by_member_id:nullable(id)};
const validMember=value=>value!==null && typeof value==='object' && !Array.isArray(value) &&
  Reflect.ownKeys(value).length===Object.keys(fields).length && Object.entries(fields).every(([key,valid])=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor && Object.hasOwn(descriptor,'value') && valid(descriptor.value);
  });

// Formatting normalization only. Partial/masked phone values never authenticate.
export function normalizeFullPhone(value) {
  if(typeof value!=='string' || value.length>40 || !/^[+\d\s()\-]+$/.test(value)) return null;
  let digits=value.replace(/[\s()\-]/g,'');
  if(digits.startsWith('+82')) digits='0'+digits.slice(3);
  return /^0[1-9]\d{7,9}$/.test(digits) ? digits : null;
}

async function boundedJson(response,signal) {
  const declared=response.headers.get('content-length');
  if(declared && (!/^\d+$/.test(declared) || Number(declared)>65536)) {void response.body?.cancel().catch(()=>{});throw new Error('INVALID_RESPONSE');}
  if(!response.body) return null;
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  let size=0,raw='';
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try {
    for(;;) {
      signal?.throwIfAborted();const {value,done}=await reader.read();signal?.throwIfAborted();
      if(done) break;
      size+=value.byteLength;
      if(size>65536) {void reader.cancel().catch(()=>{});throw new Error('INVALID_RESPONSE');}
      raw+=decoder.decode(value,{stream:true});
    }
    raw+=decoder.decode();return raw ? JSON.parse(raw) : null;
  } finally {signal?.removeEventListener('abort',abort);reader.releaseLock();}
}

export async function resolveMember({token,testCaseId,trustedAccountName,providedPhone,knownMemberId,fetcher=fetch,beforeCall=async()=>{},signal}={}) {
  signal ??= AbortSignal.timeout(12000);
  signal?.throwIfAborted();
  const phone=normalizeFullPhone(providedPhone);
  if(!phone || typeof trustedAccountName!=='string' || !trustedAccountName.trim() || trustedAccountName!==trustedAccountName.trim() ||
    trustedAccountName.length>100 || /[\u0000-\u001f\u007f]/.test(trustedAccountName) ||
    (knownMemberId!==undefined && !id(knownMemberId)) || typeof token!=='string' || !token || token.length>4096 || /\s/.test(token) ||
    typeof testCaseId!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(testCaseId) || typeof fetcher!=='function' || typeof beforeCall!=='function')
    return {status:'unresolved'};
  const path=knownMemberId ? '/api/members/'+encodeURIComponent(knownMemberId) : '/api/members?name='+encodeURIComponent(trustedAccountName);
  let response,body;
  try {
    await beforeCall(signal);signal?.throwIfAborted();
    response=await fetcher(ORIGIN+path,{method:'GET',redirect:'manual',signal,
      headers:{Authorization:`Bearer ${token}`,'X-Aitop100-Test-Case-Id':testCaseId,Accept:'application/json'}});
    signal?.throwIfAborted();
  } catch {signal?.throwIfAborted();return {status:'unavailable'};}
  try {body=await boundedJson(response,signal);}
  catch {signal?.throwIfAborted();return {status:'invalid_response'};}
  if(response.status!==200) {
    if(response.status===400) return {status:['MISSING_TEST_CASE_ID','INVALID_TEST_CASE_ID'].includes(body?.code)?'invalid_test_case':'invalid_request'};
    if(response.status===401) return {status:'unauthorized'};
    if(response.status===403) return {status:'forbidden'};
    if(response.status===404) return {status:'not_found_or_route_error'};
    if(response.status===429) {
      if(body?.message==='누적 API 호출 한도를 초과했습니다.') return {status:'quota_exhausted'};
      const retry=response.headers.get('retry-after');
      return {status:'rate_limited',...(/^\d+$/.test(retry??'') && Number.isSafeInteger(Number(retry)) && Number(retry)<=2147483647?{retryAfterSeconds:Number(retry)}:{})};
    }
    return {status:'unavailable'};
  }
  const candidates=knownMemberId ? [body] : body;
  if(!Array.isArray(candidates) || candidates.length>200 || !candidates.every(validMember) ||
    (knownMemberId && candidates[0].member_id!==knownMemberId)) return {status:'invalid_response'};
  const matches=candidates.filter(candidate=>candidate.name===trustedAccountName && normalizeFullPhone(candidate.phone)===phone);
  if(matches.length===0) return {status:'no_match'};
  if(matches.length!==1) return {status:'ambiguous'};
  if(matches[0].status!=='ACTIVE') return {status:'inactive'};
  return {status:'matched',memberId:matches[0].member_id};
}
