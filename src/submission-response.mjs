// Only validated receipts enter this formatter. Free-form model answers and reasons
// are never copied into the customer response after a mutation.
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(v);
const kinds={address_change:['request_address_change','배송지 변경'],cash_receipt:['request_cash_receipt','현금영수증 발행'],
  refund:['request_refund','환불'],escalation:['request_escalation','담당자 이관'],
  reship:['request_reship','재배송'],coupon_issue:['request_coupon_issue','보상쿠폰 발급'],schedule_change:['request_schedule_change','배송 일정 변경']};

const safetyQuestion='섭취 여부·이상 증상을 알려 주세요.';
function currentSafetyAnswers(customerText) {
  // Ephemeral current-customer reports only. Never read summaries, tools or prior TC state.
  const cleaned=String(customerText??'').slice(0,4000).replace(/"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’|「[^」]*」/g,'');
  let ingestion=false,symptoms=false,positiveSymptoms=false;
  for(const clause of cleaned.match(/[^.!?。\n]+[.!?。]?/g)??[]) {
    if(/만약|다면|라면|으면|경우|가정|간주|모르|모름|확인\s*중|예시|인용|도구|API|다른\s*(?:고객|사람|회원|주문)|지난\s*주문|이전\s*주문|과거|쓰라고|[?？]/i.test(clause))continue;
    if(/미섭취|안\s*먹었|먹지\s*않(?:았|음)|섭취(?:를)?\s*(?:안\s*했|하지\s*않(?:았|음))|먹은\s*적(?:이|은)?\s*없|(?:먹었|섭취했)(?:습니다|어요|고|음|다|지만|으며|$)/.test(clause))ingestion=true;
    if(/무증상|(?:증상|이상|복통|구토|설사)(?:은|는|이|가|도)?\s*(?:전혀\s*)?없(?:습니다|어요|음|다|고|었|$)/.test(clause))symptoms=true;
    if(/(?:증상|이상|복통|구토|설사)(?:은|는|이|가|도)?\s*있(?:어요|습니다|음|고|다|었|네요)|(?:배가|속이)\s*(?:아파|아픕|아프)/.test(clause)) {
      symptoms=true;positiveSymptoms=true;
    }
  }
  return {ingestion,symptoms,positiveSymptoms};
}

export function suppressAnsweredSafetyQuestions(guidance,customerText) {
  if(typeof guidance!=='string'||!guidance.includes(safetyQuestion))return guidance;
  const answer=currentSafetyAnswers(customerText);
  const question=answer.ingestion&&answer.symptoms?'':answer.ingestion?'현재 이상 증상을 알려 주세요.':answer.symptoms?'섭취 여부를 알려 주세요.':safetyQuestion;
  if(answer.positiveSymptoms)
    return `불편을 드려 죄송합니다. ${question} 섭취를 중단하고 진료를 받으세요. 원물과 사진을 보관하고 진단서·진료비 영수증을 준비해 주세요. 인과관계와 배상은 검토가 필요합니다.`.replace(/ {2,}/g,' ');
  return guidance.replace(safetyQuestion,question).replace(/ {2,}/g,' ');
}

// Classification selects reviewed policy text; it does not prove the allegation.
// Source: BUSINESS_POLICY safety, privacy, mediation and compensation sections.
export function escalationGuidance(reason,lane) {
  const text=String(reason??'');
  const health=/병원|진료|복통|구토|설사|몸\s*이상|섭취\s*후|건강피해|손해배상|의료비|병원비/.test(text);
  const mold=/곰팡이|부패|\bMOLD\b/i.test(text);
  const privacy=/타인|타\s*계정|타\s*회원|다른\s*회원|개인정보|본인.*불일치/.test(text);
  const advertising=/광고|문구.*정정|당일배송.*오인/.test(text);
  const shipping=/미출고|잔여.*출고|배송.*지연/.test(text);
  const notes=[];
  if(health) notes.push('불편을 드려 죄송합니다. 섭취를 멈추고 진료를 받으세요. 원물·사진과 진단서·진료비 영수증을 보관해 주세요. 인과관계와 배상은 검토가 필요합니다.');
  else if(mold) notes.push('불편을 드려 죄송합니다. 섭취 여부·이상 증상을 알려 주세요. 곰팡이 제품은 섭취를 중단하고, 이상 증상이 있으면 보관하고 없으면 폐기하며 반송은 필요 없습니다.');
  if(privacy) notes.push('본인 주문으로 확인되지 않아 배송 상태와 주소는 안내할 수 없습니다.');
  if(advertising) notes.push('배송 안내로 혼란을 드려 죄송합니다. 광고 문구 정정 검토를 요청했습니다.');
  if(shipping) notes.push('출고·도착 일정은 배송 담당 확인 후 안내하며 도착을 보장하지 않습니다.');
  // Calendar guide: escalation reply is three business days, excluding receipt day.
  // B18 same/next-business-day mediation is a different workflow.
  notes.push('이관 접수일을 제외한 3영업일 내 회신 기준입니다.');
  return notes;
}

export function formatSubmissionResponse(writes=[],receipts=[],{outcomeUnknown=false,prefix='',lookup=false,customerText=''}={}) {
  const successful=new Set(writes.filter(w=>w.outcome==='success').map(w=>w.name));
  const accepted=receipts.filter(r=>id(r.receipt_id)&&kinds[r.kind]&&successful.has(kinds[r.kind][0]));
  if(!accepted.length)return null;
  const parts=[],notes=[];
  for(const r of accepted) {
    const label=r.kind==='cash_receipt' ? (r.purpose==='income_deduction'?'소득공제용 ':r.purpose==='expense_evidence'?'지출증빙용 ':'')+kinds[r.kind][1] : kinds[r.kind][1];
    const amount=r.kind==='refund'&&Number.isSafeInteger(r.amount)&&r.amount>0?` ${r.amount.toLocaleString('ko-KR')}원`:'';
    parts.push(lookup?`${label}${amount} 기존 신청 확인: ${r.receipt_id}.`:
      ['address_change','cash_receipt'].includes(r.kind)?`${label} 요청이 접수됐습니다. 접수번호 ${r.receipt_id}.`:
      `${label}${amount} 신청이 접수되었습니다. 접수번호 ${r.receipt_id}.`);
    if(r.kind==='escalation')notes.push(...(r.guidance??[]).map(note=>{
      let safe=suppressAnsweredSafetyQuestions(note,customerText);
      // Existing-receipt status lookup does not reopen intake. Conditional safety remains;
      // this does not claim that an unknown health state has been confirmed.
      if(lookup&&typeof safe==='string')safe=safe.replace(safetyQuestion,'').replace('현재 이상 증상을 알려 주세요.','').replace('섭취 여부를 알려 주세요.','').replace(/ {2,}/g,' ');
      return safe;
    }));
    if(r.kind==='coupon_issue') {
      const p=r.price_compensation;
      if(p&&['paid_price','current_price','difference','coupon_value'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)&&p.paid_price-p.current_price===p.difference)
        notes.push(`구매가 ${p.paid_price.toLocaleString('ko-KR')}원, 현재가 ${p.current_price.toLocaleString('ko-KR')}원, 차액 ${p.difference.toLocaleString('ko-KR')}원에 대해 ${p.coupon_value.toLocaleString('ko-KR')}원 보상쿠폰을 요청했습니다.`);
      notes.push('구매 후 7일 내 동일상품 정상가 인하에 대한 차액 이상 최소 보상쿠폰 기준이며, 실제 발급일부터 90일간 사용 가능합니다.');
    }
    if(r.kind==='schedule_change'&&/^\d{4}-\d{2}-\d{2}$/.test(r.requested_date??''))notes.push(`요청 일정은 ${r.requested_date}입니다.`);
    if(r.kind==='reship'||r.kind==='schedule_change')notes.push('실제 출고·도착 일정은 별도 확인이 필요합니다.');
  }
  if(outcomeUnknown||writes.some(w=>w.outcome==='unknown'))parts.push('다른 요청은 결과가 불명확하여 다시 실행하지 않았습니다. 담당 확인이 필요합니다.');
  else if(writes.some(w=>w.outcome==='rejected'))parts.push('일부 요청은 실행되지 않았습니다.');
  parts.push('실제 변경·발행·환불·승인 완료는 아닙니다.');
  // Append complete guidance sentences, never truncate a verified receipt ID.
  let reply=prefix+[...new Set(parts)].join(' ');
  for(const note of [...new Set(notes)])if(typeof note==='string'&&reply.length+note.length+1<=500)reply+=' '+note;
  if(reply.length>500) {
    const first=accepted[0];
    reply=prefix+`${accepted.length}건의 ${lookup?'기존 신청을 확인했습니다':'신청이 접수됐습니다'}. ${kinds[first.kind][1]} 접수번호 ${first.receipt_id}. 나머지 접수번호는 담당 확인이 필요합니다. 실제 처리 완료는 아닙니다.`;
    if(outcomeUnknown||writes.some(w=>w.outcome==='unknown'))reply+=' 다른 요청은 결과가 불명확하여 재실행하지 않았습니다.';
  }
  return reply;
}

export function formatReceiptLookupResponse(receipts=[],{customerText=''}={}) {
  const supported=receipts.filter(r=>['refund','escalation'].includes(r.kind));
  if(!supported.length)return null;
  const pending=supported.some(r=>r.kind==='escalation'&&r.review_status==='PENDING');
  const prefix=pending?'재접수 없이 기존 기록을 조회했습니다. 이관은 검토 대기입니다. ':'재접수 없이 기존 기록을 조회했습니다. ';
  return formatSubmissionResponse(supported.map(r=>({name:kinds[r.kind][0],outcome:'success'})),supported,{prefix,lookup:true,customerText});
}
