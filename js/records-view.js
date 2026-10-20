import {formatDuration,dayKey} from './format.js';
import {weeksForMonth,summarizeWeek,dailyRecordPage,fillDailyPage} from './record-periods.js';
import {createRecordsChart} from './records-chart.js';
export function createRecordsView({root,records,onBack,onImport,onExport}){
 const $=id=>root.querySelector(`#${id}`);let offset=0,total=0,revision=0,loading=false;
 const chart=createRecordsChart({root});
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
 function buttons(){previous.disabled=loading||offset===0;next.disabled=loading||offset+7>=total;}
 function message(text,pending=false){$('records-summary').hidden=true;chart.message(text,{loading:pending});body.replaceChildren();const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=3;cell.textContent=text;cell.className='records-message';row.appendChild(cell);body.appendChild(row);}
 function appendRows(rows,week=false){
  body.replaceChildren();if(!rows.length){message('还没有完成的番茄');return;}chart.render(rows,{week});
  rows.forEach((item,index)=>{const row=document.createElement('tr');if(week&&item.day.slice(0,7)!==month.value)row.className='records-outside-month';if(item.future)row.classList.add('records-future');
   const label=week?`${item.day} ${['周一','周二','周三','周四','周五','周六','周日'][index]}`:item.day;
   for(const value of [label,item.future?'—':String(item.pomodoros),item.future?'尚未到来':formatDuration(item.studySeconds*1000)]){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}body.appendChild(row);
  });
 }
 function showSummary(title,from,to,total){
  $('records-summary-title').textContent=title;$('records-summary-range').textContent=`${from} — ${to}`;
  $('records-summary-total').textContent=formatDuration(total.studySeconds*1000);$('records-summary-count').textContent=String(total.pomodoros);$('records-summary').hidden=false;
 }
 async function refresh(){
  const request=++revision;loading=true;summary.hidden=true;buttons();status.textContent='正在读取…';message('正在读取…',true);
  try {
   if(mode==='week'){
    const week=weeks.find(item=>item.from===weekSelect.value);if(!week)throw new Error('请选择有效的月份和周次。');
    const rows=await records.getDailyRange({from:week.from,to:week.to});if(request!==revision)return;
    const result=summarizeWeek(week,rows);appendRows(result.days,true);
    $('week-title').textContent=week.label;$('week-range').textContent=`${week.from} 至 ${week.to}`;
    $('week-total').textContent=formatDuration(result.total.studySeconds*1000);$('week-count').textContent=`共 ${result.total.pomodoros} 个番茄`;
    showSummary(week.label,week.from,week.to,result.total);summary.hidden=false;status.textContent='七天学习明细';return;
   }
   // Find the calendar anchor through the unchanged sparse-record interface.
   const latest=await records.listDaily({offset:0,limit:1});if(request!==revision)return;
   if(!latest.totalDays){total=offset=0;appendRows([]);status.textContent='0 天记录';return;}
   const earliest=latest.totalDays===1?latest:await records.listDaily({offset:latest.totalDays-1,limit:1});if(request!==revision)return;
   const firstDay=earliest.rows[0]?.day,today=dayKey(Date.now());
   if(!firstDay)throw new Error('最早记录读取失败，请重试。');
   if(firstDay>today){total=offset=0;appendRows([]);status.textContent='尚无已到日期的记录';return;}
   const page=dailyRecordPage({firstDay,today,offset});
   const rows=await records.getDailyRange({from:page.from,to:page.readTo});if(request!==revision)return;
   offset=page.offset;total=page.totalDays;const days=fillDailyPage(page,rows);appendRows(days);
   const sum=days.reduce((value,row)=>({studySeconds:value.studySeconds+(row.studySeconds??0),pomodoros:value.pomodoros+(row.pomodoros??0)}),{studySeconds:0,pomodoros:0});
   showSummary('这七天的专注',page.from,page.to,sum);
   status.textContent=`第 ${Math.floor(offset/7)+1} / ${page.totalPages} 页 · ${page.from} 至 ${page.to}`;
  }catch(error){if(request===revision){loading=false;message(`记录读取失败：${error.message}`);status.textContent='读取失败';}}
  finally{if(request===revision){loading=false;buttons();}}
 }
 function setMode(value){mode=value;offset=0;root.classList.toggle('is-week-view',mode==='week');daily.setAttribute('aria-pressed',String(mode==='day'));weekly.setAttribute('aria-pressed',String(mode==='week'));filter.hidden=note.hidden=mode!=='week';previous.hidden=next.hidden=mode==='week';refresh();}
 daily.addEventListener('click',()=>setMode('day'));weekly.addEventListener('click',()=>setMode('week'));
 month.addEventListener('change',()=>{
  try{selectMonth();refresh();}catch(error){revision++;loading=false;summary.hidden=true;weekSelect.replaceChildren();message(error.message);status.textContent=error.message;buttons();}
 });
 weekSelect.addEventListener('change',refresh);
 previous.addEventListener('click',()=>{if(!loading&&offset>0){offset=Math.max(0,offset-7);refresh();}});
 next.addEventListener('click',()=>{if(!loading&&offset+7<total){offset+=7;refresh();}});
 $('records-back').addEventListener('click',onBack);
 for(const [id,action] of [['legacy-import-btn',onImport],['legacy-export-btn',onExport]])$(id).addEventListener('click',async()=>{const button=$(id);if(button.disabled)return;button.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
 return {async show(){root.hidden=false;offset=0;await refresh();},refresh,hide(){revision++;loading=false;chart.hide();root.hidden=true;}};
}
