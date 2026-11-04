import {sessionBinding} from './member-session.mjs';
import {createMemberActions} from './member-actions.mjs';
import { reserveActionRead } from './action-budget.mjs';
import { calendarActions } from './business-calendar.mjs';
import { createOrderPaymentActions } from './order-payment-actions.mjs';
import { createRequestActions } from './request-actions.mjs';
import { attachCustomerRequestActions } from './customer-request-actions.mjs';
import { createCatalogQualityActions } from './catalog-quality-actions.mjs';
import { attachFulfillmentRequestActions } from './fulfillment-request-actions.mjs';
import { createReceiptReadActions } from './read-request-receipts.mjs';
import { escalationGuidance } from './submission-response.mjs';
import { hash } from './conversation-store.mjs';

const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const scopeId=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const tcId=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value);
const member=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
export function extractTestCaseId(text) {
  // Explicit metadata only; ordinary mentions of an order or another case are not selectors.
  const ids=[...text.matchAll(/(?:^|\n|\[)\s*(?:TC(?:\s*ID)?|테스트\s*케이스\s*ID|X-Aitop100-Test-Case-Id|id)\s*[:：=]\s*([^\s\]]+)/gi)].map(match=>match[1]);
  const command=text.trim().match(/^\/(?:조회|접수조회)\s+(\S+)/);
  if(command) ids.push(command[1]);
  if(ids.some(id=>!tcId(id)) || new Set(ids).size>1) throw new Error('INVALID_TEST_CASE_ID');
  return ids[0] ?? '';
}
export function matchesBoundCase(text,binding) {
  // Text can reject a mismatch but can never create or change a binding.
  const requested=[...text.matchAll(/(?:^|\n|\[)\s*(?:TC(?:\s*ID)?|테스트\s*케이스\s*ID|X-Aitop100-Test-Case-Id)\s*[:：=]\s*([A-Za-z0-9][A-Za-z0-9._-]{0,99})(?=\s|\]|$)/gi)].map(match=>match[1]);
  const command=text.trim().match(/^\/조회\s+(\S+)/);
  if(command) requested.push(command[1]);
  return requested.length===0 || (!!binding && requested.every(id=>id===binding.testCaseId));
}
export function resolveActionBinding(env,scope,now=Date.now()) {
  const raw=env?.ACTION_READ_BINDINGS;
  if(!scopeId(scope) || !Number.isFinite(now) || typeof raw!=='string' || raw.length>65536) return null;
  try {
    const bindings=JSON.parse(raw);
    if(!object(bindings) || Object.keys(bindings).length>500 || !Object.keys(bindings).every(scopeId)) return null;
    const binding=bindings[scope];
    if(!object(binding) || Object.keys(binding).length!==3 || !Object.hasOwn(binding,'testCaseId') ||
      !Object.hasOwn(binding,'memberId') || !Object.hasOwn(binding,'expiresAt') ||
      !tcId(binding.testCaseId) || !member(binding.memberId) || typeof binding.expiresAt!=='string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(binding.expiresAt)) return null;
    const expiry=Date.parse(binding.expiresAt);
    if(!Number.isFinite(expiry) || expiry<=now || new Date(expiry).toISOString().replace('.000Z','Z')!==binding.expiresAt.replace('.000Z','Z')) return null;
    return Object.freeze({...binding});
  } catch {return null;}
}

// The expiry clock is actual server time; it is not the scenario calendar date.
export async function createScopedActions({env,scope,store,text='',fetcher=fetch,now=Date.now}) {
  const requested=extractTestCaseId(text);
  if(requested) store.rememberCase(requested);
  const selectedCase=store.testCaseId();
  let binding=resolveActionBinding(env,scope,now()) ?? await sessionBinding(env,scope,store,now());
  // TC is conversation routing metadata, never proof of membership.
  if(binding && selectedCase && binding.testCaseId!==selectedCase) binding=null;
  const activeCase=selectedCase || binding?.testCaseId || '';
  const beforeCall=async signal=>{
    signal?.throwIfAborted();
    const current=resolveActionBinding(env,scope,now()) ?? await sessionBinding(env,scope,store,now());
    if(!activeCase || (selectedCase ? store.testCaseId()!==activeCase : !current || current.testCaseId!==activeCase))
      throw new Error('ACTION_BINDING_EXPIRED');
    // Per-user guard plus a shared reservation for each outgoing HTTP request.
    if(!store.allow('action-minute',20,60000)) throw new Error('ACTION_RATE_LIMIT');
    await store.storage.sync();await reserveActionRead(env,signal);signal?.throwIfAborted();
  };
  const privateActions=activeCase ? createOrderPaymentActions({token:env.ACTION_TOKEN,testCaseId:activeCase,
    memberId:binding?.memberId,conversationPolicy:Boolean(selectedCase),fetcher,beforeCall}) : {};
  const readOrders=new Map();
  const reads=Object.fromEntries(Object.entries(privateActions).map(([name,action])=>[name,{...action,execute:async(args,options)=>{
    const matched=store.lookup();
    const memberId=matched.testCaseId===activeCase ? matched.resolvedMemberId : null;
    if(memberId && name==='list_my_orders' && args.member_id!==memberId)return {status:'forbidden'};
    if(name==='read_order') readOrders.delete(args.order_no);
    if(name==='list_my_orders') readOrders.clear();
    const result=await action.execute(args,options);
    if(memberId) {
      const owners=[result.member_id,result.order?.member_id,...(result.orders??[]).map(order=>order.member_id)].filter(Boolean);
      if(owners.some(owner=>owner!==memberId))return {status:'forbidden'};
    }
    if(result.status==='ok') {
      if(result.order) readOrders.set(result.order.order_no,result.order);
      for(const order of result.orders??[]) readOrders.set(order.order_no,order);
    }
    return result;
  }}]));
  const requestReceipts=[],receiptLookups=[];
  const canUseOrder=order=>{
    const matched=store.lookup();
    return !!order && !(matched.testCaseId===activeCase && matched.resolvedMemberId && order.member_id!==matched.resolvedMemberId);
  };
  const getReadOrder=id=>{
    const order=readOrders.get(id),matched=store.lookup();
    return matched.testCaseId===activeCase && matched.resolvedMemberId && order?.member_id!==matched.resolvedMemberId ? undefined : order;
  };
  const config={token:env.ACTION_TOKEN,testCaseId:activeCase,fetcher,beforeCall,
    onSubmitted:r=>requestReceipts.push(r),canUseOrder};
  const writes=Object.keys(privateActions).length ? createRequestActions({...config,getOrder:getReadOrder}) : {};
  if(!Object.keys(privateActions).length) binding=null;
  const bindingKey=binding ? await hash(JSON.stringify([binding.testCaseId,binding.memberId])) :
    selectedCase ? await hash(JSON.stringify([selectedCase,null])) : '';
  store.bindCase(bindingKey);
  await store.storage.sync();
  const members=Object.keys(privateActions).length ? createMemberActions({token:env.ACTION_TOKEN,testCaseId:activeCase,text,store,fetcher,beforeCall}) : {};
  const available=Object.keys(privateActions).length>0;
  const catalog=available?createCatalogQualityActions(config):{};
  const customerActions=available?attachCustomerRequestActions({...reads,...catalog},config):reads;
  const fulfillment=available?attachFulfillmentRequestActions(customerActions,config):customerActions;
  const receiptActions=available?createReceiptReadActions({...config,getOrder:getReadOrder}):{};
  const receiptReads=Object.fromEntries(Object.entries(receiptActions).map(([name,action])=>[name,{...action,execute:async(args,options)=>{
    for(let i=receiptLookups.length-1;i>=0;i--)if(receiptLookups[i].source===name&&receiptLookups[i].order_no===args.order_no)receiptLookups.splice(i,1);
    const result=await action.execute(args,options);
    if(result.status==='ok') {
      if(name==='read_refund_requests')for(const r of result.refunds)receiptLookups.push({...r,kind:'refund',source:name,order_no:args.order_no});
      else receiptLookups.push({...result,kind:'escalation',source:name,
        guidance:escalationGuidance(result.safety?.symptoms?'섭취 후 이상 증상':result.safety?.mold?'곰팡이':'',result.lane)});
    }
    return result;
  }}]));
  const readOnlyReceiptLookup=/(?:^|\n)\s*\/접수조회(?:\s|$)/.test(text);
  const registry=readOnlyReceiptLookup?{...calendarActions,...members,...(reads.read_order?{read_order:reads.read_order}:{}),...receiptReads}:
    {...calendarActions,...fulfillment,...members,...writes,...receiptReads};
  return {actions:Object.freeze(registry),requestReceipts,readOnlyReceiptLookup,
    get receiptLookups(){return receiptLookups.filter(r=>canUseOrder(getReadOrder(r.order_no)));},binding,bindingKey,testCaseId:activeCase};
}

export function hasActiveActionBindings(env,now=Date.now()) {
  const raw=env?.ACTION_READ_BINDINGS;
  if(typeof raw!=='string' || raw.length>65536)return false;
  try {
    const entries=JSON.parse(raw);
    if(!object(entries) || Object.keys(entries).length>500)return false;
    return Object.keys(entries).some(scope=>resolveActionBinding(env,scope,now)!==null);
  }catch{return false;}
}
