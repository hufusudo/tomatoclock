import {effectiveDurations,createTimer} from './timer.js';
import {createStorage} from './storage.js';import {createNotifier} from './notify.js';import {createCelebration} from './celebration.js';
import {createRuntime} from './runtime-adapters.js';import {createController} from './controller.js';import {formatClock,formatDuration} from './format.js';
import {createRecordsView} from './records-view.js';
import {createSettingsView} from './settings-view.js';
import {setupThemeControls} from './theme.js';
import {createRestView,setupRestImageControls} from './rest-view.js';
const $=id=>document.getElementById(id);
const shortcutInputs=[1,2,3].map(slot=>$(`focus-shortcut-input-${slot}`));
const shortcutButtons=[1,2,3].map(slot=>$(`focus-shortcut-${slot}`));
const timer=createTimer({settings:{workMin:50,shortAdj:0,longAdj:0}});
const runtime=createRuntime(window.tomatoDesktop?{desktopApi:window.tomatoDesktop}:{storage:createStorage(),notifier:createNotifier(),document});
const celebration=createCelebration();
const restView=createRestView({shell:$('application-shell'),stage:$('rest-stage'),canvas:$('accordion-transition'),isVisible:runtime.isVisible,watchVisibility:runtime.watchVisibility,onReturnToWork:()=>showView('timer')});
let deadlineTimer=null,settingsOperation=null,recordsSignature='',settingsView=null;
let editingWork=false;
let shortcutSignature='',shortcutMessage='填写 1–180 分钟，修改后自动保存；清空即可移除。',editingShortcuts=false;
const editHint='输入 1–180 分钟 · Enter 保存 · Esc 取消';
const controller=createController({timer,records:runtime.records,notifier:runtime.notifier,celebration,onChange:render});
function render(s){
 $('phase-label').textContent=s.state==='break'?(s.segment==='long-break'?'长休':'短休'):{ready:'准备开始',working:'专注中',paused:'已暂停'}[s.state];
 $('time').textContent=formatClock(s.remainingMs);
 if(editingWork&&!s.canStart)editingWork=false;
 $('time').disabled=!s.canStart;$('time').hidden=editingWork;$('time-editor').hidden=!editingWork;$('time-edit-hint').hidden=!editingWork;
 $('time').title=s.canStart?'点击修改工作时长':'当前状态不能修改工作时长';$('time').setAttribute('aria-label',s.canStart?`修改工作时长，当前${s.settings.workMin}分钟`:`剩余 ${formatClock(s.remainingMs)}`);
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
 settingsView?.sync(s);
 if(s.state!=='ready')editingShortcuts=false;
 $('focus-shortcut-editor').hidden=!editingShortcuts;
 $('edit-focus-shortcuts').disabled=!s.canStart&&!editingShortcuts;
 $('edit-focus-shortcuts').textContent=editingShortcuts?'收起编辑':'编辑快捷项';$('edit-focus-shortcuts').setAttribute('aria-expanded',String(editingShortcuts));
 const shortcutSignatureNow=JSON.stringify(s.focusShortcuts);
 if(shortcutSignature!==shortcutSignatureNow){shortcutInputs.forEach((input,slot)=>{input.value=s.focusShortcuts[slot]??'';input.setAttribute('aria-invalid','false');});shortcutSignature=shortcutSignatureNow;}
 shortcutInputs.forEach(input=>{input.disabled=!s.canStart;});
 shortcutButtons.forEach((button,slot)=>{const minutes=s.focusShortcuts[slot];button.hidden=minutes===null;button.disabled=!s.canStart;button.textContent=minutes===null?'':`${minutes} 分钟`;button.setAttribute('aria-label',minutes===null?'未配置快捷项':`开始 ${minutes} 分钟专注`);});
 $('focus-shortcuts').hidden=s.focusShortcuts.every(minutes=>minutes===null);
 $('focus-shortcut-status').textContent=s.state!=='ready'?'结束当前计时后可调整快捷项。':s.saving?'正在保存…':shortcutMessage;
 $('today-count').textContent=String(s.summary?.today.pomodoros??0);$('today-time').textContent=formatDuration((s.summary?.today.studySeconds??0)*1000);
 if($('all-time'))$('all-time').textContent=formatDuration((s.summary?.all.studySeconds??0)*1000);
 document.querySelector('footer').setAttribute('aria-label','学习统计');
 if(s.summary){const signature=JSON.stringify(s.summary);if(signature!==recordsSignature){recordsSignature=signature;if(!$('records-view').hidden)recordView.refresh();}}
 const warning=$('storage-warning');warning.hidden=!s.error&&runtime.records.isPersistent;
 warning.textContent=s.error??'浏览器存储不可用，本次数据不会保存。';
 if($('retry-save-btn')){$('retry-save-btn').hidden=s.pendingCount===0;$('retry-save-btn').disabled=s.saving;}
 const status=runtime.notifier.permissionStatus?.()??'granted';$('notify-hint').hidden=!['denied','unsupported'].includes(status);
 if(window.tomatoDesktop)$('notify-hint').textContent='系统通知暂时不可用，请检查桌面通知设置。';
 $('return-rest-image-btn').hidden=s.state!=='break';restView.sync(s.state==='break');
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
 const draft=editingWork?commitWorkEdit():null;if(editingWork)return;
 try {Promise.resolve(runtime.notifier.requestPermission?.()).catch(()=>{});}catch{}
 if(draft&&!(await draft))return;
 const operation=settingsOperation;if(operation&&!(await operation))return;controller.start();scheduleDeadline();
});
$('pause-btn').addEventListener('click',()=>{const operation=timer.state==='paused'?controller.resume():controller.pause();scheduleDeadline();operation?.catch(error=>{$('storage-warning').hidden=false;$('storage-warning').textContent=`计时处理失败：${error.message}`;});});
$('reset-btn').addEventListener('click',()=>{cancelWorkEdit();controller.reset();scheduleDeadline();});
async function persistSettings(raw){
 const operation=controller.saveSettings(raw);settingsOperation=operation;render(controller.getSnapshot());
 const saved=await operation;if(settingsOperation===operation){settingsOperation=null;render(controller.getSnapshot());}
 return saved;
}
shortcutInputs.forEach((input,slot)=>{
 input.addEventListener('input',()=>{input.setAttribute('aria-invalid','false');shortcutMessage='修改后自动保存，清空即可移除。';});
 input.addEventListener('change',async()=>{
  if($('focus-shortcut-editor').hidden)return;
  const raw=input.value.trim(),minutes=raw===''?null:Number(raw);
  if(input.validity.badInput||(minutes!==null&&(!Number.isInteger(minutes)||minutes<1||minutes>180))){input.setAttribute('aria-invalid','true');shortcutMessage='请输入 1–180 之间的整数分钟，或留空。';render(controller.getSnapshot());return;}
  const slots=controller.getSnapshot().focusShortcuts;slots[slot]=minutes;
  const saved=await controller.saveFocusShortcuts(slots);shortcutMessage=saved?'已保存，计时页点击即可开始。':'保存失败，请重新填写后重试。';
  if(!saved){shortcutSignature='';}render(controller.getSnapshot());
 });
});
function setShortcutEditing(open){
 if(open&&!controller.getSnapshot().canStart)return;
 editingShortcuts=open;shortcutSignature='';render(controller.getSnapshot());
 if(open){shortcutInputs[0].focus();shortcutInputs[0].select();}else if(!$('edit-focus-shortcuts').disabled)$('edit-focus-shortcuts').focus();
}
$('edit-focus-shortcuts').addEventListener('click',()=>setShortcutEditing(!editingShortcuts));
$('focus-shortcut-editor').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setShortcutEditing(false);}});
shortcutButtons.forEach((button,slot)=>{
 button.addEventListener('pointerdown',()=>{if(!button.disabled&&editingWork)cancelWorkEdit();});
 button.addEventListener('click',async()=>{cancelWorkEdit();await controller.startShortcut(slot);scheduleDeadline();});
});
function cancelWorkEdit(){editingWork=false;render(controller.getSnapshot());}
function sizeWorkInput(){ $('dial-work-input').style.setProperty('--minute-digits',Math.max(1,$('dial-work-input').value.length)); }
$('time').addEventListener('click',()=>{
 const s=controller.getSnapshot();if(!s.canStart)return;
 editingWork=true;$('dial-work-input').value=String(s.settings.workMin);$('dial-work-input').setAttribute('aria-invalid','false');$('time-edit-hint').textContent=editHint;sizeWorkInput();render(s);$('dial-work-input').focus();$('dial-work-input').select();
});
async function commitWorkEdit(){
 if(!editingWork)return true;
 const raw=$('dial-work-input').value.trim(),minutes=Number(raw);
 if(!/^\d{1,3}$/.test(raw)||minutes<1||minutes>180){$('dial-work-input').setAttribute('aria-invalid','true');$('time-edit-hint').textContent='请输入 1–180 之间的整数分钟';return false;}
 const s=controller.getSnapshot();cancelWorkEdit();if(minutes===s.settings.workMin)return true;
 return persistSettings({...s.settings,workMin:minutes});
}
$('dial-work-input').addEventListener('input',()=>{sizeWorkInput();$('dial-work-input').setAttribute('aria-invalid','false');$('time-edit-hint').textContent=editHint;});
$('dial-work-input').addEventListener('blur',()=>commitWorkEdit());
$('dial-work-input').addEventListener('keydown',async event=>{
 if(event.key==='Escape'){event.preventDefault();cancelWorkEdit();$('time').focus();}
 if(event.key==='Enter'){event.preventDefault();if(await commitWorkEdit())$('time').focus();}
});
$('retry-save-btn')?.addEventListener('click',()=>controller.retryPending());
let importToken=null;
function showView(view){
 if(view!=='timer'&&editingWork)cancelWorkEdit();
 if(view!=='settings')settingsView?.hide();
 const targets={timer:'clock-view',records:'records-view',settings:'settings-view'};
 document.querySelector('.nav-capsule').style.setProperty('--nav-index',Object.keys(targets).indexOf(view));
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
settingsView=createSettingsView({root:$('settings-view'),getSnapshot:controller.getSnapshot,persist:persistSettings});
render(controller.getSnapshot());controller.init();
setupThemeControls({desktopApi:window.tomatoDesktop});
setupRestImageControls({desktopApi:window.tomatoDesktop,view:restView});
window.addEventListener('beforeunload',()=>{settingsView.destroy();restView.destroy();celebration.dismiss();});
setInterval(tick,250);document.addEventListener('visibilitychange',tick);window.addEventListener('focus',tick);
