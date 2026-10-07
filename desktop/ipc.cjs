const fs=require('node:fs/promises');const {randomUUID}=require('node:crypto');const {parseLegacyImport,invalid}=require('./legacy-import.cjs');
const visible=window=>!window.isDestroyed()&&window.isVisible()&&!window.isMinimized()&&window.isFocused();
function registerIpc({ipcMain,window,db,dialog,notify,onCloseStatus=()=>{},startupError=null}) {
 const channels=[];let preview=null;
 function bind(name,action){const channel=`tc:${name}`;channels.push(channel);ipcMain.handle(channel,async(event,arg)=>{
  try {
   if(window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame) throw Object.assign(new Error('请求来源不允许。'),{code:'UNAUTHORIZED'});
   return {ok:true,value:await action(arg)};
  } catch(error){return {ok:false,error:{code:error.code??'OPERATION_FAILED',message:error.message??'操作失败。'}};}
 });}
 const requireDb=()=>{if(!db) throw Object.assign(new Error(startupError?.message??'学习数据库无法打开。'),{code:'DATABASE_UNAVAILABLE'});return db;};
 for(const name of ['getSettings','saveSettings','saveCompletedPomodoro','getSummary','listDaily']) bind(name,arg=>requireDb()[name](arg));
 bind('previewLegacyImport',async()=>{
  requireDb();preview=null;
  const selected=await dialog.showOpenDialog(window,{title:'导入网页版学习记录',properties:['openFile'],filters:[{name:'TomatoClock JSON',extensions:['json']}]});
  if(selected.canceled||!selected.filePaths?.[0])return null;
  const handle=await fs.open(selected.filePaths[0],'r');let raw;
  try {
   const info=await handle.stat(),limit=1024*1024;
   if(!info.isFile()||info.size>limit)throw invalid('请选择不超过 1 MiB 的 JSON 文件。');
   const buffer=Buffer.alloc(limit+1);let used=0;
   while(used<buffer.length){const {bytesRead}=await handle.read(buffer,used,buffer.length-used,used);if(bytesRead===0)break;used+=bytesRead;}
   if(used>limit)throw invalid('文件超过 1 MiB。');raw=buffer.subarray(0,used).toString('utf8');
  }finally{await handle.close();}
  const parsed=parseLegacyImport(raw);preview={token:randomUUID(),days:parsed.days};
  return {token:preview.token,summary:parsed.summary};
 });
 bind('commitLegacyImport',token=>{
  if(!preview||typeof token!=='string'||token!==preview.token)throw invalid('导入预览已失效，请重新选择文件。');
  const result=requireDb().importLegacyDays(preview.days);preview=null;return result;
 });
 bind('getVisibility',()=>visible(window));
 bind('notifyPhase',arg=>notify(arg));
 bind('closeStatus',arg=>{
  if(!arg||typeof arg.requestId!=='string'||!Number.isSafeInteger(arg.pendingCount)||arg.pendingCount<0) throw new Error('退出状态不正确。');
  onCloseStatus(arg);return true;
 });
 return ()=>channels.forEach(channel=>ipcMain.removeHandler(channel));
}
module.exports={registerIpc,visible};
