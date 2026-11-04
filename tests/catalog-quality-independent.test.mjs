import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCatalogQualityActions} from '../src/catalog-quality-actions.mjs';

const spec=JSON.parse(fs.readFileSync(new URL('../docs/sources/action-api/actions.json',import.meta.url),'utf8'));
const product={sku:'SKU-1',name:'검증상품',origin:'검증산지',variety:null,listed_weight:'1kg',grade:null,price:10000,sale_state:'ON_SALE'};
const lot={lot_id:'LOT-1',sku:'SKU-1',packed_at:'2037-06-24T10:00:00+09:00',measured_weight_g:1000,measured_brix:null,grade:'STANDARD',qty_in_stock:2,status:'ACTIVE',sprayed_at:null};
const investigation={lot_id:'LOT-1',status:'IN_PROGRESS',symptom:'MOLD',liability:'PRODUCTION',finding:'PRIVATE_UNAPPROVED_FINDING',disclosure_approved:false,opened_at:lot.packed_at,closed_at:null};
const promotion={code:'PROMO-1',name:'검증행사',benefit_type:'RATE',benefit_value:10,valid_from:'2037-06-01',valid_until:null,target_skus:null,stackable_with:['POINTS']};
const ticket={ticket_id:'PRIVATE_TICKET_01',member_id:'PRIVATE_MEMBER',lot_id:'LOT-1',created_at:lot.packed_at,content:'곰팡이 문의 PRIVATE_PHONE',handler:'PRIVATE_HANDLER'};
const cases=[
  ['read_product',{sku:'SKU-1'},'Products',product,'/api/products/SKU-1'],
  ['read_lot',{lot_id:'LOT-1'},'Lots',lot,'/api/lots/LOT-1'],
  ['read_lot_investigation',{lot_id:'LOT-1'},'LotInvestigations',investigation,'/api/lots/LOT-1/investigation'],
  ['read_promotion',{code:'PROMO-1'},'Promotions',promotion,'/api/promos/PROMO-1'],
];
function make(body,beforeCall=async()=>{}) {
  const calls=[];
  const actions=createCatalogQualityActions({token:'synthetic-token',testCaseId:'L-11',beforeCall,
    fetcher:async(url,init)=>{calls.push({url,init});return body instanceof Response?body:Response.json(body);}});
  return {actions,calls};
}

test('independent catalog fixtures exactly cover required official properties and fixed transport',async()=>{
  for(const [name,args,schema,body,path] of cases) {
    assert.deepEqual(Object.keys(body).sort(),[...spec.components.schemas[schema].required].sort());
    let reserves=0;const h=make(body,async()=>{reserves++});
    assert.equal((await h.actions[name].execute(args)).status,'ok');assert.equal(reserves,1);
    const {url,init}=h.calls[0];assert.equal(url,'https://gyodong-mall-action.aitop100.org'+path);
    assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(init.body,undefined);
    assert.equal(init.headers['X-Aitop100-Test-Case-Id'],'L-11');assert.equal(init.headers.Authorization,'Bearer synthetic-token');
  }
});

test('independent schema matrix rejects each missing required property, extra data and wrong target',async()=>{
  for(const [name,args,schema,body] of cases) {
    for(const key of spec.components.schemas[schema].required) {
      const changed={...body};delete changed[key];
      assert.deepEqual(await make(changed).actions[name].execute(args),{status:'invalid_response'},`${schema}.${key}`);
    }
    assert.deepEqual(await make({...body,private_extra:'LEAK'}).actions[name].execute(args),{status:'invalid_response'});
    const target=Object.keys(args)[0];
    assert.deepEqual(await make({...body,[target]:'OTHER'}).actions[name].execute(args),{status:'invalid_response'});
  }
});

test('independent official enum and nullability matrix accepts all declared alternatives',async()=>{
  for(const [name,args,schema,body] of cases) {
    for(const [key,definition] of Object.entries(spec.components.schemas[schema].properties)) {
      const values=definition.enum??(Array.isArray(definition.type)&&definition.type.includes('null')?[null]:[]);
      for(const value of values)assert.equal((await make({...body,[key]:value}).actions[name].execute(args)).status,'ok',`${schema}.${key}=${value}`);
      if(definition.items?.enum)for(const value of definition.items.enum)
        assert.equal((await make({...body,[key]:[value]}).actions[name].execute(args)).status,'ok',`${schema}.${key}[${value}]`);
    }
  }
});

test('investigation finding and liability require boolean true approval and are never inferred from closed status',async()=>{
  for(const disclosure_approved of [null,false])for(const status of ['IN_PROGRESS','CLOSED']) {
    const result=await make({...investigation,status,disclosure_approved}).actions.read_lot_investigation.execute({lot_id:'LOT-1'});
    assert.equal(result.status,'ok');assert.equal(result.investigation.finding,undefined);assert.equal(result.investigation.liability,undefined);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_UNAPPROVED_FINDING'));
  }
  const approved=await make({...investigation,disclosure_approved:true}).actions.read_lot_investigation.execute({lot_id:'LOT-1'});
  assert.equal(approved.investigation.finding,investigation.finding);
  assert.equal((await make({...investigation,disclosure_approved:'true'}).actions.read_lot_investigation.execute({lot_id:'LOT-1'})).status,'invalid_response');
});

test('ticket aggregate counts records and distinct reporters without leaking raw customer or staff fields',async()=>{
  assert.deepEqual(Object.keys(ticket).sort(),[...spec.components.schemas.Tickets.required].sort());
  const rows=[ticket,{...ticket,ticket_id:'T-2',content:'흑심 문의'},{...ticket,ticket_id:'T-3',member_id:'OTHER_MEMBER',content:'MOLD BLACK_HEART'}];
  const h=make(rows);const result=await h.actions.list_lot_claims.execute({lot_id:'LOT-1'});
  assert.equal(new URL(h.calls[0].url).pathname,'/api/tickets');assert.equal(new URL(h.calls[0].url).search,'?lot_id=LOT-1');
  assert.equal(result.claims.ticketCount,3);assert.equal(result.claims.distinctReporterCount,2);
  assert.deepEqual(result.claims.symptomMentionCounts,{mold:2,blackHeart:2});
  for(const value of ['PRIVATE_MEMBER','OTHER_MEMBER','PRIVATE_PHONE','PRIVATE_HANDLER','PRIVATE_TICKET_01'])assert.ok(!JSON.stringify(result).includes(value));
  for(const rows of [[ticket,{...ticket,ticket_id:'T-2',lot_id:'OTHER'}],[ticket,ticket],[{...ticket,lot_id:null}]])
    assert.deepEqual(await make(rows).actions.list_lot_claims.execute({lot_id:'LOT-1'}),{status:'invalid_response'});
  const empty=await make([]).actions.list_lot_claims.execute({lot_id:'LOT-1'});
  assert.equal(empty.status,'empty');assert.equal(empty.claims.ticketCount,0);
});

test('invalid routing arguments, rejected budget and cancellation never invoke transport',async()=>{
  const h=make(product);
  for(const args of [{sku:'../reset'},{sku:'SKU-1',testCaseId:'OTHER'},{sku:'SKU-1?token=x'}])
    assert.deepEqual(await h.actions.read_product.execute(args),{status:'invalid_request'});
  const rejected=make(product,async()=>{throw Error('limited')});
  assert.deepEqual(await rejected.actions.read_product.execute({sku:'SKU-1'}),{status:'unavailable'});
  const controller=new AbortController();controller.abort();
  await assert.rejects(h.actions.read_product.execute({sku:'SKU-1'},{signal:controller.signal}));
  assert.equal(h.calls.length+rejected.calls.length,0);
});

test('bounded response rejects invalid UTF8 and excessive declared or actual body; errors stay safe',async()=>{
  for(const response of [new Response(new Uint8Array([0xff])),new Response('{}',{headers:{'Content-Length':'65537'}}),new Response('가'.repeat(22000))])
    assert.deepEqual(await make(response).actions.read_product.execute({sku:'SKU-1'}),{status:'invalid_response'});
  const denied=make(Response.json({private:'DO_NOT_LEAK'},{status:403}));
  assert.deepEqual(await denied.actions.read_product.execute({sku:'SKU-1'}),{status:'forbidden'});assert.equal(denied.calls.length,1);
});

test('stalled catalog stream cancels on abort and never produces partial result',async()=>{
  let cancelled=false;const controller=new AbortController();
  const h=make(new Response(new ReadableStream({cancel(){cancelled=true;}})));
  const pending=h.actions.read_product.execute({sku:'SKU-1'},{signal:controller.signal});
  setTimeout(()=>controller.abort(),5);await assert.rejects(pending);assert.equal(cancelled,true);assert.equal(h.calls.length,1);
});

test('investigation absence interpretation is revoked when lot evidence changes while the 404 is pending',async()=>{
  for(const refreshSucceeded of [false,true]) {
    let lotCalls=0,release404,markStarted;
    const started=new Promise(resolve=>{markStarted=resolve});
    const actions=createCatalogQualityActions({token:'synthetic-token',testCaseId:'L-11',fetcher:async url=>{
      if(url.endsWith('/investigation')) {markStarted();return new Promise(resolve=>{release404=()=>resolve(new Response(null,{status:404}))});}
      lotCalls++;return lotCalls===1||refreshSucceeded?Response.json(lot):new Response(null,{status:503});
    }});
    assert.equal((await actions.read_lot.execute({lot_id:'LOT-1'})).status,'ok');
    const pending=actions.read_lot_investigation.execute({lot_id:'LOT-1'});await started;
    await actions.read_lot.execute({lot_id:'LOT-1'});release404();
    assert.deepEqual(await pending,{status:'not_found_or_route_error'});
  }
});

test('lot success obtained after investigation dispatch cannot retroactively authorize absence interpretation',async()=>{
  let release404,markStarted;const started=new Promise(resolve=>{markStarted=resolve});
  const actions=createCatalogQualityActions({token:'synthetic-token',testCaseId:'L-11',fetcher:async url=>{
    if(url.endsWith('/investigation')) {markStarted();return new Promise(resolve=>{release404=()=>resolve(new Response(null,{status:404}))});}
    return Response.json(lot);
  }});
  const pending=actions.read_lot_investigation.execute({lot_id:'LOT-1'});await started;
  await actions.read_lot.execute({lot_id:'LOT-1'});release404();
  assert.deepEqual(await pending,{status:'not_found_or_route_error'});
});

test('only actual empty 404 from official route plus prior same-factory lot evidence is an absent investigation',async()=>{
  const responses=[new Response(null,{status:404}),Response.json(null,{status:404}),
    Object.defineProperty(new Response(null,{status:404}),'url',{value:'https://other.invalid/api/lots/LOT-1/investigation'}),
    Object.defineProperty(new Response(null,{status:404}),'redirected',{value:true})];
  for(let i=0;i<responses.length;i++) {
    const actions=createCatalogQualityActions({token:'synthetic-token',testCaseId:'L-11',fetcher:async url=>url.endsWith('/investigation')?responses[i]:Response.json(lot)});
    await actions.read_lot.execute({lot_id:'LOT-1'});
    const result=await actions.read_lot_investigation.execute({lot_id:'LOT-1'});
    assert.equal(result.status,i===0?'empty':'not_found_or_route_error');
    if(i===0) {assert.equal(result.investigation,null);assert.match(result.notice,/안전 확정이 아닙니다/);}
  }
});
