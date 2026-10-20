const DAY=86400000;
function invalid(message){const error=new Error(message);error.code='VALIDATION';return error;}
function date(day){
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw invalid('日期格式不正确。');
 const value=new Date(`${day}T12:00:00Z`);if(!Number.isFinite(value.getTime())||value.toISOString().slice(0,10)!==day)throw invalid('日期不存在。');return value;
}
export function validateRecordRange(range){
 if(!range||typeof range!=='object')throw invalid('请选择日期范围。');
 const {from,to}=range,span=(date(to)-date(from))/DAY+1;
 if(span<1||span>62)throw invalid('日期范围需要按先后顺序，且不超过62天。');return {from,to};
}
export function weeksForMonth(month){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1||Number(month.slice(0,4))>9998)throw invalid('请选择有效月份。');
 const first=date(`${month}-01`),last=new Date(first);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
 const monday=first.getTime()-((first.getUTCDay()+6)%7)*DAY,weeks=[];
 for(let start=monday;start<=last.getTime();start+=7*DAY){
  const days=Array.from({length:7},(_,n)=>new Date(start+n*DAY).toISOString().slice(0,10)),index=weeks.length+1;
  weeks.push({index,label:`${Number(month.slice(0,4))}年${Number(month.slice(5))}月第${index}周`,from:days[0],to:days[6],days});
 }
 return weeks;
}
// Daily pages follow the first recorded date, not calendar weeks or sparse record counts.
export function dailyRecordPage({firstDay,today,offset=0}){
 const first=date(firstDay),last=date(today);
 if(last<first)throw invalid('最早记录日期不能晚于今天。');
 if(!Number.isSafeInteger(offset)||offset<0||offset%7!==0)throw invalid('分页范围不正确。');
 const totalDays=(last-first)/DAY+1,totalPages=Math.ceil(totalDays/7),startOffset=Math.min(offset,(totalPages-1)*7);
 const days=Array.from({length:7},(_,index)=>new Date(first.getTime()+(startOffset+index)*DAY).toISOString().slice(0,10));
 date(days[6]);
 return {from:days[0],to:days[6],readTo:days[6]>today?today:days[6],days,today,offset:startOffset,totalDays,totalPages};
}
export function fillDailyPage(page,rows){
 return summarizeWeek(page,rows).days.map(row=>row.day>page.today?{day:row.day,pomodoros:null,studySeconds:null,future:true}:row);
}
export function summarizeWeek(week,rows){
 if(!Array.isArray(rows))throw invalid('学习记录格式不正确。');const byDay=new Map();
 for(const row of rows){
  date(row.day);if(byDay.has(row.day)||![row.pomodoros,row.studySeconds].every(n=>Number.isSafeInteger(n)&&n>=0))throw invalid('学习记录数值不正确。');byDay.set(row.day,row);
 }
 const days=week.days.map(day=>({day,pomodoros:byDay.get(day)?.pomodoros??0,studySeconds:byDay.get(day)?.studySeconds??0}));
 const total=days.reduce((sum,row)=>({pomodoros:sum.pomodoros+row.pomodoros,studySeconds:sum.studySeconds+row.studySeconds}),{pomodoros:0,studySeconds:0});
 if(!Number.isSafeInteger(total.pomodoros)||!Number.isSafeInteger(total.studySeconds))throw invalid('学习记录累计超过数值上限。');return {days,total};
}
