const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
const {createDesktopApplication}=require('../desktop/application.cjs');
const {fakeElectron,source}=require('./helpers/desktop.cjs');
async function fixture(t){
 const e=fakeElectron(),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-app-'));t.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
 const a=await createDesktopApplication({electron:e,dataDir,htmlPath:path.resolve('index.html')});
 return {e,...a};
}
async function settle(){await new Promise(r=>setImmediate(r));}
async function respond(e,w,pendingCount){const request=w.sent.findLast(x=>x[0]==='tc:prepareClose');assert.ok(request);return e.handlers.get('tc:closeStatus')(source(w),{requestId:request[1],pendingCount});}
test('window security, single instance, actual visibility and known phase notifications',async t=>{
 const {e,window,forceClose}=await fixture(t);t.after(forceClose);
 const prefs=window.options.webPreferences;
 assert.equal(prefs.contextIsolation,true);assert.equal(prefs.sandbox,true);assert.equal(prefs.nodeIntegration,false);assert.equal(prefs.backgroundThrottling,false);
 window.focused=false;window.emit('blur');assert.equal(window.sent.at(-1)[1],false);
 window.focused=true;window.minimized=true;window.emit('minimize');assert.equal(window.sent.at(-1)[1],false);
 e.app.emit('second-instance');assert.equal(window.minimized,false);assert.equal(window.focused,true);
 assert.deepEqual(window.openHandler(),{action:'deny'});
 let denied=false;window.webContents.emit('will-navigate',{preventDefault(){denied=true;}});assert.equal(denied,true);
 const notify=e.handlers.get('tc:notifyPhase');
 assert.equal((await notify(source(window),{phase:'work-done',kind:'short',durationMs:600000})).ok,true);
 assert.deepEqual(e.notes[0].options,{title:'番茄完成 🍅',body:'该休息了：短休 10 分。'});
 assert.equal((await notify(source(window),{phase:'bad'})).ok,false);
});
test('close awaits renderer persistence, clean status quits without a prompt',async t=>{
 const {e,window,close}=await fixture(t);const closing=close();await settle();assert.equal(e.app.quits,0);
 await respond(e,window,0);await closing;assert.equal(e.app.quits,1);
});
test('unsaved completed record can cancel or explicitly abandon exit',async t=>{
 const {e,window,close,forceClose}=await fixture(t);t.after(forceClose);
 e.dialog.showMessageBox=async()=>({response:1});let closing=close();await settle();await respond(e,window,1);await closing;assert.equal(e.app.quits,0);
 e.dialog.showMessageBox=async()=>({response:2});closing=close();await settle();await respond(e,window,1);await closing;assert.equal(e.app.quits,1);
});
test('retry close requests a new persistence result and only quits after success',async t=>{
 const {e,window,close}=await fixture(t);e.dialog.showMessageBox=async()=>({response:0});const closing=close();await settle();
 await respond(e,window,1);await settle();assert.equal(e.app.quits,0);
 await respond(e,window,0);await closing;assert.equal(e.app.quits,1);
});
test('second process exits without opening database, renderer crash preserves committed rows',async t=>{
 const e=fakeElectron();e.app.requestSingleInstanceLock=()=>false;
 const second=await createDesktopApplication({electron:e,dataDir:'/unused',htmlPath:path.resolve('index.html'),openDatabaseImpl:()=>{throw new Error('must not open');}});
 assert.equal(second.window,null);assert.equal(e.app.quits,1);
 const first=await fixture(t);first.window.webContents.emit('render-process-gone');assert.equal(first.e.app.quits,1);
});
test('single-instance lock uses the selected isolated profile, not default user configuration',async t=>{
 const e=fakeElectron(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-lock-profile-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let profile;
 e.app.setPath=(name,value)=>{if(name==='userData')profile=value;};e.app.requestSingleInstanceLock=()=>{assert.equal(profile,path.join(dir,'electron'));return true;};
 const application=await createDesktopApplication({electron:e,dataDir:dir,htmlPath:path.resolve('index.html')});application.forceClose();
});
test('startup update runs after instance lock and before database; accepted update creates no timer window',async t=>{
 const e=fakeElectron(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-update-hook-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let ready=false,locked=false,checked=false;
 e.app.requestSingleInstanceLock=()=>{locked=true;return true;};e.app.whenReady=async()=>{ready=true;};
 const result=await createDesktopApplication({electron:e,dataDir:dir,beforeOpen:async()=>{assert.ok(ready&&locked);checked=true;return true;},openDatabaseImpl:()=>{throw new Error('must not open database');}});
 assert.ok(checked);assert.equal(result.window,null);
 e.app.requestSingleInstanceLock=()=>false;await createDesktopApplication({electron:e,dataDir:dir,beforeOpen:()=>{throw new Error('second process must not update');}});
});
test('an unavailable database is never acknowledged as a healthy update',async t=>{
 const e=fakeElectron(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-health-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let acknowledged=false;
 const a=await createDesktopApplication({electron:e,dataDir:dir,openDatabaseImpl:()=>{throw new Error('database unavailable');},onStarted:()=>{acknowledged=true;}});
 assert.equal(acknowledged,false);a.forceClose();
});
test('startup path failure shows a native error after ready, preserves path and creates no replacement database',async t=>{
 const {startDesktopApplication}=require('../desktop/application.cjs');const e=fakeElectron();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-startup-error-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const blocked=path.join(dir,'blocked');fs.writeFileSync(blocked,'keep');const order=[],dialogs=[];let exitCode;
 e.app.whenReady=async()=>{order.push('ready');};e.app.exit=code=>{exitCode=code;};e.dialog.showErrorBox=(title,message)=>{order.push('dialog');dialogs.push({title,message});};
 const value=await startDesktopApplication({electron:e,dataDir:path.join(blocked,'data'),htmlPath:path.resolve('index.html')});
 assert.equal(value,null);assert.deepEqual(order,['ready','dialog']);assert.equal(exitCode,1);assert.equal(dialogs[0].title,'番茄钟无法启动');assert.ok(dialogs[0].message.includes('ENOTDIR'));assert.equal(fs.readFileSync(blocked,'utf8'),'keep');
});
