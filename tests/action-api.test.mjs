import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderPaymentActions } from '../src/order-payment-actions.mjs';
import { resolveActionBinding, createScopedActions, matchesBoundCase, extractTestCaseId } from '../src/action-context.mjs';
import { Conversation } from '../src/worker.mjs';
import { ConversationStore } from '../src/conversation-store.mjs';
import { DatabaseSync } from 'node:sqlite';

function storage() {
  const db=new DatabaseSync(':memory:');
  return {sql:{exec(sql,...args){const rows=db.prepare(sql).all(...args);return {toArray:()=>rows};}},
    sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};
}

// Synthetic records follow Orders/Payments required fields in the supplied OpenAPI.
const order = (changes = {}) => ({ order_no:'100100003', member_id:'MB-77001', status:'PAID',
  status_changed_at:null, ordered_at:'2037-06-24T10:00:00+09:00', amount:12000,
  recipient_name:'PRIVATE_RECIPIENT', shipping_address:'PRIVATE_ADDRESS', inflow_tag:null,
  ship_scheduled_at:'2037-06-25', failure_code:null, payment_refs:['PAY-3706-0001'],
  refund_ids:[], change_request_ids:[], items:[{sku:'WTM-01',name:'수박',qty:1,unit_price:12000}], ...changes });
const payment = (changes = {}) => ({approval_no:'PAY-3706-0001', order_no:'100100003',pay_method:'CARD',
  amount:12000,paid_at:'2037-06-24T10:00:00+09:00',status:'APPROVED',payer_name:'PRIVATE_PAYER',
  cancellation_request_ids:[],card_last4:'9876',...changes});
const shipment = (changes = {}) => ({shipment_id:'SHP-01',order_no:'100100003',status:'IN_TRANSIT',
  carrier:'시원배송',invoice_no:'INV-01',picked_up_at:'2037-06-24T10:00:00+09:00',delivered_at:null,
  delivered_location:'PRIVATE_DELIVERY_ADDRESS',return_reason:null,item_condition:null,
  ship_notice_sent_at:'2037-06-24T09:00:00+09:00',items:[{sku:'WTM-01',qty:1,lot_id:'LOT-01'}],...changes});
const config = { token:'aitop100_synthetic_test_only', testCaseId:'TC-PUBLIC.01', memberId:'MB-77001' };
function harness(responses, options = {}) {
  const calls = [], before = [];
  const registry = createOrderPaymentActions({...config, beforeCall:async signal=>before.push(signal),
    fetcher:async (url, init) => {
      calls.push({url:new URL(url),init});
      assert.ok(responses.length, 'unexpected extra HTTP call');
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response instanceof Response ? response : Response.json(response);
    },...options});
  const execute = (name,args={}) => registry[name].execute(args,{signal:new AbortController().signal,context:{}});
  return {registry,calls,before,execute};
}

test('order/payment/shipment registry exposes exactly five read-only actions', () => {
  const {registry}=harness([]);
  assert.deepEqual(Object.keys(registry).sort(),['list_my_orders','list_order_payments','list_order_shipments','read_order','read_payment']);
  for (const action of Object.values(registry)) assert.equal(action.kind,'read');
});

test('missing trusted token, TC or member never exposes personal-data actions', () => {
  for (const key of ['token','testCaseId','memberId']) {
    for (const value of [undefined,'',null]) assert.deepEqual(Object.keys(createOrderPaymentActions({...config,[key]:value})),[]);
  }
  for (const testCaseId of ['bad\r\nHeader:x','../TC','x'.repeat(101)])
    assert.deepEqual(Object.keys(createOrderPaymentActions({...config,testCaseId})),[]);
});

test('model arguments cannot override TC, member, credentials or URL', async () => {
  const {registry,execute,calls}=harness([]);
  for (const field of ['member_id','testCaseId','token','url','path']) {
    const args={order_no:'100100003',[field]:'attacker'};
    assert.equal(await registry.read_order.validate(args),false);
    assert.equal((await execute('read_order',args)).status,'invalid_request');
  }
  assert.equal(await registry.list_my_orders.validate({member_id:'MB-OTHER'}),false);
  for (const order_no of ['../reset','//evil.test/x','x?member_id=MB-OTHER','x#fragment','x\ny',42,''])
    assert.equal(await registry.read_order.validate({order_no}),false);
  assert.equal(calls.length,0);
});

test('order GET pins host, method, headers, signal and strips unrelated personal fields', async () => {
  const h=harness([order()]);
  const result=await h.execute('read_order',{order_no:'100100003'});
  assert.equal(result.status,'ok');assert.equal(result.order.amount,12000);
  assert.equal(h.calls.length,1);
  const {url,init}=h.calls[0];
  assert.equal(url.href,'https://gyodong-mall-action.aitop100.org/api/orders/100100003');
  assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(init.body,undefined);
  const headers=new Headers(init.headers);
  assert.equal(headers.get('Authorization'),`Bearer ${config.token}`);
  assert.equal(headers.get('X-Aitop100-Test-Case-Id'),config.testCaseId);
  assert.ok(init.signal instanceof AbortSignal);assert.equal(h.before[0],init.signal);
  const serialized=JSON.stringify(result);
  for (const secret of ['PRIVATE_RECIPIENT','PRIVATE_ADDRESS','MB-77001',config.token,config.testCaseId])
    assert.ok(!serialized.includes(secret));
  assert.equal(result.order.member_id,undefined);
});

test('member search uses trusted member only and distinguishes empty array', async () => {
  const h=harness([[]]);const result=await h.execute('list_my_orders');
  assert.deepEqual(result,{status:'empty',orders:[]});
  assert.equal(h.calls[0].url.pathname,'/api/orders');
  assert.deepEqual([...h.calls[0].url.searchParams],[['member_id',config.memberId]]);
});

test('foreign order yields no identity, order, status or amount data', async () => {
  const h=harness([order({member_id:'MB-OTHER',amount:99123})]);
  const result=await h.execute('read_order',{order_no:'100100003'});
  assert.equal(result.status,'forbidden');
  assert.deepEqual(Object.keys(result),['status']);
  assert.ok(!JSON.stringify(result).includes('99123'));
});

test('member search rejects mixed ownership without leaking any rows', async () => {
  const h=harness([[order(),order({order_no:'100100004',member_id:'MB-OTHER'})]]);
  const result=await h.execute('list_my_orders');
  assert.notEqual(result.status,'ok');assert.equal(result.orders,undefined);
});

test('payment GET verifies linked order before projecting payment data', async () => {
  const h=harness([payment(),order()]);
  const result=await h.execute('read_payment',{approval_no:'PAY-3706-0001'});
  assert.equal(result.status,'ok');assert.equal(result.payment.amount,12000);
  assert.deepEqual(h.calls.map(x=>x.url.pathname),['/api/payments/PAY-3706-0001','/api/orders/100100003']);
  assert.equal(h.before.length,2);
  assert.equal(result.payment.card_last4,undefined);assert.equal(result.payment.payer_name,undefined);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_PAYER'));
});

test('unlinked payment fails closed without treating approval number as ownership', async () => {
  const h=harness([payment({order_no:null})]);
  const result=await h.execute('read_payment',{approval_no:'PAY-3706-0001'});
  assert.equal(result.status,'forbidden');assert.equal(result.payment,undefined);assert.equal(h.calls.length,1);
});

test('payment belonging to a different member never leaves the action', async () => {
  const h=harness([payment(),order({member_id:'MB-OTHER'})]);
  assert.deepEqual(await h.execute('read_payment',{approval_no:'PAY-3706-0001'}),{status:'forbidden'});
});

test('order payment search verifies ownership before calling payment search', async () => {
  const h=harness([order(),[payment()]]);
  const result=await h.execute('list_order_payments',{order_no:'100100003'});
  assert.equal(result.status,'ok');assert.equal(result.payments.length,1);
  assert.equal(h.calls[0].url.pathname,'/api/orders/100100003');
  assert.equal(h.calls[1].url.pathname,'/api/payments');
  assert.deepEqual([...h.calls[1].url.searchParams],[['order_no','100100003']]);
});

test('foreign order payment search never queries its payments', async () => {
  const h=harness([order({member_id:'MB-OTHER'})]);
  const result=await h.execute('list_order_payments',{order_no:'100100003'});
  assert.equal(result.status,'forbidden');assert.equal(h.calls.length,1);
});

test('mismatched response target cannot be returned as the requested record', async () => {
  const h=harness([order({order_no:'DIFFERENT'})]);
  const result=await h.execute('read_order',{order_no:'100100003'});
  assert.notEqual(result.status,'ok');assert.equal(result.order,undefined);
});

test('redirect is never followed and does not expose response body', async () => {
  const h=harness([new Response('PRIVATE_BODY',{status:302,headers:{Location:'https://evil.test'}})]);
  const result=await h.execute('read_order',{order_no:'100100003'});
  assert.notEqual(result.status,'ok');assert.equal(h.calls.length,1);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_BODY'));
});

test('schema violations fail closed before returning order data', async () => {
  const missing=order();delete missing.member_id;
  for (const data of [missing,order({amount:'12000'}),order({status:'INVENTED'}),order({unknown:'PRIVATE'}),
    order({items:[{sku:'x',name:'x',qty:1.5,unit_price:10}]}),[],null]) {
    const h=harness([Response.json(data)]);
    const result=await h.execute('read_order',{order_no:'100100003'});
    assert.notEqual(result.status,'ok');assert.equal(result.order,undefined);
  }
});

test('malformed and oversized response bodies are never sent to the model', async () => {
  for (const response of [new Response('{bad-json'),new Response('x'.repeat(65537)),
    new Response('{}',{headers:{'Content-Length':'65537'}})]) {
    const h=harness([response]);const result=await h.execute('read_order',{order_no:'100100003'});
    assert.notEqual(result.status,'ok');assert.equal(result.order,undefined);
  }
});

test('beforeCall rejection and aborted signal stop external requests', async () => {
  const h=harness([],{beforeCall:async()=>{throw new Error('budget exhausted');}});
  try {await h.execute('read_order',{order_no:'100100003'});} catch {}
  assert.equal(h.calls.length,0);
  const aborted=harness([]);const controller=new AbortController();controller.abort();
  try {await aborted.registry.read_order.execute({order_no:'100100003'},{signal:controller.signal,context:{}});} catch {}
  assert.equal(aborted.calls.length,0);
});

test('read errors are safe statuses and never retried automatically', async () => {
  for (const status of [400,401,403,404,429,500,503]) {
    const h=harness([new Response(JSON.stringify({code:'UNEXPECTED',message:'PRIVATE_BODY'}),{status})]);
    const result=await h.execute('read_order',{order_no:'100100003'});
    assert.notEqual(result.status,'ok');assert.equal(result.order,undefined);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_BODY'));assert.equal(h.calls.length,1);
  }
});

test('TC errors, 404, window quota and total quota remain distinguishable', async () => {
  const cases=[
    [new Response(null,{status:400}),{status:'invalid_request'}],
    [Response.json({code:'INVALID_TEST_CASE_ID',message:'PRIVATE_BODY'},{status:400}),{status:'invalid_test_case'}],
    [new Response(null,{status:404}),{status:'not_found_or_route_error'}],
    [Response.json({code:'RATE_LIMIT_EXCEEDED',message:'시간 창 한도'},{status:429,headers:{'Retry-After':'7'}}),{status:'rate_limited',retryAfterSeconds:7}],
    [Response.json({code:'RATE_LIMIT_EXCEEDED',message:'누적 API 호출 한도를 초과했습니다.'},{status:429,headers:{'Retry-After':'7'}}),{status:'quota_exhausted'}],
    [Response.json({code:'RATE_LIMIT_EXCEEDED'},{status:429,headers:{'Retry-After':'-10'}}),{status:'rate_limited'}],
    [new Response(null,{status:401}),{status:'unauthorized'}],
    [new Response(null,{status:503}),{status:'unavailable'}],
  ];
  for (const [response,expected] of cases) {
    const h=harness([response]);
    assert.deepEqual(await h.execute('read_order',{order_no:'100100003'}),expected);
    assert.equal(h.calls.length,1);
  }
});

test('payment search rejects a record for another order without returning any payment', async () => {
  const h=harness([order(),[payment({order_no:'100100004'})]]);
  assert.deepEqual(await h.execute('list_order_payments',{order_no:'100100003'}),{status:'invalid_response'});
});

test('body size limit counts UTF-8 bytes without trusting Content-Length', async () => {
  const oversized=order({shipping_address:'가'.repeat(23000)});
  assert.ok(JSON.stringify(oversized).length<65536);
  assert.ok(new TextEncoder().encode(JSON.stringify(oversized)).length>65536);
  const h=harness([new Response(JSON.stringify(oversized),{headers:{'Content-Length':'1'}})]);
  assert.deepEqual(await h.execute('read_order',{order_no:'100100003'}),{status:'invalid_response'});
});

test('abort while reading a stalled response cancels the body reader', async () => {
  let canceled=false;
  const controller=new AbortController();
  const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){canceled=true;}});
  const h=harness([new Response(stream)]);
  const request=h.registry.read_order.execute({order_no:'100100003'},{signal:controller.signal});
  const timer=setTimeout(()=>controller.abort(),20);
  try { await assert.rejects(request); } finally {clearTimeout(timer);}
  assert.equal(canceled,true);assert.equal(h.calls.length,1);
});

const scope='a'.repeat(64), bindingNow=Date.parse('2026-10-31T00:00:00Z');
const binding={testCaseId:'L-03',memberId:'MB-77001',expiresAt:'2026-10-31T01:00:00Z'};
const bindingEnv=(value=binding)=>({USAGE:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})},ACTION_TOKEN:config.token,ACTION_READ_BINDINGS:JSON.stringify({[scope]:value})});

test('explicit TC extraction rejects conflicting and malformed identifiers',()=>{
  for(const text of ['TC ID: L-03','[TC=L-03] 문의','id: L-03\n문의','/조회 L-03 123'])
    assert.equal(extractTestCaseId(text),'L-03');
  assert.equal(extractTestCaseId('지난 L-03과 비교해 주세요'),'');
  for(const text of ['TC: L-03\nTC: L-05','TC: ../bad','TC: '+ 'a'.repeat(101)])
    assert.throws(()=>extractTestCaseId(text),/INVALID_TEST_CASE_ID/);
});

test('conversation TC persists across reconstruction and transition clears old context without granting membership',async()=>{
  const s=storage();let store=new ConversationStore(s,()=>bindingNow);
  await createScopedActions({env:bindingEnv(),scope,store,text:'TC ID: L-03',now:()=>bindingNow});
  store.remember('OLD_CASE_SUMMARY');store.rememberLookup({order_no:'old'});
  store=new ConversationStore(s,()=>bindingNow);
  const same=await createScopedActions({env:bindingEnv(),scope,store,text:'계속 조회',now:()=>bindingNow});
  assert.equal(same.testCaseId,'L-03');assert.equal(store.summary(),'OLD_CASE_SUMMARY');
  const next=await createScopedActions({env:bindingEnv(),scope,store,text:'TC: L-05',now:()=>bindingNow});
  assert.equal(store.testCaseId(),'L-05');assert.equal(store.summary(),'');assert.deepEqual(store.lookup(),{});
  assert.ok(next.actions.read_order,'TC alone enables reads under conversation ownership policy');
  assert.equal(next.binding,null,'old member binding must not carry forward');
  await assert.rejects(createScopedActions({env:bindingEnv(),scope,store,text:'TC: L-01\nTC: L-02',now:()=>bindingNow}));
  assert.equal(store.testCaseId(),'L-05');
});

test('all registered HTTP reads use persisted TC and ACTION_TOKEN, reset is absent',async()=>{
  const store=new ConversationStore(storage(),()=>bindingNow),headers=[];
  store.rememberCase('L-05');
  const scoped=await createScopedActions({env:bindingEnv({...binding,testCaseId:'L-05'}),scope,store,now:()=>bindingNow,
    fetcher:async(url,init)=>{
      headers.push(init.headers);assert.equal(init.method,'GET');assert.ok(!String(url).includes('/reset'));
      const u=new URL(url);
      return Response.json(u.pathname==='/api/orders'?[order()]:u.pathname.startsWith('/api/orders/')?order():
        u.pathname==='/api/payments'?[payment()]:u.pathname.startsWith('/api/payments/')?payment():[shipment()]);
    }});
  for(const [name,args] of [['read_order',{order_no:'100100003'}],['list_my_orders',{member_id:'MB-77001'}],
    ['read_payment',{approval_no:'PAY-3706-0001'}],['list_order_payments',{order_no:'100100003'}],
    ['list_order_shipments',{order_no:'100100003'}]]) {
    const output=await scoped.actions[name].execute(args,{});
    assert.equal(output.status,'ok');
    if(['read_payment','list_order_payments','list_order_shipments'].includes(name)) assert.equal(output.member_id,'MB-77001');
  }
  assert.ok(headers.length>=7);
  assert.ok(headers.every(h=>h['X-Aitop100-Test-Case-Id']==='L-05' && h.Authorization===`Bearer ${config.token}`));
  assert.ok(Object.keys(scoped.actions).every(name=>!name.toLowerCase().includes('reset')));
});

test('server binding accepts only matching scope with valid future expiration',()=>{
  assert.deepEqual(resolveActionBinding(bindingEnv(),scope,bindingNow),binding);
  assert.equal(resolveActionBinding(bindingEnv(),'b'.repeat(64),bindingNow),null);
  const invalid=[undefined,'not-json','[]','null',JSON.stringify({[scope]:{...binding,expiresAt:'invalid'}}),
    JSON.stringify({[scope]:{...binding,expiresAt:'2026-10-31T00:00:00Z'}}),
    JSON.stringify({[scope]:{...binding,memberId:'../other'}}),
    JSON.stringify({[scope]:{...binding,testCaseId:'bad\nheader'}})];
  for(const value of invalid) assert.equal(resolveActionBinding({ACTION_READ_BINDINGS:value},scope,bindingNow),null);
});

test('scoped actions retain calendar with missing, malformed or expired binding',async()=>{
  for(const env of [{},bindingEnv({...binding,expiresAt:'2026-10-30T00:00:00Z'}),{ACTION_READ_BINDINGS:'bad'}]) {
    const store=new ConversationStore(storage());
    const result=await createScopedActions({env,scope,store,now:()=>bindingNow});
    assert.equal(result.binding,null);
    assert.ok(Object.keys(result.actions).length>0,'calendar must remain usable');
    assert.equal(result.actions.read_order,undefined);
    assert.ok(Object.values(result.actions).every(action=>action.kind==='read'));
  }
});

test('scoped actions expose personal reads only for the configured scope',async()=>{
  const result=await createScopedActions({env:bindingEnv(),scope,store:new ConversationStore(storage()),now:()=>bindingNow});
  assert.equal(result.binding.memberId,binding.memberId);
  assert.ok(result.actions.read_order);assert.ok(Object.keys(result.actions).length>4);
  const other=await createScopedActions({env:bindingEnv(),scope:'b'.repeat(64),store:new ConversationStore(storage()),now:()=>bindingNow});
  assert.equal(other.actions.read_order,undefined);
});

test('case and member transitions clear both memory stores but preserve dedupe and write journal',async()=>{
  const s=storage(),store=new ConversationStore(s,()=>bindingNow);
  store.claim('old-event');await store.journal().reserve('save',{id:1});
  await store.journal().settle('save',{id:1},'success');
  const create=env=>createScopedActions({env,scope,store,now:()=>bindingNow});
  await create(bindingEnv());store.remember('old private summary');store.rememberLookup({order_no:'old-order'});
  await create(bindingEnv());assert.equal(store.summary(),'old private summary');assert.equal(store.lookup().order_no,'old-order');
  await create(bindingEnv({...binding,testCaseId:'L-05'}));
  assert.equal(store.summary(),'');assert.deepEqual(store.lookup(),{});
  store.remember('new private summary');store.rememberLookup({order_no:'second-order'});
  await create(bindingEnv({...binding,testCaseId:'L-05',memberId:'MB-OTHER'}));
  assert.equal(store.summary(),'');assert.deepEqual(store.lookup(),{});
  store.remember('removed binding summary');store.rememberLookup({order_no:'third-order'});
  await create({});assert.equal(store.summary(),'');assert.deepEqual(store.lookup(),{});
  assert.equal(store.claim('old-event'),false);
  assert.equal(await store.journal().reserve('save',{id:1}),'duplicate');
});

test('binding survives store reconstruction without losing valid conversation memory',async()=>{
  const s=storage(),first=new ConversationStore(s,()=>bindingNow);
  await createScopedActions({env:bindingEnv(),scope,store:first,now:()=>bindingNow});first.remember('retained');
  const second=new ConversationStore(s,()=>bindingNow);
  await createScopedActions({env:bindingEnv(),scope,store:second,now:()=>bindingNow});
  assert.equal(second.summary(),'retained');
});

test('expiration after registry creation stops private HTTP calls',async()=>{
  let now=bindingNow,calls=0;
  const result=await createScopedActions({env:bindingEnv(),scope,store:new ConversationStore(storage()),now:()=>now,
    fetcher:async()=>{calls++;return Response.json(order());}});
  now=Date.parse(binding.expiresAt);
  try{await result.actions.read_order.execute({order_no:'100100003'},{signal:new AbortController().signal});}catch{}
  assert.equal(calls,0);
});

test('message TC can only reject a mismatch, never manufacture a binding',()=>{
  for(const text of ['TC: L-05\n주문 조회','[TC ID=L-05] 조회','/조회 L-05 100100003'])
    assert.equal(matchesBoundCase(text,binding),false);
  assert.equal(matchesBoundCase('TC: L-03\n조회',binding),true);
  assert.equal(matchesBoundCase('TC: L-03\n조회',null),false);
  assert.equal(matchesBoundCase('주문 조회',null),true);
});

test('Worker passes scoped read actions to model and keeps filtered result in tool-output channel',async()=>{
  const original=globalThis.fetch;
  const requests=[];let modelCalls=0,actionCalls=0;
  const future={...binding,expiresAt:new Date(Date.now()+3600000).toISOString()};
  const env={...bindingEnv(future),OPENAI_API_KEY:'fake-openai',BOT_TOKEN:'fake-bot',WEBHOOK_SECRET:'fake-hook',
    USAGE:{idFromName:id=>id,get:()=>({fetch:async()=>new Response(null,{status:204})})}};
  const conversation=new Conversation({storage:storage()},env);
  globalThis.fetch=async(url,init)=>{
    if(String(url).startsWith('https://api.openai.com/')) {
      const body=JSON.parse(init.body);requests.push(body);modelCalls++;
      if(modelCalls===1) return Response.json({status:'completed',output:[{type:'function_call',name:'list_my_orders',call_id:'call1',arguments:'{}'}]});
      assert.ok(body.input.some(x=>x.type==='function_call_output'));
      assert.ok(!JSON.stringify(body.input).includes('PRIVATE_ADDRESS'));
      assert.ok(!JSON.stringify(body.input).includes('PRIVATE_RECIPIENT'));
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'주문 상태를 확인했습니다.',summary:''})}]}]});
    }
    if(String(url).startsWith('https://gyodong-mall-action.aitop100.org/')) {actionCalls++;return Response.json([order()]);}
    assert.equal(String(url),'https://kapi.kakao.com/v1/bot/callback');return Response.json({errorCount:0});
  };
  try {
    conversation.store.claim('scoped-event');
    await conversation.process({d:{content:'내 주문 조회',botUserKey:'u',botGroupKey:'g',callbackToken:'callback'}},
      {scope,eventId:'scoped-event'},Date.now());
  } finally {globalThis.fetch=original;}
  assert.equal(modelCalls,2);assert.equal(actionCalls,1);
  assert.ok(requests[0].tools.some(x=>x.name==='list_my_orders'));
  assert.ok(requests[0].tools.length>4,'calendar remains in the same registry');
});

test('shipment query verifies order ownership first and excludes delivered location',async()=>{
  const h=harness([order(),[shipment(),shipment({shipment_id:'SHP-02',status:'READY',picked_up_at:null})]]);
  const result=await h.execute('list_order_shipments',{order_no:'100100003'});
  assert.equal(result.status,'ok');assert.equal(result.shipments.length,2);
  assert.equal(h.calls[0].url.pathname,'/api/orders/100100003');
  assert.equal(h.calls[1].url.pathname,'/api/shipments');
  assert.deepEqual([...h.calls[1].url.searchParams],[['order_no','100100003']]);
  assert.ok(h.calls.every(x=>x.init.method==='GET'&&x.init.redirect==='manual'));
  assert.equal(h.before.length,2);
  assert.equal(result.shipments[0].picked_up_at,'2037-06-24T10:00:00+09:00');
  assert.equal(result.shipments[0].delivered_location,undefined);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_DELIVERY_ADDRESS'));
});

test('shipment search has an explicit empty state after owned-order verification',async()=>{
  const h=harness([order(),[]]);
  assert.deepEqual(await h.execute('list_order_shipments',{order_no:'100100003'}),{status:'empty',shipments:[]});
  assert.equal(h.calls.length,2);
});

test('foreign or unverified order cannot trigger shipment search',async()=>{
  for(const response of [order({member_id:'MB-OTHER'}),new Response(null,{status:404}),new Response(null,{status:401})]) {
    const h=harness([response]);
    const result=await h.execute('list_order_shipments',{order_no:'100100003'});
    assert.notEqual(result.status,'ok');assert.equal(result.shipments,undefined);assert.equal(h.calls.length,1);
  }
});

test('every shipment must match the requested order; mixed results fail closed',async()=>{
  const h=harness([order(),[shipment(),shipment({shipment_id:'SHP-02',order_no:'100100004'})]]);
  assert.deepEqual(await h.execute('list_order_shipments',{order_no:'100100003'}),{status:'invalid_response'});
});

test('shipment required fields, enum, item shape and real calendar dates are checked',async()=>{
  const missing=shipment();delete missing.invoice_no;
  for(const data of [missing,shipment({status:'UNKNOWN'}),shipment({extra:'PRIVATE'}),
    shipment({picked_up_at:'2037-02-30T10:00:00Z'}),shipment({delivered_at:'2037-06-25T10:00:00'}),
    shipment({items:[{sku:'WTM-01',qty:1.5,lot_id:'LOT-01'}]})]) {
    const h=harness([order(),[data]]);
    assert.deepEqual(await h.execute('list_order_shipments',{order_no:'100100003'}),{status:'invalid_response'});
  }
});

test('shipment HTTP failure is not an empty array or a delivery success and never retries',async()=>{
  const h=harness([order(),Response.json({code:'SERVICE_UNAVAILABLE',message:'PRIVATE'},{status:503})]);
  assert.deepEqual(await h.execute('list_order_shipments',{order_no:'100100003'}),{status:'unavailable'});
  assert.equal(h.calls.length,2);
});

test('scoped HTTP stops when global token budget refuses reservation',async()=>{
  let calls=0,reservations=0;
  const env={...bindingEnv(),USAGE:{idFromName:name=>{assert.equal(name,'action-usage');return name;},get:()=>({fetch:async()=>{reservations++;return new Response(null,{status:429});}})}};
  const scoped=await createScopedActions({env,scope,store:new ConversationStore(storage()),now:()=>bindingNow,fetcher:async()=>{calls++;return Response.json(order());}});
  const result=await scoped.actions.read_order.execute({order_no:'100100003'},{signal:new AbortController().signal});
  assert.notEqual(result.status,'ok');assert.equal(calls,0);assert.equal(reservations,1);
});
