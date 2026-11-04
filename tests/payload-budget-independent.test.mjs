import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ConversationStore} from '../src/conversation-store.mjs';
import {createScopedActions} from '../src/action-context.mjs';
import * as adapter from '../src/openai-model.mjs';
import {runAgent,SYSTEM_POLICY} from '../src/agent.mjs';

async function registry() {
  const db=new DatabaseSync(':memory:');
  const store=new ConversationStore({sql:{exec(q,...args){const rows=db.prepare(q).all(...args);return {toArray:()=>rows};}},sync:async()=>{}});
  const scoped=await createScopedActions({env:{ACTION_TOKEN:'synthetic-token'},scope:'a'.repeat(64),store,text:'TC: L-11'});
  // Exercise exactly the registry supplied to the model by the Worker.
  return {...scoped.actions};
}
const answer=()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'모의 조회 결과를 확인했습니다.',summary:''})}]}]});

test('22-tool registry preserves nine full tool results and function calls through tenth final model response',async t=>{
  const actions=await registry(),lengths=[],returnedCalls=[];let lastPayload;
  actions.read_product={...actions.read_product,execute:async args=>({status:'ok',product:{sku:args.sku,name:'나'.repeat(4000)}})};
  const model=adapter.createOpenAIModel({apiKey:'synthetic-key',summary:'요'.repeat(600),fetcher:async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');lengths.push(init.body.length);
    assert.ok(init.body.length<=adapter.MAX_MODEL_REQUEST_CHARS);lastPayload=JSON.parse(init.body);
    const calls=lastPayload.input.filter(row=>row.type==='function_call');
    const outputs=lastPayload.input.filter(row=>row.type==='function_call_output');
    assert.deepEqual(calls,returnedCalls,'all previous function calls, IDs and JSON arguments remain intact');
    assert.equal(outputs.length,returnedCalls.length);
    for(let i=0;i<outputs.length;i++) {
      assert.equal(outputs[i].call_id,returnedCalls[i].call_id);
      const entry=JSON.parse(outputs[i].output);assert.equal(entry.name,'read_product');
      assert.ok(JSON.stringify(entry).length>=3900,'bounded tool output must not disappear to pass the size check');
    }
    if(lengths.length===10)return answer();
    const call={type:'function_call',name:'read_product',call_id:'call-'+lengths.length,arguments:JSON.stringify({sku:'SKU-'+lengths.length})};
    returnedCalls.push(call);return Response.json({status:'completed',output:[call]});
  }});
  const result=await runAgent({text:'가'.repeat(4000),model,actions,maxSteps:10});
  assert.equal(result.steps,10);assert.equal(lengths.length,10);assert.equal(returnedCalls.length,9);
  assert.equal(adapter.MAX_MODEL_REQUEST_CHARS,96000);
  assert.equal(lastPayload.tools.length,22);assert.equal(result.text,'모의 조회 결과를 확인했습니다.');
  t.diagnostic(JSON.stringify({tools:lastPayload.tools.length,systemChars:SYSTEM_POLICY.length,inputChars:4000,summaryChars:600,serializedRequestLengths:lengths,realExternalRequests:0}));
});

test('finite model request bound permits exactly 96000 characters and rejects 96001 before transport or reservation',async t=>{
  const actions=await registry(),tools=Object.entries(actions).map(([name,a])=>({name,description:a.description,parameters:a.parameters}));
  let baseLength;
  const calibration=adapter.createOpenAIModel({apiKey:'synthetic-key',fetcher:async(url,init)=>{baseLength=init.body.length;return answer();}});
  const input={system:SYSTEM_POLICY,user:'TC: L-11\n검증',tools,history:[]};
  await calibration(input);
  const limit=adapter.MAX_MODEL_REQUEST_CHARS;
  assert.equal(limit,96000);assert.ok(baseLength<limit);
  let atLimit;
  const exact=adapter.createOpenAIModel({apiKey:'synthetic-key',summary:'요'.repeat(limit-baseLength),fetcher:async(url,init)=>{atLimit=init.body.length;return answer();}});
  await exact(input);assert.equal(atLimit,limit);
  let reservations=0,requests=0;
  const oversized=adapter.createOpenAIModel({apiKey:'synthetic-key',summary:'요'.repeat(limit-baseLength+1),
    beforeCall:async()=>{reservations++},fetcher:async()=>{requests++;assert.fail('oversized request must not reach transport');}});
  await assert.rejects(oversized(input),error=>error.code==='INVALID_INPUT');
  assert.equal(requests,0);assert.equal(reservations,0);
  t.diagnostic(JSON.stringify({exactBoundary:atLimit,rejectedBoundary:atLimit+1,oversizedTransportCalls:requests}));
});
