import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from '../js/settings-view.js';
function setup(persist=async()=>true){
 let snapshot={state:'ready',canStart:true,settings:{workMin:50,shortAdj:0,longAdj:0}};
 assert.equal(typeof module.createSettingsDraft,'function');
 const calls=[];const editor=module.createSettingsDraft({getSnapshot:()=>snapshot,persist:async value=>{calls.push(value);return persist(value);}});
 return {editor,calls,setSnapshot:value=>{snapshot=value;editor.sync(snapshot);}};
}
test('disc drafts never save on input or cancel and start from committed settings',()=>{
 const {editor,calls}=setup();assert.equal(editor.open('workMin'),true);editor.setValue('75');
 assert.equal(editor.getState().value,'75');assert.equal(calls.length,0);editor.cancel();assert.equal(editor.getState().key,null);
 editor.open('workMin');assert.equal(editor.getState().value,'50');
});
test('disc validates integer work and adjustment ranges without silently clamping',async()=>{
 const {editor,calls}=setup();
 for(const [key,bad] of [['workMin',['','0','181','1.5','1e2']],['shortAdj',['-6','6','0.5']],['longAdj',['-6','6']]]){
  for(const value of bad){editor.cancel();editor.open(key);editor.setValue(value);assert.equal(await editor.save(),false);assert.ok(editor.getState().error);}
 }
 assert.equal(calls.length,0);
 editor.setValue('-5');assert.equal(await editor.save(),true);assert.deepEqual(calls[0],{workMin:50,shortAdj:0,longAdj:-5});
});
test('disc only closes after successful persistence and blocks double saves',async()=>{
 let resolve;const {editor,calls}=setup(()=>new Promise(done=>{resolve=done;}));editor.open('workMin');editor.setValue('60');
 const save=editor.save();assert.equal(editor.getState().saving,true);assert.equal(editor.getState().key,'workMin');assert.equal(await editor.save(),false);assert.equal(calls.length,1);
 resolve(true);assert.equal(await save,true);assert.equal(editor.getState().key,null);
});
test('disc save failure and exceptions retain the draft for retry',async()=>{
 let fail=true;const {editor,calls}=setup(async()=>{if(fail)throw new Error('disk full');return true;});editor.open('shortAdj');editor.setValue('3');
 assert.equal(await editor.save(),false);assert.equal(editor.getState().value,'3');assert.equal(editor.getState().key,'shortAdj');assert.equal(editor.getState().saving,false);assert.ok(editor.getState().error);
 fail=false;assert.equal(await editor.save(),true);assert.equal(calls.length,2);assert.equal(editor.getState().key,null);
});
test('locked timer settings cannot open or save, and external changes dismiss drafts',async()=>{
 const {editor,calls,setSnapshot}=setup();editor.open('workMin');editor.setValue('90');
 setSnapshot({state:'working',canStart:false,settings:{workMin:50,shortAdj:0,longAdj:0}});
 assert.equal(editor.getState().key,null);assert.equal(editor.open('shortAdj'),false);assert.equal(await editor.save(),false);assert.equal(calls.length,0);
});
test('own persistence publishes a locked snapshot without discarding its draft',async()=>{
 let resolve;const {editor,setSnapshot}=setup(()=>new Promise(done=>{resolve=done;}));editor.open('workMin');editor.setValue('60');const save=editor.save();
 setSnapshot({state:'ready',canStart:false,settings:{workMin:50,shortAdj:0,longAdj:0}});assert.equal(editor.getState().value,'60');assert.equal(editor.getState().key,'workMin');
 resolve(false);assert.equal(await save,false);assert.equal(editor.getState().key,'workMin');
});
test('leaving during save ignores stale completion without reopening or cancelling a new draft',async()=>{
 let resolve;const {editor,setSnapshot}=setup(()=>new Promise(done=>{resolve=done;}));editor.open('workMin');editor.setValue('60');const save=editor.save();editor.cancel();
 setSnapshot({state:'ready',canStart:true,settings:{workMin:60,shortAdj:0,longAdj:0}});editor.open('longAdj');editor.setValue('2');resolve(true);await save;
 assert.equal(editor.getState().key,'longAdj');assert.equal(editor.getState().value,'2');assert.equal(editor.getState().saving,false);
});
