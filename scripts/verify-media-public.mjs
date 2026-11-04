// Only supplied public TC files and OpenAI inference. No business API or Kakao calls.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {prepareMediaInput} from '../src/media-input.mjs';
import {createOpenAIModel} from '../src/openai-model.mjs';
import {SYSTEM_POLICY} from '../src/agent.mjs';
const env=await readFile('.env.local','utf8');
const apiKey=env.match(/^OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
if(!apiKey)throw Error('KEY_NOT_CONFIGURED');
const cases=[['L-11','image','https://t1.kakaocdn.net/aitop100/aitop100/dist/yQbPeyvr5OIfWZ83WRNraw.jpg'],['Y-07-b','audio','https://t1.kakaocdn.net/aitop100/aitop100/dist/IhTu8IcHwTNWOIZtWlr_vQ.m4a']];
const report=[];
for(const [tc,kind,url]of cases){
  const started=Date.now(),calls=[];
  const fetcher=async(target,init)=>{
    const u=new URL(target);if(!['t1.kakaocdn.net','api.openai.com'].includes(u.hostname))throw Error('UNEXPECTED_DESTINATION');
    const response=await fetch(target,init);calls.push({host:u.hostname,path:u.hostname==='api.openai.com'?u.pathname:'public-file',method:init.method,status:response.status});return response;
  };
  const evidence=await prepareMediaInput({text:url,apiKey,fetcher,signal:AbortSignal.timeout(20000)});
  let answer=null;
  if(evidence.items.some(x=>x.status==='ok')){
    const model=createOpenAIModel({apiKey,fetcher,media:evidence.items});
    const result=await model({system:SYSTEM_POLICY,user:`TC ID: ${tc}\n${url}\n파일 내용을 확인하고 필요한 다음 질문을 해주세요.`,tools:[],history:[],signal:AbortSignal.timeout(20000)});
    answer={text:result.text,length:result.text?.length,summaryPersisted:Boolean(model.summary())};
  }
  report.push({tc,kind,evidence,answer,calls,elapsedMs:Date.now()-started});
  console.log(JSON.stringify({tc,status:evidence.items[0]?.status,answerLength:answer?.length,apiStatuses:calls.map(c=>c.status)}));
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/media-public-live-verification.json',JSON.stringify({observedAt:new Date().toISOString(),businessWrites:0,kakaoCalls:0,report},null,2));
if(report.some(x=>x.evidence.items[0]?.status!=='ok'||!x.answer?.text||x.answer.length>500))process.exitCode=1;
