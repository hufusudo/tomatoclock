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
test('daily pages anchor at the first record and span seven consecutive dates including gaps',async()=>{
 const {dailyRecordPage}=await periods();assert.equal(typeof dailyRecordPage,'function');
 const first=dailyRecordPage({firstDay:'2026-09-28',today:'2026-10-07',offset:0});
 assert.deepEqual(first.days,['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
 assert.equal(first.from,'2026-09-28');assert.equal(first.to,'2026-10-04');assert.equal(first.readTo,'2026-10-04');assert.equal(first.totalPages,2);assert.equal(first.totalDays,10);
 const last=dailyRecordPage({firstDay:'2026-09-28',today:'2026-10-07',offset:7});
 assert.deepEqual(last.days,['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11']);
 assert.equal(last.readTo,'2026-10-07');assert.equal(last.offset,7);
 assert.equal(dailyRecordPage({firstDay:'2026-09-28',today:'2026-10-07',offset:700}).offset,7,'stale page offsets clamp to the last available page');
});
test('daily pages keep calendar boundaries across leap days, years, DST and long empty stretches',async()=>{
 const {dailyRecordPage}=await periods();assert.equal(typeof dailyRecordPage,'function');
 assert.deepEqual(dailyRecordPage({firstDay:'2028-02-27',today:'2028-03-10'}).days,['2028-02-27','2028-02-28','2028-02-29','2028-03-01','2028-03-02','2028-03-03','2028-03-04']);
 assert.equal(dailyRecordPage({firstDay:'2026-12-29',today:'2027-01-10',offset:7}).from,'2027-01-05');
 assert.equal(dailyRecordPage({firstDay:'2026-03-06',today:'2026-03-20',offset:7}).from,'2026-03-13');
 assert.equal(dailyRecordPage({firstDay:'2020-01-01',today:'2026-10-07',offset:7}).from,'2020-01-08','pagination does not skip an all-zero seven-day page');
 for(const offset of [-1,1,1.5,Infinity])assert.throws(()=>dailyRecordPage({firstDay:'2026-10-01',today:'2026-10-07',offset}));
});
test('daily page filling distinguishes no study today from future blank dates',async()=>{
 const {dailyRecordPage,fillDailyPage}=await periods();assert.equal(typeof fillDailyPage,'function');
 const page=dailyRecordPage({firstDay:'2026-10-06',today:'2026-10-07'});
 const days=fillDailyPage(page,[{day:'2026-10-06',studySeconds:1500,pomodoros:1}]);
 assert.equal(days.length,7);assert.deepEqual(days[1],{day:'2026-10-07',studySeconds:0,pomodoros:0});
 assert.deepEqual(days[2],{day:'2026-10-08',studySeconds:null,pomodoros:null,future:true});
 assert.equal(days[6].day,'2026-10-12');
 const empty=fillDailyPage(dailyRecordPage({firstDay:'2026-09-28',today:'2026-10-14',offset:7}),[]);
 assert.ok(empty.every(row=>row.studySeconds===0&&row.pomodoros===0));
});
test('date ranges reject reversed, impossible or excessive spans',async()=>{
 const {validateRecordRange}=await periods();assert.deepEqual(validateRecordRange({from:'2026-09-28',to:'2026-10-04'}),{from:'2026-09-28',to:'2026-10-04'});
 for(const range of [null,{from:'2026-02-30',to:'2026-03-01'},{from:'2026-10-07',to:'2026-10-06'},{from:'2026-01-01',to:'2026-12-31'},{from:'../',to:'2026-10-07'}])assert.throws(()=>validateRecordRange(range));
});
