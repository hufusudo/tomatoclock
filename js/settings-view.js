import {effectiveDurations} from './timer.js';
import {formatDuration} from './format.js';

const fields={workMin:{name:'工作时长',min:1,max:180,input:'work-input',sector:'settings-work-sector',x:180,y:90},shortAdj:{name:'短休微调',min:-5,max:5,input:'short-adj-input',sector:'settings-short-sector',x:258,y:225},longAdj:{name:'长休微调',min:-5,max:5,input:'long-adj-input',sector:'settings-long-sector',x:102,y:225}};
// A draft is independent of the timer's committed settings and never saves on blur.
export function createSettingsDraft({getSnapshot,persist,onChange=()=>{}}){
 let state={key:null,value:'',saving:false,error:''},revision=0;
 const publish=()=>onChange({...state});
 function cancel(){revision++;state={key:null,value:'',saving:false,error:''};publish();}
 return {
  getState:()=>({...state}),
  open(key){if(!fields[key]||!getSnapshot().canStart||state.saving||state.key)return false;revision++;state={key,value:String(getSnapshot().settings[key]),saving:false,error:''};publish();return true;},
  setValue(value){if(!state.key||state.saving)return;state.value=String(value);state.error='';publish();},
  cancel,
  sync(snapshot){if(state.key&&!state.saving&&!snapshot.canStart)cancel();},
  async save(){
   if(!state.key||state.saving||!getSnapshot().canStart)return false;
   const {min,max}=fields[state.key],value=Number(state.value);
   if(!/^-?\d+$/.test(state.value)||!Number.isSafeInteger(value)||value<min||value>max){state.error=`请输入 ${min} 至 ${max} 之间的整数分钟。`;publish();return false;}
   const request=revision,raw={...getSnapshot().settings,[state.key]:value};state.saving=true;state.error='';publish();
   let saved=false;try{saved=Boolean(await persist(raw));}catch{saved=false;}
   if(request!==revision)return saved;
   if(saved)state={key:null,value:'',saving:false,error:''};else{state.saving=false;state.error='保存失败，草稿已保留，请重试。';}
   publish();return saved;
  }
 };
}

export function createSettingsView({root,getSnapshot,persist}){
 const $=id=>root.querySelector(`#${id}`),orbit=$('settings-orbit'),disc=$('settings-disc'),form=$('disc-editor'),bloom=root.querySelector('.paint-bloom'),slider=$('disc-slider');
 const motion=matchMedia('(prefers-reduced-motion: reduce)');let phase='overview',lastKey=null,transition=null,opener=null,immediate=false;
 const editor=createSettingsDraft({getSnapshot,persist,onChange:update});
 function setPhase(value){phase=value;disc.dataset.state=orbit.dataset.state=value;}
 function stopTransition(){if(transition!==null)clearTimeout(transition);transition=null;}
 function finishOpen(){transition=null;if(!editor.getState().key)return;setPhase('editing');form.hidden=false;const active=document.activeElement;if(active===opener||active===document.body){const input=$(fields[lastKey].input);input.focus({preventScroll:true});input.select();}}
 function finishClose(restore){transition=null;setPhase('overview');lastKey=null;render(getSnapshot());const active=document.activeElement;if(restore&&!root.hidden&&(active===document.body||form.contains(active))&&opener?.getAttribute('aria-disabled')==='false')opener.focus({preventScroll:true});}
 function update(state){
  const failedSave=phase==='saving'&&state.key&&!state.saving&&!!state.error;
  stopTransition();
  if(state.key&&lastKey!==state.key){
   lastKey=state.key;disc.dataset.setting=state.key;opener=$(fields[state.key].sector);if(document.activeElement===opener)opener.blur();bloom.setAttribute('cx',fields[state.key].x);bloom.setAttribute('cy',fields[state.key].y);form.hidden=true;setPhase('opening');
   if(motion.matches)finishOpen();else transition=setTimeout(finishOpen,680);
  }else if(state.key){
   // Input changes must not restart the unfolding animation.
   if(phase==='opening'){if(motion.matches)finishOpen();else transition=setTimeout(finishOpen,680);}
   else setPhase(state.saving?'saving':'editing');
  }else if(lastKey){
   const restore=form.contains(document.activeElement)||document.activeElement===document.body;
   disc.style.setProperty('--paint-from',getComputedStyle(bloom).r||'380px');form.hidden=true;
   if(immediate||motion.matches)finishClose(!immediate&&restore);else{setPhase('closing');transition=setTimeout(()=>finishClose(restore),520);}
  }else setPhase('overview');
  render(getSnapshot());
  if(failedSave&&!root.hidden&&document.activeElement===document.body)$(fields[state.key].input).focus({preventScroll:true});
 }
 function render(snapshot){
  const state=editor.getState();root.querySelector('.disc-sectors').setAttribute('aria-hidden',String(phase!=='overview'));
  for(const [key,field] of Object.entries(fields)){
   const input=$(field.input),value=state.key===key?state.value:String(snapshot.settings[key]);if(input.value!==value)input.value=value;
   input.disabled=!snapshot.canStart||state.saving||state.key!==key;input.setAttribute('aria-invalid',String(state.key===key&&!!state.error));
   input.closest('.disc-field').hidden=key!==lastKey;
   const sector=$(field.sector);sector.setAttribute('aria-disabled',String(!snapshot.canStart||!!state.key||phase==='closing'));sector.setAttribute('tabindex',snapshot.canStart&&!state.key&&phase!=='closing'?'0':'-1');sector.setAttribute('aria-expanded',String(state.key===key));sector.setAttribute('aria-label',`${field.name}，当前${snapshot.settings[key]}分钟`);
   $(`disc-value-${key}`).textContent=key==='workMin'?snapshot.settings[key]:`${snapshot.settings[key]>=0?'+':''}${snapshot.settings[key]}`;
  }
  if(lastKey){
   const field=fields[lastKey];$('disc-editor-title').textContent=field.name;slider.min=field.min;slider.max=field.max;slider.value=state.value;slider.disabled=state.saving||!snapshot.canStart;slider.setAttribute('aria-label',`调整${field.name}`);
   $('disc-decrease').disabled=$('disc-increase').disabled=state.saving||!snapshot.canStart;
   const numeric=Number(state.value),draft=/^-?\d+$/.test(state.value)&&numeric>=field.min&&numeric<=field.max?{...snapshot.settings,[lastKey]:numeric}:snapshot.settings,durations=effectiveDurations(draft);
   $('disc-effect').textContent=lastKey==='workMin'?`短休 ${formatDuration(durations.shortBreakMs)} · 长休 ${formatDuration(durations.longBreakMs)}`:`最终${lastKey==='shortAdj'?'短休':'长休'} ${formatDuration(lastKey==='shortAdj'?durations.shortBreakMs:durations.longBreakMs)}`;
  }
  $('disc-save').disabled=state.saving||!snapshot.canStart;$('disc-save').textContent=state.saving?'保存中…':'保存';$('disc-cancel').disabled=state.saving;
  $('disc-error').textContent=state.error;$('disc-error').hidden=!state.error;
  $('settings-state').textContent=snapshot.state!=='ready'?'结束当前计时后可调整时长。':snapshot.saving?'正在保存…':!snapshot.canStart?'请先完成记录保存。':state.key?'调整后点击保存，Esc 取消。':'选择一个扇区，调整自己的节奏。';
 }
 for(const [key,field] of Object.entries(fields)){
  const sector=$(field.sector);sector.addEventListener('click',()=>editor.open(key));sector.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();editor.open(key);}});
  $(field.input).addEventListener('input',event=>editor.setValue(event.target.value));
 }
 slider.addEventListener('input',()=>editor.setValue(slider.value));
 for(const [id,delta] of [['disc-decrease',-1],['disc-increase',1]])$(id).addEventListener('click',()=>{const state=editor.getState();if(!state.key)return;const field=fields[state.key],value=Number(state.value);editor.setValue(String(Math.min(field.max,Math.max(field.min,(Number.isFinite(value)?value:0)+delta))));});
 form.addEventListener('submit',event=>{event.preventDefault();editor.save();});$('disc-cancel').addEventListener('click',()=>editor.cancel());
 const escape=event=>{if(!root.hidden&&event.key==='Escape'&&editor.getState().key&&!editor.getState().saving){event.preventDefault();event.stopPropagation();editor.cancel();}};
 document.addEventListener('keydown',escape);
 const reduce=()=>{if(motion.matches){stopTransition();if(phase==='opening')finishOpen();else if(phase==='closing')finishClose(false);}};motion.addEventListener('change',reduce);
 return {
  sync(snapshot){editor.sync(snapshot);render(snapshot);},
  hide(){immediate=true;editor.cancel();stopTransition();form.hidden=true;setPhase('overview');lastKey=null;immediate=false;},
  destroy(){stopTransition();motion.removeEventListener('change',reduce);document.removeEventListener('keydown',escape);}
 };
}
