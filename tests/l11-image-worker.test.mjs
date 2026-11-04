import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Conversation} from '../src/worker.mjs';

const url='https://t1.kakaocdn.net/aitop100/aitop100/dist/yQbPeyvr5OIfWZ83WRNraw.jpg';
const storage=()=>{const db=new DatabaseSync(':memory:');return {sql:{exec(q,...a){const rows=db.prepare(q).all(...a);return {toArray:()=>rows};}},sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};};
for(const scenario of ['readable','failed-with-complaint','failed-image-only'])test(`L-11 Worker image routing: ${scenario}`,async()=>{
  const original=globalThis.fetch;
  let visionCalls=0,chatCalls=0,callback;
  globalThis.fetch=async(target,init)=>{
    if(target===url) return scenario==='readable'
      ? new Response(new Uint8Array([255,216,255,0]),{headers:{'content-type':'image/jpeg'}})
      : new Response(null,{status:404});
    if(target==='https://api.openai.com/v1/responses'){
      const body=JSON.parse(init.body);
      let value;
      if(body.text.format.name==='photo_observation'){
        visionCalls++;
        assert.match(body.input[0].content[1].image_url,/^data:image\/jpeg;base64,/);
        value={readable:true,observation:'수박 꼭지 주변에 흰 솜털 같은 흔적. 원인 미확정.'};
      }else{
        chatCalls++;
        const input=JSON.parse(body.input[0].content);
        assert.equal(input.mediaEvidence[0].status,scenario==='readable'?'ok':'unavailable');
        assert.match(input.currentMessage,/곰팡이/);
        assert.match(body.instructions,/섭취 여부와 현재 몸의 이상/);
        value={answer:'불편을 드려 죄송합니다. 드시지 말고 섭취 여부와 현재 증상, 주문번호를 알려주세요.',summary:'저장하면 안 되는 사진 관찰'};
      }
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
    }
    assert.equal(target,'https://kapi.kakao.com/v1/bot/callback');
    callback=JSON.parse(init.body);return Response.json({errorCount:0});
  };
  try{
    const env={OPENAI_API_KEY:'mock-key',BOT_TOKEN:'mock-bot',USAGE:{idFromName:x=>x,get:()=>({fetch:async()=>new Response('ok')})}};
    const conv=new Conversation({storage:storage()},env);
    await conv.process({d:{content:`image: ${url}${scenario==='failed-image-only'?'':'\n오늘 열어보니 곰팡이가 피어 있어요.'}`,botUserKey:'u',botGroupKey:'g',callbackToken:'mock-callback'}},{scope:'a'.repeat(64),eventId:scenario},Date.now());
    assert.equal(visionCalls,scenario==='readable'?1:0);
    assert.equal(chatCalls,scenario==='failed-image-only'?0:1);
    const outputs=callback.skillResponse.template.outputs;
    assert.equal(outputs.length,1);assert.ok(outputs[0].simpleText.text.length<=500);
    if(scenario==='failed-image-only')assert.match(outputs[0].simpleText.text,/확인하지 못/);
    assert.equal(conv.store.summary(),'');
  }finally{globalThis.fetch=original;}
});
