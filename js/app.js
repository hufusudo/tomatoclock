import {effectiveDurations,createTimer} from './timer.js';
import {createStorage} from './storage.js';import {createNotifier} from './notify.js';import {createCelebration} from './celebration.js';
import {createRuntime} from './runtime-adapters.js';import {createController} from './controller.js';import {formatClock,formatDuration} from './format.js';
import {createRecordsView} from './records-view.js';
const $=id=>document.getElementById(id);
const inputs=[$('work-input'),$('short-adj-input'),$('long-adj-input')];
const timer=createTimer({settings:{workMin:50,shortAdj:0,longAdj:0}});
const runtime=createRuntime(window.tomatoDesktop?{desktopApi:window.tomatoDesktop}:{storage:createStorage(),notifier:createNotifier(),document});
const celebration=createCelebration({isVisible:runtime.isVisible,watchVisibility:runtime.watchVisibility,getRemainingMs:()=>timer.remainingMs()});
let settingSignature='',deadlineTimer=null,settingsOperation=null,recordsSignature='';
const controller=createController({timer,records:runtime.records,notifier:runtime.notifier,celebration,onChange:render});
function fillSettings(settings){inputs.forEach((input,index)=>{input.value=String(settings[['workMin','shortAdj','longAdj'][index]]);});settingSignature=JSON.stringify(settings);}
function render(s){
 $('phase-label').textContent=s.state==='break'?(s.segment==='long-break'?'长休':'短休'):{ready:'准备开始',working:'专注中',paused:'已暂停'}[s.state];
 $('time').textContent=formatClock(s.remainingMs);
 const durations=effectiveDurations(s.settings);
 const preview=`短休 ${formatDuration(durations.shortBreakMs)} · 长休 ${formatDuration(durations.longBreakMs)}`;$('break-preview').textContent=preview;$('clock-preview').textContent=preview;
 const totalMs=s.segment==='short-break'?durations.shortBreakMs:s.segment==='long-break'?durations.longBreakMs:durations.workMs;
 const progress=s.state==='ready'?0:Math.max(0,Math.min(1,1-s.remainingMs/totalMs))*100;
 $('dial-progress').style.strokeDashoffset=(100-progress).toFixed(3);$('timer-dial').setAttribute('aria-valuenow',String(Math.round(progress)));$('timer-dial').setAttribute('aria-valuetext',`${$('phase-label').textContent}，剩余 ${formatClock(s.remainingMs)}`);$('timer-dial').dataset.phase=s.state;
 const dots=Array.from($('round-dots').querySelectorAll('.dot'));dots.forEach((dot,index)=>dot.classList.toggle('is-done',index<s.completedInRound));
 $('round-dots').setAttribute('aria-label',`第 ${s.completedInRound}/4 轮`);
 const active=s.state!=='ready';$('start-btn').disabled=!active&&!s.canStart&&!(settingsOperation&&s.pendingCount===0&&s.summary!==null);
 $('start-label').textContent=active?'结束':'开始';$('start-icon-path').setAttribute('d',active?'M6 6h12v12H6z':'m8 4 12 8-12 8z');
 $('pause-btn').disabled=!['working','paused'].includes(s.state);$('pause-label').textContent=s.state==='paused'?'恢复':'暂停';$('pause-icon-path').setAttribute('d',s.state==='paused'?'m8 4 12 8-12 8z':'M8 4v16M16 4v16');
 const editable=s.state==='ready'&&!s.saving&&s.pendingCount===0&&s.summary!==null;inputs.forEach(input=>{input.disabled=!editable;});
 $('settings-state').textContent=active?'结束当前计时后可调整时长。':s.saving?'正在保存…':s.pendingCount>0?'请先重试保存学习记录。':'修改后自动保存。';
 if(settingSignature!==JSON.stringify(s.settings))fillSettings(s.settings);
 $('today-count').textContent=String(s.summary?.today.pomodoros??0);$('today-time').textContent=formatDuration((s.summary?.today.studySeconds??0)*1000);
 if($('all-time'))$('all-time').textContent=formatDuration((s.summary?.all.studySeconds??0)*1000);
 document.querySelector('footer').setAttribute('aria-label','学习统计');
 if(s.summary){const signature=JSON.stringify(s.summary);if(signature!==recordsSignature){recordsSignature=signature;if(!$('records-view').hidden)recordView.refresh();}}
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
 if(timer.state!=='ready'){const ended=controller.end();scheduleDeadline();await ended;return;}
 try {Promise.resolve(runtime.notifier.requestPermission?.()).catch(()=>{});}catch{}
 const operation=settingsOperation;if(operation&&!(await operation))return;controller.start();scheduleDeadline();
});
$('pause-btn').addEventListener('click',()=>{const operation=timer.state==='paused'?controller.resume():controller.pause();scheduleDeadline();operation?.catch(error=>{$('storage-warning').hidden=false;$('storage-warning').textContent=`计时处理失败：${error.message}`;});});
$('reset-btn').addEventListener('click',()=>{controller.reset();scheduleDeadline();});
for(const input of inputs)input.addEventListener('change',async()=>{
 const operation=controller.saveSettings({workMin:inputs[0].value,shortAdj:inputs[1].value,longAdj:inputs[2].value});settingsOperation=operation;render(controller.getSnapshot());
 await operation;if(settingsOperation===operation){settingsOperation=null;fillSettings(controller.getSnapshot().settings);render(controller.getSnapshot());}
});
$('retry-save-btn')?.addEventListener('click',()=>controller.retryPending());
let importToken=null;
function showView(view){
 const targets={timer:'clock-view',records:'records-view',settings:'settings-view'};
 for(const [name,id] of Object.entries(targets)){$(id).hidden=name!==view;$(name==='records'?'records-toggle':`${name}-toggle`).setAttribute('aria-pressed',String(name===view));}
 if(view==='records')recordView.show();else recordView.hide();
}
const recordView=createRecordsView({root:$('records-view'),records:runtime.records,onBack(){showView('timer');},async onImport(){
 $('import-preview').hidden=true;importToken=null;const result=await runtime.legacy.preview();if(!result)return;
 importToken=result.token;const s=result.summary;
 $('import-summary').textContent=s.dayCount===0?'文件中没有学习记录。':`${s.from} 至 ${s.to}，${s.dayCount} 天、${s.pomodoros} 个番茄，共 ${formatDuration(s.studySeconds*1000)}。`;
 $('import-confirm').disabled=s.dayCount===0;$('import-preview').hidden=false;
},onExport(){
 const blob=new Blob([runtime.legacy.exportJson()],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='tomatoclock-records.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}});
$('records-toggle').addEventListener('click',()=>showView('records'));
$('timer-toggle').addEventListener('click',()=>showView('timer'));
$('settings-toggle').addEventListener('click',()=>showView('settings'));
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
