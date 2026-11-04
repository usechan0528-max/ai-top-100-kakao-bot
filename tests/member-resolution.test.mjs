import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMember } from '../src/member-resolution.mjs';

const member=(changes={})=>({member_id:'MB-TEST01',name:'검증사용자',phone:'010-1234-5678',birth_year:1987,
  member_type:'INDIVIDUAL',grade:'MEMBER',status:'ACTIVE',address:'PRIVATE_ADDRESS',joined_at:'2037-03-02',
  referred_by_member_id:'MB-PRIVATE_REFERRER',...changes});
const base={token:'aitop100_synthetic_test',testCaseId:'L-40',trustedAccountName:'검증사용자',providedPhone:'01012345678'};
function harness(responses,options={}) {
  const calls=[],before=[];
  const resolve=(overrides={})=>resolveMember({...base,beforeCall:async signal=>before.push(signal),
    fetcher:async(url,init)=>{calls.push({url:new URL(url),init});assert.ok(responses.length,'unexpected HTTP call');
      const value=responses.shift();if(value instanceof Error)throw value;
      return value instanceof Response?value:Response.json(value);},...options,...overrides});
  return {calls,before,resolve};
}

test('API13 uses trusted exact name, fixed host, GET and TC; returns member id only',async()=>{
  const h=harness([[member()]]);const result=await h.resolve();
  assert.deepEqual(result,{status:'matched',memberId:'MB-TEST01'});
  const {url,init}=h.calls[0];
  assert.equal(url.origin,'https://gyodong-mall-action.aitop100.org');assert.equal(url.pathname,'/api/members');
  assert.deepEqual([...url.searchParams],[['name',base.trustedAccountName]]);
  assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(init.body,undefined);
  const headers=new Headers(init.headers);assert.equal(headers.get('Authorization'),`Bearer ${base.token}`);
  assert.equal(headers.get('X-Aitop100-Test-Case-Id'),'L-40');assert.equal(h.before.length,1);
  for(const field of ['name','phone','address','birth_year','grade','referred_by_member_id'])assert.equal(result[field],undefined);
  for(const value of [base.token,base.trustedAccountName,'010','PRIVATE_ADDRESS','1987','PRIVATE_REFERRER'])
    assert.ok(!JSON.stringify(result).includes(value));
});

test('known member uses API12 but still requires exact name and full phone',async()=>{
  const h=harness([member()]);assert.deepEqual(await h.resolve({knownMemberId:'MB-TEST01'}),{status:'matched',memberId:'MB-TEST01'});
  assert.equal(h.calls[0].url.pathname,'/api/members/MB-TEST01');assert.equal(h.calls[0].url.search,'');
});

test('domestic full phone accepts formatting and international +82 equivalent',async()=>{
  for(const providedPhone of ['010-1234-5678','010 1234 5678','(010)1234-5678','+82 10-1234-5678']) {
    const h=harness([[member()]]);assert.equal((await h.resolve({providedPhone})).status,'matched');
  }
});

test('missing, masked, last-four and partial phone never trigger member lookup',async()=>{
  for(const providedPhone of [undefined,null,'','5678','010-****-5678','010xxxx5678','0101234','번호:01012345678']) {
    const h=harness([]);assert.equal((await h.resolve({providedPhone})).status,'unresolved');assert.equal(h.calls.length,0);
  }
});

test('missing account name, token and malformed TC or known id fail before HTTP',async()=>{
  for(const override of [{trustedAccountName:''},{trustedAccountName:undefined},{token:''},{testCaseId:'bad\nTC'},
    {knownMemberId:'../other'},{knownMemberId:'x?phone=1'}]) {
    const h=harness([]);assert.notEqual((await h.resolve(override)).status,'matched');assert.equal(h.calls.length,0);
  }
});

test('name is URL encoded without introducing an extra search parameter',async()=>{
  const trustedAccountName='검증&name=타인';
  const h=harness([[]]);await h.resolve({trustedAccountName});
  if(h.calls.length)assert.deepEqual([...h.calls[0].url.searchParams],[['name',trustedAccountName]]);
});

test('exact full phone selects one candidate among same-name customers',async()=>{
  const h=harness([[member({member_id:'MB-OTHER',phone:'010-9999-5678'}),member()]]);
  assert.deepEqual(await h.resolve(),{status:'matched',memberId:'MB-TEST01'});
});

test('two matching candidates are ambiguous and expose neither member',async()=>{
  const h=harness([[member(),member({member_id:'MB-TEST02'})]]);
  assert.deepEqual(await h.resolve(),{status:'ambiguous'});
});

test('empty search, different full phone or different name never match',async()=>{
  for(const rows of [[],[member({phone:'010-9999-5678'})],[member({name:'다른사용자'})]]) {
    const h=harness([rows]);assert.deepEqual(await h.resolve(),{status:'no_match'});
  }
});

test('known member response with another id cannot grant that membership',async()=>{
  const h=harness([member({member_id:'MB-OTHER'})]);
  assert.deepEqual(await h.resolve({knownMemberId:'MB-TEST01'}),{status:'invalid_response'});
});

test('withdrawn and withdrawal-requested members do not create an active binding',async()=>{
  for(const status of ['WITHDRAWN','WITHDRAWAL_REQUESTED']) {
    const h=harness([[member({status})]]);assert.deepEqual(await h.resolve(),{status:'inactive'});
  }
});

test('incomplete, extra, wrong-type, invalid date or enum member data fails closed',async()=>{
  const missing=member();delete missing.member_id;
  for(const record of [missing,member({birth_year:'1987'}),member({status:'UNKNOWN'}),member({extra:'PRIVATE'}),
    member({joined_at:'2037-02-30'}),member({member_type:'UNKNOWN'}),member({grade:'UNKNOWN'})]) {
    const h=harness([[record]]);assert.deepEqual(await h.resolve(),{status:'invalid_response'});
  }
});

test('API12/13 response shapes must be an object/array respectively',async()=>{
  for(const [response,overrides] of [[member(),{}],[[member()],{knownMemberId:'MB-TEST01'}],[null,{}]]) {
    const h=harness([Response.json(response)]);assert.deepEqual(await h.resolve(overrides),{status:'invalid_response'});
  }
});

test('redirect, 404 and server errors never leak candidate or raw error details',async()=>{
  for(const code of [302,400,401,403,404,429,500,503]) {
    const h=harness([new Response(JSON.stringify({message:'PRIVATE_ERROR',phone:'01012345678'}),{status:code,headers:{Location:'https://evil.test'}})]);
    const result=await h.resolve();assert.notEqual(result.status,'matched');assert.equal(h.calls.length,1);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_ERROR'));assert.ok(!JSON.stringify(result).includes('01012345678'));
  }
});

test('malformed and oversized body fail without reflecting server content',async()=>{
  for(const response of [new Response('{bad'),new Response('가'.repeat(23000)),new Response('{}',{headers:{'Content-Length':'999999'}})]) {
    const h=harness([response]);assert.deepEqual(await h.resolve(),{status:'invalid_response'});
  }
});

test('budget failure and pre-aborted signal prevent HTTP calls',async()=>{
  const h=harness([],{beforeCall:async()=>{throw new Error('budget');}});
  try{await h.resolve();}catch{}assert.equal(h.calls.length,0);
  const aborted=harness([]),controller=new AbortController();controller.abort();
  try{await aborted.resolve({signal:controller.signal});}catch{}assert.equal(aborted.calls.length,0);
});

test('caller timeout cancels a stalled body and produces no partial identity',async()=>{
  let canceled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('['));},cancel(){canceled=true;}});
  const h=harness([new Response(stream)]),controller=new AbortController();
  const pending=h.resolve({signal:controller.signal});
  const timer=setTimeout(()=>controller.abort(),20);
  try{const result=await pending;assert.notEqual(result.status,'matched');assert.equal(result.memberId,undefined);}
  catch(error){assert.ok(error instanceof Error);}finally{clearTimeout(timer);}
  assert.equal(canceled,true);assert.equal(h.calls.length,1);
});
