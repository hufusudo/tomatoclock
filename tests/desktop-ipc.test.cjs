const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {registerIpc}=require('../desktop/ipc.cjs');const {openDatabase}=require('../desktop/database.cjs');
const {FakeWindow,fakeElectron,source}=require('./helpers/desktop.cjs');
test('rest-image operations allow only the main frame and never accept a renderer file path',async t=>{
 const e=fakeElectron(),window=new FakeWindow({}),calls=[];const restImage=Object.fromEntries(['get','choose','reset'].map(method=>[method,(...args)=>{assert.equal(args.length,0);calls.push(method);return {custom:false,dataUrl:null};}]));restImage.finish=value=>{assert.deepEqual(value,{token:'one-use',dataUrl:'validated PNG'});return {custom:true};};const dispose=registerIpc({ipcMain:e.ipcMain,window,restImage});t.after(dispose);
 for(const channel of ['getRestImage','chooseRestImage','resetRestImage']){const handler=e.handlers.get(`tc:${channel}`);assert.equal((await handler({sender:{},senderFrame:{}},'/etc/passwd')).ok,false);assert.equal((await handler({...source(window),senderFrame:{}},{})).ok,false);assert.equal((await handler(source(window),'/etc/passwd')).ok,true);}assert.deepEqual(calls,['get','choose','reset']);
 const finish=e.handlers.get('tc:finishRestImage');assert.equal((await finish({sender:{},senderFrame:{}},{})).ok,false);assert.equal((await finish(source(window),{token:'one-use',dataUrl:'validated PNG'})).ok,true);
});
test('theme operations authorise only the main frame and accept no arbitrary file path',async t=>{
 const e=fakeElectron(),window=new FakeWindow({});let reads=0,opens=0;
 const theme={read(...args){assert.equal(args.length,0);reads++;return {css:':root {}'};},open(...args){assert.equal(args.length,0);opens++;return {filePath:'/tmp/application-only/custom.css'};}};
 const dispose=registerIpc({ipcMain:e.ipcMain,window,theme});t.after(dispose);
 for(const name of ['getTheme','openTheme']){const handler=e.handlers.get(`tc:${name}`);assert.equal((await handler({sender:{},senderFrame:{}},'/etc/passwd')).ok,false);assert.equal((await handler({...source(window),senderFrame:{}},{})).ok,false);assert.equal((await handler(source(window),{path:'/etc/passwd'})).ok,true);}
 assert.equal(reads,1);assert.equal(opens,1);
});
test('focus shortcut IPC allows only the main frame and sends validated values to its service',async t=>{
 const e=fakeElectron(),window=new FakeWindow({}),saved=[];const focusShortcuts={get:async(...args)=>{assert.equal(args.length,0);return [20,null,null];},save:async(...args)=>{assert.deepEqual(args,[[30,null,120]]);saved.push(args[0]);return args[0];}};
 const dispose=registerIpc({ipcMain:e.ipcMain,window,focusShortcuts});t.after(dispose);
 for(const name of ['getFocusShortcuts','saveFocusShortcuts']){const handler=e.handlers.get(`tc:${name}`);assert.equal((await handler({sender:{},senderFrame:{}},[30,null,120])).ok,false);assert.equal((await handler({...source(window),senderFrame:{}},[30,null,120])).ok,false);}
 assert.deepEqual((await e.handlers.get('tc:getFocusShortcuts')(source(window))).value,[20,null,null]);
 assert.deepEqual((await e.handlers.get('tc:saveFocusShortcuts')(source(window),[30,null,120])).value,[30,null,120]);assert.deepEqual(saved,[[30,null,120]]);
});
test('IPC authorizes only the main window frame and uses the real database',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-ipc-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const db=await openDatabase({filePath:path.join(dir,'learning.sqlite')});t.after(()=>db.close());
 const e=fakeElectron(),window=new FakeWindow({});const dispose=registerIpc({ipcMain:e.ipcMain,window,db,dialog:e.dialog,notify:()=>true});t.after(dispose);
 const record={id:'00000000-0000-4000-8000-000000000001',completedAt:Date.parse('2026-10-07T10:00:00'),workMs:1500000};
 const handler=e.handlers.get('tc:saveCompletedPomodoro');
 assert.equal((await handler({sender:{},senderFrame:{}},record)).ok,false);
 assert.equal((await handler({...source(window),senderFrame:{}},record)).ok,false);
 assert.equal(db.getSummary('2026-10-07').all.pomodoros,0);
 assert.equal((await handler(source(window),record)).ok,true);
 assert.deepEqual(db.getSummary('2026-10-07').today,{pomodoros:1,studySeconds:1500});
 assert.equal((await e.handlers.get('tc:listDaily')(source(window),{offset:-1,limit:30})).ok,false);
 const range=e.handlers.get('tc:getDailyRange');assert.equal(typeof range,'function');
 assert.equal((await range({sender:{},senderFrame:{}},{from:'2026-10-07',to:'2026-10-07'})).ok,false);
 assert.deepEqual((await range(source(window),{from:'2026-10-07',to:'2026-10-07'})).value,[{day:'2026-10-07',pomodoros:1,studySeconds:1500}]);
 assert.equal((await range(source(window),{from:'2026-02-30',to:'2026-03-01'})).ok,false);
 assert.equal(e.handlers.has('tc:query'),false);
});
