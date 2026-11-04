import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ConversationStore,MEMORY_TTL,EVENT_TTL,WRITE_TTL,writePolicy} from '../src/conversation-store.mjs';
import {createOpenAIModel} from '../src/openai-model.mjs';
import {runAgent} from '../src/agent.mjs';
import worker,{Conversation,UsageBudget,identify,parseEvent,authenticated} from '../src/worker.mjs';
import {createActionClient} from '../src/action-client.mjs';

function storage() {
  const db=new DatabaseSync(':memory:');
  return {db, sql:{exec(query,...args) {const rows=db.prepare(query).all(...args);return {toArray:()=>rows};}},sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};
}
const event=(id='558185822630215770',user='user1',group='group1',content='부산 여행 계획을 세워줘')=>({op:0,t:'MESSAGE_CREATE',d:{id,botUserKey:user,botGroupKey:group,content,callbackToken:'fake-callback'}});
const response=(answer='반갑습니다.',summary='부산 여행에 관심이 있음.')=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer,summary})}]}]});

test('Kakao Long IDs retain exact digits and do not collide',async()=>{
  const a=parseEvent('{"op":0,"d":{"id":558185822630215770,"content":"number 558185822630215770"}}');
  const b=parseEvent('{"op":0,"d":{"id":558185822630215771}}');
  assert.equal(a.d.id,'558185822630215770');assert.notEqual(a.d.id,b.d.id);assert.equal(a.d.content,'number 558185822630215770');
});
test('user and room both isolate conversation storage',async()=>{
  const ids=await Promise.all([identify(event()),identify(event('1','user2')),identify(event('1','user1','group2'))]);
  assert.equal(new Set(ids.map(x=>x.scope)).size,3);
  await assert.rejects(identify({...event(),d:{...event().d,id:558185822630215770}}));
});
test('webhook secret comparison accepts only the exact secret',async()=>{
  assert.equal(await authenticated('correct','correct'),true);
  assert.equal(await authenticated('incorrect','correct'),false);
  assert.equal(await authenticated('',''),false);
});
test('memory expires at 30 minutes and event dedupe survives reconstruction',()=>{
  let now=1000;const s=storage(),store=new ConversationStore(s,()=>now);
  assert.equal(store.claim('id'),true);store.remember('여행 목적지는 부산.');
  const recreated=new ConversationStore(s,()=>now);
  assert.equal(recreated.claim('id'),false);assert.ok(recreated.summary());
  now+=MEMORY_TTL;recreated.clean();assert.equal(recreated.summary(),'');assert.equal(recreated.claim('id'),false);
  now+=EVENT_TTL;assert.equal(recreated.claim('id'),true);
});
test('persistent journal blocks duplicate writes across agent runs and changed key order',async()=>{
  const store=new ConversationStore(storage());let executions=0;
  const actions={save:{kind:'write',validate:()=>true,authorize:()=>true,execute:async()=>{executions++;return {ok:true};}}};
  for(const args of [{a:1,b:2},{b:2,a:1}]) {
    await runAgent({text:'save',actions,writeJournal:store.journal(),model:async({history})=>history.length?{type:'answer',text:'확인'}:{type:'action',name:'save',arguments:args}});
  }
  assert.equal(executions,1);
});
test('unknown write locks different writes after object reconstruction',async()=>{
  const s=storage();let calls=0;
  const actions={save:{kind:'write',validate:()=>true,authorize:()=>true,execute:async()=>{calls++;throw new Error('uncertain');}}};
  for(const n of [1,2]) {
    const result=await runAgent({text:'save',actions,writeJournal:new ConversationStore(s).journal(),model:async({history})=>history.length?{type:'answer',text:'ok'}:{type:'action',name:'save',arguments:{n}}});
    assert.equal(result.outcomeUnknown,true);assert.notEqual(result.text,'ok');
  }
  assert.equal(calls,1);
});
test('storage sync failure prevents external writes',async()=>{
  const s=storage();s.sync=async()=>{throw new Error('disk');};let calls=0;
  await assert.rejects(runAgent({text:'save',writeJournal:new ConversationStore(s).journal(),actions:{save:{kind:'write',validate:()=>true,authorize:()=>true,execute:()=>{calls++;}}},model:async()=>({type:'action',name:'save',arguments:{}})}));
  assert.equal(calls,0);
});

test('V-008/009 default write retention stays 24 hours, including unknown outcomes',async()=>{
  for(const outcome of ['success','rejected','unknown']) {
    let now=1000;const s=storage(),store=new ConversationStore(s,()=>now),journal=store.journal();
    assert.equal(journal.lockScope,'user');assert.equal(WRITE_TTL,86400000);
    assert.equal(await journal.reserve('book',{}),'reserved');
    if(outcome!=='unknown') await journal.settle('book',{},outcome);
    now+=WRITE_TTL-1;
    const restarted=new ConversationStore(s,()=>now).journal();
    assert.equal(await restarted.reserve('book',{}),outcome==='unknown'?'locked':'duplicate');
    if(outcome==='unknown') assert.equal(await restarted.reserve('cancel',{}),'locked');
    now++;
    assert.equal(await restarted.reserve('book',{}),'reserved');
  }
});

test('V-009 configured retention expires at the boundary without shortening event dedupe',async()=>{
  for(const outcome of ['success','rejected','unknown']) {
    let now=1000;const s=storage(),policy={writeTtlMs:600000};
    const store=new ConversationStore(s,()=>now,policy),journal=store.journal();
    store.claim('event');await journal.reserve('book',{date:'11-01'});
    if(outcome!=='unknown') await journal.settle('book',{date:'11-01'},outcome);
    now+=599999;
    const restarted=new ConversationStore(s,()=>now,policy);
    assert.equal(await restarted.journal().reserve('book',{date:'11-01'}),outcome==='unknown'?'locked':'duplicate');
    now++;
    assert.equal(await restarted.journal().reserve('book',{date:'11-01'}),'reserved');
    assert.equal(restarted.claim('event'),false);
  }
});

test('V-008 action scope permits other actions in the same run and after reconstruction',async()=>{
  const s=storage(),policy={writeLockScope:'action'};let books=0,cancels=0;
  const actions={
    cancel:{kind:'write',validate:()=>true,authorize:()=>true,execute:()=>{cancels++;throw new Error('uncertain');}},
    book:{kind:'write',validate:()=>true,authorize:()=>true,execute:()=>({number:++books})},
  };
  const run=async sequence=>{
    let step=0;
    return runAgent({text:'test',actions,maxSteps:5,writeJournal:new ConversationStore(s,Date.now,policy).journal(),
      model:async()=>sequence[step++]??{type:'answer',text:'ok'}});
  };
  const call=(name,n)=>({type:'action',name,arguments:{n}});
  const first=await run([call('cancel',1),call('cancel',2),call('book',1)]);
  assert.equal(first.outcomeUnknown,true);assert.equal(cancels,1);assert.equal(books,1);
  const second=await run([call('cancel',3),call('book',2),call('book',1)]);
  assert.equal(second.outcomeUnknown,true);assert.equal(cancels,1);assert.equal(books,2);
});

test('V-008 old unknown rows remain locked after schema upgrade and action scope selection',async()=>{
  const s=storage();
  s.sql.exec('CREATE TABLE writes (id TEXT PRIMARY KEY, outcome TEXT NOT NULL, expires INTEGER NOT NULL)');
  s.sql.exec('INSERT INTO writes VALUES (?, ?, ?)','legacy','unknown',Date.now()+WRITE_TTL);
  const store=new ConversationStore(s,Date.now,{writeLockScope:'action'});
  assert.equal(await store.journal().reserve('book',{}),'locked');
  assert.equal(await new ConversationStore(s).journal().reserve('cancel',{}),'locked');
});

test('write policy validates configuration and Conversation receives environment settings',()=>{
  assert.deepEqual(writePolicy(),{writeTtlMs:86400000,writeLockScope:'user'});
  const env={WRITE_RECORD_TTL_MS:'600000',WRITE_LOCK_SCOPE:'action'};
  assert.deepEqual(new Conversation({storage:storage()},env).store.policy,{writeTtlMs:600000,writeLockScope:'action'});
  for(const ttl of ['',0,-1,1.5,'NaN','Infinity',Number.MAX_SAFE_INTEGER+1])
    assert.throws(()=>writePolicy({WRITE_RECORD_TTL_MS:ttl}),/Invalid write policy/);
  for(const scope of ['', 'resource', 'all'])
    assert.throws(()=>new Conversation({storage:storage()},{WRITE_LOCK_SCOPE:scope}),/Invalid write policy/);
});
test('model adapter preserves role boundary and forwards function results',async()=>{
  const requests=[];
  const model=createOpenAIModel({apiKey:'test',summary:'untrusted summary',fetcher:async(url,options)=>{
    requests.push(JSON.parse(options.body));
    return requests.length===1?Response.json({status:'completed',output:[{type:'function_call',call_id:'call1',name:'lookup',arguments:'{"city":"부산"}'}]}):response('부산 결과 확인');
  }});
  const answer=await runAgent({text:'부산을 조회',model,actions:{lookup:{kind:'read',description:'lookup',parameters:{type:'object',properties:{city:{type:'string'}},required:['city']},validate:()=>true,authorize:()=>true,execute:()=>({city:'부산'})}}});
  assert.equal(answer.text,'부산 결과 확인');assert.equal(requests.length,2);
  assert.equal(requests[0].instructions.includes('untrusted summary'),false);
  assert.equal(requests[1].input.at(-1).type,'function_call_output');assert.equal(requests[1].input.at(-1).call_id,'call1');
});
test('adapter strips known secrets from answers and does not store full original text',async()=>{
  const raw='부산으로 3일 여행을 계획하고 있어';
  const model=createOpenAIModel({apiKey:'sk-test-key-value',fetcher:async()=>response('sk-test-key-value',raw)});
  const result=await runAgent({text:raw,model});assert.equal(result.text.includes('sk-test'),false);assert.equal(model.summary(),'');
});
test('incomplete and multiple-call model outputs fail closed',async()=>{
  for(const output of [{status:'incomplete'}, {status:'completed',output:[{type:'function_call',name:'lookup'},{type:'function_call',name:'lookup'}]}]) {
    const model=createOpenAIModel({apiKey:'test',fetcher:async()=>Response.json(output)});
    await assert.rejects(runAgent({text:'hello',model}));
  }
});
test('webhook acknowledges without waiting for model or DO response',async()=>{
  let scheduled;
  const namespace={idFromName:x=>x,get:()=>({fetch:()=>new Promise(()=>{})})};
  const env={BOT_TOKEN:'b',WEBHOOK_SECRET:'test-secret',CONVERSATIONS:namespace,USAGE:namespace};
  const r=await worker.fetch(new Request('https://test/webhook',{method:'POST',headers:{'X-Webhook-Secret':'test-secret'},body:JSON.stringify(event())}),env,{waitUntil:p=>{scheduled=p;}});
  assert.equal(r.status,204);assert.ok(scheduled);
});
test('duplicate simultaneous events trigger only one process after restart too',async()=>{
  const s=storage(),ctx={storage:s};let calls=0,release;
  const obj=new Conversation(ctx,{});obj.process=async()=>{calls++;await new Promise(resolve=>{release=resolve;});};
  const e=event(),identity=await identify(e),req=()=>new Request('https://internal',{method:'POST',body:JSON.stringify({event:e,identity,receivedAt:Date.now()})});
  const first=obj.fetch(req());
  while(!release) await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await (await obj.fetch(req())).json()).duplicate,true);
  release();await first;
  const restarted=new Conversation(ctx,{});restarted.process=async()=>{calls++;};
  assert.equal((await (await restarted.fetch(req())).json()).duplicate,true);assert.equal(calls,1);
});
test('two messages for one user run serially',async()=>{
  const obj=new Conversation({storage:storage()},{});let active=0,maxActive=0;
  obj.process=async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,10));active--;};
  await Promise.all(['1','2'].map(async id=>{const e=event(id);return obj.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({event:e,identity:await identify(e),receivedAt:Date.now()})}));}));
  assert.equal(maxActive,1);
});
test('model call cap persists across object reconstruction',async()=>{
  const s=storage(),env={MODEL_CALLS_PER_MINUTE:'2',MODEL_CALLS_PER_DAY:'10'};
  assert.equal((await new UsageBudget({storage:s},env).fetch()).status,204);
  assert.equal((await new UsageBudget({storage:s},env).fetch()).status,204);
  assert.equal((await new UsageBudget({storage:s},env).fetch()).status,429);
});

test('redirects never forward action credentials or trigger a second request',async()=>{
  let calls=0;
  const call=createActionClient({baseUrl:'https://trusted.test',token:'fake',fetcher:async(url,options)=>{
    calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.test'}});
  }});
  await assert.rejects(call({path:'/write',body:{}}),error=>error.code==='ACTION_HTTP_ERROR'&&error.status===302);
  assert.equal(calls,1);
});

test('persistent callback claim blocks repeat after failed delivery',async()=>{
  const s=storage(),obj=new Conversation({storage:s},{BOT_TOKEN:'fake'});
  obj.store.claim('id');
  const original=globalThis.fetch;let count=0;
  globalThis.fetch=async()=>{count++;throw new Error('network');};
  try {assert.equal(await obj.deliver('id','fake-token','hello'),false);} finally {globalThis.fetch=original;}
  assert.equal(count,1);assert.equal(new ConversationStore(s).claim('id'),false);
  assert.equal(s.sql.exec('SELECT status FROM events WHERE id = ?','id').toArray()[0].status,'callback-unknown');
});
