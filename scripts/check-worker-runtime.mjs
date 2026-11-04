// Run after a Wrangler dry-run build. MINIFLARE_MODULE points to the installed module.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {identify} from '../src/worker.mjs';
const runtime=await import(pathToFileURL(process.env.MINIFLARE_MODULE).href);
const {Miniflare}=runtime;
const convertV4MiniflareOptions=runtime.convertV4MiniflareOptions ?? (options=>options);
let modelCalls=0,callbacks=0;
const memories=[];
const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,script:readFileSync('artifacts/worker-build/worker.js','utf8'),compatibilityDate:process.env.TEST_COMPATIBILITY_DATE ?? '2026-10-23',cf:false,
  bindings:{OPENAI_API_KEY:'fake-key',BOT_TOKEN:'fake-bot',WEBHOOK_SECRET:'fake-webhook'},
  durableObjects:{CONVERSATIONS:{className:'Conversation',useSQLite:true},USAGE:{className:'UsageBudget',useSQLite:true}},
  outboundService:async request=>{
    if(request.url==='https://api.openai.com/v1/responses') {
      modelCalls++;
      const body=await request.json();
      memories.push(JSON.parse(body.input[0].content).previousConversationSummary);
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'여행 정보를 확인했습니다.',summary:'여행 목적지 부산, 기간 사흘.'})}]}]});
    }
    if(request.url==='https://kapi.kakao.com/v1/bot/callback') {callbacks++;return Response.json({errorCount:0});}
    throw new Error('Unexpected outbound request');
  },
}));
try {
  const health=await (await mf.dispatchFetch('https://test/health')).json();assert.equal(health.configured,true);
  const namespace=await mf.getDurableObjectNamespace('CONVERSATIONS');
  for(const [id,user] of [['100','u1'],['100','u1'],['101','u1'],['102','u2']]) {
    const event={op:0,t:'MESSAGE_CREATE',d:{id,botUserKey:user,botGroupKey:'g1',content:'여행 계획',callbackToken:'fake-callback'}};
    const identity=await identify(event);
    const r=await namespace.get(namespace.idFromName(identity.scope)).fetch('https://internal/message',{method:'POST',body:JSON.stringify({event,identity,receivedAt:Date.now()})});
    assert.equal(r.status,200);
  }
  assert.equal(modelCalls,3);assert.equal(callbacks,3);
  assert.equal(memories[0],'');assert.match(memories[1],/부산/);assert.equal(memories[2],'');
  console.log(JSON.stringify({runtime:'workerd',modelCalls,callbacks,deduplication:true,memory:true,userIsolation:true}));
} finally {await mf.dispose();}
