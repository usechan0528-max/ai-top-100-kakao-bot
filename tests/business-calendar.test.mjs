import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calendarDay, businessDeadline, subscriptionCutoff, compareCutoff, nextShippingDate, calendarMonth, validCalendarArguments } from '../src/business-calendar.mjs';
import { CALENDAR_ROWS } from '../src/business-calendar-data.mjs';
import { actions, sendCallback } from '../src/worker.mjs';
import { runAgent } from '../src/agent.mjs';
import { createOpenAIModel } from '../src/openai-model.mjs';

test('runtime calendar matches every reviewed source cell for all 305 dates',()=>{
  const cells=JSON.parse(fs.readFileSync(new URL('../docs/sources/business-calendar/cells.json',import.meta.url),'utf8'));
  const rows=new Map();
  for(const c of cells.filter(c=>c.sheet==='8. 날짜별 영업·출고 달력')) {
    const [,column,row]=/^([A-Z]+)(\d+)$/.exec(c.cell);
    if(+row<6 || !'ABCD'.includes(column)) continue;
    if(!rows.has(+row)) rows.set(+row,{});
    rows.get(+row)[column]=c.value;
  }
  assert.equal(rows.size,305);assert.equal(CALENDAR_ROWS.length,305);
  for(const r of rows.values()) {
    const day=calendarDay(r.A);
    assert.equal(day.weekday,r.B);assert.equal(day.businessDay,r.C==='영업');assert.equal(day.scheduledShippingDay,r.D==='출고일');
    assert.equal(day.orderShipmentConfirmed,false);
  }
});

for(const [start,base,end] of [['07-20','07-20','07-23'],['07-24','07-24','07-29'],['08-14','08-14','08-20'],['09-22','09-22','09-30'],['07-25','07-27','07-30'],['09-24','09-28','10-01']]) {
  test(`business deadline ${start}: excludes adjusted base ${base}`,()=>{
    const r=businessDeadline('2037-'+start,3);
    assert.equal(r.baseDate,'2037-'+base);assert.equal(r.deadline.date,'2037-'+end);
    assert.equal(r.deadline.time,'24:00');assert.equal(r.deadline.timeZone,null);
  });
}
for(const [payment,cutoff] of [['07-29','07-24'],['08-19','08-13'],['09-30','09-22'],['10-07','10-01'],['12-28','12-22']]) {
  test(`cutoff example ${payment}`,()=>{
    const r=subscriptionCutoff('2037-'+payment);
    assert.equal(r.cutoff.date,'2037-'+cutoff);assert.equal(r.cutoff.time,'24:00');
    assert.equal(r.boundaryInclusive,null);assert.equal(r.requestTimeBasis,null);
    assert.equal(r.applicability,'needs_confirmation');
  });
}
test('holiday payment date is not advanced using forward receipt rule',()=>{
  assert.equal(subscriptionCutoff('2037-08-17').cutoff.date,'2037-08-12');
});
test('full monthly summaries match source, including tied minimum and opening coverage',()=>{
  const expected=[[22,13],[22,13],[19,11],[22,13],[23,14],[20,12],[19,11],[20,11],[21,13],[22,12]];
  expected.forEach(([business,shipping],i)=>{
    const r=calendarMonth(`2037-${String(i+3).padStart(2,'0')}`);
    assert.equal(r.businessDays,business);assert.equal(r.shippingRounds,shipping);
  });
  assert.equal(calendarMonth('2037-03').from,'2037-03-02');
});
test('holiday rounds are skipped, not moved to next business day; harvest is only a candidate',()=>{
  for(const [from,to] of [['05-06','05-08'],['05-25','05-27'],['08-17','08-19'],['09-23','09-28'],['07-02','07-03'],['12-25','12-28']]) {
    const r=nextShippingDate('2037-'+from);
    assert.equal(r.candidate.date,'2037-'+to);assert.equal(r.orderShipmentConfirmed,false);
  }
  assert.equal(nextShippingDate('2037-07-01').candidate.date,'2037-07-01');
  assert.equal(calendarDay('2037-06-08').scheduledShippingDay,true);
  assert.equal(calendarDay('2037-06-06').businessDay,false);
});
test('scope, invalid dates, and missing forward/backward coverage never extrapolate',()=>{
  for(const d of ['2037-03-01','2038-01-01','2037-02-30','2037-6-30','2037-13-01',null])
    assert.equal(calendarDay(d).status,'needs_confirmation');
  assert.equal(subscriptionCutoff('2037-03-04').status,'needs_confirmation');
  assert.equal(businessDeadline('2037-12-31',1).status,'needs_confirmation');
  assert.equal(nextShippingDate('2037-12-31').status,'needs_confirmation');
  for(const n of [0,-1,1.5,306,NaN,'3']) assert.equal(businessDeadline('2037-07-20',n).status,'needs_confirmation');
});
for(const [time,relation] of [['2037-07-24T23:59:59.999','before'],['2037-07-24T24:00:00','equal'],['2037-07-25T00:00:00','equal'],['2037-07-25T00:00:00.001','after']]) {
  test(`civil comparison ${time} does not decide actual applicability`,()=>{
    const r=compareCutoff('2037-07-29',time);
    assert.equal(r.hypotheticalLocalRelation,relation);assert.equal(r.status,'needs_confirmation');
    assert.equal(r.applicableCycle,null);assert.equal(r.boundaryInclusive,null);
    assert.equal(r.cutoff.localBoundary,'2037-07-25T00:00:00');
    assert.equal(r.cutoff.timeZone,null);
  });
}
test('malformed time, guessed timezone and boundary overrides are not accepted',()=>{
  for(const time of ['2037-07-24','2037-07-24T24:01:00','2037-07-24T25:00:00','2037-07-24T23:60:00','2037-07-24T23:59:60','2037-07-24T24:00:00.001','2037-07-24T23:59:00Z','2037-07-24T23:59:00+09:00'])
    assert.equal(compareCutoff('2037-07-29',time).reason,'invalid_or_uncovered_local_time');
  for(const args of [{operation:'cutoff',date:'2037-07-29',inclusive:true},{operation:'compare_cutoff',date:'2037-07-29',requestLocalTime:'2037-07-25T00:00:00',verified:true},{operation:'constructor',date:'2037-07-29'},{operation:'deadline',date:'2037-07-20',days:'3'},{operation:'day',date:'2037-07-20',month:'2037-07'}])
    assert.equal(validCalendarArguments(args),false);
});

test('worker registry -> model tool call -> calendar result -> SimpleText with no writes or clock assumption',async()=>{
  const requests=[];
  const model=createOpenAIModel({apiKey:'fake-test-key',fetcher:async(_url,init)=>{
    const body=JSON.parse(init.body);requests.push(body);
    assert.ok(body.instructions.includes('business_calendar'));
    assert.ok(body.instructions.includes('시스템 요청시각 기준/정밀도'));
    assert.ok(JSON.stringify(body).length<32000);
    assert.equal(body.tools.find(t=>t.name==='business_calendar').type,'function');
    if(requests.length===1) return Response.json({status:'completed',output:[{type:'function_call',call_id:'calendar-1',name:'business_calendar',arguments:JSON.stringify({operation:'compare_cutoff',date:'2037-07-29',requestLocalTime:'2037-07-25T00:00:00'})}]});
    const result=JSON.parse(body.input.at(-1).output);
    assert.equal(result.result.applicableCycle,null);
    assert.equal(result.result.hypotheticalLocalRelation,'equal');
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'7월 29일 회차의 컷오프는 7월 24일 24:00입니다. 정확히 같은 시각의 포함 여부와 시스템 요청 시각 기준은 확인이 필요하여 이번 회차 반영 여부를 확정할 수 없습니다.',summary:''})}]}]});
  }});
  const result=await runAgent({text:'7월29일 회차를 7월25일0시에 해지 요청했다면 반영되나요?',model,actions,writeJournal:{reserve:()=>{throw Error('Read must not reserve a write');}}});
  assert.equal(requests.length,2);assert.deepEqual(result.writes,[]);assert.equal(actions.business_calendar.kind,'read');
  let payload;
  await sendCallback('fake-callback',result.text,{BOT_TOKEN:'fake-bot'},async(_url,init)=>{payload=JSON.parse(init.body);return Response.json({errorCount:0});});
  const outputs=payload.skillResponse.template.outputs;
  assert.equal(outputs.length,1);assert.ok(outputs[0].simpleText.text.length<=500);
});
