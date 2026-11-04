// User-authorized one-time public L-11 practice verification; never resets data.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createRequestActions} from '../src/request-actions.mjs';
import {createOrderPaymentActions} from '../src/order-payment-actions.mjs';
import {runAgent} from '../src/agent.mjs';
import {ConversationStore} from '../src/conversation-store.mjs';

const mode=process.argv[2];
if(!['preflight','execute','verify'].includes(mode)) throw new Error('Use preflight, execute or verify');
const dir=fileURLToPath(new URL('../docs/development/2026-10-31/live-L11/',import.meta.url));
await mkdir(dir,{recursive:true});
const token=(await readFile(join(homedir(),'.codex','secrets','aitop100-action-token.txt'),'utf8')).trim();
const tc='L-11',lotId='KD-WTM-370624-03',origin='https://gyodong-mall-action.aitop100.org';
const calls=[];
async function request(path,{allow404=false}={}) {
  const response=await fetch(origin+path,{redirect:'manual',headers:{Authorization:`Bearer ${token}`,'X-Aitop100-Test-Case-Id':tc},signal:AbortSignal.timeout(8000)});
  calls.push({method:'GET',path:path.startsWith('/api/members')?'/api/members?name=[fixture]':path,status:response.status});
  if(allow404 && response.status===404)return null;
  if(response.status!==200)throw new Error('READ_HTTP_'+response.status);
  return response.json();
}
try {
  if(mode==='verify') {
    const accepted=[];
    for(const name of ['refund','escalation']) {
      const record=JSON.parse(await readFile(join(dir,name+'.json'),'utf8'));
      if(!record.receipt)throw new Error('RECEIPT_UNKNOWN_DO_NOT_RETRY');
      const value=name==='refund'?await request('/api/refunds?order_no='+record.body.order_no):await request('/api/escalations/'+record.receipt.escalation_id);
      const row=name==='refund'?value.find(r=>r.refund_id===record.receipt.refund_id):value;
      if(!row || row.request_status!=='SUBMITTED' || Object.entries(record.body).some(([k,v])=>row[k]!==v))throw new Error('PERSISTENCE_MISMATCH');
      accepted.push({kind:name,id:record.receipt.refund_id??record.receipt.escalation_id,request_status:row.request_status,...(name==='escalation'?{review_status:row.status}:{amount:row.amount})});
    }
    const out={verifiedAt:new Date().toISOString(),tc,accepted,calls,postCount:0};
    await writeFile(join(dir,'verification.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
  } else {
    const members=await request('/api/members?name='+encodeURIComponent('강은비'));
    // Public fixture matching for this test, not independent customer authentication.
    const candidates=members.filter(m=>String(m.phone??'').replace(/\D/g,'').endsWith('4165'));
    if(candidates.length!==1)throw new Error('FIXTURE_MEMBER_AMBIGUOUS');
    const memberId=candidates[0].member_id;
    const orders=await request('/api/orders?member_id='+encodeURIComponent(memberId));
    const possible=orders.filter(o=>o.member_id===memberId && o.amount===34900 && o.items.some(i=>i.sku.startsWith('WTM')));
    if(possible.length!==1)throw new Error('FIXTURE_ORDER_AMBIGUOUS');
    const order=possible[0];
    const shipments=await request('/api/shipments?order_no='+order.order_no);
    if(!shipments.some(s=>s.order_no===order.order_no && s.status==='DELIVERED' && s.items.some(i=>i.lot_id===lotId)))throw new Error('LOT_DELIVERY_NOT_CONFIRMED');
    const lot=await request('/api/lots/'+lotId);
    const investigation=await request('/api/lots/'+lotId+'/investigation',{allow404:true});
    const tickets=await request('/api/tickets?lot_id='+lotId);
    const refunds=await request('/api/refunds?order_no='+order.order_no);
    if(lot.lot_id!==lotId || investigation!==null || !Array.isArray(tickets) || !tickets.some(t=>t.lot_id===lotId && /곰팡이|MOLD/i.test(t.content)))throw new Error('L11_EVIDENCE_CHANGED');
    const evidence={tc,orderNo:order.order_no,memberId,amount:order.amount,status:order.status,lotId,delivered:true,investigation:null,priorLotTickets:tickets.length,existingRefunds:refunds.map(r=>r.refund_id),calls};
    await writeFile(join(dir,'preflight.json'),JSON.stringify(evidence,null,2));
    if(mode==='preflight'){console.log(JSON.stringify(evidence));}
    else {
      if(refunds.length || order.refund_ids.length)throw new Error('EXISTING_REFUND_DO_NOT_OVERWRITE');
      const safeFetch=async(url,init)=>{
        const path=new URL(url).pathname;
        if(init.method!=='POST')return fetch(url,init);
        const name=path==='/api/refunds'?'refund':path==='/api/escalations'?'escalation':null;
        if(!name)throw new Error('POST_NOT_ALLOWED');
        const record={tc,path,body:JSON.parse(init.body),attemptedAt:new Date().toISOString(),state:'reserved-unknown'};
        const file=join(dir,name+'.json');
        await writeFile(file,JSON.stringify(record,null,2),{flag:'wx'}); // crash/uncertainty prohibits another POST
        const response=await fetch(url,init);
        record.httpStatus=response.status;
        try {const body=await response.clone().json();
          if(response.status===200 && body.request_status==='SUBMITTED') {record.receipt=body;record.state='submitted';}
        }catch{}
        await writeFile(file,JSON.stringify(record,null,2));
        calls.push({method:'POST',path,status:response.status});return response;
      };
      let confirmed;
      const reads=createOrderPaymentActions({token,testCaseId:tc,memberId,fetcher:safeFetch});
      const readOrder={...reads.read_order,execute:async(args,opt)=>{const result=await reads.read_order.execute(args,opt);if(result.status==='ok')confirmed=result.order;return result;}};
      const actions={read_order:readOrder,...createRequestActions({token,testCaseId:tc,fetcher:safeFetch,getOrder:id=>confirmed?.order_no===id?confirmed:null})};
      const refundArgs={order_no:order.order_no,amount:34900,reason:'공개 L-11: 곰팡이 하자, 고객이 선택한 전액환불 신청',ownership_confirmed:true,policy_basis:'공개 L-11 고객 환불 선택; 회원 귀속·배송완료·해당 로트 대조; 사진 곰팡이 명백; 환불규정 제4조 전액34900원 확인'};
      const escalationArgs={lane:'LANE2_HANDOFF',reason:`주문 ${order.order_no}, 로트 ${lotId}. 이번 곰팡이 신고와 기존 신고를 합한 복수 신고, 로트 조사 기록 부재 확인. 안전 확인 및 판매자·공급 확인 요청. 원인과 책임 미확정.`,policy_basis:'공개 L-11 기대 대응5: 동일 로트 복수 이상 신고와 조사 부재는 환불과 별도로 담당 확인 신청'};
      const db=new DatabaseSync(join(dir,'journal.sqlite'));
      const storage={sql:{exec(q,...a){const rows=db.prepare(q).all(...a);return {toArray:()=>rows};}},sync:async()=>{},setAlarm:async()=>{},deleteAlarm:async()=>{}};
      const store=new ConversationStore(storage);
      const result=await runAgent({text:'사용자가 승인한 공개 L-11 실제 신청 접수 검증',actions,timeoutMs:25000,maxSteps:4,writeJournal:store.journal(),model:async({history})=>{
        if(history.some(h=>h.error || h.value?.status==='forbidden'))throw new Error('STOP_NO_RETRY');
        if(history.length===0)return {type:'action',name:'read_order',arguments:{order_no:order.order_no}};
        if(history.length===1)return {type:'action',name:'request_refund',arguments:refundArgs};
        if(history.length===2)return {type:'action',name:'request_escalation',arguments:escalationArgs};
        return {type:'answer',text:'환불 신청과 담당자 확인 신청이 접수되었습니다. 실제 환불·승인 완료가 아닙니다.'};
      }});
      db.close();
      const out={executedAt:new Date().toISOString(),tc,orderNo:order.order_no,result,calls,model:'deterministic verification driver, not live LLM',reset:false};
      await writeFile(join(dir,'execution.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
    }
  }
}catch(error){console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(error.message)?error.message:'VERIFICATION_FAILED',calls,warning:'Do not repeat writes; inspect durable receipt ledger first.'}));process.exitCode=1;}
