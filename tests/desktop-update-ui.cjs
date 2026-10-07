// Real Electron relaunch through the installed shell. All packages and data are temporary.
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const net=require('node:net');
const assert=require('node:assert/strict');const {spawn,execFileSync}=require('node:child_process');
const {chromium}=require('playwright-core');const {installUser}=require('../scripts/install-user.cjs');const {publishRelease,writeRelease}=require('../desktop/releases.cjs');
const {openDatabase}=require('../desktop/database.cjs');
if(!process.env.DISPLAY){
 try{const text=execFileSync('systemctl',['--user','show-environment'],{env:{...process.env,DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS??`unix:path=/run/user/${process.getuid()}/bus`},encoding:'utf8',stdio:['ignore','pipe','ignore']});
  for(const line of text.split('\n')){const at=line.indexOf('='),key=line.slice(0,at);if(['DISPLAY','XAUTHORITY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR'].includes(key)&&!process.env[key])process.env[key]=line.slice(at+1);}
 }catch{}
}
if(!process.env.DISPLAY)throw new Error('未验收：需要已有图形会话。');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-live-update-')),xdg=path.join(dir,'xdg'),dataDir=path.join(xdg,'tomatoclock');
const out=process.env.TOMATOCLOCK_QA_DIR??path.resolve('.superpowers/update-qa');fs.mkdirSync(out,{recursive:true});
const signals=path.join(dir,'ready.json'),dialogs=path.join(dir,'dialogs.jsonl');let child,browser;let realPid;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(condition,label){const until=Date.now()+20000;while(Date.now()<until){const value=condition();if(value)return value;await delay(100);}throw new Error(`等待超时：${label}`);}
async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
function prepare(name,version,sourceDir=path.resolve('dist/TomatoClock-linux-x64')){
 const packageDir=path.join(dir,name);fs.cpSync(fs.realpathSync(sourceDir),packageDir,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
 const metaFile=path.join(packageDir,'resources/app/package.json'),meta=JSON.parse(fs.readFileSync(metaFile));meta.version=version;fs.writeFileSync(metaFile,JSON.stringify(meta));
 // Only these test copies answer the native dialog automatically and report the new process.
 const main=path.join(packageDir,'resources/app/desktop/main.cjs');
 const probe=`const __qaElectron=require('electron'),__qaFs=require('node:fs');\n__qaElectron.dialog.showMessageBox=async options=>{__qaFs.appendFileSync(${JSON.stringify(dialogs)},JSON.stringify(options)+'\\n');return {response:0};};\n__qaElectron.app.on('browser-window-created',(_event,w)=>w.webContents.once('did-finish-load',()=>{__qaFs.writeFileSync(${JSON.stringify(signals)},JSON.stringify({pid:process.pid,exe:process.execPath,appPath:__qaElectron.app.getAppPath(),profile:__qaElectron.app.getPath('userData'),version:${JSON.stringify(version)},prefs:w.webContents.getLastWebPreferences(),sandboxDisabled:__qaElectron.app.commandLine.hasSwitch('no-sandbox')}));}));\n`;
 fs.writeFileSync(main,probe+fs.readFileSync(main,'utf8'));return packageDir;
}
(async()=>{try{
 const at=process.argv.indexOf('--old-package'),oldSource=at>=0?process.argv[at+1]:undefined;
 const old=prepare('old','0.3.0',oldSource),next=prepare('new','0.3.1'),feed=path.join(dir,'本地 更新');
 const installed=installUser({sourceDir:old,prefix:path.join(dir,'用户 安装'),updateSource:feed});const previous=fs.realpathSync(path.join(installed.appDir,'current'));
 const obsolete=writeRelease({sourceDir:prepare('obsolete','0.2.9'),releasesDir:path.join(installed.appDir,'versions')});
 const release=publishRelease({sourceDir:next,feedDir:feed});
 fs.mkdirSync(dataDir,{recursive:true});const db=await openDatabase({filePath:path.join(dataDir,'learning.sqlite')});
 db.saveCompletedPomodoro({id:'00000000-0000-4000-8000-000000000123',completedAt:Date.parse('2026-10-07T10:00:00'),workMs:1500000});db.saveSettings({workMin:25,shortAdj:1,longAdj:0});db.close();
 const port=await freePort(),env={...process.env,XDG_DATA_HOME:xdg,DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS??`unix:path=/run/user/${process.getuid()}/bus`};delete env.ELECTRON_RUN_AS_NODE;
 const log=fs.openSync(path.join(out,'relaunch.log'),'w');child=spawn(installed.launcher,[`--remote-debugging-port=${port}`],{env,stdio:['ignore',log,log]});fs.closeSync(log);
 const ready=await waitFor(()=>{if(!fs.existsSync(signals))return false;try{return JSON.parse(fs.readFileSync(signals));}catch{return false;}},'新版重新打开');realPid=ready.pid;
 assert.equal(ready.version,'0.3.1');assert.equal(ready.profile,path.join(dataDir,'electron'));assert.ok(ready.exe.startsWith(dir+path.sep));assert.equal(ready.sandboxDisabled,false);
 assert.equal(ready.prefs.sandbox,true);assert.equal(ready.prefs.contextIsolation,true);assert.equal(ready.prefs.nodeIntegration,false);
 await waitFor(()=>!fs.existsSync(path.join(installed.appDir,'.pending-update.json')),'新版启动确认');
 await waitFor(()=>!fs.existsSync(obsolete.releaseDir),'旧程序自动清理');
 assert.equal(fs.realpathSync(path.join(installed.appDir,'current')),release.id?path.join(installed.appDir,'versions',release.id,'package'):null);assert.ok(fs.existsSync(previous));
 const options=JSON.parse(fs.readFileSync(dialogs,'utf8').trim());assert.deepEqual(options.buttons,['立即更新','暂时跳过']);assert.ok(options.message.includes('0.3.1'));
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];
 await page.waitForFunction(()=>!document.getElementById('start-btn').disabled);
 assert.equal(await page.locator('#work-input').inputValue(),'25');assert.equal(await page.locator('#today-count').textContent(),'1');assert.equal(await page.locator('#all-time').textContent(),'25 分');
 const state=await page.evaluate(()=>window.tomatoDesktop.getSummary('2026-10-07'));assert.deepEqual(state.value.all,{pomodoros:1,studySeconds:1500});
 await page.screenshot({path:path.join(out,'updated-app.png')});
 const backups=fs.readdirSync(path.join(dataDir,'backups'));assert.equal(backups.length,1);const backup=await openDatabase({filePath:path.join(dataDir,'backups',backups[0])});assert.deepEqual(backup.getSummary('2026-10-07').all,{pomodoros:1,studySeconds:1500});backup.close();
 const result={actualShellEntry:true,actualElectronRelaunch:true,oldProgramSource:oldSource?'read-only copy of installed 0.3.0':'temporary fixture',updatedVersion:'0.3.1',temporaryProfile:true,learningRecordsPreserved:true,settingsPreserved:true,backupReadable:true,previousProgramRetained:true,obsoleteProgramAutomaticallyRemoved:true,sandboxEnabled:true};
 fs.writeFileSync(path.join(out,'update-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{
  if(browser)await browser.close();
  if(realPid){try{process.kill(realPid,'SIGTERM');}catch{}}
  if(child){try{child.kill('SIGTERM');}catch{}}
  await delay(500);fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
