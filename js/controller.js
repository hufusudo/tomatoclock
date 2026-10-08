import {sanitizeSettings} from './timer.js';
import {dayKey,notificationFor} from './format.js';
function newId(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,key=>{const n=Math.floor(Math.random()*16);return (key==='x'?n:(n&3)|8).toString(16);});}
export function createController({timer,records,notifier,celebration,now=Date.now,uuid=newId,onChange=()=>{}}){
 let settings=sanitizeSettings({}),summary=null,initialized=false,dataReady=false,error=null;
 let activeId=null,flushPromise=null,settingsPromise=null,settingsSaving=false,flushing=false,requestedDay=null,revision=0;
 const pending=[];
 function getSnapshot(){return {state:timer.state,segment:timer.segment,remainingMs:timer.remainingMs(),completedInRound:timer.completedInRound,settings:{...settings},summary,saving:flushing||settingsSaving,pendingCount:pending.length,error,canStart:initialized&&dataReady&&summary?.day===dayKey(now())&&timer.state==='ready'&&!flushing&&!settingsSaving&&pending.length===0};}
 const publish=()=>onChange(getSnapshot());
 async function refreshSummary(){
  const day=dayKey(now()),request=++revision;requestedDay=day;
  try {const value=await records.getSummary(day);if(request===revision&&day===dayKey(now())){summary=value;dataReady=true;if(pending.length===0)error=null;publish();}}
  catch(failure){if(request===revision){dataReady=false;error=`学习记录读取失败：${failure.message}`;publish();}}
 }
 function flush(){
  if(flushPromise)return flushPromise;
  if(pending.length===0)return refreshSummary();
  flushing=true;publish();
  flushPromise=(async()=>{
   try {while(pending.length){await records.saveCompletedPomodoro(pending[0]);pending.shift();}error=null;await refreshSummary();}
   catch{error='学习记录保存失败，请重试。';}
  })().finally(()=>{flushPromise=null;flushing=false;publish();});
  return flushPromise;
 }
 async function init(){
  try {settings=sanitizeSettings(await records.getSettings());timer.setSettings(settings);initialized=true;await refreshSummary();}
  catch(failure){error=`学习数据库无法读取：${failure.message}`;initialized=false;publish();}
  return getSnapshot();
 }
 function start(){
  if(!getSnapshot().canStart)return false;
  activeId=uuid();timer.start();publish();
  try {Promise.resolve(notifier.requestPermission?.()).then(publish).catch(()=>{});}catch{ /* 提醒权限不阻断计时 */ }
  return true;
 }
 function pause(){if(timer.state==='working'){timer.pause();if(timer.state==='working')return tick();publish();}}
 function resume(){if(timer.state==='paused'){timer.resume();publish();}}
 function reset(){timer.reset();activeId=null;celebration.dismiss();publish();}
 function end(){
  if(timer.state==='ready')return Promise.resolve(false);
  // Settle an elapsed deadline before cancelling, so a completed tomato is not discarded.
  const settled=tick();reset();return settled.then(()=>true);
 }
 async function tick(){
  const events=timer.tick();const breakEvent=events.find(event=>event.type==='break-started');
  let completed=false;
  for(const event of events){
   if(event.type==='work-done'){pending.push({id:activeId,completedAt:event.completedAt,workMs:event.workMs});activeId=null;completed=true;}
   if(event.type==='work-done'||event.type==='break-done'){
    try {Promise.resolve(notifier.notify(notificationFor(event.type,breakEvent))).then(publish).catch(()=>{});}catch{ /* 通知失败仍显示演出 */ }
    celebration.dismiss();celebration.play(event.type);
   }
  }
  publish();
  const operations=[];if(completed)operations.push(flush());
  if(summary?.day!==dayKey(now())&&requestedDay!==dayKey(now()))operations.push(refreshSummary());
  await Promise.all(operations);
 }
 function saveSettings(raw){
  if(!getSnapshot().canStart)return Promise.resolve(false);
  const next=sanitizeSettings(raw);settingsSaving=true;publish();
  settingsPromise=(async()=>{
   try {const saved=await records.saveSettings(next);settings=sanitizeSettings(saved);timer.setSettings(settings);error=null;return true;}
   catch{error='设置保存失败，已保留原设置。';return false;}
  })().finally(()=>{settingsPromise=null;settingsSaving=false;publish();});
  return settingsPromise;
 }
 async function retryPending(){requestedDay=null;await flush();}
 async function prepareClose(){if(settingsPromise)await settingsPromise;await flush();return {pendingCount:pending.length};}
 return {init,start,pause,resume,reset,end,tick,saveSettings,retryPending,prepareClose,getSnapshot};
}
