import {verifyMemberMessage} from './member-session.mjs';
import { reserveActionRead } from './action-budget.mjs';
import { runAgent, userMessageFor } from './agent.mjs';
import { createOpenAIModel, MODEL, redact } from './openai-model.mjs';
import { ConversationStore, hash, writePolicy } from './conversation-store.mjs';
import { truncateText } from './data.mjs';
import { hasActiveActionBindings, createScopedActions } from './action-context.mjs';
import { checkActionConnection } from './action-diagnostic.mjs';
import { calendarActions } from './business-calendar.mjs';
import { formatSubmissionResponse, formatReceiptLookupResponse } from './submission-response.mjs';
import { mediaLinks, prepareMediaInput } from './media-input.mjs';

// Static export is the public calendar only. Each conversation builds its private
// action registry with createScopedActions; credentials never enter a global registry.
export const actions = calendarActions;

export function parseEvent(raw) {
  // Kakao Long message IDs exceed JS's safe integer range. Preserve their exact digits.
  return JSON.parse(raw.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,token => {
    if(token[0] !== '"' && /^-?\d{16,}$/.test(token)) return JSON.stringify(token);
    return token;
  }));
}

export async function authenticated(actual, expected) {
  if(!actual || !expected || actual.length>1024) return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(expected),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(expected));
  return crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(actual));
}

export async function identify(event) {
  const d=event?.d;
  if(event?.op!==0 || event?.t!=='MESSAGE_CREATE' || !d?.callbackToken) return null;
  const valid=value=>typeof value==='string' && value.length>0 && value.length<=200;
  const messageId=typeof d.id==='number' && Number.isSafeInteger(d.id) ? String(d.id) : d.id;
  if(!valid(d.botGroupKey)||!valid(d.botUserKey)||!valid(messageId)||!/^\d+$/.test(messageId) ||
     typeof d.content!=='string'||typeof d.callbackToken!=='string'||d.callbackToken.length>4096) throw new Error('Invalid identity');
  return {scope:await hash(JSON.stringify([d.botGroupKey,d.botUserKey])),eventId:await hash(messageId)};
}

export async function sendCallback(token,text,env,fetcher=fetch) {
  // Final boundary covers normal, error, throttled and reset replies after redaction.
  text=truncateText(redact(text,[env.ACTION_TOKEN,env.OPENAI_API_KEY,env.BOT_TOKEN,env.WEBHOOK_SECRET,token]),500);
  const response=await fetcher('https://kapi.kakao.com/v1/bot/callback',{
    method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:`KakaoAK ${env.BOT_TOKEN}`,'X-Bot-Callback-Token':token},
    body:JSON.stringify({skillResponse:{version:'2.0',template:{outputs:[{simpleText:{text}}]}}}),signal:AbortSignal.timeout(4500),
  });
  if(!response.ok) throw new Error('CALLBACK_FAILED');
  const result=await response.json();
  if(result.errorCount>0) throw new Error('CALLBACK_FAILED');
}

export class Conversation {
  constructor(ctx,env) {
    this.ctx=ctx;this.env=env;this.store=new ConversationStore(ctx.storage,Date.now,writePolicy(env));
    this.tail=Promise.resolve();this.pending=0;
  }
  async fetch(request) {
    const {event,identity,receivedAt}=await request.json();
    const {eventId}=identity;
    if(!this.store.claim(eventId)) return Response.json({duplicate:true});
    // Persist before executing AI, actions, or callbacks. Never persist message/token bodies.
    await this.ctx.storage.sync();
    await this.store.schedule();
    if(this.pending>=2 || !this.store.allow('user-minute',10,60000)) {
      await this.deliver(eventId,event.d.callbackToken,'요청이 많습니다. 앞선 답변을 확인하고 잠시 후 다시 보내 주세요.');
      return Response.json({limited:true});
    }
    this.pending++;
    const work=this.tail.then(()=>this.process(event,identity,receivedAt));
    this.tail=work.catch(()=>{});
    try {await work;return Response.json({processed:true});}
    finally {this.pending--;}
  }
  async deliver(eventId,token,text) {
    // Claim the callback durably before transmission; uncertainty never causes a retry.
    this.store.mark(eventId,'callback-attempted');
    await this.ctx.storage.sync();
    try {
      await sendCallback(token,text,this.env);
      this.store.mark(eventId,'delivered');
      return true;
    } catch {
      this.store.mark(eventId,'callback-unknown');
      console.warn('callback_failed');
      return false;
    }
  }
  async process(event,identity,receivedAt) {
    const text=event.d.content;
    if(text.trim()==='/초기화') {
      this.store.remember('');this.store.rememberLookup({});this.store.clearMemberSession();
      await this.deliver(identity.eventId,event.d.callbackToken,'대화 기억을 초기화했습니다.');
      await this.store.schedule();return;
    }
    // Bounded model/tool budget with queue and callback headroom below 60 seconds.
    const budget=Math.min(45000,receivedAt+50000-Date.now());
    if(budget<1000) {
      await this.deliver(identity.eventId,event.d.callbackToken,'앞선 요청 처리로 대기 시간이 길어졌습니다. 잠시 후 다시 요청해 주세요.');return;
    }
    let reply, nextSummary='', model,scoped,writeAttempts=0,media={items:[],calls:0};
    try {
      if(text.length>4000) throw new Error('INPUT_TOO_LONG');
      if(text.trim()==='/접수상태') {
        const rows=[];
        for(const [name,label] of [['request_address_change','배송지 변경'],['request_cash_receipt','현금영수증']]) {
          const s=await this.store.requestStatus(name);
          rows.push(`${label}: 접수응답 확인 ${s.success}건, 미실행 거절 ${s.rejected}건, 결과 불확실 ${s.unknown}건`);
        }
        await this.deliver(identity.eventId,event.d.callbackToken,'이 대화의 보존기간 내 실행 기록입니다. '+rows.join('. ')+'. 외부 상태를 새로 조회하거나 재접수하지 않았습니다.');
        await this.store.schedule();return;
      }
      if(text.trim()==='/연결코드') {
        const code=identity.scope.match(/.{1,8}/g).join('-');
        await this.deliver(identity.eventId,event.d.callbackToken,'운영자용 대화 연결코드: '+code);
        await this.store.schedule();return;
      }
      const verification=await verifyMemberMessage({text,env:this.env,scope:identity.scope,store:this.store});
      if(verification) {await this.deliver(identity.eventId,event.d.callbackToken,verification);await this.store.schedule();return;}
      if(text.trim()==='/액션연결확인') {
        const limiter=this.env.USAGE.get(this.env.USAGE.idFromName('action-usage'));
        const allowed=await limiter.fetch('https://internal/diagnostic',{method:'POST'});
        let message='연결 확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
        if(allowed.ok) {
          try {await checkActionConnection(this.env.ACTION_TOKEN,fetch,signal=>reserveActionRead(this.env,signal));message='Cloudflare에서 액션 서버 인증과 주문·배송 조회가 모두 성공했습니다. 공개 예시의 읽기 전용 연결 검사이며 실제 고객 주문 처리 완료는 아닙니다.';}
          catch {message='액션 서버 연결 확인에 실패했습니다. 인증·이용 시간·TC 또는 서버 상태를 확인해야 합니다.';}
        }
        await this.deliver(identity.eventId,event.d.callbackToken,message);await this.store.schedule();return;
      }
      const reserveModel=async signal=>{
        const limiter=this.env.USAGE.get(this.env.USAGE.idFromName('model-usage'));
        const response=await limiter.fetch('https://internal/reserve',{method:'POST',signal});
        if(!response.ok)throw new Error('RATE_LIMIT');
      };
      if(mediaLinks(text).length) {
        media=await prepareMediaInput({text,apiKey:this.env.OPENAI_API_KEY,beforeCall:reserveModel,signal:AbortSignal.timeout(Math.max(1,Math.min(20000,receivedAt+45000-Date.now())))});
        // A failed photo must not discard a customer's written safety complaint.
        const writtenText=mediaLinks(text).reduce((value,link)=>value.replaceAll(link.url,''),text)
          .replace(/(?:^|\n)\s*TC(?:\s*ID)?\s*:[^\n]*/gi,'')
          .replace(/(?:^|\n)\s*(?:image|audio)\s*:/gi,'').trim();
        if(!media.items.some(x=>x.status==='ok') && !writtenText) {
          await this.deliver(identity.eventId,event.d.callbackToken,media.items[0]?.text??'파일 내용을 확인하지 못했습니다. 내용을 글로 알려 주세요.');
          console.log(JSON.stringify({event:'media_unavailable',mediaCalls:media.calls}));await this.store.schedule();return;
        }
      }
      scoped=await createScopedActions({env:this.env,scope:identity.scope,store:this.store,text});
      if(media.items.some(x=>x.kind==='audio'||x.status!=='ok'))scoped.actions=Object.fromEntries(Object.entries(scoped.actions).filter(([,action])=>action.kind!=='write'));
      if(!scoped.actions.read_order && /^\/조회\s/.test(text.trim())) {
        await this.deliver(identity.eventId,event.d.callbackToken,'TC는 저장했지만 본인 조회 권한이 아직 연결되지 않았습니다. 운영자 계정 연결 후 /회원확인 명령과 본인 전체 연락처로 확인해 주세요.');
        await this.store.schedule();return;
      }
      model=createOpenAIModel({apiKey:this.env.OPENAI_API_KEY,summary:this.store.summary(),secrets:[this.env.ACTION_TOKEN,this.env.BOT_TOKEN,this.env.WEBHOOK_SECRET,event.d.callbackToken],media:media.items,
        beforeCall:reserveModel,
      });
      const result=await runAgent({text,model,actions:scoped.actions,context:{userId:event.d.botUserKey,groupId:event.d.botGroupKey,eventId:identity.eventId,testCaseId:scoped.testCaseId},
        timeoutMs:Math.max(1,Math.min(budget,receivedAt+50000-Date.now())),maxSteps:10,writeJournal:this.store.journal()});
      reply=result.text;
      writeAttempts=result.writes?.length??0;
      reply=formatSubmissionResponse(result.writes,scoped.requestReceipts,{outcomeUnknown:result.outcomeUnknown,customerText:text})??reply;
      if(scoped.readOnlyReceiptLookup)reply=formatReceiptLookupResponse(scoped.receiptLookups,{customerText:text})??reply;
      if(!result.outcomeUnknown) nextSummary=model.summary();
    } catch(error) {
      reply=text.length>4000 ? '메시지를 4,000자 이내로 줄여 주세요.' : error.message==='INVALID_TEST_CASE_ID' ? 'TC ID를 올바른 형식으로 하나만 알려주세요.' : userMessageFor(error);
      writeAttempts=error.writes?.length??0;
      if(scoped?.requestReceipts?.length)
        reply=formatSubmissionResponse(error.writes??[],scoped.requestReceipts,{outcomeUnknown:error.outcomeUnknown,customerText:text})??reply;
      if(scoped?.readOnlyReceiptLookup)reply=formatReceiptLookupResponse(scoped.receiptLookups,{customerText:text})??reply;
    }
    reply=redact(reply,[this.env.ACTION_TOKEN,this.env.OPENAI_API_KEY,this.env.BOT_TOKEN,this.env.WEBHOOK_SECRET,event.d.callbackToken]);
    const delivered=await this.deliver(identity.eventId,event.d.callbackToken,reply);
    if(delivered && nextSummary) this.store.remember(nextSummary);
    console.log(JSON.stringify({event:'processed',delivered,readOnlyReceipts:Boolean(scoped?.readOnlyReceiptLookup),writeAttempts,mediaCalls:media.calls,...model?.usage()}));
    await this.store.schedule();
  }
  async alarm() {this.store.clean();await this.store.schedule();}
}

export class UsageBudget {
  constructor(ctx,env) {this.ctx=ctx;this.env=env;this.store=new ConversationStore(ctx.storage);}
  async fetch(request) {
    if(request && new URL(request.url).pathname==='/diagnostic') {
      const allowed=this.store.allow('diagnostic-minute',3,60000) && this.store.allow('diagnostic-day',10,86400000);
      await this.ctx.storage.sync();await this.store.schedule();
      return new Response(null,{status:allowed?204:429});
    }
    if(request && new URL(request.url).pathname==='/action') {
      this.store.clean();
      const allowed=this.store.allow('action-minute',90,60000);
      await this.ctx.storage.sync();await this.store.schedule();
      return new Response(null,{status:allowed?204:429});
    }
    // Conservative practice caps, independent of the provider's much higher allowance.
    const minute=Number(this.env.MODEL_CALLS_PER_MINUTE ?? 60);
    const daily=Number(this.env.MODEL_CALLS_PER_DAY ?? 2000);
    if(!Number.isInteger(minute)||!Number.isInteger(daily)||minute<1||daily<1) return new Response(null,{status:503});
    this.store.clean();
    const allowed=this.store.allow('minute',minute,60000) && this.store.allow('day',daily,86400000);
    await this.ctx.storage.sync();await this.store.schedule();
    return new Response(null,{status:allowed?204:429});
  }
  async alarm() {this.store.clean();await this.store.schedule();}
}

export default {
  async fetch(request,env,ctx) {
    const path=new URL(request.url).pathname;
    if(request.method==='GET' && path==='/health') return Response.json({status:'ok',mode:'agent-practice',model:MODEL,memoryMinutes:30,actionTokenConfigured:Boolean(env.ACTION_TOKEN),actionLookup:Boolean(env.ACTION_TOKEN),actionMode:'conversation-tc-read-write',actionBindingsConfigured:hasActiveActionBindings(env),maxSteps:10,
      configured:Boolean(env.BOT_TOKEN&&env.WEBHOOK_SECRET&&env.OPENAI_API_KEY&&env.CONVERSATIONS&&env.USAGE)});
    if(path==='/action-check' && request.method==='POST') {
      if(!await authenticated(request.headers.get('X-Webhook-Secret'),env.WEBHOOK_SECRET) &&
         !await authenticated(request.headers.get('Authorization'),env.ACTION_TOKEN ? 'Bearer '+env.ACTION_TOKEN : '')) return new Response('Unauthorized',{status:401});
      const limiter=env.USAGE.get(env.USAGE.idFromName('action-usage'));
      const allowed=await limiter.fetch('https://internal/diagnostic',{method:'POST'});
      if(!allowed.ok) return new Response('Rate limited',{status:429});
      try {return Response.json(await checkActionConnection(env.ACTION_TOKEN,fetch,signal=>reserveActionRead(env,signal)));}
      catch {return Response.json({authenticated:false,readOnly:true},{status:502});}
    }
    if(path!=='/webhook') return new Response('Not found',{status:404});
    if(request.method!=='POST') return new Response('Method not allowed',{status:405});
    if(!env.BOT_TOKEN||!env.WEBHOOK_SECRET||!env.CONVERSATIONS||!env.USAGE) return new Response('Not configured',{status:503});
    if(!await authenticated(request.headers.get('X-Webhook-Secret'),env.WEBHOOK_SECRET)) return new Response('Unauthorized',{status:401});
    if(Number(request.headers.get('content-length'))>65536) return new Response('Too large',{status:413});
    let event,identity;
    try {
      const raw=await request.text();
      if(new TextEncoder().encode(raw).length>65536) return new Response('Too large',{status:413});
      event=parseEvent(raw);identity=await identify(event);
    } catch {return new Response('Invalid event',{status:400});}
    if(identity) {
      const receivedAt=Date.now();
      const stub=env.CONVERSATIONS.get(env.CONVERSATIONS.idFromName(identity.scope));
      ctx.waitUntil(stub.fetch('https://internal/message',{method:'POST',body:JSON.stringify({event,identity,receivedAt})})
        .then(response=>{if(!response.ok) console.warn('conversation_failed');})
        .catch(()=>console.warn('conversation_failed')));
    }
    return new Response(null,{status:204});
  },
};
