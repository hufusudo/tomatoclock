function invalid(message) { const error = new Error(message); error.code = 'VALIDATION'; return error; }
function validateDay(day) {
 if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw invalid('日期格式不正确。');
 const date = new Date(`${day}T12:00:00Z`);
 if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day) throw invalid('日期不存在。');
 return day;
}
function safeCount(value) {
 if (!Number.isSafeInteger(value) || value < 0) throw invalid('记录必须是非负安全整数。');
 return value;
}
function normalizeDays(days) {
 if (!Array.isArray(days)) throw invalid('记录格式不正确。');
 const seen = new Set();
 return days.map(row => {
  if (!row || typeof row !== 'object') throw invalid('记录格式不正确。');
  const day = validateDay(row.day);
  if (seen.has(day)) throw invalid('文件中存在重复日期。');
  seen.add(day);
  return {day,pomodoros:safeCount(row.pomodoros),studySeconds:safeCount(row.studySeconds)};
 });
}
function parseLegacyImport(raw) {
 let parsed;
 try { parsed=JSON.parse(raw); } catch { throw invalid('学习记录 JSON 文件无法读取。'); }
 if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.days || typeof parsed.days !== 'object' || Array.isArray(parsed.days)) throw invalid('不是 TomatoClock 学习记录。');
 const days=normalizeDays(Object.entries(parsed.days).map(([day,value])=>({day,pomodoros:value?.pomodoros,studySeconds:value?.studySeconds})));
 const dates=days.map(row=>row.day).sort();
 const pomodoros=safeCount(days.reduce((n,row)=>n+row.pomodoros,0));
 const studySeconds=safeCount(days.reduce((n,row)=>n+row.studySeconds,0));
 return {days,summary:{from:dates[0]??null,to:dates.at(-1)??null,dayCount:days.length,pomodoros,studySeconds}};
}
module.exports={parseLegacyImport,normalizeDays,validateDay,safeCount,invalid};
