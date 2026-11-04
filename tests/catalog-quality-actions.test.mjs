import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogQualityActions} from '../src/catalog-quality-actions.mjs';
const config={token:'fake-secret-token',testCaseId:'TEST-CATALOG'};
const product={sku:'SKU-1',name:'상품',origin:'산지',variety:null,listed_weight:'8kg',grade:['STANDARD'],price:27900,sale_state:'ON_SALE'};
const lot={lot_id:'LOT-1',sku:'SKU-1',packed_at:'2037-06-24T08:00:00+09:00',measured_weight_g:8000,measured_brix:10.5,grade:'STANDARD',qty_in_stock:3,status:'ACTIVE',sprayed_at:null};
const investigation={lot_id:'LOT-1',status:'CLOSED',symptom:'MOLD',liability:'PRODUCTION',finding:'검토 결과',disclosure_approved:true,opened_at:'2037-06-24T08:00:00Z',closed_at:'2037-06-25T08:00:00Z'};
const promo={code:'CODE-1',name:'할인',benefit_type:'RATE',benefit_value:15,valid_from:'2037-06-26',valid_until:'2037-07-03',target_skus:['SKU-1'],stackable_with:['REWARD_COUPON','POINTS']};
const ticket=(n,content='곰팡이 신고',member='MB-1')=>({ticket_id:'T-'+n,member_id:member,lot_id:'LOT-1',created_at:'2037-06-24T08:00:00Z',content,handler:'개인 담당자'});
const setup=body=>createCatalogQualityActions({...config,fetcher:async()=>Response.json(body)});

test('catalog factory exposes five read-only typed tools and no configured identity guessing',()=>{
  assert.deepEqual(Object.keys(setup(product)).sort(),['list_lot_claims','read_lot','read_lot_investigation','read_product','read_promotion']);
  for(const action of Object.values(setup(product))) {assert.equal(action.kind,'read');assert.equal(action.parameters.additionalProperties,false);}
  assert.deepEqual(createCatalogQualityActions({token:'fake'}),{});
});
test('all five routes GET on fixed host and trusted TC with beforeCall and signal',async()=>{
  const calls=[],signal=new AbortController().signal;let before=0;
  const rows=[['read_product',{sku:'SKU-1'},'/api/products/SKU-1',product,'product'],['read_lot',{lot_id:'LOT-1'},'/api/lots/LOT-1',lot,'lot'],['read_lot_investigation',{lot_id:'LOT-1'},'/api/lots/LOT-1/investigation',investigation,'investigation'],['list_lot_claims',{lot_id:'LOT-1'},'/api/tickets?lot_id=LOT-1',[],'claims'],['read_promotion',{code:'CODE-1'},'/api/promos/CODE-1',promo,'promotion']];
  for(const [name,args,path,body,key] of rows) {
    const actions=createCatalogQualityActions({...config,beforeCall:async s=>{assert.equal(s,signal);before++;},fetcher:async(url,options)=>{calls.push(url);assert.equal(url,'https://gyodong-mall-action.aitop100.org'+path);assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.signal,signal);assert.equal(options.headers['X-Aitop100-Test-Case-Id'],config.testCaseId);return Response.json(body);}});
    const result=await actions[name].execute(args,{signal});assert.ok(result[key]);assert.equal(result.status,name==='list_lot_claims'?'empty':'ok');
  }
  assert.equal(calls.length,5);assert.equal(before,5);
});
test('strict tool args reject URL injection, extras and nonstring values before fetch',async()=>{
  let calls=0;const actions=createCatalogQualityActions({...config,fetcher:()=>{calls++;}});
  for(const args of [{sku:'../other'},{sku:'SKU-1',testCaseId:'OTHER'},{sku:'SKU-1?x=1'},{sku:3},{sku:'SKU-1',member_id:'MB'}]) {
    assert.equal(actions.read_product.validate(args),false);assert.deepEqual(await actions.read_product.execute(args),{status:'invalid_request'});
  }
  assert.equal(calls,0);
});
test('product and promo retain actual price, dates, target and stacking facts without default TC values',async()=>{
  assert.deepEqual((await setup(product).read_product.execute({sku:'SKU-1'})).product,product);
  assert.deepEqual((await setup(promo).read_promotion.execute({code:'CODE-1'})).promotion,promo);
});
test('lot measurement stays numeric and no false extra guarantee is manufactured',async()=>{
  assert.deepEqual((await setup(lot).read_lot.execute({lot_id:'LOT-1'})).lot,lot);
  assert.equal((await setup({...lot,measured_brix:'10.5'}).read_lot.execute({lot_id:'LOT-1'})).status,'invalid_response');
});
test('investigation findings and liability require positive disclosure approval',async()=>{
  for(const approval of [false,null]) {
    const result=await setup({...investigation,disclosure_approved:approval}).read_lot_investigation.execute({lot_id:'LOT-1'});
    assert.equal(result.status,'ok');assert.equal(Object.hasOwn(result.investigation,'finding'),false);assert.equal(Object.hasOwn(result.investigation,'liability'),false);
  }
  assert.equal((await setup(investigation).read_lot_investigation.execute({lot_id:'LOT-1'})).investigation.finding,'검토 결과');
});
test('claims aggregate without exposing other customers or raw narrative and do not claim diagnosis',async()=>{
  const result=await setup([ticket(1,'곰팡이 신고, 개인정보 010-9999-9999'),ticket(2,'곰팡이 없음, 흑심 문의','MB-2')]).list_lot_claims.execute({lot_id:'LOT-1'});
  assert.equal(result.claims.ticketCount,2);assert.equal(result.claims.distinctReporterCount,2);
  assert.deepEqual(result.claims.symptomMentionCounts,{mold:2,blackHeart:1});assert.match(result.claims.interpretation,/not confirmed/);
  const serialized=JSON.stringify(result);for(const secret of ['010-9999','개인 담당자','MB-1','"T-1"','곰팡이 없음']) assert.equal(serialized.includes(secret),false);
});
test('mismatched record targets, mixed lots and duplicate tickets fail closed',async()=>{
  assert.equal((await setup({...product,sku:'OTHER'}).read_product.execute({sku:'SKU-1'})).status,'invalid_response');
  assert.equal((await setup({...lot,lot_id:'OTHER'}).read_lot.execute({lot_id:'LOT-1'})).status,'invalid_response');
  for(const rows of [[ticket(1),{...ticket(2),lot_id:'OTHER'}],[ticket(1),ticket(1)]]) assert.equal((await setup(rows).list_lot_claims.execute({lot_id:'LOT-1'})).status,'invalid_response');
});
test('required schema, extra fields, dates and enums are validated',async()=>{
  for(const body of [{...product,price:1.2},{...product,phone:'SECRET'},{...product,sale_state:'???'},{...product,grade:['BAD']}]) assert.equal((await setup(body).read_product.execute({sku:'SKU-1'})).status,'invalid_response');
  assert.equal((await setup({...lot,packed_at:'2037-02-30T00:00:00Z'}).read_lot.execute({lot_id:'LOT-1'})).status,'invalid_response');
  assert.equal((await setup({...promo,valid_until:'2037-06-31'}).read_promotion.execute({code:'CODE-1'})).status,'invalid_response');
  const missing={...investigation};delete missing.finding;assert.equal((await setup(missing).read_lot_investigation.execute({lot_id:'LOT-1'})).status,'invalid_response');
});
test('HTTP errors remain fixed statuses and no automatic retries occur',async()=>{
  const fixtures=[[404,null,{},'not_found_or_route_error'],[400,{code:'INVALID_TEST_CASE_ID'}, {},'invalid_test_case'],[429,{message:'누적 API 호출 한도를 초과했습니다.'},{},'quota_exhausted'],[429,{message:'SECRET'},{'Retry-After':'7'},'rate_limited'],[503,{message:'SECRET'},{},'unavailable'],[302,null,{Location:'https://attacker.invalid'},'unavailable']];
  for(const [status,body,headers,expected] of fixtures) {
    let calls=0;const actions=createCatalogQualityActions({...config,fetcher:async()=>{calls++;return new Response(body?JSON.stringify(body):null,{status,headers});}});
    const result=await actions.read_product.execute({sku:'SKU-1'});assert.equal(result.status,expected);assert.equal(calls,1);assert.equal(JSON.stringify(result).includes('SECRET'),false);
  }
});
test('large or malformed response cannot escape bounded parser',async()=>{
  for(const body of ['{broken','가'.repeat(23000)]) {
    const actions=createCatalogQualityActions({...config,fetcher:async()=>new Response(body)});
    assert.deepEqual(await actions.read_product.execute({sku:'SKU-1'}),{status:'invalid_response'});
  }
});
test('budget and cancellation prevent fetch or abort stalled body',async()=>{
  let calls=0;const actions=createCatalogQualityActions({...config,beforeCall:async()=>{throw Error('stop');},fetcher:()=>{calls++;}});
  assert.equal((await actions.read_product.execute({sku:'SKU-1'})).status,'unavailable');assert.equal(calls,0);
  const aborter=new AbortController();aborter.abort();await assert.rejects(actions.read_product.execute({sku:'SKU-1'},{signal:aborter.signal}));
  const controller=new AbortController();let canceled=false;
  const stalled=createCatalogQualityActions({...config,fetcher:async()=>new Response(new ReadableStream({cancel(){canceled=true;}}))});
  const timer=setTimeout(()=>controller.abort(),20);
  try {await assert.rejects(stalled.read_lot.execute({lot_id:'LOT-1'},{signal:controller.signal}));assert.equal(canceled,true);} finally {clearTimeout(timer);}
});

test('investigation empty404 requires current successful lot evidence in this factory',async()=>{
  let failLot=false;
  const fetcher=async url=>url.endsWith('/investigation')?new Response(null,{status:404}):failLot?new Response(null,{status:503}):Response.json(lot);
  const a=createCatalogQualityActions({...config,fetcher});
  assert.deepEqual(await a.read_lot_investigation.execute({lot_id:'LOT-1'}),{status:'not_found_or_route_error'});
  await a.read_lot.execute({lot_id:'LOT-1'});
  assert.deepEqual(await a.read_lot_investigation.execute({lot_id:'LOT-1'}),{status:'empty',investigation:null,lot_id:'LOT-1',notice:'확인한 로트에 조사 항목이 반환되지 않았습니다. 원인·안전 확정이 아닙니다.'});
  assert.equal((await a.read_lot_investigation.execute({lot_id:'LOT-2'})).status,'not_found_or_route_error');
  assert.equal((await createCatalogQualityActions({...config,fetcher}).read_lot_investigation.execute({lot_id:'LOT-1'})).status,'not_found_or_route_error');
  failLot=true;await a.read_lot.execute({lot_id:'LOT-1'});
  assert.equal((await a.read_lot_investigation.execute({lot_id:'LOT-1'})).status,'not_found_or_route_error');
});

test('nonempty404 and wrong response route never turn into absent investigation',async()=>{
  for(const response of [Response.json(null,{status:404}),Response.json({code:'NOT_FOUND'},{status:404}),Object.defineProperty(new Response(null,{status:404}),'url',{value:'https://gyodong-mall-action.aitop100.org/wrong-route'}),Object.defineProperty(new Response(null,{status:404}),'redirected',{value:true})]){
    const a=createCatalogQualityActions({...config,fetcher:async url=>url.endsWith('/investigation')?response:Response.json(lot)});
    await a.read_lot.execute({lot_id:'LOT-1'});
    assert.deepEqual(await a.read_lot_investigation.execute({lot_id:'LOT-1'}),{status:'not_found_or_route_error'});
  }
});

test('failed newer lot refresh cannot be undone by older inflight successful read',async()=>{
  let finishFirst,count=0;
  const a=createCatalogQualityActions({...config,fetcher:async url=>{
    if(url.endsWith('/investigation'))return new Response(null,{status:404});
    if(++count===1)return new Promise(resolve=>{finishFirst=()=>resolve(Response.json(lot));});
    return new Response(null,{status:503});
  }});
  const first=a.read_lot.execute({lot_id:'LOT-1'});await new Promise(resolve=>setImmediate(resolve));
  await a.read_lot.execute({lot_id:'LOT-1'});finishFirst();await first;
  assert.equal((await a.read_lot_investigation.execute({lot_id:'LOT-1'})).status,'not_found_or_route_error');
});
