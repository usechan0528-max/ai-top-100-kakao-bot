import { createCompetitionActions, validTestCaseId } from './competition-actions.mjs';
import { runAgent } from './agent.mjs';

// Local input convention; the contest's exact message envelope is not documented.
export function advanceLookup(text, previous = {}) {
  const command = text.trim().match(/^\/조회\s+(\S+)\s+([A-Za-z0-9_-]{1,100})$/);
  const tcMatches = [...text.matchAll(/(?:^|\n|\[)\s*(?:TC(?:\s*ID)?|테스트\s*케이스\s*ID|X-Aitop100-Test-Case-Id|id)\s*[:：=]\s*([A-Za-z0-9][A-Za-z0-9._-]{0,99})(?=\s|\]|$)/gi)].map(m=>m[1]);
  const orderMatches = [...text.matchAll(/(?:주문\s*번호|order_no)\s*[:：=]?\s*([A-Za-z0-9_-]{1,100})(?=\s|[,.!?。]|$)/gi)].map(m=>m[1]);
  if(command) {tcMatches.push(command[1]);orderMatches.push(command[2]);}
  if(new Set(tcMatches).size>1 || new Set(orderMatches).size>1) return {state:{},reply:'조회할 TC ID와 주문번호를 각각 하나만 알려주세요.'};
  const tc=tcMatches[0];
  let state=tc && tc!==previous.testCaseId ? {testCaseId:tc} : {...previous};
  if(tc && !validTestCaseId(tc)) return {state:{},reply:'TC ID 형식을 확인해 주세요.'};
  if(tc) state.testCaseId=tc;
  const order=orderMatches[0];
  if(order && order!==state.orderNo) {state.orderNo=order;state.confirmed=false;state.pending=false;}
  if(/다른\s*(?:사람|계정)|타인|남의|친구.*주문/.test(text)) return {state:{testCaseId:state.testCaseId},reply:'다른 분의 주문 정보는 안내할 수 없습니다. 본인 주문으로 문의해 주세요.'};
  if(state.pending && /^(네|예|응|맞아요|맞습니다|확인|조회해\s*주세요|내\s*주문(?:이\s*맞아요|입니다)?)[.!\s]*$/.test(text.trim())) {
    state.confirmed=true;state.pending=false;return {state,ready:true};
  }
  if(!command && !tc && !order && !/(?:주문|배송|송장).*(?:조회|상태|어디|확인)|(?:조회|확인).*(?:주문|배송)/.test(text)) return {state};
  if(!state.testCaseId || !state.orderNo) return {state,reply:!state.testCaseId ? '조회에 필요한 TC ID와 대상 주문번호를 알려주세요. 예: TC ID: L-03 / 주문번호: 100100003' : '조회할 본인 주문번호를 알려주세요.'};
  if(!state.confirmed) {state.pending=true;return {state,reply:`${state.orderNo}번이 이번에 조회할 본인 주문이 맞나요? 맞으면 “네”라고 답해 주세요.`};}
  return {state,ready:true};
}
const orderNames={PAID:'결제 완료',CONFIRMED:'주문 확정',CANCEL_REQUESTED:'취소 요청',CANCELED:'취소',FAILED:'실패'};
const shipmentNames={READY:'배송 준비',IN_TRANSIT:'배송 중',DELIVERED:'배송 완료',RETURNED:'반송'};
export async function lookupReply(state, token, {fetcher=fetch,beforeRead=async()=>{}}={}) {
  const actions=createCompetitionActions({token,testCaseId:state.testCaseId,confirmedOrderNo:state.orderNo,
    fetcher:async(url,options)=>{await beforeRead();return fetcher(url,options);}});
  // Confirmation selects the target; it is not member authentication. Only status is exposed.
  actions.getConfirmedOrder.pick=d=>({status:orderNames[d.status] ?? '알 수 없는 상태'});
  actions.getConfirmedShipments.pick=rows=>({count:rows.length,statuses:[...new Set(rows.map(d=>shipmentNames[d.status] ?? '알 수 없는 상태'))]});
  const result=await runAgent({text:'확인된 주문과 배송 상태 조회',actions,
    context:{testCaseId:state.testCaseId,confirmedOrderNo:state.orderNo},timeoutMs:12000,
    model:async({history})=>{
      if(history.some(h=>h.error)) return {type:'answer',text:'주문·배송 조회가 완료되지 않았습니다. TC ID와 주문번호를 확인한 뒤 다시 요청해 주세요.'};
      if(history.length<2)return {type:'action',name:history.length?'getConfirmedShipments':'getConfirmedOrder',arguments:{}};
      const order=history[0].result, shipments=history[1].result;
      return {type:'answer',text:`주문 상태: ${order.status}. ${shipments.count ? `배송 ${shipments.count}건: ${shipments.statuses.join(', ')}.` : '등록된 배송 건이 없습니다.'} 조회 결과이며 변경·취소·환불을 접수한 것은 아닙니다.`};
    },
  });
  return result.text;
}
