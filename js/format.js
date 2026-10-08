export {dayKey} from './storage.js';
export function formatClock(ms){const seconds=Number.isFinite(ms)?Math.max(0,Math.ceil(ms/1000)):0;return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
export function formatDuration(ms){const seconds=Number.isFinite(ms)?Math.max(0,Math.floor(ms/1000)):0;const minutes=Math.floor(seconds/60);return seconds<3600?(seconds%60===0?`${minutes} 分`:`${minutes} 分 ${seconds%60} 秒`):`${Math.floor(seconds/3600)} 小时 ${minutes%60} 分`;}
export function notificationFor(phase,breakEvent){return phase==='work-done'?{phase,kind:breakEvent.kind,durationMs:breakEvent.durationMs,title:'番茄完成 🍅',body:`该休息了：${breakEvent.kind==='long'?'长休':'短休'} ${formatDuration(breakEvent.durationMs)}。`}:{phase,title:'休息结束',body:'该开工了：点“开始”。'};}
