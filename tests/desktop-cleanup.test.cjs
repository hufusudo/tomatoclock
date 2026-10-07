const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {writeRelease,publishRelease,activateRelease,atomicJson}=require('../desktop/releases.cjs');
const {installUser}=require('../scripts/install-user.cjs');
const {fakeElectron}=require('./helpers/desktop.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-cleanup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 function source(n){const dir=path.join(root,`source-${n}`);fs.mkdirSync(path.join(dir,'resources/app/desktop'),{recursive:true});fs.writeFileSync(path.join(dir,'TomatoClock'),'#!/bin/sh\nexit 0\n',{mode:0o755});fs.writeFileSync(path.join(dir,'resources/app/desktop/main.cjs'),String(n));fs.writeFileSync(path.join(dir,'resources/app/package.json'),JSON.stringify({name:'tomatoclock',version:'0.3.1'}));return dir;}
 const installed=installUser({sourceDir:source(0),prefix:path.join(root,'prefix'),updateSource:path.join(root,'feed')});
 const releases=[path.basename(path.dirname(fs.realpathSync(path.join(installed.appDir,'current'))))];
 for(let n=1;n<=4;n++)releases.push(writeRelease({sourceDir:source(n),releasesDir:path.join(installed.appDir,'versions')}).id);
 activateRelease(installed.appDir,releases[4]);atomicJson(path.join(installed.appDir,'.previous-release.json'),{id:releases[3]});
 return {...installed,root,source,releases};
}
test('dry-run lists only obsolete managed releases; real cleanup keeps current, previous and pinned runtime',t=>{
 const f=fixture(t),{cleanupInstalled}=require('../desktop/cleanup.cjs');
 const note=path.join(f.appDir,'my-note.txt');fs.writeFileSync(note,'keep');
 const data=path.join(f.root,'prefix/share/tomatoclock');fs.mkdirSync(path.join(data,'backups'),{recursive:true});fs.writeFileSync(path.join(data,'learning.sqlite'),'records');fs.writeFileSync(path.join(data,'backups','old.sqlite'),'backup');
 const preview=cleanupInstalled(f.appDir,{dryRun:true});assert.equal(preview.planned.length,2);assert.equal(preview.removed.length,0);
 for(const id of f.releases)assert.ok(fs.existsSync(path.join(f.appDir,'versions',id)));
 const result=cleanupInstalled(f.appDir);assert.equal(result.removed.length,2);
 for(const n of [0,3,4])assert.ok(fs.existsSync(path.join(f.appDir,'versions',f.releases[n])));
 for(const n of [1,2])assert.equal(fs.existsSync(path.join(f.appDir,'versions',f.releases[n])),false);
 assert.equal(fs.readFileSync(note,'utf8'),'keep');assert.equal(fs.readFileSync(path.join(data,'learning.sqlite'),'utf8'),'records');assert.equal(fs.readFileSync(path.join(data,'backups','old.sqlite'),'utf8'),'backup');
});
test('unknown files, modified versions and symlinks are never swept away',t=>{
 const f=fixture(t),{cleanupInstalled}=require('../desktop/cleanup.cjs'),versions=path.join(f.appDir,'versions');
 fs.writeFileSync(path.join(versions,f.releases[1],'my-note'),'personal');fs.writeFileSync(path.join(versions,f.releases[2],'package/resources/app/desktop/main.cjs'),'modified');
 const external=path.join(f.root,'external');fs.mkdirSync(external);fs.writeFileSync(path.join(external,'keep'),'canary');fs.symlinkSync(external,path.join(versions,'a'.repeat(64)));
 cleanupInstalled(f.appDir);assert.ok(fs.existsSync(path.join(versions,f.releases[1],'my-note')));assert.ok(fs.existsSync(path.join(versions,f.releases[2])));assert.ok(fs.lstatSync(path.join(versions,'a'.repeat(64))).isSymbolicLink());assert.equal(fs.readFileSync(path.join(external,'keep'),'utf8'),'canary');
});
test('a personal empty directory inside an old package makes that version ineligible for cleanup',t=>{
 const f=fixture(t),{cleanupInstalled}=require('../desktop/cleanup.cjs');const note=path.join(f.appDir,'versions',f.releases[1],'package/personal-empty-folder');fs.mkdirSync(note);
 cleanupInstalled(f.appDir);assert.ok(fs.existsSync(note));
});
test('cleanup cannot delete a newly published package before its latest pointer is committed',t=>{
 const f=fixture(t),feed=path.join(f.root,'feed'),{cleanupFeed}=require('../desktop/cleanup.cjs');publishRelease({sourceDir:f.source(30),feedDir:feed});
 const original=fs.renameSync;let interleaved=false;
 fs.renameSync=(from,to)=>{if(to===path.join(feed,'latest.json')){interleaved=true;const result=cleanupFeed(feed);assert.equal(result.removed.length,0);}return original(from,to);};
 let release;try{release=publishRelease({sourceDir:f.source(31),feedDir:feed});}finally{fs.renameSync=original;}
 assert.ok(interleaved);assert.ok(fs.existsSync(release.releaseDir));assert.equal(require('../desktop/releases.cjs').readRelease(feed).id,release.id);
});
test('cleanup cannot delete staged update between program copy and pending state commit',async t=>{
 const f=fixture(t),feed=path.join(f.root,'feed'),{cleanupInstalled}=require('../desktop/cleanup.cjs'),{checkLocalUpdate}=require('../desktop/local-update.cjs');
 const release=publishRelease({sourceDir:f.source(40),feedDir:feed}),dataDir=path.join(f.root,'data');fs.mkdirSync(dataDir);const database=path.join(dataDir,'learning.sqlite');fs.writeFileSync(database,'records');
 const e=fakeElectron();e.dialog.showMessageBox=async()=>({response:0});e.app.relaunch=()=>{};e.app.exit=()=>{};
 const original=fs.copyFileSync;let interleaved=false;
 fs.copyFileSync=(from,to,flags)=>{if(from===database){interleaved=true;const result=cleanupInstalled(f.appDir);assert.equal(result.removed.length,0);}return original(from,to,flags);};
 try{assert.equal(await checkLocalUpdate({electron:e,appRoot:path.join(f.appDir,'current/resources/app'),dataDir}),true);}finally{fs.copyFileSync=original;}
 assert.ok(interleaved);assert.equal(fs.realpathSync(path.join(f.appDir,'current')),path.join(f.appDir,'versions',release.id,'package'));
});
test('an additional running installed executable is protected even after several manual installs',t=>{
 const f=fixture(t),{cleanupInstalled}=require('../desktop/cleanup.cjs'),originals={readdir:fs.readdirSync,stat:fs.statSync,readlink:fs.readlinkSync};
 fs.readdirSync=(dir,...args)=>dir==='/proc'?['9000000']:originals.readdir(dir,...args);
 fs.statSync=(dir,...args)=>dir==='/proc/9000000'?{uid:process.getuid()}:originals.stat(dir,...args);
 fs.readlinkSync=(dir,...args)=>dir==='/proc/9000000/exe'?path.join(f.appDir,'versions',f.releases[1],'package/TomatoClock'):originals.readlink(dir,...args);
 try{cleanupInstalled(f.appDir);assert.ok(fs.existsSync(path.join(f.appDir,'versions',f.releases[1])));assert.equal(fs.existsSync(path.join(f.appDir,'versions',f.releases[2])),false);}finally{fs.readdirSync=originals.readdir;fs.statSync=originals.stat;fs.readlinkSync=originals.readlink;}
});
test('maintenance lock rejects a live owner and safely recovers an abandoned marked owner',t=>{
 const f=fixture(t),{withMaintenanceLock}=require('../desktop/maintenance-lock.cjs');let called=false;
 withMaintenanceLock(f.root,()=>{assert.throws(()=>withMaintenanceLock(f.root,()=>{called=true;}),/维护|运行/);});assert.equal(called,false);
 const lock=path.join(f.root,'.tc-maintenance-lock');fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({name:'tomatoclock-maintenance',pid:2147483647,token:'abandoned'}));
 withMaintenanceLock(f.root,()=>{called=true;});assert.ok(called);assert.equal(fs.existsSync(lock),false);
});
test('unfinished update or invalid protected pointer prevents release cleanup',t=>{
 const f=fixture(t),{cleanupInstalled}=require('../desktop/cleanup.cjs');atomicJson(path.join(f.appDir,'.pending-update.json'),{previousId:f.releases[2],nextId:f.releases[4]});
 assert.equal(cleanupInstalled(f.appDir).removed.length,0);fs.unlinkSync(path.join(f.appDir,'.pending-update.json'));
 fs.unlinkSync(path.join(f.appDir,'.bootstrap/runtime'));fs.symlinkSync(f.root,path.join(f.appDir,'.bootstrap/runtime'));
 assert.throws(()=>cleanupInstalled(f.appDir));for(const id of f.releases)assert.ok(fs.existsSync(path.join(f.appDir,'versions',id)));
});
test('only abandoned marked staging directories are cleaned, active and unknown staging are kept',t=>{
 const f=fixture(t),{cleanupInstalled}=require('../desktop/cleanup.cjs'),versions=path.join(f.appDir,'versions');
 const names=['.staging-00000000-0000-4000-8000-000000000001','.staging-00000000-0000-4000-8000-000000000002','.staging-00000000-0000-4000-8000-000000000003'];
 for(const name of names)fs.mkdirSync(path.join(versions,name));
 atomicJson(path.join(versions,names[0],'.stage-owner.json'),{name:'tomatoclock-stage',format:1,pid:2147483647});
 atomicJson(path.join(versions,names[1],'.stage-owner.json'),{name:'tomatoclock-stage',format:1,pid:process.pid});
 cleanupInstalled(f.appDir);assert.equal(fs.existsSync(path.join(versions,names[0])),false);for(const name of names.slice(1))assert.ok(fs.existsSync(path.join(versions,name)));
});
test('successful publications retain latest two updates while protecting unknown feed contents',t=>{
 const f=fixture(t),feedDir=path.join(f.root,'feed');const first=publishRelease({sourceDir:f.source(10),feedDir});const second=publishRelease({sourceDir:f.source(11),feedDir});
 fs.writeFileSync(path.join(feedDir,'my-note'),'keep');const third=publishRelease({sourceDir:f.source(12),feedDir});
 assert.equal(fs.existsSync(first.releaseDir),false);assert.ok(fs.existsSync(second.releaseDir));assert.ok(fs.existsSync(third.releaseDir));assert.equal(fs.readFileSync(path.join(feedDir,'my-note'),'utf8'),'keep');
});
test('only successful new startup records rollback version and runs cleanup; failed attempts retain versions',t=>{
 const f=fixture(t),{markUpdateHealthy}=require('../desktop/local-update.cjs');fs.unlinkSync(path.join(f.appDir,'.previous-release.json'));
 const pending=path.join(f.appDir,'.pending-update.json');atomicJson(pending,{previousId:f.releases[3],nextId:f.releases[4],attempted:true});
 const wrong=path.join(f.appDir,'versions',f.releases[3],'package/resources/app');markUpdateHealthy(wrong);assert.ok(fs.existsSync(pending));
 for(const id of f.releases)assert.ok(fs.existsSync(path.join(f.appDir,'versions',id)));
 markUpdateHealthy(path.join(f.appDir,'current/resources/app'));assert.equal(fs.existsSync(pending),false);assert.equal(fs.readFileSync(path.join(f.appDir,'.previous-release.json'),'utf8').includes(f.releases[3]),true);
 assert.equal(fs.existsSync(path.join(f.appDir,'versions',f.releases[1])),false);assert.ok(fs.existsSync(path.join(f.appDir,'versions',f.releases[0])));
});
test('maintenance command previews by default and applies only when explicitly requested',t=>{
 const f=fixture(t),feed=path.join(f.root,'feed');publishRelease({sourceDir:f.source(20),feedDir:feed});
 const args=[path.resolve('scripts/cleanup.cjs'),'--app-dir',f.appDir,'--feed-dir',feed];
 let run=spawnSync(process.execPath,args,{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8'});assert.ifError(run.error);assert.equal(run.status,0,run.stderr);
 const preview=JSON.parse(run.stdout);assert.equal(preview.dryRun,true);assert.equal(preview.installed.planned.length,2);assert.equal(preview.installed.removed.length,0);assert.ok(fs.existsSync(path.join(f.appDir,'versions',f.releases[1])));
 run=spawnSync(process.execPath,[...args,'--apply'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8'});assert.ifError(run.error);assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).installed.removed.length,2);
});
