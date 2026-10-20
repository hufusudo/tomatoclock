// custom.css is a variable configuration format, never an executable stylesheet.
const colours=['background','text','muted','accent','border','surface','soft','danger','timer-text','timer-hover','ring-track','ring-work','ring-break','warning-background','warning-border',...['records','settings'].flatMap(page=>['background','text','muted','accent','border','surface'].map(key=>`${page}-${key}`)),'records-hover','records-selection-background','records-selection-text'];
export const THEME_VARIABLES=Object.freeze(Object.fromEntries([...colours.map(name=>[`--theme-${name}`,'colour']),...['font','timer-font','records-font','settings-font'].map(name=>[`--theme-${name}`,'font']),...['ring-track-width','ring-progress-width'].map(name=>[`--theme-${name}`,'ringWidth'])]));
const wideKeywords=new Set(['inherit','initial','unset','revert','revert-layer']);
function validValue(name,value){
 if(THEME_VARIABLES[name]==='colour')return /^(?:#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8}|transparent)$/i.test(value);
 if(THEME_VARIABLES[name]==='font')return value.length<=240&&value.split(',').every(part=>!wideKeywords.has(part.trim().toLowerCase())&&/^(?:"[\p{L}\p{N} _-]+"|'[\p{L}\p{N} _-]+'|[\p{L}_-][\p{L}\p{N} _-]*)$/u.test(part.trim()));
 if(THEME_VARIABLES[name]==='ringWidth')return /^\d+(?:\.\d+)?$/.test(value)&&Number(value)>=.5&&Number(value)<=12;
 return false;
}
export function parseTheme(css){
 if(typeof css!=='string'||new TextEncoder().encode(css).length>32768)throw new Error('主题文件过大（最多32 KiB）。');
 // Strip complete comments only. Braces, escapes and selectors never reach the browser.
 const clean=css.replace(/\/\*[\s\S]*?\*\//g,'').trim();if(clean.includes('/*')||clean.includes('*/'))throw new Error('主题注释未完整闭合。');
 const values=Object.create(null),warnings=[];let rest=clean;
 while(rest){const block=/^:root\s*\{([^{}]*)\}/.exec(rest);if(!block)throw new Error('主题格式只允许 :root 中的主题变量，不允许选择器、@规则或动画。');
  for(const raw of block[1].split(';')){if(!raw.trim())continue;const declaration=/^\s*(--[a-zA-Z0-9-]+)\s*:\s*(.*?)\s*$/.exec(raw);if(!declaration)throw new Error('主题中只允许变量声明。');
   const [,name,value]=declaration;if(!Object.hasOwn(THEME_VARIABLES,name)){warnings.push(name);continue;}
   if(!validValue(name,value))throw new Error(`主题变量 ${name} 的值无效：颜色使用十六进制或transparent，字体使用本机字体名称列表，圆环线宽使用0.5–12的数值。`);values[name]=value;
  }
  rest=rest.slice(block[0].length).trim();
 }
 return {values,warnings:[...new Set(warnings)]};
}
export function applyTheme(root,values){
 for(const [name,value] of Object.entries(values))if(typeof value!=='string'||!validValue(name,value))throw new Error(`未开放的主题变量或无效值：${name}`);
 for(const name of Object.keys(THEME_VARIABLES))root.style.removeProperty(name);
 for(const [name,value] of Object.entries(values))root.style.setProperty(name,value);
}
export function setupThemeControls({desktopApi,root=document.documentElement,section=document.getElementById('theme-controls')}){
 if(!desktopApi){section.hidden=true;return;}
 const status=section.querySelector('#theme-status'),reload=section.querySelector('#theme-reload-btn'),open=section.querySelector('#theme-open-btn');let revision=0;
 async function load(){const request=++revision;reload.disabled=true;try{
  const result=await desktopApi.getTheme();if(request!==revision)return;if(!result.ok)throw new Error(result.error?.message??'无法读取主题文件。');
  const {values,warnings}=parseTheme(result.value.css);applyTheme(root,values);status.textContent=(result.value.exists?'主题已加载。':'使用默认主题，点击“打开 custom.css”创建主题文件。')+(warnings.length?` 忽略未开放变量：${warnings.join('、')}。`:'');
 }catch(error){if(request===revision)status.textContent=`主题未应用：${error.message} 保留当前主题。`;}finally{if(request===revision)reload.disabled=false;}}
 reload.addEventListener('click',load);open.addEventListener('click',async()=>{open.disabled=true;try{const result=await desktopApi.openTheme();if(!result.ok)throw new Error(result.error?.message??'无法打开主题文件。');status.textContent=`主题文件：${result.value.filePath}。保存后点击“重新加载主题”。`;}catch(error){status.textContent=error.message;}finally{open.disabled=false;}});
 return load();
}
