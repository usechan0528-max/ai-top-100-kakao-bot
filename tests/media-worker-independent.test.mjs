import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Conversation} from '../src/worker.mjs';
import {createScopedActions} from '../src/action-context.mjs';

const imageUrl='https://t1.kakaocdn.net/aitop100/aitop100/dist/independent-photo.jpg';
const audioUrl='https://t1.kakaocdn.net/aitop100/aitop100/dist/independent-voice.m4a';
const key='synthetic-openai-private-key';
const photoMarker='PHOTO_OBSERVATION_PRIVATE';
const voiceMarker='VOICE_TRANSCRIPT_PRIVATE';
const baseline='이전 일반 문의의 미완료 질문';
const jpeg=new Uint8Array([255,216,255,224,0,16]);
const m4a=new Uint8Array([0,0,0,12,102,116,121,112,77,52,65,32]);
const completed=value=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

function memoryStorage() {
  const db=new DatabaseSync(':memory:');
  return {db,sql:{exec(q,...a){const rows=db.prepare(q).all(...a);return {toArray:()=>rows};}},sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};
}

// Every network route is mocked; unexpected hosts or business requests fail the test.
async function exercise({text,photoFailure=false,audioFailure=false,corruptImage=false,attemptAudioWrite=false,answer='사진 또는 음성의 요지를 확인했습니다. 필요한 내용을 글로 알려 주세요.'}) {
  const originalFetch=globalThis.fetch,originalLog=console.log,originalWarn=console.warn;
  const logs=[],warnings=[],mainPayloads=[],callbacks=[],routes=[],preprocess=[],usageReservations=[];
  const storage=memoryStorage();
  const env={ACTION_TOKEN:'synthetic-action-secret',OPENAI_API_KEY:key,BOT_TOKEN:'synthetic-bot-secret',WEBHOOK_SECRET:'synthetic-webhook-secret',
    USAGE:{idFromName:x=>x,get:name=>({fetch:async(url,init)=>{usageReservations.push({name,url,method:init.method});return new Response(null,{status:204});}})}};
  const conv=new Conversation({storage},env);
  // Establish the existing conversation's routing fingerprint before seeding memory.
  await createScopedActions({env,scope:'a'.repeat(64),store:conv.store,text:'TC: L-11'});
  conv.store.remember(baseline);
  console.log=value=>logs.push(String(value));console.warn=value=>warnings.push(String(value));
  globalThis.fetch=async(url,init={})=>{
    const u=new URL(url);routes.push({host:u.hostname,path:u.pathname,method:init.method});
    if(u.hostname==='t1.kakaocdn.net') {
      assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');
      assert.equal(init.headers,undefined,'media download must not forward service credentials');
      if(url===imageUrl)return new Response(corruptImage?'not an image':jpeg,{headers:{'Content-Type':'image/jpeg'}});
      if(url===audioUrl)return new Response(m4a,{headers:{'Content-Type':'audio/mp4'}});
      assert.fail('unexpected media URL');
    }
    if(u.hostname==='api.openai.com') {
      assert.equal(init.method,'POST');assert.equal(init.headers.Authorization,'Bearer '+key);
      if(u.pathname==='/v1/audio/transcriptions') {
        preprocess.push('audio');assert.ok(init.body instanceof FormData);
        const file=init.body.get('file');assert.equal(file.type,'audio/mp4');assert.equal(file.name,'input.m4a');
        if(audioFailure)return new Response(null,{status:503});
        return Response.json({text:voiceMarker+' 지난주 받은 수박 환불이 가능한가요? '+key});
      }
      assert.equal(u.pathname,'/v1/responses');const payload=JSON.parse(init.body);
      if(payload.text.format.name==='photo_observation') {
        preprocess.push('image');assert.equal(payload.store,false);assert.equal(payload.tools,undefined);
        assert.match(payload.input[0].content.find(x=>x.type==='input_image').image_url,/^data:image\/jpeg;base64,/);
        if(photoFailure)return new Response(null,{status:503});
        return completed({readable:true,observation:photoMarker+' 껍질에 흰 부분이 보이며 원인은 불확실합니다. '+key});
      }
      assert.equal(payload.text.format.name,'conversation_reply');mainPayloads.push(payload);
      if(attemptAudioWrite&&mainPayloads.length===1)return Response.json({status:'completed',output:[{type:'function_call',name:'request_refund',call_id:'malicious-audio-write',arguments:'{}'}]});
      // Deliberately return sensitive evidence in summary to verify storage suppression.
      return completed({answer,summary:[voiceMarker,photoMarker,imageUrl,audioUrl,key].join(' ')});
    }
    if(u.hostname==='kapi.kakao.com') {
      assert.equal(u.pathname,'/v1/bot/callback');assert.equal(init.headers.Authorization,'KakaoAK '+env.BOT_TOKEN);
      callbacks.push(JSON.parse(init.body));return Response.json({errorCount:0});
    }
    assert.fail('unexpected network request, including business API: '+u.hostname);
  };
  try {
    const response=await conv.fetch(new Request('https://internal/message',{method:'POST',body:JSON.stringify({
      event:{d:{content:text,botUserKey:'synthetic-user',botGroupKey:'synthetic-group',callbackToken:'synthetic-callback-secret'}},
      identity:{scope:'a'.repeat(64),eventId:'independent-event'},receivedAt:Date.now()})}));
    assert.equal(response.status,200);assert.equal((await response.json()).processed,true);
    assert.equal(callbacks.length,1);
    const outputs=callbacks[0].skillResponse.template.outputs;
    assert.equal(outputs.length,1);assert.deepEqual(Object.keys(outputs[0]),['simpleText']);
    const reply=outputs[0].simpleText.text;assert.ok(reply.length>0&&reply.length<=500);
    assert.equal(conv.store.summary(),baseline,'media turn must not persist model-produced observation/transcript summary');
    const persisted=storage.db.prepare('SELECT summary FROM memory').all();
    const recorded=JSON.stringify({logs,warnings,persisted});
    for(const value of [key,env.ACTION_TOKEN,env.BOT_TOKEN,env.WEBHOOK_SECRET,imageUrl,audioUrl,photoMarker,voiceMarker,'synthetic-callback-secret'])
      assert.ok(!recorded.includes(value),'private media/service data must not enter logs or persistent summary: '+value);
    assert.equal(storage.db.prepare('SELECT COUNT(*) AS n FROM writes').get().n,0);
    return {reply,logs,warnings,mainPayloads,routes,preprocess,usageReservations};
  }finally {globalThis.fetch=originalFetch;console.log=originalLog;console.warn=originalWarn;storage.db.close();}
}

for(const kind of ['image','audio'])test(`public ${kind} link traverses preprocessing, main evidence and one bounded SimpleText`,async()=>{
  const url=kind==='image'?imageUrl:audioUrl;
  const r=await exercise({text:'TC: L-11\n'+kind+': '+url,answer:'확인했습니다. '+ '가'.repeat(650)});
  assert.deepEqual(r.preprocess,[kind]);assert.equal(r.mainPayloads.length,1);assert.equal(r.usageReservations.length,2);
  const payload=r.mainPayloads[0],input=JSON.parse(payload.input[0].content);
  assert.equal(payload.store,false);assert.equal(input.mediaEvidence.length,1);
  assert.equal(input.mediaEvidence[0].kind,kind);assert.equal(input.mediaEvidence[0].status,'ok');
  assert.ok(input.mediaEvidence[0].text.includes(kind==='image'?photoMarker:voiceMarker));
  assert.ok(!input.mediaEvidence[0].text.includes(key));
  assert.match(payload.instructions,/비신뢰 자료/);
  if(kind==='audio')assert.ok(payload.tools.every(x=>!x.name.startsWith('request_')),'audio must not expose mutations');
  else assert.ok(payload.tools.some(x=>x.name==='request_refund'),'image alone must not accidentally erase supported write tools');
  assert.ok(r.logs.some(x=>JSON.parse(x).mediaCalls===1&&JSON.parse(x).writeAttempts===0));
});

test('audio instruction trying an unregistered write cannot reach the business API',async()=>{
  const r=await exercise({text:'TC: L-11\naudio: '+audioUrl,attemptAudioWrite:true});
  assert.equal(r.mainPayloads.length,1,'model adapter rejects function outside offered tools');
  assert.ok(r.mainPayloads[0].tools.every(x=>!x.name.startsWith('request_')));
  assert.ok(r.routes.every(x=>x.host!=='gyodong-mall-action.aitop100.org'));
});

for(const mode of ['untrusted-source','corrupt-image','vision-failure','transcription-failure'])test(`unreadable media ${mode} returns direct guidance without main model or action tools`,async()=>{
  const text=mode==='untrusted-source'?'image: https://untrusted.example/photo.jpg':
    mode==='transcription-failure'?'audio: '+audioUrl:'image: '+imageUrl;
  const r=await exercise({text,corruptImage:mode==='corrupt-image',photoFailure:mode==='vision-failure',audioFailure:mode==='transcription-failure'});
  assert.equal(r.mainPayloads.length,0);assert.match(r.reply,/글로 알려 주세요/);
  assert.ok(r.logs.some(x=>JSON.parse(x).event==='media_unavailable'));
  assert.ok(r.routes.every(x=>x.host!=='gyodong-mall-action.aitop100.org'));
  if(mode==='untrusted-source')assert.deepEqual(r.routes.map(x=>x.host),['kapi.kakao.com']);
});

test('mixed photo success and audio failure preserves both statuses and keeps writes unavailable',async()=>{
  const r=await exercise({text:'TC: L-11\nimage: '+imageUrl+'\naudio: '+audioUrl,audioFailure:true});
  assert.deepEqual(r.preprocess,['image','audio']);assert.equal(r.mainPayloads.length,1);
  const p=r.mainPayloads[0],e=JSON.parse(p.input[0].content).mediaEvidence;
  assert.deepEqual(e.map(x=>[x.kind,x.status]),[['image','ok'],['audio','unavailable']]);
  assert.ok(p.tools.every(x=>!x.name.startsWith('request_')));
  assert.equal(r.usageReservations.length,3);
});
