import {test} from 'node:test';import assert from 'node:assert/strict';
async function periods(){return import('../js/record-periods.js');}
test('calendar month weeks run Monday to Sunday, show cross-month dates and the monthly ordinal',async()=>{
 const {weeksForMonth}=await periods();const weeks=weeksForMonth('2026-10');
 assert.equal(weeks.length,5);assert.deepEqual(weeks[0],{index:1,label:'2026年10月第1周',from:'2026-09-28',to:'2026-10-04',days:['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']});
 assert.equal(weeks[1].from,'2026-10-05');assert.equal(weeks[1].to,'2026-10-11');assert.equal(weeks.at(-1).to,'2026-11-01');
});
test('six-week months, leap days, year boundaries and DST keep consecutive calendar days',async()=>{
 const {weeksForMonth}=await periods();assert.equal(weeksForMonth('2026-03').length,6);
 assert.ok(weeksForMonth('2028-02').some(w=>w.days.includes('2028-02-29')));
 assert.equal(weeksForMonth('2027-01')[0].from,'2026-12-28');
 assert.deepEqual(weeksForMonth('2026-03')[1].days,['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-08']);
 for(const month of ['', '2026-13','2026-1','x',null])assert.throws(()=>weeksForMonth(month));
});
test('weekly totals include both sides of month boundary and fill unused days with zero',async()=>{
 const {weeksForMonth,summarizeWeek}=await periods(),week=weeksForMonth('2026-10')[0];
 const summary=summarizeWeek(week,[{day:'2026-09-28',pomodoros:1,studySeconds:1500},{day:'2026-10-01',pomodoros:2,studySeconds:4500}]);
 assert.deepEqual(summary.total,{pomodoros:3,studySeconds:6000});assert.equal(summary.days.length,7);
 assert.deepEqual(summary.days[1],{day:'2026-09-29',pomodoros:0,studySeconds:0});assert.equal(summarizeWeek(week,[]).total.studySeconds,0);
});
test('date ranges reject reversed, impossible or excessive spans',async()=>{
 const {validateRecordRange}=await periods();assert.deepEqual(validateRecordRange({from:'2026-09-28',to:'2026-10-04'}),{from:'2026-09-28',to:'2026-10-04'});
 for(const range of [null,{from:'2026-02-30',to:'2026-03-01'},{from:'2026-10-07',to:'2026-10-06'},{from:'2026-01-01',to:'2026-12-31'},{from:'../',to:'2026-10-07'}])assert.throws(()=>validateRecordRange(range));
});
