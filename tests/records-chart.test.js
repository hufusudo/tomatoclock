import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChartModel} from '../js/records-chart.js';

const row=(day,studySeconds,pomodoros=1)=>({day,studySeconds,pomodoros});
// Catches plotting database's newest-first rows backwards or collapsing missing calendar days.
test('chart sorts records chronologically and preserves gaps without inventing study records',()=>{
 const model=buildChartModel([row('2026-10-07',1800),row('2026-10-01',900),row('2026-10-06',4500)]);
 assert.deepEqual(model.points.map(p=>p.day),['2026-10-01','2026-10-06','2026-10-07']);
 const [first,middle,last]=model.points;
 assert.ok(Math.abs((middle.x-first.x)/(last.x-first.x)-5/6)<0.00001);
 assert.equal(middle.studySeconds,4500);assert.equal(middle.pomodoros,1);
 assert.ok(middle.y<last.y&&last.y<first.y,'larger durations plot higher');
 assert.equal(model.unit,'分钟');
});
// Catches division by zero, a misleading full-height zero bar, and missing single-day focus targets.
test('zero weeks and a single day have finite positions and a meaningful baseline',()=>{
 const empty=buildChartModel([]);assert.deepEqual(empty.points,[]);
 const single=buildChartModel([row('2026-10-07',60)]);
 assert.equal(single.points[0].x,(single.left+single.right)/2);
 const zero=buildChartModel([row('2026-10-05',0,0),row('2026-10-06',0,0)]);
 assert.ok(zero.maximum>0);
 for(const p of zero.points){assert.equal(p.y,zero.bottom);assert.equal(p.height,0);assert.ok(Number.isFinite(p.x));}
 assert.ok(!/NaN|Infinity/.test(zero.path));
});
// Catches cropped peaks and unreadable unit/label density on small screens.
test('axis covers the largest value, switches to hours, and limits narrow-screen labels',()=>{
 const model=buildChartModel([row('2026-10-01',60),row('2026-10-07',10800)],{width:340});
 assert.equal(model.unit,'小时');assert.ok(model.maximum>=10800);
 assert.equal(model.ticks[0].label,'0');
 assert.ok(model.ticks.every(t=>t.y>=model.top&&t.y<=model.bottom));
 assert.ok(model.points.every(p=>p.x>=model.left&&p.x<=model.right&&p.y>=model.top));
 const dense=buildChartModel(Array.from({length:30},(_,i)=>row(`2026-10-${String(i+1).padStart(2,'0')}`,60)),{width:340});
 assert.ok(dense.labels.length<=4);assert.equal(dense.labels[0].day,'2026-10-01');assert.equal(dense.labels.at(-1).day,'2026-10-30');
 assert.ok(dense.barWidth>0&&dense.barWidth<20);
});
// Catches label thinning on seven-day pages and fabricating zero-value future points.
test('seven-day chart labels every date, but future dates have no point, bar or line segment',()=>{
 const rows=Array.from({length:7},(_,i)=>i<3?row(`2026-10-0${i+1}`,i===1?0:60):{day:`2026-10-0${i+1}`,studySeconds:null,pomodoros:null,future:true});
 const model=buildChartModel(rows,{width:280});
 assert.deepEqual(model.labels.map(p=>p.day),['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07']);
 assert.deepEqual(model.points.map(p=>p.day),['2026-10-01','2026-10-02','2026-10-03']);
 assert.equal(model.points[1].y,model.bottom);assert.equal(model.slots[6].y,null);
 assert.ok(model.points.at(-1).x<model.labels.at(-1).x,'the line ends at today, not at the future end of the axis');
 assert.ok(!/null|NaN|Infinity/.test(model.path));
});
// Catches endpoint bars covering the y-axis labels or extending outside the plot.
test('first and last bars remain inside the plot, clear of axis labels',()=>{
 const model=buildChartModel([row('2026-10-01',1500),row('2026-10-07',3000)],{width:340});
 assert.ok(model.points[0].x-model.barWidth/2>=model.left);
 assert.ok(model.points.at(-1).x+model.barWidth/2<=model.right);
});
// Catches malformed imported data rendering NaN geometry or interpreting date text as markup.
test('invalid dates, duplicate dates and invalid durations are rejected before rendering',()=>{
 for(const rows of [[row('2026-02-30',60)],[row('<svg>',60)],[row('2026-10-07',-1)],[row('2026-10-07',Infinity)],[row('2026-10-07',60,1.5)],[row('2026-10-07',60),row('2026-10-07',120)]])assert.throws(()=>buildChartModel(rows));
});
