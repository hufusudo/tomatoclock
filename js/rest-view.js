const DEFAULT_IMAGE='./assets/break-default.svg';
const halfDuration=400;
const clamp=value=>Math.max(0,Math.min(1,value));
export function accordionShape(progress,width,height){
 const p=clamp(progress),w=Math.max(1,width),h=Math.max(1,height),sheetWidth=w*(.64+.36*p),sheetHeight=h*(.18+.82*p);
 return {left:(w-sheetWidth)/2,width:sheetWidth,top:(h-sheetHeight)/2,height:sheetHeight,dent:sheetHeight*.14*(1-p),centerWidth:sheetWidth*(.04+.96*p)};
}
function drawAccordion(ctx,w,h,p,image,rest){
 const s=accordionShape(p,w,h),middle=w/2,left=middle-s.centerWidth/2,right=middle+s.centerWidth/2;
 const curve=x=>s.top+s.dent*Math.sin(Math.PI*(x-s.left)/s.width),bottom=x=>h-curve(x);
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#050505';ctx.fillRect(0,0,w,h);
 ctx.save();ctx.beginPath();ctx.moveTo(left,curve(left));ctx.quadraticCurveTo(middle,s.top+s.dent*1.22,right,curve(right));ctx.lineTo(right,bottom(right));ctx.quadraticCurveTo(middle,h-s.top-s.dent*1.22,left,bottom(left));ctx.closePath();ctx.clip();
 ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
 const alpha=clamp((p-.08)/.65);
 if(rest&&image.complete&&image.naturalWidth){
  const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight)*(s.height/h),iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;
  ctx.globalAlpha=alpha;ctx.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);
 }else if(!rest){ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=alpha;ctx.fillRect(0,0,w,h);}
 ctx.restore();
 // Symmetric vertical paper folds retain the concave silhouette of the video reference.
 for(const [start,end] of [[s.left,left],[right,s.left+s.width]]){
  const step=(end-start)/7;if(step<.1)continue;
  for(let i=0;i<7;i++){const gap=step*.3*(1-p),a=start+i*step+gap/2,b=start+(i+1)*step-gap/2,shade=ctx.createLinearGradient(a,0,b,0);
   shade.addColorStop(0,i%2?'#d7d7d7':'#fff');shade.addColorStop(.5,'#fff');shade.addColorStop(1,i%2?'#fff':'#d7d7d7');
   ctx.fillStyle=shade;ctx.beginPath();ctx.moveTo(a,curve(a));ctx.lineTo(b,curve(b));ctx.lineTo(b,bottom(b));ctx.lineTo(a,bottom(a));ctx.closePath();ctx.fill();
  }
 }
}
export function createRestView({shell,stage,canvas,isVisible,watchVisibility,onReturnToWork=()=>{}}){
 const image=stage.querySelector('img'),ctx=canvas.getContext('2d'),media=window.matchMedia('(prefers-reduced-motion: reduce)');
 let requested=false,visibleRest=false,suppressed=false,pending=null,busy=false,generation=0,frame=null,settle=null,imageRevision=0,drawingImage=image,previousFocus=null,currentSource=DEFAULT_IMAGE;
 let w=1,h=1;
 function resize(){w=window.innerWidth;h=window.innerHeight;const scale=Math.min(window.devicePixelRatio||1,2,4096/Math.max(w,h));canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);ctx?.setTransform(scale,0,0,scale,0,0);}
 function screen(rest){visibleRest=rest;stage.hidden=!rest;shell.inert=rest||busy;if(rest)shell.setAttribute('aria-hidden','true');else shell.removeAttribute('aria-hidden');}
 function focus(){if(!isVisible())return;if(visibleRest){stage.focus({preventScroll:true});return;}if(previousFocus?.isConnected&&!previousFocus.disabled&&previousFocus.getClientRects().length)previousFocus.focus({preventScroll:true});if(document.activeElement!==previousFocus||!previousFocus?.getClientRects().length)document.getElementById('timer-toggle').focus({preventScroll:true});}
 function cancel(){generation++;if(frame!==null)cancelAnimationFrame(frame);frame=null;const done=settle;settle=null;done?.(false);busy=false;canvas.hidden=true;canvas.dataset.phase='idle';shell.inert=visibleRest;}
 function animate(from,to,rest,token){return new Promise(resolve=>{settle=resolve;let start;
  function draw(time){if(token!==generation){resolve(false);return;}start??=time;const t=clamp((time-start)/halfDuration),ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;drawAccordion(ctx,w,h,from+(to-from)*ease,drawingImage,rest);if(t<1)frame=requestAnimationFrame(draw);else{frame=null;settle=null;resolve(true);}}
  frame=requestAnimationFrame(draw);
 });}
 async function change(rest,{unfold=false}={}){
  cancel();const token=generation,source=visibleRest;if(!rest)onReturnToWork();
  if(media.matches||!ctx||(!unfold&&source===rest)){screen(rest);focus();return;}
  if(!source)previousFocus=document.activeElement;busy=true;shell.inert=true;canvas.hidden=false;resize();
  try{
   if(!unfold){canvas.dataset.phase='closing';if(!(await animate(1,0,source,token)))return;}
   if(token!==generation)return;screen(rest);shell.inert=true;canvas.dataset.phase='opening';if(!(await animate(0,1,rest,token)))return;
  }finally{if(token===generation){busy=false;canvas.hidden=true;canvas.dataset.phase='idle';screen(rest);focus();}}
 }
 function sync(rest){rest=Boolean(rest);if(rest===requested)return;requested=rest;suppressed=false;
  if(!isVisible()){cancel();if(!rest)onReturnToWork();screen(rest);pending=rest;}else{pending=null;change(rest);}
 }
 function dismiss(){pending=null;suppressed=requested;cancel();screen(false);focus();}
 function showRest(){if(!requested)return;if(visibleRest&&!suppressed)return;suppressed=false;pending=null;if(isVisible())change(true);else{screen(true);pending=true;}}
 async function setImage(source){
  const src=source??DEFAULT_IMAGE;if(src!==DEFAULT_IMAGE&&!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(src))throw new Error('休息图片格式无效。');
  const revision=++imageRevision,candidate=new Image();candidate.src=src;await candidate.decode();if(revision!==imageRevision)return;drawingImage=candidate;currentSource=src;image.src=src;
 }
 function visibility(){if(!isVisible()){if(busy){cancel();screen(requested&&!suppressed);pending=requested&&!suppressed;}}else if(pending!==null){const target=pending;pending=null;change(target,{unfold:true});}}
 function key(event){if(stage.hidden&&canvas.hidden)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();dismiss();}else if(event.key==='Tab'){event.preventDefault();stage.focus();}}
 function reduce(){if(media.matches&&busy){cancel();screen(requested&&!suppressed);focus();}}
 const stopVisibility=watchVisibility(visibility);document.addEventListener('keydown',key);window.addEventListener('resize',resize);media.addEventListener('change',reduce);stage.addEventListener('click',dismiss);
 return {sync,dismiss,showRest,setImage,getImageSource:()=>currentSource,destroy(){cancel();imageRevision++;stopVisibility?.();document.removeEventListener('keydown',key);window.removeEventListener('resize',resize);media.removeEventListener('change',reduce);stage.removeEventListener('click',dismiss);screen(false);}};
}
export function setupRestImageControls({desktopApi,view,section=document.getElementById('rest-image-controls')}){
 const preview=section.querySelector('img'),status=section.querySelector('[role=status]'),choose=section.querySelector('#choose-rest-image-btn'),reset=section.querySelector('#reset-rest-image-btn');
 if(!desktopApi){choose.disabled=true;reset.disabled=true;status.textContent='桌面版可选择并保存自己的休息图片。';return;}
 let revision=0;
 async function apply(value,request){if(request!==revision)return;await view.setImage(value.dataUrl);if(request!==revision)return;preview.src=view.getImageSource();status.textContent=value.custom?`当前图片：${value.name}。已保存在本机，更新会保留。`:'当前使用默认休息图片。';}
 async function finish(value){
  if(!value.needsDecode)return value;
  if(!/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(value.dataUrl))throw new Error('WebP图片数据无效。');
  const image=new Image();image.src=value.dataUrl;await image.decode();const w=image.naturalWidth,h=image.naturalHeight;if(!w||!h||w*h>32*1024*1024)throw new Error('图片尺寸超过限制。');
  const scale=Math.min(1,2048/w,2048/h),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const result=await desktopApi.finishRestImage({token:value.token,dataUrl:canvas.toDataURL('image/png')});if(!result.ok)throw new Error(result.error.message);return result.value;
 }
 async function load(){const request=++revision;try{const result=await desktopApi.getRestImage();if(!result.ok)throw new Error(result.error.message);await apply(result.value,request);}catch(error){if(request===revision)status.textContent=`休息图片读取失败：${error.message}，暂用默认图片。`;}}
 for(const [button,method] of [[choose,'chooseRestImage'],[reset,'resetRestImage']])button.addEventListener('click',async()=>{const request=++revision;choose.disabled=true;reset.disabled=true;try{const result=await desktopApi[method]();if(!result.ok)throw new Error(result.error.message);if(result.value.canceled){status.textContent='已取消选择，原图片保留。';return;}await apply(await finish(result.value),request);}catch(error){if(request===revision)status.textContent=`图片未更换：${error.message}`;}finally{if(request===revision){choose.disabled=false;reset.disabled=false;}}});
 section.querySelector('#return-rest-image-btn').addEventListener('click',()=>view.showRest());return load();
}
