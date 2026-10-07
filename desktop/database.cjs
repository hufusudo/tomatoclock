const fs=require('node:fs');const path=require('node:path');const SQLite=require('better-sqlite3');
const {normalizeDays,validateDay,safeCount,invalid}=require('./legacy-import.cjs');
const VERSION=1;
const dailySql=`SELECT day, SUM(pomodoros) AS pomodoros, SUM(studySeconds) AS studySeconds FROM (
 SELECT local_day AS day, COUNT(*) AS pomodoros, SUM(work_seconds) AS studySeconds FROM completed_pomodoros GROUP BY local_day
 UNION ALL SELECT local_day AS day, pomodoros, work_seconds AS studySeconds FROM imported_daily_totals
) GROUP BY day`;
const totals=row=>({pomodoros:safeCount(row?.pomodoros??0),studySeconds:safeCount(row?.studySeconds??0)});
async function openDatabase({filePath}) {
 if(typeof filePath!=='string'||!path.isAbsolute(filePath)) throw invalid('数据库需要绝对路径。');
 const {sanitizeSettings}=await import('../js/timer.js');
 const {dayKey}=await import('../js/storage.js');
 const {validateRecordRange}=await import('../js/record-periods.js');
 fs.mkdirSync(path.dirname(filePath),{recursive:true});
 let db;
 try {
  db=new SQLite(filePath);
  const version=db.pragma('user_version',{simple:true});
  if(version>VERSION) throw new Error('数据库版本高于当前应用，请使用较新的应用。');
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
  if(version===0 && tables.length!==0) throw new Error('数据库结构无法识别，原文件已保留。');
  if(version===0) db.transaction(()=>{
   db.exec(`CREATE TABLE completed_pomodoros (
    id TEXT PRIMARY KEY, completed_at_ms INTEGER NOT NULL, local_day TEXT NOT NULL,
    work_seconds INTEGER NOT NULL CHECK(work_seconds BETWEEN 60 AND 10800));
    CREATE INDEX completed_by_day ON completed_pomodoros(local_day);
    CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), work_min INTEGER NOT NULL, short_adj INTEGER NOT NULL, long_adj INTEGER NOT NULL);
    INSERT INTO settings VALUES (1,50,0,0);
    CREATE TABLE imported_daily_totals (source TEXT NOT NULL,local_day TEXT NOT NULL,pomodoros INTEGER NOT NULL CHECK(pomodoros>=0),work_seconds INTEGER NOT NULL CHECK(work_seconds>=0),PRIMARY KEY(source,local_day));`);
   db.pragma('user_version = 1');
  })();
  else {
   const required={completed_pomodoros:['id','completed_at_ms','local_day','work_seconds'],settings:['id','work_min','short_adj','long_adj'],imported_daily_totals:['source','local_day','pomodoros','work_seconds']};
   for(const [name,columns] of Object.entries(required)) {
    const actual=db.pragma(`table_info(${name})`).map(row=>row.name);
    if(!columns.every(column=>actual.includes(column))) throw new Error('数据库结构不完整，原文件已保留。');
   }
   if(db.pragma('quick_check',{simple:true})!=='ok') throw new Error('数据库检查失败，原文件已保留。');
   if(!db.prepare('SELECT id FROM settings WHERE id=1').get()) throw new Error('数据库设置记录缺失，原文件已保留。');
  }
  db.pragma('journal_mode = DELETE');
  const insert=db.prepare('INSERT INTO completed_pomodoros VALUES (@id,@completedAt,@day,@seconds)');
  const existing=db.prepare('SELECT completed_at_ms,work_seconds FROM completed_pomodoros WHERE id=?');
  const allTotals=db.prepare(`SELECT COALESCE(SUM(pomodoros),0) AS pomodoros, COALESCE(SUM(studySeconds),0) AS studySeconds FROM (${dailySql})`);
  const oneDay=db.prepare(`SELECT pomodoros,studySeconds FROM (${dailySql}) WHERE day=?`);
  const page=db.prepare(`${dailySql} ORDER BY day DESC LIMIT ? OFFSET ?`);
  const countDays=db.prepare(`SELECT COUNT(*) AS count FROM (${dailySql})`);
  const dailyRange=db.prepare(`SELECT * FROM (${dailySql}) WHERE day BETWEEN ? AND ? ORDER BY day`);
  const getSettingsStmt=db.prepare('SELECT work_min AS workMin,short_adj AS shortAdj,long_adj AS longAdj FROM settings WHERE id=1');
  const setSettingsStmt=db.prepare('UPDATE settings SET work_min=@workMin,short_adj=@shortAdj,long_adj=@longAdj WHERE id=1');
  const importStmt=db.prepare(`INSERT INTO imported_daily_totals VALUES ('web-v1',@day,@pomodoros,@studySeconds)
    ON CONFLICT(source,local_day) DO UPDATE SET pomodoros=excluded.pomodoros,work_seconds=excluded.work_seconds`);
  const addCompleted=db.transaction(input=>{
   const old=existing.get(input.id);
   if(old) {if(old.completed_at_ms!==input.completedAt||old.work_seconds!==input.seconds) throw invalid('同一番茄记录内容冲突。'); return;}
   insert.run(input);totals(allTotals.get());
  });
  const importRows=db.transaction(rows=>{for(const row of rows) importStmt.run(row);totals(allTotals.get());});
  return {
   getSettings(){return sanitizeSettings(getSettingsStmt.get());},
   saveSettings(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw invalid('设置格式不正确。');
    for(const key of ['workMin','shortAdj','longAdj']) if(raw[key]!==undefined && !['number','string'].includes(typeof raw[key])) throw invalid('设置数值不正确。');
    const next=sanitizeSettings(raw);setSettingsStmt.run(next);return next;
   },
   saveCompletedPomodoro(input){
    if(!input||typeof input!=='object'||typeof input.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) throw invalid('番茄记录标识不正确。');
    if(!Number.isSafeInteger(input.completedAt)||!Number.isFinite(new Date(input.completedAt).getTime())) throw invalid('完成时间不正确。');
    if(!Number.isSafeInteger(input.workMs)||input.workMs<60000||input.workMs>10800000||input.workMs%60000!==0) throw invalid('工作时长不正确。');
    const day=validateDay(dayKey(input.completedAt));
    addCompleted({id:input.id.toLowerCase(),completedAt:input.completedAt,day,seconds:input.workMs/1000});
    return {id:input.id.toLowerCase(),day};
   },
   getSummary(day){validateDay(day);return {day,today:totals(oneDay.get(day)),all:totals(allTotals.get())};},
   listDaily({offset=0,limit=30}={}){
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>30) throw invalid('分页范围不正确。');
    return {rows:page.all(limit,offset).map(row=>({day:row.day,...totals(row)})),totalDays:countDays.get().count};
   },
   getDailyRange(range){const {from,to}=validateRecordRange(range);return dailyRange.all(from,to).map(row=>({day:row.day,...totals(row)}));},
   importLegacyDays(days){const rows=normalizeDays(days);importRows(rows);return {dayCount:rows.length};},
   close(){if(db.open) db.close();}
  };
 } catch(error) {if(db?.open) db.close();throw error;}
}
module.exports={openDatabase};
