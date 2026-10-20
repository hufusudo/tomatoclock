import {dayKey} from './format.js';
import {validateRecordRange} from './record-periods.js';
function unwrap(result){if(!result?.ok){const error=new Error(result?.error?.message??'操作失败。');error.code=result?.error?.code;throw error;}return result.value;}
export function createRuntime({desktopApi,storage,notifier,document=globalThis.document}){
 if(desktopApi){
  let visible=false,visibilityRevision=0,stopNative=null,status='granted';const listeners=new Set();
  const update=value=>{visible=Boolean(value);listeners.forEach(fn=>fn());};
  const subscribe=()=>{
   stopNative=desktopApi.onVisibilityChange(value=>{visibilityRevision++;update(value);});
   const initial=visibilityRevision;desktopApi.getVisibility().then(result=>{if(initial===visibilityRevision)update(unwrap(result));}).catch(()=>{});
  };
  subscribe();
  const records={isPersistent:true};for(const name of ['getSettings','saveSettings','saveCompletedPomodoro','getSummary','listDaily','getDailyRange','getFocusShortcuts','saveFocusShortcuts'])records[name]=async arg=>unwrap(await desktopApi[name](arg));
  return {records,isVisible:()=>visible,watchVisibility(callback){if(!stopNative)subscribe();listeners.add(callback);return ()=>{listeners.delete(callback);if(listeners.size===0){stopNative?.();stopNative=null;visible=false;}};},notifier:{permissionStatus:()=>status,requestPermission:async()=>status,async notify({phase,kind,durationMs,autoStarted}){try{const value=unwrap(await desktopApi.notifyPhase({phase,kind,durationMs,autoStarted}));if(!value.sent)status='unsupported';return value.sent;}catch{return false;}}},legacy:{preview:async()=>unwrap(await desktopApi.previewLegacyImport()),commit:async token=>unwrap(await desktopApi.commitLegacyImport(token))},onPrepareClose:callback=>desktopApi.onPrepareClose(callback)};
 }
 const seen=new Set();
 const validTotals=row=>({pomodoros:Math.max(0,row?.pomodoros??0),studySeconds:Math.max(0,row?.studySeconds??0)});
 const records={get isPersistent(){return storage.isPersistent;},async getSettings(){return storage.load().settings;},async saveSettings(settings){return storage.saveSettings(settings);},async saveCompletedPomodoro(row){if(seen.has(row.id))return;storage.recordPomodoro(row);seen.add(row.id);},async getSummary(day){const {days}=storage.load();const all=Object.values(days).reduce((sum,row)=>({pomodoros:sum.pomodoros+validTotals(row).pomodoros,studySeconds:sum.studySeconds+validTotals(row).studySeconds}),{pomodoros:0,studySeconds:0});return {day,today:validTotals(days[day]),all};},async listDaily({offset=0,limit=30}){const rows=Object.entries(storage.load().days).sort(([a],[b])=>b.localeCompare(a)).map(([day,row])=>({day,...validTotals(row)}));return {rows:rows.slice(offset,offset+limit),totalDays:rows.length};}};
 records.getFocusShortcuts=async()=>storage.getFocusShortcuts();records.saveFocusShortcuts=async raw=>storage.saveFocusShortcuts(raw);
 records.getDailyRange=async range=>{const {from,to}=validateRecordRange(range);return Object.entries(storage.load().days).filter(([day])=>day>=from&&day<=to).sort(([a],[b])=>a.localeCompare(b)).map(([day,row])=>({day,...validTotals(row)}));};
 return {records,notifier,isVisible:()=>document.visibilityState==='visible',watchVisibility(callback){document.addEventListener('visibilitychange',callback);return ()=>document.removeEventListener('visibilitychange',callback);},legacy:{exportJson:()=>JSON.stringify(storage.load(),null,2)}};
}
