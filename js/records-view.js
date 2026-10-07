import {formatDuration} from './format.js';
export function createRecordsView({root,records,onBack,onImport,onExport}){
 const $=id=>root.querySelector(`#${id}`);let offset=0,total=0,revision=0,loading=false;
 const body=$('records-body'),previous=$('records-prev'),next=$('records-next'),status=$('records-status');
 function buttons(){previous.disabled=loading||offset===0;next.disabled=loading||offset+30>=total;}
 function message(text){body.replaceChildren();const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=3;cell.textContent=text;cell.className='records-message';row.appendChild(cell);body.appendChild(row);}
 async function refresh(){
  const request=++revision;loading=true;buttons();status.textContent='正在读取…';
  try {
   const page=await records.listDaily({offset,limit:30});if(request!==revision)return;
   total=page.totalDays;body.replaceChildren();
   if(page.rows.length===0)message('还没有完成的番茄');
   for(const item of page.rows){const row=document.createElement('tr');for(const value of [item.day,String(item.pomodoros),formatDuration(item.studySeconds*1000)]){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}body.appendChild(row);}
   status.textContent=total===0?'0 天记录':`第 ${Math.floor(offset/30)+1} / ${Math.ceil(total/30)} 页 · ${total} 天记录`;
  }catch(error){if(request===revision){message(`记录读取失败：${error.message}`);status.textContent='读取失败';}}
  finally{if(request===revision){loading=false;buttons();}}
 }
 previous.addEventListener('click',()=>{if(!loading&&offset>0){offset=Math.max(0,offset-30);refresh();}});
 next.addEventListener('click',()=>{if(!loading&&offset+30<total){offset+=30;refresh();}});
 $('records-back').addEventListener('click',onBack);
 for(const [id,action] of [['legacy-import-btn',onImport],['legacy-export-btn',onExport]])$(id).addEventListener('click',async()=>{const button=$(id);if(button.disabled)return;button.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
 return {async show(){root.hidden=false;offset=0;await refresh();},refresh,hide(){root.hidden=true;}};
}
