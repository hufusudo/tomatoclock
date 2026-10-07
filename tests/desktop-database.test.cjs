const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SQLite = require('better-sqlite3');
const { openDatabase } = require('../desktop/database.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const at = (day='2026-10-07',time='10:00:00') => Date.parse(`${day}T${time}`);
async function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-db-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const filePath=path.join(dir,'learning.sqlite');
 const db=await openDatabase({filePath});t.after(()=>db.close());
 return {db,filePath};
}
test('different completed durations persist, retry deduplicates, conflict leaves totals intact',async t=>{
 const {db,filePath}=await fixture(t);
 const first={id:id(1),completedAt:at(),workMs:1500000};
 db.saveCompletedPomodoro(first);
 db.saveCompletedPomodoro({id:id(2),completedAt:at('2026-10-07','11:00:00'),workMs:3000000});
 db.saveCompletedPomodoro(first);
 assert.deepEqual(db.getSummary('2026-10-07').today,{pomodoros:2,studySeconds:4500});
 assert.throws(()=>db.saveCompletedPomodoro({...first,workMs:60000}),/冲突|conflict/i);
 db.close();const reopened=await openDatabase({filePath});
 assert.deepEqual(reopened.getSummary('2026-10-07').all,{pomodoros:2,studySeconds:4500});reopened.close();
});
test('invalid completed values and dates never create rows',async t=>{
 const {db}=await fixture(t); const good={id:id(1),completedAt:at(),workMs:60000};
 for(const bad of [{id:'bad'},{completedAt:NaN},{completedAt:Number.MAX_SAFE_INTEGER+1},{workMs:-1},{workMs:61000},{workMs:10860000}]) assert.throws(()=>db.saveCompletedPomodoro({...good,...bad}));
 assert.throws(()=>db.getSummary('2026-02-30'));
 assert.deepEqual(db.getSummary('2026-10-07').all,{pomodoros:0,studySeconds:0});
});
test('local midnight buckets, empty days and 30+1 descending pagination',async t=>{
 const {db}=await fixture(t);
 db.saveCompletedPomodoro({id:id(1),completedAt:at('2026-10-06','23:59:00'),workMs:60000});
 db.saveCompletedPomodoro({id:id(2),completedAt:at('2026-10-07','00:01:00'),workMs:60000});
 assert.deepEqual(db.getSummary('2026-10-06').today,{pomodoros:1,studySeconds:60});
 assert.deepEqual(db.getSummary('2026-10-07').today,{pomodoros:1,studySeconds:60});
 assert.deepEqual(db.getSummary('2026-01-01').today,{pomodoros:0,studySeconds:0});
 for(let n=1;n<=29;n++) db.saveCompletedPomodoro({id:id(n+2),completedAt:at(`2026-08-${String(n).padStart(2,'0')}`),workMs:60000});
 const first=db.listDaily({offset:0,limit:30}),last=db.listDaily({offset:30,limit:30});
 assert.equal(first.totalDays,31);assert.equal(first.rows.length,30);assert.equal(first.rows[0].day,'2026-10-07');assert.equal(last.rows.length,1);
 assert.throws(()=>db.listDaily({offset:-1,limit:30}));
 assert.deepEqual(db.getSummary('2026-10-07').all,{pomodoros:31,studySeconds:1860});
});
test('settings survive reopening and invalid shapes are rejected',async t=>{
 const {db,filePath}=await fixture(t);
 assert.deepEqual(db.getSettings(),{workMin:50,shortAdj:0,longAdj:0});
 assert.deepEqual(db.saveSettings({workMin:999,shortAdj:-99,longAdj:2}),{workMin:180,shortAdj:-5,longAdj:2});
 assert.throws(()=>db.saveSettings({workMin:false}));
 db.close();const again=await openDatabase({filePath});assert.equal(again.getSettings().workMin,180);again.close();
});
test('corrupt, newer and malformed versioned database files remain untouched',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-invalid-db-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const kind of ['corrupt','newer','missing']) {
  const filePath=path.join(dir,kind+'.sqlite');
  if(kind==='corrupt') fs.writeFileSync(filePath,'not a SQLite database');
  else {const raw=new SQLite(filePath);raw.exec('CREATE TABLE unrelated (n INTEGER)');raw.pragma(`user_version = ${kind==='newer'?99:1}`);raw.close();}
  const before=fs.readFileSync(filePath);
  await assert.rejects(openDatabase({filePath}));assert.deepEqual(fs.readFileSync(filePath),before);
 }
});
