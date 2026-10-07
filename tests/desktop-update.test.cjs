const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {spawn}=require('node:child_process');
const {fakeElectron}=require('./helpers/desktop.cjs');

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-update-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const make=(name,version,text)=>{
  const dir=path.join(root,name);fs.mkdirSync(path.join(dir,'resources/app/desktop'),{recursive:true});
  fs.writeFileSync(path.join(dir,'TomatoClock'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  fs.writeFileSync(path.join(dir,'resources/app/package.json'),JSON.stringify({name:'tomatoclock',version}));
  fs.writeFileSync(path.join(dir,'resources/app/desktop/main.cjs'),text);
  return dir;
 };
 return {root,make};
}
function modules(){return {...require('../desktop/releases.cjs'),...require('../desktop/local-update.cjs')};}
function installed(t){
 const f=fixture(t),{publishRelease}=modules();const {installUser}=require('../scripts/install-user.cjs');
 const feed=path.join(f.root,'新版 目录'),old=f.make('old','0.2.0','old'),next=f.make('new','0.3.0','new');
 const result=installUser({sourceDir:old,prefix:path.join(f.root,'用户 安装'),updateSource:feed});
 const release=publishRelease({sourceDir:next,feedDir:feed});
 const appRoot=path.join(fs.realpathSync(path.join(result.appDir,'current')),'resources/app');
 const dataDir=path.join(f.root,'data');fs.mkdirSync(dataDir);fs.writeFileSync(path.join(dataDir,'learning.sqlite'),'user records');
 const electron=fakeElectron(),dialogs=[],relaunches=[];electron.app.relaunch=options=>relaunches.push(options);electron.app.exit=code=>{electron.exitCode=code;};
 electron.dialog.showMessageBox=async options=>{dialogs.push(options);return {response:0};};
 return {...f,...result,feed,release,appRoot,dataDir,electron,dialogs,relaunches};
}
test('published release is immutable, complete and checksum verified before use',t=>{
 const f=fixture(t),{publishRelease,readRelease}=modules();const sourceDir=f.make('package','0.3.0','first');const feedDir=path.join(f.root,'feed');
 const first=publishRelease({sourceDir,feedDir});assert.equal(readRelease(feedDir).id,first.id);
 fs.writeFileSync(path.join(sourceDir,'resources/app/desktop/main.cjs'),'second');const second=publishRelease({sourceDir,feedDir});
 assert.notEqual(first.id,second.id);assert.equal(fs.readFileSync(path.join(first.packageDir,'resources/app/desktop/main.cjs'),'utf8'),'first');
 fs.writeFileSync(path.join(second.packageDir,'resources/app/desktop/main.cjs'),'tampered');assert.throws(()=>readRelease(feedDir),/校验|完整/);
});
test('release rejects escaping paths, symlinks and unsupported versions without publishing',t=>{
 const f=fixture(t),{publishRelease,readRelease}=modules();const sourceDir=f.make('package','0.3.0','first'),feedDir=path.join(f.root,'feed');
 fs.symlinkSync('/etc/passwd',path.join(sourceDir,'escape'));assert.throws(()=>publishRelease({sourceDir,feedDir}),/链接/);assert.equal(fs.existsSync(path.join(feedDir,'latest.json')),false);fs.unlinkSync(path.join(sourceDir,'escape'));
 fs.writeFileSync(path.join(sourceDir,'resources/app/package.json'),JSON.stringify({name:'tomatoclock',version:'../../escape'}));assert.throws(()=>publishRelease({sourceDir,feedDir}),/版本/);
 fs.mkdirSync(feedDir,{recursive:true});fs.writeFileSync(path.join(feedDir,'latest.json'),JSON.stringify({format:1,id:'../escape'}));assert.throws(()=>readRelease(feedDir));
});
test('managed legacy install gains stable launcher without replacing its running executable or user extras',t=>{
 const f=fixture(t),sourceDir=f.make('package','0.3.0','new'),prefix=path.join(f.root,'用户 安装'),appDir=path.join(prefix,'opt/tomatoclock');
 fs.mkdirSync(appDir,{recursive:true});fs.writeFileSync(path.join(appDir,'.tomatoclock-install.json'),JSON.stringify({name:'tomatoclock',version:'0.2.0'}));fs.writeFileSync(path.join(appDir,'TomatoClock'),'running old');fs.writeFileSync(path.join(appDir,'my-note'),'keep');
 const {installUser}=require('../scripts/install-user.cjs');const result=installUser({sourceDir,prefix,updateSource:path.join(f.root,'feed')});
 assert.equal(fs.readFileSync(path.join(appDir,'TomatoClock'),'utf8'),'running old');assert.equal(fs.readFileSync(path.join(appDir,'my-note'),'utf8'),'keep');
 assert.equal(fs.readFileSync(path.join(appDir,'current/resources/app/desktop/main.cjs'),'utf8'),'new');
 assert.equal(fs.realpathSync(path.join(appDir,'.bootstrap/runtime')),fs.realpathSync(path.join(appDir,'current')));
 assert.ok(fs.readFileSync(result.desktopFile,'utf8').includes('current/resources/app/assets/tomatoclock.png'));
});
test('skip leaves program and records intact; missing, identical and older releases never prompt',async t=>{
 const f=installed(t),{checkLocalUpdate,publishRelease}=modules(),original=fs.readlinkSync(path.join(f.appDir,'current'));
 f.electron.dialog.showMessageBox=async()=>({response:1});assert.equal(await checkLocalUpdate(f),false);assert.equal(fs.readlinkSync(path.join(f.appDir,'current')),original);assert.equal(f.relaunches.length,0);
 f.electron.dialog.showMessageBox=async()=>{throw new Error('must not prompt');};
 publishRelease({sourceDir:f.make('older','0.1.0','older'),feedDir:f.feed});assert.equal(await checkLocalUpdate(f),false);
 publishRelease({sourceDir:path.dirname(path.dirname(f.appRoot)),feedDir:f.feed});assert.equal(await checkLocalUpdate(f),false);
 fs.renameSync(f.feed,f.feed+'-moved');assert.equal(await checkLocalUpdate(f),false);
 assert.equal(fs.readFileSync(path.join(f.dataDir,'learning.sqlite'),'utf8'),'user records');
});
test('one click stages verified new program, backs up records, retains old version and relaunches',async t=>{
 const f=installed(t),{checkLocalUpdate}=modules();const old=fs.realpathSync(path.join(f.appDir,'current'));
 assert.equal(await checkLocalUpdate(f),true);const next=fs.realpathSync(path.join(f.appDir,'current'));assert.notEqual(next,old);
 assert.equal(fs.readFileSync(path.join(next,'resources/app/desktop/main.cjs'),'utf8'),'new');assert.equal(fs.readFileSync(path.join(old,'resources/app/desktop/main.cjs'),'utf8'),'old');
 assert.equal(fs.readFileSync(path.join(f.dataDir,'learning.sqlite'),'utf8'),'user records');
 const backup=fs.readdirSync(path.join(f.dataDir,'backups'));assert.equal(backup.length,1);assert.equal(fs.readFileSync(path.join(f.dataDir,'backups',backup[0]),'utf8'),'user records');
 assert.equal(f.relaunches.length,1);assert.equal(f.relaunches[0].execPath,f.launcher);assert.equal(f.electron.exitCode,0);
 assert.deepEqual(f.dialogs[0].buttons,['立即更新','暂时跳过']);
});
test('damaged release or failed atomic switch keeps current version and database untouched',async t=>{
 const f=installed(t),{checkLocalUpdate}=modules(),old=fs.readlinkSync(path.join(f.appDir,'current'));
 fs.writeFileSync(path.join(f.release.packageDir,'resources/app/desktop/main.cjs'),'broken');assert.equal(await checkLocalUpdate(f),false);assert.equal(fs.readlinkSync(path.join(f.appDir,'current')),old);assert.equal(f.relaunches.length,0);
 const g=installed(t),original=fs.renameSync;fs.renameSync=(from,to)=>{if(to===path.join(g.appDir,'current'))throw new Error('simulated disk failure');return original(from,to);};
 try{assert.equal(await checkLocalUpdate(g),false);assert.equal(fs.readFileSync(path.join(g.appDir,'current/resources/app/desktop/main.cjs'),'utf8'),'old');assert.equal(g.relaunches.length,0);}finally{fs.renameSync=original;}
 assert.equal(fs.readFileSync(path.join(g.dataDir,'learning.sqlite'),'utf8'),'user records');
 assert.equal(await checkLocalUpdate(g),true,'a failed attempt can retry without overwriting its database backup');
});
test('unfinished SQLite journal or WAL defers update without creating a misleading raw backup',async t=>{
 for(const suffix of ['-journal','-wal']){
  const f=installed(t),{checkLocalUpdate}=modules();fs.writeFileSync(path.join(f.dataDir,'learning.sqlite')+suffix,'pending transaction');
  assert.equal(await checkLocalUpdate(f),false);assert.equal(f.relaunches.length,0);assert.equal(fs.existsSync(path.join(f.dataDir,'backups')),false);
  assert.equal(fs.readFileSync(path.join(f.appDir,'current/resources/app/desktop/main.cjs'),'utf8'),'old');
  assert.equal(fs.readFileSync(path.join(f.dataDir,'learning.sqlite'),'utf8'),'user records');
  assert.ok(f.dialogs.at(-1).detail.includes('事务'));
 }
});
test('stable launcher recovers when new entry crashes before update code can run',async t=>{
 const f=fixture(t),{publishRelease,checkLocalUpdate}=modules(),{installUser}=require('../scripts/install-user.cjs');
 const old=f.make('old','0.2.0','old'),next=f.make('new','0.3.0','new'),feed=path.join(f.root,'feed'),output=path.join(f.root,'launched');
 fs.writeFileSync(path.join(old,'TomatoClock'),`#!/bin/sh\nif [ "$ELECTRON_RUN_AS_NODE" = "1" ]; then exec '${process.execPath}' "$@"; fi\nprintf old > '${output}'\nexit 0\n`);
 fs.writeFileSync(path.join(next,'TomatoClock'),'#!/bin/sh\nexit 1\n');
 const result=installUser({sourceDir:old,prefix:path.join(f.root,'prefix'),updateSource:feed});publishRelease({sourceDir:next,feedDir:feed});
 const electron=fakeElectron();electron.dialog.showMessageBox=async()=>({response:0});electron.app.relaunch=()=>{};electron.app.exit=()=>{};
 const appRoot=path.join(fs.realpathSync(path.join(result.appDir,'current')),'resources/app'),dataDir=path.join(f.root,'data');fs.mkdirSync(dataDir);
 await checkLocalUpdate({electron,appRoot,dataDir});
 let stderr='';const exitCode=await new Promise((resolve,reject)=>{const child=spawn(result.launcher,[],{stdio:'pipe'});child.stderr.on('data',chunk=>{stderr+=chunk;});child.once('error',reject);child.once('exit',resolve);});
 assert.equal(exitCode,0,stderr);assert.equal(fs.readFileSync(output,'utf8'),'old');
 assert.equal(fs.readFileSync(path.join(result.appDir,'current/resources/app/desktop/main.cjs'),'utf8'),'old');
 assert.equal(fs.existsSync(path.join(result.appDir,'.pending-update.json')),false);
});
test('new program marks successful startup; repeated incomplete startup rolls back program only',async t=>{
 const f=installed(t),{checkLocalUpdate,markUpdateHealthy}=modules();await checkLocalUpdate(f);
 const nextRoot=path.join(fs.realpathSync(path.join(f.appDir,'current')),'resources/app');
 assert.equal(await checkLocalUpdate({...f,appRoot:nextRoot}),false);assert.equal(f.relaunches.length,1);
 markUpdateHealthy(nextRoot);assert.equal(fs.existsSync(path.join(f.appDir,'.pending-update.json')),false);
 const g=installed(t);await checkLocalUpdate(g);const newRoot=path.join(fs.realpathSync(path.join(g.appDir,'current')),'resources/app');
 await checkLocalUpdate({...g,appRoot:newRoot});assert.equal(await checkLocalUpdate({...g,appRoot:newRoot}),true);
 assert.equal(fs.readFileSync(path.join(g.appDir,'current/resources/app/desktop/main.cjs'),'utf8'),'old');assert.equal(fs.readFileSync(path.join(g.dataDir,'learning.sqlite'),'utf8'),'user records');
 assert.equal(await checkLocalUpdate(g),false);assert.equal(g.relaunches.length,2);
});
