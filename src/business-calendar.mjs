import { CALENDAR_ROWS, CALENDAR_SOURCE } from './business-calendar-data.mjs';

const dates = CALENDAR_ROWS.map(r=>r[0]);
const index = new Map(dates.map((d,i)=>[d,i]));
const unknown = reason => ({status:'needs_confirmation', reason, source:CALENDAR_SOURCE});
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && index.has(d);
const dayResult = i => ({date:dates[i],weekday:CALENDAR_ROWS[i][1],businessDay:CALENDAR_ROWS[i][2],scheduledShippingDay:CALENDAR_ROWS[i][3]});
// UTC is used only as a civil-date arithmetic carrier, never as the business timezone.
function nextCivilDate(d) {
  const t = new Date(d+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+1);
  return t.toISOString().slice(0,10);
}
const deadline = d => ({date:d,time:'24:00',localBoundary:nextCivilDate(d)+'T00:00:00',timeZone:null});

export function calendarDay(date) {
  return validDate(date) ? {status:'calculated',...dayResult(index.get(date)),orderShipmentConfirmed:false,source:CALENDAR_SOURCE} : unknown('date_outside_verified_calendar');
}

export function businessDeadline(date, days) {
  if (!Number.isInteger(days) || days<1 || days>305) return unknown('invalid_business_day_count');
  if (!validDate(date)) return unknown('date_outside_verified_calendar');
  let i=index.get(date);
  while (i<CALENDAR_ROWS.length && !CALENDAR_ROWS[i][2]) i++;
  if (i===CALENDAR_ROWS.length) return unknown('insufficient_calendar_coverage');
  const baseDate=dates[i];
  let remaining=days;
  while (++i<CALENDAR_ROWS.length) {
    if (CALENDAR_ROWS[i][2] && --remaining===0)
      return {status:'calculated',receivedDate:date,baseDate,excludedBaseDate:true,days,deadline:deadline(dates[i]),source:CALENDAR_SOURCE};
  }
  return unknown('insufficient_calendar_coverage');
}

export function subscriptionCutoff(paymentDate) {
  if (!validDate(paymentDate)) return unknown('date_outside_verified_calendar');
  let i=index.get(paymentDate), remaining=3;
  while (--i>=0) {
    if (CALENDAR_ROWS[i][2] && --remaining===0)
      return {status:'calculated',paymentDate,excludedPaymentDate:true,cutoff:deadline(dates[i]),
        applicability:'needs_confirmation',boundaryInclusive:null,requestTimeBasis:null,source:CALENDAR_SOURCE};
  }
  return unknown('insufficient_calendar_coverage');
}

// A supplied local wall-clock value is only a hypothetical comparison, NOT a verified
// request timestamp. No model/user argument can certify the still-unknown clock policy.
export function compareCutoff(paymentDate, requestLocalTime) {
  const calculated=subscriptionCutoff(paymentDate);
  if (calculated.status!=='calculated') return calculated;
  const match=typeof requestLocalTime==='string' && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?$/.exec(requestLocalTime);
  if (!match || !validDate(match[1]) || +match[2]>24 || +match[3]>59 || +match[4]>59 ||
      (+match[2]===24 && (+match[3]!==0 || +match[4]!==0 || +(match[5]??0)!==0)))
    return unknown('invalid_or_uncovered_local_time');
  const normalized=+match[2]===24 ? nextCivilDate(match[1])+'T00:00:00.000' : requestLocalTime.slice(0,19)+'.'+(match[5]??'000');
  const boundary=calculated.cutoff.localBoundary+'.000';
  const relation=normalized<boundary?'before':normalized>boundary?'after':'equal';
  return {...calculated,status:'needs_confirmation',hypotheticalLocalRelation:relation,
    reason:relation==='equal'?'boundary_and_request_clock_unconfirmed':'request_clock_unconfirmed',
    requestLocalTime,normalizedLocalTime:normalized,applicableCycle:null};
}

export function nextShippingDate(date) {
  if (!validDate(date)) return unknown('date_outside_verified_calendar');
  const i=CALENDAR_ROWS.findIndex((r,i)=>i>=index.get(date) && r[3]);
  return i<0 ? unknown('insufficient_calendar_coverage') : {status:'calculated',onOrAfter:date,candidate:dayResult(i),orderShipmentConfirmed:false,source:CALENDAR_SOURCE};
}

export function calendarMonth(month) {
  if (typeof month!=='string' || !/^2037-(0[3-9]|1[0-2])$/.test(month)) return unknown('month_outside_verified_calendar');
  const rows=CALENDAR_ROWS.filter(r=>r[0].startsWith(month));
  return {status:'calculated',month,from:rows[0][0],through:rows.at(-1)[0],
    businessDays:rows.filter(r=>r[2]).length,shippingRounds:rows.filter(r=>r[3]).length,source:CALENDAR_SOURCE};
}

const fields={day:['date'],deadline:['date','days'],cutoff:['date'],compare_cutoff:['date','requestLocalTime'],next_shipping:['date'],month:['month']};
export function validCalendarArguments(args) {
  if (!args || typeof args!=='object' || Array.isArray(args) || !Object.hasOwn(fields,args.operation)) return false;
  const expected=['operation',...fields[args.operation]];
  return Object.keys(args).length===expected.length && expected.every(k=>Object.hasOwn(args,k)) &&
    (args.operation==='month' ? typeof args.month==='string' && /^\d{4}-\d{2}$/.test(args.month) : typeof args.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date)) &&
    (args.operation!=='deadline' || Number.isInteger(args.days) && args.days>=1 && args.days<=305) &&
    (args.operation!=='compare_cutoff' || typeof args.requestLocalTime==='string' && args.requestLocalTime.length<=23);
}

export const calendarActions=Object.freeze({business_calendar:Object.freeze({
  kind:'read',
  description:'제공된2037-03-02~12-31 조합 달력의 로컬 계산(외부 API 아님). day 날짜 조회, deadline 영업일 순산, cutoff 결제일 역산, compare_cutoff 가정한 현지시각 비교만(실제 반영회차는 미확정), next_shipping 당일 포함 다음 출고 후보, month 월집계. date는 cutoff/compare_cutoff에서는 결제일이다. 시간대·요청시각 기준·경계 포함은 미확정이며 승인/실제 출고/접수 도구가 아니다.',
  parameters:{type:'object',properties:{operation:{type:'string',enum:Object.keys(fields)},date:{type:'string',description:'YYYY-MM-DD'},days:{type:'integer',minimum:1,maximum:305},month:{type:'string',description:'YYYY-MM'},requestLocalTime:{type:'string',description:'가정한 현지 YYYY-MM-DDTHH:mm:ss[.SSS]. 인증된 요청시각이 아님.'}},required:['operation'],additionalProperties:false},
  validate:validCalendarArguments,
  authorize:()=>true, // Public static calendar; no personal records or writes.
  execute:args=> {
    if (!validCalendarArguments(args)) return unknown('invalid_arguments');
    switch(args.operation) {
      case 'day': return calendarDay(args.date);
      case 'deadline': return businessDeadline(args.date,args.days);
      case 'cutoff': return subscriptionCutoff(args.date);
      case 'compare_cutoff': return compareCutoff(args.date,args.requestLocalTime);
      case 'next_shipping': return nextShippingDate(args.date);
      case 'month': return calendarMonth(args.month);
    }
  },
})});
