import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createOrderPaymentActions } from '../src/order-payment-actions.mjs';
import { runAgent } from '../src/agent.mjs';

// Explicit opt-in to an infrastructure smoke test, NOT the L-05 scenario evaluation.
// Public L-05.md supplies the approval number. Bootstrap owner is a test fixture,
// never proof of a caller's identity and never a production binding.
try {
  if(process.argv[2]!=='--public-l05-read-only') throw new Error('EXPLICIT_FIXTURE_REQUIRED');
  const token=(await readFile(process.env.ACTION_TOKEN_FILE ?? join(homedir(),'.codex','secrets','aitop100-action-token.txt'),'utf8')).trim();
  if(!/^aitop100_\S+$/.test(token)) throw new Error('INVALID_TOKEN');
  const testCaseId='L-05', approvalNo='PAY-3706-0003';
  let calls=0;
  const statuses=[];
  const fetcher=async(url,options)=>{
    if(new URL(url).origin!=='https://gyodong-mall-action.aitop100.org' || options.method!=='GET') throw new Error('READ_ONLY');
    calls++;
    const response=await fetch(url,{...options,signal:options.signal ?? AbortSignal.timeout(8000)});
    statuses.push(response.status);
    return response;
  };
  const bootstrap=async path=>{
    const response=await fetcher('https://gyodong-mall-action.aitop100.org'+path,{method:'GET',redirect:'manual',headers:{Authorization:`Bearer ${token}`,'X-Aitop100-Test-Case-Id':testCaseId}});
    if(response.status!==200) throw new Error('BOOTSTRAP_FAILED');
    return response.json();
  };
  const payment=await bootstrap('/api/payments/'+approvalNo);
  if(payment.approval_no!==approvalNo || !/^[A-Za-z0-9_-]+$/.test(payment.order_no ?? '')) throw new Error('FIXTURE_FAILED');
  const order=await bootstrap('/api/orders/'+payment.order_no);
  if(order.order_no!==payment.order_no || !order.payment_refs?.includes(approvalNo)) throw new Error('LINK_FAILED');
  const actions=createOrderPaymentActions({token,testCaseId,memberId:order.member_id,fetcher});
  const decisions=[
    {type:'action',name:'read_order',arguments:{order_no:order.order_no}},
    {type:'action',name:'read_payment',arguments:{approval_no:approvalNo}},
    {type:'action',name:'list_order_payments',arguments:{order_no:order.order_no}},
  ];
  let verified=0;
  const result=await runAgent({text:'공개 연습자료의 주문·결제 읽기 연결 검사',actions,timeoutMs:25000,maxSteps:4,
    model:async({history})=>{
      if(history.length){
        const last=history.at(-1);
        if(last.error || last.result?.status!=='ok') throw new Error('TOOL_CHECK_FAILED');
        const serialized=JSON.stringify(last.result);
        if(/"(?:recipient_name|shipping_address|payer_name|card_last4|member_id)"/.test(serialized)) throw new Error('PRIVATE_FIELDS');
        verified++;
      }
      return decisions[history.length] ?? {type:'answer',text:'ORDER_PAYMENT_READ_OK'};
    }});
  if(result.text!=='ORDER_PAYMENT_READ_OK' || verified!==3) throw new Error('ROUND_TRIP_FAILED');
  console.log(JSON.stringify({verified:true,testCaseId,calls,httpStatuses:statuses,agentTools:3,mutation:false,scenarioPass:false,productionIdentityVerified:false}));
} catch {
  console.error('ORDER_PAYMENT_CHECK_FAILED: inspect configuration, availability and schema; credentials and response bodies are withheld.');
  process.exitCode=1;
}
