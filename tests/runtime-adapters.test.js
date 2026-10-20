import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRuntime} from '../js/runtime-adapters.js';import {createStorage} from '../js/storage.js';
test('web adapter presents promise records while preserving localStorage snapshots',async()=>{
 const map=new Map();const storage=createStorage({backend:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}});
 const runtime=createRuntime({storage,notifier:{notify:()=>true},document:{visibilityState:'visible'}});
 const row={id:'same',completedAt:Date.parse('2026-10-07T10:00:00'),workMs:1500000};
 await runtime.records.saveCompletedPomodoro(row);await runtime.records.saveCompletedPomodoro(row);
 assert.deepEqual((await runtime.records.getSummary('2026-10-07')).today,{pomodoros:1,studySeconds:1500});
 assert.equal((await runtime.records.listDaily({offset:0,limit:30})).rows[0].day,'2026-10-07');assert.equal(runtime.isVisible(),true);
});
test('desktop adapter unwraps errors and native window visibility, cancels subscription',async()=>{
 let listener,unsubscribed=false;
 const desktopApi={getVisibility:async()=>({ok:true,value:true}),onVisibilityChange:cb=>{listener=cb;return ()=>{unsubscribed=true;};},getSettings:async()=>({ok:false,error:{code:'FAILED',message:'database unavailable'}})};
 const runtime=createRuntime({desktopApi});let changes=0;const stop=runtime.watchVisibility(()=>changes++);await new Promise(r=>setImmediate(r));
 assert.equal(runtime.isVisible(),true);listener(false);assert.equal(runtime.isVisible(),false);assert.ok(changes>=1);stop();assert.equal(unsubscribed,true);
 await assert.rejects(runtime.records.getSettings(),/database unavailable/);
});
test('desktop adapter preserves automatic-start state in the native break notification',async()=>{
 let notification;const desktopApi={getVisibility:async()=>({ok:true,value:true}),onVisibilityChange:()=>()=>{},notifyPhase:async value=>{notification=value;return {ok:true,value:{sent:true}};}};
 const runtime=createRuntime({desktopApi});assert.equal(await runtime.notifier.notify({phase:'break-done',autoStarted:true}),true);assert.equal(notification.phase,'break-done');assert.equal(notification.autoStarted,true);
});
test('runtime exposes shortcut reads and writes without dropping local records',async()=>{
 const map=new Map(),storage=createStorage({backend:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}});
 const runtime=createRuntime({storage,notifier:{},document:{visibilityState:'visible'}});
 await runtime.records.saveFocusShortcuts([35,null,90]);await runtime.records.saveSettings({workMin:45});
 await runtime.records.saveCompletedPomodoro({id:'shortcut-test',completedAt:Date.parse('2026-10-07T10:00:00'),workMs:60000});
 assert.deepEqual(await runtime.records.getFocusShortcuts(),[35,null,90]);
 assert.deepEqual((await runtime.records.getSummary('2026-10-07')).today,{pomodoros:1,studySeconds:60});
});
test('desktop records unwrap persisted focus shortcut values',async()=>{
 let saved;const desktopApi={getVisibility:async()=>({ok:true,value:true}),onVisibilityChange:()=>()=>{},getFocusShortcuts:async()=>({ok:true,value:[15,null,75]}),saveFocusShortcuts:async raw=>{saved=raw;return {ok:true,value:raw};}};
 const runtime=createRuntime({desktopApi});
 assert.deepEqual(await runtime.records.getFocusShortcuts(),[15,null,75]);
 assert.deepEqual(await runtime.records.saveFocusShortcuts([30,null,null]),[30,null,null]);
 assert.deepEqual(saved,[30,null,null]);
});
test('web export contains only its normalized days/settings and keeps original records',async()=>{
 const storage={isPersistent:true,load:()=>({days:{'2026-10-07':{pomodoros:2,studySeconds:4500}},settings:{workMin:50,shortAdj:0,longAdj:0}})};
 const r=createRuntime({storage,notifier:{},document:{visibilityState:'visible'}});
 assert.deepEqual(JSON.parse(r.legacy.exportJson()),{days:{'2026-10-07':{pomodoros:2,studySeconds:4500}},settings:{workMin:50,shortAdj:0,longAdj:0}});
 assert.equal((await r.records.getSummary('2026-10-07')).today.pomodoros,2);
});
test('web date range reads only inclusive matching days in ascending order without altering storage',async()=>{
 const days={'2026-10-05':{pomodoros:9,studySeconds:900},'2026-10-04':{pomodoros:2,studySeconds:3000},'2026-09-28':{pomodoros:1,studySeconds:1500}};
 const before=JSON.stringify(days),runtime=createRuntime({storage:{load:()=>({days})},notifier:{},document:{visibilityState:'visible'}});
 assert.deepEqual(await runtime.records.getDailyRange({from:'2026-09-28',to:'2026-10-04'}),[{day:'2026-09-28',pomodoros:1,studySeconds:1500},{day:'2026-10-04',pomodoros:2,studySeconds:3000}]);
 await assert.rejects(runtime.records.getDailyRange({from:'2026-02-30',to:'2026-03-01'}));assert.equal(JSON.stringify(days),before);
});
