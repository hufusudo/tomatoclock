import {formatDuration} from './format.js';

const NS='http://www.w3.org/2000/svg';
// Geometry is independent of the DOM so date spacing, scales and zero values stay testable.
export function buildChartModel(rows,{width=640}={}){
 const seen=new Set();
 const ordered=rows.map(row=>{
  const time=Date.parse(`${row.day}T12:00:00Z`);
  const future=row.future===true,validValues=future?row.studySeconds===null&&row.pomodoros===null:[row.studySeconds,row.pomodoros].every(n=>Number.isSafeInteger(n)&&n>=0);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.day)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==row.day||seen.has(row.day)||!validValues)throw new Error('学习记录格式不正确。');
  seen.add(row.day);return {...row,future,time};
 }).sort((a,b)=>a.time-b.time);
 width=Math.max(280,width);const left=42,right=width-18,top=24,bottom=234,height=276;
 const peak=Math.max(0,...ordered.map(row=>row.studySeconds)),unit=peak>=7200?'小时':'分钟',factor=unit==='小时'?3600:60;
 const raw=Math.max(1,peak/factor)/4,power=10**Math.floor(Math.log10(raw));
 const step=Math.max(unit==='分钟'?1:.25,[1,2,2.5,5,10].find(n=>n*power>=raw)*power),maximum=step*4*factor;
 const first=ordered[0]?.time??0,span=(ordered.at(-1)?.time??first)-first;
 const slots=ordered.map(row=>{const x=span?left+22+(row.time-first)/span*(right-left-44):(left+right)/2,y=row.future?null:bottom-row.studySeconds/maximum*(bottom-top);return {...row,x,y,height:row.future?null:bottom-y};});
 const points=slots.filter(row=>!row.future);
 const minGap=slots.length>1?Math.min(...slots.slice(1).map((p,i)=>p.x-slots[i].x)):(right-left)/3;
 const barWidth=Math.max(1,Math.min(42,minGap*.55));
 const ticks=Array.from({length:5},(_,i)=>({label:String(Number((i*step).toFixed(2))),y:bottom-i/4*(bottom-top)}));
 const labels=[];for(const p of slots){if(slots.length<=7||!labels.length||p.x-labels.at(-1).x>=78)labels.push(p);}
 const last=slots.at(-1);if(last&&labels.at(-1)!==last){if(labels.length>1&&last.x-labels.at(-1).x<65)labels.pop();labels.push(last);}
 const path=points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
 return {width,height,left,right,top,bottom,maximum,unit,barWidth,slots,points,ticks,labels,path};
}

function svgNode(name,attributes={},text){
 const node=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;
}
export function createRecordsChart({root}){
 const $=id=>root.querySelector(`#${id}`),panel=$('records-chart'),svg=$('chart-svg'),message=$('chart-message'),tooltip=$('chart-tooltip'),hint=$('chart-hint');
 const lineButton=$('records-line-view'),barButton=$('records-bar-view');let kind='line',rows=null,weekly=false,selectedDay=null,pendingFocusDay=null;
 function clearDetail(){selectedDay=null;tooltip.hidden=true;tooltip.textContent='';hint.hidden=!rows?.length;for(const point of svg.querySelectorAll('.chart-point'))point.classList.remove('is-selected');}
 function detail(point,group){
  selectedDay=point.day;for(const other of svg.querySelectorAll('.chart-point'))other.classList.toggle('is-selected',other===group);
  tooltip.hidden=false;tooltip.textContent=`${point.day} · ${formatDuration(point.studySeconds*1000)} · ${point.pomodoros} 个番茄`;hint.hidden=true;
 }
 function draw({animate=true}={}){
  if(!rows)return;
  const active=svg.getRootNode().activeElement;
  const focused=svg.contains(active)?active.dataset.day:(!active||active===document.body)?pendingFocusDay:null;pendingFocusDay=null;
  const model=buildChartModel(rows,{width:panel.getBoundingClientRect().width-32});
  svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${model.width} ${model.height}`);svg.setAttribute('aria-label',`${weekly?'本周':'每日'}学习时长${kind==='line'?'折线图':'条状图'}，单位${model.unit}，可用Tab查看每日详情`);
  svg.classList.toggle('chart-animate',animate);panel.dataset.kind=kind;$('chart-unit').textContent=`学习时长 / ${model.unit}`;
  const grid=svgNode('g',{'aria-hidden':'true',class:'chart-grid'});
  for(const tick of model.ticks){grid.append(svgNode('line',{x1:model.left,x2:model.right,y1:tick.y,y2:tick.y}));grid.append(svgNode('text',{x:model.left-10,y:tick.y+4,'text-anchor':'end'},tick.label));}
  for(const p of model.labels)grid.append(svgNode('text',{class:`chart-date-label${p.future?' chart-future':''}`,'data-day':p.day,x:p.x,y:model.bottom+27,'text-anchor':'middle'},weekly?['周日','周一','周二','周三','周四','周五','周六'][new Date(p.time).getUTCDay()]:p.day.slice(5).replace('-','/')));
  svg.append(grid);
  if(kind==='line'&&model.points.length>1){
   svg.append(svgNode('path',{class:'chart-area',d:`${model.path} L${model.points.at(-1).x},${model.bottom} L${model.points[0].x},${model.bottom} Z`,'aria-hidden':'true'}));
   svg.append(svgNode('path',{class:'chart-line',d:model.path,pathLength:1,'aria-hidden':'true'}));
  }
  for(const p of model.points){
   const index=model.slots.indexOf(p);
   const label=`${p.day}，${formatDuration(p.studySeconds*1000)}，${p.pomodoros} 个番茄`;
   const group=svgNode('g',{class:'chart-point',role:'button',tabindex:0,'aria-label':label,'data-day':p.day,'data-seconds':p.studySeconds});
   group.append(svgNode('title',{},label));
   if(kind==='bar')group.append(svgNode('rect',{class:'chart-bar',x:p.x-model.barWidth/2,y:p.y,width:model.barWidth,height:p.height,rx:Math.min(5,model.barWidth/2),style:`transform-origin:${p.x}px ${model.bottom}px`}));
   const hitLeft=index?(model.slots[index-1].x+p.x)/2:model.left,hitRight=index<model.slots.length-1?(p.x+model.slots[index+1].x)/2:model.right;
   group.append(svgNode('rect',{class:'chart-hit',x:hitLeft,y:model.top-8,width:hitRight-hitLeft,height:model.bottom-model.top+16}));
   group.append(svgNode('circle',{class:'chart-dot',cx:p.x,cy:p.y,r:kind==='line'?4:2.5}));
   group.addEventListener('pointerenter',()=>detail(p,group));group.addEventListener('focus',()=>detail(p,group));group.addEventListener('click',()=>detail(p,group));
   group.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();detail(p,group);}
    if(event.key==='Escape'){event.preventDefault();clearDetail();}
    const direction=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
    if(direction){event.preventDefault();const groups=[...svg.querySelectorAll('.chart-point')];groups[(groups.indexOf(group)+direction+groups.length)%groups.length]?.focus();}
   });
   svg.append(group);if(selectedDay===p.day)detail(p,group);if(focused===p.day)group.focus({preventScroll:true});
  }
 }
 function setKind(value){kind=value;lineButton.setAttribute('aria-pressed',String(kind==='line'));barButton.setAttribute('aria-pressed',String(kind==='bar'));draw();}
 lineButton.addEventListener('click',()=>setKind('line'));barButton.addEventListener('click',()=>setKind('bar'));
 // A real width-based viewBox keeps labels legible at small window sizes without horizontal scrolling.
 const resize=new ResizeObserver(()=>{if(rows&&!root.hidden&&svg.getBoundingClientRect().width>0){const width=Number(svg.getAttribute('viewBox')?.split(' ')[2]);if(Math.abs(width-Math.max(280,panel.getBoundingClientRect().width-32))>1)draw({animate:false});}});resize.observe(panel);
 return {
  render(value,{week=false}={}){rows=value;weekly=week;clearDetail();message.hidden=!!rows.length;message.textContent='还没有完成的番茄';svg.toggleAttribute('hidden',!rows.length);$('chart-unit').hidden=!rows.length;panel.setAttribute('aria-busy','false');lineButton.disabled=barButton.disabled=!rows.length;if(rows.length){resize.observe(panel);draw();}else{pendingFocusDay=null;svg.replaceChildren();}},

  message(text,{loading=false}={}){const active=svg.getRootNode().activeElement;if(svg.contains(active))pendingFocusDay=active.dataset.day;if(!loading)pendingFocusDay=null;rows=null;clearDetail();svg.replaceChildren();svg.setAttribute('hidden','');$('chart-unit').hidden=true;message.textContent=text;message.hidden=false;panel.setAttribute('aria-busy',String(loading));lineButton.disabled=barButton.disabled=true;},
  hide(){resize.disconnect();pendingFocusDay=null;clearDetail();svg.classList.remove('chart-animate');}
 };
}
