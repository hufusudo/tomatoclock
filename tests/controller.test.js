import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTimer} from '../js/timer.js';import {createController} from '../js/controller.js';
const wait=()=>new Promise(r=>setImmediate(r));
function setup(){
 let now=Date.parse('2026-10-07T10:00:00'),count=0,permissionRequests=0;const rows=new Map(),sounds=[],notices=[],plays=[];
 const records={getSettings:async()=>({workMin:25,shortAdj:0,longAdj:0}),saveSettings:async s=>s,saveCompletedPomodoro:async row=>{rows.set(row.id,row);},getSummary:async day=>({day,today:{pomodoros:rows.size,studySeconds:[...rows.values()].reduce((n,x)=>n+x.workMs/1000,0)},all:{pomodoros:rows.size,studySeconds:[...rows.values()].reduce((n,x)=>n+x.workMs/1000,0)}})};
 const timer=createTimer({settings:{workMin:25},now:()=>now});
 const c=createController({timer,records,notifier:{requestPermission:async()=>{permissionRequests++;},notify:x=>notices.push(x)},celebration:{dismiss(){},play:(phase,details)=>{sounds.push({phase,...details});plays.push(details);}},now:()=>now,uuid:()=>`00000000-0000-4000-8000-${String(++count).padStart(12,'0')}`});
 return {c,records,rows,sounds,notices,plays,permissionRequests:()=>permissionRequests,advance:ms=>{now+=ms;},setTime:ms=>{now=ms;}};
}
test('completed snapshots sum 25+50 and break end automatically starts the next tomato',async()=>{
 const s=setup();await s.c.init();s.c.start();s.advance(5*60000);s.c.pause();s.advance(3600000);s.c.resume();s.advance(20*60000);await s.c.tick();await s.c.tick();
 assert.equal(s.rows.size,1);assert.equal([...s.rows.values()][0].workMs,1500000);assert.deepEqual(s.sounds,[{phase:'work-done',soundOnly:true}]);
 s.advance(5*60000);await s.c.tick();assert.equal(s.c.getSnapshot().state,'working');assert.equal(s.c.getSnapshot().canStart,false);
 assert.deepEqual(s.sounds.at(-1),{phase:'break-done',autoStarted:true});assert.equal(s.notices.at(-1).body,'休息结束，下一番茄已自动开始。');
 await s.c.end();await s.c.saveSettings({workMin:50,shortAdj:0,longAdj:0});s.c.start();s.advance(50*60000);await s.c.tick();
 assert.deepEqual(s.c.getSnapshot().summary.today,{pomodoros:2,studySeconds:4500});
 assert.deepEqual(s.sounds,[{phase:'work-done',soundOnly:true},{phase:'break-done',autoStarted:true},{phase:'work-done',soundOnly:true}]);assert.deepEqual(s.plays,[{soundOnly:true},{autoStarted:true},{soundOnly:true}]);assert.equal(s.permissionRequests(),2);
 assert.equal(s.notices[0].body,'该休息了：短休 5 分。');
 assert.equal(s.notices[1].body,'休息结束，下一番茄已自动开始。');
});
test('failed save holds one retryable record, concurrent retry writes once and accounting is confirmed only',async()=>{
 const s=setup();await s.c.init();s.records.saveCompletedPomodoro=async()=>{throw new Error('disk full');};
 s.c.start();s.advance(25*60000);await s.c.tick();
 assert.equal(s.c.getSnapshot().pendingCount,1);assert.equal(s.c.getSnapshot().canStart,false);assert.equal(s.c.getSnapshot().summary.today.pomodoros,0);assert.deepEqual(s.sounds,[{phase:'work-done',soundOnly:true}]);
 let calls=0;s.records.saveCompletedPomodoro=async row=>{calls++;await wait();s.rows.set(row.id,row);};
 await Promise.all([s.c.retryPending(),s.c.retryPending()]);assert.equal(calls,1);assert.equal(s.c.getSnapshot().pendingCount,0);
 assert.equal(s.c.getSnapshot().summary.today.studySeconds,1500);
});
test('break visibly counts down, then auto-starts one tomato without another permission prompt',async()=>{
 const s=setup();await s.c.init();s.c.start();s.advance(25*60000);await s.c.tick();
 assert.equal(s.c.getSnapshot().state,'break');assert.equal(s.c.getSnapshot().remainingMs,5*60000);assert.deepEqual(s.sounds,[{phase:'work-done',soundOnly:true}]);
 s.advance(3*60000);await s.c.tick();assert.equal(s.c.getSnapshot().state,'break');assert.equal(s.c.getSnapshot().remainingMs,2*60000);assert.equal(s.rows.size,1);
 s.advance(2*60000);await s.c.tick();assert.equal(s.c.getSnapshot().state,'working');assert.equal(s.c.getSnapshot().remainingMs,25*60000);assert.equal(s.rows.size,1);
 assert.equal(s.permissionRequests(),1);assert.deepEqual(s.sounds,[{phase:'work-done',soundOnly:true},{phase:'break-done',autoStarted:true}]);assert.deepEqual(s.plays,[{soundOnly:true},{autoStarted:true}]);
});
test('break expiry waits for a completed tomato save before automatically starting',async()=>{
 const s=setup();await s.c.init();let finish;s.records.saveCompletedPomodoro=row=>new Promise(resolve=>{finish=()=>{s.rows.set(row.id,row);resolve();};});
 s.c.start();s.advance(25*60000);const saving=s.c.tick();await wait();s.advance(5*60000);const breakDone=s.c.tick();await wait();
 assert.equal(s.c.getSnapshot().state,'ready');assert.deepEqual(s.sounds,[{phase:'work-done',soundOnly:true}]);
 finish();await Promise.all([saving,breakDone]);assert.equal(s.c.getSnapshot().state,'working');assert.equal(s.c.getSnapshot().canStart,false);assert.deepEqual(s.sounds,[{phase:'work-done',soundOnly:true},{phase:'break-done',autoStarted:true}]);
});
test('prepareClose waits for in-flight write and unfinished reset never records a partial tomato',async()=>{
 const s=setup();await s.c.init();let finish;
 s.records.saveCompletedPomodoro=row=>new Promise(r=>{finish=()=>{s.rows.set(row.id,row);r();};});
 s.c.start();s.advance(25*60000);const ticking=s.c.tick();let closed=false;const closing=s.c.prepareClose().then(result=>{closed=true;return result;});await wait();assert.equal(closed,false);
 finish();await ticking;assert.deepEqual(await closing,{pendingCount:0});
 s.c.reset();s.c.start();s.advance(10000);s.c.reset();assert.equal(s.rows.size,1);
});
test('failed settings save retains old settings; pending settings block starting',async()=>{
 const s=setup();await s.c.init();let reject;s.records.saveSettings=()=>new Promise((_r,j)=>{reject=j;});
 const saving=s.c.saveSettings({workMin:50,shortAdj:0,longAdj:0});assert.equal(s.c.getSnapshot().canStart,false);assert.equal(s.c.start(),false);
 reject(new Error('fail'));await saving;assert.equal(s.c.getSnapshot().settings.workMin,25);assert.equal(s.c.getSnapshot().canStart,true);
});
test('old delayed daily summary cannot replace a new day after midnight',async()=>{
 const s=setup();await s.c.init();const deferred=[];
 s.records.getSummary=day=>new Promise(resolve=>deferred.push({day,resolve}));
 s.setTime(Date.parse('2026-10-07T23:59:59'));const old=s.c.retryPending();await wait();
 s.setTime(Date.parse('2026-10-08T00:00:01'));const ticking=s.c.tick();await wait();
 assert.equal(deferred.at(-1).day,'2026-10-08');
 deferred.at(-1).resolve({day:'2026-10-08',today:{pomodoros:0,studySeconds:0},all:{pomodoros:2,studySeconds:4500}});await ticking;
 deferred[0].resolve({day:'2026-10-07',today:{pomodoros:99,studySeconds:999},all:{pomodoros:99,studySeconds:999}});await old;
 assert.equal(s.c.getSnapshot().summary.day,'2026-10-08');assert.equal(s.c.getSnapshot().summary.today.pomodoros,0);
});
test('end cancels unfinished working or paused segment without recording study time',async()=>{
 const s=setup();await s.c.init();s.c.start();s.advance(5*60000);s.c.pause();s.advance(3600000);
 assert.equal(await s.c.end(),true);assert.equal(s.c.getSnapshot().state,'ready');assert.equal(s.rows.size,0);assert.equal(s.c.getSnapshot().remainingMs,1500000);
 assert.equal(await s.c.end(),false);s.c.start();s.advance(10000);await s.c.end();assert.equal(s.rows.size,0);assert.deepEqual(s.sounds,[]);
});
test('end settles a just-expired work deadline once before returning to ready',async()=>{
 const s=setup();await s.c.init();s.c.start();s.advance(25*60000);await s.c.end();
 assert.equal(s.rows.size,1);assert.equal(s.c.getSnapshot().state,'break');assert.equal(s.c.getSnapshot().completedInRound,1);assert.equal(s.c.getSnapshot().summary.all.studySeconds,1500);
 s.advance(5*60000);await s.c.tick();assert.equal(s.c.getSnapshot().state,'working');await s.c.end();assert.equal(s.rows.size,1);
});
test('ending break during a pending completed save retains the record and start guard',async()=>{
 const s=setup();await s.c.init();let finish;s.records.saveCompletedPomodoro=row=>new Promise(resolve=>{finish=()=>{s.rows.set(row.id,row);resolve();};});
 s.c.start();s.advance(25*60000);const saving=s.c.tick();await s.c.end();
 assert.equal(s.c.getSnapshot().state,'ready');assert.equal(s.c.getSnapshot().pendingCount,1);assert.equal(s.c.start(),false);
 finish();await saving;assert.equal(s.rows.size,1);assert.equal(s.c.getSnapshot().pendingCount,0);assert.equal(s.c.getSnapshot().canStart,true);
});
test('pause at an elapsed deadline settles work before end, keeping the original completion time',async()=>{
 const s=setup();await s.c.init();s.c.start();s.advance(25*60000+1000);await s.c.pause();
 assert.equal(s.c.getSnapshot().state,'break');await s.c.end();
 assert.equal(s.rows.size,1);assert.equal([...s.rows.values()][0].completedAt,Date.parse('2026-10-07T10:25:00'));assert.equal(s.c.getSnapshot().state,'ready');
});

test('configured shortcut starts directly, preserves adjustments and accounts for the chosen duration',async()=>{
 const s=setup();s.records.getFocusShortcuts=async()=>[10,null,45];await s.c.init();await s.c.saveSettings({workMin:25,shortAdj:1,longAdj:-1});
 assert.equal(typeof s.c.startShortcut,'function');assert.equal(await s.c.startShortcut(2),true);
 assert.equal(s.c.getSnapshot().state,'working');assert.equal(s.c.getSnapshot().remainingMs,2700000);assert.deepEqual(s.c.getSnapshot().focusShortcuts,[10,null,45]);
 for(let round=0;round<4;round++){
  s.advance(2700000);await s.c.tick();assert.equal(s.c.getSnapshot().segment,round===3?'long-break':'short-break');assert.equal(s.c.getSnapshot().remainingMs,round===3?1560000:600000);
  if(round<3){s.advance(600000);await s.c.tick();}
 }
 assert.equal(s.rows.size,4);assert.equal(s.c.getSnapshot().summary.all.studySeconds,10800);assert.equal(s.permissionRequests(),1);
});
test('empty shortcuts and all active states cannot replace a running timer',async()=>{
 const s=setup();s.records.getFocusShortcuts=async()=>[10,null,45];await s.c.init();assert.equal(typeof s.c.startShortcut,'function');
 for(const slot of [1,-1,3,1.5,'0'])assert.equal(await s.c.startShortcut(slot),false);
 assert.equal(s.c.getSnapshot().state,'ready');await s.c.startShortcut(0);
 assert.equal(await s.c.startShortcut(2),false);s.c.pause();assert.equal(await s.c.startShortcut(2),false);s.c.resume();s.advance(600000);await s.c.tick();assert.equal(await s.c.startShortcut(2),false);
 assert.equal(s.c.getSnapshot().settings.workMin,10);
});
test('shortcut saving blocks double starts; failure retains settings and reset cancels a deferred start',async()=>{
 const s=setup();s.records.getFocusShortcuts=async()=>[10,null,45];await s.c.init();assert.equal(typeof s.c.startShortcut,'function');
 let reject;s.records.saveSettings=()=>new Promise((_resolve,fail)=>{reject=fail;});const failed=s.c.startShortcut(0);
 assert.equal(s.c.getSnapshot().canStart,false);assert.equal(await s.c.startShortcut(2),false);assert.equal(s.c.start(),false);
 reject(new Error('disk full'));assert.equal(await failed,false);assert.equal(s.c.getSnapshot().state,'ready');assert.equal(s.c.getSnapshot().settings.workMin,25);
 let finish;s.records.saveSettings=next=>new Promise(resolve=>{finish=()=>resolve(next);});const cancelled=s.c.startShortcut(0);s.c.reset();finish();assert.equal(await cancelled,false);assert.equal(s.c.getSnapshot().state,'ready');
});
test('shortcut configuration saves only while ready and failure keeps the previous slots',async()=>{
 const s=setup();let slots=[null,null,null];s.records.getFocusShortcuts=async()=>slots;s.records.saveFocusShortcuts=async next=>{slots=next;return next;};await s.c.init();assert.equal(typeof s.c.saveFocusShortcuts,'function');
 assert.equal(await s.c.saveFocusShortcuts([10,null,45]),true);assert.deepEqual(s.c.getSnapshot().focusShortcuts,[10,null,45]);
 s.records.saveFocusShortcuts=async()=>{throw new Error('disk full');};assert.equal(await s.c.saveFocusShortcuts([null,null,null]),false);assert.deepEqual(s.c.getSnapshot().focusShortcuts,[10,null,45]);
 s.c.start();assert.equal(await s.c.saveFocusShortcuts([20,30,40]),false);assert.deepEqual(s.c.getSnapshot().focusShortcuts,[10,null,45]);
});
test('pending completed records prevent shortcut starts even after returning to ready',async()=>{
 const s=setup();s.records.getFocusShortcuts=async()=>[10,null,null];await s.c.init();assert.equal(typeof s.c.startShortcut,'function');
 s.records.saveCompletedPomodoro=async()=>{throw new Error('disk full');};s.c.start();s.advance(1500000);await s.c.tick();await s.c.end();assert.equal(s.c.getSnapshot().state,'ready');assert.equal(await s.c.startShortcut(0),false);assert.equal(s.c.getSnapshot().settings.workMin,25);
});
