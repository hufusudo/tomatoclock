// Manual entrances/exits own their snapshots; timer deadlines never wait for motion.
export function createFocusView({isVisible,watchVisibility,onFocus=()=>{}}){
 const root=document.documentElement,media=matchMedia('(prefers-reduced-motion: reduce)');
 const chrome=[...document.querySelectorAll('.app-nav,.focus-shortcuts-area,#round-dots,#clock-preview,footer,#reset-btn,#notify-hint')];
 let focused=false,lastState='ready',intent=null,latest=null,capturing=false,transition=null,hand=null,wave=null,generation=0;
 root.dataset.focus='idle';root.dataset.focusMotion='idle';
 function commit(){
  const next=['working','paused'].includes(latest.state),entering=next&&!focused;
  focused=next;lastState=latest.state;root.dataset.focus=next?'active':'idle';
  for(const element of chrome)element.inert=next;
  latest.apply();
  if(entering)onFocus();
  if(next&&chrome.some(element=>element.contains(document.activeElement)))document.getElementById('start-btn').focus({preventScroll:true});
 }
 function clear(){hand?.remove();hand=null;wave?.remove();wave=null;root.dataset.focusMotion='idle';root.style.removeProperty('--focus-x');root.style.removeProperty('--focus-y');root.style.removeProperty('--focus-limit');}
 function cancel(commitLatest=true){generation++;transition?.skipTransition();transition=null;capturing=false;clear();if(commitLatest&&latest)commit();}
 function render(state,apply){
  latest={state,apply};if(capturing)return;
  const next=['working','paused'].includes(state);
  const motion=next&&!focused&&intent==='start'?'starting':state==='ready'&&lastState!=='ready'&&intent==='end'?'ending':null;
  if(next===focused&&!motion){commit();return;}
  intent=null;
  if(transition)cancel(false);
  if(!motion||media.matches||!isVisible()||!document.startViewTransition){commit();return;}
  const token=++generation,box=document.querySelector('.timer-dial').getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
  root.style.setProperty('--focus-x',`${x}px`);root.style.setProperty('--focus-y',`${y}px`);root.dataset.focusMotion=motion;capturing=true;
  if(motion==='starting')root.style.setProperty('--focus-limit',`${Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y))+32}px`);
  const current=document.startViewTransition(()=>{
   if(token!==generation)return;
   capturing=false;commit();
   if(latest.state!==state||!isVisible()||media.matches){current.skipTransition();return;}
   if(motion==='starting'){
    wave=document.createElement('div');wave.className='focus-wave';wave.setAttribute('aria-hidden','true');document.body.append(wave);
   }
   if(motion==='ending'){
    hand=document.createElement('div');hand.className='focus-sweep-hand';hand.setAttribute('aria-hidden','true');
    hand.style.cssText=`left:${x}px;top:${y}px;width:${Math.hypot(innerWidth,innerHeight)}px`;
    document.body.append(hand);
   }
  });
  transition=current;
  // skipTransition rejects ready when capture is interrupted; the latest DOM is already committed.
  current.ready.catch(()=>{});
  current.finished.catch(()=>{}).finally(()=>{if(token!==generation)return;transition=null;capturing=false;clear();});
 }
 function run(kind,action){intent=kind;try{const result=action();Promise.resolve(result).finally(()=>{if(intent===kind)intent=null;}).catch(()=>{});return result;}catch(error){intent=null;throw error;}}
 const visibility=()=>{if(!isVisible())cancel();},reduce=()=>{if(media.matches)cancel();};
 const resize=()=>cancel(),stopVisibility=watchVisibility(visibility);window.addEventListener('resize',resize);media.addEventListener('change',reduce);
 return {render,run,destroy(){cancel();stopVisibility?.();window.removeEventListener('resize',resize);media.removeEventListener('change',reduce);}};
}
