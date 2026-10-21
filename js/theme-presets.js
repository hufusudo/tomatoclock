// Built-in appearance is trusted, shipped code. User custom.css stays variable-only.
const serif='"Noto Serif", "Noto Serif CJK SC", serif';
const mono='"Noto Sans Mono", "Noto Sans CJK SC", monospace';
function values({background,text,muted,accent,border,surface,soft,danger,rest,font,timerFont=font}){
 return Object.fromEntries(Object.entries({background,text,muted,accent,border,surface,soft,danger,font,'timer-font':timerFont,'timer-text':text,'timer-hover':accent,'ring-track':border,'ring-work':accent,'ring-break':rest,'warning-background':surface,'warning-border':danger,'records-hover':soft,'records-selection-background':text,'records-selection-text':background}).map(([key,value])=>[`--theme-${key}`,value]));
}
export const BUILT_IN_THEMES=Object.freeze([
 {id:'default',name:'原版暖白',description:'暖白留白，细圆环',values:{}},
 {id:'paper',name:'纸本书桌',description:'横纹纸面 · 衬线数字 · 墨线圆环',values:values({background:'#f6f1e5',text:'#37382e',muted:'#6b6d5f',accent:'#62694c',border:'#c7c3af',surface:'#fffcf3',soft:'#e9e4d5',danger:'#9c3d3b',rest:'#8d6b48',font:serif})},
 {id:'instrument',name:'复古仪表',description:'立体表圈 · 分钟刻度 · 琥珀指示',values:values({background:'#e5e2d7',text:'#363c35',muted:'#5d655b',accent:'#996021',border:'#b8bcae',surface:'#f5f2e7',soft:'#d5d9cb',danger:'#a23c32',rest:'#52705d',font:'"Noto Sans", sans-serif',timerFont:'"Noto Serif", serif'})},
 {id:'terminal',name:'极简终端',description:'等宽数字 · 方形框线 · 网格底纹',values:values({background:'#1c2428',text:'#dbe9e5',muted:'#9eb5b0',accent:'#8dd5c8',border:'#44595d',surface:'#222e33',soft:'#304449',danger:'#ffa38e',rest:'#dfca86',font:mono})}
].map(preset=>Object.freeze({...preset,values:Object.freeze(preset.values)})));
