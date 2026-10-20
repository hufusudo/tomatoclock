const {contextBridge,ipcRenderer}=require('electron');
const call=name=>(arg)=>ipcRenderer.invoke(`tc:${name}`,arg);
function subscribe(channel,callback){const handler=(_event,value)=>callback(value);ipcRenderer.on(channel,handler);return ()=>ipcRenderer.removeListener(channel,handler);}
let prepareClose=null;
ipcRenderer.on('tc:prepareClose',async(_event,requestId)=>{
 let pendingCount=0;
 try {if(prepareClose)pendingCount=(await prepareClose()).pendingCount;}catch{pendingCount=1;}
 ipcRenderer.invoke('tc:closeStatus',{requestId,pendingCount}).catch(()=>{});
});
const api={};
for(const name of ['getSettings','saveSettings','saveCompletedPomodoro','getSummary','listDaily','getDailyRange','getFocusShortcuts','saveFocusShortcuts','notifyPhase','getVisibility','getTheme','openTheme','getRestImage','chooseRestImage','resetRestImage','finishRestImage','previewLegacyImport','commitLegacyImport'])api[name]=call(name);
api.onVisibilityChange=callback=>subscribe('tc:visibility',callback);
api.onPrepareClose=callback=>{prepareClose=callback;return ()=>{if(prepareClose===callback)prepareClose=null;};};
contextBridge.exposeInMainWorld('tomatoDesktop',api);
