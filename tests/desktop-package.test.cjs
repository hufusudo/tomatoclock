const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');const {createHash}=require('node:crypto');
const dir=path.resolve('dist/TomatoClock-linux-x64'),appRoot=path.join(dir,'resources/app');
test('self-contained Linux package retains native SQLite and excludes development/user data',()=>{
 assert.ok(fs.existsSync(path.join(dir,'TomatoClock')),'package executable is missing');
 for(const file of ['index.html','desktop/main.cjs','desktop/preload.cjs','js/timer.js','js/controller.js','assets/tomatoclock.png','node_modules/better-sqlite3/prebuilds/linux-x64.node'])assert.ok(fs.existsSync(path.join(appRoot,file)),file);
 for(const name of ['electron','playwright-core','@electron/rebuild'])assert.equal(fs.existsSync(path.join(appRoot,'node_modules',name)),false);
 for(const name of ['.git','tests','learning.sqlite'])assert.equal(fs.existsSync(path.join(appRoot,name)),false);
 const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 assert.equal(hash(path.join(appRoot,'node_modules/better-sqlite3/prebuilds/linux-x64.node')),hash(path.resolve('node_modules/better-sqlite3/prebuilds/linux-x64.node')));
 const probe=`const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {openDatabase}=require('./desktop/database.cjs');(async()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-package-probe-'));try{const filePath=path.join(d,'learning.sqlite');let db=await openDatabase({filePath});for(const [n,workMs] of [[1,1500000],[2,3000000]])db.saveCompletedPomodoro({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),completedAt:Date.parse('2026-10-07T10:00:00'),workMs});db.saveSettings({workMin:25,shortAdj:1,longAdj:0});db.close();db=await openDatabase({filePath});console.log(JSON.stringify({totals:db.getSummary('2026-10-07').all,settings:db.getSettings()}));db.close();}finally{fs.rmSync(d,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});`;
 const run=spawnSync(path.join(dir,'TomatoClock'),['-e',probe],{cwd:appRoot,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8'});
 assert.ifError(run.error);assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout.trim()),{totals:{pomodoros:2,studySeconds:4500},settings:{workMin:25,shortAdj:1,longAdj:0}});
});
test('temporary user install handles Chinese/spaces, preserves extras, refuses unmanaged collisions',t=>{
 const {installUser}=require('../scripts/install-user.cjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-install-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const prefix=path.join(root,'测试 安装');const dry=installUser({sourceDir:dir,prefix,dryRun:true});assert.equal(fs.existsSync(dry.appDir),false);
 const result=installUser({sourceDir:dir,prefix});assert.ok(fs.existsSync(result.launcher));assert.ok(fs.readFileSync(result.desktopFile,'utf8').includes('X-TomatoClock-Managed=true'));
 const note=path.join(result.appDir,'my-note.txt');fs.writeFileSync(note,'keep');installUser({sourceDir:dir,prefix});assert.equal(fs.readFileSync(note,'utf8'),'keep');
 const conflictPrefix=path.join(root,'conflict');const appDir=path.join(conflictPrefix,'opt/tomatoclock');fs.mkdirSync(appDir,{recursive:true});fs.writeFileSync(path.join(appDir,'other.txt'),'untouched');assert.throws(()=>installUser({sourceDir:dir,prefix:conflictPrefix}));assert.equal(fs.readFileSync(path.join(appDir,'other.txt'),'utf8'),'untouched');
 assert.throws(()=>installUser({sourceDir:dir,prefix:'/etc',dryRun:true}));
});
