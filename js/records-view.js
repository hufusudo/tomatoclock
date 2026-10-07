import {formatDuration,dayKey} from './format.js';
import {weeksForMonth,summarizeWeek} from './record-periods.js';
export function createRecordsView({root,records,onBack,onImport,onExport}){
 const $=id=>root.querySelector(`#${id}`);let offset=0,total=0,revision=0,loading=false;
 const body=$('records-body'),previous=$('records-prev'),next=$('records-next'),status=$('records-status');
 const daily=$('records-day-view'),weekly=$('records-week-view'),month=$('records-month'),weekSelect=$('records-week');
 const summary=$('week-summary'),filter=$('records-week-filter'),note=$('records-week-note');let mode='day',weeks=[];
 month.value=dayKey(Date.now()).slice(0,7);
 function selectMonth(){
  weeks=weeksForMonth(month.value);weekSelect.replaceChildren();const today=dayKey(Date.now());
  for(const week of weeks){const option=document.createElement('option');option.value=week.from;option.textContent=`第${week.index}周（${week.from.slice(5).replace('-','/')}～${week.to.slice(5).replace('-','/')}）`;weekSelect.appendChild(option);}
  weekSelect.value=(weeks.find(week=>week.from<=today&&week.to>=today)??weeks[0]).from;
 }
 selectMonth();
 function buttons(){previous.disabled=loading||offset===0;next.disabled=loading||offset+30>=total;}
 function message(text){body.replaceChildren();const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=3;cell.textContent=text;cell.className='records-message';row.appendChild(cell);body.appendChild(row);}
 function appendRows(rows,week=false){
  body.replaceChildren();if(!rows.length)message('还没有完成的番茄');
  rows.forEach((item,index)=>{const row=document.createElement('tr');if(week&&item.day.slice(0,7)!==month.value)row.className='records-outside-month';
   const label=week?`${item.day} ${['周一','周二','周三','周四','周五','周六','周日'][index]}`:item.day;
   for(const value of [label,String(item.pomodoros),formatDuration(item.studySeconds*1000)]){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}body.appendChild(row);
  });
 }
 async function refresh(){
  const request=++revision;loading=true;summary.hidden=true;buttons();status.textContent='正在读取…';message('正在读取…');
  try {
   if(mode==='week'){
    const week=weeks.find(item=>item.from===weekSelect.value);if(!week)throw new Error('请选择有效的月份和周次。');
    const rows=await records.getDailyRange({from:week.from,to:week.to});if(request!==revision)return;
    const result=summarizeWeek(week,rows);appendRows(result.days,true);
    $('week-title').textContent=week.label;$('week-range').textContent=`${week.from} 至 ${week.to}`;
    $('week-total').textContent=formatDuration(result.total.studySeconds*1000);$('week-count').textContent=`共 ${result.total.pomodoros} 个番茄`;
    summary.hidden=false;status.textContent='七天学习明细';return;
   }
   const page=await records.listDaily({offset,limit:30});if(request!==revision)return;
   total=page.totalDays;appendRows(page.rows);
   status.textContent=total===0?'0 天记录':`第 ${Math.floor(offset/30)+1} / ${Math.ceil(total/30)} 页 · ${total} 天记录`;
  }catch(error){if(request===revision){message(`记录读取失败：${error.message}`);status.textContent='读取失败';}}
  finally{if(request===revision){loading=false;buttons();}}
 }
 function setMode(value){mode=value;offset=0;root.classList.toggle('is-week-view',mode==='week');daily.setAttribute('aria-pressed',String(mode==='day'));weekly.setAttribute('aria-pressed',String(mode==='week'));filter.hidden=note.hidden=mode!=='week';previous.hidden=next.hidden=mode==='week';refresh();}
 daily.addEventListener('click',()=>setMode('day'));weekly.addEventListener('click',()=>setMode('week'));
 month.addEventListener('change',()=>{
  try{selectMonth();refresh();}catch(error){revision++;loading=false;summary.hidden=true;weekSelect.replaceChildren();message(error.message);status.textContent=error.message;buttons();}
 });
 weekSelect.addEventListener('change',refresh);
 previous.addEventListener('click',()=>{if(!loading&&offset>0){offset=Math.max(0,offset-30);refresh();}});
 next.addEventListener('click',()=>{if(!loading&&offset+30<total){offset+=30;refresh();}});
 $('records-back').addEventListener('click',onBack);
 for(const [id,action] of [['legacy-import-btn',onImport],['legacy-export-btn',onExport]])$(id).addEventListener('click',async()=>{const button=$(id);if(button.disabled)return;button.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
 return {async show(){root.hidden=false;offset=0;await refresh();},refresh,hide(){revision++;loading=false;root.hidden=true;}};
}
