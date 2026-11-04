import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSubmissionResponse,formatReceiptLookupResponse,escalationGuidance} from '../src/submission-response.mjs';
const success=name=>({name,outcome:'success'});
test('refund and safety escalation preserve both verified IDs, safety and followup',()=>{
  const reply=formatSubmissionResponse([success('request_refund'),success('request_escalation')],[
    {kind:'refund',receipt_id:'RFD-TEST'},
    {kind:'escalation',receipt_id:'ESC-TEST',guidance:escalationGuidance('곰팡이 복수 신고 안전 확인','LANE2_HANDOFF')},
  ]);
  for(const word of ['RFD-TEST','ESC-TEST','섭취','증상','3영업일','완료는 아닙니다'])assert.ok(reply.includes(word));
  assert.ok(reply.length<=500);
});
test('privacy and medical escalation preserve policy without copying private reasons',()=>{
  for(const [reason,lane,expected] of [['타인 주문 개인정보 PRIVATE_NAME','LANE2_HANDOFF','배송 상태와 주소'],
    ['복통 병원비 검토 PRIVATE_NAME','LANE2_HANDOFF','3영업일'],['손해배상 PRIVATE_NAME','LANE3_CLAIM','진단서']]) {
    const reply=formatSubmissionResponse([success('request_escalation')],[{kind:'escalation',receipt_id:'ESC-TEST',guidance:escalationGuidance(reason,lane)}]);
    assert.match(reply,/ESC-TEST/);assert.ok(reply.includes(expected));assert.ok(!reply.includes('PRIVATE_NAME'));assert.ok(reply.length<=500);
  }
});
test('partial success retains known receipt and distinguishes uncertain or rejected other write',()=>{
  for(const outcome of ['unknown','rejected']) {
    const reply=formatSubmissionResponse([success('request_refund'),{name:'request_escalation',outcome}],[{kind:'refund',receipt_id:'RFD-TEST'}]);
    assert.match(reply,/RFD-TEST/);assert.match(reply,outcome==='unknown'?/결과가 불명확/:/실행되지 않았습니다/);
    assert.ok(!reply.includes('담당자 이관 신청 접수'));
  }
});
test('unverified or mismatched receipts cannot become successful customer claims',()=>{
  assert.equal(formatSubmissionResponse([{name:'request_refund',outcome:'unknown'}],[{kind:'refund',receipt_id:'RFD-TEST'}]),null);
  assert.equal(formatSubmissionResponse([success('request_refund')],[{kind:'escalation',receipt_id:'ESC-TEST'}]),null);
  assert.equal(formatSubmissionResponse([success('request_refund')],[{kind:'refund',receipt_id:'not an id'}]),null);
});
test('new request kinds and maximal receipt IDs remain one bounded response',()=>{
  const names=['request_address_change','request_cash_receipt','request_refund','request_escalation','request_reship','request_coupon_issue','request_schedule_change'];
  const kinds=['address_change','cash_receipt','refund','escalation','reship','coupon_issue','schedule_change'];
  const reply=formatSubmissionResponse(names.map(success),kinds.map((kind,i)=>({kind,receipt_id:String(i)+'A'.repeat(99)})));
  assert.ok(reply.length<=500);assert.ok(reply.includes('0'+'A'.repeat(99)));assert.match(reply,/7건/);
});
test('price compensation preserves verified arithmetic, policy and 90-day validity',()=>{
  const reply=formatSubmissionResponse([success('request_coupon_issue')],[{kind:'coupon_issue',receipt_id:'CPN-TEST',
    price_compensation:{paid_price:32000,current_price:27900,difference:4100,coupon_value:5000}}]);
  for(const word of ['32,000','27,900','4,100','5,000','7일','최소','90일'])assert.ok(reply.includes(word));
  assert.ok(reply.length<=500);
});
test('read-only followup distinguishes old receipts, pending review and preserves safety',()=>{
  const reply=formatReceiptLookupResponse([{kind:'refund',receipt_id:'RFD-TEST',amount:34900},
    {kind:'escalation',receipt_id:'ESC-TEST',review_status:'PENDING',guidance:escalationGuidance('곰팡이','LANE2_HANDOFF')}]);
  for(const word of ['재접수 없이','기존 신청 확인','검토 대기','34,900','RFD-TEST','ESC-TEST','섭취','3영업일'])assert.ok(reply.includes(word));
  assert.ok(reply.length<=500);
});
