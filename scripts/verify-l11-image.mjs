// Public L-11 photo + live inference only. No business actions or real callback.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {prepareMediaInput} from '../src/media-input.mjs';
import {createOpenAIModel, MODEL} from '../src/openai-model.mjs';
import {runAgent} from '../src/agent.mjs';
import {sendCallback} from '../src/worker.mjs';

const local = await readFile('.env.local','utf8').catch(()=> '');
const apiKey = process.env.OPENAI_API_KEY || local.match(/^OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
if (!apiKey) throw Error('KEY_NOT_CONFIGURED');
const url = 'https://t1.kakaocdn.net/aitop100/aitop100/dist/yQbPeyvr5OIfWZ83WRNraw.jpg';
const started = Date.now(), requests = [];
const fetcher = async (target, options) => {
  if (target !== url && target !== 'https://api.openai.com/v1/responses') throw Error('UNEXPECTED_DESTINATION');
  const response = await fetch(target, options);
  requests.push({destination:target===url?'public-photo':'responses',status:response.status});
  return response;
};
const report = {observedAt:new Date().toISOString(),model:MODEL,businessCalls:0,realKakaoCalls:0,requests};
try {
  report.media = await prepareMediaInput({text:url,apiKey,fetcher,signal:AbortSignal.timeout(20000)});
  if (report.media.items[0]?.status !== 'ok') throw Error('PHOTO_UNAVAILABLE');
  report.photoElapsedMs = Date.now()-started;
  const model = createOpenAIModel({apiKey,fetcher,media:report.media.items});
  const result = await runAgent({text:`${url}\n며칠 전에 받은 건데 오늘 열어보니 곰팡이가 피어 있어요.`,model,actions:{},timeoutMs:25000});
  report.answer = result.text;
  report.summaryPersisted = Boolean(model.summary());
  await sendCallback('mock-callback',result.text,{},async (_target, options)=>{
    report.callback = JSON.parse(options.body);
    return Response.json({errorCount:0});
  });
  report.checks = {
    photoReadable:report.media.items[0].status==='ok',
    apology:/죄송|사과|송구/.test(result.text),
    asksConsumption:/드셨|드신|먹었|섭취.*[?？]/s.test(result.text),
    asksSymptoms:/증상|이상|불편.*[?？]/s.test(result.text),
    asksOrder:/주문번호|주문 번호/.test(result.text),
    simpleText:report.callback.skillResponse.template.outputs.length===1 && typeof report.callback.skillResponse.template.outputs[0].simpleText.text==='string',
    under500:result.text.length<=500,
    noMediaSummary:!report.summaryPersisted,
  };
} catch {
  report.error='VERIFICATION_FAILED';
}
report.elapsedMs=Date.now()-started;
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/l11-image-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.error || Object.values(report.checks??{}).some(x=>!x)) process.exitCode=1;
