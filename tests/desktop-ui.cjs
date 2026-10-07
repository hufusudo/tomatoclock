const {_electron}=require('playwright-core');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
if(!process.env.DISPLAY){try{const text=execFileSync('systemctl',['--user','show-environment'],{env:{...process.env,DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS??`unix:path=/run/user/${process.getuid()}/bus`},encoding:'utf8',stdio:['ignore','pipe','ignore']});for(const line of text.split('\n')){const n=line.indexOf('=');const key=line.slice(0,n);if(['DISPLAY','XAUTHORITY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR'].includes(key)&&!process.env[key])process.env[key]=line.slice(n+1);}}catch{}}
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged');
const out=process.env.TOMATOCLOCK_QA_DIR??path.join(root,'.superpowers/sdd/2026-10-07-desktop-app/gui');fs.mkdirSync(out,{recursive:true});
const runtime=process.env.XDG_RUNTIME_DIR??`/run/user/${process.getuid()}`;
const wayland=process.env.WAYLAND_DISPLAY??(fs.existsSync(path.join(runtime,'wayland-0'))?'wayland-0':null);
if(!wayland&&!process.env.DISPLAY){console.error('未验收：没有可用图形会话。请在桌面中运行此命令。');process.exit(2);}
const platform=process.env.TOMATOCLOCK_OZONE_PLATFORM??'x11';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-e2e-'));
const appRoot=packaged?path.join(root,'dist/TomatoClock-linux-x64/resources/app'):root;
const executablePath=packaged?path.join(root,'dist/TomatoClock-linux-x64/TomatoClock'):require('electron');
let app;const errors=[];const noticeResults=[];
async function launch(){
 app=await _electron.launch({executablePath,args:[`--ozone-platform=${platform}`,path.join(__dirname,'fixtures/electron-test-main.cjs')],chromiumSandbox:true,env:{...process.env,XDG_RUNTIME_DIR:runtime,...(wayland?{WAYLAND_DISPLAY:wayland}:{}),DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS??`unix:path=${runtime}/bus`,XDG_DATA_HOME:path.join(dir,'xdg'),TOMATOCLOCK_TEST_DATA_DIR:dir,TOMATOCLOCK_TEST_APP_ROOT:appRoot},timeout:20000});
 const profile=await app.evaluate(({app})=>app.getPath('userData'));assert.ok(profile.startsWith(dir+path.sep),'GUI must use its temporary profile before any test write');
 await app.evaluate(({Notification})=>{globalThis.__tcNotices={created:[],shown:[],failed:[]};const original=Notification.prototype.show;Notification.prototype.show=function(...args){const options={title:this.title,body:this.body};globalThis.__tcNotices.created.push(options);this.once('show',()=>globalThis.__tcNotices.shown.push(options.title));this.once('failed',(_event,error)=>globalThis.__tcNotices.failed.push(String(error)));return original.apply(this,args);};});
 const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.waitForFunction(()=>!document.getElementById('start-btn').disabled,null,{polling:50});return page;
}
async function close(){if(!app)return;noticeResults.push(await app.evaluate(()=>globalThis.__tcNotices));await app.close();app=null;}
(async()=>{try{
 let page=await launch();
 assert.equal(await app.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox')),false);
 const prefs=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());assert.equal(prefs.sandbox,true);assert.equal(prefs.contextIsolation,true);assert.equal(prefs.nodeIntegration,false);
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');assert.ok((await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).includes("connect-src 'none'"));
 await page.addInitScript(()=>{window.__testNow=Date.parse('2026-10-07T10:00:00');Date.now=()=>window.__testNow;window.__contexts=[];const Original=window.AudioContext;window.AudioContext=function(...args){const c=new Original(...args);window.__contexts.push(c);return c;};window.AudioContext.prototype=Original.prototype;});
 await page.reload();await page.waitForFunction(()=>!document.getElementById('start-btn').disabled,null,{polling:50});
 await page.locator('#work-input').fill('1');await page.locator('#start-btn').click();await page.waitForFunction(()=>document.getElementById('phase-label').textContent==='专注中',null,{polling:50});
 await page.locator('#records-toggle').click();await page.waitForSelector('#records-view:not([hidden])');await page.locator('#records-back').click();assert.equal(await page.locator('#phase-label').textContent(),'专注中');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());
 await page.waitForFunction(async()=>!(await window.tomatoDesktop.getVisibility()).value,null,{polling:50});
 await page.evaluate(()=>window.__testNow+=60000);await page.waitForFunction(()=>document.getElementById('today-count').textContent==='1',null,{polling:50});
 assert.equal(await page.locator('[role=dialog]').count(),0);assert.equal(await page.locator('#today-time').textContent(),'1 分');
 await page.evaluate(()=>window.__testNow+=60000);await page.waitForFunction(()=>document.getElementById('phase-label').textContent==='准备开始',null,{polling:50});
 assert.equal(await page.locator('#start-btn').textContent(),'开始下一个番茄');assert.equal(await page.locator('[role=dialog]').count(),0);
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.restore();w.show();w.focus();});
 await page.waitForFunction(()=>document.querySelector('[role=dialog]')?.getAttribute('aria-label')==='该开工了',null,{polling:50,timeout:10000});
 assert.equal(await page.locator('.tc-clock').count(),0);await page.waitForFunction(()=>window.__contexts.some(c=>c.state==='running'),null,{polling:50});
 await page.waitForTimeout(1500);await page.keyboard.press('Escape');assert.equal(await page.locator('[role=dialog]').count(),0);
 const notes=await app.evaluate(()=>globalThis.__tcNotices);assert.deepEqual(notes.created.map(n=>n.title),['番茄完成 🍅','休息结束']);
 await page.locator('#start-btn').click();await page.waitForFunction(()=>document.getElementById('phase-label').textContent==='专注中',null,{polling:50});await page.evaluate(()=>window.__testNow+=10000);await close();
 page=await launch();assert.equal(await page.locator('#phase-label').textContent(),'准备开始');assert.equal(await page.locator('#work-input').inputValue(),'1');
 const state=await page.evaluate(()=>window.tomatoDesktop.getSummary('2026-10-07'));assert.deepEqual(state.value.all,{pomodoros:1,studySeconds:60});
 const legacy=path.join(dir,'old-records.json');fs.writeFileSync(legacy,JSON.stringify({days:{'2026-10-06':{pomodoros:2,studySeconds:4500}},settings:{workMin:25}}));
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},legacy);
 await page.locator('#records-toggle').click();await page.locator('#legacy-import-btn').click();await page.waitForSelector('#import-preview:not([hidden])');
 assert.equal((await page.evaluate(()=>window.tomatoDesktop.getSummary('2026-10-07'))).value.all.pomodoros,1);
 await page.locator('#import-confirm').click();await page.waitForFunction(()=>document.querySelectorAll('#records-body tr').length===2,null,{polling:50});
 assert.equal(await page.locator('#all-time').textContent(),'1 小时 16 分');
 await page.screenshot({path:path.join(out,packaged?'records-packaged.png':'records.png')});
 await page.locator('#records-back').click();await page.screenshot({path:path.join(out,packaged?'timer-packaged.png':'timer.png')});
 assert.deepEqual(errors,[]);
 await close();
 const result={packaged,displayBackend:platform,sandbox:'enabled',actualSQLite:'pass',minimizedTimer:'pass',latestReminderOnce:'pass',manualStart:'pass',unfinishedDiscarded:'pass',restartPersistence:'pass',importPreviewConfirmation:'pass',audioContext:'running',pageErrors:errors,notifications:noticeResults};
 fs.writeFileSync(path.join(out,packaged?'packaged-verification.json':'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{if(app)await close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
