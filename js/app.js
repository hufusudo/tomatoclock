import {effectiveDurations,createTimer} from './timer.js';
import {createStorage} from './storage.js';import {createNotifier} from './notify.js';import {createCelebration} from './celebration.js';
import {createRuntime} from './runtime-adapters.js';import {createController} from './controller.js';import {formatClock,formatDuration} from './format.js';
import {createRecordsView} from './records-view.js';
const $=id=>document.getElementById(id);
const inputs=[$('work-input'),$('short-adj-input'),$('long-adj-input')];
const timer=createTimer({settings:{workMin:50,shortAdj:0,longAdj:0}});
const runtime=createRuntime(window.tomatoDesktop?{desktopApi:window.tomatoDesktop}:{storage:createStorage(),notifier:createNotifier(),document});
const celebration=createCelebration({isVisible:runtime.isVisible,watchVisibility:runtime.watchVisibility,getRemainingMs:()=>timer.remainingMs()});
let settingSignature='',deadlineTimer=null,settingsOperation=null;
const controller=createController({timer,records:runtime.records,notifier:runtime.notifier,celebration,onChange:render});
function fillSettings(settings){inputs.forEach((input,index)=>{input.value=String(settings[['workMin','shortAdj','longAdj'][index]]);});settingSignature=JSON.stringify(settings);}
function render(s){
 $('phase-label').textContent=s.state==='break'?(s.segment==='long-break'?'长休':'短休'):{ready:'准备开始',working:'专注中',paused:'已暂停'}[s.state];
 $('time').textContent=formatClock(s.remainingMs);
 const durations=effectiveDurations(s.settings);
 $('break-preview').textContent=`短休 ${formatDuration(durations.shortBreakMs)} · 长休 ${formatDuration(durations.longBreakMs)}`;
 const dots=Array.from($('round-dots').querySelectorAll('.dot'));dots.forEach((dot,index)=>dot.classList.toggle('is-done',index<s.completedInRound));
 $('round-dots').setAttribute('aria-label',`第 ${s.completedInRound}/4 轮`);
 $('start-btn').disabled=!s.canStart&&!(settingsOperation&&s.state==='ready'&&s.pendingCount===0&&s.summary!==null);
 $('start-btn').textContent=s.completedInRound>0||(s.summary?.today.pomodoros??0)>0?'开始下一个番茄':'开始番茄';
 $('pause-btn').disabled=!['working','paused'].includes(s.state);$('pause-btn').textContent=s.state==='paused'?'恢复':'暂停';
 const editable=s.state==='ready'&&!s.saving&&s.pendingCount===0&&s.summary!==null;inputs.forEach(input=>{input.disabled=!editable;});
 if(settingSignature!==JSON.stringify(s.settings))fillSettings(s.settings);
 $('today-count').textContent=String(s.summary?.today.pomodoros??0);$('today-time').textContent=formatDuration((s.summary?.today.studySeconds??0)*1000);
 if($('all-time'))$('all-time').textContent=formatDuration((s.summary?.all.studySeconds??0)*1000);
 document.querySelector('footer').setAttribute('aria-label','学习统计');
 const warning=$('storage-warning');warning.hidden=!s.error&&runtime.records.isPersistent;
 warning.textContent=s.error??'浏览器存储不可用，本次数据不会保存。';
 if($('retry-save-btn')){$('retry-save-btn').hidden=s.pendingCount===0;$('retry-save-btn').disabled=s.saving;}
 const status=runtime.notifier.permissionStatus?.()??'granted';$('notify-hint').hidden=!['denied','unsupported'].includes(status);
 if(window.tomatoDesktop)$('notify-hint').textContent='系统通知暂时不可用，请检查桌面通知设置。';
}
function scheduleDeadline(){
 if(deadlineTimer!==null)clearTimeout(deadlineTimer);deadlineTimer=null;
 if(['working','break'].includes(timer.state))deadlineTimer=setTimeout(()=>{deadlineTimer=null;tick();},Math.max(0,timer.remainingMs()));
}
function tick(){
 const before=`${timer.state}:${timer.segment}`;const operation=controller.tick();
 if(before!==`${timer.state}:${timer.segment}`)scheduleDeadline();
 operation.catch(error=>{ $('storage-warning').hidden=false;$('storage-warning').textContent=`计时处理失败：${error.message}`; });
}
$('start-btn').addEventListener('click',async()=>{
 try {Promise.resolve(runtime.notifier.requestPermission?.()).catch(()=>{});}catch{}
 const operation=settingsOperation;if(operation&&!(await operation))return;controller.start();scheduleDeadline();
});
$('pause-btn').addEventListener('click',()=>{if(timer.state==='paused')controller.resume();else controller.pause();scheduleDeadline();});
$('reset-btn').addEventListener('click',()=>{controller.reset();scheduleDeadline();});
for(const input of inputs)input.addEventListener('change',async()=>{
 const operation=controller.saveSettings({workMin:inputs[0].value,shortAdj:inputs[1].value,longAdj:inputs[2].value});settingsOperation=operation;render(controller.getSnapshot());
 await operation;if(settingsOperation===operation){settingsOperation=null;fillSettings(controller.getSnapshot().settings);render(controller.getSnapshot());}
});
$('retry-save-btn')?.addEventListener('click',()=>controller.retryPending());
let importToken=null;
const recordView=createRecordsView({root:$('records-view'),records:runtime.records,onBack(){recordView.hide();$('clock-view').hidden=false;$('records-toggle').hidden=false;},async onImport(){
 $('import-preview').hidden=true;importToken=null;const result=await runtime.legacy.preview();if(!result)return;
 importToken=result.token;const s=result.summary;
 $('import-summary').textContent=s.dayCount===0?'文件中没有学习记录。':`${s.from} 至 ${s.to}，${s.dayCount} 天、${s.pomodoros} 个番茄，共 ${formatDuration(s.studySeconds*1000)}。`;
 $('import-confirm').disabled=s.dayCount===0;$('import-preview').hidden=false;
},onExport(){
 const blob=new Blob([runtime.legacy.exportJson()],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='tomatoclock-records.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}});
$('records-toggle').addEventListener('click',()=>{$('clock-view').hidden=true;$('records-toggle').hidden=true;recordView.show();});
$('legacy-import-btn').hidden=!window.tomatoDesktop;$('legacy-export-btn').hidden=Boolean(window.tomatoDesktop);
$('import-cancel').addEventListener('click',()=>{importToken=null;$('import-preview').hidden=true;});
$('import-confirm').addEventListener('click',async()=>{
 if(!importToken||$('import-confirm').disabled)return;$('import-confirm').disabled=true;
 try {await runtime.legacy.commit(importToken);importToken=null;$('import-preview').hidden=true;await controller.retryPending();await recordView.refresh();}
 catch(error){$('records-status').textContent=error.message;}
 finally{$('import-confirm').disabled=false;}
});
runtime.onPrepareClose?.(()=>controller.prepareClose());
render(controller.getSnapshot());controller.init();
setInterval(tick,250);document.addEventListener('visibilitychange',tick);window.addEventListener('focus',tick);
